<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dashboard;
use App\Models\Invitation;
use App\Models\Organization;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\InvitationService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InvitationController extends Controller
{
    public function __construct(protected InvitationService $invitations, protected AuditLogger $auditLog)
    {
    }

    /** Pending workspace invitations (dashboard guest invites are listed per dashboard). */
    public function index(Request $request, Organization $organization)
    {
        $this->authorize('manage', $organization);

        return $this->present(Invitation::pending()
            ->where('organization_id', $organization->id)
            ->whereNull('dashboard_id')
            ->with('invitedBy:id,name')
            ->latest()
            ->get());
    }

    public function forDashboard(Request $request, Dashboard $dashboard)
    {
        $this->authorize('manage', $dashboard);

        return $this->present(Invitation::pending()
            ->where('dashboard_id', $dashboard->id)
            ->with('invitedBy:id,name')
            ->latest()
            ->get());
    }

    public function resend(Request $request, Invitation $invitation)
    {
        $this->authorizeInvitation($invitation);
        abort_if($invitation->accepted_at, Response::HTTP_UNPROCESSABLE_ENTITY, __('This invitation has already been accepted.'));

        [$token, $sent] = $this->invitations->resend($invitation);

        return response()->json(['invite_url' => InvitationService::url($token), 'email_sent' => $sent] + $this->present(collect([$invitation->fresh()]))[0]);
    }

    public function destroy(Request $request, Invitation $invitation)
    {
        $this->authorizeInvitation($invitation);

        $invitation->delete();
        $this->auditLog->log($invitation->organization_id, $request->user()->id, 'invitation.revoked', "Revoked the invitation for {$invitation->email}");

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /**
     * Public preview for the /invite/{token} page — enough to say who invited you to what,
     * never anything about the workspace's data.
     */
    public function preview(string $token)
    {
        $invitation = Invitation::findByToken($token);
        abort_unless($invitation, Response::HTTP_NOT_FOUND, __('This invitation link is not valid. It may have been revoked or replaced by a newer one.'));

        return [
            'email' => $invitation->email,
            'organization' => $invitation->organization->name,
            'dashboard' => $invitation->dashboard?->name,
            'dashboard_id' => $invitation->dashboard_id,
            'role' => $invitation->dashboard_role ?? $invitation->role,
            'invited_by' => $invitation->invitedBy?->name,
            'status' => $invitation->accepted_at ? 'accepted' : ($invitation->isExpired() ? 'expired' : 'pending'),
            'expires_at' => $invitation->expires_at,
            'has_account' => User::whereRaw('LOWER(email) = ?', [$invitation->email])->exists(),
        ];
    }

    public function accept(Request $request, string $token)
    {
        $invitation = Invitation::findByToken($token);
        abort_unless($invitation, Response::HTTP_NOT_FOUND, __('This invitation link is not valid.'));

        $this->invitations->accept($invitation, $request->user());

        return [
            'organization_id' => $invitation->organization_id,
            'dashboard_id' => $invitation->dashboard_id,
            'user' => $request->user()->fresh()->load('currentOrganization'),
        ];
    }

    protected function authorizeInvitation(Invitation $invitation): void
    {
        if ($invitation->dashboard_id && $invitation->dashboard) {
            $this->authorize('manage', $invitation->dashboard);
        } else {
            $this->authorize('manage', $invitation->organization);
        }
    }

    protected function present($invitations): array
    {
        return $invitations->map(fn (Invitation $i) => [
            'id' => $i->id,
            'email' => $i->email,
            'role' => $i->dashboard_role ?? $i->role,
            'invited_by' => $i->invitedBy?->name,
            'expires_at' => $i->expires_at,
            'expired' => $i->isExpired(),
            'created_at' => $i->created_at,
        ])->values()->all();
    }
}
