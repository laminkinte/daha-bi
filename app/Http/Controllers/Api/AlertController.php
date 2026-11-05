<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Alert;
use App\Models\Chart;
use App\Services\AlertCheckService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AlertController extends Controller
{
    public function __construct(protected AlertCheckService $alertCheck)
    {
    }

    public function index(Request $request)
    {
        $user = $request->user();

        $alerts = Alert::where('user_id', $user->id)
            ->with('chart:id,title,dashboard_id', 'chart.dashboard:id,name')
            ->get();

        $alerts->each(fn (Alert $alert) => $this->alertCheck->check($alert));

        return $alerts;
    }

    public function forChart(Request $request, Chart $chart)
    {
        $this->authorize('view', $chart);

        $alerts = $chart->alerts()->where('user_id', $request->user()->id)->get();
        $alerts->each(fn (Alert $alert) => $this->alertCheck->check($alert));

        return $alerts;
    }

    public function store(Request $request, Chart $chart)
    {
        $this->authorize('view', $chart);

        abort_unless($chart->type === 'kpi', Response::HTTP_UNPROCESSABLE_ENTITY, 'Alerts can only be set on KPI charts.');

        $validated = $request->validate([
            'condition' => ['required', 'in:above,below,anomaly'],
            'threshold' => ['required_unless:condition,anomaly', 'numeric'],
            'sensitivity' => ['sometimes', 'numeric', 'min:0.5'],
        ]);

        if ($validated['condition'] === 'anomaly' && empty($chart->config['x_field'] ?? null)) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'This chart needs an x-axis field (a trend) set to support anomaly detection.');
        }

        $alert = $chart->alerts()->create([
            'user_id' => $request->user()->id,
            'condition' => $validated['condition'],
            'threshold' => $validated['threshold'] ?? null,
            'sensitivity' => $validated['sensitivity'] ?? 2.5,
        ]);

        $this->alertCheck->check($alert);

        return response()->json($alert, 201);
    }

    public function destroy(Request $request, Alert $alert)
    {
        $this->authorize('delete', $alert);

        $alert->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
