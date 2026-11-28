<?php

namespace App\Services;

use App\Mail\DashboardReportMail;
use App\Models\Dashboard;
use App\Models\ReportSchedule;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

class DashboardReportService
{
    public function __construct(protected ChartDataService $chartData)
    {
    }

    public function send(ReportSchedule $schedule): void
    {
        $dashboard = $schedule->dashboard()->with('charts.dataset')->first();

        $summaries = $this->buildSummaries($dashboard, $schedule->user);

        Mail::to($schedule->recipients)->locale($schedule->user?->locale ?? config('app.locale'))->send(new DashboardReportMail($dashboard, $summaries, $schedule->user));
    }

    /**
     * @return array<int, array{title: string, type: string, summary: string}>
     */
    public function buildSummaries(Dashboard $dashboard, ?User $user = null): array
    {
        return $dashboard->charts->map(function ($chart) use ($user) {
            $summary = $this->summarize($chart, $user);

            return ['title' => $chart->title, 'type' => strtoupper($chart->type), 'summary' => $summary];
        })->all();
    }

    protected function summarize($chart, ?User $user): string
    {
        try {
            $result = $this->chartData->run($chart->dataset, $chart->type, $chart->config ?? [], $chart->filters ?? [], $user);
        } catch (\Throwable $e) {
            return 'Unable to compute.';
        }

        if ($chart->type === 'feed') {
            return collect($result['items'] ?? [])->take(3)->map(fn ($i) => $i['title'])->implode(', ') ?: 'No data';
        }

        if ($chart->type === 'kpi' || $chart->type === 'gauge') {
            $value = $result['value'] ?? null;

            return is_numeric($value) ? number_format((float) $value, 2) : 'No data';
        }

        if ($chart->type === 'table') {
            return count($result['rows'] ?? []).' rows';
        }

        $labels = $result['labels'] ?? [];
        $values = $result['values'] ?? [];

        if (empty($labels)) {
            return 'No data';
        }

        $pairs = collect($labels)->map(fn ($label, $i) => "{$label}: ".number_format((float) ($values[$i] ?? 0), 1))
            ->take(5);

        return $pairs->implode(', ');
    }
}
