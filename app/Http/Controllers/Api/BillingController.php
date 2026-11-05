<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\FlutterwaveService;
use App\Services\PaystackService;
use App\Services\StripeService;
use Illuminate\Http\Request;
use RuntimeException;
use Stripe\Exception\SignatureVerificationException;
use Symfony\Component\HttpFoundation\Response;

class BillingController extends Controller
{
    public function __construct(
        protected PaystackService $paystack,
        protected StripeService $stripe,
        protected FlutterwaveService $flutterwave,
    ) {
    }

    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'plan' => ['required', 'in:growth,business'],
            'interval' => ['sometimes', 'in:monthly,yearly'],
        ]);

        $organization = $this->authorizeBilling($request);

        if (! $this->paystack->isConfigured()) {
            return response()->json([
                'message' => 'Payments are not set up yet. Add PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY to the backend .env to enable real checkout.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $callbackUrl = config('services.frontend_url').'/billing/callback';
            $result = $this->paystack->initialize(
                $organization,
                $validated['plan'],
                $validated['interval'] ?? 'monthly',
                $request->user()->email,
                $request->user()->id,
                $callbackUrl
            );

            return response()->json($result);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
    }

    public function verify(Request $request)
    {
        $validated = $request->validate(['reference' => ['required', 'string']]);

        try {
            $payment = $this->paystack->confirmAndActivate($validated['reference']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (! $payment) {
            return response()->json(['message' => 'Payment could not be verified.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = $request->user()->fresh()->load('currentOrganization');

        return response()->json(['user' => $user, 'organization' => $user->currentOrganization, 'payment' => $payment]);
    }

    public function webhook(Request $request)
    {
        $signature = $request->header('x-paystack-signature');

        if (! $this->paystack->verifyWebhookSignature($request->getContent(), $signature)) {
            abort(Response::HTTP_UNAUTHORIZED);
        }

        $event = $request->input('event');
        $reference = $request->input('data.reference');

        if ($event === 'charge.success' && $reference) {
            $this->paystack->confirmAndActivate($reference);
        }

        return response()->json(['received' => true]);
    }

    public function stripeCheckout(Request $request)
    {
        $validated = $request->validate([
            'plan' => ['required', 'in:growth,business'],
            'interval' => ['sometimes', 'in:monthly,yearly'],
        ]);

        $organization = $this->authorizeBilling($request);

        if (! $this->stripe->isConfigured()) {
            return response()->json([
                'message' => 'Card payments are not set up yet. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to the backend .env to enable Stripe checkout.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $successUrl = config('services.frontend_url').'/billing/callback';
            $cancelUrl = config('services.frontend_url').'/pricing';
            $result = $this->stripe->createCheckoutSession(
                $organization,
                $validated['plan'],
                $validated['interval'] ?? 'monthly',
                $request->user()->email,
                $request->user()->id,
                $successUrl,
                $cancelUrl
            );

            return response()->json($result);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
    }

    public function stripeVerify(Request $request)
    {
        $validated = $request->validate(['session_id' => ['required', 'string']]);

        try {
            $payment = $this->stripe->retrieveAndActivateSession($validated['session_id']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (! $payment) {
            return response()->json(['message' => 'Payment could not be verified.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = $request->user()->fresh()->load('currentOrganization');

        return response()->json(['user' => $user, 'organization' => $user->currentOrganization, 'payment' => $payment]);
    }

    public function flutterwaveCheckout(Request $request)
    {
        $validated = $request->validate([
            'plan' => ['required', 'in:growth,business'],
            'interval' => ['sometimes', 'in:monthly,yearly'],
        ]);

        $organization = $this->authorizeBilling($request);

        if (! $this->flutterwave->isConfigured()) {
            return response()->json([
                'message' => 'Payments are not set up yet. Add FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_PUBLIC_KEY to the backend .env to enable Flutterwave checkout.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $redirectUrl = config('services.frontend_url').'/billing/callback';
            $result = $this->flutterwave->initialize(
                $organization,
                $validated['plan'],
                $validated['interval'] ?? 'monthly',
                $request->user()->email,
                $request->user()->id,
                $redirectUrl
            );

            return response()->json($result);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
    }

    public function flutterwaveVerify(Request $request)
    {
        $validated = $request->validate(['reference' => ['required', 'string']]);

        try {
            $payment = $this->flutterwave->confirmAndActivate($validated['reference']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (! $payment) {
            return response()->json(['message' => 'Payment could not be verified.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = $request->user()->fresh()->load('currentOrganization');

        return response()->json(['user' => $user, 'organization' => $user->currentOrganization, 'payment' => $payment]);
    }

    public function flutterwaveWebhook(Request $request)
    {
        if (! $this->flutterwave->verifyWebhookSignature($request->header('verif-hash'))) {
            abort(Response::HTTP_UNAUTHORIZED);
        }

        $event = $request->input('event');
        $reference = $request->input('data.tx_ref');

        if ($event === 'charge.completed' && $reference) {
            $this->flutterwave->confirmAndActivate($reference);
        }

        return response()->json(['received' => true]);
    }

    /**
     * Only an org owner/admin may start a checkout — mirrors the gate already used for renaming
     * the organization and managing members.
     */
    protected function authorizeBilling(Request $request): Organization
    {
        $organization = $request->user()->currentOrganization;
        $this->authorize('manageBilling', $organization);

        return $organization;
    }

    public function stripeWebhook(Request $request)
    {
        try {
            $event = $this->stripe->verifyAndConstructEvent($request->getContent(), $request->header('stripe-signature'));
        } catch (SignatureVerificationException|RuntimeException $e) {
            abort(Response::HTTP_UNAUTHORIZED);
        }

        $this->stripe->handleWebhookEvent($event);

        return response()->json(['received' => true]);
    }
}
