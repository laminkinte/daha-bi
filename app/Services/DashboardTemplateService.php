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
        ]);

        foreach ($this->chartSlots($roles) as $slot) {
            $dashboard->charts()->create([
                'dataset_id' => $dataset->id,
                'title' => $slot['title'],
                'type' => $slot['type'],
                'config' => $slot['config'],
            ]);
        }

        return $dashboard;
    }

    /**
     * @return array<int, array{title: string, type: string, config: array<string, mixed>}>
     */
    protected function chartSlots(array $roles): array
    {
        $slots = [];

        $slots[] = $roles['value']
            ? ['title' => "Total {$roles['value']}", 'type' => 'kpi', 'config' => ['y_field' => $roles['value'], 'agg' => 'sum']]
            : ['title' => 'Total records', 'type' => 'kpi', 'config' => ['agg' => 'count']];

        if ($roles['category']) {
            $slots[] = [
                'title' => $roles['value'] ? "{$roles['value']} by {$roles['category']}" : "Count by {$roles['category']}",
                'type' => 'bar',
                'config' => $roles['value']
                    ? ['x_field' => $roles['category'], 'y_field' => $roles['value'], 'agg' => 'sum']
                    : ['x_field' => $roles['category'], 'agg' => 'count'],
            ];
        }

        if ($roles['timeColumn']) {
            $slots[] = [
                'title' => $roles['value'] ? "{$roles['value']} over time" : 'Activity over time',
                'type' => 'line',
                'config' => $roles['value']
                    ? ['x_field' => $roles['timeColumn'], 'y_field' => $roles['value'], 'agg' => 'sum']
                    : ['x_field' => $roles['timeColumn'], 'agg' => 'count'],
            ];
        }

        $slots[] = ['title' => 'Underlying records', 'type' => 'table', 'config' => []];

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

        $timeColumn = collect($categorical)->first($looksTimeLike) ?? collect($numeric)->first($looksTimeLike);
        $category = collect($categorical)->first(fn ($c) => $c !== $timeColumn) ?? ($categorical[0] ?? null);

        // Prefer a numeric column that reads as the headline metric (e.g. "revenue" over
        // "units") when the dataset has more than one — falls back to column order otherwise,
        // since there's no real way to know which number matters most without this hint.
        $metricKeywords = ['revenue', 'sales', 'amount', 'total', 'price', 'cost', 'value', 'income', 'spend'];
        $value = collect($numeric)->first(
            fn ($c) => collect($metricKeywords)->contains(fn ($k) => str_contains(strtolower($c), $k))
        ) ?? ($numeric[0] ?? null);

        return [
            'numeric' => $numeric,
            'categorical' => $categorical,
            'timeColumn' => $timeColumn,
            'category' => $category,
            'value' => $value,
        ];
    }
}
