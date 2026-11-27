<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminAction extends Model
{
    protected $fillable = ['admin_id', 'action', 'description', 'target_type', 'target_id', 'metadata', 'ip_address'];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }

    public static function record(User $admin, string $action, string $description, ?Model $target = null, array $metadata = []): self
    {
        return static::create([
            'admin_id' => $admin->id,
            'action' => $action,
            'description' => $description,
            'target_type' => $target ? class_basename($target) : null,
            'target_id' => $target?->getKey(),
            'metadata' => $metadata ?: null,
            'ip_address' => request()?->ip(),
        ]);
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
