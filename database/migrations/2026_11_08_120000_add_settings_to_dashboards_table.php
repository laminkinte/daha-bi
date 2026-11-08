<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Per-dashboard presentation settings, e.g. which fields appear as filter slicers. */
    public function up(): void
    {
        Schema::table('dashboards', function (Blueprint $table) {
            $table->json('settings')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('dashboards', function (Blueprint $table) {
            $table->dropColumn('settings');
        });
    }
};
