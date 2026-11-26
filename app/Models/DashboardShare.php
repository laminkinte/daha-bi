<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DashboardShare extends Model
{
    protected $fillable = [
        'dashboard_id',
        'organization_id',
        'invited_email',
        'row_filters',
        'token_hash',
        'expires_at',
        'accepted_at',
        'accepted_by_id',
        'created_by_id',
    ];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['row_filters' => 'array', 'expires_at' => 'datetime', 'accepted_at' => 'datetime'];
    }

    public static function findByToken(string $token): ?self
    {
        return static::where('token_hash', hash('sha256', $token))->first();
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNotNull('accepted_at')->whereNotNull('organization_id');
    }

    public function dashboard(): BelongsTo
    {
        return $this->belongsTo(Dashboard::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }
}
