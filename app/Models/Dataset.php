<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Dataset extends Model
{
    use HasFactory;

    protected $fillable = [
        'data_source_id',
        'name',
        'columns',
        'row_count',
    ];

    protected function casts(): array
    {
        return [
            'columns' => 'array',
        ];
    }

    public function dataSource(): BelongsTo
    {
        return $this->belongsTo(DataSource::class);
    }

    public function rows(): HasMany
    {
        return $this->hasMany(DatasetRow::class);
    }

    public function charts(): HasMany
    {
        return $this->hasMany(Chart::class);
    }

    public function rowLevelPolicies(): HasMany
    {
        return $this->hasMany(RowLevelPolicy::class);
    }
}
