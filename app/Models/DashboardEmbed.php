<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DashboardEmbed extends Model
{
    protected $fillable = [
        'dashboard_id',
        'organization_id',
        'dashboard_share_id',
        'name',
        'token_hash',
        'token_encrypted',
        'allowed_domains',
        'row_filters',
        'expires_at',
        'created_by_id',
    ];

    protected $hidden = ['token_hash', 'token_encrypted'];

    protected function casts(): array
    {
        return [
            // Encrypted (not just hashed) so admins can copy the embed code again later.
            'token_encrypted' => 'encrypted',
            'allowed_domains' => 'array',
            'row_filters' => 'array',
            'expires_at' => 'datetime',
            'last_viewed_at' => 'datetime',
        ];
    }

    public static function findByToken(string $token): ?self
    {
        return static::where('token_hash', hash('sha256', $token))->first();
    }

    /** Live = not expired, and (for a partner's embed) its company share still active. */
    public function isLive(): bool
    {
        if ($this->expires_at && $this->expires_at->isPast()) {
            return false;
        }
        if ($this->dashboard_share_id) {
            $share = $this->share;

            return $share && $share->accepted_at && $share->organization_id === $this->organization_id;
        }

        return true;
    }

    public function dashboard(): BelongsTo
    {
        return $this->belongsTo(Dashboard::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function share(): BelongsTo
    {
        return $this->belongsTo(DashboardShare::class, 'dashboard_share_id');
    }
}
