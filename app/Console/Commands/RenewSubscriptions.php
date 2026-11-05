<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\PaystackService;
use Illuminate\Console\Command;

class RenewSubscriptions extends Command
{
    protected $signature = 'billing:renew';

    protected $description = 'Re-charge organizations whose paid plan period has ended, using their stored Paystack authorization';

    public function handle(PaystackService $paystack): int
    {
        if (! $paystack->isConfigured()) {
            $this->warn('Paystack is not configured — skipping.');

            return self::SUCCESS;
        }

        // Stripe subscribers renew through Stripe's own billing cycle — their current_period_end
        // is kept in sync by the invoice.paid webhook, not this command.
        $due = Organization::whereIn('plan', ['growth', 'business'])
            ->where('plan_status', 'active')
            ->whereNull('stripe_subscription_id')
            ->where('current_period_end', '<=', now())
            ->get();

        foreach ($due as $organization) {
            $payment = $paystack->chargeForRenewal($organization);

            if ($payment) {
                $this->info("Renewed {$organization->name} on {$organization->plan}.");
            } else {
                $organization->forceFill(['plan_status' => 'past_due'])->save();
                $this->error("Failed to renew {$organization->name} — marked past_due.");
            }
        }

        $this->info("Checked {$due->count()} due subscription(s).");

        return self::SUCCESS;
    }
}
