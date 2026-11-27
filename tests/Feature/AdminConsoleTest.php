<?php

namespace Tests\Feature;

use App\Models\AdminAction;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/** The super-admin console: overview, user lifecycle, workspace plans, health and the action log. */
class AdminConsoleTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected string $adminToken;

    protected function setUp(): void
    {
        parent::setUp();
        [$this->admin, $this->adminToken] = $this->registerUser('Root Admin');
        $this->admin->forceFill(['is_admin' => true])->save();
    }

    public function test_only_super_admins_reach_the_console(): void
    {
        [, $token] = $this->registerUser('Normal');
        foreach (['/api/admin/overview', '/api/admin/health', '/api/admin/actions', '/api/admin/organizations'] as $url) {
            $this->asToken($token)->getJson($url)->assertForbidden();
            $this->asToken($this->adminToken)->getJson($url)->assertOk();
        }

        $this->asToken($this->adminToken)->getJson('/api/admin/overview')
            ->assertJsonPath('kpis.users', 2)
            ->assertJsonCount(30, 'signups_30d')
            ->assertJsonStructure(['plan_mix', 'recent_users', 'health' => [['key', 'label', 'status', 'detail']]]);
    }

    public function test_suspending_blocks_login_and_kills_sessions_then_reactivates(): void
    {
        [$user, $userToken] = $this->registerUser('Troublemaker', 'bad@example.com');
        $this->asToken($userToken)->getJson('/api/user')->assertOk();

        $this->asToken($this->adminToken)->postJson("/api/admin/users/{$user->id}/suspend", ['reason' => 'Spam'])
            ->assertOk()->assertJsonPath('user.suspended_reason', 'Spam');

        $this->app['auth']->forgetGuards();
        $this->asToken($userToken)->getJson('/api/user')->assertUnauthorized(); // token revoked
        $this->postJson('/api/login', ['email' => 'bad@example.com', 'password' => 'password123'])->assertStatus(422);

        $this->asToken($this->adminToken)->postJson("/api/admin/users/{$user->id}/unsuspend")->assertOk();
        $this->postJson('/api/login', ['email' => 'bad@example.com', 'password' => 'password123'])->assertOk();

        // Admins can't be suspended (revoke first), nor can you suspend yourself.
        $this->asToken($this->adminToken)->postJson("/api/admin/users/{$this->admin->id}/suspend")->assertStatus(422);

        $this->assertSame(['user.suspended', 'user.unsuspended'], AdminAction::orderBy('id')->pluck('action')->all());
    }

    public function test_user_detail_plan_changes_and_password_reset_are_logged(): void
    {
        Notification::fake();
        [$user] = $this->registerUser('Partner Lead', 'lead@partner.test');
        $orgId = $user->current_organization_id;

        $this->asToken($this->adminToken)->getJson("/api/admin/users/{$user->id}")
            ->assertOk()->assertJsonPath('workspaces.0.role', 'owner')->assertJsonStructure(['counts' => ['dashboards', 'active_sessions']]);

        $this->asToken($this->adminToken)->putJson("/api/admin/organizations/{$orgId}/plan", [
            'plan' => 'business', 'plan_status' => 'trialing', 'trial_days' => 30, 'note' => 'Pilot partner',
        ])->assertOk()->assertJsonPath('plan', 'business')->assertJsonPath('plan_status', 'trialing');
        $this->assertTrue(Organization::find($orgId)->trial_ends_at->isFuture());

        $this->asToken($this->adminToken)->putJson("/api/admin/organizations/{$orgId}/plan", ['plan' => 'platinum', 'plan_status' => 'active'])->assertStatus(422);

        $this->asToken($this->adminToken)->postJson("/api/admin/users/{$user->id}/password-reset")->assertOk();

        $this->asToken($this->adminToken)->getJson('/api/admin/actions')->assertOk()
            ->assertJsonPath('0.action', 'user.password_reset_sent')
            ->assertJsonPath('1.action', 'workspace.plan_changed')
            ->assertJsonPath('1.metadata.note', 'Pilot partner');
    }
}
