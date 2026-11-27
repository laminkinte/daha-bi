<?php

namespace App\Services;

use App\Models\Dashboard;
use App\Models\Dataset;
use App\Models\User;
use RuntimeException;

/**
 * A template is a named starter dashboard, not a magic per-industry chart set — daha-bi has no
 * semantic understanding of "this column is a sales region" vs "this column is a crop type".
 * What it CAN do reliably: sample a dataset's actual rows, tell numeric columns from categorical
 * ones, guess a time-like column by name, and build a sensible KPI + breakdown + trend + table
 * starting point from that. The five templates below differ in name, icon, and framing — useful
 * for picking the right mental model — but share this same honest, data-driven chart-building
 * logic underneath. Every generated chart is a normal chart afterward: fully editable, deletable,
 * re-mappable to different fields, same as if the user had built it by hand.
 */
class DashboardTemplateService
{
    /**
     * @return array<int, array{key: string, name: string, icon: string, description: string}>
     */
    public function definitions(): array
    {
        return [
            [
                'key' => 'sales',
                'name' => 'Sales & Revenue',
                'icon' => 'trending-up',
                'description' => 'Total revenue, a breakdown by category, and a trend over time.',
            ],
            [
                'key' => 'financial',
                'name' => 'Financial',
                'icon' => 'wallet',
                'description' => 'Headline totals, spend/income by category, and a trend over time.',
            ],
            [
                'key' => 'hr',
                'name' => 'HR Analytics',
                'icon' => 'users',
                'description' => 'Headcount, a breakdown by department or role, and the underlying records.',
            ],
            [
                'key' => 'government',
                'name' => 'Government Operations',
                'icon' => 'landmark',
                'description' => 'Case/record counts, a breakdown by category, and activity over time.',
            ],
            [
                'key' => 'agriculture',
                'name' => 'Agriculture & Farm',
                'icon' => 'sprout',
                'description' => 'Total yield or output, a breakdown by category, and a trend over time.',
            ],
        ];
    }

    public function instantiate(string $key, Dataset $dataset, User $user, string $name): Dashboard
    {
        $definition = collect($this->definitions())->firstWhere('key', $key);

        if (! $definition) {
            throw new RuntimeException("Unknown template: {$key}");
        }

        $roles = $this->detectColumnRoles($dataset);

        $dashboard = $user->dashboards()->create([
            'organization_id' => $dataset->dataSource->organization_id,
            'name' => $name,
            'description' => "Started from the {$definition['name']} template.",
            // A ready-made filter bar: date, the main grouping and the status, when the data has them.
            'settings' => ['slicers' => array_map(
                fn ($field) => ['field' => $field],
                array_values(array_unique(array_filter([$roles['timeColumn'], $roles['category'], $roles['status']])))
            )],
        ]);

        $roles['statusValues'] = $roles['status'] ? $this->chartData->distinctValues($dataset, $roles['status'], null, 12) : [];

        foreach ($this->chartSlots($roles) as $slot) {
            $dashboard->charts()->create([
                'dataset_id' => $dataset->id,
                'title' => $slot['title'],
                'type' => $slot['type'],
                'config' => $slot['config'],
                'filters' => $slot['filters'] ?? null,
                'position' => $slot['position'],
            ]);
        }

        return $dashboard;
    }

    public function __construct(protected ChartDataService $chartData)
    {
    }

    /** Words that mean something went wrong — a status column's "problem" values. */
    protected const PROBLEM = '/^(critical|failed|fail|failure|poor|cancell?ed|overdue|offline|error|rejected|lost|down|out of stock|refunded|disconnected|expired|blocked|urgent|declined|returned|churned)$/i';

    protected static function nice(string $field): string
    {
        return ucfirst(str_replace('_', ' ', $field));
    }

