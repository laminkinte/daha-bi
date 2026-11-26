<?php

namespace App\Services;

use App\Mail\InvitationMail;
use App\Models\Dashboard;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * Email invitations for people who don't have a Daha BI account yet — to a whole workspace, or
 * as a guest on one dashboard. The link carries a random token; only its hash is stored.
 */
class InvitationService
{
    public const VALID_DAYS = 7;

    public function __construct(protected AuditLogger $auditLog)
    {
    }

    public static function url(string $token): string
    {
        return rtrim(config('services.frontend_url'), '/')."/invite/{$token}";
    }

    /**
     * Creates (or refreshes) the pending invitation for this email + target and emails the link.
     *
     * @return array{0: Invitation, 1: string, 2: bool} invitation, plain token, whether the email was sent
     */
    public function invite(Organization $organization, User $inviter, string $email, ?string $role, ?Dashboard $dashboard = null, ?string $dashboardRole = null): array
    {
        $email = Str::lower(trim($email));
        $token = Str::random(48);

        // Re-inviting the same person to the same place replaces the old link rather than piling up rows.
        $invitation = Invitation::pending()
            ->where('organization_id', $organization->id)
            ->where('email', $email)
            ->where('dashboard_id', $dashboard?->id)
            ->first() ?? new Invitation(['organization_id' => $organization->id, 'email' => $email, 'dashboard_id' => $dashboard?->id]);

        $invitation->fill([
            'invited_by_id' => $inviter->id,
            'role' => $dashboard ? null : $role,
            'dashboard_role' => $dashboard ? $dashboardRole : null,
            'token_hash' => Invitation::hashToken($token),
            'expires_at' => now()->addDays(self::VALID_DAYS),
        ])->save();

        $sent = $this->send($invitation, $token);

        $this->auditLog->log(
            $organization->id,
            $inviter->id,
            'invitation.sent',
            $dashboard
                ? "Invited {$email} to dashboard \"{$dashboard->name}\" as {$dashboardRole}"
                : "Invited {$email} to the workspace as {$role}",
            $invitation,
            ['email' => $email]
        );

        return [$invitation, $token, $sent];
    }

    /** New token + fresh expiry + new email; the old link stops working. */
    public function resend(Invitation $invitation): array
    {
        $token = Str::random(48);
        $invitation->update(['token_hash' => Invitation::hashToken($token), 'expires_at' => now()->addDays(self::VALID_DAYS)]);

        return [$token, $this->send($invitation, $token)];
    }

    protected function send(Invitation $invitation, string $token): bool
    {
        try {
            Mail::to($invitation->email)->send(new InvitationMail($invitation->loadMissing('organization', 'invitedBy', 'dashboard'), self::url($token)));

            return true;
        } catch (Throwable $e) {
            // The link is still returned to the inviter to share another way (WhatsApp, Slack…).
            Log::warning('Invitation email failed: '.$e->getMessage());

            return false;
        }
    }

    /**
     * Grants what the invitation offers to $user. The account email must match the invited
     * address, so a forwarded link can't be used by someone else.
     */
    public function accept(Invitation $invitation, User $user): void
    {
        if ($invitation->accepted_at) {
            throw new HttpException(422, 'This invitation has already been used.');
        }
        if ($invitation->isExpired()) {
            throw new HttpException(422, 'This invitation has expired. Ask for a new one.');
        }
        if (Str::lower($user->email) !== Str::lower($invitation->email)) {
            throw new HttpException(403, "This invitation was sent to {$invitation->email}. Sign in with that email to accept it.");
        }

        DB::transaction(function () use ($invitation, $user) {
            $organization = $invitation->organization;

            if ($invitation->dashboard_id) {
                $dashboard = $invitation->dashboard;
                if ($dashboard && $dashboard->user_id !== $user->id) {
                    $dashboard->collaborators()->updateOrCreate(['user_id' => $user->id], ['role' => $invitation->dashboard_role ?? 'viewer']);
                }
            } else {
                // Never downgrade someone who is already a member with a role.
                if ($user->roleInOrganization($organization->id) === null) {
                    $organization->members()->attach($user->id, ['role' => $invitation->role ?? 'viewer']);
                }
                $user->forceFill(['current_organization_id' => $organization->id])->save();
            }

            $invitation->update(['accepted_at' => now(), 'accepted_by_id' => $user->id]);

            $this->auditLog->log($organization->id, $user->id, 'invitation.accepted', "{$user->email} accepted an invitation", $invitation);
        });
    }
}
