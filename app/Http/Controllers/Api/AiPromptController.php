<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dashboard;
use App\Models\Dataset;
use App\Services\AiPromptService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AiPromptController extends Controller
{
    public function __construct(protected AiPromptService $ai)
    {
    }

    public function respond(Request $request, Dashboard $dashboard)
    {
        abort_unless(in_array($dashboard->roleFor($request->user()), ['owner', 'editor'], true), Response::HTTP_FORBIDDEN);

        $validated = $request->validate([
            'dataset_id' => ['required', 'exists:datasets,id'],
            'prompt' => ['required', 'string', 'max:1000'],
        ]);

        $dataset = Dataset::findOrFail($validated['dataset_id']);
        abort_unless($dataset->dataSource->organization_id === $dashboard->organization_id, Response::HTTP_FORBIDDEN);

        if (! $this->ai->isConfigured()) {
            return response()->json([
                'message' => 'AI features are not set up yet. Add a free GEMINI_API_KEY (from Google AI Studio) to the backend .env to enable this.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        try {
            $result = $this->ai->respond($dataset, $validated['prompt']);
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'AI request failed.',
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if ($result['response_type'] === 'answer') {
            return response()->json([
                'response_type' => 'answer',
                'answer' => $result['answer'] ?? '',
            ]);
        }

        // If the model names a field to aggregate but omits agg, "count" would silently ignore
        // that field's actual values — sum is the sane default when a numeric field is given.
        $config = ['agg' => $result['agg'] ?? (empty($result['y_field']) ? 'count' : 'sum')];
        if (! empty($result['x_field'])) {
            $config['x_field'] = $result['x_field'];
        }
        if (! empty($result['y_field'])) {
            $config['y_field'] = $result['y_field'];
        }

        $chartType = $result['chart_type'] ?? 'bar';

        $chart = $dashboard->charts()->create([
            'dataset_id' => $dataset->id,
            'title' => $result['chart_title'] ?? $this->ai->fallbackTitle($chartType, $config),
            'type' => $chartType,
            'config' => $config,
        ]);

        return response()->json([
            'response_type' => 'chart',
            'chart' => $chart,
        ], 201);
    }
}
