<?php

namespace App\Services;

use App\Models\DataModel;
use App\Models\Dataset;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Throwable;

class DataModelService
{
    protected const MAX_ROWS = 50000;

    protected const CHUNK_SIZE = 500;

    protected const ALLOWED_FILTER_OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'contains'];

    protected const ALLOWED_DERIVE_OPERATORS = ['+', '-', '*', '/'];

    /**
     * Executes a data model's pipeline against real dataset rows and materializes the result as
     * an ordinary Dataset — from that point on it's chartable, exportable, and row-level-securable
     * exactly like a CSV or database dataset, with zero changes needed anywhere else in the app.
     */
    public function run(DataModel $model): Dataset
    {
        // status/error_message/output_dataset_id/last_run_at/next_run_at are all server-computed
        // run state, deliberately kept out of $fillable so no request body could ever set them —
        // forceFill is the intentional bypass for this trusted, internal write (same convention
        // as Organization/User's billing fields).
        $model->forceFill(['status' => 'running', 'error_message' => null])->save();

        try {
            $pipeline = $model->pipeline;

            if (empty($pipeline) || ($pipeline[0]['type'] ?? null) !== 'source') {
                throw new InvalidArgumentException('A pipeline must start with a source step.');
            }

            $sourceDataset = Dataset::findOrFail($pipeline[0]['dataset_id']);
            $rows = $this->loadRows($sourceDataset);

            foreach (array_slice($pipeline, 1) as $step) {
                $rows = $this->applyStep($rows, $step);

                if (count($rows) > self::MAX_ROWS) {
                    $rows = array_slice($rows, 0, self::MAX_ROWS);
                }
            }

            $columns = $this->inferColumns($rows);
            $dataset = $this->materialize($model, $rows, $columns);
        } catch (Throwable $e) {
            $model->forceFill(['status' => 'failed', 'error_message' => $e->getMessage()])->save();
            throw $e;
        }

        $model->forceFill([
            'status' => 'ready',
            'output_dataset_id' => $dataset->id,
            'last_run_at' => now(),
            'next_run_at' => $this->nextRunAt($model->schedule),
        ])->save();

        return $dataset;
    }

    protected function applyStep(array $rows, array $step): array
    {
        return match ($step['type'] ?? null) {
            'join' => $this->applyJoin($rows, $step),
            'filter' => $this->applyFilter($rows, $step),
            'select' => $this->applySelect($rows, $step),
            'rename' => $this->applyRename($rows, $step),
            'derive' => $this->applyDerive($rows, $step),
            default => throw new InvalidArgumentException('Unknown pipeline step type: '.($step['type'] ?? '(missing)')),
        };
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    protected function loadRows(Dataset $dataset): array
    {
        return DB::table('dataset_rows')
            ->where('dataset_id', $dataset->id)
            ->pluck('data')
            ->map(fn ($json) => json_decode($json, true) ?? [])
            ->all();
    }

    /**
     * Joined columns are namespaced under a prefix ("customers.name") rather than merged flat,
     * so a join can never silently clobber a same-named column already present on the left side.
     */
    protected function applyJoin(array $rows, array $step): array
    {
        $rightDataset = Dataset::findOrFail($step['dataset_id']);
        $leftField = $step['left_field'] ?? null;
        $rightField = $step['right_field'] ?? null;
        $joinType = $step['join_type'] ?? 'inner';

        if (! $leftField || ! $rightField) {
            throw new InvalidArgumentException('A join step needs both left_field and right_field.');
        }

        $prefix = $step['prefix'] ?? Str::slug($rightDataset->name, '_');
        $rightRows = $this->loadRows($rightDataset);

        $lookup = [];
        foreach ($rightRows as $right) {
            $key = (string) ($right[$rightField] ?? '');
            $lookup[$key][] = $right;
        }

        $result = [];
        foreach ($rows as $left) {
            $key = (string) ($left[$leftField] ?? '');
            $matches = $lookup[$key] ?? [];

            if (empty($matches)) {
                if ($joinType === 'left') {
                    $result[] = $left;
                }

                continue;
            }

            foreach ($matches as $right) {
                $merged = $left;
                foreach ($right as $column => $value) {
                    $merged["{$prefix}.{$column}"] = $value;
                }
                $result[] = $merged;
            }
        }

        return $result;
    }

    protected function applyFilter(array $rows, array $step): array
    {
        $field = $step['field'] ?? null;
        $operator = $step['operator'] ?? '=';
        $value = $step['value'] ?? null;

        if (! $field) {
            throw new InvalidArgumentException('A filter step needs a field.');
        }

        if (! in_array($operator, self::ALLOWED_FILTER_OPERATORS, true)) {
            throw new InvalidArgumentException("Unsupported filter operator: {$operator}");
        }

        return array_values(array_filter($rows, function (array $row) use ($field, $operator, $value) {
            $actual = $row[$field] ?? null;

            return match ($operator) {
                '=' => (string) $actual === (string) $value,
                '!=' => (string) $actual !== (string) $value,
                '>' => is_numeric($actual) && (float) $actual > (float) $value,
                '<' => is_numeric($actual) && (float) $actual < (float) $value,
                '>=' => is_numeric($actual) && (float) $actual >= (float) $value,
                '<=' => is_numeric($actual) && (float) $actual <= (float) $value,
                'contains' => str_contains(strtolower((string) $actual), strtolower((string) $value)),
            };
        }));
    }

    protected function applySelect(array $rows, array $step): array
    {
        $fields = $step['fields'] ?? [];

        if (empty($fields)) {
            throw new InvalidArgumentException('A select step needs at least one field.');
        }

        $keep = array_flip($fields);

        return array_map(fn (array $row) => array_intersect_key($row, $keep), $rows);
    }

    protected function applyRename(array $rows, array $step): array
    {
        $from = $step['from'] ?? null;
        $to = $step['to'] ?? null;

        if (! $from || ! $to) {
            throw new InvalidArgumentException('A rename step needs both from and to.');
        }

        return array_map(function (array $row) use ($from, $to) {
            if (array_key_exists($from, $row)) {
                $row[$to] = $row[$from];
                unset($row[$from]);
            }

            return $row;
        }, $rows);
    }

    /**
     * A derived column is ALWAYS one binary arithmetic operation between two existing fields, or
     * a field and a constant — never an arbitrary expression string — so this never has to parse
     * or eval() untrusted input.
     */
    protected function applyDerive(array $rows, array $step): array
    {
        $name = $step['name'] ?? null;
        $leftField = $step['left_field'] ?? null;
        $operator = $step['operator'] ?? null;
        $rightField = $step['right_field'] ?? null;
        $constant = $step['constant'] ?? null;

        if (! $name || ! $leftField || ! $operator) {
            throw new InvalidArgumentException('A derive step needs name, left_field, and operator.');
        }

        if (! in_array($operator, self::ALLOWED_DERIVE_OPERATORS, true)) {
            throw new InvalidArgumentException("Unsupported derive operator: {$operator}");
        }

        if ($rightField === null && $constant === null) {
            throw new InvalidArgumentException('A derive step needs either right_field or constant.');
        }

        return array_map(function (array $row) use ($name, $leftField, $operator, $rightField, $constant) {
            $left = is_numeric($row[$leftField] ?? null) ? (float) $row[$leftField] : 0.0;
            $right = $rightField !== null
                ? (is_numeric($row[$rightField] ?? null) ? (float) $row[$rightField] : 0.0)
                : (float) $constant;

            $row[$name] = match ($operator) {
                '+' => $left + $right,
                '-' => $left - $right,
                '*' => $left * $right,
                '/' => $right != 0.0 ? $left / $right : null,
            };

            return $row;
        }, $rows);
    }

    /**
     * @return array<int, array{name: string, label: string}>
     */
    protected function inferColumns(array $rows): array
    {
        $names = [];
        foreach ($rows as $row) {
            foreach (array_keys($row) as $name) {
                $names[$name] = true;
            }
        }

        return array_map(fn ($name) => ['name' => $name, 'label' => $name], array_keys($names));
    }

    protected function materialize(DataModel $model, array $rows, array $columns): Dataset
    {
        $dataset = $model->outputDataset ?: Dataset::create([
            'data_source_id' => $model->data_source_id,
            'name' => Str::slug($model->name, '_'),
            'columns' => $columns,
            'row_count' => 0,
        ]);

        DB::table('dataset_rows')->where('dataset_id', $dataset->id)->delete();

        foreach (array_chunk($rows, self::CHUNK_SIZE) as $chunk) {
            DB::table('dataset_rows')->insert(array_map(fn (array $row) => [
                'dataset_id' => $dataset->id,
                'data' => json_encode($row),
                'created_at' => now(),
                'updated_at' => now(),
            ], $chunk));
        }

        $dataset->update([
            'name' => Str::slug($model->name, '_'),
            'columns' => $columns,
            'row_count' => count($rows),
        ]);

        return $dataset;
    }

    protected function nextRunAt(string $schedule): ?Carbon
    {
        return match ($schedule) {
            'hourly' => now()->addHour(),
            'daily' => now()->addDay(),
            default => null,
        };
    }
}
