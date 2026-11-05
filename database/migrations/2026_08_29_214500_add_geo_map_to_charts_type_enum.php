<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE charts MODIFY type ENUM('bar', 'line', 'pie', 'table', 'kpi', 'scatter', 'heatmap', 'geo_map') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE charts MODIFY type ENUM('bar', 'line', 'pie', 'table', 'kpi', 'scatter', 'heatmap') NOT NULL");
    }
};
