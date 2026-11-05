<?php

namespace App\Mail;

use App\Models\Dashboard;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class DashboardReportMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  array<int, array{title: string, type: string, summary: string}>  $chartSummaries
     */
    public function __construct(public Dashboard $dashboard, public array $chartSummaries)
    {
    }

    public function build(): self
    {
        return $this->subject("Dashboard report: {$this->dashboard->name}")
            ->view('mail.dashboard-report', [
                'dashboard' => $this->dashboard,
                'chartSummaries' => $this->chartSummaries,
            ]);
    }
}
