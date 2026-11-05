<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiMessage extends Model
{
    protected $fillable = [
        'conversation_id',
        'role',
        'content',
        'response_type',
        'chart_title',
        'chart_type',
        'chart_config',
        'chart_data',
        'analysis',
        'chart_id',
        'dashboard_title',
        'dashboard_charts',
        'dashboard_id',
    ];

    protected function casts(): array
    {
        return ['chart_config' => 'array', 'chart_data' => 'array', 'dashboard_charts' => 'array'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(AiConversation::class, 'conversation_id');
    }

    public function chart(): BelongsTo
    {
        return $this->belongsTo(Chart::class);
    }

    public function dashboard(): BelongsTo
    {
        return $this->belongsTo(Dashboard::class);
    }
}
