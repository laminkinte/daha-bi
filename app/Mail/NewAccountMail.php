<?php

namespace App\Mail;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Tells the platform team that someone signed up (config services.signup_notify_email).
 * Queued, so a slow or failing mail server never slows down or breaks the sign-up itself.
 */
class NewAccountMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public User $user, public Organization $organization, public int $totalUsers, public ?string $joinedVia = null)
    {
    }

    public function build(): self
    {
        $kind = $this->organization->account_type === 'organization' ? 'organization' : 'personal';

        return $this->subject("New Daha BI account: {$this->user->name} ({$kind})")
            ->replyTo($this->user->email, $this->user->name)
            ->view('mail.new-account', [
                'user' => $this->user,
                'organization' => $this->organization,
                'kind' => $kind,
                'totalUsers' => $this->totalUsers,
                'joinedVia' => $this->joinedVia,
                'adminUrl' => rtrim(config('services.frontend_url'), '/').'/admin/users',
            ]);
    }
}
