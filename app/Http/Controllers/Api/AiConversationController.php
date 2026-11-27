<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PlanGate;
use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Models\Dashboard;
use App\Models\Dataset;
use App\Services\AiPromptService;
use App\Services\ChartDataService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class AiConversationController extends Controller
{
    public function __construct(protected AiPromptService $ai, protected ChartDataService $chartData)
    {
    }

    public function index(Request $request)
    {
        return $request->user()->aiConversations()
            ->withCount('messages')
            ->with('dataset:id,name')
            ->latest('updated_at')
            ->get();
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'dataset_id' => ['required', 'exists:datasets,id'],
        ]);

        $dataset = Dataset::findOrFail($validated['dataset_id']);
        $this->authorize('view', $dataset);

        $conversation = $request->user()->aiConversations()->create([
            'dataset_id' => $dataset->id,
        ]);

        return response()->json($conversation->load('dataset:id,name'), 201);
    }

    public function show(Request $request, AiConversation $conversation)
    {
        $this->authorize('view', $conversation);

        return $conversation->load(['dataset:id,name', 'messages']);
    }

    public function destroy(Request $request, AiConversation $conversation)
    {
        $this->authorize('view', $conversation);

        $conversation->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    public function sendMessage(Request $request, AiConversation $conversation)
    {
        $this->authorize('view', $conversation);

        $validated = $request->validate(['content' => ['required', 'string', 'max:1000']]);

        if (! $this->ai->isConfigured()) {
            return response()->json([
                'message' => 'AI features are not set up yet. Add a free GEMINI_API_KEY (from Google AI Studio) to the backend .env to enable this.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // Read before the new user message is saved, so it naturally excludes it.
        $existingMessages = $conversation->messages()->get();
        // Last 12 turns only (long chats would bloat every request). Chart/dashboard replies carry
        // their computed analysis too, so a follow-up like "why is that one so low?" has context.
        $history = $existingMessages->take(-12)
            ->map(fn (AiMessage $m) => [
                'role' => $m->role === 'assistant' ? 'model' : 'user',
                'content' => trim($m->content
                    .($m->chart_title ? "\n[Chart shown: {$m->chart_title}]" : '')
                    .($m->dashboard_title ? "\n[Dashboard proposed: {$m->dashboard_title}]" : '')
                    .($m->analysis ? "\n[Analysis: {$m->analysis}]" : '')),
            ])->values()->all();
        $conversationHasDashboard = $existingMessages->contains('response_type', 'dashboard');

        $userMessage = $conversation->messages()->create([
            'role' => 'user',
            'content' => $validated['content'],
        ]);

        try {
            $result = $this->ai->respond($conversation->dataset, $validated['content'], $history, $conversationHasDashboard, $request->user());
        } catch (Throwable $e) {
            // The question was saved; drop it so a retry doesn't leave a dangling unanswered turn.
            $userMessage->delete();

            return response()->json([
                'message' => $this->friendlyAiError($e->getMessage()),
                'error' => $e->getMessage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $assistantMessage = $this->recordAssistantReply($conversation, $result);
        $followUps = array_values(array_filter(array_map(
            fn ($q) => is_string($q) ? Str::limit(trim($q), 80) : null,
            array_slice($result['follow_ups'] ?? [], 0, 3)
        )));
        if ($followUps) {
            $assistantMessage->update(['follow_ups' => $followUps]);
        }

        if (! $conversation->title) {
            $conversation->update(['title' => Str::limit($validated['content'], 60)]);
        } else {
            $conversation->touch();
        }

        return response()->json([
            'user_message' => $userMessage,
            'assistant_message' => $assistantMessage,
        ], 201);
    }

    protected function friendlyAiError(string $raw): string
    {
        $lower = strtolower($raw);

        return match (true) {
            str_contains($lower, 'quota') || str_contains($lower, 'rate') || str_contains($lower, '429') => 'The AI service is busy right now (rate limit reached). Wait a minute and try again.',
            str_contains($lower, 'timed out') || str_contains($lower, 'timeout') || str_contains($lower, 'curl error 28') => 'The AI took too long to answer. Try a shorter or more specific question.',
            str_contains($lower, 'api key') || str_contains($lower, 'permission') => 'The AI service rejected the API key. Check GEMINI_API_KEY in the backend .env.',
            str_contains($lower, 'unknown column') => 'The AI referred to a column that does not exist. Try rephrasing using the column names.',
            default => 'The AI could not answer that. Try rephrasing your question.',
        };
    }

    /**
     * Chart/dashboard proposals are recorded but NOT created as real Chart/Dashboard rows yet —
     * the user picks where to save via saveChart()/saveDashboard(). They ARE rendered live in the
     * chat though: chart_data holds the real, fully-computed result (run through the same
     * ChartDataService as any saved chart, not a guess from the sample rows).
     */
    protected function recordAssistantReply(AiConversation $conversation, array $result): AiMessage
    {
        if ($result['response_type'] === 'answer') {
            return $conversation->messages()->create([
                'role' => 'assistant',
                'content' => $result['answer'] ?? '',
                'response_type' => 'answer',
            ]);
        }

        if ($result['response_type'] === 'dashboard') {
            return $this->recordDashboardProposal($conversation, $result);
        }

        [$chartTitle, $chartType, $config] = $this->buildChartFields($result);

        $chartData = null;
        $analysis = null;

        try {
            $chartData = $this->chartData->run($conversation->dataset, $chartType, $config, [], $conversation->user);
            $analysis = $this->ai->interpret($chartTitle, $chartType, $config, $this->summarizeForInterpretation($chartType, $chartData));
        } catch (Throwable) {
            // Chart still displays as a proposal even if live computation/analysis fails.
        }

        return $conversation->messages()->create([
            'role' => 'assistant',
            'content' => $chartData ? "Here's a look at \u{201c}{$chartTitle}\u{201d}." : "Here's a {$chartType} chart: \u{201c}{$chartTitle}\u{201d}. Save it to a dashboard to add it.",
            'response_type' => 'chart',
            'chart_title' => $chartTitle,
            'chart_type' => $chartType,
            'chart_config' => $config,
            'chart_data' => $chartData,
            'analysis' => $analysis ?: null,
        ]);
    }

    /**
     * Computes real data for every proposed chart up front (capped at 6, matching the schema's
     * maxItems) so the whole dashboard renders live in the chat. Then makes ONE extra Gemini call
     * covering all of them together for a real synthesized analysis — not the model's initial
     * dashboard_explanation, which was written before any chart was actually computed and is only
     * a rationale for the proposal, not an analysis of real numbers.
     */
    protected function recordDashboardProposal(AiConversation $conversation, array $result): AiMessage
    {
        $dashboardTitle = $result['dashboard_title'] ?? 'AI-generated dashboard';
        $charts = collect($result['charts'] ?? [])->take(6)->map(function (array $proposal) use ($conversation) {
            [$title, $type, $config] = $this->buildChartFields($proposal);

            try {
                $data = $this->chartData->run($conversation->dataset, $type, $config, [], $conversation->user);
            } catch (Throwable) {
                $data = null;
            }

            return ['chart_title' => $title, 'chart_type' => $type, 'chart_config' => $config, 'chart_data' => $data];
        })->all();

        $computed = collect($charts)->filter(fn ($c) => $c['chart_data'])->values()->all();
        $analysis = null;

        if ($computed) {
            $forAnalysis = array_map(
                fn ($c) => ['chart_title' => $c['chart_title'], 'chart_type' => $c['chart_type'], 'chart_data' => $this->summarizeForInterpretation($c['chart_type'], $c['chart_data'])],
                $computed
            );
            $analysis = $this->ai->interpretDashboard($dashboardTitle, $forAnalysis) ?: null;
        }

        return $conversation->messages()->create([
            'role' => 'assistant',
            'content' => $result['dashboard_explanation'] ?? "Here's a proposed dashboard: \u{201c}{$dashboardTitle}\u{201d}.",
            'response_type' => 'dashboard',
            'dashboard_title' => $dashboardTitle,
            'dashboard_charts' => $charts,
            'analysis' => $analysis,
        ]);
    }

    /**
     * @return array{0: string, 1: string, 2: array<string, string>}
     */
    protected function buildChartFields(array $proposal): array
    {
        $chartType = $proposal['chart_type'] ?? 'bar';
        $yField = $proposal['y_field'] ?? null;
        // If the model names a field to aggregate but omits agg, "count" would silently ignore
        // that field's actual values — sum is the sane default when a numeric field is given.
        $config = array_filter([
            'agg' => $proposal['agg'] ?? ($yField ? 'sum' : 'count'),
            'x_field' => $proposal['x_field'] ?? null,
            'y_field' => $yField,
        ], fn ($v) => $v !== null);

        $chartTitle = $proposal['chart_title'] ?? $this->ai->fallbackTitle($chartType, $config);

        return [$chartTitle, $chartType, $config];
    }

    /**
     * Table results can run to hundreds of rows — too large (and too repetitive) to hand to the
     * interpretation prompt in full, so only a sample plus the real total goes in.
     */
    protected function summarizeForInterpretation(string $chartType, array $data): array
    {
        if ($chartType === 'table' && isset($data['rows'])) {
            return [
                'columns' => $data['columns'],
                'sample_rows' => array_slice($data['rows'], 0, 10),
                'total_rows' => count($data['rows']),
            ];
        }

        // A long series (e.g. a daily time series) dumped raw would bloat the prompt without
        // adding insight — top/bottom values plus the total give the model what it needs to
        // actually reason about the data, grounded in the real numbers either way.
        if (isset($data['labels'], $data['values']) && count($data['labels']) > 20) {
            $pairs = array_map(fn ($label, $value) => ['label' => $label, 'value' => $value], $data['labels'], $data['values']);
            usort($pairs, fn ($a, $b) => $b['value'] <=> $a['value']);

            return [
                'count' => count($pairs),
                'total' => array_sum($data['values']),
                'highest' => array_slice($pairs, 0, 5),
                'lowest' => array_slice($pairs, -5),
            ];
        }

        return $data;
    }

    public function saveChart(Request $request, AiMessage $message)
    {
        $conversation = $message->conversation;
        $this->authorize('view', $conversation);

        abort_unless($message->response_type === 'chart', Response::HTTP_UNPROCESSABLE_ENTITY);
        abort_if($message->chart_id, Response::HTTP_UNPROCESSABLE_ENTITY, 'This chart has already been saved.');

        $validated = $request->validate(['dashboard_id' => ['required', 'exists:dashboards,id']]);

        $dashboard = Dashboard::findOrFail($validated['dashboard_id']);
        $this->authorize('useDataset', [$dashboard, $conversation->dataset]);

        $chart = $dashboard->charts()->create([
            'dataset_id' => $conversation->dataset_id,
            'title' => $message->chart_title,
            'type' => $message->chart_type,
            'config' => $message->chart_config,
        ]);

        $message->update(['chart_id' => $chart->id]);

        return response()->json($chart, 201);
    }

    /**
     * Creates a brand-new Dashboard from a proposed dashboard message, plus one Chart per
     * proposed chart that had real computed data (a chart that failed to compute is skipped
     * rather than saved broken).
     */
    public function saveDashboard(Request $request, AiMessage $message)
    {
        $conversation = $message->conversation;
        $this->authorize('view', $conversation);

        abort_unless($message->response_type === 'dashboard', Response::HTTP_UNPROCESSABLE_ENTITY);
        abort_if($message->dashboard_id, Response::HTTP_UNPROCESSABLE_ENTITY, 'This dashboard has already been created.');

        $validated = $request->validate(['name' => ['nullable', 'string', 'max:255']]);
        PlanGate::newDashboard($request->user()->current_organization_id, $request->user());

        $dashboard = $request->user()->dashboards()->create([
            'organization_id' => $request->user()->current_organization_id,
            'name' => $validated['name'] ?? $message->dashboard_title ?? 'AI-generated dashboard',
        ]);

        foreach ($message->dashboard_charts ?? [] as $proposal) {
            if (empty($proposal['chart_data'])) {
                continue;
            }

            $dashboard->charts()->create([
                'dataset_id' => $conversation->dataset_id,
                'title' => $proposal['chart_title'],
                'type' => $proposal['chart_type'],
                'config' => $proposal['chart_config'],
            ]);
        }

        $message->update(['dashboard_id' => $dashboard->id]);

        return response()->json($dashboard->load('charts'), 201);
    }
}
