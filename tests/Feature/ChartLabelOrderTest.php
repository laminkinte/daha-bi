<?php

namespace Tests\Feature;

use App\Services\ChartDataService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Month/weekday labels must come back in calendar order, not alphabetical. */
class ChartLabelOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_month_names_sort_by_calendar(): void
    {
        $service = app(ChartDataService::class);
        $labels = ['Apr', 'Feb', 'Jan', 'Jun', 'Mar', 'May'];

        $ordered = array_map(fn ($i) => $labels[$i], $service->calendarOrder($labels));

        $this->assertSame(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], $ordered);
    }

    public function test_full_names_and_weekdays_sort_by_calendar(): void
    {
        $service = app(ChartDataService::class);

        $months = ['October', 'january', 'Sept', 'March'];
        $this->assertSame(['january', 'March', 'Sept', 'October'], array_map(fn ($i) => $months[$i], $service->calendarOrder($months)));

        $days = ['Wed', 'Mon', 'Sun', 'Fri'];
        $this->assertSame(['Mon', 'Wed', 'Fri', 'Sun'], array_map(fn ($i) => $days[$i], $service->calendarOrder($days)));
    }

    public function test_ordinary_categories_and_iso_dates_are_left_alone(): void
    {
        $service = app(ChartDataService::class);

        $this->assertNull($service->calendarOrder(['Lagos', 'Accra', 'Nairobi']));
        $this->assertNull($service->calendarOrder(['Marketing', 'Sales'])); // starts with "mar"/"sal" but not months
        $this->assertNull($service->calendarOrder(['2024-03', '2024-01']));
        $this->assertNull($service->calendarOrder(['Jan', 'Lagos'])); // mixed: don't guess
    }

    public function test_line_chart_by_month_returns_calendar_order_end_to_end(): void
    {
        Storage::fake();
        [, $token] = $this->registerUser('Analyst');

        $csv = "month,revenue\nApr,40\nFeb,20\nJan,10\nMar,30\n";
        $this->asToken($token)->post('/api/data-sources', [
            'type' => 'csv', 'name' => 'Monthly',
            'file' => UploadedFile::fake()->createWithContent('m.csv', $csv),
        ], ['Accept' => 'application/json'])->assertCreated();

        $datasetId = $this->asToken($token)->getJson('/api/datasets')->json('0.id');
        $dashboardId = $this->asToken($token)->postJson('/api/dashboards', ['name' => 'Trend'])->json('id');
        $chartId = $this->asToken($token)->postJson("/api/dashboards/{$dashboardId}/charts", [
            'dataset_id' => $datasetId, 'title' => 'Trend', 'type' => 'line',
            'config' => ['x_field' => 'month', 'y_field' => 'revenue', 'agg' => 'sum'],
        ])->assertCreated()->json('id');

        $data = $this->asToken($token)->postJson("/api/charts/{$chartId}/data")->assertOk()->json();

        $this->assertSame(['Jan', 'Feb', 'Mar', 'Apr'], $data['labels']);
        $this->assertEquals([10, 20, 30, 40], $data['values']);
    }
}
