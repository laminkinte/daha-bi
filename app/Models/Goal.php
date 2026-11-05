<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Goal extends Model
{
    protected $appends = ['progress_percent', 'is_achieved'];

    protected $fillable = [
        'organization_id',
        'chart_id',
        'user_id',
        'name',
        'direction',
        'starting_value',
        'target_value',
        'deadline',
        'last_value',
        'last_checked_at',
    ];

    protected function casts(): array
    {
        return [
            'starting_value' => 'float',
            'target_value' => 'float',
            'last_value' => 'float',
            'deadline' => 'date',
            'last_checked_at' => 'datetime',
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

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /**
     * 0-100, clamped. Measured from starting_value (a snapshot at creation), not zero — a KPI
     * rarely starts at zero, so "0% progress" should mean "no closer than when the goal was set."
     */
    public function progressPercent(): ?float
    {
        if ($this->last_value === null) {
            return null;
        }

        $start = $this->starting_value ?? 0.0;
        $span = $this->direction === 'increase'
            ? $this->target_value - $start
            : $start - $this->target_value;

        if (abs($span) < 0.0001) {
            return $this->isAchieved() ? 100.0 : 0.0;
        }

        $progressed = $this->direction === 'increase'
            ? $this->last_value - $start
            : $start - $this->last_value;

        return round(max(0.0, min(100.0, ($progressed / $span) * 100)), 1);
    }

    public function isAchieved(): bool
    {
        if ($this->last_value === null) {
            return false;
        }

        return $this->direction === 'increase'
            ? $this->last_value >= $this->target_value
            : $this->last_value <= $this->target_value;
    }

    public function getProgressPercentAttribute(): ?float
    {
        return $this->progressPercent();
    }

    public function getIsAchievedAttribute(): bool
    {
        return $this->isAchieved();
    }
}
