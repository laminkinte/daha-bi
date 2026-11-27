<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminAction;
use App\Models\AiConversation;
use App\Models\AuditLog;
use App\Models\Comment;
use App\Models\Dashboard;
use App\Models\DashboardEmbed;
use App\Models\DashboardShare;
use App\Models\DataSource;
use App\Models\Dataset;
use App\Models\Organization;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

/**
 * The super-admin console beyond billing: platform overview, user lifecycle (suspend, reset,
 * inspect), workspaces (manual plan changes), system health, and the admin action log.
 * Every mutating action here is recorded in admin_actions.
 */
class PlatformController extends Controller
{
    protected const PLANS = ['free', 'growth', 'business'];

    protected const PLAN_STATUSES = ['active', 'trialing', 'past_due', 'canceled'];

    public function overview()
    {
        $since = now()->subDays(29)->startOfDay();
        $signups = User::where('created_at', '>=', $since)
            ->selectRaw('DATE(created_at) as d, COUNT(*) as n')->groupBy('d')->pluck('n', 'd');
        $series = collect(range(0, 29))->map(function ($i) use ($since, $signups) {
            $day = $since->copy()->addDays($i)->toDateString();

            return ['date' => $day, 'signups' => (int) ($signups[$day] ?? 0)];
        });

        $planMix = Organization::selectRaw('plan, COUNT(*) as n')->groupBy('plan')->pluck('n', 'plan');

        return [
            'kpis' => [
                'users' => User::count(),
                'users_new_7d' => User::where('created_at', '>=', now()->subDays(7))->count(),
                'users_active_7d' => User::where('last_active_at', '>=', now()->subDays(7))->count(),
                'suspended' => User::whereNotNull('suspended_at')->count(),
                'workspaces' => Organization::count(),
                'paying_workspaces' => Organization::where('plan', '!=', 'free')->where('plan_status', 'active')->count(),
                'dashboards' => Dashboard::count(),
                'data_sources' => DataSource::count(),
                'rows_stored' => (int) Dataset::sum('row_count'),
                'ai_conversations' => AiConversation::count(),
                'company_shares' => DashboardShare::whereNotNull('accepted_at')->count(),
                'embeds' => DashboardEmbed::count(),
                'comments' => Comment::count(),
            ],
            'signups_30d' => $series,
            'plan_mix' => collect(self::PLANS)->map(fn ($p) => ['plan' => $p, 'workspaces' => (int) ($planMix[$p] ?? 0)]),
            'recent_users' => User::latest()->limit(8)->get(['id', 'name', 'email', 'created_at', 'last_active_at', 'is_admin', 'suspended_at']),
            'recent_actions' => AdminAction::with('admin:id,name')->latest()->limit(8)->get(),
            'health' => $this->healthChecks(),
        ];
    }

    public function showUser(User $user)
    {
        $user->load(['organizations:id,name,plan,plan_status']);

        return [
            'user' => $user->only(['id', 'name', 'email', 'is_admin', 'created_at', 'last_active_at', 'suspended_at', 'suspended_reason', 'current_organization_id']),
            'workspaces' => $user->organizations->map(fn ($o) => [
                'id' => $o->id, 'name' => $o->name, 'role' => $o->pivot->role, 'plan' => $o->plan, 'plan_status' => $o->plan_status,
            ]),
            'counts' => [
                'dashboards' => $user->dashboards()->count(),
                'data_sources' => $user->dataSources()->count(),
                'ai_conversations' => AiConversation::where('user_id', $user->id)->count(),
                'comments' => Comment::where('user_id', $user->id)->count(),
                'active_sessions' => $user->tokens()->count(),
            ],
            'recent_activity' => AuditLog::where('user_id', $user->id)->latest()->limit(15)->get(['id', 'action', 'description', 'created_at']),
        ];
    }

    public function suspend(Request $request, User $user)
    {
        abort_if($user->id === $request->user()->id, Response::HTTP_UNPROCESSABLE_ENTITY, "You can't suspend yourself.");
        abort_if($user->is_admin, Response::HTTP_UNPROCESSABLE_ENTITY, 'Revoke admin rights before suspending an administrator.');
        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:255']]);

        $user->forceFill(['suspended_at' => now(), 'suspended_reason' => $validated['reason'] ?? null])->save();
        $user->tokens()->delete(); // signed out everywhere, immediately

        AdminAction::record($request->user(), 'user.suspended', "Suspended {$user->email}", $user, ['reason' => $validated['reason'] ?? null]);

        return $this->showUser($user->fresh());
    }

    public function unsuspend(Request $request, User $user)
    {
        $user->forceFill(['suspended_at' => null, 'suspended_reason' => null])->save();
        AdminAction::record($request->user(), 'user.unsuspended', "Reactivated {$user->email}", $user);

        return $this->showUser($user->fresh());
    }

    public function signOutEverywhere(Request $request, User $user)
    {
        $count = $user->tokens()->count();
        $user->tokens()->delete();
        AdminAction::record($request->user(), 'user.signed_out', "Signed {$user->email} out of {$count} session(s)", $user);

        return response()->json(['revoked' => $count]);
    }

    public function sendPasswordReset(Request $request, User $user)
    {
        $status = Password::sendResetLink(['email' => $user->email]);
        abort_unless($status === Password::RESET_LINK_SENT, Response::HTTP_UNPROCESSABLE_ENTITY, __($status));
        AdminAction::record($request->user(), 'user.password_reset_sent', "Sent a password reset link to {$user->email}", $user);

        return response()->json(['message' => "Password reset link sent to {$user->email}."]);
    }

