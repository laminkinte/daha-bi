<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Alert extends Model
{
    use HasFactory;

    protected $fillable = [
        'chart_id',
        'user_id',
        'condition',
        'threshold',
        'sensitivity',
        'is_active',
        'last_status',
        'last_value',
        'last_checked_at',
        'last_notified_at',
    ];

    protected $attributes = [
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'threshold' => 'float',
            'sensitivity' => 'float',
            'last_value' => 'float',
            'is_active' => 'boolean',
            'last_checked_at' => 'datetime',
            'last_notified_at' => 'datetime',
        ];
    }

    public function chart(): BelongsTo
    {
        return $this->belongsTo(Chart::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
