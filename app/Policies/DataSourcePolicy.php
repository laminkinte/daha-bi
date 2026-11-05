<?php

namespace App\Policies;

use App\Models\DataSource;
use App\Models\User;

class DataSourcePolicy extends OrgResourcePolicy
{
    protected function organizationId(mixed $resource): int
    {
        return $resource->organization_id;
    }

    /**
     * Running SQL against a live connection (notebook). Any editing member of the source's
     * organization, regardless of which organization is currently selected.
     */
    public function query(User $user, DataSource $dataSource): bool
    {
        return $user->canEditOrg($dataSource->organization_id);
    }
}
