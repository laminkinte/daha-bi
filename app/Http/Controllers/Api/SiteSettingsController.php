<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SiteSettingsController extends Controller
{
    protected const ALLOWED_KEYS = [
        'landing_hero',
        'landing_stats',
        'landing_steps',
        'landing_features',
        'landing_faqs',
        'pricing_tiers',
    ];

    public function show()
    {
        return response()->json(SiteSetting::allMerged());
    }

    public function update(Request $request, string $key)
    {
        if (! in_array($key, self::ALLOWED_KEYS, true)) {
            throw ValidationException::withMessages(['key' => ["Unknown setting: {$key}"]]);
        }

        $validated = $request->validate(['value' => ['required', 'array']]);

        if ($key === 'pricing_tiers') {
            $this->validatePricingTiers($validated['value']);
        }

        SiteSetting::updateOrCreate(['key' => $key], ['value' => $validated['value']]);

        return response()->json(['key' => $key, 'value' => $validated['value']]);
    }

    /**
     * The amount here is what actually gets charged via Paystack — worth a real check,
     * not just "is it an array", so a malformed edit can't silently break checkout.
     */
    protected function validatePricingTiers(array $tiers): void
    {
        foreach ($tiers as $tier) {
            if (! isset($tier['plan'], $tier['name'], $tier['amount_kobo'], $tier['amount_usd_cents'], $tier['features'])) {
                throw ValidationException::withMessages(['value' => ['Each tier needs plan, name, amount_kobo, amount_usd_cents, and features.']]);
            }

            if (! in_array($tier['plan'], ['free', 'growth', 'business'], true)) {
                throw ValidationException::withMessages(['value' => ["Invalid plan: {$tier['plan']}"]]);
            }

            if (! is_int($tier['amount_kobo']) || $tier['amount_kobo'] < 0) {
                throw ValidationException::withMessages(['value' => ['amount_kobo must be a non-negative integer.']]);
            }

            if (! is_int($tier['amount_usd_cents']) || $tier['amount_usd_cents'] < 0) {
                throw ValidationException::withMessages(['value' => ['amount_usd_cents must be a non-negative integer.']]);
            }

            // Yearly amounts are optional (older saved settings predate them) — validated only
            // when present; missing means "compute from monthly", see PaystackService/StripeService.
            foreach (['amount_kobo_yearly', 'amount_usd_cents_yearly'] as $field) {
                if (array_key_exists($field, $tier) && (! is_int($tier[$field]) || $tier[$field] < 0)) {
                    throw ValidationException::withMessages(['value' => ["{$field} must be a non-negative integer."]]);
                }
            }
        }
    }
}
