<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_models', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // Every data model owns one synthetic DataSource (type 'data_model') so its output
            // dataset fits the existing Dataset -> DataSource -> Organization ownership chain
            // that row-level security, audit logging, and every chart consumer already rely on.
            $table->foreignId('data_source_id')->constrained()->cascadeOnDelete();
            $table->foreignId('output_dataset_id')->nullable()->constrained('datasets')->nullOnDelete();
            $table->string('name');
            $table->json('pipeline');
            $table->enum('schedule', ['manual', 'hourly', 'daily'])->default('manual');
            $table->timestamp('next_run_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->enum('status', ['pending', 'running', 'ready', 'failed'])->default('pending');
            $table->text('error_message')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_models');
    }
};
