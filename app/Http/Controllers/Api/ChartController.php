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

class ChartController extends Controller
{
    public function __construct(protected ChartDataService $chartData)
    {
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        $this->authorize('update', $dashboard);

        $validated = $request->validate([
            'dataset_id' => ['required', 'exists:datasets,id'],
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'in:bar,line,pie,table,kpi,scatter,heatmap,geo_map'],
            'config' => ['nullable', 'array'],
            'filters' => ['nullable', 'array'],
            'position' => ['nullable', 'array'],
        ]);

        $validated['config'] ??= [];

        $this->authorize('useDataset', [$dashboard, \App\Models\Dataset::findOrFail($validated['dataset_id'])]);

        $chart = $dashboard->charts()->create($validated);

        return response()->json($chart, 201);
    }

    public function show(Request $request, Chart $chart)
    {
        $this->authorize('view', $chart);

        return $chart->load('dataset:id,name,columns');
    }

    public function update(Request $request, Chart $chart)
    {
        $this->authorize('update', $chart);

        $validated = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'type' => ['sometimes', 'in:bar,line,pie,table,kpi,scatter,heatmap,geo_map'],
            'config' => ['sometimes', 'array'],
            'filters' => ['nullable', 'array'],
            'position' => ['nullable', 'array'],
        ]);

        $chart->update($validated);

        return $chart;
    }

    public function destroy(Request $request, Chart $chart)
    {
        $this->authorize('update', $chart);

        $chart->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    public function duplicate(Request $request, Chart $chart)
    {
        $this->authorize('update', $chart);

        $copy = $chart->dashboard->charts()->create([
            'dataset_id' => $chart->dataset_id,
            'title' => $chart->title.' (copy)',
            'type' => $chart->type,
            'config' => $chart->config,
            'filters' => $chart->filters,
            'position' => $chart->position,
        ]);

        return response()->json($copy->load('dataset:id,name,columns'), 201);
    }

    public function data(Request $request, Chart $chart)
    {
        $this->authorize('view', $chart);

        $extraFilters = $request->input('filters', []);
        $filters = array_merge($chart->filters ?? [], is_array($extraFilters) ? $extraFilters : []);

        try {
            $data = $this->chartData->run($chart->dataset, $chart->type, $chart->config ?? [], $filters, $request->user());
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['config' => [$e->getMessage()]]);
        }

        return response()->json($data);
    }
}
