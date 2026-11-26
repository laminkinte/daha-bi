<?php

namespace App\Mail;

use App\Models\DashboardShare;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class DashboardShareMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public DashboardShare $share, public string $url)
    {
    }

    public function build(): self
    {
        $company = $this->share->dashboard->organization?->name ?? 'A company';

        return $this->subject("{$company} shared the \"{$this->share->dashboard->name}\" dashboard with your company")
            ->view('mail.dashboard-share', [
                'company' => $company,
                'sharedBy' => $this->share->createdBy?->name,
                'share' => $this->share,
                'url' => $this->url,
            ]);
    }
}
