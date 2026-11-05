<?php

namespace App\Policies;

use App\Models\Goal;
use App\Models\User;

/** Goals are organization-wide targets: anyone in the current organization may act on them. */
class GoalPolicy
{
    public function update(User $user, Goal $goal): bool
    {
        return $goal->organization_id === $user->current_organization_id;
    }

    public function delete(User $user, Goal $goal): bool
    {
        return $this->update($user, $goal);
    }
}
