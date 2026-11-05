<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\Payment;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class PaystackService
{
    protected const BASE_URL = 'https://api.paystack.co';

    public function isConfigured(): bool
    {
        return filled(config('services.paystack.secret_key'));
    }

    /**
     * The admin-editable pricing_tiers setting is what actually gets charged — not a static
     * config file — so an admin changing a price on the pricing page changes what Paystack
     * bills too, with no separate step to keep them in sync.
     */
    public function planAmount(string $plan, string $interval = 'monthly'): int
    {
        $tier = collect(SiteSetting::get('pricing_tiers'))->firstWhere('plan', $plan);

        if (! $tier) {
            throw new RuntimeException("Unknown plan: {$plan}");
        }

        if ($interval === 'yearly') {
            // Falls back to 10x monthly (~2 months free) if a tier predates the yearly field.
            return (int) ($tier['amount_kobo_yearly'] ?? $tier['amount_kobo'] * 10);
        }

        return (int) $tier['amount_kobo'];
    }

    /**
     * Start a checkout: returns the Paystack-hosted page to redirect the user to.
     *
     * @return array{authorization_url: string, reference: string}
     */
    public function initialize(
        Organization $organization,
        string $plan,
        string $interval,
        string $billingEmail,
        int $initiatingUserId,
        string $callbackUrl,
    ): array {
        $this->assertConfigured();

        $response = $this->client()->post('/transaction/initialize', [
            'email' => $organization->billing_email ?? $billingEmail,
            'amount' => $this->planAmount($plan, $interval),
            'currency' => config('billing.currency'),
            'callback_url' => $callbackUrl,
            'metadata' => [
                'organization_id' => $organization->id,
                'user_id' => $initiatingUserId,
                'plan' => $plan,
                'interval' => $interval,
            ],
        ]);

        $this->assertSuccessful($response, 'Failed to start checkout with Paystack.');

        $data = $response->json('data');

        return ['authorization_url' => $data['authorization_url'], 'reference' => $data['reference']];
    }

    /**
     * Verify a transaction reference and, if it's a genuine successful charge not already
     * recorded, activate the plan on the user and log it in the payments ledger. Safe to call
     * more than once for the same reference (idempotent via payments.reference unique).
     */
    public function confirmAndActivate(string $reference): ?Payment
    {
        $this->assertConfigured();

        if ($existing = Payment::where('reference', $reference)->first()) {
            return $existing;
        }

        $response = $this->client()->get("/transaction/verify/{$reference}");
        $this->assertSuccessful($response, 'Failed to verify transaction with Paystack.');

        $data = $response->json('data');

        if (($data['status'] ?? null) !== 'success') {
            return null;
        }

        $organizationId = $data['metadata']['organization_id'] ?? null;
        $userId = $data['metadata']['user_id'] ?? null;
        $plan = $data['metadata']['plan'] ?? null;
        $interval = $data['metadata']['interval'] ?? 'monthly';
        $organization = $organizationId ? Organization::find($organizationId) : null;

        if (! $organization || ! in_array($plan, ['growth', 'business'], true)) {
            return null;
        }

        $payment = Payment::create([
            'user_id' => $userId,
            'organization_id' => $organization->id,
            'plan' => $plan,
            'provider' => 'paystack',
            'amount' => $data['amount'],
            'currency' => $data['currency'] ?? config('billing.currency'),
            'reference' => $reference,
            'status' => 'success',
        ]);

        // None of these columns are $fillable (so a user-facing endpoint can never mass-assign
        // its own plan) — forceFill is the intentional bypass for this trusted, server-verified write.
        $organization->forceFill([
            'billing_email' => $organization->billing_email ?? ($data['customer']['email'] ?? null),
            'plan' => $plan,
            'plan_status' => 'active',
            'billing_interval' => $interval,
            'subscribed_at' => $organization->subscribed_at ?? now(),
            'current_period_end' => $interval === 'yearly' ? now()->addYear() : now()->addMonth(),
            'paystack_customer_code' => $data['customer']['customer_code'] ?? $organization->paystack_customer_code,
            'paystack_authorization_code' => $data['authorization']['authorization_code'] ?? $organization->paystack_authorization_code,
        ])->save();

        return $payment;
    }

    /**
     * Attempt to re-charge a user's stored card for their current plan — used by the monthly
     * renewal command. Returns the new Payment on success, null on failure (caller marks past_due).
     */
    public function chargeForRenewal(Organization $organization): ?Payment
    {
        $this->assertConfigured();

        if (! $organization->paystack_authorization_code) {
            return null;
        }

        $response = $this->client()->post('/transaction/charge_authorization', [
            'authorization_code' => $organization->paystack_authorization_code,
            'email' => $organization->billing_email,
            'amount' => $this->planAmount($organization->plan, $organization->billing_interval),
            'currency' => config('billing.currency'),
        ]);

        if (! $response->successful() || $response->json('data.status') !== 'success') {
            return null;
        }

        $data = $response->json('data');

        // No human initiated an automated renewal charge — user_id stays null (see
        // make_payments_user_id_nullable_table).
        $payment = Payment::create([
            'organization_id' => $organization->id,
            'plan' => $organization->plan,
            'provider' => 'paystack',
            'amount' => $data['amount'],
            'currency' => $data['currency'] ?? config('billing.currency'),
            'reference' => $data['reference'],
            'status' => 'success',
        ]);

        $organization->forceFill([
            'plan_status' => 'active',
            'current_period_end' => $organization->billing_interval === 'yearly' ? now()->addYear() : now()->addMonth(),
        ])->save();

        return $payment;
    }

    public function verifyWebhookSignature(string $payload, ?string $signature): bool
    {
        if (! $signature || ! $this->isConfigured()) {
            return false;
        }

        return hash_equals(
            hash_hmac('sha512', $payload, config('services.paystack.secret_key')),
            $signature
        );
    }

    protected function client()
    {
        return Http::withToken(config('services.paystack.secret_key'))->baseUrl(self::BASE_URL);
    }

    protected function assertConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Payments are not configured yet — PAYSTACK_SECRET_KEY is missing.');
        }
    }

    protected function assertSuccessful($response, string $message): void
    {
        if (! $response->successful()) {
            throw new RuntimeException($message.' '.($response->json('message') ?? ''));
        }
    }
}
