<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Nullable for now — backfilled by the `orgs:backfill` command, then constrained to NOT NULL
     * in a follow-up migration once every existing row has been assigned an organization.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('current_organization_id')->nullable()->after('id')
                ->constrained('organizations')->nullOnDelete();
        });

        Schema::table('data_sources', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable()->after('user_id')
                ->constrained()->cascadeOnDelete();
        });

        Schema::table('dashboards', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable()->after('user_id')
                ->constrained()->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('dashboards', function (Blueprint $table) {
            $table->dropConstrainedForeignId('organization_id');
        });

        Schema::table('data_sources', function (Blueprint $table) {
            $table->dropConstrainedForeignId('organization_id');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('current_organization_id');
        });
    }
};
