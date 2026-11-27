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
    protected const FEATURE_PLAN = [
        'ai' => ['Business', 'AI chat, prompt-to-chart and AI insights'],
        'branding' => ['Business', 'Custom branding'],
        'notebook' => ['Growth', 'The SQL & Python notebook'],
        'database_sources' => ['Growth', 'Live database and API connections'],
    ];

    protected const LIMIT_NOUN = ['users' => 'user', 'dashboards' => 'dashboard', 'share_links' => 'public share link'];

    public static function require(Organization $organization, string $feature, ?User $user = null): void
    {
        if ($user?->is_admin || $organization->planAllows($feature)) {
            return;
        }

        [$plan, $what] = self::FEATURE_PLAN[$feature];
        $extra = $feature === 'database_sources' ? ' The Free plan works with CSV uploads.' : '';

        self::refuse("{$what} ".($what === 'Custom branding' ? 'is' : 'are')." part of the {$plan} plan.{$extra}", $feature);
    }

    /** Refuses when $used has already reached the plan's limit for $key (adding one more would exceed it). */
    public static function underLimit(Organization $organization, string $key, int $used, ?User $user = null): void
    {
        $limit = $organization->planLimit($key);
        if ($user?->is_admin || $limit === null || $used < $limit) {
            return;
        }

        $plan = ucfirst($organization->effectivePlan());
        $noun = self::LIMIT_NOUN[$key].($limit === 1 ? '' : 's');
        $hint = $key === 'share_links' ? ' Turn off another public link, or upgrade.' : '';

        self::refuse("Your {$plan} plan includes {$limit} {$noun}, and this workspace is using {$used}.{$hint}", $key);
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
        throw new HttpException(402, $message.' Upgrade on the Pricing page to unlock more.', null, ['X-Plan-Limit' => $limit]);
    }
}
