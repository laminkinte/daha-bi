<?php

namespace App\Policies;

use App\Models\User;

/**
 * Shared rules for resources owned by an organization (data sources, datasets, data models,
 * goals). Visible only while that organization is the user's *current* one; writable by
 * owner/admin/analyst members (not viewers).
 */
abstract class OrgResourcePolicy
{
    abstract protected function organizationId(mixed $resource): int;

    public function view(User $user, mixed $resource): bool
    {
        return $this->organizationId($resource) === $user->current_organization_id;
    }

    public function update(User $user, mixed $resource): bool
    {
        return $this->view($user, $resource) && $user->canEditOrg($this->organizationId($resource));
    }

    /** Destructive actions follow the same rule as editing. */
    public function delete(User $user, mixed $resource): bool
    {
        return $this->update($user, $resource);
    }
}
