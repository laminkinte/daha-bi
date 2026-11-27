<?php

namespace App\Services;

use App\Models\Dataset;
use App\Models\RowLevelPolicy;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ChartDataService
{
    protected const ALLOWED_OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'contains', 'in'];

    /** Most values an 'in' filter (a multi-select slicer) may carry. */
    protected const MAX_IN_VALUES = 200;

    protected const ALLOWED_AGGREGATIONS = ['sum', 'avg', 'count', 'count_distinct', 'min', 'max'];

    /**
     * Every consumer (chart view, dashboard export, AI, report emails, alerts, public dashboards)
     * goes through here, so caching at this single choke point speeds up all of them at once.
     */
    protected const CACHE_TTL_SECONDS = 21600;

    /**
     * Compute chart data for a dataset given a chart config and optional filters.
     *
     * $user drives row-level security (see baseQuery()) — pass null for contexts with no
     * authenticated viewer (e.g. a public share link), which deliberately sees unfiltered data:
     * sharing a dashboard is itself the owner's explicit choice to expose that chart's data, so
     * restricting anonymous visitors while org members stay restricted would be backwards.
     *
     * @param  array{x_field?: string, y_field?: string, agg?: string, series_field?: string}  $config
     * @param  array<int, array{field: string, operator: string, value: mixed}>  $filters
     */
    public function run(Dataset $dataset, string $chartType, array $config, array $filters = [], ?User $user = null): array
    {
        $key = $this->cacheKey($dataset, $chartType, $config, $filters, $user);

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($dataset, $chartType, $config, $filters, $user) {
            $columnNames = collect($dataset->columns ?? [])->pluck('name')->all();

            if ($chartType === 'table') {
                return $this->tableData($dataset, $columnNames, $filters, $user);
            }

            if ($chartType === 'kpi') {
                return $this->kpiData($dataset, $columnNames, $config, $filters, $user);
            }

            if ($chartType === 'scatter') {
                return $this->scatterData($dataset, $columnNames, $config, $filters, $user);
            }

            if ($chartType === 'heatmap') {
                return $this->heatmapData($dataset, $columnNames, $config, $filters, $user);
            }

            return $this->groupedData($dataset, $columnNames, $config, $filters, $user);
        });
    }

    /**
     * Keyed on dataset's own updated_at (bumped on every ingest/resync — see
     * DataIngestionService) rather than an explicit invalidation call, so stale entries just age
     * out of relevance on their own the moment the underlying data changes; the TTL above only
     * bounds how long an unchanged dataset's entries linger in the cache table. Also keyed on the
     * viewer's org role — two roles under different row-level policies must never share a cached
     * result, or one role's restricted view would leak into another's.
     */
    protected function cacheKey(Dataset $dataset, string $chartType, array $config, array $filters, ?User $user): string
    {
        $version = $dataset->updated_at?->timestamp ?? 0;
        $role = $user?->roleInOrganization($dataset->dataSource->organization_id) ?? 'public';
        // low_bandwidth_mode changes the row/point caps applied below, so it must be part of the
        // key too — otherwise a full-size result cached for one viewer could be served, unpruned,
        // to a low-bandwidth viewer of the same chart (or vice versa).
        $bandwidth = ($user?->low_bandwidth_mode ?? false) ? 'lo' : 'hi';
        // A partner company's viewers see only their share's rows — key on that scope too.
        $partner = $this->partnerScope($dataset, $user);
        if ($partner !== null) {
            $role = 'partner-'.md5(json_encode($partner));
        }

        return sprintf(
            'chart_data:%d:%d:%s:%s:%s:%s:%s',
            $dataset->id,
            $version,
            $chartType,
            md5(json_encode($config)),
            md5(json_encode($filters)),
            $role,
            $bandwidth
        );
    }

    /**
     * Scales a row/point cap down for viewers who've opted into low-bandwidth mode (see
     * settings), so their chart payloads — and the export renders built from them — stay small
     * on a slow or metered connection. Floored rather than zeroed so a chart never renders empty.
     */
    protected function rowLimit(int $default, ?User $user): int
    {
        return ($user?->low_bandwidth_mode ?? false) ? max(2, (int) round($default / 4)) : $default;
    }

    /**
     * Scatter plots raw (x, y) row pairs — unlike bar/line/pie there's no aggregation, so this
     * pulls individual rows directly rather than grouping through seriesFor().
     */
    protected function scatterData(Dataset $dataset, array $columnNames, array $config, array $filters, ?User $user): array
    {
        $xField = $this->validateField($columnNames, $config['x_field'] ?? null);
        $yField = $this->validateField($columnNames, $config['y_field'] ?? null);
        $labelField = ! empty($config['label_field']) ? $this->validateField($columnNames, $config['label_field']) : null;

        $query = $this->baseQuery($dataset, $user);
        $this->applyFilters($query, $columnNames, $filters);

        $xExpr = "CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$xField}\"')) AS DECIMAL(20,4))";
        $yExpr = "CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$yField}\"')) AS DECIMAL(20,4))";
        $select = ["{$xExpr} as x", "{$yExpr} as y"];

        if ($labelField) {
            $select[] = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$labelField}\"')) as label";
        }

        $rows = $query->selectRaw(implode(', ', $select))->limit($this->rowLimit(500, $user))->get();

        return [
            'points' => $rows->map(fn ($row) => array_filter([
                'x' => is_numeric($row->x) ? (float) $row->x : 0,
                'y' => is_numeric($row->y) ? (float) $row->y : 0,
                'label' => $labelField ? ($row->label ?? null) : null,
            ], fn ($v) => $v !== null))->values()->all(),
        ];
    }

    /**
     * Heatmap: two categorical axes (x_field, y_field) with an aggregated value per (x, y) cell —
     * e.g. "revenue by region x month". Capped at 50x50 axis labels, same reasoning as
     * multiSeriesData()'s cap, to keep the grid readable and the response bounded.
     */
    protected function heatmapData(Dataset $dataset, array $columnNames, array $config, array $filters, ?User $user): array
    {
        $xField = $this->validateField($columnNames, $config['x_field'] ?? null);
        $yField = $this->validateField($columnNames, $config['y_field'] ?? null);
        $valueField = $config['value_field'] ?? null;
        $agg = $this->validateAgg($config['agg'] ?? 'count');

        if ($agg !== 'count') {
            $valueField = $this->validateField($columnNames, $valueField);
        }

        $query = $this->baseQuery($dataset, $user);
        $this->applyFilters($query, $columnNames, $filters);

        $xExpr = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$xField}\"'))";
        $yExpr = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$yField}\"'))";
        $valueExpr = $this->aggExpression($agg, $valueField);

        $rows = $query
            ->selectRaw("{$xExpr} as x, {$yExpr} as y, {$valueExpr} as value")
            ->groupBy('x', 'y')
            ->limit($this->rowLimit(2500, $user))
            ->get();

        $axisLimit = $this->rowLimit(50, $user);
        $xLabels = $this->sortLabels($rows->pluck('x')->unique()->sort()->values()->take($axisLimit)->all());
        $yLabels = $this->sortLabels($rows->pluck('y')->unique()->sort()->values()->take($axisLimit)->all());

        $cells = $rows
            ->filter(fn ($row) => in_array($row->x, $xLabels, true) && in_array($row->y, $yLabels, true))
            ->map(fn ($row) => [
                'x' => (string) $row->x,
                'y' => (string) $row->y,
                'value' => is_numeric($row->value) ? (float) $row->value : 0,
            ])
            ->values()
            ->all();

        return ['x_labels' => $xLabels, 'y_labels' => $yLabels, 'cells' => $cells];
    }

    protected function tableData(Dataset $dataset, array $columnNames, array $filters, ?User $user): array
    {
        $query = $this->baseQuery($dataset, $user);
        $this->applyFilters($query, $columnNames, $filters);

        $rows = $query->limit($this->rowLimit(500, $user))->pluck('data')->map(fn ($json) => json_decode($json, true));

        return ['columns' => $columnNames, 'rows' => $rows->values()->all()];
    }

    protected function kpiData(Dataset $dataset, array $columnNames, array $config, array $filters, ?User $user): array
    {
        $yField = $config['y_field'] ?? null;
        $agg = $this->validateAgg($config['agg'] ?? 'count');

        if ($agg !== 'count') {
            $yField = $this->validateField($columnNames, $yField);
        }

        $query = $this->baseQuery($dataset, $user);
        $this->applyFilters($query, $columnNames, $filters);

        $value = $query->selectRaw($this->aggExpression($agg, $yField).' as value')->value('value');

        $result = ['value' => is_numeric($value) ? (float) $value : $value];

        // The "sparkline" KPI variant needs a trend line — an optional second dimension
        // (typically a date column) to group the same aggregate by, alongside the headline value.
        if (! empty($config['x_field'])) {
            $trendField = $this->validateField($columnNames, $config['x_field']);
            $trendQuery = $this->baseQuery($dataset, $user);
            $this->applyFilters($trendQuery, $columnNames, $filters);

            $result['trend'] = $this->seriesFor($trendQuery, $trendField, $agg, $yField, $this->rowLimit(30, $user), $config['x_grain'] ?? null, true);
        }

        return $result;
    }

    protected function groupedData(Dataset $dataset, array $columnNames, array $config, array $filters, ?User $user): array
    {
        $xField = $this->validateField($columnNames, $config['x_field'] ?? null);
        $yField = $config['y_field'] ?? null;
        $agg = $this->validateAgg($config['agg'] ?? 'count');
        $seriesField = $config['series_field'] ?? null;

        if ($agg !== 'count') {
            $yField = $this->validateField($columnNames, $yField);
        }

        $query = $this->baseQuery($dataset, $user);
        $this->applyFilters($query, $columnNames, $filters);

        if ($seriesField) {
            return $this->multiSeriesData($query, $columnNames, $xField, $this->validateField($columnNames, $seriesField), $agg, $yField, $user);
        }

        $result = $this->seriesFor($query, $xField, $agg, $yField, $this->rowLimit(200, $user), $config['x_grain'] ?? null);

        // Predictive forecasting: project the next N periods via simple linear regression over
        // the existing series. Capped at 24 and only offered for a single series — a
        // grouped/stacked multi-series projection is a materially different (and much less
        // reliable) problem this doesn't attempt.
        $forecastPeriods = min(24, max(0, (int) ($config['forecast_periods'] ?? 0)));
        if ($forecastPeriods > 0 && count($result['values']) >= 2) {
            $result['forecast'] = [
                'labels' => array_map(fn ($i) => 'Forecast +'.($i + 1), range(0, $forecastPeriods - 1)),
                'values' => $this->forecastValues($result['values'], $forecastPeriods),
            ];
        }

        return $result;
    }

    /**
     * Least-squares linear regression over an evenly-spaced series (x = index), projected
     * forward $periods steps. Deliberately simple (no seasonality) — appropriate for a v1
     * "what's the trend heading toward" projection, not a claim of forecasting precision.
     */
    protected function forecastValues(array $values, int $periods): array
    {
        $n = count($values);
        $xMean = ($n - 1) / 2;
        $yMean = array_sum($values) / $n;
        $num = 0;
        $den = 0;

        foreach ($values as $x => $y) {
            $num += ($x - $xMean) * ($y - $yMean);
            $den += ($x - $xMean) ** 2;
        }

        $slope = $den == 0 ? 0 : $num / $den;
        $intercept = $yMean - $slope * $xMean;

        return array_map(fn ($i) => $slope * ($n + $i) + $intercept, range(0, $periods - 1));
    }

    /**
     * Shared single-series (label, value) grouping used by both the grouped chart types and
     * the KPI sparkline trend.
     */
    /** Date buckets a chart can group an ISO date/datetime field into (config x_grain). */
    protected const GRAINS = ['day', 'month', 'quarter', 'year'];

    /**
     * Groups by $xField, optionally bucketed by a date grain. $latest takes the newest $limit
     * groups instead of the oldest (still returned oldest→newest) — what a KPI trend needs, since
     * its "vs previous period" compares the last two points.
     */
    protected function seriesFor(Builder $query, string $xField, string $agg, ?string $yField, int $limit, ?string $grain = null, bool $latest = false): array
    {
        $labelExpr = $this->grainExpression("JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$xField}\"'))", $grain);
        $valueExpr = $this->aggExpression($agg, $yField);

        $rows = $query
            ->selectRaw("{$labelExpr} as label, {$valueExpr} as value")
            ->groupBy('label')
            ->orderBy('label', $latest ? 'desc' : 'asc')
            ->limit($limit)
            ->get();

        if ($latest) {
            $rows = $rows->reverse()->values();
        }

        $labels = $rows->pluck('label')->all();
        $values = $rows->pluck('value')->map(fn ($v) => is_numeric($v) ? (float) $v : 0)->all();

        if ($order = $this->calendarOrder($labels)) {
            $labels = array_values(array_map(fn ($i) => $labels[$i], $order));
            $values = array_values(array_map(fn ($i) => $values[$i], $order));
        }

        return ['labels' => $labels, 'values' => $values];
    }

    /** Buckets an ISO date string ("2025-03-14…") by grain; unknown grains leave it as is. */
    protected function grainExpression(string $expr, ?string $grain): string
    {
        return match (in_array($grain, self::GRAINS, true) ? $grain : null) {
            'day' => "LEFT({$expr}, 10)",
            'month' => "LEFT({$expr}, 7)",
            'quarter' => "CONCAT(LEFT({$expr}, 4), '-Q', CEIL(SUBSTRING({$expr}, 6, 2) / 3))",
            'year' => "LEFT({$expr}, 4)",
            default => $expr,
        };
    }

    protected const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    protected const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    /**
     * SQL sorts labels alphabetically, which puts month names in the wrong order (Apr, Feb, Jan…)
     * and silently breaks trend lines and period-over-period insights. When *every* label is a
     * month name (or every label a weekday), returns the indexes in calendar order; otherwise null
     * so ordinary categories and ISO dates (which already sort correctly) are left untouched.
     *
     * @param  array<int, mixed>  $labels
     * @return array<int, int>|null
     */
    public function calendarOrder(array $labels): ?array
    {
        if (count($labels) < 2) {
            return null;
        }

        foreach ([self::MONTHS, self::WEEKDAYS] as $sequence) {
            $positions = [];
            foreach ($labels as $i => $label) {
                $key = substr(strtolower(trim((string) $label)), 0, 3);
                $position = array_search($key, $sequence, true);
                if ($position === false || ! $this->isNameOf((string) $label, $sequence[$position])) {
                    continue 2;
                }
                $positions[$i] = $position;
            }
            asort($positions);

            return array_keys($positions);
        }

        return null;
    }

    /** "Mar", "March", "mar." count as March; "Marketing" does not. */
    protected function isNameOf(string $label, string $abbr): bool
    {
        $label = rtrim(strtolower(trim($label)), '.');
        $full = [
            'jan' => 'january', 'feb' => 'february', 'mar' => 'march', 'apr' => 'april', 'may' => 'may',
            'jun' => 'june', 'jul' => 'july', 'aug' => 'august', 'sep' => 'september', 'oct' => 'october',
            'nov' => 'november', 'dec' => 'december', 'mon' => 'monday', 'tue' => 'tuesday',
            'wed' => 'wednesday', 'thu' => 'thursday', 'fri' => 'friday', 'sat' => 'saturday', 'sun' => 'sunday',
        ][$abbr];

        return $label === $abbr || $label === $full || ($abbr === 'sep' && $label === 'sept');
    }

    /** @param  array<int, mixed>  $labels */
    protected function sortLabels(array $labels): array
    {
        $order = $this->calendarOrder($labels);

        return $order ? array_values(array_map(fn ($i) => $labels[$i], $order)) : $labels;
    }

    /**
     * Splits bar chart data into multiple series (e.g. one bar per region, grouped or stacked
     * by product) — pivoted from (label, series, value) rows into one value array per series,
     * aligned to a shared label axis. Capped at 50 categories x 8 series to keep charts readable.
     */
    protected function multiSeriesData(Builder $query, array $columnNames, string $xField, string $seriesField, string $agg, ?string $yField, ?User $user = null): array
    {
        $labelExpr = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$xField}\"'))";
        $seriesExpr = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$seriesField}\"'))";
        $valueExpr = $this->aggExpression($agg, $yField);

        $rows = $query
            ->selectRaw("{$labelExpr} as label, {$seriesExpr} as series, {$valueExpr} as value")
            ->groupBy('label', 'series')
            ->limit($this->rowLimit(1000, $user))
            ->get();

        $labels = $this->sortLabels($rows->pluck('label')->unique()->sort()->values()->take($this->rowLimit(50, $user))->all());
        $seriesNames = $rows->pluck('series')->unique()->sort()->values()->take($this->rowLimit(8, $user))->all();

        $lookup = [];
        foreach ($rows as $row) {
            $lookup[$row->label][$row->series] = is_numeric($row->value) ? (float) $row->value : 0;
        }

        $series = collect($seriesNames)->map(fn ($name) => [
            'name' => (string) $name,
            'values' => collect($labels)->map(fn ($label) => $lookup[$label][$name] ?? 0)->all(),
        ])->all();

        return ['labels' => $labels, 'series' => $series];
    }

    /**
     * Applies row-level security: an org owner (or no authenticated viewer at all — see run())
     * sees every row; any other role only sees rows matching every active policy defined for
     * their role on this dataset, ANDed together the same way user-specified chart filters are.
     */
    protected function baseQuery(Dataset $dataset, ?User $user = null): Builder
    {
        $query = DB::table('dataset_rows')->where('dataset_id', $dataset->id);

        if (! $user) {
            return $query;
        }

        $role = $user->roleInOrganization($dataset->dataSource->organization_id);

        if ($role === null) {
            // Someone outside the owning company. Through a company share, only the share's rows;
            // with several shares over this dataset, a row visible under any of them is visible.
            $groups = $this->partnerScope($dataset, $user);
            if ($groups) {
                $columnNames = collect($dataset->columns ?? [])->pluck('name')->all();
                $query->where(function ($outer) use ($groups, $columnNames) {
                    foreach ($groups as $filters) {
                        $outer->orWhere(function ($q) use ($filters, $columnNames) {
                            $this->applyFilters($q, $columnNames, $filters);
                        });
                    }
                });
            }

            return $query;
        }

        if ($role === 'owner') {
            return $query;
        }

        $policies = RowLevelPolicy::where('dataset_id', $dataset->id)->where('role', $role)->get();
        $columnNames = collect($dataset->columns ?? [])->pluck('name')->all();

        foreach ($policies as $policy) {
            // Defense in depth: a policy's field is validated when created (see
            // RowLevelPolicyController), but the dataset's own columns can change later via a
            // resync — silently skip a policy that no longer matches a real column rather than
            // interpolating an untrusted string into raw SQL.
            if (! in_array($policy->field, $columnNames, true)) {
                continue;
            }

            $extract = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$policy->field}\"'))";

            if ($policy->operator === 'contains') {
                $query->whereRaw("{$extract} LIKE ?", ['%'.$policy->value.'%']);
            } else {
                $query->whereRaw("{$extract} {$policy->operator} ?", [$policy->value]);
            }
        }

        return $query;
    }

    protected function applyFilters(Builder $query, array $columnNames, array $filters): void
    {
        foreach ($filters as $filter) {
            $field = $this->validateField($columnNames, $filter['field'] ?? null);
            $operator = $filter['operator'] ?? '=';
            $value = $filter['value'] ?? null;

            if (! in_array($operator, self::ALLOWED_OPERATORS, true)) {
                throw new InvalidArgumentException("Unsupported filter operator: {$operator}");
            }

            $extract = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$field}\"'))";

            if ($operator === 'in') {
                // Multi-select slicer: an empty selection means "all", so it adds no condition.
                $values = array_slice(array_values(array_filter((array) $value, 'is_scalar')), 0, self::MAX_IN_VALUES);
                if ($values !== []) {
                    $query->whereRaw("{$extract} IN (".implode(',', array_fill(0, count($values), '?')).')', array_map('strval', $values));
                }
            } elseif ($operator === 'contains') {
                $query->whereRaw("{$extract} LIKE ?", ['%'.$value.'%']);
            } else {
                $query->whereRaw("{$extract} {$operator} ?", [$value]);
            }
        }
    }

    /**
     * Distinct values of one column, for filter slicers. Goes through baseQuery() so a viewer
     * restricted by row-level security only ever sees the values they're allowed to filter on.
     *
     * @return array<int, string>
     */
    public function distinctValues(Dataset $dataset, string $field, ?User $user = null, int $limit = 200): array
    {
        $columnNames = collect($dataset->columns ?? [])->pluck('name')->all();
        $field = $this->validateField($columnNames, $field);
        $extract = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$field}\"'))";

        return $this->baseQuery($dataset, $user)
            ->selectRaw("DISTINCT {$extract} as v")
            ->whereRaw("{$extract} IS NOT NULL AND {$extract} <> '' AND {$extract} <> 'null'")
            ->orderBy('v')
            ->limit($limit)
            ->pluck('v')
            ->map(fn ($v) => (string) $v)
            ->all();
    }

    /**
     * Row restrictions for a user who reaches this dataset only through company shares:
     * null = not a partner viewer (no extra restriction), [] = a share grants all rows,
     * otherwise one filter list per share (a row matching ANY list is visible).
     *
     * @return array<int, array<int, array{field: string, operator: string, value: mixed}>>|null
     */
    public function partnerScope(Dataset $dataset, ?User $user): ?array
    {
        // Deliberately not memoized: the service can outlive a request (queues, tests, Octane), and
        // a changed or revoked share must take effect on the very next query.
        if (! $user || $user->roleInOrganization($dataset->dataSource->organization_id) !== null) {
            return null;
        }

        $shares = \App\Models\DashboardShare::active()
            ->whereIn('organization_id', $user->organizations()->pluck('organizations.id'))
            ->whereHas('dashboard.charts', fn ($q) => $q->where('dataset_id', $dataset->id))
            ->get(['id', 'row_filters']);

        if ($shares->isEmpty()) {
            return null;
        }
        if ($shares->contains(fn ($s) => empty($s->row_filters))) {
            return [];
        }

        return $shares->map(fn ($s) => array_values($s->row_filters))->values()->all();
    }

    /**
     * First $limit rows the viewer is allowed to see (row-level security applies).
     *
     * @return array<int, array<string, mixed>>
     */
    public function sampleRows(Dataset $dataset, ?User $user = null, int $limit = 30): array
    {
        return $this->baseQuery($dataset, $user)
            ->orderBy('id')
            ->limit($limit)
            ->pluck('data')
            ->map(fn ($d) => is_string($d) ? (json_decode($d, true) ?? []) : (array) $d)
            ->all();
    }

    /**
     * Exact whole-dataset facts for the AI assistant, computed in SQL over every row the viewer
     * may see: per numeric column count/sum/avg/min/max, per date column the range, per
     * categorical column its distinct count and top values (with the totals of the main
     * measures), plus a monthly trend of the main measure. Lets the model answer "what's the
     * total revenue?" with the real number instead of extrapolating from a 30-row sample.
     *
     * @return array<string, mixed>
     */
    public function profile(Dataset $dataset, ?User $user = null): array
    {
        $key = 'dataset-profile:'.$dataset->id.':'.optional($dataset->updated_at)->timestamp.':'.($user?->id ?? 'anon');

        return Cache::remember($key, 600, function () use ($dataset, $user) {
            // Column names are interpolated into JSON paths below — skip any that could break out.
            $columns = array_slice(array_values(array_filter(
                collect($dataset->columns ?? [])->pluck('name')->all(),
                fn ($c) => is_string($c) && ! preg_match('/["\'\\\\]/', $c)
            )), 0, 30);
            $sample = $this->sampleRows($dataset, $user, 200);
            $kinds = $this->inferKinds($columns, $sample);
            $ex = fn (string $f) => "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$f}\"'))";
            $num = fn (string $f) => "CAST(NULLIF({$ex($f)}, '') AS DECIMAL(20,4))";

            $total = $this->baseQuery($dataset, $user)->count();
            $numeric = array_keys(array_filter($kinds, fn ($k) => $k === 'number'));
            $dates = array_keys(array_filter($kinds, fn ($k) => $k === 'date'));
            $categories = array_keys(array_filter($kinds, fn ($k) => $k === 'category'));
            // Identifier-ish numeric columns (id, *_id, phone) make meaningless sums.
            $measures = array_values(array_filter($numeric, fn ($f) => ! preg_match('/(^id$|_id$|^id_|phone|zip|postal|year$)/i', $f)));

            $profile = ['total_rows' => $total, 'columns' => []];

            if ($numeric) {
                $selects = [];
                foreach ($numeric as $i => $f) {
                    $selects[] = "COUNT({$num($f)}) as c{$i}, SUM({$num($f)}) as s{$i}, AVG({$num($f)}) as a{$i}, MIN({$num($f)}) as mn{$i}, MAX({$num($f)}) as mx{$i}";
                }
                $row = (array) $this->baseQuery($dataset, $user)->selectRaw(implode(', ', $selects))->first();
                foreach ($numeric as $i => $f) {
                    if (! in_array($f, $measures, true)) {
                        $profile['columns'][$f] = ['type' => 'identifier', 'non_empty' => (int) $row["c{$i}"], 'min' => (float) $row["mn{$i}"], 'max' => (float) $row["mx{$i}"]];

                        continue;
                    }
                    $profile['columns'][$f] = [
                        'type' => 'number',
                        'non_empty' => (int) $row["c{$i}"],
                        'sum' => round((float) $row["s{$i}"], 2),
                        'avg' => round((float) $row["a{$i}"], 2),
                        'min' => (float) $row["mn{$i}"],
                        'max' => (float) $row["mx{$i}"],
                    ];
                }
            }

            foreach ($dates as $f) {
                $row = $this->baseQuery($dataset, $user)
                    ->selectRaw("MIN({$ex($f)}) as lo, MAX({$ex($f)}) as hi")
                    ->whereRaw("{$ex($f)} <> ''")
                    ->first();
                $profile['columns'][$f] = ['type' => 'date', 'from' => $row?->lo, 'to' => $row?->hi];
            }

            // The measures people ask about ("revenue by country") come first: money-like names,
            // then quantities, then anything else. Up to three get totals per top value.
            $rank = fn (string $f) => match (true) {
                (bool) preg_match('/(^|_)(revenue|sales|turnover|income|amount|total|gmv|profit|value)(_|$)/i', $f) => 0,
                (bool) preg_match('/(^|_)(cost|spend|price|fee)(_|$)/i', $f) => 2,
                (bool) preg_match('/(^|_)(quantity|qty|units|count|orders|volume)(_|$)/i', $f) => 1,
                default => 3,
            };
            $ranked = $measures;
            usort($ranked, fn ($x, $y) => $rank($x) <=> $rank($y));
            $mainMeasures = array_slice($ranked, 0, 3);
            foreach ($categories as $f) {
                $distinct = (int) $this->baseQuery($dataset, $user)->selectRaw("COUNT(DISTINCT {$ex($f)}) as n")->value('n');
                $entry = ['type' => 'category', 'distinct_values' => $distinct];

                // High-cardinality text (names, emails, free text) — top values say nothing useful.
                if ($distinct <= 60 || $distinct < $total * 0.5) {
                    $select = ["{$ex($f)} as v", 'COUNT(*) as n'];
                    foreach ($mainMeasures as $i => $m) {
                        $select[] = "SUM({$num($m)}) as m{$i}";
                    }
                    $entry['top_values'] = $this->baseQuery($dataset, $user)
                        ->selectRaw(implode(', ', $select))
                        ->groupByRaw($ex($f))
                        ->orderByDesc($mainMeasures ? 'm0' : 'n')
                        ->limit(10)
                        ->get()
                        ->map(function ($r) use ($mainMeasures) {
                            $out = ['value' => $r->v, 'rows' => (int) $r->n];
                            foreach ($mainMeasures as $i => $m) {
                                $out["total_{$m}"] = round((float) $r->{"m{$i}"}, 2);
                            }

                            return $out;
                        })->all();
                }
                $profile['columns'][$f] = $entry;
            }

            if ($dates) {
                $d = $dates[0];
                $select = ["LEFT({$ex($d)}, 7) as period", 'COUNT(*) as n'];
                if ($mainMeasures) {
                    $select[] = "SUM({$num($mainMeasures[0])}) as m";
                }
                $profile['monthly_trend'] = [
                    'date_field' => $d,
                    'measure' => $mainMeasures ? "sum of {$mainMeasures[0]}" : 'row count',
                    'periods' => $this->baseQuery($dataset, $user)
                        ->selectRaw(implode(', ', $select))
                        ->whereRaw("{$ex($d)} <> ''")
                        ->groupBy('period')
                        ->orderByDesc('period')
                        ->limit(24)
                        ->get()
                        ->reverse()
                        ->map(fn ($r) => ['period' => $r->period, 'rows' => (int) $r->n] + ($mainMeasures ? ['value' => round((float) $r->m, 2)] : []))
                        ->values()
                        ->all(),
                ];
            }

            return $profile;
        });
    }

    /**
     * @param  string[]  $columns
     * @param  array<int, array<string, mixed>>  $sample
     * @return array<string, 'number'|'date'|'category'>
     */
    protected function inferKinds(array $columns, array $sample): array
    {
        $kinds = [];
        foreach ($columns as $c) {
            $values = array_values(array_filter(array_map(fn ($r) => $r[$c] ?? null, $sample), fn ($v) => $v !== null && $v !== ''));
            if (! $values) {
                $kinds[$c] = 'category';
            } elseif (count(array_filter($values, fn ($v) => is_numeric($v))) === count($values)) {
                $kinds[$c] = 'number';
            } elseif (count(array_filter($values, fn ($v) => is_string($v) && preg_match('/^\d{4}-\d{2}(-\d{2})?([ T].*)?$/', $v))) === count($values)) {
                $kinds[$c] = 'date';
            } else {
                $kinds[$c] = 'category';
            }
        }

        return $kinds;
    }

    protected function aggExpression(string $agg, ?string $field): string
    {
        if ($agg === 'count') {
            return 'COUNT(*)';
        }

        $extract = "JSON_UNQUOTE(JSON_EXTRACT(data, '$.\"{$field}\"'))";

        // Distinct counting is deliberately not cast to a decimal — the field being counted is
        // often categorical (e.g. "unique customers"), not numeric.
        if ($agg === 'count_distinct') {
            return "COUNT(DISTINCT {$extract})";
        }

        $numeric = "CAST({$extract} AS DECIMAL(20,4))";

        return match ($agg) {
            'sum' => "SUM({$numeric})",
            'avg' => "AVG({$numeric})",
            'min' => "MIN({$numeric})",
            'max' => "MAX({$numeric})",
            default => throw new InvalidArgumentException("Unsupported aggregation: {$agg}"),
        };
    }

    protected function validateField(array $columnNames, ?string $field): string
    {
        if ($field === null || ! in_array($field, $columnNames, true)) {
            throw new InvalidArgumentException("Unknown field: {$field}");
        }

        return $field;
    }

    protected function validateAgg(string $agg): string
    {
        if (! in_array($agg, self::ALLOWED_AGGREGATIONS, true)) {
            throw new InvalidArgumentException("Unsupported aggregation: {$agg}");
        }

        return $agg;
    }
}
