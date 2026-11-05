<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Arr;

class DataSource extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'organization_id',
        'name',
        'type',
        'status',
        'config',
        'error_message',
        'last_synced_at',
    ];

    // `config` holds the decrypted connection password — never serialize it directly.
    // `connection` (below) exposes the rest of it for editing without leaking the password.
    protected $hidden = ['config'];

    protected $appends = ['connection'];

    protected function casts(): array
    {
        return [
            'config' => 'encrypted:array',
            'last_synced_at' => 'datetime',
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getConnectionAttribute(): ?array
    {
        if ($this->type === 'csv' || ! $this->config) {
            return null;
        }

        return Arr::except($this->config, ['password', 'auth_token', 'basic_password']);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function datasets(): HasMany
    {
        return $this->hasMany(Dataset::class);
    }
}
