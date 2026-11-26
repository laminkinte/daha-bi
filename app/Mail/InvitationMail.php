<?php

namespace App\Mail;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class InvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Invitation $invitation, public string $url)
    {
    }

    public function build(): self
    {
        $inviter = $this->invitation->invitedBy?->name ?? 'A teammate';
        $target = $this->invitation->dashboard
            ? "the \"{$this->invitation->dashboard->name}\" dashboard"
            : $this->invitation->organization->name;

        return $this->subject("{$inviter} invited you to {$target} on Daha BI")
            ->view('mail.invitation', [
                'inviter' => $inviter,
                'target' => $target,
                'invitation' => $this->invitation,
                'url' => $this->url,
            ]);
    }
}
