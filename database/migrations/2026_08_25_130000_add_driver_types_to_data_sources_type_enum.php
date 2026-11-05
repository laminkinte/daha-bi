<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE data_sources MODIFY type ENUM('csv', 'mysql', 'postgres', 'sqlserver') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE data_sources MODIFY type ENUM('csv', 'mysql') NOT NULL");
    }
};
