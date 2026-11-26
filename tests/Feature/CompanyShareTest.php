<?php

namespace Tests\Feature;

use App\Mail\DashboardShareMail;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Sharing a dashboard with another company's workspace, with per-partner row filters. */
class CompanyShareTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected string $token;

    protected int $dashboardId;

    protected int $chartId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        Mail::fake();

        [$this->owner, $this->token] = $this->registerUser('Owner');
        $csv = "city,revenue\nLagos,100\nAccra,50\nNairobi,25\nLagos,10\n";
        $this->asToken($this->token)->post('/api/data-sources', [
            'type' => 'csv', 'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('s.csv', $csv),
        ], ['Accept' => 'application/json'])->assertCreated();
        $datasetId = $this->asToken($this->token)->getJson('/api/datasets')->json('0.id');
        $this->dashboardId = $this->asToken($this->token)->postJson('/api/dashboards', ['name' => 'Distributor KPIs'])->json('id');
        $this->chartId = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/charts", [
            'dataset_id' => $datasetId, 'title' => 'Revenue', 'type' => 'kpi', 'config' => ['agg' => 'sum', 'y_field' => 'revenue'],
        ])->json('id');
    }

    /** Shares the dashboard with a new partner company; returns [admin, adminToken, orgId, shareId]. */
    protected function sharedPartner(string $name, ?array $filters = null): array
    {
        $res = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/company-shares", array_filter([
            'email' => strtolower($name).'@partner.test',
            'row_filters' => $filters,
        ]))->assertCreated();
        $shareToken = basename(parse_url($res->json('share_url'), PHP_URL_PATH));

        [$admin, $adminToken] = $this->registerUser($name, strtolower($name).'@partner.test');
        $this->getJson("/api/public/shares/{$shareToken}")->assertOk()->assertJsonPath('status', 'pending')->assertJsonPath('filtered', (bool) $filters);
        $this->asToken($adminToken)->postJson("/api/shares/{$shareToken}/accept", ['organization_id' => $admin->current_organization_id])->assertOk();

        return [$admin, $adminToken, $admin->current_organization_id, $res->json('id')];
    }

    protected function teammate(int $orgId, string $role = 'viewer'): array
    {
        [$user, $token] = $this->registerUser('Teammate '.$orgId);
        Organization::findOrFail($orgId)->members()->attach($user->id, ['role' => $role]);
        $user->forceFill(['current_organization_id' => $orgId])->save();

        return [$user, $token];
    }

    public function test_whole_partner_workspace_gets_read_only_filtered_access_until_revoked(): void
    {
        [, , $orgId, $shareId] = $this->sharedPartner('Lagosco', [['field' => 'city', 'operator' => '=', 'value' => 'Lagos']]);
        Mail::assertSent(DashboardShareMail::class);
        [, $tmToken] = $this->teammate($orgId);

        $list = $this->asToken($tmToken)->getJson('/api/dashboards')->assertOk();
        $this->assertSame('Distributor KPIs', $list->json('0.name'));
        $this->assertSame('viewer', $list->json('0.role'));
        $this->assertNotNull($list->json('0.shared_by'));
        $this->assertArrayNotHasKey('organization', $list->json('0'));

        // The public link (which shows ALL rows) must never reach a row-filtered partner.
        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/share")->assertOk();
        $this->assertNotNull($this->asToken($this->token)->getJson("/api/dashboards/{$this->dashboardId}")->json('share_token'));
        $partnerView = $this->asToken($tmToken)->getJson("/api/dashboards/{$this->dashboardId}")->assertOk();
        $this->assertArrayNotHasKey('share_token', $partnerView->json());
        $this->assertArrayNotHasKey('share_token', $this->asToken($tmToken)->getJson('/api/dashboards')->json('0'));

        // Only Lagos rows: 100 + 10, never the owner's full 185.
        $this->asToken($tmToken)->postJson("/api/charts/{$this->chartId}/data")->assertOk()->assertJsonPath('value', 110);
        $this->asToken($tmToken)->getJson("/api/dashboards/{$this->dashboardId}/slicer-values?field=city")->assertJsonPath('values', ['Lagos']);
        $this->asToken($this->token)->postJson("/api/charts/{$this->chartId}/data")->assertJsonPath('value', 185);

        // Read-only, and internal things stay internal.
        $this->asToken($tmToken)->putJson("/api/dashboards/{$this->dashboardId}", ['name' => 'x'])->assertForbidden();
        $this->asToken($tmToken)->getJson("/api/charts/{$this->chartId}/goals")->assertForbidden();
        $this->asToken($tmToken)->getJson("/api/dashboards/{$this->dashboardId}/company-shares")->assertForbidden();

        // The owner widens the filter, then revokes.
        $this->asToken($this->token)->putJson("/api/company-shares/{$shareId}", ['row_filters' => [['field' => 'city', 'operator' => 'in', 'value' => ['Lagos', 'Accra']]]])->assertOk();
        $this->asToken($tmToken)->postJson("/api/charts/{$this->chartId}/data")->assertJsonPath('value', 160);

        $this->asToken($this->token)->deleteJson("/api/company-shares/{$shareId}")->assertNoContent();
        $this->asToken($tmToken)->getJson("/api/dashboards/{$this->dashboardId}")->assertForbidden();
        $this->asToken($tmToken)->getJson('/api/dashboards')->assertJsonCount(0);
    }

    public function test_accepting_needs_an_admin_of_another_workspace(): void
    {
        $res = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/company-shares", ['email' => 'x@y.test'])->assertCreated();
        $shareToken = basename(parse_url($res->json('share_url'), PHP_URL_PATH));

        // Can't "share" into the owning workspace itself.
        $this->asToken($this->token)->postJson("/api/shares/{$shareToken}/accept", ['organization_id' => $this->owner->current_organization_id])->assertStatus(422);

        // A mere viewer of a workspace can't accept on its behalf.
        [$admin] = $this->registerUser('Admin', 'x@y.test');
        [, $viewerToken] = $this->teammate($admin->current_organization_id, 'viewer');
        $this->asToken($viewerToken)->postJson("/api/shares/{$shareToken}/accept", ['organization_id' => $admin->current_organization_id])->assertForbidden();

        // Bad filter fields are rejected up front.
        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/company-shares", [
            'email' => 'z@y.test', 'row_filters' => [['field' => 'secret_column', 'operator' => '=', 'value' => '1']],
        ])->assertStatus(422);
    }

    public function test_each_partner_has_a_private_conversation(): void
    {
        [$aAdmin, $aToken, $aOrg] = $this->sharedPartner('Alpha');
        [$bAdmin, $bToken, $bOrg] = $this->sharedPartner('Beta');

        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'Internal: margins look thin'])->assertCreated();
        $this->asToken($aToken)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'Alpha question', 'partner_organization_id' => $bOrg])
            ->assertCreated()->assertJsonPath('space.id', $aOrg);
        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'Hi Beta', 'partner_organization_id' => $bOrg])->assertCreated();

        $bodies = fn (string $tok) => collect($this->asToken($tok)->getJson("/api/dashboards/{$this->dashboardId}/comments")->assertOk()->json('threads'))->pluck('body')->sort()->values()->all();
        $this->assertSame(['Alpha question'], $bodies($aToken));
        $this->assertSame(['Hi Beta'], $bodies($bToken));
        $this->assertSame(['Alpha question', 'Hi Beta', 'Internal: margins look thin'], $bodies($this->token));

        // Alpha can't mention (or even list) Beta's people.
        $names = collect($this->asToken($aToken)->getJson("/api/dashboards/{$this->dashboardId}/mentionable")->json())->pluck('id');
        $this->assertTrue($names->contains($aAdmin->id));
        $this->assertFalse($names->contains($bAdmin->id));

        // Nor reply into Beta's thread.
        $betaThread = collect($this->asToken($bToken)->getJson("/api/dashboards/{$this->dashboardId}/comments")->json('threads'))->first()['id'];
        $this->asToken($aToken)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'sneak', 'parent_id' => $betaThread])->assertNotFound();
    }
}
