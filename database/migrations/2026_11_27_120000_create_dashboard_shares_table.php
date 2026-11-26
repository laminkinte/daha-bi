<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A dashboard shared with another company's whole workspace (read-only for them).
        Schema::create('dashboard_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dashboard_id')->constrained()->cascadeOnDelete();
            // The partner workspace; null until someone there accepts the share.
            $table->foreignId('organization_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('invited_email');
            // Rows the partner may see: [{field, operator, value}], ANDed. Null = all rows.
            $table->json('row_filters')->nullable();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('accepted_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'accepted_at']);
            $table->unique(['dashboard_id', 'organization_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_shares');
    }
};
