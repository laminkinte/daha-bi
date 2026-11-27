<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

/**
 * Runs one sandboxed notebook cell on the dedicated `python` queue worker.
 *
 * Why a worker: PHP-FPM on the server is shared with other sites and hardened with systemd
 * RestrictNamespaces=yes, which (rightly) forbids creating the namespaces bubblewrap needs.
 * The supervisor-managed worker isn't under that restriction, so the sandbox runs there and the
 * web request just waits for the result in the cache.
 */
class RunPythonCell implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 90;

    /** @param string[] $command */
    public function __construct(public array $command, public string $resultKey, public int $seconds)
    {
    }

    public function handle(): void
    {
        $process = new Process($this->command);
        $process->setTimeout($this->seconds);
        $timedOut = false;

        try {
            $process->run();
        } catch (ProcessTimedOutException) {
            $timedOut = true;
        }

        Cache::put($this->resultKey, [
            'timed_out' => $timedOut,
            'exit' => $timedOut ? null : $process->getExitCode(),
            'stderr' => mb_substr($process->getErrorOutput(), 0, 4000),
        ], 300);
    }
}
