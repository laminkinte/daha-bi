<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Organization extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'brand_name', 'brand_color', 'brand_hide_powered_by'];

    /** Every serialized organization carries its branding, so the app can theme itself. */
    protected $appends = ['branding'];

    protected $hidden = ['brand_logo_path'];

    public function getBrandingAttribute(): array
    {
        return $this->branding();
    }

    protected function casts(): array
    {
        return [
            // Billing fields are deliberately not $fillable — same convention as User previously
            // used for these exact fields: only BillingController/StripeService/PaystackService
            // may write them, via forceFill.
            'trial_ends_at' => 'datetime',
            'subscribed_at' => 'datetime',
            'current_period_end' => 'datetime',
        ];
    }

    /**
     * White-label settings, safe to show publicly (on embeds and shared dashboards). The logo is
     * served through an API route (no public-storage symlink needed); the query string busts caches.
     *
     * @return array{name: string, color: string|null, logo_url: string|null, hide_powered_by: bool}
     */
    public function branding(): array
    {
        return [
            'name' => $this->brand_name ?: $this->name,
            'color' => $this->brand_color,
            'logo_url' => $this->brand_logo_path
                ? url("/api/public/brand-logo/{$this->id}").'?v='.substr(md5($this->brand_logo_path), 0, 8)
                : null,
            'hide_powered_by' => (bool) $this->brand_hide_powered_by,
        ];
    }

    public function dataSources(): HasMany
    {
        return $this->hasMany(DataSource::class);
    }

    public function dashboards(): HasMany
    {
        return $this->hasMany(Dashboard::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'organization_members')->withPivot('role')->withTimestamps();
    }

    /* ───────────────────────────── plan limits ───────────────────────────── */

    /**
     * The plan the workspace actually gets right now. A paid plan counts while it's active or in
     * its payment grace period (past_due), during an unexpired trial, or — once cancelled — until
     * the end of the period already paid for. Anything else is "free".
     */
    public function effectivePlan(): string
    {
        if (! in_array($this->plan, ['growth', 'business'], true)) {
            return 'free';
        }

        return match ($this->plan_status) {
            'active', 'past_due' => $this->plan,
            'trialing' => $this->trial_ends_at?->isFuture() ? $this->plan : 'free',
            'canceled' => $this->current_period_end?->isFuture() ? $this->plan : 'free',
            default => 'free',
        };
    }

    /** A limit from config/plans.php: an int (null = unlimited) or a feature flag. */
    public function planLimit(string $key): int|bool|null
    {
        return config('plans.'.$this->effectivePlan().'.'.$key);
    }

    public function planAllows(string $feature): bool
    {
        return (bool) $this->planLimit($feature);
    }

    /** People using the workspace: members, guests on its dashboards, and invitations still pending. */
    public function seatsUsed(): int
    {
        $userIds = $this->members()->pluck('users.id')
            ->merge(DB::table('dashboard_collaborators')
                ->join('dashboards', 'dashboards.id', '=', 'dashboard_collaborators.dashboard_id')
                ->where('dashboards.organization_id', $this->id)
                ->pluck('dashboard_collaborators.user_id'))
            ->unique();
        $pending = Invitation::pending()->where('organization_id', $this->id)->distinct()->count('email');

        return $userIds->count() + $pending;
    }

    public function shareLinksUsed(): int
    {
        return $this->dashboards()->where('is_shared', true)->count();
    }

    /** Usage next to each limit, for the settings page and upgrade prompts. */
    public function planUsage(): array
    {
        return [
            'plan' => $this->effectivePlan(),
            'limits' => config('plans.'.$this->effectivePlan()),
            'usage' => [
                'users' => $this->seatsUsed(),
                'dashboards' => $this->dashboards()->count(),
                'share_links' => $this->shareLinksUsed(),
            ],
        ];
    }
}
