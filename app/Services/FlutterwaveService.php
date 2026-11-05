<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\Payment;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class FlutterwaveService
{
    protected const BASE_URL = 'https://api.flutterwave.com/v3';

    public function isConfigured(): bool
    {
        return filled(config('services.flutterwave.secret_key'));
    }

    /**
     * Mirrors PaystackService::planAmount(), reading the same admin-editable kobo tier price —
     * but Flutterwave's `amount` field is the major currency unit (naira), not kobo, so this
     * divides by 100.
     */
    public function planAmount(string $plan, string $interval = 'monthly'): float
    {
        $tier = collect(SiteSetting::get('pricing_tiers'))->firstWhere('plan', $plan);

        if (! $tier) {
            throw new RuntimeException("Unknown plan: {$plan}");
        }

        $kobo = $interval === 'yearly'
            ? (int) ($tier['amount_kobo_yearly'] ?? $tier['amount_kobo'] * 10)
            : (int) $tier['amount_kobo'];

        return $kobo / 100;
    }

    /**
     * Start a checkout: returns the Flutterwave-hosted page to redirect the user to. Flutterwave
     * has no separate "initialize with a returned reference" step like Paystack — the tx_ref is
     * generated here and passed in up front.
     *
     * @return array{link: string, reference: string}
     */
    public function initialize(
        Organization $organization,
        string $plan,
        string $interval,
        string $billingEmail,
        int $initiatingUserId,
        string $redirectUrl,
    ): array {
        $this->assertConfigured();

        $reference = 'dahabi_'.Str::uuid();

        $response = $this->client()->post('/payments', [
            'tx_ref' => $reference,
            'amount' => $this->planAmount($plan, $interval),
            'currency' => config('billing.currency'),
            'redirect_url' => $redirectUrl,
            'customer' => [
                'email' => $organization->billing_email ?? $billingEmail,
            ],
            'meta' => [
                'organization_id' => $organization->id,
                'user_id' => $initiatingUserId,
                'plan' => $plan,
                'interval' => $interval,
            ],
        ]);

        $this->assertSuccessful($response, 'Failed to start checkout with Flutterwave.');

        return [
            'link' => $response->json('data.link'),
            'reference' => $reference,
        ];
    }

    /**
     * Verify a transaction reference and, if it's a genuine successful charge not already
     * recorded, activate the plan on the organization and log it in the payments ledger. Safe to
     * call more than once for the same reference (idempotent via payments.reference unique).
     */
    public function confirmAndActivate(string $reference): ?Payment
    {
        $this->assertConfigured();

        if ($existing = Payment::where('reference', $reference)->first()) {
            return $existing;
        }

        $response = $this->client()->get('/transactions/verify_by_reference', ['tx_ref' => $reference]);
        $this->assertSuccessful($response, 'Failed to verify transaction with Flutterwave.');

        $data = $response->json('data');

        if (($data['status'] ?? null) !== 'successful') {
            return null;
        }

        $organizationId = $data['meta']['organization_id'] ?? null;
        $userId = $data['meta']['user_id'] ?? null;
        $plan = $data['meta']['plan'] ?? null;
        $interval = $data['meta']['interval'] ?? 'monthly';
        $organization = $organizationId ? Organization::find($organizationId) : null;

        if (! $organization || ! in_array($plan, ['growth', 'business'], true)) {
            return null;
        }

        // Stored in minor units (kobo) to match Paystack/Stripe's convention — Flutterwave's own
        // amount is in naira.
        $payment = Payment::create([
            'user_id' => $userId,
            'organization_id' => $organization->id,
            'plan' => $plan,
            'provider' => 'flutterwave',
            'amount' => (int) round(((float) $data['amount']) * 100),
            'currency' => $data['currency'] ?? config('billing.currency'),
            'reference' => $reference,
            'status' => 'success',
        ]);

        $organization->forceFill([
            'billing_email' => $organization->billing_email ?? ($data['customer']['email'] ?? null),
            'plan' => $plan,
            'plan_status' => 'active',
            'billing_interval' => $interval,
            'subscribed_at' => $organization->subscribed_at ?? now(),
            'current_period_end' => $interval === 'yearly' ? now()->addYear() : now()->addMonth(),
        ])->save();

        return $payment;
    }

    /**
     * Flutterwave webhooks carry a static verif-hash header (set to the same value as
     * FLUTTERWAVE_SECRET_HASH in the dashboard) rather than an HMAC signature.
     */
    public function verifyWebhookSignature(?string $signature): bool
    {
        if (! $signature || ! $this->isConfigured()) {
            return false;
        }

        $expected = config('services.flutterwave.secret_hash');

        return filled($expected) && hash_equals($expected, $signature);
    }

    protected function client()
    {
        return Http::withToken(config('services.flutterwave.secret_key'))->baseUrl(self::BASE_URL);
    }

    protected function assertConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Payments are not configured yet — FLUTTERWAVE_SECRET_KEY is missing.');
        }
    }

    protected function assertSuccessful($response, string $message): void
    {
        if (! $response->successful()) {
            throw new RuntimeException($message.' '.($response->json('message') ?? ''));
        }
    }
}
