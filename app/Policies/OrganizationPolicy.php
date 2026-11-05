<?php

namespace App\Policies;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class OrganizationPolicy
{
    public function view(User $user, Organization $organization): bool
    {
        return $user->roleInOrganization($organization->id) !== null;
    }

    /** Settings, members, audit log. */
    public function manage(User $user, Organization $organization): bool
    {
        return in_array($user->roleInOrganization($organization->id), ['owner', 'admin'], true);
    }

    public function manageBilling(User $user, Organization $organization): Response
    {
        return $this->manage($user, $organization)
            ? Response::allow()
            : Response::deny('Only an organization owner or admin can manage billing.');
    }
}
