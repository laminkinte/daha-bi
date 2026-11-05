<?php

namespace Database\Seeders;

use App\Models\Chart;
use App\Models\Dashboard;
use App\Models\DataSource;
use App\Models\Dataset;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => 'demo@daha.bi'],
            ['name' => 'Demo User', 'password' => 'password']
        );

        $dataSource = DataSource::create([
            'user_id' => $user->id,
            'name' => 'Regional Sales (Demo)',
            'type' => 'csv',
            'status' => 'ready',
            'config' => ['seeded' => true],
            'last_synced_at' => now(),
        ]);

        $columns = ['region', 'product', 'units', 'revenue', 'month'];

        $dataset = Dataset::create([
            'data_source_id' => $dataSource->id,
            'name' => 'regional_sales',
            'columns' => collect($columns)->map(fn ($name) => ['name' => $name, 'label' => $name])->all(),
            'row_count' => 0,
        ]);

        $regions = ['Lagos', 'Nairobi', 'Accra', 'Kampala', 'Kigali', 'Dakar'];
        $products = ['Airtime Bundle', 'Data Plan', 'POS Terminal', 'Mobile Wallet Top-up'];
        $months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

        $rows = [];
        foreach ($regions as $region) {
            foreach ($products as $product) {
                foreach ($months as $month) {
                    $units = random_int(20, 400);
                    $revenue = $units * random_int(5, 40);

                    $rows[] = [
                        'dataset_id' => $dataset->id,
                        'data' => json_encode([
                            'region' => $region,
                            'product' => $product,
                            'units' => $units,
                            'revenue' => $revenue,
                            'month' => $month,
                        ]),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('dataset_rows')->insert($chunk);
        }

        $dataset->update(['row_count' => count($rows)]);

        $dashboard = Dashboard::create([
            'user_id' => $user->id,
            'name' => 'Regional Sales Overview',
            'description' => 'Demo dashboard seeded with sample African-market sales data.',
        ]);

        Chart::create([
            'dashboard_id' => $dashboard->id,
            'dataset_id' => $dataset->id,
            'title' => 'Revenue by Region',
            'type' => 'bar',
            'config' => ['x_field' => 'region', 'y_field' => 'revenue', 'agg' => 'sum'],
            'position' => ['x' => 0, 'y' => 0, 'w' => 6, 'h' => 4],
        ]);

        Chart::create([
            'dashboard_id' => $dashboard->id,
            'dataset_id' => $dataset->id,
            'title' => 'Units Sold by Product',
            'type' => 'pie',
            'config' => ['x_field' => 'product', 'y_field' => 'units', 'agg' => 'sum'],
            'position' => ['x' => 6, 'y' => 0, 'w' => 6, 'h' => 4],
        ]);

        Chart::create([
            'dashboard_id' => $dashboard->id,
            'dataset_id' => $dataset->id,
            'title' => 'Total Revenue',
            'type' => 'kpi',
            'config' => ['y_field' => 'revenue', 'agg' => 'sum'],
            'position' => ['x' => 0, 'y' => 4, 'w' => 3, 'h' => 2],
        ]);

        Chart::create([
            'dashboard_id' => $dashboard->id,
            'dataset_id' => $dataset->id,
            'title' => 'Revenue Trend by Month',
            'type' => 'line',
            'config' => ['x_field' => 'month', 'y_field' => 'revenue', 'agg' => 'sum'],
            'position' => ['x' => 3, 'y' => 4, 'w' => 9, 'h' => 4],
        ]);

        Chart::create([
            'dashboard_id' => $dashboard->id,
            'dataset_id' => $dataset->id,
            'title' => 'All Records',
            'type' => 'table',
            'config' => [],
            'position' => ['x' => 0, 'y' => 8, 'w' => 12, 'h' => 4],
        ]);
    }
}