    /**
     * An operations-overview layout: a row of coloured KPI tiles, then the records table beside a
     * status donut, a trend (one line per status when there is one) beside the latest activity,
     * and two breakdowns. Every slot is skipped when the data has nothing to put in it.
     *
     * @return array<int, array{title: string, type: string, config: array<string, mixed>, position: array<string, int>, filters?: array}>
     */
    protected function chartSlots(array $roles): array
    {
        ['value' => $value, 'category' => $category, 'timeColumn' => $time, 'status' => $status] = $roles;
        $measure = fn (array $extra = []) => ($value ? ['y_field' => $value, 'agg' => 'sum'] : ['agg' => 'count']) + $extra;
        $tile = fn (string $color) => ['style' => ['variant' => 'tile', 'colors' => [$color]]];
        $trend = $time ? ['x_field' => $time, 'x_grain' => 'month'] : [];

        // Row 1 — KPI tiles.
        $kpis = [];
        $kpis[] = ['title' => $value ? 'Total '.str_replace('_', ' ', $value) : 'Total records', 'type' => 'kpi', 'config' => $measure($trend + $tile('#2a78d6'))];
        $kpis[] = ['title' => 'Records', 'type' => 'kpi', 'config' => ['agg' => 'count'] + $trend + $tile('#1baf7a')];
        if ($category) {
            $kpis[] = ['title' => self::nice($category).' count', 'type' => 'kpi', 'config' => ['agg' => 'count_distinct', 'y_field' => $category] + $tile('#eb6834')];
        }
        $problems = array_values(array_filter($roles['statusValues'] ?? [], fn ($v) => preg_match(self::PROBLEM, (string) $v)));
        if ($status && $problems) {
            $kpis[] = [
                'title' => implode(' / ', array_map('ucfirst', array_slice($problems, 0, 2))),
                'type' => 'kpi',
                'config' => ['agg' => 'count'] + $trend + $tile('#d03b3b'),
                'filters' => [['field' => $status, 'operator' => 'in', 'value' => $problems]],
            ];
        } elseif ($value) {
            $kpis[] = ['title' => 'Average '.str_replace('_', ' ', $value), 'type' => 'kpi', 'config' => ['y_field' => $value, 'agg' => 'avg'] + $tile('#4a3aa7')];
        }
        $w = intdiv(12, max(1, count($kpis)));
        $slots = [];
        foreach ($kpis as $i => $kpi) {
            $slots[] = $kpi + ['position' => ['x' => $i * $w, 'y' => 0, 'w' => $w, 'h' => 4]];
        }

        // Row 2 — the records, newest first, beside a share-of-whole donut.
        $columns = array_values(array_unique(array_filter([
            $roles['identifier'], $roles['label'], $category, $time, $value, $status,
        ])));
        $slots[] = [
            'title' => 'Latest records',
            'type' => 'table',
            'config' => array_filter(['columns' => count($columns) >= 3 ? $columns : null, 'sort_field' => $time, 'sort_dir' => $time ? 'desc' : null]),
            'position' => ['x' => 0, 'y' => 4, 'w' => 8, 'h' => 10],
        ];
        $donutField = $status ?? $category;
        if ($donutField) {
            $slots[] = [
                'title' => self::nice($donutField).' breakdown',
                'type' => 'pie',
                'config' => ['x_field' => $donutField, 'agg' => 'count', 'style' => ['variant' => 'donut', 'show_legend' => true, 'show_data_labels' => true]],
                'position' => ['x' => 8, 'y' => 4, 'w' => 4, 'h' => 10],
            ];
        }

        // Row 3 — the trend and the latest activity.
        if ($time) {
            $split = $status && count($roles['statusValues']) >= 2 && count($roles['statusValues']) <= 5;
            $slots[] = [
                'title' => ($value ? self::nice($value) : 'Records').' over time'.($split ? ' by '.str_replace('_', ' ', $status) : ''),
                'type' => 'line',
                'config' => $measure(['x_field' => $time, 'x_grain' => 'month'] + ($split ? ['series_field' => $status] : [])),
                'position' => ['x' => 0, 'y' => 14, 'w' => $roles['label'] ? 7 : 12, 'h' => 9],
            ];
            if ($roles['label']) {
                $slots[] = [
                    'title' => 'Recent activity',
                    'type' => 'feed',
                    'config' => array_filter(['x_field' => $time, 'label_field' => $roles['label'], 'series_field' => $status, 'y_field' => $value, 'limit' => 6]),
                    'position' => ['x' => 7, 'y' => 14, 'w' => 5, 'h' => 9],
                ];
            }
        }

        // Row 4 — breakdowns.
        if ($category) {
            $slots[] = [
                'title' => ($value ? self::nice($value) : 'Records').' by '.str_replace('_', ' ', $category),
                'type' => 'bar',
                'config' => $measure(['x_field' => $category, 'style' => ['sort' => 'desc']]),
                'position' => ['x' => 0, 'y' => 23, 'w' => 7, 'h' => 9],
            ];
        }
        $second = $roles['secondCategory'];
        if ($second) {
            $slots[] = [
                'title' => 'Top '.str_replace('_', ' ', $second),
                'type' => 'list',
                'config' => $measure(['x_field' => $second]),
                'position' => ['x' => $category ? 7 : 0, 'y' => 23, 'w' => $category ? 5 : 12, 'h' => 9],
            ];
        }

        return $slots;
    }

