<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillOrganizations extends Command
{
    protected $signature = 'orgs:backfill';

    protected $description = 'One-time: give every existing user (who predates organizations) a personal organization, and move their data sources/dashboards into it';

    public function handle(): int
    {
        $users = User::whereNull('current_organization_id')->get();

        if ($users->isEmpty()) {
            $this->info('No users need backfilling.');

            return self::SUCCESS;
        }

        foreach ($users as $user) {
            DB::transaction(function () use ($user) {
                $organization = Organization::create(['name' => "{$user->name}'s workspace"]);

                $organization->members()->attach($user->id, ['role' => 'owner']);

                $user->forceFill(['current_organization_id' => $organization->id])->save();

                $user->dataSources()->update(['organization_id' => $organization->id]);
                $user->dashboards()->update(['organization_id' => $organization->id]);
            });
        }

        $this->info("Backfilled {$users->count()} user(s) into their own organization.");

        return self::SUCCESS;
    }
}
