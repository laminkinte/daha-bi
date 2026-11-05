<?php

namespace App\Policies;

use App\Models\User;

class DataModelPolicy extends OrgResourcePolicy
{
    protected function organizationId(mixed $resource): int
    {
        return $resource->organization_id;
    }

    public function create(User $user): bool
    {
        return $user->canEditOrg($user->current_organization_id);
    }
}
