<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Hard stop before RefreshDatabase can touch anything that isn't the test database.
        $database = config('database.connections.'.config('database.default').'.database');
        if (! str_ends_with((string) $database, '_testing')) {
            throw new RuntimeException("Refusing to run tests against database \"{$database}\".");
        }
    }

    /**
     * Register through the real endpoint so the user gets a personal organization exactly
     * as in production. Returns [user, bearer token].
     *
     * @return array{0: User, 1: string}
     */
    protected function registerUser(string $name = 'Test User', ?string $email = null): array
    {
        $response = $this->postJson('/api/register', [
            'name' => $name,
            'email' => $email ?? strtolower(str_replace(' ', '.', $name)).'.'.uniqid().'@example.com',
            'password' => 'password123',
        ])->assertCreated();

        return [User::findOrFail($response->json('user.id')), $response->json('token')];
    }

    protected function asToken(string $token): static
    {
        // Sanctum caches the resolved user per app instance; reset it so switching tokens works.
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }
}
