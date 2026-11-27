<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** The pricing page's limits are enforced on the server; nothing is deleted when over a limit. */
class PlanLimitsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        Mail::fake();
    }

    protected function csv(string $token): int
    {
        $this->asToken($token)->post('/api/data-sources', [
            'type' => 'csv', 'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('s.csv', "city,revenue\nLagos,10\nAccra,5\n"),
        ], ['Accept' => 'application/json'])->assertCreated();

        return $this->asToken($token)->getJson('/api/datasets')->json('0.id');
    }

    public function test_free_workspace_gets_three_dashboards_one_share_link_and_one_user(): void
    {
        [, $token] = $this->registerUser('Free', null, 'free');

        $ids = [];
        foreach ([1, 2, 3] as $i) {
            $ids[] = $this->asToken($token)->postJson('/api/dashboards', ['name' => "D{$i}"])->assertCreated()->json('id');
        }
        $this->asToken($token)->postJson('/api/dashboards', ['name' => 'D4'])
            ->assertStatus(402)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Free plan includes 3 dashboards'));

        $this->asToken($token)->postJson("/api/dashboards/{$ids[0]}/share")->assertOk();
        $this->asToken($token)->postJson("/api/dashboards/{$ids[0]}/share")->assertOk(); // re-sharing the same one is fine
        $this->asToken($token)->postJson("/api/dashboards/{$ids[1]}/share")->assertStatus(402);

        $orgId = User::where('name', 'Free')->first()->current_organization_id;
        $this->asToken($token)->postJson("/api/organizations/{$orgId}/members", ['email' => 'mate@example.com', 'role' => 'viewer'])->assertStatus(402);
        $this->asToken($token)->postJson("/api/dashboards/{$ids[0]}/collaborators", ['email' => 'guest@example.com', 'role' => 'viewer'])->assertStatus(402);
    }

    public function test_free_workspace_cannot_use_paid_features_but_csv_works(): void
    {
        [$user, $token] = $this->registerUser('Free', null, 'free');
        $datasetId = $this->csv($token);
        $dashboardId = $this->asToken($token)->postJson('/api/dashboards', ['name' => 'D'])->json('id');

        $this->asToken($token)->postJson('/api/data-sources', ['type' => 'mysql', 'name' => 'DB'])->assertStatus(402);
        $this->asToken($token)->postJson("/api/datasets/{$datasetId}/notebook/python", ['code' => 'print(1)'])->assertStatus(402);
        $this->asToken($token)->postJson("/api/dashboards/{$dashboardId}/ai-prompt", ['prompt' => 'hi'])->assertStatus(402);
        $conv = $this->asToken($token)->postJson('/api/ai-conversations', ['dataset_id' => $datasetId])->json('id');
        $this->asToken($token)->postJson("/api/ai-conversations/{$conv}/messages", ['content' => 'hi'])
            ->assertStatus(402)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Business plan'));
        $this->asToken($token)->postJson("/api/organizations/{$user->current_organization_id}/branding", ['brand_color' => '#112233'])->assertStatus(402);

        $this->asToken($token)->getJson('/api/user')
            ->assertJsonPath('current_organization.plan_usage.plan', 'free')
            ->assertJsonPath('current_organization.plan_usage.limits.dashboards', 3)
            ->assertJsonPath('current_organization.plan_usage.usage.dashboards', 1);
    }

    public function test_growth_unlocks_notebook_and_databases_but_not_ai(): void
    {
        [$user, $token] = $this->registerUser('Grow', null, 'growth');
        $org = $user->currentOrganization;

        $this->assertTrue($org->planAllows('notebook'));
        $this->assertTrue($org->planAllows('database_sources'));
        $this->assertFalse($org->planAllows('ai'));
        $this->assertSame(5, $org->planLimit('users'));
        foreach ([1, 2, 3, 4] as $i) {
            $this->asToken($token)->postJson('/api/dashboards', ['name' => "D{$i}"])->assertCreated();
        }
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
        foreach ([1, 2, 3, 4] as $i) {
            $this->asToken($token)->postJson('/api/dashboards', ['name' => "D{$i}"])->assertCreated();
        }
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
