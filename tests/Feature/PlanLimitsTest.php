<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Every plan includes every feature; plans differ only in dashboards (Free 15, Growth 20,
 * Business unlimited). Nothing is deleted when over a limit.
 */
class PlanLimitsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        Mail::fake();
    }

    protected function fill(User $user, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $user->dashboards()->create(['name' => "D{$i}", 'organization_id' => $user->current_organization_id]);
        }
    }

    public function test_free_workspace_gets_fifteen_dashboards(): void
    {
        [$user, $token] = $this->registerUser('Free', null, 'free');
        $this->fill($user, 14);

        $this->asToken($token)->postJson('/api/dashboards', ['name' => 'Fifteenth'])->assertCreated();
        $this->asToken($token)->postJson('/api/dashboards', ['name' => 'Sixteenth'])
            ->assertStatus(402)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Free plan includes 15 dashboards'));

        // Duplicating counts too.
        $id = $user->dashboards()->first()->id;
        $this->asToken($token)->postJson("/api/dashboards/{$id}/duplicate")->assertStatus(402);
    }

    public function test_growth_gets_twenty_and_business_is_unlimited(): void
    {
        [$grow, $growToken] = $this->registerUser('Grow', null, 'growth');
        $this->fill($grow, 19);
        $this->asToken($growToken)->postJson('/api/dashboards', ['name' => '20th'])->assertCreated();
        $this->asToken($growToken)->postJson('/api/dashboards', ['name' => '21st'])->assertStatus(402);

        [$biz, $bizToken] = $this->registerUser('Biz', null, 'business');
        $this->fill($biz, 40);
        $this->asToken($bizToken)->postJson('/api/dashboards', ['name' => '41st'])->assertCreated();
    }

    public function test_every_feature_is_on_for_free(): void
    {
        [$user, $token] = $this->registerUser('Free', null, 'free');
        $org = $user->currentOrganization;

        foreach (['ai', 'notebook', 'database_sources', 'branding'] as $feature) {
            $this->assertTrue($org->planAllows($feature), $feature);
        }
        $this->assertNull($org->planLimit('users'));
        $this->assertNull($org->planLimit('share_links'));

        $this->asToken($token)->postJson("/api/organizations/{$org->id}/members", ['email' => 'mate@example.com', 'role' => 'viewer'])->assertStatus(202);
        $this->asToken($token)->getJson('/api/user')
            ->assertJsonPath('current_organization.plan_usage.plan', 'free')
            ->assertJsonPath('current_organization.plan_usage.limits.dashboards', 15);
    }

    public function test_lapsed_plans_fall_back_to_free_and_admins_are_never_limited(): void
    {
        $org = new Organization(['name' => 'X']);
        $org->forceFill(['plan' => 'business', 'plan_status' => 'trialing', 'trial_ends_at' => now()->subDay()]);
        $this->assertSame('free', $org->effectivePlan());
        $org->forceFill(['plan_status' => 'canceled', 'current_period_end' => now()->addDays(3)]);
        $this->assertSame('business', $org->effectivePlan());
        $org->forceFill(['plan_status' => 'past_due']);
        $this->assertSame('business', $org->effectivePlan());

        [$admin, $token] = $this->registerUser('Admin', null, 'free');
        $admin->forceFill(['is_admin' => true])->save();
        $this->fill($admin, 15);
        $this->asToken($token)->postJson('/api/dashboards', ['name' => '16th'])->assertCreated();
    }

    public function test_signup_can_be_a_personal_or_an_organization_account(): void
    {
        $this->postJson('/api/register', ['name' => 'Ada', 'email' => 'ada@example.com', 'password' => 'password123'])
            ->assertCreated()
            ->assertJsonPath('user.current_organization.name', 'Ada (Personal)')
            ->assertJsonPath('user.current_organization.account_type', 'personal');

        $this->postJson('/api/register', [
            'name' => 'Bo', 'email' => 'bo@example.com', 'password' => 'password123',
            'account_type' => 'organization', 'organization_name' => 'Acme Ltd',
        ])->assertCreated()
            ->assertJsonPath('user.current_organization.name', 'Acme Ltd')
            ->assertJsonPath('user.current_organization.account_type', 'organization');

        $this->postJson('/api/register', [
            'name' => 'Cy', 'email' => 'cy@example.com', 'password' => 'password123', 'account_type' => 'organization',
        ])->assertUnprocessable()->assertJsonValidationErrors('organization_name');
    }
}
