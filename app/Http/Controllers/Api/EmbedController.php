<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Chart;
use App\Models\Dashboard;
use App\Models\DashboardEmbed;
use App\Models\DashboardShare;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\ChartDataService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Embedding a dashboard in another website or app (an <iframe> of /embed/{token}).
 *
 * Who: the owning company's dashboard managers, or an owner/admin of a partner workspace the
 * dashboard was shared with — a partner's embed always carries that share's live row filters,
 * so it can never show more than the partner itself may see (and dies with the share).
 * Where: optionally only inside the listed domains (enforced with CSP frame-ancestors).
 */
class EmbedController extends Controller
{
    protected const OPERATORS = ['=', '!=', 'contains', 'in'];

    public function __construct(protected ChartDataService $chartData, protected AuditLogger $auditLog)
    {
    }

    public static function url(string $token): string
    {
        return rtrim(config('services.frontend_url'), '/')."/embed/{$token}";
    }

    public function index(Request $request, Dashboard $dashboard)
    {
        [$orgId] = $this->embedderContext($dashboard, $request->user());

        return DashboardEmbed::where('dashboard_id', $dashboard->id)->where('organization_id', $orgId)
            ->latest()->get()->map(fn (DashboardEmbed $e) => $this->present($e));
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        [$orgId, $share] = $this->embedderContext($dashboard, $request->user());

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'allowed_domains' => ['nullable', 'array', 'max:10'],
            'allowed_domains.*' => ['string', 'max:253'],
            'expires_in_days' => ['nullable', 'integer', 'in:7,30,90,365'],
            'row_filters' => ['nullable', 'array', 'max:5'],
            'row_filters.*.field' => ['required', 'string'],
            'row_filters.*.operator' => ['required', 'in:'.implode(',', self::OPERATORS)],
            'row_filters.*.value' => ['required'],
        ]);

        $token = Str::random(48);
        $embed = DashboardEmbed::create([
            'dashboard_id' => $dashboard->id,
            'organization_id' => $orgId,
            'dashboard_share_id' => $share?->id,
            'name' => trim($validated['name']),
            'token_hash' => hash('sha256', $token),
            'token_encrypted' => $token,
            'allowed_domains' => $this->cleanDomains($validated['allowed_domains'] ?? []) ?: null,
            'row_filters' => $this->cleanFilters($dashboard, $validated['row_filters'] ?? []) ?: null,
            'expires_at' => isset($validated['expires_in_days']) ? now()->addDays($validated['expires_in_days']) : null,
            'created_by_id' => $request->user()->id,
        ]);

        $this->auditLog->log($orgId, $request->user()->id, 'dashboard.embed_created', "Created embed \"{$embed->name}\" for \"{$dashboard->name}\"", $embed);

        return response()->json($this->present($embed), 201);
    }

    public function destroy(Request $request, DashboardEmbed $embed)
    {
        $this->embedderContext($embed->dashboard, $request->user(), $embed->organization_id);

        $embed->delete();
        $this->auditLog->log($embed->organization_id, $request->user()->id, 'dashboard.embed_revoked', "Revoked embed \"{$embed->name}\"");

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /** Public: the dashboard as the iframe shows it, with the embedding company's branding. */
    public function show(string $token)
    {
        $embed = $this->live($token);
        $embed->increment('view_count', 1, ['last_viewed_at' => now()]);
        $dashboard = $embed->dashboard->load('charts.dataset:id,name,columns');

        return [
            'name' => $dashboard->name,
            'description' => $dashboard->description,
            'charts' => $dashboard->charts,
            'branding' => $embed->organization->branding(),
        ];
    }

    /** Public: frame-ancestors policy for the embed page (read by the Next.js proxy). */
    public function framePolicy(string $token)
    {
        $embed = DashboardEmbed::findByToken($token);

        return ['allowed_domains' => $embed && $embed->isLive() ? ($embed->allowed_domains ?? []) : null];
    }

    public function chartData(Request $request, string $token, Chart $chart)
    {
        $embed = $this->live($token);
        abort_unless($chart->dashboard_id === $embed->dashboard_id, Response::HTTP_NOT_FOUND);

        $viewerFilters = $request->input('filters', []);
        // All ANDed: the chart's own, the share's (live), the embed's, then whatever the viewer picks.
        $filters = array_merge(
            $chart->filters ?? [],
            $embed->share?->row_filters ?? [],
            $embed->row_filters ?? [],
            is_array($viewerFilters) ? $viewerFilters : []
        );

        try {
            $data = $this->chartData->run($chart->dataset, $chart->type, $chart->config ?? [], $filters);
        } catch (InvalidArgumentException $e) {
            throw ValidationException::withMessages(['config' => [$e->getMessage()]]);
        }

        return response()->json($data);
    }

    protected function live(string $token): DashboardEmbed
    {
        $embed = DashboardEmbed::findByToken($token);
        abort_unless($embed && $embed->isLive(), Response::HTTP_NOT_FOUND, 'This embed is no longer available.');

        return $embed;
    }

    /**
     * Which workspace embeds, and through which share: the owning side needs to manage the
     * dashboard; a partner needs owner/admin of a workspace with an active share of it.
     *
     * @return array{0: int, 1: DashboardShare|null}
     */
    protected function embedderContext(Dashboard $dashboard, User $user, ?int $forOrg = null): array
    {
        if (($forOrg === null || $forOrg === $dashboard->organization_id) && $user->can('manage', $dashboard)) {
            return [$dashboard->organization_id, null];
        }

        $orgId = $forOrg ?? $user->current_organization_id;
        $share = DashboardShare::active()->where('dashboard_id', $dashboard->id)->where('organization_id', $orgId)->first();
        abort_unless(
            $share && in_array($user->roleInOrganization($orgId), ['owner', 'admin'], true),
            Response::HTTP_FORBIDDEN,
            'Only a dashboard manager, or an admin of a company it was shared with, can embed it.'
        );

        return [$orgId, $share];
    }

    /** "https://www.Example.com/path" → "www.example.com"; "*.example.com" allowed. */
    protected function cleanDomains(array $domains): array
    {
        return collect($domains)
            ->map(fn ($d) => strtolower(trim((string) $d)))
            ->map(fn ($d) => preg_replace('#^[a-z]+://#', '', $d))
            ->map(fn ($d) => explode('/', $d)[0])
            ->filter()
            ->each(function ($d) {
                if (! preg_match('/^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+(:\d{1,5})?$/', $d)) {
                    throw ValidationException::withMessages(['allowed_domains' => ["Not a valid domain: {$d}"]]);
                }
            })
            ->unique()->values()->all();
    }

    protected function cleanFilters(Dashboard $dashboard, array $filters): array
    {
        $columns = $dashboard->charts()->with('dataset:id,columns')->get()
            ->flatMap(fn ($c) => collect($c->dataset?->columns ?? [])->pluck('name'))
            ->unique()->all();

        return collect($filters)->map(function (array $f) use ($columns) {
            abort_unless(in_array($f['field'], $columns, true), Response::HTTP_UNPROCESSABLE_ENTITY, "Unknown field: {$f['field']}");
            $value = $f['operator'] === 'in'
                ? array_values(array_filter(array_map('strval', (array) $f['value']), 'strlen'))
                : (string) (is_array($f['value']) ? reset($f['value']) : $f['value']);
            abort_if($value === '' || $value === [], Response::HTTP_UNPROCESSABLE_ENTITY, 'Each row filter needs a value.');

            return ['field' => $f['field'], 'operator' => $f['operator'], 'value' => $value];
        })->values()->all();
    }

    protected function present(DashboardEmbed $e): array
    {
        $url = self::url($e->token_encrypted);

        return [
            'id' => $e->id,
            'name' => $e->name,
            'url' => $url,
            'snippet' => '<iframe src="'.e($url).'" width="100%" height="800" style="border:0;border-radius:12px" loading="lazy" title="'.e($e->name).'"></iframe>',
            'allowed_domains' => $e->allowed_domains ?? [],
            'row_filters' => $e->row_filters ?? [],
            'inherits_share_filters' => (bool) $e->dashboard_share_id,
            'expires_at' => $e->expires_at,
            'live' => $e->isLive(),
            'view_count' => $e->view_count,
            'last_viewed_at' => $e->last_viewed_at,
            'created_at' => $e->created_at,
        ];
    }
}
