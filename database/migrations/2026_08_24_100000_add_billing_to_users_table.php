<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('plan', ['free', 'growth', 'business'])->default('free')->after('is_admin');
            $table->enum('plan_status', ['active', 'trialing', 'past_due', 'canceled'])->default('active')->after('plan');
            $table->timestamp('trial_ends_at')->nullable()->after('plan_status');
            $table->timestamp('subscribed_at')->nullable()->after('trial_ends_at');
            $table->timestamp('current_period_end')->nullable()->after('subscribed_at');
            $table->string('paystack_customer_code')->nullable()->after('current_period_end');
            $table->string('paystack_authorization_code')->nullable()->after('paystack_customer_code');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'plan',
                'plan_status',
                'trial_ends_at',
                'subscribed_at',
                'current_period_end',
                'paystack_customer_code',
                'paystack_authorization_code',
            ]);
        });
    }
};
