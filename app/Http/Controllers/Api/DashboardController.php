<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dashboard;
use App\Models\User;
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
        // ...and dashboards another company shared with the current workspace (shared_by = that company).
        $dashboards = Dashboard::withCount('charts')
            ->with('organization:id,name')
            ->where('organization_id', $user->current_organization_id)
            ->orWhereHas('collaborators', fn ($q) => $q->where('user_id', $user->id))
            ->orWhereHas('shares', fn ($q) => $q->active()->where('organization_id', $user->current_organization_id))
            ->get()
            ->each(function (Dashboard $d) use ($user) {
                $d->setAttribute('role', $d->roleFor($user));
                $d->setAttribute('shared_by', $d->organization_id !== $user->current_organization_id ? $d->organization?->name : null);
                $d->unsetRelation('organization');
                $this->hidePublicLink($d, $user);
            });

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
        $this->authorize('view', $dashboard);

        $dashboard->load('charts.dataset:id,name,columns,updated_at');

        $user = $request->user();
        $this->hidePublicLink($dashboard, $user);
        $partnerSide = $user->roleInOrganization($dashboard->organization_id) === null;

        return $dashboard
            // Managers embed their own dashboards; a partner's owner/admin may embed what was shared with them.
            ->setAttribute('can_embed', $user->can('manage', $dashboard) || ($partnerSide
                && in_array($user->roleInOrganization($user->current_organization_id), ['owner', 'admin'], true)
                && $dashboard->shares()->active()->where('organization_id', $user->current_organization_id)->exists()))
            // The owning company's look, shown next to "Shared with you by…".
            ->setAttribute('shared_by_branding', $partnerSide ? \App\Models\Organization::find($dashboard->organization_id)?->branding() : null)
            ->setAttribute('role', $dashboard->roleFor($user))
            // Set when the viewer reaches this dashboard from another company (a company share or guest invite).
            ->setAttribute('shared_by', $user->roleInOrganization($dashboard->organization_id) === null ? \App\Models\Organization::whereKey($dashboard->organization_id)->value('name') : null)
            // When the freshest dataset behind this dashboard last changed — shown as "Data refreshed".
            ->setAttribute('data_refreshed_at', $dashboard->charts->pluck('dataset.updated_at')->filter()->max());
    }

    /**
     * The public link token shows every row to anyone holding it, so only people who may manage
     * the dashboard ever receive it. A partner company (row-filtered) or a viewer must not, or the
     * token would be a way around their row filters.
     */
    protected function hidePublicLink(Dashboard $dashboard, User $user): void
    {
        if (! $user->can('manage', $dashboard)) {
            $dashboard->makeHidden(['share_token', 'is_shared']);
        }
    }

    /**
     * Distinct values of a field across the datasets this dashboard's charts use, for a filter
     * slicer. Row-level security applies, so restricted viewers only see values they may filter on.
     */
    public function slicerValues(Request $request, Dashboard $dashboard, ChartDataService $chartData)
    {
        $this->authorize('view', $dashboard);

        $field = $request->validate(['field' => ['required', 'string', 'max:255']])['field'];

        $values = $dashboard->charts()->with('dataset.dataSource')->get()
            ->pluck('dataset')->filter()->unique('id')
            ->filter(fn ($dataset) => collect($dataset->columns ?? [])->contains('name', $field))
            ->flatMap(fn ($dataset) => $chartData->distinctValues($dataset, $field, $request->user()))
            ->unique()->sort(SORT_NATURAL | SORT_FLAG_CASE)->values()->take(200);

        return response()->json(['field' => $field, 'values' => $values]);
    }

    public function update(Request $request, Dashboard $dashboard)
    {
        $this->authorize('update', $dashboard);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:255'],
            'settings' => ['sometimes', 'nullable', 'array'],
            'settings.slicers' => ['sometimes', 'array', 'max:8'],
            'settings.slicers.*.field' => ['required', 'string', 'max:255'],
        ]);

        if (array_key_exists('settings', $validated)) {
            // Store only known keys, so the column can't become a dumping ground for arbitrary JSON.
            $validated['settings'] = [
                'slicers' => collect($validated['settings']['slicers'] ?? [])
                    ->map(fn ($s) => ['field' => $s['field']])->unique('field')->values()->all(),
            ];
        }

        $dashboard->update($validated);

        return $dashboard;
    }

    public function destroy(Request $request, Dashboard $dashboard)
    {
        $this->authorize('manage', $dashboard);

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
        $this->authorize('view', $dashboard);

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
        if ($chartType === 'gauge') {
            return $result;
        }

        if ($chartType === 'feed') {
            return ['latest' => array_slice($result['items'] ?? [], 0, 5)];
        }

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
        $this->authorize('manage', $dashboard);

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
        $this->authorize('manage', $dashboard);

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
        $this->authorize('manage', $dashboard);

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
}
