<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class OrganizationController extends Controller
{
    public function __construct(protected AuditLogger $auditLog)
    {
    }

    public function index(Request $request)
    {
        return $request->user()->organizations()->get()->map(fn (Organization $org) => [
            'id' => $org->id,
            'name' => $org->name,
            'role' => $org->pivot->role,
        ]);
    }

    /**
     * Switches which organization the authenticated user is currently acting as — every
     * org-scoped endpoint (data sources, dashboards, ...) reads current_organization_id.
     */
    public function switch(Request $request)
    {
        $validated = $request->validate(['organization_id' => ['required', 'integer']]);

        $user = $request->user();
        abort_unless($user->roleInOrganization($validated['organization_id']) !== null, Response::HTTP_FORBIDDEN);

        $user->forceFill(['current_organization_id' => $validated['organization_id']])->save();

        return $user->fresh()->load('currentOrganization');
    }

    public function members(Request $request, Organization $organization)
    {
        $this->authorize('view', $organization);

        return $organization->members()->get(['users.id', 'users.name', 'users.email'])
            ->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'role' => $u->pivot->role,
            ]);
    }

    public function invite(Request $request, Organization $organization)
    {
        $this->authorize('manage', $organization);

        $validated = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', 'in:owner,admin,analyst,viewer'],
        ]);

        $invitee = User::where('email', $validated['email'])->first();

        if (! $invitee) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'No daha-bi account found with that email. They need to create an account first.');
        }

        $organization->members()->syncWithoutDetaching([$invitee->id => ['role' => $validated['role']]]);

        // A brand-new member has no other organization to work in yet — make this their active one.
        if (! $invitee->current_organization_id) {
            $invitee->forceFill(['current_organization_id' => $organization->id])->save();
        }

        $this->auditLog->log(
            $organization->id,
            $request->user()->id,
            'member.invited',
            "Invited {$invitee->email} as {$validated['role']}",
            $invitee,
            ['role' => $validated['role']]
        );

        return response()->json(['id' => $invitee->id, 'name' => $invitee->name, 'email' => $invitee->email, 'role' => $validated['role']], 201);
    }

    public function updateMember(Request $request, Organization $organization, User $member)
    {
        $this->authorize('manage', $organization);

        $validated = $request->validate(['role' => ['required', 'in:owner,admin,analyst,viewer']]);

        $this->guardLastOwner($organization, $member, $validated['role']);

        $organization->members()->updateExistingPivot($member->id, ['role' => $validated['role']]);

        $this->auditLog->log(
            $organization->id,
            $request->user()->id,
            'member.role_changed',
            "Changed {$member->email}'s role to {$validated['role']}",
            $member,
            ['role' => $validated['role']]
        );

        return response()->json(['id' => $member->id, 'role' => $validated['role']]);
    }

    public function removeMember(Request $request, Organization $organization, User $member)
    {
        $this->authorize('manage', $organization);

        $this->guardLastOwner($organization, $member, null);

        $organization->members()->detach($member->id);

        // A removed member can't be left pointing at an org they no longer belong to.
        if ($member->current_organization_id === $organization->id) {
            $fallback = $member->organizations()->first();
            $member->forceFill(['current_organization_id' => $fallback?->id])->save();
        }

        $this->auditLog->log($organization->id, $request->user()->id, 'member.removed', "Removed {$member->email}", $member);

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    public function update(Request $request, Organization $organization)
    {
        $this->authorize('manage', $organization);

        $validated = $request->validate(['name' => ['required', 'string', 'max:255']]);

        $oldName = $organization->name;
        $organization->update($validated);

        $this->auditLog->log(
            $organization->id,
            $request->user()->id,
            'organization.renamed',
            "Renamed organization from \"{$oldName}\" to \"{$organization->name}\""
        );

        return $organization;
    }

    /**
     * Blocks demoting/removing the organization's last remaining owner — every org must always
     * have at least one owner able to manage billing and membership.
     */
    protected function guardLastOwner(Organization $organization, User $member, ?string $newRole): void
    {
        $currentRole = $organization->members()->where('users.id', $member->id)->first()?->pivot->role;

        if ($currentRole !== 'owner' || $newRole === 'owner') {
            return;
        }

        $ownerCount = $organization->members()->wherePivot('role', 'owner')->count();

        abort_if($ownerCount <= 1, Response::HTTP_UNPROCESSABLE_ENTITY, 'An organization must have at least one owner.');
    }
}
