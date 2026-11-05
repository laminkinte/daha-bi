<?php

namespace App\Console\Commands;

use App\Models\Alert;
use App\Services\AlertCheckService;
use Illuminate\Console\Command;

class CheckAlerts extends Command
{
    protected $signature = 'alerts:check';

    protected $description = 'Recompute every active alert and email on new breaches — previously alerts only refreshed when a user had the app open';

    public function handle(AlertCheckService $alertCheck): int
    {
        $alerts = Alert::where('is_active', true)->get();

        $breached = 0;

        foreach ($alerts as $alert) {
            $alert = $alertCheck->check($alert);

            if ($alert->last_status === 'breached') {
                $breached++;
            }
        }

        $this->info("Checked {$alerts->count()} alert(s), {$breached} breached.");

        return self::SUCCESS;
    }
}
