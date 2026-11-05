<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dataset;
use App\Services\AuditLogger;
use App\Services\DataQualityService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DatasetController extends Controller
{
    public function __construct(protected DataQualityService $quality, protected AuditLogger $auditLog)
    {
    }

    public function index(Request $request)
    {
        return Dataset::query()
            ->whereHas('dataSource', fn ($q) => $q->where('organization_id', $request->user()->current_organization_id))
            ->with('dataSource:id,name,type')
            ->latest()
            ->get();
    }

    public function show(Request $request, Dataset $dataset)
    {
        $this->authorizeAccess($request, $dataset);

        return $dataset->load('dataSource:id,name,type');
    }

    public function preview(Request $request, Dataset $dataset)
    {
        $this->authorizeAccess($request, $dataset);

        $rows = $dataset->rows()->limit(25)->pluck('data')->map(fn ($json) => is_string($json) ? json_decode($json, true) : $json);

        return response()->json([
            'columns' => $dataset->columns,
            'rows' => $rows,
        ]);
    }

    public function qualityReport(Request $request, Dataset $dataset)
    {
        $this->authorizeAccess($request, $dataset);

        $report = $this->quality->analyze($dataset);
        $summary = $this->quality->summarize($dataset, $report);

        return response()->json([...$report, 'summary' => $summary ?: null]);
    }

    public function removeDuplicates(Request $request, Dataset $dataset)
    {
        $this->authorizeEdit($request, $dataset);

        $removed = $this->quality->removeDuplicates($dataset);

        if ($removed > 0) {
            $this->auditLog->log(
                $dataset->dataSource->organization_id,
                $request->user()->id,
                'dataset.duplicates_removed',
                "Removed {$removed} duplicate row(s) from \"{$dataset->name}\"",
                $dataset
            );
        }

        return response()->json(['removed' => $removed]);
    }

    public function destroy(Request $request, Dataset $dataset)
    {
        $this->authorizeEdit($request, $dataset);

        $dataset->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    protected function authorizeAccess(Request $request, Dataset $dataset): void
    {
        abort_unless($dataset->dataSource->organization_id === $request->user()->current_organization_id, Response::HTTP_FORBIDDEN);
    }

    protected function authorizeEdit(Request $request, Dataset $dataset): void
    {
        $this->authorizeAccess($request, $dataset);
        abort_unless($request->user()->canEditOrg($dataset->dataSource->organization_id), Response::HTTP_FORBIDDEN);
    }
}
