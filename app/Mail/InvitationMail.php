<?php

namespace App\Mail;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class InvitationMail extends Mailable
{
    use Queueable, SentOnBehalf, SerializesModels;

    public function __construct(public Invitation $invitation, public string $url)
    {
    }

    public function build(): self
    {
        $inviter = $this->invitation->invitedBy?->name ?? __('A teammate');
        $target = $this->invitation->dashboard
            ? __('the ":name" dashboard', ['name' => $this->invitation->dashboard->name])
            : $this->invitation->organization->name;

        return $this->sentBy($this->invitation->invitedBy)->subject(__(':inviter invited you to :target on Daha BI', ['inviter' => $inviter, 'target' => $target]))
            ->view('mail.invitation', [
                'inviter' => $inviter,
                'target' => $target,
                'invitation' => $this->invitation,
                'url' => $this->url,
            ]);
    }
}
