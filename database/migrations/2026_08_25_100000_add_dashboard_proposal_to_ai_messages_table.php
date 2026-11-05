<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_messages', function (Blueprint $table) {
            $table->string('dashboard_title')->nullable()->after('analysis');
            $table->json('dashboard_charts')->nullable()->after('dashboard_title');
            $table->foreignId('dashboard_id')->nullable()->after('chart_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ai_messages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('dashboard_id');
            $table->dropColumn(['dashboard_title', 'dashboard_charts']);
        });
    }
};
