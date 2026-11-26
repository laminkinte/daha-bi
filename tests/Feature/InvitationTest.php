<?php

namespace Tests\Feature;

use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** Email invitations for people without an account: workspace + single-dashboard guests. */
class InvitationTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        [$this->owner, $this->token] = $this->registerUser('Owner');
    }

    protected function tokenFrom(string $url): string
    {
        return basename(parse_url($url, PHP_URL_PATH));
    }

    public function test_inviting_unknown_email_creates_pending_invitation_and_signup_joins_workspace(): void
    {
        $orgId = $this->owner->current_organization_id;

        $res = $this->asToken($this->token)->postJson("/api/organizations/{$orgId}/members", ['email' => 'Partner@Acme.com', 'role' => 'analyst'])
            ->assertStatus(202)
            ->assertJsonPath('pending', true)
            ->assertJsonPath('email', 'partner@acme.com');
        Mail::assertSent(InvitationMail::class, fn ($m) => $m->hasTo('partner@acme.com'));

        $inviteToken = $this->tokenFrom($res->json('invite_url'));
        $this->assertNull(Invitation::where('token_hash', $inviteToken)->first(), 'raw token must not be stored');

        $this->getJson("/api/public/invitations/{$inviteToken}")
            ->assertOk()->assertJsonPath('status', 'pending')->assertJsonPath('has_account', false)->assertJsonPath('role', 'analyst');

        $this->asToken($this->token)->getJson("/api/organizations/{$orgId}/invitations")->assertOk()->assertJsonCount(1);

        $reg = $this->postJson('/api/register', [
            'name' => 'Partner', 'email' => 'partner@acme.com', 'password' => 'password123', 'invite_token' => $inviteToken,
        ])->assertCreated()->assertJsonMissingPath('invite_error');

        $partner = User::where('email', 'partner@acme.com')->firstOrFail();
        $this->assertSame('analyst', $partner->roleInOrganization($orgId));
        $this->assertSame($orgId, $reg->json('user.current_organization_id'));

        // One use only, and it no longer shows as pending.
        $this->getJson("/api/public/invitations/{$inviteToken}")->assertJsonPath('status', 'accepted');
        $this->asToken($this->token)->getJson("/api/organizations/{$orgId}/invitations")->assertJsonCount(0);
    }

    public function test_dashboard_guest_invite_grants_only_that_dashboard_after_login_accept(): void
    {
        $dashboardId = $this->asToken($this->token)->postJson('/api/dashboards', ['name' => 'Q3 Partner Report'])->json('id');
        $otherId = $this->asToken($this->token)->postJson('/api/dashboards', ['name' => 'Internal'])->json('id');

        $res = $this->asToken($this->token)->postJson("/api/dashboards/{$dashboardId}/collaborators", ['email' => 'guest@partner.org', 'role' => 'viewer'])
            ->assertStatus(202);
        $inviteToken = $this->tokenFrom($res->json('invite_url'));
        $this->asToken($this->token)->getJson("/api/dashboards/{$dashboardId}/invitations")->assertJsonCount(1);

        // They signed up separately first, then open the link while logged in.
        [, $guestToken] = $this->registerUser('Guest', 'guest@partner.org');
        $this->asToken($guestToken)->postJson("/api/invitations/{$inviteToken}/accept")->assertOk()->assertJsonPath('dashboard_id', $dashboardId);

        $this->asToken($guestToken)->getJson("/api/dashboards/{$dashboardId}")->assertOk();
        $this->asToken($guestToken)->getJson("/api/dashboards/{$otherId}")->assertForbidden();
    }

    public function test_link_only_works_for_the_invited_email_and_expires(): void
    {
        $orgId = $this->owner->current_organization_id;
        $url = $this->asToken($this->token)->postJson("/api/organizations/{$orgId}/members", ['email' => 'a@x.com', 'role' => 'viewer'])->json('invite_url');
        $inviteToken = $this->tokenFrom($url);

        [$intruder, $intruderToken] = $this->registerUser('Intruder', 'intruder@x.com');
        $this->asToken($intruderToken)->postJson("/api/invitations/{$inviteToken}/accept")->assertForbidden();
        $this->assertNull($intruder->roleInOrganization($orgId));

        Invitation::query()->update(['expires_at' => now()->subDay()]);
        [, $rightToken] = $this->registerUser('Right', 'a@x.com');
        $this->asToken($rightToken)->postJson("/api/invitations/{$inviteToken}/accept")->assertStatus(422);
    }

    public function test_resend_rotates_the_link_and_revoke_kills_it(): void
    {
        $orgId = $this->owner->current_organization_id;
        $res = $this->asToken($this->token)->postJson("/api/organizations/{$orgId}/members", ['email' => 'b@x.com', 'role' => 'viewer']);
        $oldToken = $this->tokenFrom($res->json('invite_url'));
        $id = $res->json('id');

        $newUrl = $this->asToken($this->token)->postJson("/api/invitations/{$id}/resend")->assertOk()->json('invite_url');
        $this->getJson("/api/public/invitations/{$oldToken}")->assertNotFound();
        $this->getJson('/api/public/invitations/'.$this->tokenFrom($newUrl))->assertOk();

        // Only managers of that workspace may revoke.
        [, $strangerToken] = $this->registerUser('Stranger');
        $this->asToken($strangerToken)->deleteJson("/api/invitations/{$id}")->assertForbidden();

        $this->asToken($this->token)->deleteJson("/api/invitations/{$id}")->assertNoContent();
        $this->getJson('/api/public/invitations/'.$this->tokenFrom($newUrl))->assertNotFound();
    }
}
