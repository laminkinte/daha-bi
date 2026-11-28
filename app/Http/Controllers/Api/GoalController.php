<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Chart;
use App\Models\Goal;
use App\Services\AiPromptService;
use App\Services\ChartDataService;
use App\Services\GoalCheckService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class GoalController extends Controller
{
    public function __construct(
        protected GoalCheckService $goalCheck,
        protected AiPromptService $ai,
        protected ChartDataService $chartData,
    ) {
    }

    public function index(Request $request)
    {
        $goals = Goal::where('organization_id', $request->user()->current_organization_id)
            ->with('chart:id,title,dashboard_id')
            ->latest()
            ->get();

        return $goals->each(fn (Goal $g) => $this->goalCheck->check($g));
    }

    public function forChart(Request $request, Chart $chart)
    {
        $this->authorize('viewInternal', $chart);

        return $chart->goals()->get()->each(fn (Goal $g) => $this->goalCheck->check($g));
    }

    public function store(Request $request, Chart $chart)
    {
        $this->authorize('viewInternal', $chart);

        abort_unless($chart->type === 'kpi', Response::HTTP_UNPROCESSABLE_ENTITY, __('Goals can only be set on KPI charts.'));

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'direction' => ['required', 'in:increase,decrease'],
            'target_value' => ['required', 'numeric'],
            'deadline' => ['nullable', 'date'],
        ]);

        // Snapshot the current value as the starting point — progress is measured from here,
        // not persisted anywhere until the goal itself is created below.
        $current = null;
        try {
            $result = $this->chartData->run($chart->dataset, 'kpi', $chart->config ?? [], $chart->filters ?? [], $request->user());
            $current = is_numeric($result['value'] ?? null) ? (float) $result['value'] : null;
        } catch (\Throwable) {
            // fine — starting_value just stays null, progress falls back to measuring from 0.
        }

        $goal = $chart->goals()->create([
            ...$validated,
            'organization_id' => $chart->dashboard->organization_id,
            'user_id' => $request->user()->id,
            'starting_value' => $current,
        ]);

        $this->goalCheck->check($goal);

        return response()->json($goal->fresh(), 201);
    }

    public function destroy(Request $request, Goal $goal)
    {
        $this->authorize('delete', $goal);

        $goal->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /**
     * Best-effort AI recommendation, generated on demand rather than on every check — an LLM
     * call on every goal refresh would be slow and wasteful when nothing's actually changed.
     */
    public function recommend(Request $request, Goal $goal)
    {
        $this->authorize('update', $goal);

        $this->goalCheck->check($goal);

        if (! $this->ai->isConfigured()) {
            return response()->json([
                'message' => __('AI features are not set up yet. Add a free GEMINI_API_KEY (from Google AI Studio) to the backend .env to enable this.'),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ($goal->last_value === null) {
            return response()->json(['message' => __('No computed value yet for this goal.')], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $recommendation = $this->ai->recommendForGoal(
            $goal->name,
            $goal->last_value,
            $goal->target_value,
            $goal->direction,
            $goal->progressPercent(),
            $goal->deadline?->toDateString()
        );

        return response()->json(['recommendation' => $recommendation]);
    }
}
