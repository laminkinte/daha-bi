<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class MigrateBillingToOrganizations extends Command
{
    protected $signature = 'billing:migrate-to-orgs';

    protected $description = 'One-time: copy billing (plan, Stripe/Paystack ids, trial) from users onto their organization, and backfill payments.organization_id';

    /** Higher rank wins when an organization has more than one owner. */
    protected const PLAN_RANK = ['business' => 2, 'growth' => 1, 'free' => 0];

    public function handle(): int
    {
        $orgCount = 0;

        Organization::whereNull('subscribed_at')->get()->each(function (Organization $organization) use (&$orgCount) {
            $owner = $organization->members()
                ->wherePivot('role', 'owner')
                ->get()
                ->sortByDesc(fn (User $u) => [self::PLAN_RANK[$u->plan] ?? 0, -($u->subscribed_at?->timestamp ?? PHP_INT_MAX)])
                ->first();

            if (! $owner) {
                return;
            }

            DB::transaction(function () use ($organization, $owner) {
                $organization->forceFill([
                    'billing_email' => $owner->email,
                    'plan' => $owner->plan,
                    'plan_status' => $owner->plan_status,
                    'billing_interval' => $owner->billing_interval,
                    'trial_ends_at' => $owner->trial_ends_at,
                    'subscribed_at' => $owner->subscribed_at,
                    'current_period_end' => $owner->current_period_end,
                    'paystack_customer_code' => $owner->paystack_customer_code,
                    'paystack_authorization_code' => $owner->paystack_authorization_code,
                    'stripe_customer_id' => $owner->stripe_customer_id,
                    'stripe_subscription_id' => $owner->stripe_subscription_id,
                ])->save();
            });

            $orgCount++;
        });

        $paymentCount = Payment::whereNull('organization_id')->with('user:id,current_organization_id')->get()
            ->each(fn (Payment $payment) => $payment->update(['organization_id' => $payment->user->current_organization_id]))
            ->count();

        $this->info("Migrated billing for {$orgCount} organization(s); backfilled {$paymentCount} payment(s).");

        return self::SUCCESS;
    }
}
