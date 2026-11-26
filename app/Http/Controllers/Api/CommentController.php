<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Comment;
use App\Models\Dashboard;
use App\Models\User;
use App\Notifications\CommentActivity;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Discussion on dashboards and charts. Anyone who can view a dashboard may comment (that's the
 * point: partners with read-only access can still ask "why did this drop?"). Mentions are limited
 * to people who can see the dashboard, so a mention never leaks it to an outsider.
 */
class CommentController extends Controller
{
    public function index(Request $request, Dashboard $dashboard)
    {
        $this->authorize('view', $dashboard);

        $threads = Comment::where('dashboard_id', $dashboard->id)
            ->whereNull('parent_id')
            ->with(['user:id,name,email', 'resolvedBy:id,name', 'replies.user:id,name,email'])
            ->latest()
            ->get();

        return $threads->map(fn (Comment $c) => $this->present($c, $request->user(), $dashboard));
    }

    /** People who can be @mentioned here: everyone with access to the dashboard. */
    public function mentionable(Request $request, Dashboard $dashboard)
    {
        $this->authorize('view', $dashboard);

        return $this->audience($dashboard)
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        $this->authorize('view', $dashboard);

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:4000'],
            'chart_id' => ['nullable', 'integer'],
            'parent_id' => ['nullable', 'integer'],
            'mentions' => ['nullable', 'array', 'max:20'],
            'mentions.*' => ['integer'],
        ]);

        $parent = null;
        if (! empty($validated['parent_id'])) {
            $parent = Comment::where('dashboard_id', $dashboard->id)->findOrFail($validated['parent_id']);
            // Replies always attach to the thread root and inherit its chart.
            $parent = $parent->parent_id ? $parent->parent : $parent;
        }

        $chartId = $parent?->chart_id ?? ($validated['chart_id'] ?? null);
        if ($chartId) {
            abort_unless($dashboard->charts()->whereKey($chartId)->exists(), Response::HTTP_UNPROCESSABLE_ENTITY, 'That chart is not on this dashboard.');
        }

        $audience = $this->audience($dashboard)->keyBy('id');
        $mentions = collect($validated['mentions'] ?? [])->unique()
            ->filter(fn ($id) => $audience->has($id) && $id !== $request->user()->id)
            ->values()->all();

        $comment = Comment::create([
            'dashboard_id' => $dashboard->id,
            'chart_id' => $chartId,
            'user_id' => $request->user()->id,
            'parent_id' => $parent?->id,
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
            $this->present($root->fresh(['user:id,name,email', 'resolvedBy:id,name', 'replies.user:id,name,email']), $request->user(), $dashboard),
            Response::HTTP_CREATED
        );
    }

    public function update(Request $request, Comment $comment)
    {
        $dashboard = $comment->dashboard;
        $this->authorize('view', $dashboard);

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

        return $this->present($root->fresh(['user:id,name,email', 'resolvedBy:id,name', 'replies.user:id,name,email']), $request->user(), $dashboard);
    }

    public function destroy(Request $request, Comment $comment)
    {
        $dashboard = $comment->dashboard;
        $this->authorize('view', $dashboard);
        abort_unless(
            $comment->user_id === $request->user()->id || $request->user()->can('manage', $dashboard),
            Response::HTTP_FORBIDDEN,
            'Only the author or a dashboard manager can delete this comment.'
        );

        $comment->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /** @return Collection<int, User> */
    protected function audience(Dashboard $dashboard): Collection
    {
        $orgMembers = $dashboard->organization?->members()->get(['users.id', 'users.name', 'users.email']) ?? collect();
        $guests = User::whereIn('id', $dashboard->collaborators()->pluck('user_id'))->get(['id', 'name', 'email']);
        $owner = User::whereKey($dashboard->user_id)->get(['id', 'name', 'email']);

        return $orgMembers->concat($guests)->concat($owner)->unique('id')->values();
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
            'resolved_at' => $c->resolved_at,
            'resolved_by' => $c->resolvedBy?->name,
            'can_resolve' => $c->user_id === $viewer->id || $canEditDashboard,
            'replies' => $c->replies->map($one)->values()->all(),
        ];
    }
}
