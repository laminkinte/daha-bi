<?php

namespace App\Mail;

use App\Models\User;

/**
 * Emails a person triggers (an invitation, a shared dashboard, a scheduled report, a mention)
 * show that person as the sender and route replies straight to them.
 *
 * The From *address* stays the platform's own (MAIL_FROM_ADDRESS): a mail server may only send
 * from addresses it is authorised for, and sending as someone's own Gmail/Outlook address would
 * be rejected or land in spam (SPF/DKIM/DMARC). So recipients see e.g.
 *   From: "Amina Bello via Daha BI" <notifications@…>   Reply-To: amina@herco.com
 */
trait SentOnBehalf
{
    public static function senderName(?User $user): string
    {
        $app = config('app.name', 'Daha BI');

        return $user ? "{$user->name} via {$app}" : $app;
    }

    protected function sentBy(?User $user): static
    {
        if ($user) {
            $this->from(config('mail.from.address'), self::senderName($user))
                ->replyTo($user->email, $user->name);
        }

        return $this;
    }
}
