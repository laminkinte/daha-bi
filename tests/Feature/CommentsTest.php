<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Notifications\CommentActivity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/** Comments, threads, @mentions and the notification bell. */
class CommentsTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected string $token;

    protected User $viewer;

    protected string $viewerToken;

    protected int $dashboardId;

    protected function setUp(): void
    {
        parent::setUp();
        [$this->owner, $this->token] = $this->registerUser('Owner');
        [$this->viewer, $this->viewerToken] = $this->registerUser('Viewer');
        $org = Organization::findOrFail($this->owner->current_organization_id);
        $org->members()->attach($this->viewer->id, ['role' => 'viewer']);
        $this->viewer->forceFill(['current_organization_id' => $org->id])->save();
        $this->dashboardId = $this->asToken($this->token)->postJson('/api/dashboards', ['name' => 'Partner KPIs'])->json('id');
    }

    public function test_viewer_can_comment_and_mention_notifies_only_people_with_access(): void
    {
        Notification::fake();
        [$outsider] = $this->registerUser('Outsider');

        $this->asToken($this->viewerToken)->getJson("/api/dashboards/{$this->dashboardId}/mentionable")
            ->assertOk()->assertJsonCount(2);

        $this->asToken($this->viewerToken)->postJson("/api/dashboards/{$this->dashboardId}/comments", [
            'body' => '@Owner why did revenue drop in March?',
            'mentions' => [$this->owner->id, $outsider->id],
        ])->assertCreated()->assertJsonPath('mentions', [$this->owner->id])->assertJsonPath('user.name', 'Viewer');

        Notification::assertSentTo($this->owner, CommentActivity::class, fn ($n) => $n->kind === 'mention');
        Notification::assertNotSentTo($outsider, CommentActivity::class);
    }

    public function test_replies_thread_notify_the_author_and_resolve_rules(): void
    {
        Notification::fake();
        $thread = $this->asToken($this->viewerToken)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'Is Q3 final?'])->json('id');

        $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'Yes', 'parent_id' => $thread])
            ->assertCreated()->assertJsonPath('id', $thread)->assertJsonCount(1, 'replies');
        Notification::assertSentTo($this->viewer, CommentActivity::class, fn ($n) => $n->kind === 'reply');

        // The owner (an editor) can resolve; a viewer can't resolve someone else's thread.
        $other = $this->asToken($this->token)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'Owner note'])->json('id');
        $this->asToken($this->viewerToken)->patchJson("/api/comments/{$other}", ['resolved' => true])->assertForbidden();
        $this->asToken($this->token)->patchJson("/api/comments/{$thread}", ['resolved' => true])->assertOk()->assertJsonPath('resolved_by', 'Owner');

        // Only the author edits; a stranger can't read the thread at all.
        $this->asToken($this->token)->patchJson("/api/comments/{$thread}", ['body' => 'hijack'])->assertForbidden();
        [, $strangerToken] = $this->registerUser('Stranger');
        $this->asToken($strangerToken)->getJson("/api/dashboards/{$this->dashboardId}/comments")->assertForbidden();
        $this->asToken($strangerToken)->postJson("/api/dashboards/{$this->dashboardId}/comments", ['body' => 'x'])->assertForbidden();
    }

    public function test_notification_bell_lists_and_marks_read(): void
    {
        $this->asToken($this->viewerToken)->postJson("/api/dashboards/{$this->dashboardId}/comments", [
            'body' => 'Please check', 'mentions' => [$this->owner->id],
        ])->assertCreated();

        $this->asToken($this->token)->getJson('/api/notifications')
            ->assertOk()->assertJsonPath('unread', 1)
            ->assertJsonPath('items.0.data.kind', 'mention')
            ->assertJsonPath('items.0.data.dashboard_id', $this->dashboardId);

        $this->asToken($this->token)->postJson('/api/notifications/read-all')->assertNoContent();
        $this->asToken($this->token)->getJson('/api/notifications')->assertJsonPath('unread', 0);
    }
}
