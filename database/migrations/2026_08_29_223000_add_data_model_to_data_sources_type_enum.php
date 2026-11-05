<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE data_sources MODIFY type ENUM('csv', 'mysql', 'postgres', 'sqlserver', 'rest_api', 'data_model') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE data_sources MODIFY type ENUM('csv', 'mysql', 'postgres', 'sqlserver', 'rest_api') NOT NULL");
    }
};
