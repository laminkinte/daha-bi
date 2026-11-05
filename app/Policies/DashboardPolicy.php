<?php

namespace App\Policies;

use App\Models\Dashboard;
use App\Models\Dataset;
use App\Models\User;

/**
 * Built on Dashboard::roleFor() (owner/editor/viewer from authorship, a per-dashboard
 * collaborator grant, or the user's organization role).
 */
class DashboardPolicy
{
    /** Any role may view, export, and read its schedules/goals/alerts. */
    public function view(User $user, Dashboard $dashboard): bool
    {
        return $dashboard->roleFor($user) !== null;
    }

    /** Owner or editor may change content: details, charts, schedules, AI-generated charts. */
    public function update(User $user, Dashboard $dashboard): bool
    {
        return in_array($dashboard->roleFor($user), ['owner', 'editor'], true);
    }

    /**
     * Deleting, sharing publicly, duplicating, and managing collaborators: the dashboard's
     * author, or an owner/admin of its organization.
     */
    public function manage(User $user, Dashboard $dashboard): bool
    {
        return $dashboard->user_id === $user->id
            || in_array($user->roleInOrganization($dashboard->organization_id), ['owner', 'admin'], true);
    }

    /** A dashboard may only chart data from its own organization. */
    public function useDataset(User $user, Dashboard $dashboard, Dataset $dataset): bool
    {
        return $this->update($user, $dashboard)
            && $dataset->dataSource->organization_id === $dashboard->organization_id;
    }
}
