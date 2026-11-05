<?php

namespace App\Policies;

use App\Models\Dataset;
use App\Models\User;

class DatasetPolicy extends OrgResourcePolicy
{
    protected function organizationId(mixed $resource): int
    {
        return $resource->dataSource->organization_id;
    }

    /** Running notebook code over the dataset (any editing member of its organization). */
    public function query(User $user, Dataset $dataset): bool
    {
        return $user->canEditOrg($dataset->dataSource->organization_id);
    }

    /**
     * Row-level security rules: owners/admins only. An analyst can edit data, but must not be
     * able to lift the very policy that restricts their own role.
     */
    public function manageSecurity(User $user, Dataset $dataset): bool
    {
        return in_array($user->roleInOrganization($dataset->dataSource->organization_id), ['owner', 'admin'], true);
    }
}
