<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
}
