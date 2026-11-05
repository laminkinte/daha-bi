<?php

namespace App\Services;

use App\Models\Dataset;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

/**
 * Runs user-submitted Python against a dataset's rows via a plain subprocess.
 *
 * No sandbox: the script runs with the same OS-user privileges as the web
 * server. That's an acceptable tradeoff for a single-user local dev machine
 * (this app's current deployment) but would need real isolation (containers,
 * a restricted user, etc.) before ever being exposed to other people.
 */
class PythonExecutionService
{
    protected const MAX_ROWS = 5000;

    protected const TIMEOUT_SECONDS = 20;

    public function run(Dataset $dataset, string $code): string
    {
        $rows = $dataset->rows()
            ->limit(self::MAX_ROWS)
            ->pluck('data')
            ->map(fn ($row) => is_string($row) ? json_decode($row, true) : $row)
            ->all();

        $dir = storage_path('app/notebook-tmp');
        File::ensureDirectoryExists($dir);

        $id = Str::random(20);
        $dataPath = "{$dir}/{$id}.json";
        $scriptPath = "{$dir}/{$id}.py";

        File::put($dataPath, json_encode($rows));
        File::put($scriptPath, $this->buildScript($dataPath, $code));

        $pythonBin = config('services.python.bin', 'python');

        $process = new Process([$pythonBin, $scriptPath]);
        $process->setTimeout(self::TIMEOUT_SECONDS);

        try {
            $process->run();
        } catch (ProcessTimedOutException) {
            $this->cleanup($dataPath, $scriptPath);
            throw new RuntimeException('Python execution timed out after ' . self::TIMEOUT_SECONDS . ' seconds.');
        }

        $this->cleanup($dataPath, $scriptPath);

        if (! $process->isSuccessful()) {
            throw new RuntimeException($process->getErrorOutput() ?: 'Python execution failed.');
        }

        return $process->getOutput();
    }

    protected function buildScript(string $dataPath, string $userCode): string
    {
        $escapedPath = addslashes($dataPath);
        // Packages live in a project-local directory (not the system/user
        // site-packages) so the subprocess finds them regardless of which
        // OS-user context spawns it (e.g. Apache's service account).
        $packagesPath = addslashes(storage_path('app/python-packages'));

        return <<<PYTHON
import sys
sys.path.insert(0, "{$packagesPath}")

import json
import pandas as pd

with open("{$escapedPath}", "r", encoding="utf-8") as _f:
    _rows = json.load(_f)
df = pd.DataFrame(_rows)

{$userCode}

try:
    result
except NameError:
    pass
else:
    print(result)
PYTHON;
    }

    protected function cleanup(string ...$paths): void
    {
        foreach ($paths as $path) {
            if (File::exists($path)) {
                File::delete($path);
            }
        }
    }
}
