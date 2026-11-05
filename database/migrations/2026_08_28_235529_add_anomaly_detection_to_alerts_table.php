<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE alerts MODIFY `condition` ENUM('above', 'below', 'anomaly') NOT NULL");

        Schema::table('alerts', function (Blueprint $table) {
            $table->decimal('threshold', 20, 4)->nullable()->change();
            // Standard-deviation multiplier for anomaly alerts (unused for above/below); 2.5 is a
            // reasonable default — flags genuinely unusual points without false-triggering on normal noise.
            $table->decimal('sensitivity', 6, 2)->nullable()->default(2.5)->after('threshold');
        });
    }

    public function down(): void
    {
        Schema::table('alerts', function (Blueprint $table) {
            $table->dropColumn('sensitivity');
        });

        DB::statement("ALTER TABLE alerts MODIFY `condition` ENUM('above', 'below') NOT NULL");

        Schema::table('alerts', function (Blueprint $table) {
            $table->decimal('threshold', 20, 4)->nullable(false)->change();
        });
    }
};
