<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dataset;
use App\Services\DashboardTemplateService;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class DashboardTemplateController extends Controller
{
    public function __construct(protected DashboardTemplateService $templates)
    {
    }

    public function index()
    {
        return response()->json($this->templates->definitions());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'template' => ['required', 'string'],
            'dataset_id' => ['required', 'exists:datasets,id'],
            'name' => ['required', 'string', 'max:255'],
        ]);

        $dataset = Dataset::findOrFail($validated['dataset_id']);
        abort_unless(
            $dataset->dataSource->organization_id === $request->user()->current_organization_id,
            Response::HTTP_FORBIDDEN
        );

        try {
            $dashboard = $this->templates->instantiate($validated['template'], $dataset, $request->user(), $validated['name']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json($dashboard->load('charts')->setAttribute('role', 'owner'), 201);
    }
}
