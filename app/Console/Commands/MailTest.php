<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Throwable;

/** php artisan mail:test someone@example.com — checks that email delivery is set up. */
class MailTest extends Command
{
    protected $signature = 'mail:test {to : Address to send the test email to}';

    protected $description = 'Send a test email to check the mail settings';

    public function handle(): int
    {
        $mailer = config('mail.default');
        $this->line("Mailer: <info>{$mailer}</info>".($mailer === 'smtp' ? ' ('.config('mail.mailers.smtp.host').':'.config('mail.mailers.smtp.port').')' : ''));

        if ($mailer === 'log') {
            $this->warn('Emails are only written to storage/logs/laravel.log. Set MAIL_MAILER=smtp and MAIL_PASSWORD in .env, then run: php artisan config:cache');
        }

        try {
            Mail::raw(
                "This is a test email from Daha BI.\n\nIf you can read this, invitations, share offers, comment notifications and scheduled reports will be delivered.",
                fn ($m) => $m->to($this->argument('to'))->subject('Daha BI test email')
            );
        } catch (Throwable $e) {
            $this->error('Sending failed: '.$e->getMessage());
            if (str_contains($e->getMessage(), '535') || str_contains(strtolower($e->getMessage()), 'username and password not accepted')) {
                $this->line('Gmail rejected the login. Use a 16-character App password (myaccount.google.com/apppasswords), not your normal password, with 2-Step Verification on.');
            }

            return self::FAILURE;
        }

        $this->info('Sent to '.$this->argument('to').($mailer === 'log' ? ' (to the log file).' : '. Check the inbox and the spam folder.'));

        return self::SUCCESS;
    }
}
