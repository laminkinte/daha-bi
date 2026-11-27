<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * charts.type was a MySQL ENUM that needed a migration for every new visual. It is now a plain
 * string; the allowed values live in App\Models\Chart::TYPES and are enforced by validation.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE charts MODIFY type VARCHAR(32) NOT NULL');
    }

    public function down(): void
    {
        DB::table('charts')->whereNotIn('type', ['bar', 'line', 'pie', 'table', 'kpi', 'scatter', 'heatmap', 'geo_map'])->delete();
        DB::statement("ALTER TABLE charts MODIFY type ENUM('bar', 'line', 'pie', 'table', 'kpi', 'scatter', 'heatmap', 'geo_map') NOT NULL");
    }
};
