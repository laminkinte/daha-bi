<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataModel extends Model
{
    protected $fillable = [
        'name',
        'pipeline',
        'schedule',
    ];

    protected function casts(): array
    {
        return [
            'pipeline' => 'array',
            'next_run_at' => 'datetime',
            'last_run_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function dataSource(): BelongsTo
    {
        return $this->belongsTo(DataSource::class);
    }

    public function outputDataset(): BelongsTo
    {
        return $this->belongsTo(Dataset::class, 'output_dataset_id');
    }
}
