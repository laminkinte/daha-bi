<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run only after `orgs:backfill` has confirmed every existing row has an organization —
     * see the nullable columns added in add_organization_to_users_and_resources_table.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // nullOnDelete() (set when the column was first added) can't coexist with NOT NULL —
            // swap it for restrictOnDelete(): an organization can't be deleted while a user still
            // has it as their current org (they'd need to switch orgs first).
            $table->dropForeign(['current_organization_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('current_organization_id')->nullable(false)->change();
            $table->foreign('current_organization_id')->references('id')->on('organizations')->restrictOnDelete();
        });

        Schema::table('data_sources', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable(false)->change();
        });

        Schema::table('dashboards', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('dashboards', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable()->change();
        });

        Schema::table('data_sources', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable()->change();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['current_organization_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('current_organization_id')->nullable()->change();
            $table->foreign('current_organization_id')->references('id')->on('organizations')->nullOnDelete();
        });
    }
};
