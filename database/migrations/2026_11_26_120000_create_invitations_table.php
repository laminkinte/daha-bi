<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invited_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('email');
            // Workspace role (owner/admin/analyst/viewer) — null for a single-dashboard invite.
            $table->string('role')->nullable();
            // Set for a guest invite to one dashboard; dashboard_role is viewer/editor.
            $table->foreignId('dashboard_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('dashboard_role')->nullable();
            // Only a SHA-256 of the link token is stored; the token itself lives only in the email/link.
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('accepted_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'accepted_at']);
            $table->index('email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
