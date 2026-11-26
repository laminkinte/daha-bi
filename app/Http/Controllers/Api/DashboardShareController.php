<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\DashboardShareMail;
use App\Models\Dashboard;
use App\Models\DashboardShare;
use App\Models\Organization;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Sharing a dashboard with another company's whole workspace. Everyone in the partner workspace
 * gets read-only access; optional row filters limit which rows they see (enforced centrally in
 * ChartDataService::baseQuery, so every chart, slicer, export and AI summary obeys them).
 */
class DashboardShareController extends Controller
{
    public const VALID_DAYS = 14;

    protected const OPERATORS = ['=', '!=', 'contains', 'in'];

    public function __construct(protected AuditLogger $auditLog)
    {
    }

    public static function url(string $token): string
    {
        return rtrim(config('services.frontend_url'), '/')."/share/{$token}";
    }

    public function index(Request $request, Dashboard $dashboard)
    {
        $this->authorize('manage', $dashboard);

        return $dashboard->shares()->with('organization:id,name')->latest()->get()->map(fn (DashboardShare $s) => $this->present($s));
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        $this->authorize('manage', $dashboard);

        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'row_filters' => ['nullable', 'array', 'max:5'],
            'row_filters.*.field' => ['required', 'string'],
            'row_filters.*.operator' => ['required', 'in:'.implode(',', self::OPERATORS)],
            'row_filters.*.value' => ['required'],
        ]);

        $filters = $this->cleanFilters($dashboard, $validated['row_filters'] ?? []);
        $token = Str::random(48);

        $share = $dashboard->shares()->create([
            'invited_email' => Str::lower(trim($validated['email'])),
            'row_filters' => $filters ?: null,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays(self::VALID_DAYS),
            'created_by_id' => $request->user()->id,
        ]);

        $sent = true;
        try {
            Mail::to($share->invited_email)->send(new DashboardShareMail($share->load('dashboard.organization', 'createdBy'), self::url($token)));
        } catch (Throwable $e) {
            Log::warning('Share email failed: '.$e->getMessage());
            $sent = false;
        }

        $this->auditLog->log(
            $dashboard->organization_id,
            $request->user()->id,
            'dashboard.shared_with_company',
            "Offered \"{$dashboard->name}\" to {$share->invited_email}'s company".($filters ? ' (filtered rows)' : ''),
            $share
        );

        return response()->json($this->present($share) + ['share_url' => self::url($token), 'email_sent' => $sent], 201);
    }

    /** Change which rows the partner sees (takes effect immediately). */
    public function update(Request $request, DashboardShare $share)
    {
        $this->authorize('manage', $share->dashboard);

        $validated = $request->validate([
            'row_filters' => ['nullable', 'array', 'max:5'],
            'row_filters.*.field' => ['required', 'string'],
            'row_filters.*.operator' => ['required', 'in:'.implode(',', self::OPERATORS)],
            'row_filters.*.value' => ['required'],
        ]);

        $filters = $this->cleanFilters($share->dashboard, $validated['row_filters'] ?? []);
        $share->update(['row_filters' => $filters ?: null]);

        return $this->present($share->fresh('organization'));
    }

    public function destroy(Request $request, DashboardShare $share)
    {
        $dashboard = $share->dashboard;
        $this->authorize('manage', $dashboard);

        $share->delete();
        $this->auditLog->log(
            $dashboard->organization_id,
            $request->user()->id,
            'dashboard.share_revoked',
            "Stopped sharing \"{$dashboard->name}\" with ".($share->organization?->name ?? $share->invited_email)
        );

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /** Public preview for the /share/{token} page. */
    public function preview(Request $request, string $token)
    {
        $share = DashboardShare::findByToken($token);
        abort_unless($share, Response::HTTP_NOT_FOUND, 'This share link is not valid. It may have been withdrawn.');

        return [
            'dashboard' => $share->dashboard->name,
            'from_company' => $share->dashboard->organization?->name,
            'shared_by' => $share->createdBy?->name,
            'email' => $share->invited_email,
            'filtered' => ! empty($share->row_filters),
            'status' => $share->accepted_at ? 'accepted' : ($share->expires_at->isPast() ? 'expired' : 'pending'),
            'expires_at' => $share->expires_at,
        ];
    }

    /** An owner/admin of the receiving workspace accepts the share for their whole team. */
    public function accept(Request $request, string $token)
    {
        $share = DashboardShare::findByToken($token);
        abort_unless($share, Response::HTTP_NOT_FOUND, 'This share link is not valid.');
        abort_if($share->accepted_at, Response::HTTP_UNPROCESSABLE_ENTITY, 'This share has already been accepted.');
        abort_if($share->expires_at->isPast(), Response::HTTP_UNPROCESSABLE_ENTITY, 'This share link has expired. Ask for a new one.');

        $validated = $request->validate(['organization_id' => ['required', 'integer']]);
        $user = $request->user();
        $organization = Organization::findOrFail($validated['organization_id']);

        abort_unless(
            in_array($user->roleInOrganization($organization->id), ['owner', 'admin'], true),
            Response::HTTP_FORBIDDEN,
            'Only an owner or admin of that workspace can accept a company share.'
        );
        abort_if($organization->id === $share->dashboard->organization_id, Response::HTTP_UNPROCESSABLE_ENTITY, 'This dashboard already belongs to that workspace.');
        abort_if(
            DashboardShare::where('dashboard_id', $share->dashboard_id)->where('organization_id', $organization->id)->exists(),
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'That workspace already has this dashboard.'
        );

        $share->update(['organization_id' => $organization->id, 'accepted_at' => now(), 'accepted_by_id' => $user->id]);

        foreach ([$share->dashboard->organization_id, $organization->id] as $orgId) {
            $this->auditLog->log($orgId, $user->id, 'dashboard.share_accepted', "{$organization->name} accepted \"{$share->dashboard->name}\" from {$share->dashboard->organization?->name}", $share);
        }

        if ($user->current_organization_id !== $organization->id) {
            $user->forceFill(['current_organization_id' => $organization->id])->save();
        }

        return ['dashboard_id' => $share->dashboard_id, 'organization_id' => $organization->id];
    }

    /** Only real columns of the dashboard's datasets; values kept as plain strings. */
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

    protected function present(DashboardShare $s): array
    {
        return [
            'id' => $s->id,
            'email' => $s->invited_email,
            'company' => $s->organization?->name,
            'row_filters' => $s->row_filters ?? [],
            'status' => $s->accepted_at ? 'active' : ($s->expires_at->isPast() ? 'expired' : 'pending'),
            'accepted_at' => $s->accepted_at,
            'expires_at' => $s->expires_at,
            'created_at' => $s->created_at,
        ];
    }
}
