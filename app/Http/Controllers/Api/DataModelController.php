<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataModel;
use App\Models\Dataset;
use App\Services\AuditLogger;
use App\Services\DataModelService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class DataModelController extends Controller
{
    public function __construct(protected DataModelService $service, protected AuditLogger $auditLog)
    {
    }

    public function index(Request $request)
    {
        return DataModel::where('organization_id', $request->user()->current_organization_id)
            ->with('outputDataset:id,name,row_count,columns')
            ->latest()
            ->get();
    }

    public function show(Request $request, DataModel $dataModel)
    {
        $this->authorize('view', $dataModel);

        return $dataModel->load('outputDataset:id,name,row_count,columns');
    }

    public function store(Request $request)
    {
        $this->authorize('create', DataModel::class);

        $validated = $this->validatePipeline($request);

        $organizationId = $request->user()->current_organization_id;

        $dataSource = $request->user()->dataSources()->create([
            'organization_id' => $organizationId,
            'name' => $validated['name'],
            'type' => 'data_model',
            'status' => 'pending',
            'config' => [],
        ]);

        // organization_id/user_id/data_source_id are server-controlled, not user input, so this
        // bypasses $fillable the same way Organization/User's server-only fields do elsewhere.
        $dataModel = new DataModel();
        $dataModel->forceFill([
            'organization_id' => $organizationId,
            'user_id' => $request->user()->id,
            'data_source_id' => $dataSource->id,
            'name' => $validated['name'],
            'pipeline' => $validated['pipeline'],
            'schedule' => $validated['schedule'] ?? 'manual',
        ])->save();

        return $this->runAndRespond($request, $dataModel, created: true);
    }

    public function update(Request $request, DataModel $dataModel)
    {
        $this->authorize('update', $dataModel);

        $validated = $this->validatePipeline($request);

        $dataModel->update([
            'name' => $validated['name'],
            'pipeline' => $validated['pipeline'],
            'schedule' => $validated['schedule'] ?? $dataModel->schedule,
        ]);

        return $this->runAndRespond($request, $dataModel, created: false);
    }

    public function run(Request $request, DataModel $dataModel)
    {
        $this->authorize('update', $dataModel);

        return $this->runAndRespond($request, $dataModel, created: false);
    }

    public function destroy(Request $request, DataModel $dataModel)
    {
        $this->authorize('update', $dataModel);

        // Deleting the synthetic DataSource cascades to the output Dataset and its rows, and to
        // this DataModel row itself — no separate cleanup needed.
        $dataModel->dataSource->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    protected function runAndRespond(Request $request, DataModel $dataModel, bool $created)
    {
        try {
            $this->service->run($dataModel);
            $this->auditLog->log(
                $dataModel->organization_id,
                $request->user()->id,
                $created ? 'data_model.created' : 'data_model.run',
                ($created ? 'Created' : 'Ran')." data model \"{$dataModel->name}\"",
                $dataModel
            );
        } catch (Throwable $e) {
            return response()->json([
                'message' => __('Failed to run this data model.'),
                'error' => $e->getMessage(),
                'data_model' => $dataModel->fresh()->load('outputDataset:id,name,row_count,columns'),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(
            $dataModel->fresh()->load('outputDataset:id,name,row_count,columns'),
            $created ? Response::HTTP_CREATED : Response::HTTP_OK
        );
    }

    protected function validatePipeline(Request $request): array
    {
        // Every possible field across every step type is declared explicitly (even though only
        // some apply to any given step) because Laravel's validate() silently drops any key not
        // named in the rules — DataModelService itself enforces which fields a given step
        // actually needs, with a clear error, when the pipeline is run.
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'schedule' => ['sometimes', Rule::in(['manual', 'hourly', 'daily'])],
            'pipeline' => ['required', 'array', 'min:1'],
            'pipeline.0.type' => ['required', 'in:source'],
            'pipeline.0.dataset_id' => ['required', 'integer', 'exists:datasets,id'],
            'pipeline.*.type' => ['required', 'in:source,join,filter,select,rename,derive'],
            'pipeline.*.dataset_id' => ['sometimes', 'integer', 'exists:datasets,id'],
            'pipeline.*.left_field' => ['sometimes', 'string'],
            'pipeline.*.right_field' => ['sometimes', 'string'],
            'pipeline.*.join_type' => ['sometimes', Rule::in(['inner', 'left'])],
            'pipeline.*.prefix' => ['sometimes', 'string'],
            'pipeline.*.field' => ['sometimes', 'string'],
            'pipeline.*.operator' => ['sometimes', 'string'],
            'pipeline.*.value' => ['sometimes'],
            'pipeline.*.fields' => ['sometimes', 'array'],
            'pipeline.*.fields.*' => ['string'],
            'pipeline.*.from' => ['sometimes', 'string'],
            'pipeline.*.to' => ['sometimes', 'string'],
            'pipeline.*.name' => ['sometimes', 'string'],
            'pipeline.*.constant' => ['sometimes', 'numeric'],
        ]);

        // Every dataset a pipeline step touches (the source, and each join's right-hand side)
        // must belong to the requesting user's own organization — otherwise a crafted pipeline
        // could pull another org's data into a materialized dataset the requester can then view.
        $organizationId = $request->user()->current_organization_id;
        $referencedIds = collect($validated['pipeline'])->pluck('dataset_id')->filter()->unique();

        if ($referencedIds->isNotEmpty()) {
            $ownedCount = Dataset::whereIn('id', $referencedIds)
                ->whereHas('dataSource', fn ($q) => $q->where('organization_id', $organizationId))
                ->count();

            if ($ownedCount !== $referencedIds->count()) {
                throw ValidationException::withMessages([
                    'pipeline' => [__('One or more referenced datasets do not belong to your organization.')],
                ]);
            }
        }

        return $validated;
    }
}
