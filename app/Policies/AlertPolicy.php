<?php

namespace App\Policies;

use App\Models\Alert;
use App\Models\User;

/** Alerts are personal: each user manages only their own. */
class AlertPolicy
{
    public function delete(User $user, Alert $alert): bool
    {
        return $alert->user_id === $user->id;
    }
}
