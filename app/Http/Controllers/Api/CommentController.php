<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Comment;
use App\Models\Dashboard;
use App\Models\DashboardShare;
use App\Models\Organization;
use App\Models\User;
use App\Notifications\CommentActivity;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Discussion on dashboards and charts, split into conversation "spaces":
 *  - internal (partner_organization_id = null): the owning company, its guests — never partners;
 *  - one per partner company the dashboard is shared with: that company plus the owning side.
 * So with one dashboard shared to 20 partners, no partner ever reads another's (or the owner's
 * internal) discussion, and mentions can only reach people who can read that space.
 */
class CommentController extends Controller
{
    public function index(Request $request, Dashboard $dashboard)
    {
        $this->authorize('view', $dashboard);
        [$ownerSide, $mySpace] = $this->viewer($dashboard, $request->user());

        $threads = Comment::where('dashboard_id', $dashboard->id)
            ->whereNull('parent_id')
            ->when(! $ownerSide, fn ($q) => $q->where('partner_organization_id', $mySpace))
            ->with(['user:id,name,email', 'resolvedBy:id,name', 'replies.user:id,name,email', 'partnerOrganization:id,name'])
            ->latest()
            ->get();

        return [
            'threads' => $threads->map(fn (Comment $c) => $this->present($c, $request->user(), $dashboard))->values(),
            // Owner side: the partner conversations it can post into. Partners: none (theirs is fixed).
            'spaces' => $ownerSide ? $this->spaces($dashboard) : [],
            'my_space' => $ownerSide ? null : ['id' => $mySpace, 'name' => Organization::whereKey($mySpace)->value('name')],
        ];
    }

