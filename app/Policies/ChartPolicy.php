<?php

namespace App\Policies;

use App\Models\Chart;
use App\Models\User;

/** A chart has no access rules of its own: it inherits its dashboard's. */
class ChartPolicy
{
    public function __construct(protected DashboardPolicy $dashboards)
    {
    }

    public function view(User $user, Chart $chart): bool
    {
        return $this->dashboards->view($user, $chart->dashboard);
    }

    public function update(User $user, Chart $chart): bool
    {
        return $this->dashboards->update($user, $chart->dashboard);
    }
}
