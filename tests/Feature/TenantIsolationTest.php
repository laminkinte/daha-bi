<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Every account is an organization, and registration is open, so the line between two
 * organizations is the product's most important security boundary.
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected function uploadCsv(string $token): array
    {
        $csv = "city,product,revenue\nLagos,Rice,100\nLagos,Oil,50\nAccra,Rice,70\n";

        $response = $this->asToken($token)->post('/api/data-sources', [
            'type' => 'csv',
            'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('sales.csv', $csv),
        ], ['Accept' => 'application/json'])->assertCreated();

        return $response->json();
    }

    public function test_csv_to_chart_to_data_end_to_end(): void
    {
        Storage::fake();
        [, $token] = $this->registerUser('Amina');

        $this->uploadCsv($token);
        $datasetId = $this->asToken($token)->getJson('/api/datasets')->assertOk()->json('0.id');
        $dashboardId = $this->asToken($token)->postJson('/api/dashboards', ['name' => 'Revenue'])->assertCreated()->json('id');

        $chartId = $this->asToken($token)->postJson("/api/dashboards/{$dashboardId}/charts", [
            'dataset_id' => $datasetId,
            'title' => 'Revenue by city',
            'type' => 'bar',
            'config' => ['x_field' => 'city', 'y_field' => 'revenue', 'agg' => 'sum'],
        ])->assertCreated()->json('id');

        $data = $this->asToken($token)->postJson("/api/charts/{$chartId}/data")->assertOk()->json();

        $totals = collect($data['labels'] ?? [])->combine($data['values'] ?? $data['datasets'][0]['data'] ?? []);
        $this->assertEquals(150, $totals['Lagos'] ?? null, 'Lagos revenue should sum to 150: '.json_encode($data));
        $this->assertEquals(70, $totals['Accra'] ?? null);
    }

    public function test_other_organization_cannot_read_or_change_dashboards(): void
    {
        [, $ownerToken] = $this->registerUser('Owner');
        [, $strangerToken] = $this->registerUser('Stranger');

        $dashboardId = $this->asToken($ownerToken)->postJson('/api/dashboards', ['name' => 'Private'])->json('id');

        $this->asToken($strangerToken)->getJson("/api/dashboards/{$dashboardId}")->assertForbidden();
        $this->asToken($strangerToken)->putJson("/api/dashboards/{$dashboardId}", ['name' => 'pwned'])->assertForbidden();
        $this->asToken($strangerToken)->deleteJson("/api/dashboards/{$dashboardId}")->assertForbidden();
        $this->assertNotContains($dashboardId, $this->asToken($strangerToken)->getJson('/api/dashboards')->json('*.id'));
    }

    public function test_other_organization_cannot_read_data_sources_or_datasets(): void
    {
        Storage::fake();
        [, $ownerToken] = $this->registerUser('Owner');
        [, $strangerToken] = $this->registerUser('Stranger');

        $sourceId = $this->uploadCsv($ownerToken)['data_source']['id'] ?? $this->asToken($ownerToken)->getJson('/api/data-sources')->json('0.id');
        $datasetId = $this->asToken($ownerToken)->getJson('/api/datasets')->json('0.id');

        $this->asToken($strangerToken)->getJson("/api/data-sources/{$sourceId}")->assertForbidden();
        $this->asToken($strangerToken)->getJson("/api/datasets/{$datasetId}/preview")->assertForbidden();
        $this->asToken($strangerToken)->deleteJson("/api/datasets/{$datasetId}")->assertForbidden();
        $this->assertSame([], $this->asToken($strangerToken)->getJson('/api/datasets')->json());
    }

    public function test_cannot_chart_another_organizations_dataset(): void
    {
        Storage::fake();
        [, $ownerToken] = $this->registerUser('Owner');
        [, $strangerToken] = $this->registerUser('Stranger');

        $this->uploadCsv($ownerToken);
        $victimDatasetId = $this->asToken($ownerToken)->getJson('/api/datasets')->json('0.id');
        $strangerDashboardId = $this->asToken($strangerToken)->postJson('/api/dashboards', ['name' => 'Mine'])->json('id');

        $this->asToken($strangerToken)->postJson("/api/dashboards/{$strangerDashboardId}/charts", [
            'dataset_id' => $victimDatasetId,
            'title' => 'Steal',
            'type' => 'table',
        ])->assertForbidden();
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/dashboards')->assertUnauthorized();
        $this->getJson('/api/data-sources')->assertUnauthorized();
        $this->getJson('/api/admin/stats')->assertUnauthorized();
    }

    public function test_regular_user_cannot_reach_admin_api(): void
    {
        [, $token] = $this->registerUser('Regular');

        $this->asToken($token)->getJson('/api/admin/stats')->assertForbidden();
        $this->asToken($token)->putJson('/api/admin/site-settings/landing_hero', ['value' => []])->assertForbidden();
    }
}
