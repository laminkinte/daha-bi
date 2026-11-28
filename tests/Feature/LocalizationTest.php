<?php

namespace Tests\Feature;

use App\Mail\InvitationMail;
use App\Services\AiPromptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** French and Arabic reach every part: API messages, validation, emails and AI answers. */
class LocalizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        Mail::fake();
    }

    public function test_api_messages_and_validation_follow_the_interface_language(): void
    {
        $this->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password'], ['Accept-Language' => 'fr'])
            ->assertJsonPath('errors.email.0', 'Les identifiants fournis sont incorrects.');

        $this->postJson('/api/register', ['name' => 'Ada'], ['Accept-Language' => 'ar'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.email.0', 'حقل البريد الإلكتروني مطلوب.');

        // English stays the default.
        $this->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password'])
            ->assertJsonPath('errors.email.0', 'The provided credentials are incorrect.');
    }

    public function test_plan_limits_are_explained_in_the_users_language(): void
    {
        [$user, $token] = $this->registerUser('Free', null, 'free');
        for ($i = 0; $i < 15; $i++) {
            $user->dashboards()->create(['name' => "D{$i}", 'organization_id' => $user->current_organization_id]);
        }

        $this->asToken($token)->postJson('/api/dashboards', ['name' => 'X'], ['Accept-Language' => 'fr'])
            ->assertStatus(402)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Votre forfait Gratuit inclut 15 tableaux de bord'));
    }

    public function test_the_language_is_remembered_and_emails_go_out_in_it(): void
    {
        $this->postJson('/api/register', ['name' => 'Amina', 'email' => 'amina@example.com', 'password' => 'password123'], ['Accept-Language' => 'ar'])
            ->assertCreated();
        $user = \App\Models\User::where('email', 'amina@example.com')->first();
        $this->assertSame('ar', $user->locale);
        $this->assertSame('ar', $user->preferredLocale());

        // Switching language in the app updates it.
        $token = $user->createToken('api')->plainTextToken;
        $this->asToken($token)->getJson('/api/user', ['Accept-Language' => 'fr'])->assertOk();
        $this->assertSame('fr', $user->fresh()->locale);

        // An invitation goes out in the sender's language, with translated wording.
        $orgId = $user->current_organization_id;
        $this->asToken($token)->postJson("/api/organizations/{$orgId}/members", ['email' => 'mate@example.com', 'role' => 'viewer'], ['Accept-Language' => 'fr'])
            ->assertStatus(202);
        Mail::assertSent(InvitationMail::class, function (InvitationMail $mail) {
            $this->assertSame('fr', $mail->locale);
            $html = $mail->render();

            return str_contains($html, "Accepter l'invitation") || str_contains($html, 'Accepter l&#039;invitation');
        });
    }

    public function test_ai_is_told_to_answer_in_the_interface_language(): void
    {
        $body = ['system_instruction' => ['parts' => [['text' => 'You are a BI assistant.']]]];

        $this->assertSame($body, AiPromptService::withAnswerLanguage($body));

        app()->setLocale('ar');
        $parts = AiPromptService::withAnswerLanguage($body)['system_instruction']['parts'];
        $this->assertCount(2, $parts);
        $this->assertStringContainsString('in Arabic', $parts[1]['text']);
        $this->assertStringContainsString('Do NOT translate JSON keys', $parts[1]['text']);
    }
}
