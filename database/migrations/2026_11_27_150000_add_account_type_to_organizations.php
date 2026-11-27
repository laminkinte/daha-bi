<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a workspace is someone's personal account or a company's organization account.
 * Existing workspaces created by sign-up ("Name's workspace") become personal; everything else
 * (named after a company, or with several members) is an organization.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('account_type', 20)->default('organization')->after('name');
        });

        DB::table('organizations')
            ->where('name', 'like', "%'s workspace")
            ->whereRaw('(SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = organizations.id) <= 1')
            ->update(['account_type' => 'personal']);
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn('account_type');
        });
    }
};
