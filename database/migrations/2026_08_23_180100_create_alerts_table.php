<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chart_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('condition', ['above', 'below']);
            $table->decimal('threshold', 20, 4);
            $table->boolean('is_active')->default(true);
            $table->enum('last_status', ['ok', 'breached'])->nullable();
            $table->decimal('last_value', 20, 4)->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamp('last_notified_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('alerts');
    }
};
