<?php

namespace App\Http\Middleware;

use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Models\Chart;
use App\Models\Dashboard;
use App\Models\Dataset;
use App\Models\DataSource;
use App\Models\Goal;
use App\Models\Organization;
use App\Support\PlanGate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `plan:ai`, `plan:notebook`… on a route: the workspace that owns what the request touches (its
 * dashboard, dataset, data source…, else the user's current workspace) must have that feature.
 */
class RequirePlanFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $organization = $this->organizationFor($request);
        if ($organization) {
            PlanGate::require($organization, $feature, $request->user());
        }

        return $next($request);
    }

    protected function organizationFor(Request $request): ?Organization
    {
        $route = $request->route();
        $id = match (true) {
            ($p = $route?->parameter('dashboard')) instanceof Dashboard => $p->organization_id,
            ($p = $route?->parameter('chart')) instanceof Chart => $p->dashboard?->organization_id,
            ($p = $route?->parameter('dataset')) instanceof Dataset => $p->dataSource?->organization_id,
            ($p = $route?->parameter('dataSource')) instanceof DataSource => $p->organization_id,
            ($p = $route?->parameter('organization')) instanceof Organization => $p->id,
            ($p = $route?->parameter('conversation')) instanceof AiConversation => $p->dataset?->dataSource?->organization_id,
            ($p = $route?->parameter('message')) instanceof AiMessage => $p->conversation?->dataset?->dataSource?->organization_id,
            ($p = $route?->parameter('goal')) instanceof Goal => $p->chart?->dashboard?->organization_id,
            default => null,
        };
        // A new conversation names its dataset in the body.
        if (! $id && $request->filled('dataset_id')) {
            $id = Dataset::find($request->integer('dataset_id'))?->dataSource?->organization_id;
        }
        $id ??= $request->user()?->current_organization_id;

        return $id ? Organization::find($id) : null;
    }
}