    public function organizations(Request $request)
    {
        $search = trim((string) $request->input('search'));

        return Organization::query()
            ->withCount(['members', 'dashboards', 'dataSources'])
            ->when($search, fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('billing_email', 'like', "%{$search}%")))
            ->when($request->input('plan'), fn ($q, $plan) => $q->where('plan', $plan))
            ->latest()
            ->limit(300)
            ->get(['id', 'name', 'brand_name', 'billing_email', 'plan', 'plan_status', 'billing_interval', 'trial_ends_at', 'current_period_end', 'created_at'])
            ->map(function (Organization $o) {
                $o->setAttribute('owner', $o->members()->wherePivot('role', 'owner')->first(['users.id', 'users.name', 'users.email'])?->only(['id', 'name', 'email']));

                return $o;
            });
    }

    /** Manual plan management: comp a partner, extend a trial, fix a billing mistake. */
    public function updatePlan(Request $request, Organization $organization)
    {
        $validated = $request->validate([
            'plan' => ['required', 'in:'.implode(',', self::PLANS)],
            'plan_status' => ['required', 'in:'.implode(',', self::PLAN_STATUSES)],
            'trial_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $before = $organization->only(['plan', 'plan_status']);
        $organization->forceFill([
            'plan' => $validated['plan'],
            'plan_status' => $validated['plan_status'],
            'trial_ends_at' => $validated['plan_status'] === 'trialing' && ! empty($validated['trial_days'])
                ? now()->addDays($validated['trial_days'])
                : ($validated['plan_status'] === 'trialing' ? $organization->trial_ends_at : null),
        ])->save();

        AdminAction::record(
            $request->user(),
            'workspace.plan_changed',
            "Set {$organization->name} to {$validated['plan']} ({$validated['plan_status']})",
            $organization,
            ['before' => $before, 'note' => $validated['note'] ?? null]
        );

        return $organization->fresh();
    }

    public function health()
    {
        return ['checks' => $this->healthChecks(), 'environment' => [
            'app_env' => app()->environment(),
            'debug' => (bool) config('app.debug'),
            'url' => config('app.url'),
            'php' => PHP_VERSION,
            'laravel' => app()->version(),
            'timezone' => config('app.timezone'),
            'database' => DB::connection()->getDriverName(),
        ]];
    }

    public function actions(Request $request)
    {
        return AdminAction::with('admin:id,name,email')
            ->when($request->input('search'), fn ($q, $s) => $q->where('description', 'like', "%{$s}%"))
            ->latest()->limit(300)->get();
    }

    /**
     * @return array<int, array{key: string, label: string, status: 'ok'|'warn'|'fail', detail: string}>
     */
    protected function healthChecks(): array
    {
        $checks = [];
        $add = function (string $key, string $label, string $status, string $detail) use (&$checks) {
            $checks[] = compact('key', 'label', 'status', 'detail');
        };

        try {
            DB::select('select 1');
            $add('database', 'Database', 'ok', 'Connected ('.DB::connection()->getDriverName().')');
        } catch (\Throwable $e) {
            $add('database', 'Database', 'fail', 'Not reachable');
        }

        $mailer = config('mail.default');
        $add('mail', 'Email delivery', $mailer === 'log' || $mailer === 'array' ? 'warn' : 'ok',
            $mailer === 'smtp' ? 'SMTP via '.config('mail.mailers.smtp.host').' as '.config('mail.from.address') : "Mailer \"{$mailer}\" — emails are not delivered");

        $add('ai', 'AI (Gemini)', filled(config('services.gemini.key')) ? 'ok' : 'warn',
            filled(config('services.gemini.key')) ? 'Model '.config('services.gemini.model').', fallback '.config('services.gemini.fallback_model') : 'GEMINI_API_KEY not set — AI features are off');

        $stripe = (string) config('services.stripe.secret_key');
        $paystack = filled(config('services.paystack.secret_key'));
        $add('payments', 'Payments', $stripe || $paystack ? (str_starts_with($stripe, 'sk_test') ? 'warn' : 'ok') : 'warn',
            $stripe ? (str_starts_with($stripe, 'sk_test') ? 'Stripe in TEST mode — no real charges' : 'Stripe live') : ($paystack ? 'Paystack configured' : 'No payment provider configured'));

        if (Schema::hasTable('jobs')) {
            $pending = DB::table('jobs')->count();
            $failed = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->where('failed_at', '>=', now()->subDay())->count() : 0;
            $add('queue', 'Background jobs', $failed > 0 ? 'warn' : ($pending > 100 ? 'warn' : 'ok'), "{$pending} waiting, {$failed} failed in the last 24h");
        }

        $beat = Cache::get('scheduler:heartbeat');
        $add('scheduler', 'Scheduler (reports, alerts)', $beat && Carbon::parse($beat)->gt(now()->subMinutes(5)) ? 'ok' : 'warn',
            $beat ? 'Last ran '.Carbon::parse($beat)->diffForHumans() : 'No run recorded yet');

        $free = @disk_free_space(base_path());
        $total = @disk_total_space(base_path());
        if ($free && $total) {
            $pct = round(100 * (1 - $free / $total));
            $add('disk', 'Disk space', $pct > 90 ? 'fail' : ($pct > 80 ? 'warn' : 'ok'), "{$pct}% used, ".round($free / 1073741824, 1).' GB free');
        }

        $add('python', 'Python notebook', config('services.python.access') === 'disabled' ? 'warn' : 'ok',
            config('services.python.access') === 'disabled' ? 'Disabled on this server' : 'Enabled for '.config('services.python.access'));

        return $checks;
    }
}