    /** People who can be @mentioned in a space: those who can read it. */
    public function mentionable(Request $request, Dashboard $dashboard)
    {
        $this->authorize('view', $dashboard);
        [$ownerSide, $mySpace] = $this->viewer($dashboard, $request->user());

        $space = $ownerSide ? $this->validSpace($dashboard, $request->integer('space') ?: null) : $mySpace;

        return $this->audience($dashboard, $space)
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        $this->authorize('view', $dashboard);
        [$ownerSide, $mySpace] = $this->viewer($dashboard, $request->user());

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:4000'],
            'chart_id' => ['nullable', 'integer'],
            'parent_id' => ['nullable', 'integer'],
            'partner_organization_id' => ['nullable', 'integer'],
            'mentions' => ['nullable', 'array', 'max:20'],
            'mentions.*' => ['integer'],
        ]);

        $parent = null;
        if (! empty($validated['parent_id'])) {
            $parent = Comment::where('dashboard_id', $dashboard->id)->findOrFail($validated['parent_id']);
            // Replies always attach to the thread root and inherit its chart and space.
            $parent = $parent->parent_id ? $parent->parent : $parent;
            $this->ensureVisible($parent, $ownerSide, $mySpace);
        }

        $space = $parent
            ? $parent->partner_organization_id
            : ($ownerSide ? $this->validSpace($dashboard, $validated['partner_organization_id'] ?? null) : $mySpace);

        $chartId = $parent?->chart_id ?? ($validated['chart_id'] ?? null);
        if ($chartId) {
            abort_unless($dashboard->charts()->whereKey($chartId)->exists(), Response::HTTP_UNPROCESSABLE_ENTITY, 'That chart is not on this dashboard.');
        }

        $audience = $this->audience($dashboard, $space)->keyBy('id');
        $mentions = collect($validated['mentions'] ?? [])->unique()
            ->filter(fn ($id) => $audience->has($id) && $id !== $request->user()->id)
            ->values()->all();

        $comment = Comment::create([
            'dashboard_id' => $dashboard->id,
            'chart_id' => $chartId,
            'user_id' => $request->user()->id,
            'parent_id' => $parent?->id,
            'partner_organization_id' => $space,
            'body' => trim($validated['body']),
            'mentions' => $mentions ?: null,
        ]);

        // A reply reopens a resolved thread — someone has more to say.
        if ($parent?->resolved_at) {
            $parent->update(['resolved_at' => null, 'resolved_by_id' => null]);
        }

        $comment->load('user:id,name,email', 'dashboard:id,name');
        $notified = [];
        foreach ($mentions as $id) {
            $this->notify($audience[$id], $comment, 'mention');
            $notified[] = $id;
        }
        // Thread participants hear about replies (unless already notified as a mention).
        if ($parent) {
            $participants = collect([$parent->user_id])->merge($parent->replies()->pluck('user_id'))->unique()
                ->reject(fn ($id) => $id === $request->user()->id || in_array($id, $notified, true));
            foreach ($participants as $id) {
                if ($audience->has($id)) {
                    $this->notify($audience[$id], $comment, 'reply');
                }
            }
        }

        $root = $parent ?? $comment;

        return response()->json(
            $this->present($this->freshThread($root), $request->user(), $dashboard),
            Response::HTTP_CREATED
        );
    }

    public function update(Request $request, Comment $comment)
    {
        $dashboard = $comment->dashboard;
        $this->authorize('view', $dashboard);
        [$ownerSide, $mySpace] = $this->viewer($dashboard, $request->user());
        $this->ensureVisible($comment, $ownerSide, $mySpace);

        $validated = $request->validate([
            'body' => ['sometimes', 'string', 'max:4000'],
            'resolved' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('body', $validated)) {
            abort_unless($comment->user_id === $request->user()->id, Response::HTTP_FORBIDDEN, 'Only the author can edit a comment.');
            $comment->update(['body' => trim($validated['body']), 'edited_at' => now()]);
        }

        if (array_key_exists('resolved', $validated)) {
            abort_if($comment->parent_id, Response::HTTP_UNPROCESSABLE_ENTITY, 'Resolve the thread, not a reply.');
            abort_unless(
                $comment->user_id === $request->user()->id || $request->user()->can('update', $dashboard),
                Response::HTTP_FORBIDDEN,
                'Only the author or an editor can resolve this thread.'
            );
            $comment->update($validated['resolved']
                ? ['resolved_at' => now(), 'resolved_by_id' => $request->user()->id]
                : ['resolved_at' => null, 'resolved_by_id' => null]);
        }

        $root = $comment->parent_id ? $comment->parent : $comment;

        return $this->present($this->freshThread($root), $request->user(), $dashboard);
    }

    public function destroy(Request $request, Comment $comment)
    {
        $dashboard = $comment->dashboard;
        $this->authorize('view', $dashboard);
        [$ownerSide, $mySpace] = $this->viewer($dashboard, $request->user());
        $this->ensureVisible($comment, $ownerSide, $mySpace);
        abort_unless(
            $comment->user_id === $request->user()->id || $request->user()->can('manage', $dashboard),
            Response::HTTP_FORBIDDEN,
            'Only the author or a dashboard manager can delete this comment.'
        );

        $comment->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /**
     * [true, null] for the owning side; [false, orgId] for a partner viewer (their workspace with
     * an active share — the current one if it qualifies).
     *
     * @return array{0: bool, 1: int|null}
     */
    protected function viewer(Dashboard $dashboard, User $user): array
    {
        if ($user->can('viewInternal', $dashboard)) {
            return [true, null];
        }

        $orgIds = $dashboard->shares()->active()
            ->whereIn('organization_id', $user->organizations()->pluck('organizations.id'))
            ->pluck('organization_id');

        return [false, $orgIds->contains($user->current_organization_id) ? $user->current_organization_id : $orgIds->first()];
    }

    protected function ensureVisible(Comment $comment, bool $ownerSide, ?int $mySpace): void
    {
        $root = $comment->parent_id ? $comment->parent : $comment;
        abort_unless($ownerSide || $root->partner_organization_id === $mySpace, Response::HTTP_NOT_FOUND);
    }

    /** A partner space the owner side may post into: an org with an active share, else internal. */
    protected function validSpace(Dashboard $dashboard, ?int $orgId): ?int
    {
        if (! $orgId) {
            return null;
        }
        abort_unless($dashboard->shares()->active()->where('organization_id', $orgId)->exists(), Response::HTTP_UNPROCESSABLE_ENTITY, 'That company does not have this dashboard.');

        return $orgId;
    }

    protected function spaces(Dashboard $dashboard): array
    {
        return DashboardShare::active()->where('dashboard_id', $dashboard->id)->with('organization:id,name')->get()
            ->map(fn ($s) => ['id' => $s->organization_id, 'name' => $s->organization?->name])
            ->values()->all();
    }

    /**
     * Everyone who can read a space: the owning side (company members, author, guests), plus —
     * for a partner space — that partner company's members.
     *
     * @return Collection<int, User>
     */
    protected function audience(Dashboard $dashboard, ?int $space): Collection
    {
        $orgMembers = $dashboard->organization?->members()->get(['users.id', 'users.name', 'users.email']) ?? collect();
        $guests = User::whereIn('id', $dashboard->collaborators()->pluck('user_id'))->get(['id', 'name', 'email']);
        $owner = User::whereKey($dashboard->user_id)->get(['id', 'name', 'email']);
        $partner = $space ? (Organization::find($space)?->members()->get(['users.id', 'users.name', 'users.email']) ?? collect()) : collect();

        return $orgMembers->concat($guests)->concat($owner)->concat($partner)->unique('id')->values();
    }

    protected function freshThread(Comment $root): Comment
    {
        return $root->fresh(['user:id,name,email', 'resolvedBy:id,name', 'replies.user:id,name,email', 'partnerOrganization:id,name']);
    }

    protected function notify(User $user, Comment $comment, string $kind): void
    {
        try {
            $user->notify(new CommentActivity($comment, $kind));
        } catch (Throwable $e) {
            // Email trouble must never lose the comment; the in-app notification is stored first.
            Log::warning('Comment notification failed: '.$e->getMessage());
        }
    }

    protected function present(Comment $c, User $viewer, Dashboard $dashboard): array
    {
        $canEditDashboard = $viewer->can('update', $dashboard);
        $canManage = $viewer->can('manage', $dashboard);
        $one = fn (Comment $x) => [
            'id' => $x->id,
            'body' => $x->body,
            'mentions' => $x->mentions ?? [],
            'user' => $x->user ? ['id' => $x->user->id, 'name' => $x->user->name] : null,
            'created_at' => $x->created_at,
            'edited_at' => $x->edited_at,
            'can_edit' => $x->user_id === $viewer->id,
            'can_delete' => $x->user_id === $viewer->id || $canManage,
        ];

        return $one($c) + [
            'chart_id' => $c->chart_id,
            'space' => $c->partner_organization_id ? ['id' => $c->partner_organization_id, 'name' => $c->partnerOrganization?->name] : null,
            'resolved_at' => $c->resolved_at,
            'resolved_by' => $c->resolvedBy?->name,
            'can_resolve' => $c->user_id === $viewer->id || $canEditDashboard,
            'replies' => $c->replies->map($one)->values()->all(),
        ];
    }
}
