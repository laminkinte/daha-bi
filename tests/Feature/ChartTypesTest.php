<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** The richer visuals: gauge, list/funnel/treemap/radar, activity feed, multi-series lines, picked table columns. */
class ChartTypesTest extends TestCase
{
    use RefreshDatabase;

    protected string $token;

    protected int $datasetId;

    protected int $dashboardId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        [, $this->token] = $this->registerUser('Owner');
        $csv = "asset,status,cost,serviced\n"
            ."HVAC Unit,Active,100,2025-01-05\n"
            ."Conveyor Belt,Critical,50,2025-03-20\n"
            ."Pump Motor,Active,25,2025-02-02\n"
            ."CNC Machine,Inactive,10,2025-02-10\n";
        $this->asToken($this->token)->post('/api/data-sources', [
            'type' => 'csv', 'name' => 'Assets',
            'file' => UploadedFile::fake()->createWithContent('a.csv', $csv),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->datasetId = $this->asToken($this->token)->getJson('/api/datasets')->json('0.id');
        $this->dashboardId = $this->asToken($this->token)->postJson('/api/dashboards', ['name' => 'Ops'])->assertCreated()->json('id');
    }

    protected function preview(string $type, array $config): \Illuminate\Testing\TestResponse
    {
        return $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/charts/preview", [
            'dataset_id' => $this->datasetId, 'type' => $type, 'config' => $config,
        ]);
    }

    public function test_new_types_can_be_saved(): void
    {
        foreach (['gauge', 'list', 'funnel', 'treemap', 'radar', 'feed'] as $type) {
            $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/charts", [
                'dataset_id' => $this->datasetId, 'title' => $type, 'type' => $type, 'config' => [],
            ])->assertCreated();
        }
        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/charts", [
            'dataset_id' => $this->datasetId, 'title' => 'x', 'type' => 'nonsense',
        ])->assertUnprocessable();
    }

    public function test_gauge_and_grouped_types_return_their_data(): void
    {
        $this->preview('gauge', ['agg' => 'sum', 'y_field' => 'cost'])->assertOk()->assertJsonPath('value', 185);
        $this->preview('list', ['x_field' => 'status', 'agg' => 'count'])->assertOk()->assertJsonPath('labels', ['Active', 'Critical', 'Inactive']);
    }

    public function test_feed_returns_newest_rows_first(): void
    {
        $this->preview('feed', ['x_field' => 'serviced', 'label_field' => 'asset', 'series_field' => 'status', 'limit' => 3])
            ->assertOk()
            ->assertJsonCount(3, 'items')
            ->assertJsonPath('items.0.title', 'Conveyor Belt')
            ->assertJsonPath('items.0.tag', 'Critical')
            ->assertJsonPath('items.1.title', 'CNC Machine');
    }

    public function test_line_can_split_into_series_grouped_by_month(): void
    {
        $this->preview('line', ['x_field' => 'serviced', 'x_grain' => 'month', 'series_field' => 'status', 'agg' => 'count'])
            ->assertOk()
            ->assertJsonPath('labels', ['2025-01', '2025-02', '2025-03'])
            ->assertJsonPath('series.0.name', 'Active')
            ->assertJsonPath('series.0.values', [1, 1, 0]);
    }

    public function test_template_builds_an_operations_overview_whose_charts_all_load(): void
    {
        $dashboard = $this->asToken($this->token)->postJson('/api/dashboard-templates', [
            'template' => 'sales', 'dataset_id' => $this->datasetId, 'name' => 'Overview',
        ])->assertCreated()->json();

        $types = array_column($dashboard['charts'], 'type');
        $this->assertSame(['kpi', 'kpi', 'kpi', 'kpi'], array_slice($types, 0, 4));
        $this->assertContains('feed', $types);
        $this->assertContains('table', $types);
        $this->assertSame('tile', $dashboard['charts'][0]['config']['style']['variant']);

        // The red tile counts only the problem statuses.
        $problem = collect($dashboard['charts'])->firstWhere('title', 'Critical');
        $this->assertNotNull($problem);

        foreach ($dashboard['charts'] as $chart) {
            $res = $this->asToken($this->token)->postJson("/api/charts/{$chart['id']}/data", ['filters' => []])->assertOk();
            if ($chart['id'] === $problem['id']) {
                $res->assertJsonPath('value', 1);
            }
        }
    }

    public function test_excel_export_has_a_sheet_of_real_data_per_chart(): void
    {
        $add = fn (string $title, string $type, array $config) => $this->asToken($this->token)
            ->postJson("/api/dashboards/{$this->dashboardId}/charts", ['dataset_id' => $this->datasetId, 'title' => $title, 'type' => $type, 'config' => $config])
            ->assertCreated();
        $add('Total cost', 'kpi', ['agg' => 'sum', 'y_field' => 'cost']);
        $add('By status', 'bar', ['x_field' => 'status', 'agg' => 'count']);
        $add('Activity', 'feed', ['x_field' => 'serviced', 'label_field' => 'asset', 'series_field' => 'status']);
        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/charts", [
            'dataset_id' => $this->datasetId, 'title' => 'Critical', 'type' => 'kpi', 'config' => ['agg' => 'count'],
            'filters' => [['field' => 'status', 'operator' => '=', 'value' => 'Critical']],
        ])->assertCreated();

        $response = $this->asToken($this->token)->get("/api/dashboards/{$this->dashboardId}/export/excel")->assertOk();
        $path = tempnam(sys_get_temp_dir(), 'xl').'.xlsx';
        file_put_contents($path, $response->streamedContent());
        $book = \PhpOffice\PhpSpreadsheet\IOFactory::load($path);
        unlink($path);

        $this->assertSame(['Total cost', 'By status', 'Activity', 'Critical'], $book->getSheetNames());
        $this->assertEquals(1, $book->getSheetByName('Critical')->getCell('B3')->getValue(), "the chart's own filter applies");
        $this->assertEquals(185, $book->getSheetByName('Total cost')->getCell('B3')->getValue());
        $this->assertSame('Active', $book->getSheetByName('By status')->getCell('A4')->getValue());
        $this->assertEquals(2, $book->getSheetByName('By status')->getCell('B4')->getValue());
        $this->assertSame('Conveyor Belt', $book->getSheetByName('Activity')->getCell('B4')->getValue());
    }

    public function test_table_shows_only_picked_columns_sorted(): void
    {
        $this->preview('table', ['columns' => ['asset', 'status'], 'sort_field' => 'cost', 'sort_dir' => 'desc'])
            ->assertOk()
            ->assertJsonPath('columns', ['asset', 'status'])
            ->assertJsonPath('rows.0', ['asset' => 'HVAC Unit', 'status' => 'Active']);
    }
}
