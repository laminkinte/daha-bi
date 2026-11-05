<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Chart;
use App\Models\Dashboard;
use App\Services\ChartDataService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response;

class PublicDashboardController extends Controller
{
    public function __construct(protected ChartDataService $chartData)
    {
    }

    public function show(string $token)
    {
        $dashboard = Dashboard::where('share_token', $token)
            ->where('is_shared', true)
            ->with('charts.dataset:id,name,columns')
            ->firstOrFail();

        return $dashboard->only(['id', 'name', 'description']) + [
            'charts' => $dashboard->charts,
        ];
    }

    public function chartData(Request $request, string $token, Chart $chart)
    {
        $dashboard = Dashboard::where('share_token', $token)
            ->where('is_shared', true)
            ->firstOrFail();

        abort_unless($chart->dashboard_id === $dashboard->id, Response::HTTP_NOT_FOUND);

        $filters = $request->input('filters', []);

        try {
            $data = $this->chartData->run(
                $chart->dataset,
                $chart->type,
                $chart->config ?? [],
                array_merge($chart->filters ?? [], is_array($filters) ? $filters : [])
            );
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['config' => [$e->getMessage()]]);
        }

        return response()->json($data);
    }
}
