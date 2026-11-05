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
