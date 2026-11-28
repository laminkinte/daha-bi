<?php

namespace App\Mail;

use App\Models\DashboardShare;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class DashboardShareMail extends Mailable
{
    use Queueable, SentOnBehalf, SerializesModels;

    public function __construct(public DashboardShare $share, public string $url)
    {
    }

    public function build(): self
    {
        $company = $this->share->dashboard->organization?->name ?? 'A company';

        return $this->sentBy($this->share->createdBy)->subject(__(':company shared the ":name" dashboard with your company', ['company' => $company, 'name' => $this->share->dashboard->name]))
            ->view('mail.dashboard-share', [
                'company' => $company,
                'sharedBy' => $this->share->createdBy?->name,
                'share' => $this->share,
                'url' => $this->url,
            ]);
    }
}
