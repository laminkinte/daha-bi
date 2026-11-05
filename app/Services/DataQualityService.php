<?php

namespace App\Services;

use App\Models\Dataset;
use Illuminate\Support\Facades\DB;

class DataQualityService
{
    public function __construct(protected AiPromptService $ai)
    {
    }

    /**
     * @return array{total_rows: int, duplicate_row_count: int, columns: array<int, array{name: string, missing_count: int, missing_pct: float}>}
     */
    public function analyze(Dataset $dataset): array
    {
        $columns = collect($dataset->columns ?? [])->pluck('name')->all();
        $rows = DB::table('dataset_rows')->where('dataset_id', $dataset->id)->pluck('data');
        $total = $rows->count();

        $missing = array_fill_keys($columns, 0);
        $seenHashes = [];
        $duplicateRowCount = 0;

        foreach ($rows as $json) {
            $decoded = json_decode($json, true) ?? [];

            foreach ($columns as $column) {
                $value = $decoded[$column] ?? null;
                if ($value === null || $value === '') {
                    $missing[$column]++;
                }
            }

            // Exact-duplicate detection: same values across every column, order-independent
            // (ksort before hashing) since two rows built from the same source record could have
            // their keys in a different order depending on ingestion path.
            ksort($decoded);
            $hash = md5(json_encode($decoded));
            if (isset($seenHashes[$hash])) {
                $duplicateRowCount++;
            } else {
                $seenHashes[$hash] = true;
            }
        }

        $columnReport = collect($columns)->map(fn ($column) => [
            'name' => $column,
            'missing_count' => $missing[$column],
            'missing_pct' => $total > 0 ? round($missing[$column] / $total * 100, 1) : 0.0,
        ])->all();

        return [
            'total_rows' => $total,
            'duplicate_row_count' => $duplicateRowCount,
            'columns' => $columnReport,
        ];
    }

    /**
     * Best-effort plain-language summary of the report above. Returns '' on any AI failure,
     * same convention as AiPromptService's other best-effort methods.
     */
    public function summarize(Dataset $dataset, array $report): string
    {
        return $this->ai->summarizeDataQuality($dataset->name, $report);
    }

    /**
     * Deletes exact-duplicate rows, keeping the first occurrence of each — the one clearly-safe
     * automatic cleaning action (unlike missing-value imputation, which requires a judgment call
     * about strategy that a human should make, so this only reports on that rather than acting).
     * Returns the number of rows removed.
     */
    public function removeDuplicates(Dataset $dataset): int
    {
        $rows = DB::table('dataset_rows')->where('dataset_id', $dataset->id)->select('id', 'data')->get();
        $seenHashes = [];
        $toDelete = [];

        foreach ($rows as $row) {
            $decoded = json_decode($row->data, true) ?? [];
            ksort($decoded);
            $hash = md5(json_encode($decoded));

            if (isset($seenHashes[$hash])) {
                $toDelete[] = $row->id;
            } else {
                $seenHashes[$hash] = true;
            }
        }

        if (empty($toDelete)) {
            return 0;
        }

        DB::table('dataset_rows')->whereIn('id', $toDelete)->delete();
        // update() (not touch()) since row_count also needs correcting, and it bumps updated_at
        // as a side effect — the same hook ChartDataService's cache key relies on for invalidation.
        $dataset->update(['row_count' => max(0, $dataset->row_count - count($toDelete))]);

        return count($toDelete);
    }
}
