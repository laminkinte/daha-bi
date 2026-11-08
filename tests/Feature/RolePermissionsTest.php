<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Pins down what each organization role may do. These are the rules in app/Policies;
 * a failure here means a permission changed, not just a refactor.
 */
class RolePermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected string $ownerToken;

    protected int $dashboardId;

    protected int $datasetId;

    protected int $sourceId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();

        [$this->owner, $this->ownerToken] = $this->registerUser('Owner');

        $this->asToken($this->ownerToken)->post('/api/data-sources', [
            'type' => 'csv',
            'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('s.csv', "city,revenue\nLagos,100\n"),
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->sourceId = $this->asToken($this->ownerToken)->getJson('/api/data-sources')->json('0.id');
        $this->datasetId = $this->asToken($this->ownerToken)->getJson('/api/datasets')->json('0.id');
        $this->dashboardId = $this->asToken($this->ownerToken)->postJson('/api/dashboards', ['name' => 'Team'])->json('id');
    }

    /** A user who belongs to the owner's organization with the given role, acting in it. */
    protected function member(string $role): string
    {
        [$user, $token] = $this->registerUser(ucfirst($role));
        $organization = Organization::findOrFail($this->owner->current_organization_id);
        $organization->members()->attach($user->id, ['role' => $role]);
        $user->forceFill(['current_organization_id' => $organization->id])->save();

        return $token;
    }

    public function test_viewer_can_view_but_not_change(): void
    {
        $token = $this->member('viewer');

        $this->asToken($token)->getJson("/api/dashboards/{$this->dashboardId}")->assertOk()->assertJsonPath('role', 'viewer');
        $this->asToken($token)->getJson("/api/data-sources/{$this->sourceId}")->assertOk();

        $this->asToken($token)->putJson("/api/dashboards/{$this->dashboardId}", ['name' => 'x'])->assertForbidden();
        $this->asToken($token)->postJson("/api/dashboards/{$this->dashboardId}/charts", [
            'dataset_id' => $this->datasetId, 'title' => 't', 'type' => 'table',
        ])->assertForbidden();
        $this->asToken($token)->deleteJson("/api/datasets/{$this->datasetId}")->assertForbidden();
        $this->asToken($token)->deleteJson("/api/data-sources/{$this->sourceId}")->assertForbidden();
    }

    public function test_analyst_edits_content_but_cannot_manage_or_set_security(): void
    {
        $token = $this->member('analyst');

        $this->asToken($token)->getJson("/api/dashboards/{$this->dashboardId}")->assertJsonPath('role', 'editor');
        $this->asToken($token)->putJson("/api/dashboards/{$this->dashboardId}", ['name' => 'Renamed'])->assertOk();
        $this->asToken($token)->postJson("/api/dashboards/{$this->dashboardId}/charts", [
            'dataset_id' => $this->datasetId, 'title' => 't', 'type' => 'table',
        ])->assertCreated();

        // Managing someone else's dashboard, row-level security, members, billing: no.
        $this->asToken($token)->deleteJson("/api/dashboards/{$this->dashboardId}")->assertForbidden();
        $this->asToken($token)->postJson("/api/dashboards/{$this->dashboardId}/share")->assertForbidden();
        $this->asToken($token)->getJson("/api/datasets/{$this->datasetId}/row-level-policies")->assertForbidden();
        $this->asToken($token)->getJson("/api/organizations/{$this->owner->current_organization_id}/audit-logs")->assertForbidden();
        $this->asToken($token)->postJson('/api/billing/checkout', ['plan' => 'growth'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Only an organization owner or admin can manage billing.');
    }

    public function test_admin_can_manage_dashboards_security_and_audit_log(): void
    {
        $token = $this->member('admin');

        $this->asToken($token)->getJson("/api/datasets/{$this->datasetId}/row-level-policies")->assertOk();
        $this->asToken($token)->getJson("/api/organizations/{$this->owner->current_organization_id}/audit-logs")->assertOk();
        $this->asToken($token)->getJson("/api/dashboards/{$this->dashboardId}/collaborators")->assertOk();
        $this->asToken($token)->deleteJson("/api/dashboards/{$this->dashboardId}")->assertNoContent();
    }

    public function test_guest_collaborator_gets_only_the_granted_dashboard(): void
    {
        [, $guestToken] = $this->registerUser('Guest', 'guest@example.com');

        $this->asToken($this->ownerToken)->postJson("/api/dashboards/{$this->dashboardId}/collaborators", [
            'email' => 'guest@example.com', 'role' => 'viewer',
        ])->assertCreated();

        $this->asToken($guestToken)->getJson("/api/dashboards/{$this->dashboardId}")->assertOk();
        $this->asToken($guestToken)->putJson("/api/dashboards/{$this->dashboardId}", ['name' => 'x'])->assertForbidden();
        // Not an org member, so the org's data stays private.
        $this->asToken($guestToken)->getJson("/api/data-sources/{$this->sourceId}")->assertForbidden();
    }

    public function test_chart_preview_computes_without_saving_and_respects_roles(): void
    {
        $payload = [
            'dataset_id' => $this->datasetId,
            'type' => 'bar',
            'config' => ['x_field' => 'city', 'y_field' => 'revenue', 'agg' => 'sum'],
        ];

        $this->asToken($this->ownerToken)->postJson("/api/dashboards/{$this->dashboardId}/charts/preview", $payload)
            ->assertOk()
            ->assertJsonPath('labels', ['Lagos'])
            ->assertJsonPath('values', [100]);
        $this->asToken($this->ownerToken)->getJson("/api/dashboards/{$this->dashboardId}")->assertJsonCount(0, 'charts');

        $this->asToken($this->member('viewer'))
            ->postJson("/api/dashboards/{$this->dashboardId}/charts/preview", $payload)
            ->assertForbidden();

        // A stranger can't preview someone else's dataset through their own dashboard.
        [, $strangerToken] = $this->registerUser('Stranger');
        $strangerDashboard = $this->asToken($strangerToken)->postJson('/api/dashboards', ['name' => 'Mine'])->json('id');
        $this->asToken($strangerToken)->postJson("/api/dashboards/{$strangerDashboard}/charts/preview", $payload)->assertForbidden();
    }

    public function test_ai_conversations_are_private_to_their_author(): void
    {
        $conversationId = $this->asToken($this->ownerToken)
            ->postJson('/api/ai-conversations', ['dataset_id' => $this->datasetId])
            ->assertCreated()->json('id');

        $token = $this->member('admin');
        $this->asToken($token)->getJson("/api/ai-conversations/{$conversationId}")->assertForbidden();
        $this->asToken($token)->deleteJson("/api/ai-conversations/{$conversationId}")->assertForbidden();
    }
}
