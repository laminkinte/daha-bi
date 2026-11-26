<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // White-label: how a workspace presents itself on its app, shared and embedded dashboards.
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('brand_name')->nullable()->after('name');
            $table->string('brand_logo_path')->nullable()->after('brand_name');
            $table->string('brand_color', 7)->nullable()->after('brand_logo_path');
            $table->boolean('brand_hide_powered_by')->default(false)->after('brand_color');
        });

        // A dashboard placed inside another website/app through an iframe.
        Schema::create('dashboard_embeds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dashboard_id')->constrained()->cascadeOnDelete();
            // The workspace that owns the embed: the dashboard's company, or a partner it was shared with.
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            // Set for a partner's embed: that share's (current) row filters always apply too.
            $table->foreignId('dashboard_share_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('token_hash', 64)->unique();
            $table->text('token_encrypted');
            $table->json('allowed_domains')->nullable();
            $table->json('row_filters')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->unsignedInteger('view_count')->default(0);
            $table->timestamp('last_viewed_at')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_embeds');
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn(['brand_name', 'brand_logo_path', 'brand_color', 'brand_hide_powered_by']);
        });
    }
};
