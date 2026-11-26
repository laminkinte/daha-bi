<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Dashboard extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'organization_id',
        'name',
        'description',
        'settings',
        'share_token',
        'is_shared',
    ];

    protected function casts(): array
    {
        return [
            'is_shared' => 'boolean',
            'settings' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function charts(): HasMany
    {
        return $this->hasMany(Chart::class);
    }

    public function collaborators(): HasMany
    {
        return $this->hasMany(DashboardCollaborator::class);
    }

    public function reportSchedules(): HasMany
    {
        return $this->hasMany(ReportSchedule::class);
    }

    /**
     * Role of the given user on this dashboard: 'owner', 'editor', 'viewer', or null if no access.
     * A per-dashboard collaborator grant is a supplementary override on top of the user's
     * organization role — checked first, so e.g. a guest can be invited to one dashboard without
     * becoming an org member, or an org viewer can be granted edit access to a specific dashboard.
     */
    public function roleFor(User $user): ?string
    {
        if ($this->user_id === $user->id) {
            return 'owner';
        }

        if ($role = $this->collaborators()->where('user_id', $user->id)->value('role')) {
            return $role;
        }

        return match ($user->roleInOrganization($this->organization_id)) {
            'owner', 'admin', 'analyst' => 'editor',
            'viewer' => 'viewer',
            // Not in the owning company: a member of a partner workspace this dashboard was shared with reads it.
            default => $this->sharedWithUser($user) ? 'viewer' : null,
        };
    }

    public function shares(): HasMany
    {
        return $this->hasMany(DashboardShare::class);
    }

    /** Whether any workspace the user belongs to has an accepted share of this dashboard. */
    public function sharedWithUser(User $user): bool
    {
        return $this->shares()->active()
            ->whereIn('organization_id', $user->organizations()->pluck('organizations.id'))
            ->exists();
    }
}
