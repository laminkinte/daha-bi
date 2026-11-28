<?php

namespace App\Services;

use App\Mail\AlertBreachedMail;
use App\Models\Alert;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AlertCheckService
{
    public function __construct(protected ChartDataService $chartData)
    {
    }

    /** Anomaly alerts need at least this many prior periods to establish a meaningful baseline. */
    protected const MIN_BASELINE_POINTS = 5;

    /**
     * Recompute an alert's current value against its chart's live data and
     * persist the result. Sends a best-effort email the moment it transitions
     * into a breached state (never on every check, and never blocks on failure).
     */
    public function check(Alert $alert): Alert
    {
        if (! $alert->is_active) {
            return $alert;
        }

        $chart = $alert->chart;

        try {
            $result = $this->chartData->run($chart->dataset, 'kpi', $chart->config ?? [], $chart->filters ?? [], $alert->user);
        } catch (\Throwable $e) {
            return $alert;
        }

        return $alert->condition === 'anomaly'
            ? $this->checkAnomaly($alert, $result)
            : $this->checkThreshold($alert, $result);
    }

    protected function checkThreshold(Alert $alert, array $result): Alert
    {
        $value = is_numeric($result['value'] ?? null) ? (float) $result['value'] : null;

        if ($value === null) {
            return $alert;
        }

        $wasBreached = $alert->last_status === 'breached';
        $isBreached = $alert->condition === 'above' ? $value > $alert->threshold : $value < $alert->threshold;

        $alert->last_value = $value;
        $alert->last_status = $isBreached ? 'breached' : 'ok';
        $alert->last_checked_at = now();

        if ($isBreached && ! $wasBreached) {
            $alert->last_notified_at = now();
            $this->notify($alert, $value);
        }

        $alert->save();

        return $alert;
    }

    /**
     * Flags the latest period as anomalous when it's more than `sensitivity` standard
     * deviations from the mean of the periods before it — using the same per-period trend a KPI
     * sparkline already computes (see ChartDataService::kpiData), not a separately-tracked
     * history. A flat baseline (stddev of 0) only breaches on an exact change, since a z-score
     * would otherwise be undefined.
     */
    protected function checkAnomaly(Alert $alert, array $result): Alert
    {
        $values = array_values(array_filter(
            $result['trend']['values'] ?? [],
            fn ($v) => is_numeric($v)
        ));

        if (count($values) < self::MIN_BASELINE_POINTS + 1) {
            return $alert;
        }

        $latest = (float) array_pop($values);
        $mean = array_sum($values) / count($values);
        $variance = array_sum(array_map(fn ($v) => ($v - $mean) ** 2, $values)) / count($values);
        $stddev = sqrt($variance);
        $sensitivity = $alert->sensitivity ?? 2.5;

        $isBreached = $stddev > 0.0
            ? abs(($latest - $mean) / $stddev) > $sensitivity
            : $latest !== $mean;

        $wasBreached = $alert->last_status === 'breached';

        $alert->last_value = $latest;
        $alert->last_status = $isBreached ? 'breached' : 'ok';
        $alert->last_checked_at = now();

        if ($isBreached && ! $wasBreached) {
            $alert->last_notified_at = now();
            $this->notify($alert, $latest, $mean, $stddev);
        }

        $alert->save();

        return $alert;
    }

    protected function notify(Alert $alert, float $value, ?float $baselineMean = null, ?float $baselineStddev = null): void
    {
        try {
            Mail::to($alert->user)->send(new AlertBreachedMail($alert, $value, $baselineMean, $baselineStddev));
        } catch (\Throwable $e) {
            Log::warning('Failed to send alert breach email', ['alert_id' => $alert->id, 'error' => $e->getMessage()]);
        }
    }
}
