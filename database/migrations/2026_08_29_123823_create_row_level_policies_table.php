<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "owner" is deliberately not a valid role here — an org owner always sees everything,
     * matching the existing convention (canEditOrg/authorizeOwner) that owner is the one role
     * with no restrictions layered on top.
     */
    public function up(): void
    {
        Schema::create('row_level_policies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dataset_id')->constrained()->cascadeOnDelete();
            $table->enum('role', ['admin', 'analyst', 'viewer']);
            $table->string('field');
            $table->enum('operator', ['=', '!=', '>', '<', '>=', '<=', 'contains']);
            $table->string('value');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('row_level_policies');
    }
};
