<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Dashboard;
use App\Models\DataSource;
use App\Models\Organization;
use App\Models\Payment;
use App\Models\User;
use App\Services\PaystackService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AdminController extends Controller
{
    public function __construct(protected PaystackService $paystack)
    {
    }

    public function stats()
    {
        $planCounts = Organization::query()->selectRaw('plan, count(*) as count')->groupBy('plan')->pluck('count', 'plan');

        // Paystack (NGN) and Stripe (USD) payments store amounts in different currencies'
        // minor units — summing them together as one number would silently mix ₦ and $, so
        // revenue is reported per currency instead of blindly added.
        $revenueByCurrency = fn ($query) => (clone $query)
            ->selectRaw('currency, sum(amount) as total')
            ->groupBy('currency')
            ->pluck('total', 'currency');

        $totalRevenue = $revenueByCurrency(Payment::where('status', 'success'));
        $thisMonthRevenue = $revenueByCurrency(
            Payment::where('status', 'success')->where('created_at', '>=', now()->startOfMonth())
        );

        return response()->json([
            'users' => User::count(),
            'admins' => User::where('is_admin', true)->count(),
            'referred_users' => User::whereNotNull('referred_by_id')->count(),
            'dashboards' => Dashboard::count(),
            'shared_dashboards' => Dashboard::where('is_shared', true)->count(),
            'data_sources' => DataSource::count(),
            'mysql_data_sources' => DataSource::where('type', 'mysql')->count(),
            'new_users_last_7_days' => User::where('created_at', '>=', now()->subDays(7))->count(),
            'free_users' => $planCounts['free'] ?? 0,
            'growth_users' => $planCounts['growth'] ?? 0,
            'business_users' => $planCounts['business'] ?? 0,
            'past_due_users' => Organization::where('plan_status', 'past_due')->count(),
            'trialing_users' => Organization::where('plan_status', 'trialing')->count(),
            'total_revenue_ngn_kobo' => (int) ($totalRevenue['NGN'] ?? 0),
            'total_revenue_usd_cents' => (int) ($totalRevenue['USD'] ?? 0),
            'payments_this_month_ngn_kobo' => (int) ($thisMonthRevenue['NGN'] ?? 0),
            'payments_this_month_usd_cents' => (int) ($thisMonthRevenue['USD'] ?? 0),
            'payments_configured' => $this->paystack->isConfigured() || app(\App\Services\StripeService::class)->isConfigured(),
        ]);
    }

    public function subscriptions()
    {
        return Organization::query()
            ->where(fn ($q) => $q->where('plan', '!=', 'free')->orWhere('plan_status', 'trialing'))
            // Split by currency rather than summing Paystack (NGN kobo) and Stripe (USD cents)
            // payments into one currency-blind total.
            ->withSum(['payments as lifetime_paid_ngn_kobo' => fn ($q) => $q->where('status', 'success')->where('currency', 'NGN')], 'amount')
            ->withSum(['payments as lifetime_paid_usd_cents' => fn ($q) => $q->where('status', 'success')->where('currency', 'USD')], 'amount')
            ->withCount('members')
            ->orderBy('current_period_end')
            ->get(['id', 'name', 'billing_email', 'plan', 'plan_status', 'billing_interval', 'trial_ends_at', 'subscribed_at', 'current_period_end']);
    }

    public function payments()
    {
        return Payment::with(['user:id,name,email', 'organization:id,name'])->latest()->limit(100)->get();
    }

    public function users(Request $request)
    {
        $search = $request->input('search');

        return User::query()
            ->with('currentOrganization:id,name,plan,plan_status')
            ->withCount(['dashboards', 'dataSources', 'referrals'])
            ->when($search, fn ($q) => $q->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
            ))
            ->when($request->input('status') === 'admins', fn ($q) => $q->where('is_admin', true))
            ->when($request->input('status') === 'suspended', fn ($q) => $q->whereNotNull('suspended_at'))
            ->when($request->input('status') === 'inactive', fn ($q) => $q->where(fn ($q) => $q->whereNull('last_active_at')->orWhere('last_active_at', '<', now()->subDays(30))))
            ->latest()
            ->limit(200)
            ->get();
    }

    public function setAdmin(Request $request, User $user)
    {
        abort_if($user->id === $request->user()->id, Response::HTTP_UNPROCESSABLE_ENTITY, "You can't change your own admin status.");

        $validated = $request->validate(['is_admin' => ['required', 'boolean']]);

        // is_admin is deliberately not $fillable (so it can never be mass-assigned from an
        // ordinary user-facing endpoint) — forceFill is the intentional bypass for this one
        // admin-gated, explicitly-validated write.
        $user->forceFill(['is_admin' => $validated['is_admin']])->save();
        \App\Models\AdminAction::record($request->user(), $validated['is_admin'] ? 'user.admin_granted' : 'user.admin_revoked',
            ($validated['is_admin'] ? 'Made ' : 'Revoked admin from ').$user->email, $user);

        return $user->fresh();
    }

    public function destroyUser(Request $request, User $user)
    {
        abort_if($user->id === $request->user()->id, Response::HTTP_UNPROCESSABLE_ENTITY, "You can't delete your own account here.");

        \App\Models\AdminAction::record($request->user(), 'user.deleted', "Deleted {$user->email}", $user, ['name' => $user->name]);
        $user->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
