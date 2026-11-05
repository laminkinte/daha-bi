<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('chart_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            // 'increase': hitting the target means the value goes up to it (e.g. grow revenue).
            // 'decrease': hitting the target means the value goes down to it (e.g. cut costs).
            $table->enum('direction', ['increase', 'decrease']);
            // Snapshotted at creation — progress % is measured from here, not from zero, since a
            // KPI rarely starts at zero (e.g. "grow revenue from 50k to 100k" is 0% at 50k, not
            // a meaningless number relative to nothing).
            $table->decimal('starting_value', 20, 4)->nullable();
            $table->decimal('target_value', 20, 4);
            $table->date('deadline')->nullable();
            $table->decimal('last_value', 20, 4)->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goals');
    }
};
