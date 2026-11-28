<?php

namespace App\Support;

use App\Models\Organization;
use App\Models\User;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Enforces config/plans.php. Refusals are HTTP 402 with a message that says what the plan
 * includes and where to upgrade; the frontend turns a 402 into an upgrade prompt. Platform
 * admins are never limited (they support customers inside any workspace).
 */
class PlanGate
{
    // Whole sentences (translated in lang/*.json) so every language can word them properly.
    protected const FEATURE_PLAN = [
        'ai' => ['Business', 'AI chat, prompt-to-chart and AI insights are part of the :plan plan.'],
        'branding' => ['Business', 'Custom branding is part of the :plan plan.'],
        'notebook' => ['Growth', 'The SQL & Python notebook is part of the :plan plan.'],
        'database_sources' => ['Growth', 'Live database and API connections are part of the :plan plan. The Free plan works with CSV uploads.'],
    ];

    protected const LIMIT_SENTENCE = [
        'users' => 'Your :plan plan includes :limit users, and this workspace is using :used.',
        'dashboards' => 'Your :plan plan includes :limit dashboards, and this workspace is using :used.',
        'share_links' => 'Your :plan plan includes :limit public share links, and this workspace is using :used. Turn off another public link, or upgrade.',
    ];

    public static function require(Organization $organization, string $feature, ?User $user = null): void
    {
        if ($user?->is_admin || $organization->planAllows($feature)) {
            return;
        }

        [$plan, $sentence] = self::FEATURE_PLAN[$feature];

        self::refuse(__($sentence, ['plan' => __($plan)]), $feature);
    }

    /** Refuses when $used has already reached the plan's limit for $key (adding one more would exceed it). */
    public static function underLimit(Organization $organization, string $key, int $used, ?User $user = null): void
    {
        $limit = $organization->planLimit($key);
        if ($user?->is_admin || $limit === null || $used < $limit) {
            return;
        }

        $plan = __(ucfirst($organization->effectivePlan()));

        self::refuse(__(self::LIMIT_SENTENCE[$key], ['plan' => $plan, 'limit' => $limit, 'used' => $used]), $key);
    }

    /** Before creating a dashboard in this workspace. */
    public static function newDashboard(?int $organizationId, ?User $user): void
    {
        if ($organizationId && ($organization = Organization::find($organizationId))) {
            self::underLimit($organization, 'dashboards', $organization->dashboards()->count(), $user);
        }
    }

    /** Before giving one more person access (a member, a dashboard guest, or an invitation). */
    public static function newSeat(Organization $organization, ?User $user): void
    {
        self::underLimit($organization, 'users', $organization->seatsUsed(), $user);
    }

    protected static function refuse(string $message, string $limit): never
    {
        throw new HttpException(402, $message.' '.__('Upgrade on the Pricing page to unlock more.'), null, ['X-Plan-Limit' => $limit]);
    }
}
