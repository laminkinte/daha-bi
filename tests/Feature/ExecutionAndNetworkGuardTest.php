<?php

namespace Tests\Feature;

use App\Services\DataIngestionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

/**
 * Guards for the two ways a tenant could escape their organization: running code on the
 * server (Python notebook) and pointing a connector at internal infrastructure.
 */
class ExecutionAndNetworkGuardTest extends TestCase
{
    use RefreshDatabase;

    protected function datasetFor(string $token): int
    {
        Storage::fake();
        $this->asToken($token)->post('/api/data-sources', [
            'type' => 'csv',
            'name' => 'Sales',
            'file' => UploadedFile::fake()->createWithContent('s.csv', "a,b\n1,2\n"),
        ], ['Accept' => 'application/json'])->assertCreated();

        return $this->asToken($token)->getJson('/api/datasets')->json('0.id');
    }

    public function test_regular_user_cannot_run_python(): void
    {
        [, $token] = $this->registerUser('Tenant');
        $datasetId = $this->datasetFor($token);

        $this->asToken($token)
            ->postJson("/api/datasets/{$datasetId}/notebook/python", ['code' => 'import os; result = os.environ'])
            ->assertForbidden()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'restricted'));
    }

    public function test_disabled_python_blocks_even_admins(): void
    {
        config(['services.python.access' => 'disabled']);
        [$user, $token] = $this->registerUser('Admin');
        $user->forceFill(['is_admin' => true])->save();
        $datasetId = $this->datasetFor($token);

        $this->asToken($token)
            ->postJson("/api/datasets/{$datasetId}/notebook/python", ['code' => 'result = 1'])
            ->assertForbidden();
    }

    public function test_database_source_on_loopback_is_rejected(): void
    {
        [, $token] = $this->registerUser('Tenant');

        $response = $this->asToken($token)->postJson('/api/data-sources', [
            'type' => 'mysql',
            'name' => 'Sneaky',
            'host' => '127.0.0.1',
            'database' => 'anything',
            'username' => 'root',
            'table' => 'users',
        ])->assertUnprocessable();

        $this->assertStringContainsString('not allowed', $response->json('error'));
    }

    public function test_rest_source_to_cloud_metadata_is_rejected(): void
    {
        [, $token] = $this->registerUser('Tenant');

        $response = $this->asToken($token)->postJson('/api/data-sources', [
            'type' => 'rest_api',
            'name' => 'Metadata',
            'url' => 'http://169.254.169.254/latest/meta-data/',
            'method' => 'GET',
        ]);

        $this->assertContains($response->status(), [422]);
        $this->assertStringContainsString('not allowed', (string) $response->json('error'));
    }

    public function test_host_guard_rules(): void
    {
        $guard = app(DataIngestionService::class);

        foreach (['127.0.0.1', 'localhost', '10.0.0.5', '192.168.1.10', '172.16.0.1', '169.254.169.254', '0.0.0.0', '::1'] as $host) {
            try {
                $guard->assertAllowedHost($host);
                $this->fail("{$host} should be rejected");
            } catch (RuntimeException) {
                $this->addToAssertionCount(1);
            }
        }

        $guard->assertAllowedHost('8.8.8.8');
        $this->addToAssertionCount(1);
    }

    public function test_own_app_database_is_blocked_even_when_private_hosts_allowed(): void
    {
        config(['services.data_sources.allow_private_hosts' => true]);
        [, $token] = $this->registerUser('Tenant');

        $response = $this->asToken($token)->postJson('/api/data-sources', [
            'type' => 'mysql',
            'name' => 'App DB',
            'host' => 'localhost',
            'database' => config('database.connections.mysql.database'),
            'username' => 'root',
            'table' => 'users',
        ])->assertUnprocessable();

        $this->assertStringContainsString('own application database', $response->json('error'));
    }
}
