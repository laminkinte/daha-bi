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
        $this->authorizeOwner($request, $dataSource);
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
        $this->authorizeOwner($request, $dataSource);
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
        abort_unless($request->user()->canEditOrg($dataset->dataSource->organization_id), Response::HTTP_FORBIDDEN);

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:10000'],
        ]);

        try {
            $output = $this->python->run($dataset, $validated['code']);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['output' => $output]);
    }

    public function suggestSql(Request $request, DataSource $dataSource)
    {
        $this->authorizeOwner($request, $dataSource);
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
        abort_unless($request->user()->canEditOrg($dataset->dataSource->organization_id), Response::HTTP_FORBIDDEN);

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

    protected function authorizeOwner(Request $request, DataSource $dataSource): void
    {
        abort_unless($request->user()->canEditOrg($dataSource->organization_id), Response::HTTP_FORBIDDEN);
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
