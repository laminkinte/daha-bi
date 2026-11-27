<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataSource;
use App\Models\Dataset;
use App\Services\AiPromptService;
use App\Services\DataIngestionService;
use App\Services\PythonExecutionService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class NotebookController extends Controller
{
    public function __construct(
        protected DataIngestionService $ingestion,
        protected PythonExecutionService $python,
        protected AiPromptService $ai,
    ) {
    }

    public function run(Request $request, DataSource $dataSource)
    {
        $this->authorize('query', $dataSource);
        $this->authorizeDatabaseConnection($dataSource);

        $validated = $request->validate([
            'query' => ['required', 'string', 'max:5000'],
        ]);

        try {
            $result = $this->ingestion->previewQuery($dataSource, $validated['query']);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json($result);
    }

    public function save(Request $request, DataSource $dataSource)
    {
        $this->authorize('query', $dataSource);
        $this->authorizeDatabaseConnection($dataSource);

        $validated = $request->validate([
            'query' => ['required', 'string', 'max:5000'],
            'name' => ['required', 'string', 'max:255'],
        ]);

        try {
            $dataset = $this->ingestion->ingestQuery($dataSource, $validated['query'], $validated['name']);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json($dataset, 201);
    }

    public function runPython(Request $request, Dataset $dataset)
    {
        $this->authorize('query', $dataset);

        $access = config('services.python.access', 'admins');
        // Open to every editor only when the code runs isolated (or on a developer's own machine).
        $openToAll = $access === 'all' && ($this->python->isSandboxed() || app()->environment('local', 'testing'));
        if ($access === 'disabled' || (! $openToAll && ! $request->user()->is_admin)) {
            return response()->json([
                'message' => $access === 'disabled'
                    ? 'Python notebooks are turned off on this server.'
                    : 'Python notebooks are limited to platform administrators on this server.',
            ], Response::HTTP_FORBIDDEN);
        }

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:20000'],
        ]);

        try {
            $run = $this->python->run($dataset, $validated['code'], $request->user());
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // `output` (plain text) is kept for older clients; `run` carries tables, figures and errors.
        $text = trim(($run['stdout'] ?? '').(($run['result']['type'] ?? null) === 'text' ? "\n".$run['result']['value'] : ''));

        return response()->json(['output' => $text, 'run' => $run]);
    }

    /** Whether the signed-in user may run Python here (drives the notebook UI). */
    public function pythonStatus(Request $request)
    {
        $access = config('services.python.access', 'admins');
        $openToAll = $access === 'all' && ($this->python->isSandboxed() || app()->environment('local', 'testing'));
        $allowed = $access !== 'disabled' && ($openToAll || $request->user()->is_admin);

        return [
            'allowed' => $allowed,
            'sandboxed' => $this->python->isSandboxed(),
            'reason' => $allowed ? null : ($access === 'disabled' ? 'disabled' : 'admins_only'),
            'max_rows' => \App\Services\PythonExecutionService::MAX_ROWS,
        ];
    }

    public function suggestSql(Request $request, DataSource $dataSource)
    {
        $this->authorize('query', $dataSource);
        $this->authorizeDatabaseConnection($dataSource);

        $validated = $request->validate(['prompt' => ['required', 'string', 'max:500']]);

        if (! $this->ai->isConfigured()) {
            return response()->json([
                'message' => 'AI features are not set up yet. Add a free GEMINI_API_KEY (from Google AI Studio) to the backend .env to enable this.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $tables = $this->ingestion->listSchema($dataSource);
            $sql = $this->ai->suggestSql($tables, $validated['prompt'], $dataSource->type);
        } catch (Throwable $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['sql' => $sql]);
    }

    public function suggestPython(Request $request, Dataset $dataset)
    {
        $this->authorize('query', $dataset);

        $validated = $request->validate(['prompt' => ['required', 'string', 'max:500']]);

        if (! $this->ai->isConfigured()) {
            return response()->json([
                'message' => 'AI features are not set up yet. Add a free GEMINI_API_KEY (from Google AI Studio) to the backend .env to enable this.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $columns = collect($dataset->columns ?? [])->pluck('name')->all();
            $sample = $dataset->rows()->limit(10)->pluck('data')->all();
            $code = $this->ai->suggestPython($columns, $sample, $validated['prompt']);
        } catch (Throwable $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['code' => $code]);
    }

    protected function authorizeDatabaseConnection(DataSource $dataSource): void
    {
        abort_unless(
            in_array($dataSource->type, ['mysql', 'postgres', 'sqlserver'], true),
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'The notebook only supports live database connections, not CSV data sources.'
        );
    }
}
