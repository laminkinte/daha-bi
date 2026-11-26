<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comments', function (Blueprint $table) {
            // Which conversation a thread lives in: null = the owning company's internal discussion,
            // set = the conversation with that partner company (visible only to it and the owners).
            $table->foreignId('partner_organization_id')->nullable()->after('parent_id')
                ->constrained('organizations')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('comments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('partner_organization_id');
        });
    }
};
