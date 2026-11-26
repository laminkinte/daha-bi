<?php

namespace Tests\Feature;

use App\Models\DashboardEmbed;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Embedding dashboards in other sites (owner and partner embeds) and workspace white-labelling. */
class EmbedAndBrandingTest extends TestCase
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
        Storage::fake('local');
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

    protected function embedToken(string $url): string
    {
        return basename(parse_url($url, PHP_URL_PATH));
    }

    public function test_owner_embed_with_filter_domains_and_revoke(): void
    {
        $res = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/embeds", [
            'name' => 'Investor site',
            'allowed_domains' => ['https://www.Investors.example.com/page', '*.example.org'],
            'expires_in_days' => 30,
            'row_filters' => [['field' => 'city', 'operator' => '=', 'value' => 'Lagos']],
        ])->assertCreated()
            ->assertJsonPath('allowed_domains', ['www.investors.example.com', '*.example.org']);
        $this->assertStringContainsString('<iframe src="', $res->json('snippet'));
        $t = $this->embedToken($res->json('url'));
        $this->assertNull(DashboardEmbed::where('token_hash', $t)->first(), 'raw token must not be the lookup key');

        $this->getJson("/api/public/embeds/{$t}")->assertOk()->assertJsonPath('name', 'Distributor KPIs')->assertJsonPath('branding.name', "Owner's workspace");
        $this->postJson("/api/public/embeds/{$t}/charts/{$this->chartId}/data")->assertOk()->assertJsonPath('value', 110);
        // A viewer's own filter narrows further but can never widen past the embed's.
        $this->postJson("/api/public/embeds/{$t}/charts/{$this->chartId}/data", ['filters' => [['field' => 'city', 'operator' => '=', 'value' => 'Accra']]])
            ->assertJsonPath('value', null); // no rows left: a SUM over nothing
        $this->getJson("/api/public/embeds/{$t}/frame-policy")->assertJsonPath('allowed_domains', ['www.investors.example.com', '*.example.org']);
        $this->assertSame(1, DashboardEmbed::first()->view_count);

        // Bad domains are rejected; other dashboards' charts can't be read through this embed.
        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/embeds", ['name' => 'x', 'allowed_domains' => ['evil.com"; script']])->assertStatus(422);
        $otherDash = $this->asToken($this->token)->postJson('/api/dashboards', ['name' => 'Other'])->json('id');
        $otherChart = $this->asToken($this->token)->postJson("/api/dashboards/{$otherDash}/charts", [
            'dataset_id' => $this->asToken($this->token)->getJson('/api/datasets')->json('0.id'), 'title' => 'X', 'type' => 'kpi', 'config' => ['agg' => 'count'],
        ])->json('id');
        $this->postJson("/api/public/embeds/{$t}/charts/{$otherChart}/data")->assertNotFound();

        $this->asToken($this->token)->deleteJson('/api/embeds/'.$res->json('id'))->assertNoContent();
        $this->getJson("/api/public/embeds/{$t}")->assertNotFound();
        $this->getJson("/api/public/embeds/{$t}/frame-policy")->assertJsonPath('allowed_domains', null);
    }

    public function test_expired_embed_stops_working(): void
    {
        $url = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/embeds", ['name' => 'Temp', 'expires_in_days' => 7])->json('url');
        DashboardEmbed::query()->update(['expires_at' => now()->subMinute()]);
        $this->getJson('/api/public/embeds/'.$this->embedToken($url))->assertNotFound();
    }

    public function test_partner_embed_inherits_share_filters_and_dies_with_the_share(): void
    {
        $shareUrl = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/company-shares", [
            'email' => 'admin@partner.test',
            'row_filters' => [['field' => 'city', 'operator' => 'in', 'value' => ['Lagos', 'Accra']]],
        ])->json('share_url');
        [$admin, $adminToken] = $this->registerUser('Partner Admin', 'admin@partner.test');
        $this->asToken($adminToken)->postJson('/api/shares/'.basename(parse_url($shareUrl, PHP_URL_PATH)).'/accept', ['organization_id' => $admin->current_organization_id])->assertOk();

        $this->asToken($adminToken)->getJson("/api/dashboards/{$this->dashboardId}")->assertJsonPath('can_embed', true);

        // A partner viewer (not admin) can't embed.
        [$viewer, $viewerToken] = $this->registerUser('Partner Viewer');
        Organization::findOrFail($admin->current_organization_id)->members()->attach($viewer->id, ['role' => 'viewer']);
        $viewer->forceFill(['current_organization_id' => $admin->current_organization_id])->save();
        $this->asToken($viewerToken)->postJson("/api/dashboards/{$this->dashboardId}/embeds", ['name' => 'x'])->assertForbidden();
        $this->asToken($viewerToken)->getJson("/api/dashboards/{$this->dashboardId}")->assertJsonPath('can_embed', false);

        $res = $this->asToken($adminToken)->postJson("/api/dashboards/{$this->dashboardId}/embeds", ['name' => 'Our portal'])->assertCreated()
            ->assertJsonPath('inherits_share_filters', true);
        $t = $this->embedToken($res->json('url'));

        // Lagos + Accra only (160), never the owner's 185; branding is the partner's, not the owner's.
        $this->postJson("/api/public/embeds/{$t}/charts/{$this->chartId}/data")->assertJsonPath('value', 160);
        $this->getJson("/api/public/embeds/{$t}")->assertJsonPath('branding.name', "Partner Admin's workspace");

        // The owner's embeds list doesn't include the partner's, and vice versa.
        $this->asToken($this->token)->getJson("/api/dashboards/{$this->dashboardId}/embeds")->assertJsonCount(0);
        $this->asToken($adminToken)->getJson("/api/dashboards/{$this->dashboardId}/embeds")->assertJsonCount(1);

        // Owner stops sharing → the partner's embed goes dark immediately.
        $shareId = $this->asToken($this->token)->getJson("/api/dashboards/{$this->dashboardId}/company-shares")->json('0.id');
        $this->asToken($this->token)->deleteJson("/api/company-shares/{$shareId}")->assertNoContent();
        $this->getJson("/api/public/embeds/{$t}")->assertNotFound();
    }

    public function test_branding_settings_logo_and_permissions(): void
    {
        $orgId = $this->owner->current_organization_id;

        $this->asToken($this->token)->post("/api/organizations/{$orgId}/branding", [
            'brand_name' => 'Acme Analytics',
            'brand_color' => '#AA3355',
            'brand_hide_powered_by' => '1',
            'logo' => UploadedFile::fake()->image('logo.png', 200, 60),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('name', 'Acme Analytics')
            ->assertJsonPath('color', '#aa3355')
            ->assertJsonPath('hide_powered_by', true);

        $this->get("/api/public/brand-logo/{$orgId}")->assertOk();
        $this->asToken($this->token)->getJson('/api/user')->assertJsonPath('current_organization.branding.name', 'Acme Analytics');

        // SVG (can carry script) and bad colours are refused.
        $this->asToken($this->token)->post("/api/organizations/{$orgId}/branding", [
            'logo' => UploadedFile::fake()->createWithContent('x.svg', '<svg onload="alert(1)"/>'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
        $this->asToken($this->token)->post("/api/organizations/{$orgId}/branding", ['brand_color' => 'red;}'], ['Accept' => 'application/json'])->assertStatus(422);

        // Only owners/admins change branding.
        [$viewer, $viewerToken] = $this->registerUser('Viewer');
        Organization::findOrFail($orgId)->members()->attach($viewer->id, ['role' => 'viewer']);
        $this->asToken($viewerToken)->post("/api/organizations/{$orgId}/branding", ['brand_name' => 'Hijack'], ['Accept' => 'application/json'])->assertForbidden();

        // Removing the logo.
        $this->asToken($this->token)->post("/api/organizations/{$orgId}/branding", ['brand_name' => 'Acme Analytics', 'remove_logo' => '1'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('logo_url', null);
        $this->get("/api/public/brand-logo/{$orgId}")->assertNotFound();
    }
}
