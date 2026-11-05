<?php

namespace App\Console\Commands;

use App\Models\DataModel;
use App\Services\DataModelService;
use Illuminate\Console\Command;
use Throwable;

class RunScheduledDataModels extends Command
{
    protected $signature = 'data-models:run-scheduled';

    protected $description = 'Re-runs every hourly/daily data model whose next_run_at has passed, mirroring how resync keeps a live data source current';

    public function handle(DataModelService $service): int
    {
        $due = DataModel::where('schedule', '!=', 'manual')
            ->where(fn ($q) => $q->whereNull('next_run_at')->orWhere('next_run_at', '<=', now()))
            ->get();

        $ran = 0;
        $failed = 0;

        foreach ($due as $dataModel) {
            try {
                $service->run($dataModel);
                $ran++;
            } catch (Throwable $e) {
                $failed++;
            }
        }

        $this->info("Ran {$ran} scheduled data model(s), {$failed} failed.");

        return self::SUCCESS;
    }
}
