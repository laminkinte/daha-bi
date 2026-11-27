<?php

namespace App\Services;

use App\Jobs\RunPythonCell;
use App\Models\Dataset;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

/**
 * Runs a notebook Python cell against a dataset (resources/python/runner.py).
 *
 * Isolation (services.python.sandbox):
 *  - "bwrap" (production): bubblewrap with every namespace unshared — no network, a read-only
 *    /usr and Python environment, private /tmp, only the job folder writable — plus prlimit
 *    caps on memory, CPU time, processes, open files and file size, and a wall-clock timeout.
 *  - "none" (local development only): a plain subprocess. isSandboxed() reports false so the
 *    controller can keep this to platform admins.
 *
 * The data handed to Python goes through ChartDataService, so row-level security and partner
 * row filters apply: a viewer's code can only ever see the rows that viewer may see.
 */
class PythonExecutionService
{
    public const MAX_ROWS = 50000;

    protected const TIMEOUT_SECONDS = 30;

    public function __construct(protected ChartDataService $chartData)
    {
    }

    public function isSandboxed(): bool
    {
        return config('services.python.sandbox') === 'bwrap' && is_executable($this->bwrapBin());
    }

    /**
     * @return array{ok: bool, stdout: string, result: array|null, figures: string[], error: array|null, duration_ms: int, rows_loaded: int}
     */
    public function run(Dataset $dataset, string $code, ?User $user = null): array
    {
        $rows = $this->chartData->sampleRows($dataset, $user, self::MAX_ROWS);

        $dir = storage_path('app/notebook-tmp/'.Str::random(24));
        File::ensureDirectoryExists($dir, 0770);
        File::put("{$dir}/data.json", json_encode($rows, JSON_UNESCAPED_UNICODE));
        File::put("{$dir}/cell.py", $code);
        File::copy(resource_path('python/runner.py'), "{$dir}/runner.py");

        $tooLong = 'Your code ran longer than '.self::TIMEOUT_SECONDS.' seconds and was stopped. Try working on fewer rows (e.g. df.head(1000)) or a simpler calculation.';

        try {
            if (config('services.python.runner') === 'queue') {
                $stderr = $this->runOnWorker($this->command($dir), $tooLong);
            } else {
                $process = new Process($this->command($dir));
                $process->setTimeout(self::TIMEOUT_SECONDS);
                try {
                    $process->run();
                } catch (ProcessTimedOutException) {
                    throw new RuntimeException($tooLong);
                }
                $stderr = $process->getErrorOutput();
            }
            $out = File::exists("{$dir}/out.json") ? json_decode(File::get("{$dir}/out.json"), true) : null;
        } finally {
            File::deleteDirectory($dir);
        }

        if (! is_array($out)) {
            throw new RuntimeException($this->friendlyCrash(trim($stderr)));
        }

        return $out;
    }

    /**
     * Hands the sandboxed command to the dedicated `python` queue worker and waits for it
     * (see RunPythonCell for why). Returns the process's stderr.
     *
     * @param  string[]  $command
     */
    protected function runOnWorker(array $command, string $tooLong): string
    {
        $key = 'python-run:'.Str::random(32);
        RunPythonCell::dispatch($command, $key, self::TIMEOUT_SECONDS)->onQueue('python');

        $deadline = microtime(true) + self::TIMEOUT_SECONDS + 20;
        while (microtime(true) < $deadline) {
            if ($done = Cache::pull($key)) {
                if ($done['timed_out']) {
                    throw new RuntimeException($tooLong);
                }

                return (string) $done['stderr'];
            }
            usleep(150_000);
        }

        throw new RuntimeException('The Python service is busy right now. Please try again in a moment.');
    }

    /** @return string[] */
    protected function command(string $dir): array
    {
        $python = config('services.python.bin', 'python3');

        if (! $this->isSandboxed()) {
            $cmd = [$python, '-I', "{$dir}/runner.py", "{$dir}/data.json", "{$dir}/cell.py", "{$dir}/out.json"];
            // Local Windows/XAMPP setups keep pandas in a project folder the web server's account can read.
            if (is_dir(storage_path('app/python-packages'))) {
                $cmd[] = storage_path('app/python-packages');
            }

            return $cmd;
        }

        $env = rtrim((string) config('services.python.env_dir'), '/'); // e.g. /opt/daha-bi-python
        $bin = $env ? "{$env}/bin/python3" : $python;
        $mem = (int) config('services.python.memory_mb', 2048) * 1024 * 1024;

        $cmd = [
            'prlimit', "--as={$mem}", '--cpu='.self::TIMEOUT_SECONDS, '--nproc=256', '--nofile=512', '--fsize=52428800', '--',
            $this->bwrapBin(),
            '--unshare-all', '--die-with-parent', '--new-session', '--clearenv',
            '--ro-bind', '/usr', '/usr',
            '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--symlink', 'usr/bin', '/bin',
            '--ro-bind', '/etc/alternatives', '/etc/alternatives',
            '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
            '--bind', $dir, '/work', '--chdir', '/work',
            '--setenv', 'HOME', '/tmp', '--setenv', 'MPLCONFIGDIR', '/tmp', '--setenv', 'PYTHONDONTWRITEBYTECODE', '1',
            '--setenv', 'OPENBLAS_NUM_THREADS', '1', '--setenv', 'OMP_NUM_THREADS', '1', '--setenv', 'PATH', '/usr/bin',
        ];
        if ($env) {
            array_push($cmd, '--ro-bind', $env, $env);
        }
        array_push($cmd, $bin, '-I', '/work/runner.py', '/work/data.json', '/work/cell.py', '/work/out.json');

        return $cmd;
    }

    protected function bwrapBin(): string
    {
        return (string) config('services.python.bwrap', '/usr/bin/bwrap');
    }

    protected function friendlyCrash(string $stderr): string
    {
        if (str_contains($stderr, 'MemoryError') || str_contains($stderr, 'Cannot allocate memory')) {
            return 'Your code used too much memory and was stopped. Try fewer rows or a smaller result.';
        }
        if (str_contains($stderr, "No module named 'pandas'")) {
            return 'Python is installed but pandas is missing on the server. An administrator needs to install the notebook environment.';
        }
        if (str_contains($stderr, 'CPU time') || str_contains($stderr, 'Killed')) {
            return 'Your code was stopped for using too much CPU time.';
        }

        return 'Python stopped unexpectedly.'.($stderr ? ' '.Str::limit($stderr, 400) : '');
    }
}
