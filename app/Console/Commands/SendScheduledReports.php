<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\ReportScheduleController;
use App\Models\ReportSchedule;
use App\Services\DashboardReportService;
use Illuminate\Console\Command;

class SendScheduledReports extends Command
{
    protected $signature = 'reports:send';

    protected $description = 'Send any dashboard report schedules that are due, and roll each forward to its next run time';

    public function handle(DashboardReportService $reports, ReportScheduleController $scheduler): int
    {
        $due = ReportSchedule::where('next_run_at', '<=', now())->get();

        foreach ($due as $schedule) {
            try {
                $reports->send($schedule);
                $this->info("Sent report for dashboard #{$schedule->dashboard_id} to ".implode(', ', $schedule->recipients));
            } catch (\Throwable $e) {
                $this->error("Failed to send schedule #{$schedule->id}: {$e->getMessage()}");
            }

            $schedule->update([
                'last_sent_at' => now(),
                'next_run_at' => $scheduler->computeNextRun($schedule->frequency, $schedule->day_of_week, substr($schedule->time_of_day, 0, 5)),
            ]);
        }

        $this->info("Checked {$due->count()} due schedule(s).");

        return self::SUCCESS;
    }
}
