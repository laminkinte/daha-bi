<?php

namespace App\Mail;

use App\Models\Dashboard;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class DashboardReportMail extends Mailable
{
    use Queueable, SentOnBehalf, SerializesModels;

    /**
     * @param  array<int, array{title: string, type: string, summary: string}>  $chartSummaries
     * @param  User|null  $sender  who set up the report — shown as the sender, gets the replies
     */
    public function __construct(public Dashboard $dashboard, public array $chartSummaries, public ?User $sender = null)
    {
    }

    public function build(): self
    {
        return $this->sentBy($this->sender)->subject("Dashboard report: {$this->dashboard->name}")
            ->view('mail.dashboard-report', [
                'dashboard' => $this->dashboard,
                'chartSummaries' => $this->chartSummaries,
            ]);
    }
}
