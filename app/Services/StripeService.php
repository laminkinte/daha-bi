<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\Payment;
use App\Models\SiteSetting;
use RuntimeException;
use Stripe\Checkout\Session as CheckoutSession;
use Stripe\Event;
use Stripe\StripeClient;
use Stripe\Webhook;

class StripeService
{
    public function isConfigured(): bool
    {
        return filled(config('services.stripe.secret_key'));
    }

    /**
     * Mirrors PaystackService::planAmount() — reads the live, admin-editable USD price so a
     * pricing change on the admin content page changes what Stripe charges too.
     */
    public function planAmountCents(string $plan, string $interval = 'monthly'): int
    {
        $tier = collect(SiteSetting::get('pricing_tiers'))->firstWhere('plan', $plan);

        if (! $tier) {
            throw new RuntimeException("Unknown plan: {$plan}");
        }

        if ($interval === 'yearly') {
            // Falls back to 10x monthly (~2 months free) if a tier predates the yearly field.
            return (int) ($tier['amount_usd_cents_yearly'] ?? $tier['amount_usd_cents'] * 10);
        }

        return (int) $tier['amount_usd_cents'];
    }

    /**
     * Start a subscription checkout: returns the Stripe-hosted page to redirect the user to.
     */
    public function createCheckoutSession(
        Organization $organization,
        string $plan,
        string $interval,
        string $billingEmail,
        int $initiatingUserId,
        string $successUrl,
        string $cancelUrl,
    ): array {
        $this->assertConfigured();

        $tier = collect(SiteSetting::get('pricing_tiers'))->firstWhere('plan', $plan);
        $planName = $tier['name'] ?? ucfirst($plan);

        $session = $this->client()->checkout->sessions->create([
            'mode' => 'subscription',
            ...($organization->stripe_customer_id
                ? ['customer' => $organization->stripe_customer_id]
                : ['customer_email' => $organization->billing_email ?? $billingEmail]),
            'line_items' => [[
                'quantity' => 1,
                'price_data' => [
                    'currency' => 'usd',
                    'unit_amount' => $this->planAmountCents($plan, $interval),
                    'recurring' => ['interval' => $interval === 'yearly' ? 'year' : 'month'],
                    'product_data' => ['name' => "daha-bi {$planName} plan"],
                ],
            ]],
            'success_url' => $successUrl.'?session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => $cancelUrl,
            // organization_id is who gets billed; user_id is who clicked, kept only for the
            // Payment audit trail.
            'metadata' => [
                'organization_id' => $organization->id,
                'user_id' => $initiatingUserId,
                'plan' => $plan,
                'interval' => $interval,
            ],
        ]);

        return ['url' => $session->url];
    }

    public function verifyAndConstructEvent(string $payload, ?string $signature): Event
    {
        $this->assertConfigured();

        if (! $signature) {
            throw new RuntimeException('Missing Stripe signature.');
        }

        return Webhook::constructEvent($payload, $signature, config('services.stripe.webhook_secret'));
    }

    /**
     * Handles the three events that matter for keeping plan/plan_status in sync: initial
     * checkout, monthly renewal, and cancellation. Idempotent the same way as PaystackService
     * (unique payments.reference), so a retried webhook delivery is always safe.
     */
    public function handleWebhookEvent(Event $event): void
    {
        match ($event->type) {
            'checkout.session.completed' => $this->handleCheckoutCompleted($event->data->object),
            'invoice.paid' => $this->handleInvoicePaid($event->data->object),
            'customer.subscription.deleted' => $this->handleSubscriptionDeleted($event->data->object),
            default => null,
        };
    }

    /**
     * Used by the callback page to confirm status immediately on redirect, without waiting for
     * the webhook to land — falls through harmlessly if the webhook already handled it, since
     * handleCheckoutCompleted() is idempotent on payments.reference.
     */
    public function retrieveAndActivateSession(string $sessionId): ?Payment
    {
        $this->assertConfigured();

        $session = $this->client()->checkout->sessions->retrieve($sessionId);

        if ($session->payment_status !== 'paid') {
            return null;
        }

        $this->handleCheckoutCompleted($session);

        return Payment::where('reference', $session->id)->first();
    }

    protected function handleCheckoutCompleted(CheckoutSession $session): void
    {
        $organizationId = $session->metadata['organization_id'] ?? null;
        $userId = $session->metadata['user_id'] ?? null;
        $plan = $session->metadata['plan'] ?? null;
        $interval = $session->metadata['interval'] ?? 'monthly';
        $organization = $organizationId ? Organization::find($organizationId) : null;

        if (! $organization || ! in_array($plan, ['growth', 'business'], true)) {
            return;
        }

        if (Payment::where('reference', $session->id)->exists()) {
            return;
        }

        Payment::create([
            'user_id' => $userId,
            'organization_id' => $organization->id,
            'plan' => $plan,
            'provider' => 'stripe',
            'amount' => $session->amount_total ?? $this->planAmountCents($plan, $interval),
            'currency' => strtoupper($session->currency ?? 'usd'),
            'reference' => $session->id,
            'status' => 'success',
        ]);

        $organization->forceFill([
            'billing_email' => $organization->billing_email ?? $session->customer_details?->email,
            'plan' => $plan,
            'plan_status' => 'active',
            'billing_interval' => $interval,
            'subscribed_at' => $organization->subscribed_at ?? now(),
            'current_period_end' => $interval === 'yearly' ? now()->addYear() : now()->addMonth(),
            'stripe_customer_id' => $session->customer ?? $organization->stripe_customer_id,
            'stripe_subscription_id' => $session->subscription ?? $organization->stripe_subscription_id,
        ])->save();
    }

    protected function handleInvoicePaid(\Stripe\Invoice $invoice): void
    {
        $organization = Organization::where('stripe_customer_id', $invoice->customer)->first();

        if (! $organization || ! in_array($organization->plan, ['growth', 'business'], true)) {
            return;
        }

        if (Payment::where('reference', $invoice->id)->exists()) {
            return;
        }

        // The very first invoice for a subscription is already recorded via checkout.session.completed.
        if ($invoice->billing_reason === 'subscription_create') {
            return;
        }

        Payment::create([
            'organization_id' => $organization->id,
            'plan' => $organization->plan,
            'provider' => 'stripe',
            'amount' => $invoice->amount_paid,
            'currency' => strtoupper($invoice->currency ?? 'usd'),
            'reference' => $invoice->id,
            'status' => 'success',
        ]);

        $organization->forceFill([
            'plan_status' => 'active',
            'current_period_end' => $organization->billing_interval === 'yearly' ? now()->addYear() : now()->addMonth(),
        ])->save();
    }

    protected function handleSubscriptionDeleted(\Stripe\Subscription $subscription): void
    {
        $organization = Organization::where('stripe_subscription_id', $subscription->id)->first();

        if (! $organization) {
            return;
        }

        $organization->forceFill(['plan' => 'free', 'plan_status' => 'canceled'])->save();
    }

    protected function client(): StripeClient
    {
        return new StripeClient(config('services.stripe.secret_key'));
    }

    protected function assertConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Payments are not configured yet — STRIPE_SECRET_KEY is missing.');
        }
    }
}