    /**
     * Samples up to 20 real rows and classifies each column as numeric or categorical by
     * inspecting actual values — dataset.columns only stores {name, label}, no data type. A
     * time-like column is guessed by name (date/month/year/...), checked among both groups since
     * a "year" column often looks numeric.
     *
     * @return array{numeric: string[], categorical: string[], timeColumn: ?string, category: ?string, value: ?string}
     */
    protected function detectColumnRoles(Dataset $dataset): array
    {
        $columnNames = collect($dataset->columns ?? [])->pluck('name')->all();
        $sample = $dataset->rows()->limit(20)->get()->pluck('data');

        $numeric = [];
        $categorical = [];

        foreach ($columnNames as $column) {
            $values = $sample->pluck($column)->filter(fn ($v) => $v !== null && $v !== '');

            if ($values->isEmpty()) {
                $categorical[] = $column;
                continue;
            }

            if ($values->every(fn ($v) => is_numeric($v))) {
                $numeric[] = $column;
            } else {
                $categorical[] = $column;
            }
        }

        $timeKeywords = ['date', 'month', 'year', 'day', 'time', 'period', 'week'];
        $looksTimeLike = fn (string $c) => collect($timeKeywords)->contains(fn ($k) => str_contains(strtolower($c), $k));

        $timeColumn = collect($categorical)->first($looksTimeLike)
            // …or whose values are ISO dates, whatever it's called ("serviced", "joined").
            ?? collect($categorical)->first(fn ($c) => ($v = $sample->pluck($c)->filter())->isNotEmpty() && $v->every(fn ($x) => preg_match('/^\d{4}-\d{2}-\d{2}/', (string) $x)))
            ?? collect($numeric)->first($looksTimeLike);

        // A status column: named like one, or whose sampled values are mostly state words.
        $status = collect($categorical)->first(fn ($c) => $c !== $timeColumn && preg_match('/status|state|stage|condition|health/i', $c))
            ?? collect($categorical)->first(function ($c) use ($sample, $timeColumn) {
                if ($c === $timeColumn) {
                    return false;
                }
                $values = $sample->pluck($c)->filter()->map(fn ($v) => (string) $v)->unique();

                return $values->count() >= 2 && $values->count() <= 8
                    && $values->filter(fn ($v) => preg_match(self::PROBLEM, $v) || preg_match('/^(active|completed?|paid|delivered|ok|good|pending|inactive|open|closed)$/i', $v))->count() >= ceil($values->count() / 2);
            });
        $identifier = collect($columnNames)->first(fn ($c) => preg_match('/(^|_)(id|code|number|no|ref)$/i', $c));
        // What a record is called (for the activity feed): a name/title-like column, never an id.
        $label = collect($categorical)->first(fn ($c) => $c !== $identifier && preg_match('/name|title|product|asset|item|customer|description|subject/i', $c));

        $groupable = collect($categorical)
            ->reject(fn ($c) => in_array($c, [$timeColumn, $status, $identifier, $label], true))
            // Few distinct values in the sample → a real grouping, not free text.
            ->filter(fn ($c) => $sample->pluck($c)->filter()->unique()->count() <= 15)
            ->values();
        $category = $groupable[0] ?? collect($categorical)->first(fn ($c) => $c !== $timeColumn && $c !== $identifier) ?? ($categorical[0] ?? null);
        $secondCategory = $groupable->first(fn ($c) => $c !== $category) ?? ($label !== $category ? $label : null);

        // Prefer a numeric column that reads as the headline metric (e.g. "revenue" over
        // "units") when the dataset has more than one — falls back to column order otherwise,
        // since there's no real way to know which number matters most without this hint.
        $metricKeywords = ['revenue', 'sales', 'amount', 'total', 'price', 'cost', 'value', 'income', 'spend'];
        $measures = collect($numeric)->reject(fn ($c) => $c === $identifier || $c === $timeColumn || preg_match('/(^|_)(id|year|code)$/i', $c));
        // Keywords are in priority order: "revenue" beats "unit_price" whatever the column order.
        $value = collect($metricKeywords)
            ->map(fn ($k) => $measures->first(fn ($c) => str_contains(strtolower($c), $k)))
            ->filter()
            ->first() ?? $measures->first();

        return [
            'numeric' => $numeric,
            'categorical' => $categorical,
            'timeColumn' => $timeColumn,
            'category' => $category,
            'secondCategory' => $secondCategory,
            'status' => $status,
            'identifier' => $identifier,
            'label' => $label,
            'value' => $value,
        ];
    }
}
