<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Dashboard-wide filter slicers: saved settings, value lists (with row-level security), multi-value filtering. */
class DashboardSlicersTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected string $token;

    protected int $dashboardId;

    protected int $datasetId;

    protected int $chartId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();

        [$this->owner, $this->token] = $this->registerUser('Owner');
        $csv = "city,revenue\nLagos,100\nAccra,50\nNairobi,25\nLagos,10\n";
        $this->asToken($this->token)->post('/api/data-sources', [
            'type' => 'csv',
            'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('s.csv', $csv),
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->datasetId = $this->asToken($this->token)->getJson('/api/datasets')->json('0.id');
        $this->dashboardId = $this->asToken($this->token)->postJson('/api/dashboards', ['name' => 'Board'])->json('id');
        $this->chartId = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/charts", [
            'dataset_id' => $this->datasetId, 'title' => 'Total', 'type' => 'kpi',
            'config' => ['agg' => 'sum', 'y_field' => 'revenue'],
        ])->assertCreated()->json('id');
    }

    public function test_slicer_settings_are_saved_and_sanitized(): void
    {
        $this->asToken($this->token)->putJson("/api/dashboards/{$this->dashboardId}", [
            'settings' => ['slicers' => [['field' => 'city', 'junk' => 'x'], ['field' => 'city']], 'other' => 1],
        ])->assertOk();

        $this->asToken($this->token)->getJson("/api/dashboards/{$this->dashboardId}")
            ->assertJsonPath('settings', ['slicers' => [['field' => 'city']]])
            ->assertJsonStructure(['data_refreshed_at']);
    }

    public function test_slicer_values_and_multi_value_filter(): void
    {
        $this->asToken($this->token)->getJson("/api/dashboards/{$this->dashboardId}/slicer-values?field=city")
            ->assertOk()->assertJsonPath('values', ['Accra', 'Lagos', 'Nairobi']);

        $this->asToken($this->token)->postJson("/api/charts/{$this->chartId}/data", [
            'filters' => [['field' => 'city', 'operator' => 'in', 'value' => ['Lagos', 'Accra']]],
        ])->assertOk()->assertJsonPath('value', 160);

        // An empty selection means "all".
        $this->asToken($this->token)->postJson("/api/charts/{$this->chartId}/data", [
            'filters' => [['field' => 'city', 'operator' => 'in', 'value' => []]],
        ])->assertOk()->assertJsonPath('value', 185);
    }

    public function test_date_grain_buckets_and_kpi_trend_uses_latest_periods(): void
    {
        $rows = "day,amount
";
        foreach (range(1, 40) as $i) {
            $rows .= sprintf("2025-%02d-15,%d
", (($i - 1) % 12) + 1, $i);
            $rows .= sprintf("2024-%02d-03,1
", (($i - 1) % 12) + 1);
        }
        $this->asToken($this->token)->post('/api/data-sources', [
            'type' => 'csv', 'name' => 'Daily',
            'file' => UploadedFile::fake()->createWithContent('d.csv', $rows),
        ], ['Accept' => 'application/json'])->assertCreated();
        $datasetId = collect($this->asToken($this->token)->getJson('/api/datasets')->json())
            ->pluck('id')->first(fn ($id) => $id !== $this->datasetId);
        $this->assertNotNull($datasetId);

        $preview = fn (array $body) => $this->asToken($this->token)
            ->postJson("/api/dashboards/{$this->dashboardId}/charts/preview", ['dataset_id' => $datasetId] + $body)->assertOk();

        $years = $preview(['type' => 'line', 'config' => ['x_field' => 'day', 'agg' => 'count', 'x_grain' => 'year']]);
        $years->assertJsonPath('labels', ['2024', '2025']);

        $months = $preview(['type' => 'line', 'config' => ['x_field' => 'day', 'agg' => 'count', 'x_grain' => 'month']]);
        $this->assertCount(24, $months->json('labels'));
        $this->assertSame('2024-01', $months->json('labels.0'));

        // KPI trend keeps the newest periods (ending at 2025-12), oldest→newest.
        $kpi = $preview(['type' => 'kpi', 'config' => ['agg' => 'count', 'x_field' => 'day', 'x_grain' => 'month']]);
        $this->assertSame('2025-12', last($kpi->json('trend.labels')));
    }

    public function test_slicer_values_respect_row_level_security_and_access(): void
    {
        $this->asToken($this->token)->postJson("/api/datasets/{$this->datasetId}/row-level-policies", [
            'role' => 'viewer', 'field' => 'city', 'operator' => '=', 'value' => 'Lagos',
        ])->assertCreated();

        [$viewer, $viewerToken] = $this->registerUser('Viewer');
        $org = Organization::findOrFail($this->owner->current_organization_id);
        $org->members()->attach($viewer->id, ['role' => 'viewer']);
        $viewer->forceFill(['current_organization_id' => $org->id])->save();

        $this->asToken($viewerToken)->getJson("/api/dashboards/{$this->dashboardId}/slicer-values?field=city")
            ->assertOk()->assertJsonPath('values', ['Lagos']);

        [, $strangerToken] = $this->registerUser('Stranger');
        $this->asToken($strangerToken)->getJson("/api/dashboards/{$this->dashboardId}/slicer-values?field=city")->assertForbidden();
    }
}
