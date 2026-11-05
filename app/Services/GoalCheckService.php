<?php

namespace App\Services;

use App\Models\Goal;

class GoalCheckService
{
    public function __construct(protected ChartDataService $chartData)
    {
    }

    /**
     * Recomputes a goal's current value from its chart's live data. Mirrors
     * AlertCheckService::check() — same "recompute against live data, persist, tolerate
     * failure" shape, just without a notification side effect.
     */
    public function check(Goal $goal): Goal
    {
        $chart = $goal->chart;

        try {
            $result = $this->chartData->run($chart->dataset, 'kpi', $chart->config ?? [], $chart->filters ?? [], $goal->user);
        } catch (\Throwable) {
            return $goal;
        }

        $value = is_numeric($result['value'] ?? null) ? (float) $result['value'] : null;

        if ($value === null) {
            return $goal;
        }

        $goal->last_value = $value;
        $goal->last_checked_at = now();
        $goal->save();

        return $goal;
    }
}
