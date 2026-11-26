<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Comment extends Model
{
    protected $fillable = [
        'dashboard_id',
        'chart_id',
        'user_id',
        'parent_id',
        'body',
        'mentions',
        'resolved_at',
        'resolved_by_id',
        'edited_at',
    ];

    protected function casts(): array
    {
        return ['mentions' => 'array', 'resolved_at' => 'datetime', 'edited_at' => 'datetime'];
    }

    public function dashboard(): BelongsTo
    {
        return $this->belongsTo(Dashboard::class);
    }

    public function chart(): BelongsTo
    {
        return $this->belongsTo(Chart::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Comment::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(Comment::class, 'parent_id')->oldest();
    }
}
