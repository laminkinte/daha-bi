<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PlanGate;
use App\Models\DataSource;
use App\Services\AuditLogger;
use App\Services\DataIngestionService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class DataSourceController extends Controller
{
    protected const DATABASE_DRIVERS = ['mysql', 'postgres', 'sqlserver'];

    protected const DEFAULT_PORTS = ['mysql' => 3306, 'postgres' => 5432, 'sqlserver' => 1433];

    public function __construct(protected DataIngestionService $ingestion, protected AuditLogger $auditLog)
    {
    }

    public function index(Request $request)
    {
        // data_model sources are synthetic (see DataModel) — managed from their own /data-models
        // page, not this generic one, which doesn't know how to edit/resync them.
        return DataSource::where('organization_id', $request->user()->current_organization_id)
            ->where('type', '!=', 'data_model')
            ->withCount('datasets')
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $type = $request->input('type');

        if ($type === 'csv') {
            return $this->storeCsv($request);
        }

        // Live connections (databases and REST APIs) are a paid feature; CSV uploads are on every plan.
        if (($type === 'rest_api' || in_array($type, self::DATABASE_DRIVERS, true))
            && ($organization = \App\Models\Organization::find($request->user()->current_organization_id))) {
            PlanGate::require($organization, 'database_sources', $request->user());
        }

        if ($type === 'rest_api') {
            return $this->storeRestApi($request);
        }

        if (in_array($type, self::DATABASE_DRIVERS, true)) {
            return $this->storeDatabase($request, $type);
        }

        throw ValidationException::withMessages([
            'type' => ['type must be one of: csv, rest_api, '.implode(', ', self::DATABASE_DRIVERS).'.'],
        ]);
    }

    protected function restApiConfigRules(): array
    {
        return [
            'url' => ['required', 'url', 'max:2048'],
            'method' => ['nullable', 'in:GET,POST'],
            'headers' => ['nullable', 'array'],
            'headers.*.key' => ['nullable', 'string', 'max:255'],
            'headers.*.value' => ['nullable', 'string', 'max:1000'],
            'auth_type' => ['nullable', 'in:none,bearer,basic,api_key'],
            'auth_token' => ['nullable', 'string', 'max:2000'],
            'auth_header_name' => ['nullable', 'string', 'max:255'],
            'basic_username' => ['nullable', 'string', 'max:255'],
            'basic_password' => ['nullable', 'string', 'max:255'],
            'body' => ['nullable', 'string', 'max:5000'],
            'json_path' => ['nullable', 'string', 'max:255'],
        ];
    }

    protected function storeRestApi(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            ...$this->restApiConfigRules(),
        ]);

        $dataSource = $request->user()->dataSources()->create([
            'organization_id' => $request->user()->current_organization_id,
            'name' => $validated['name'],
            'type' => 'rest_api',
            'status' => 'syncing',
            'config' => collect($validated)->except(['name'])->merge(['name' => $validated['name']])->all(),
        ]);

        try {
            $dataset = $this->ingestion->ingestRestApi($dataSource);
            $dataSource->update(['status' => 'ready', 'last_synced_at' => now()]);
            $this->auditLog->log(
                $dataSource->organization_id,
                $request->user()->id,
                'data_source.created',
                "Connected \"{$dataSource->name}\" (REST API)",
                $dataSource
            );
        } catch (Throwable $e) {
            $dataSource->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return response()->json([
                'message' => 'Failed to fetch or import from the API.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'data_source' => $dataSource->fresh(),
            'dataset' => $dataset,
        ], 201);
    }

    protected function storeCsv(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx,xls', 'max:20480'],
        ]);

        $dataSource = $request->user()->dataSources()->create([
            'organization_id' => $request->user()->current_organization_id,
            'name' => $validated['name'],
            'type' => 'csv',
            'status' => 'syncing',
        ]);

        try {
            $dataset = $this->ingestion->ingestCsv($dataSource, $request->file('file'));
            $dataSource->update(['status' => 'ready', 'last_synced_at' => now()]);
            $this->auditLog->log(
                $dataSource->organization_id,
                $request->user()->id,
                'data_source.created',
                "Uploaded \"{$dataSource->name}\" (CSV/Excel)",
                $dataSource
            );
        } catch (Throwable $e) {
            $dataSource->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return response()->json([
                'message' => 'Failed to import file.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'data_source' => $dataSource->fresh(),
            'dataset' => $dataset,
        ], 201);
    }

    protected function storeDatabase(Request $request, string $driver)
    {
        $usesQuery = filled($request->input('query'));

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'host' => ['required', 'string'],
            'port' => ['nullable', 'integer'],
            'database' => ['required', 'string'],
            'username' => ['required', 'string'],
            'password' => ['nullable', 'string'],
            'table' => [$usesQuery ? 'prohibited' : 'required', 'nullable', 'string', 'regex:/^[A-Za-z0-9_]+$/'],
            'query' => [$usesQuery ? 'required' : 'prohibited', 'nullable', 'string', 'max:5000'],
        ]);

        $dataSource = $request->user()->dataSources()->create([
            'organization_id' => $request->user()->current_organization_id,
            'name' => $validated['name'],
            'type' => $driver,
            'status' => 'syncing',
            'config' => [
                'driver' => $driver,
                'host' => $validated['host'],
                'port' => $validated['port'] ?? self::DEFAULT_PORTS[$driver],
                'database' => $validated['database'],
                'username' => $validated['username'],
                'password' => $validated['password'] ?? '',
                'table' => $validated['table'] ?? null,
                'query' => $validated['query'] ?? null,
            ],
        ]);

        try {
            $dataset = $usesQuery
                ? $this->ingestion->ingestQuery($dataSource, $validated['query'])
                : $this->ingestion->ingestTable($dataSource);
            $dataSource->update(['status' => 'ready', 'last_synced_at' => now()]);
            $this->auditLog->log(
                $dataSource->organization_id,
                $request->user()->id,
                'data_source.created',
                "Connected \"{$dataSource->name}\" (".ucfirst($driver).')',
                $dataSource
            );
        } catch (Throwable $e) {
            $dataSource->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return response()->json([
                'message' => 'Failed to connect or import from '.ucfirst($driver).'.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'data_source' => $dataSource->fresh(),
            'dataset' => $dataset,
        ], 201);
    }

    public function show(Request $request, DataSource $dataSource)
    {
        $this->authorize('view', $dataSource);

        return $dataSource->load('datasets');
    }

    public function resync(Request $request, DataSource $dataSource)
    {
        $this->authorize('update', $dataSource);

        if ($dataSource->type === 'csv') {
            return response()->json([
                'message' => 'Failed to resync data source.',
                'error' => 'Re-uploading required to resync a CSV data source.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $dataSource->update(['status' => 'syncing']);

        try {
            if ($dataSource->type === 'rest_api') {
                $existing = $dataSource->datasets()->oldest()->first();
                $dataset = $this->ingestion->ingestRestApi($dataSource, existing: $existing);
            } else {
                $query = $dataSource->config['query'] ?? null;
                $targetName = $query ? 'query_result' : $dataSource->config['table'];
                // Reuse the primary dataset's row so any charts built on it (charts.dataset_id
                // cascades on delete) survive the resync instead of being destroyed with it.
                $existing = $dataSource->datasets()->where('name', $targetName)->oldest()->first();

                $dataset = $query
                    ? $this->ingestion->ingestQuery($dataSource, $query, existing: $existing)
                    : $this->ingestion->ingestTable($dataSource, existing: $existing);
            }

            $dataSource->update(['status' => 'ready', 'last_synced_at' => now(), 'error_message' => null]);
        } catch (Throwable $e) {
            $dataSource->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return response()->json([
                'message' => 'Failed to resync data source.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'data_source' => $dataSource->fresh(),
            'dataset' => $dataset,
        ]);
    }

    public function update(Request $request, DataSource $dataSource)
    {
        $this->authorize('update', $dataSource);

        if ($dataSource->type === 'csv') {
            $validated = $request->validate(['name' => ['required', 'string', 'max:255']]);
            $dataSource->update($validated);

            return $dataSource->fresh();
        }

        if ($dataSource->type === 'rest_api') {
            return $this->updateRestApi($request, $dataSource);
        }

        $usesQuery = filled($request->input('query'));

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'host' => ['required', 'string'],
            'port' => ['nullable', 'integer'],
            'database' => ['required', 'string'],
            'username' => ['required', 'string'],
            'password' => ['nullable', 'string'],
            'table' => [$usesQuery ? 'prohibited' : 'required', 'nullable', 'string', 'regex:/^[A-Za-z0-9_]+$/'],
            'query' => [$usesQuery ? 'required' : 'prohibited', 'nullable', 'string', 'max:5000'],
        ]);

        $oldConfig = $dataSource->config ?? [];
        $oldTargetName = ($oldConfig['query'] ?? null) ? 'query_result' : ($oldConfig['table'] ?? null);
        $existing = $oldTargetName
            ? $dataSource->datasets()->where('name', $oldTargetName)->oldest()->first()
            : null;

        $driver = $dataSource->type;

        $dataSource->update([
            'name' => $validated['name'],
            'status' => 'syncing',
            'config' => [
                'driver' => $driver,
                'host' => $validated['host'],
                'port' => $validated['port'] ?? self::DEFAULT_PORTS[$driver],
                'database' => $validated['database'],
                // Blank password on edit means "keep the existing one" — a credential form
                // shouldn't force re-entering a password just to change the display name.
                'password' => filled($validated['password'] ?? null) ? $validated['password'] : ($oldConfig['password'] ?? ''),
                'username' => $validated['username'],
                'table' => $validated['table'] ?? null,
                'query' => $validated['query'] ?? null,
            ],
        ]);

        try {
            $dataset = $usesQuery
                ? $this->ingestion->ingestQuery($dataSource, $validated['query'], existing: $existing)
                : $this->ingestion->ingestTable($dataSource, existing: $existing);

            $dataSource->update(['status' => 'ready', 'last_synced_at' => now(), 'error_message' => null]);
        } catch (Throwable $e) {
            $dataSource->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return response()->json([
                'message' => 'Failed to connect or import from '.ucfirst($driver).'.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'data_source' => $dataSource->fresh(),
            'dataset' => $dataset,
        ]);
    }

    protected function updateRestApi(Request $request, DataSource $dataSource)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            ...$this->restApiConfigRules(),
        ]);

        $oldConfig = $dataSource->config ?? [];
        $existing = $dataSource->datasets()->oldest()->first();

        $dataSource->update([
            'name' => $validated['name'],
            'status' => 'syncing',
            'config' => collect($validated)->except(['name'])->merge([
                'name' => $validated['name'],
                // Same "blank means keep the existing one" convention as the database forms.
                'auth_token' => filled($validated['auth_token'] ?? null) ? $validated['auth_token'] : ($oldConfig['auth_token'] ?? null),
                'basic_password' => filled($validated['basic_password'] ?? null) ? $validated['basic_password'] : ($oldConfig['basic_password'] ?? null),
            ])->all(),
        ]);

        try {
            $dataset = $this->ingestion->ingestRestApi($dataSource, existing: $existing);
            $dataSource->update(['status' => 'ready', 'last_synced_at' => now(), 'error_message' => null]);
        } catch (Throwable $e) {
            $dataSource->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return response()->json([
                'message' => 'Failed to fetch or import from the API.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json([
            'data_source' => $dataSource->fresh(),
            'dataset' => $dataset,
        ]);
    }

    public function tables(Request $request, DataSource $dataSource)
    {
        $this->authorize('view', $dataSource);

        abort_unless(in_array($dataSource->type, self::DATABASE_DRIVERS, true), Response::HTTP_UNPROCESSABLE_ENTITY, 'Only database connections have tables to browse.');

        try {
            return $this->ingestion->listSchema($dataSource);
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'Failed to read database schema.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
    }

    public function previewTable(Request $request, DataSource $dataSource, string $table)
    {
        $this->authorize('view', $dataSource);

        abort_unless(in_array($dataSource->type, self::DATABASE_DRIVERS, true), Response::HTTP_UNPROCESSABLE_ENTITY, 'Only database connections have tables to preview.');

        try {
            return $this->ingestion->previewTable($dataSource, $table, (int) $request->input('limit', 25));
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'Failed to preview table.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }
    }

    public function destroy(Request $request, DataSource $dataSource)
    {
        $this->authorize('update', $dataSource);

        $this->auditLog->log(
            $dataSource->organization_id,
            $request->user()->id,
            'data_source.deleted',
            "Deleted \"{$dataSource->name}\"",
            $dataSource
        );

        $dataSource->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
