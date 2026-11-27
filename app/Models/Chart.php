<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Chart extends Model
{
    use HasFactory;

    /** Every visual a chart can be. The data shape each one gets is decided in ChartDataService::run(). */
    public const TYPES = [
        'bar', 'line', 'pie', 'table', 'kpi', 'scatter', 'heatmap', 'geo_map',
        'gauge', 'list', 'funnel', 'treemap', 'radar', 'feed',
    ];

    protected $fillable = [
        'dashboard_id',
        'dataset_id',
        'title',
        'type',
        'config',
        'filters',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'config' => 'array',
            'filters' => 'array',
            'position' => 'array',
        ];
    }

    public function dashboard(): BelongsTo
    {
        return $this->belongsTo(Dashboard::class);
    }

    public function dataset(): BelongsTo
    {
        return $this->belongsTo(Dataset::class);
    }

    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }

    public function goals(): HasMany
    {
        return $this->hasMany(Goal::class);
    }
}
