<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('reports:send')->everyMinute();
Schedule::command('billing:renew')->daily();
Schedule::command('alerts:check')->everyFifteenMinutes();
Schedule::command('data-models:run-scheduled')->hourly();

// Lets the admin console's System health show whether cron + schedule:run are actually running.
Schedule::call(fn () => \Illuminate\Support\Facades\Cache::put('scheduler:heartbeat', now()->toIso8601String(), 3600))
    ->everyMinute()->name('scheduler-heartbeat');
