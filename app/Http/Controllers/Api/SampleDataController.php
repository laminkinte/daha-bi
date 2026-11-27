<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataSource;
use App\Services\AuditLogger;
use App\Services\DataIngestionService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * One-click sample dataset so a brand-new workspace can try AI Chat, dashboards and notebooks
 * immediately. Deterministic (seeded) so everyone sees the same, sensible numbers. Goes through
 * the normal CSV ingestion path, so it behaves exactly like an uploaded file.
 */
class SampleDataController extends Controller
{
    public const NAME = 'Sample - African retail sales';

    public function __construct(protected DataIngestionService $ingestion, protected AuditLogger $auditLog)
    {
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $orgId = $user->current_organization_id;
        abort_unless($user->canEditOrg($orgId), Response::HTTP_FORBIDDEN, 'Viewers can’t add data. Ask an admin of this workspace.');

        $existing = DataSource::where('organization_id', $orgId)->where('name', self::NAME)->with('datasets')->first();
        if ($existing && $existing->datasets->isNotEmpty()) {
            return response()->json(['data_source' => $existing, 'dataset' => $existing->datasets->first(), 'existing' => true]);
        }

        $path = tempnam(sys_get_temp_dir(), 'sample').'.csv';
        file_put_contents($path, $this->csv());

        $dataSource = $existing ?? $user->dataSources()->create([
            'organization_id' => $orgId,
            'name' => self::NAME,
            'type' => 'csv',
            'status' => 'syncing',
        ]);

        try {
            $dataset = $this->ingestion->ingestCsv($dataSource, new UploadedFile($path, 'african_retail_sales.csv', 'text/csv', null, true));
            $dataSource->update(['status' => 'ready', 'last_synced_at' => now()]);
            $this->auditLog->log($orgId, $user->id, 'data_source.created', 'Added the sample dataset', $dataSource);
        } catch (Throwable $e) {
            $dataSource->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return response()->json(['message' => 'Couldn’t create the sample data.', 'error' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        } finally {
            @unlink($path);
        }

        return response()->json(['data_source' => $dataSource->fresh(), 'dataset' => $dataset], 201);
    }

    /** ~1,500 orders over the last 12 months across 10 African markets. */
    protected function csv(): string
    {
        mt_srand(20261128);
        $markets = [
            ['Nigeria', ['Lagos', 'Abuja', 'Kano'], 1.0],
            ['Ghana', ['Accra', 'Kumasi'], 0.55],
            ['Kenya', ['Nairobi', 'Mombasa'], 0.7],
            ['South Africa', ['Johannesburg', 'Cape Town', 'Durban'], 0.9],
            ['Egypt', ['Cairo', 'Alexandria'], 0.65],
            ['Senegal', ['Dakar'], 0.3],
            ['The Gambia', ['Banjul', 'Serrekunda'], 0.2],
            ["Côte d'Ivoire", ['Abidjan'], 0.35],
            ['Morocco', ['Casablanca', 'Rabat'], 0.45],
            ['Rwanda', ['Kigali'], 0.25],
        ];
        $products = [
            ['Electronics', 'Smartphone', 180], ['Electronics', 'Solar power bank', 35], ['Electronics', 'Laptop', 520],
            ['Groceries', 'Rice 25kg', 28], ['Groceries', 'Cooking oil 5L', 12], ['Groceries', 'Tea & coffee', 6],
            ['Fashion', 'Ankara fabric', 22], ['Fashion', 'Sneakers', 45], ['Home', 'Gas cooker', 95], ['Home', 'Water filter', 40],
        ];
        $channels = [['Online', 0.4], ['Retail store', 0.4], ['Wholesale', 0.2]];
        $payments = [['Mobile Money', 0.38], ['Card', 0.22], ['Cash on Delivery', 0.25], ['Bank Transfer', 0.15]];
        $segments = ['Consumer', 'Small business', 'Corporate'];

        $pick = function (array $weighted) {
            $r = mt_rand() / mt_getrandmax();
            foreach ($weighted as [$v, $w]) {
                if (($r -= $w) <= 0) {
                    return $v;
                }
            }

            return $weighted[0][0];
        };
        $marketWeights = array_map(fn ($m) => [$m, $m[2] / 5.35], $markets);

        $out = fopen('php://temp', 'w+');
        fputcsv($out, ['order_id', 'order_date', 'country', 'city', 'channel', 'category', 'product', 'payment_method', 'customer_segment', 'quantity', 'unit_price', 'revenue', 'status']);
        $start = now()->subMonths(12)->startOfMonth();
        for ($i = 1; $i <= 1500; $i++) {
            $m = $pick($marketWeights);
            [$category, $product, $price] = $products[mt_rand(0, count($products) - 1)];
            // Gentle growth through the year plus a December peak.
            $day = $start->copy()->addDays((int) floor(sqrt(mt_rand(0, 365 * 365))));
            $season = $day->month === 12 ? 1.35 : 1.0;
            $qty = max(1, (int) round(mt_rand(1, $category === 'Groceries' ? 12 : 4) * $season));
            $unit = round($price * (0.9 + mt_rand(0, 25) / 100), 2);
            fputcsv($out, [
                1000 + $i,
                $day->format('Y-m-d'),
                $m[0],
                $m[1][mt_rand(0, count($m[1]) - 1)],
                $pick($channels),
                $category,
                $product,
                $pick($payments),
                $segments[mt_rand(0, 9) < 6 ? 0 : (mt_rand(0, 2) < 2 ? 1 : 2)],
                $qty,
                $unit,
                round($qty * $unit, 2),
                mt_rand(1, 100) <= 92 ? 'completed' : (mt_rand(0, 1) ? 'returned' : 'cancelled'),
            ]);
        }
        rewind($out);

        return stream_get_contents($out);
    }
}
