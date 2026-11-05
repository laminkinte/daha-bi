<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dataset;
use App\Models\RowLevelPolicy;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RowLevelPolicyController extends Controller
{
    public function index(Request $request, Dataset $dataset)
    {
        $this->authorizeAdmin($request, $dataset);

        return $dataset->rowLevelPolicies()->with('creator:id,name,email')->latest()->get();
    }

    public function store(Request $request, Dataset $dataset)
    {
        $this->authorizeAdmin($request, $dataset);

        $columnNames = collect($dataset->columns ?? [])->pluck('name')->all();

        $validated = $request->validate([
            'role' => ['required', 'in:admin,analyst,viewer'],
            'field' => ['required', 'string', function ($attribute, $value, $fail) use ($columnNames) {
                if (! in_array($value, $columnNames, true)) {
                    $fail("\"{$value}\" is not a column on this dataset.");
                }
            }],
            'operator' => ['required', 'in:=,!=,>,<,>=,<=,contains'],
            'value' => ['required', 'string', 'max:255'],
        ]);

        $policy = $dataset->rowLevelPolicies()->create([
            ...$validated,
            'created_by' => $request->user()->id,
        ]);

        // ChartDataService caches per (dataset, dataset.updated_at, role, ...) — a policy change
        // doesn't touch the dataset's rows, so without this the old cached result (unrestricted,
        // in the dangerous direction) would keep being served until the TTL expires.
        $dataset->touch();

        return response()->json($policy->load('creator:id,name,email'), 201);
    }

    public function destroy(Request $request, RowLevelPolicy $rowLevelPolicy)
    {
        $this->authorizeAdmin($request, $rowLevelPolicy->dataset);

        $rowLevelPolicy->delete();
        $rowLevelPolicy->dataset->touch();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    /**
     * Deliberately admin-and-above only — someone who can only edit data (analyst) shouldn't be
     * able to grant themselves an unrestricted view by editing the very policy meant to restrict
     * their own role.
     */
    protected function authorizeAdmin(Request $request, Dataset $dataset): void
    {
        abort_unless(
            in_array($request->user()->roleInOrganization($dataset->dataSource->organization_id), ['owner', 'admin'], true),
            Response::HTTP_FORBIDDEN
        );
    }
}
