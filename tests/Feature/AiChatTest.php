<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Services\ChartDataService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** AI chat: exact dataset profile, row-level security on what the model sees, follow-ups, failure handling. */
class AiChatTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected string $token;

    protected int $datasetId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'main-model', 'services.gemini.fallback_model' => 'lite-model']);

        [$this->owner, $this->token] = $this->registerUser('Owner');
        $csv = "order_id,city,revenue,day\n1,Lagos,100,2025-01-05\n2,Accra,50,2025-01-20\n3,Nairobi,25,2025-02-02\n4,Lagos,10,2025-02-10\n";
        $this->asToken($this->token)->post('/api/data-sources', [
            'type' => 'csv', 'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('s.csv', $csv),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->datasetId = $this->asToken($this->token)->getJson('/api/datasets')->json('0.id');
    }

    protected function fakeGemini(array $answer, int $mainStatus = 200): void
    {
        $ok = ['candidates' => [['content' => ['parts' => [['text' => json_encode($answer)]]]]]];
        Http::fake([
            '*main-model*' => $mainStatus === 200 ? Http::response($ok) : Http::response(['error' => ['message' => 'busy']], $mainStatus),
            '*lite-model*' => Http::response($ok),
        ]);
    }

    public function test_profile_has_exact_totals_and_treats_ids_as_identifiers(): void
    {
        $dataset = \App\Models\Dataset::findOrFail($this->datasetId);
        $profile = app(ChartDataService::class)->profile($dataset, $this->owner);

        $this->assertSame(4, $profile['total_rows']);
        $this->assertEquals(185, $profile['columns']['revenue']['sum']);
        $this->assertSame('identifier', $profile['columns']['order_id']['type']);
        $this->assertSame('Lagos', $profile['columns']['city']['top_values'][0]['value']);
        $this->assertEquals(110, $profile['columns']['city']['top_values'][0]['total_revenue']);
        $this->assertSame(['2025-01', '2025-02'], array_column($profile['monthly_trend']['periods'], 'period'));
    }

    public function test_answer_is_saved_with_follow_ups_and_falls_back_when_main_model_is_busy(): void
    {
        $this->fakeGemini(['response_type' => 'answer', 'answer' => 'Total is **185**.', 'follow_ups' => ['By city?', 'By month?']], 503);

        $conv = $this->asToken($this->token)->postJson('/api/ai-conversations', ['dataset_id' => $this->datasetId])->assertCreated()->json('id');
        $this->asToken($this->token)->postJson("/api/ai-conversations/{$conv}/messages", ['content' => 'Total revenue?'])
            ->assertCreated()
            ->assertJsonPath('assistant_message.content', 'Total is **185**.')
            ->assertJsonPath('assistant_message.follow_ups', ['By city?', 'By month?']);

        Http::assertSent(fn ($r) => str_contains($r->url(), 'lite-model'));
        // The prompt carries the exact profile, not just a sample.
        Http::assertSent(fn ($r) => str_contains($r->url(), 'main-model') && str_contains(json_encode($r->data()), 'DATASET PROFILE'));
    }

    public function test_a_model_that_just_failed_is_skipped_on_the_next_request(): void
    {
        $ok = ['candidates' => [['content' => ['parts' => [['text' => json_encode(['response_type' => 'answer', 'answer' => 'fine'])]]]]]];
        $mainAttempts = 0;
        Http::fake([
            '*main-model*' => function () use (&$mainAttempts) {
                $mainAttempts++;
                throw new \Illuminate\Http\Client\ConnectionException('timed out');
            },
            '*lite-model*' => Http::response($ok),
        ]);

        $conv = $this->asToken($this->token)->postJson('/api/ai-conversations', ['dataset_id' => $this->datasetId])->json('id');
        $this->asToken($this->token)->postJson("/api/ai-conversations/{$conv}/messages", ['content' => 'one'])->assertCreated();
        $this->asToken($this->token)->postJson("/api/ai-conversations/{$conv}/messages", ['content' => 'two'])->assertCreated();

        // The main model was tried once (then remembered as down); the second question went straight to the fallback.
        $this->assertSame(1, $mainAttempts);
        $this->assertCount(2, collect(Http::recorded())->filter(fn ($pair) => str_contains($pair[0]->url(), 'lite-model')));
    }

    public function test_failed_ai_reply_discards_the_question_and_explains(): void
    {
        Http::fake(['*' => Http::response(['error' => ['message' => 'Resource exhausted: quota']], 429)]);

        $conv = $this->asToken($this->token)->postJson('/api/ai-conversations', ['dataset_id' => $this->datasetId])->json('id');
        $this->asToken($this->token)->postJson("/api/ai-conversations/{$conv}/messages", ['content' => 'Hi'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'The AI service is busy right now (rate limit reached). Wait a minute and try again.');

        $this->asToken($this->token)->getJson("/api/ai-conversations/{$conv}")->assertJsonCount(0, 'messages');
    }

    public function test_restricted_viewer_only_exposes_allowed_rows_to_the_model(): void
    {
        $this->asToken($this->token)->postJson("/api/datasets/{$this->datasetId}/row-level-policies", [
            'role' => 'viewer', 'field' => 'city', 'operator' => '=', 'value' => 'Accra',
        ])->assertCreated();

        [$viewer, $viewerToken] = $this->registerUser('Viewer');
        $org = Organization::findOrFail($this->owner->current_organization_id);
        $org->members()->attach($viewer->id, ['role' => 'viewer']);
        $viewer->forceFill(['current_organization_id' => $org->id])->save();

        $this->fakeGemini(['response_type' => 'answer', 'answer' => 'ok']);
        $conv = $this->asToken($viewerToken)->postJson('/api/ai-conversations', ['dataset_id' => $this->datasetId])->assertCreated()->json('id');
        $this->asToken($viewerToken)->postJson("/api/ai-conversations/{$conv}/messages", ['content' => 'Total?'])->assertCreated();

        Http::assertSent(function ($r) {
            $body = json_encode($r->data());

            return str_contains($body, 'Accra') && ! str_contains($body, 'Lagos') && ! str_contains($body, 'Nairobi');
        });
    }
}
