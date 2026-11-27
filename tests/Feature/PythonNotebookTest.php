<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Python notebook: access rules, rich results, row-level security; plus one-click sample data. */
class PythonNotebookTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected string $token;

    protected int $datasetId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        [$this->owner, $this->token] = $this->registerUser('Owner');
        $csv = "city,revenue\nLagos,100\nAccra,50\nNairobi,25\nLagos,10\n";
        $this->asToken($this->token)->post('/api/data-sources', [
            'type' => 'csv', 'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('s.csv', $csv),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->datasetId = $this->asToken($this->token)->getJson('/api/datasets')->json('0.id');
    }

    protected function requirePandas(): void
    {
        $p = new Process([config('services.python.bin'), '-c', 'import pandas']);
        $p->run();
        if (! $p->isSuccessful()) {
            $this->markTestSkipped('Python with pandas is not available on this machine.');
        }
    }

    public function test_status_reflects_access_setting(): void
    {
        config(['services.python.access' => 'all']);
        $this->asToken($this->token)->getJson('/api/notebook/python-status')->assertOk()->assertJsonPath('allowed', true);

        config(['services.python.access' => 'disabled']);
        $this->asToken($this->token)->getJson('/api/notebook/python-status')->assertJsonPath('allowed', false)->assertJsonPath('reason', 'disabled');
        $this->asToken($this->token)->postJson("/api/datasets/{$this->datasetId}/notebook/python", ['code' => 'result = 1'])->assertForbidden();
    }

    public function test_cell_returns_a_table_stdout_and_friendly_errors(): void
    {
        $this->requirePandas();
        config(['services.python.access' => 'all']);

        $res = $this->asToken($this->token)->postJson("/api/datasets/{$this->datasetId}/notebook/python", [
            'code' => "print('rows', len(df))\nresult = df.groupby('city')['revenue'].sum().sort_values(ascending=False)",
        ])->assertOk();
        $this->assertTrue($res->json('run.ok'));
        $this->assertSame("rows 4\n", $res->json('run.stdout'));
        $this->assertSame('table', $res->json('run.result.type'));
        $this->assertSame(['city', 'revenue'], $res->json('run.result.columns'));
        $this->assertEquals(['city' => 'Lagos', 'revenue' => 110], $res->json('run.result.rows.0'));

        $err = $this->asToken($this->token)->postJson("/api/datasets/{$this->datasetId}/notebook/python", ['code' => "x = 1\nresult = df['nope']"])->assertOk();
        $this->assertFalse($err->json('run.ok'));
        $this->assertSame('KeyError', $err->json('run.error.type'));
        $this->assertSame(["Line 2: result = df['nope']"], $err->json('run.error.where'));
    }

    public function test_python_only_sees_rows_the_viewer_is_allowed_to_see(): void
    {
        $this->requirePandas();
        config(['services.python.access' => 'all']);
        $this->asToken($this->token)->postJson("/api/datasets/{$this->datasetId}/row-level-policies", [
            'role' => 'analyst', 'field' => 'city', 'operator' => '=', 'value' => 'Accra',
        ])->assertCreated();
        [$analyst, $analystToken] = $this->registerUser('Analyst');
        Organization::findOrFail($this->owner->current_organization_id)->members()->attach($analyst->id, ['role' => 'analyst']);
        $analyst->forceFill(['current_organization_id' => $this->owner->current_organization_id])->save();

        $res = $this->asToken($analystToken)->postJson("/api/datasets/{$this->datasetId}/notebook/python", ['code' => 'result = sorted(df.city.unique().tolist())'])->assertOk();
        $this->assertSame(1, $res->json('run.rows_loaded'));
        $this->assertSame("['Accra']", $res->json('run.result.value'));
    }

    public function test_sample_data_is_created_once_per_workspace(): void
    {
        $first = $this->asToken($this->token)->postJson('/api/sample-data')->assertCreated();
        $this->assertSame(1500, $first->json('dataset.row_count'));
        $this->assertContains('payment_method', collect($first->json('dataset.columns'))->pluck('name')->all());

        $this->asToken($this->token)->postJson('/api/sample-data')->assertOk()->assertJsonPath('existing', true)
            ->assertJsonPath('dataset.id', $first->json('dataset.id'));
    }
}
