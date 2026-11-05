<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dashboard;
use App\Services\AiPromptService;
use App\Services\AuditLogger;
use App\Services\ChartDataService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class DashboardController extends Controller
{
    public function __construct(
        protected AuditLogger $auditLog,
        protected ChartDataService $chartData,
        protected AiPromptService $ai,
    ) {
    }

    public function index(Request $request)
    {
        $user = $request->user();

        // Every dashboard in the current org, plus any dashboard in a *different* org this user
        // has been individually invited to as a guest collaborator (see Dashboard::roleFor()).
        $dashboards = Dashboard::withCount('charts')
            ->where('organization_id', $user->current_organization_id)
            ->orWhereHas('collaborators', fn ($q) => $q->where('user_id', $user->id))
            ->get()
            ->each(fn (Dashboard $d) => $d->setAttribute('role', $d->roleFor($user)));

        return $dashboards->sortByDesc('created_at')->values();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $dashboard = $request->user()->dashboards()->create([
            ...$validated,
            'organization_id' => $request->user()->current_organization_id,
        ]);

        return response()->json($dashboard, 201);
    }

    public function show(Request $request, Dashboard $dashboard)
    {
        $role = $this->authorizeAccess($request, $dashboard);

        return $dashboard->load('charts.dataset:id,name,columns')->setAttribute('role', $role);
    }

    public function update(Request $request, Dashboard $dashboard)
    {
        $this->authorizeEdit($request, $dashboard);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $dashboard->update($validated);

        return $dashboard;
    }

    public function destroy(Request $request, Dashboard $dashboard)
    {
        $this->authorizeOwner($request, $dashboard);

        $this->auditLog->log(
            $dashboard->organization_id,
            $request->user()->id,
            'dashboard.deleted',
            "Deleted \"{$dashboard->name}\"",
            $dashboard
        );

        $dashboard->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /**
     * General-purpose "what should I do about this data" recommendations for any dashboard —
     * not just ones an AI conversation just built. Reuses interpretDashboard(), which already
     * synthesizes across charts and ends with concrete recommendations; the work here is just
     * computing each chart's REAL current data (via the same ChartDataService every other
     * consumer goes through) and condensing it to something a prompt can carry.
     */
    public function aiRecommendations(Request $request, Dashboard $dashboard)
    {
        $this->authorizeAccess($request, $dashboard);

        if (! $this->ai->isConfigured()) {
            return response()->json([
                'message' => 'AI is not configured yet — GEMINI_API_KEY is missing.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $charts = $dashboard->charts()->with('dataset')->get();

        if ($charts->isEmpty()) {
            return response()->json(['message' => 'Add at least one chart before requesting recommendations.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $forAnalysis = $charts->map(function ($chart) use ($request) {
            try {
                $result = $this->chartData->run($chart->dataset, $chart->type, $chart->config ?? [], $chart->filters ?? [], $request->user());
            } catch (\Throwable $e) {
                $result = null;
            }

            return [
                'chart_title' => $chart->title,
                'chart_type' => $chart->type,
                'chart_data' => $result ? $this->condense($chart->type, $result) : 'Unable to compute.',
            ];
        })->all();

        $analysis = $this->ai->interpretDashboard($dashboard->name, $forAnalysis);

        if (! $analysis) {
            return response()->json(['message' => 'AI did not return a response. Try again in a moment.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['analysis' => $analysis]);
    }

    /**
     * Shrinks a chart's computed result to something worth spending prompt tokens on — the top 8
     * categories by value for grouped charts, as-is for a KPI, and just a row/point count for the
     * bulky types (table/scatter/heatmap), matching the same "don't ship the whole payload"
     * reasoning as DashboardReportService::summarize().
     */
    protected function condense(string $chartType, array $result): mixed
    {
        if ($chartType === 'kpi' || $chartType === 'table' || $chartType === 'scatter') {
            if ($chartType === 'table') {
                return ['row_count' => count($result['rows'] ?? [])];
            }

            if ($chartType === 'scatter') {
                return ['point_count' => count($result['points'] ?? [])];
            }

            return $result;
        }

        if ($chartType === 'heatmap') {
            $topCells = collect($result['cells'] ?? [])->sortByDesc('value')->take(8)->values()->all();

            return ['top_cells' => $topCells, 'total_cells' => count($result['cells'] ?? [])];
        }

        $labels = $result['labels'] ?? [];
        $values = $result['values'] ?? [];
        $pairs = collect($labels)->map(fn ($label, $i) => ['label' => $label, 'value' => $values[$i] ?? 0])
            ->sortByDesc('value')
            ->take(8)
            ->values()
            ->all();

        return ['top' => $pairs, 'category_count' => count($labels)];
    }

    public function duplicate(Request $request, Dashboard $dashboard)
    {
        $this->authorizeOwner($request, $dashboard);

        $copy = $request->user()->dashboards()->create([
            'organization_id' => $dashboard->organization_id,
            'name' => $dashboard->name.' (copy)',
            'description' => $dashboard->description,
        ]);

        foreach ($dashboard->charts as $chart) {
            $copy->charts()->create([
                'dataset_id' => $chart->dataset_id,
                'title' => $chart->title,
                'type' => $chart->type,
                'config' => $chart->config,
                'filters' => $chart->filters,
                'position' => $chart->position,
            ]);
        }

        return response()->json($copy->load('charts')->setAttribute('role', 'owner'), 201);
    }

    public function share(Request $request, Dashboard $dashboard)
    {
        $this->authorizeOwner($request, $dashboard);

        $dashboard->update([
            'share_token' => $dashboard->share_token ?? Str::random(32),
            'is_shared' => true,
        ]);

        $this->auditLog->log(
            $dashboard->organization_id,
            $request->user()->id,
            'dashboard.shared',
            "Made \"{$dashboard->name}\" publicly accessible via link",
            $dashboard
        );

        return $dashboard->fresh();
    }

    public function unshare(Request $request, Dashboard $dashboard)
    {
        $this->authorizeOwner($request, $dashboard);

        $dashboard->update(['is_shared' => false]);

        $this->auditLog->log(
            $dashboard->organization_id,
            $request->user()->id,
            'dashboard.unshared',
            "Turned off public access to \"{$dashboard->name}\"",
            $dashboard
        );

        return $dashboard->fresh();
    }

    /**
     * The dashboard's creator can always manage it; so can an org owner/admin, even for a
     * dashboard someone else on their team created.
     */
    protected function authorizeOwner(Request $request, Dashboard $dashboard): void
    {
        $user = $request->user();

        abort_unless(
            $dashboard->user_id === $user->id
                || in_array($user->roleInOrganization($dashboard->organization_id), ['owner', 'admin'], true),
            Response::HTTP_FORBIDDEN
        );
    }

    /**
     * Any role (owner/editor/viewer) may view. Returns the resolved role.
     */
    protected function authorizeAccess(Request $request, Dashboard $dashboard): string
    {
        $role = $dashboard->roleFor($request->user());
        abort_unless($role !== null, Response::HTTP_FORBIDDEN);

        return $role;
    }

    /**
     * Owner or editor may modify dashboard content.
     */
    protected function authorizeEdit(Request $request, Dashboard $dashboard): string
    {
        $role = $dashboard->roleFor($request->user());
        abort_unless(in_array($role, ['owner', 'editor'], true), Response::HTTP_FORBIDDEN);

        return $role;
    }
}
