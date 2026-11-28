<?php

namespace App\Services;

use App\Models\Dataset;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class AiPromptService
{
    protected const SAMPLE_ROWS = 30;

    protected const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

    /** Seconds a model gets before we fail over to the next one. */
    protected const PER_MODEL_TIMEOUT = 15;

    public function __construct(protected ChartDataService $chartData)
    {
    }

    public function isConfigured(): bool
    {
        return filled(config('services.gemini.key'));
    }

    /**
     * A descriptive fallback ("Sum of Revenue by Region") for the rare case the model omits
     * chart_title despite being instructed to always set one — better than a generic placeholder
     * like "AI-generated chart" that gives the user nothing to go on.
     *
     * @param  array{agg?: string, x_field?: string, y_field?: string}  $config
     */
    public function fallbackTitle(string $chartType, array $config): string
    {
        $aggLabels = ['sum' => 'Total', 'avg' => 'Average', 'count' => 'Count', 'min' => 'Minimum', 'max' => 'Maximum'];
        $agg = $aggLabels[$config['agg'] ?? 'count'] ?? ucfirst($config['agg'] ?? 'count');
        $y = isset($config['y_field']) ? Str::headline($config['y_field']) : null;
        $x = isset($config['x_field']) ? Str::headline($config['x_field']) : null;

        if ($y && $x) {
            return "{$agg} of {$y} by {$x}";
        }

        if ($y) {
            return "{$agg} of {$y}";
        }

        if ($x) {
            return "{$agg} by {$x}";
        }

        return ucfirst($chartType).' chart';
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $history  Prior turns of a
     *         multi-turn conversation, oldest first. role is "user" or "model" (Gemini's own
     *         convention for its own past replies) — pass empty for a single-shot prompt.
     * @param  bool  $conversationHasDashboard  True if this conversation already produced a
     *         dashboard proposal — keeps the dashboard response type available for follow-up
     *         turns ("build it", "next", "add more") even though they don't themselves contain a
     *         dashboard keyword, so a continuation doesn't collapse into proposing charts one at
     *         a time.
     * @return array{response_type: string, answer?: string, chart_title?: string, chart_type?: string, x_field?: string, y_field?: string, agg?: string, dashboard_title?: string, dashboard_explanation?: string, charts?: array}
     */
    public function respond(Dataset $dataset, string $prompt, array $history = [], bool $conversationHasDashboard = false, ?User $user = null): array
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('GEMINI_API_KEY is not configured.');
        }

        $columns = collect($dataset->columns ?? [])->pluck('name')->all();
        // Both go through row-level security: a restricted viewer's assistant only ever sees
        // (and can only quote) the rows that viewer is allowed to see.
        $sample = $this->chartData->sampleRows($dataset, $user, self::SAMPLE_ROWS);

        try {
            $profile = $this->chartData->profile($dataset, $user);
        } catch (\Throwable) {
            $profile = null;
        }

        $chartRules = "chart_type must be one of bar/line/pie/table/kpi. For bar/line/pie you must set x_field and agg "
            . "(and y_field unless agg is \"count\"). For kpi you must set agg (and y_field unless agg is \"count\"). "
            . 'Pick agg from the user\'s actual wording, not by default: "total"/"sum" -> sum, "average"/"mean" -> avg, '
            . '"how many"/"number of"/"count" -> count, "lowest"/"minimum" -> min, "highest"/"maximum" -> max. '
            . 'If a numeric field is named to aggregate without a clear operator, default to sum, not count — count only measures '
            . "how many rows exist, not the field's actual values. "
            . 'ALWAYS give every chart a specific, descriptive chart_title based on what it actually shows (e.g. "Total Revenue by Region", '
            . '"Average Order Value Over Time") — never a generic placeholder like "Chart" or "Untitled".';

        $wantsDashboard = $conversationHasDashboard || $this->looksLikeDashboardRequest($prompt);

        $system = "You are a BI assistant embedded in a dashboard builder called Daha BI, focused on the African market.\n"
            . "You are given a dataset's columns and a sample of its rows, and a user's natural-language request.\n\n"
            . 'Decide between '.($wantsDashboard ? 'three' : 'two')." response types:\n"
            . "- \"chart\": the user wants to visualize the data as ONE specific chart. Propose it using ONLY the exact column names given "
            . "below (never invent a column name). {$chartRules}\n"
            . ($wantsDashboard
                ? "- \"dashboard\": the user wants a full dashboard / overview / multiple charts, OR they are continuing/confirming a "
                    . "dashboard already proposed earlier in this conversation (e.g. replying \"build it\", \"yes\", \"continue\", \"next\", "
                    . "\"add more\", \"looks good\"). In BOTH cases, respond with the FULL set of charts again (refined or expanded from "
                    . "whatever was discussed) — never fall back to proposing just one chart at a time once a dashboard is already underway. "
                    . "Propose 3 to 6 complementary charts that together give a genuinely useful picture of this dataset — avoid "
                    . "near-duplicate charts (e.g. don't propose the same field grouped the same way twice); vary chart_type and the "
                    . "fields/angles covered. Each entry in \"charts\" follows the same rules as a single chart ({$chartRules}). Also give "
                    . "the whole dashboard a short, specific dashboard_title, and a dashboard_explanation (2-4 sentences) describing what it "
                    . "covers and why these particular charts were chosen together.\n"
                : '')
            . "- \"answer\": the user is asking a question. Answer like a senior data analyst briefing a business owner:\n"
            . "  * Lead with the direct answer in the first sentence, with the actual number (formatted with thousands separators).\n"
            . "  * Then give 2-4 short supporting points: comparisons, shares of total (%), the leader vs the rest, trends over time.\n"
            . "  * End with one concrete, practical takeaway or next step when it is useful.\n"
            . "  * Use light Markdown: **bold** for key numbers, '- ' bullet lists with EVERY bullet on its own line (a newline "
            . "before each '- '), and a blank line before the closing takeaway. No headings, no tables, no code.\n"
            . "  * Ground every number in the DATASET PROFILE below — it is computed exactly over ALL rows, so totals, averages, "
            . "top values and monthly trends there are precise and should be quoted as facts. Use the sample rows only for "
            . "row-level detail. If the question needs a figure that is in neither (e.g. a total broken down by two fields), "
            . "say what you can answer exactly, and suggest the chart that would show the rest — never invent a number.\n"
            . "  * If the question is ambiguous or not answerable from this data, say so plainly and suggest a better question.\n"
            . "Whatever the response type, also fill follow_ups with 3 short, specific next questions the user could ask about THIS "
            . "data (under 60 characters each, phrased as the user would type them).\n\n"
            . 'Dataset name: ' . $dataset->name . "\n"
            . 'Dataset columns: ' . implode(', ', $columns) . "\n"
            . ($profile ? 'DATASET PROFILE (exact, all rows, JSON): ' . json_encode($profile) . "\n" : 'Total row count: ' . $dataset->row_count . "\n")
            . 'Sample rows (' . $this->sampleCaveat($dataset) . ', JSON): ' . json_encode($sample);

        $contents = collect($history)
            ->map(fn (array $turn) => ['role' => $turn['role'], 'parts' => [['text' => $turn['content']]]])
            ->push(['role' => 'user', 'parts' => [['text' => $prompt]]])
            ->all();

        $response = $this->generate([
            'system_instruction' => ['parts' => [['text' => $system]]],
            'contents' => $contents,
            'generationConfig' => [
                'responseMimeType' => 'application/json',
                'responseSchema' => $this->responseSchema($columns, $wantsDashboard),
            ],
        ], 60);

        $text = $this->firstText($response->json());

        if (! $text) {
            throw new RuntimeException('AI did not return a response.');
        }

        $data = json_decode($text, true);

        if (! is_array($data) || ! isset($data['response_type'])) {
            throw new RuntimeException('AI response was not in the expected format.');
        }

        return $this->validateAgainstColumns($data, $columns);
    }

    /**
     * Interprets the REAL computed chart result (not the sample rows used to propose the chart)
     * so the analysis is grounded in actual numbers rather than a guess extrapolated from a
     * sample. Best-effort: returns '' on any failure rather than blocking the chart from showing.
     */
    public function interpret(string $chartTitle, string $chartType, array $config, array $data): string
    {
        $prompt = "Chart: \"{$chartTitle}\" ({$chartType}).\n"
            . 'Aggregation: '.($config['agg'] ?? 'n/a').'. X field: '.($config['x_field'] ?? 'n/a').'. Y field: '.($config['y_field'] ?? 'n/a')."\n"
            . 'Computed result (JSON, this is the real, complete aggregate — not a sample): '.json_encode($data)."\n\n"
            . 'In 2-3 short sentences, give a specific, concrete interpretation of this result — the standout value(s), '
            . 'any notable pattern, and one actionable takeaway. Use the actual numbers. Plain prose, no markdown, no preamble.';

        try {
            return $this->rawGenerate($prompt);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * A single call covering ALL charts together — synthesizing across them, not one thin
     * per-chart line — grounded in each chart's real computed data (already condensed by the
     * caller for large series). Best-effort: returns '' on any failure.
     *
     * @param  array<int, array{chart_title: string, chart_type: string, chart_data: mixed}>  $charts
     */
    public function interpretDashboard(string $dashboardTitle, array $charts): string
    {
        if (empty($charts)) {
            return '';
        }

        $chartSummaries = collect($charts)
            ->map(fn (array $c) => sprintf('- "%s" (%s): %s', $c['chart_title'], $c['chart_type'], json_encode($c['chart_data'])))
            ->implode("\n");

        $prompt = "Dashboard: \"{$dashboardTitle}\".\n"
            . "Charts in this dashboard, with their REAL computed results (not samples):\n{$chartSummaries}\n\n"
            . 'Write a thorough analysis (5-8 sentences) that synthesizes insights ACROSS these charts together, not just restating each '
            . 'one in isolation — call out standout numbers, any connections or contrasts between charts, and 1-2 concrete, actionable '
            . 'recommendations. Use the actual numbers from the data above. Plain prose, no markdown, no headers, no preamble.';

        try {
            return $this->rawGenerate($prompt);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * A short, concrete "what should I do next" recommendation for a goal in progress — the
     * roadmap's "AI recommendation engine" applied to the one place it's most directly useful.
     * Best-effort: returns '' on any failure, same as interpret()/interpretDashboard().
     */
    public function recommendForGoal(
        string $goalName,
        float $current,
        float $target,
        string $direction,
        ?float $progressPercent,
        ?string $deadline,
    ): string {
        $prompt = "Goal: \"{$goalName}\" — {$direction} to {$target}. Current value: {$current}."
            .($progressPercent !== null ? " Progress so far: {$progressPercent}%." : '')
            .($deadline ? " Deadline: {$deadline}." : ' No deadline set.')."\n\n"
            .'In 1-2 short sentences, give a specific, actionable recommendation for what to do next to reach this goal '
            .'on time. Reference the actual numbers. Plain prose, no markdown, no preamble.';

        try {
            return $this->rawGenerate($prompt);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * A short, concrete summary of a dataset's data-quality report (see DataQualityService) —
     * the roadmap's "AI data cleaner" applied to explaining what's wrong and what to do about it,
     * rather than silently guessing at fixes. Best-effort: returns '' on any failure.
     */
    public function summarizeDataQuality(string $datasetName, array $report): string
    {
        $prompt = "Dataset: \"{$datasetName}\".\n"
            . 'Data quality report (JSON — missing_pct is % of rows missing that column, duplicate_row_count is exact '
            . 'duplicate rows beyond the first occurrence of each): '.json_encode($report)."\n\n"
            . 'In 2-4 short sentences, summarize the most important data quality issues here and give concrete, practical '
            . 'suggestions for what to do about them. Reference actual numbers from the report. If the data looks clean, '
            . 'say so briefly rather than inventing issues. Plain prose, no markdown, no preamble.';

        try {
            return $this->rawGenerate($prompt);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * Generates a runnable MySQL SELECT query from a natural-language request, grounded in the
     * data source's real table/column names — the notebook equivalent of BigQuery's "Generate
     * SQL" assist. Throws (rather than degrading to '') since this is the primary action the user
     * just asked for, not a supplementary enhancement.
     *
     * @param  array<int, array{table: string, columns: string[]}>  $tables
     */
    public function suggestSql(array $tables, string $prompt, string $driver = 'mysql'): string
    {
        $schema = collect($tables)->map(fn (array $t) => "{$t['table']}(".implode(', ', $t['columns']).')')->implode("\n");

        $dialectName = ['mysql' => 'MySQL', 'postgres' => 'PostgreSQL', 'sqlserver' => 'SQL Server'][$driver] ?? 'MySQL';
        $dialectHint = match ($driver) {
            'sqlserver' => 'Use SQL Server syntax: TOP N (not LIMIT) to cap rows, square-bracket [identifiers] only if needed, GETDATE() for the current date.',
            'postgres' => 'Use PostgreSQL syntax: LIMIT N to cap rows, double-quoted "identifiers" only if needed, double-colon casts (value::type) where useful.',
            default => 'Use MySQL syntax: LIMIT N to cap rows, backtick `identifiers` only if needed.',
        };

        $system = "You are a {$dialectName} query generator embedded in a BI notebook. Given a database schema and a "
            . "natural-language request, write ONE valid {$dialectName} query that fulfills it. Read-only SELECT queries "
            . "only — never write INSERT/UPDATE/DELETE/DROP/ALTER. Use ONLY the exact table and column names given below — "
            . "never invent one. {$dialectHint} Return ONLY the raw SQL — no markdown code fences, no explanation, no "
            . "trailing semicolon.\n\n"
            . "Schema:\n{$schema}";

        return $this->stripCodeFence($this->rawGenerate($prompt, $system));
    }

    /**
     * Generates runnable Python/pandas code from a natural-language request, grounded in the
     * dataset's real column names and a sample of its actual rows.
     *
     * @param  string[]  $columns
     */
    public function suggestPython(array $columns, array $sample, string $prompt): string
    {
        $system = "You are a Python/pandas code generator embedded in a BI notebook. A pandas DataFrame named `df` is "
            . "already loaded with the dataset described below. Given a natural-language request, write Python code using "
            . "`df` that fulfills it, assigning the final result to a variable named `result` (a DataFrame, Series, or "
            . 'scalar) so it can be displayed — only use print() if nothing meaningful can be assigned to a variable. Use '
            . "ONLY the exact column names given below — never invent one. Return ONLY the raw Python code — no markdown "
            . "code fences, no explanation.\n\n"
            . 'Columns: '.implode(', ', $columns)."\n"
            . 'Sample rows (JSON): '.json_encode($sample);

        return $this->stripCodeFence($this->rawGenerate($prompt, $system));
    }

    /**
     * Low-level single-turn generation, no schema constraint — shared by every method here that
     * just wants plain text back. Throws on failure; callers decide whether to degrade gracefully.
     */
    protected function rawGenerate(string $prompt, ?string $systemPrompt = null): string
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('GEMINI_API_KEY is not configured.');
        }

        $body = ['contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]]];

        if ($systemPrompt) {
            $body['system_instruction'] = ['parts' => [['text' => $systemPrompt]]];
        }

        $text = trim((string) $this->firstText($this->generate($body, 30)->json()));

        if (! $text) {
            throw new RuntimeException('AI did not return a response.');
        }

        return $text;
    }

    /**
     * One generateContent call on the configured model, falling back to the lighter
     * GEMINI_FALLBACK_MODEL when the main one is overloaded (503) or rate-limited (429) —
     * Gemini's bigger models hit demand spikes often enough that chat would otherwise just fail.
     */
    /**
     * One generateContent call with fast failover. Gemini models are regularly overloaded
     * (503/429, or simply not answering), so: each model gets at most PER_MODEL_TIMEOUT seconds
     * (the last one gets whatever time is left), and a model that just failed is skipped for
     * two minutes, so later requests go straight to one that works instead of waiting again.
     */
    /**
     * People using the app in French or Arabic get the AI's words in that language too.
     * Code, JSON keys and the dataset's own field names and values stay exactly as they are,
     * since the app reads those back.
     */
    public static function withAnswerLanguage(array $body): array
    {
        $language = ['fr' => 'French', 'ar' => 'Arabic'][app()->getLocale()] ?? null;
        if (! $language) {
            return $body;
        }

        $rule = "\n\nLANGUAGE: The user reads this app in {$language}. Write every piece of natural-language text you return "
            ."(answers, explanations, insights, chart and dashboard titles, descriptions, suggested follow-up questions, "
            ."recommendations, code comments) in {$language}. Do NOT translate JSON keys, enum values, SQL or Python code, "
            ."or the dataset's column names and data values: copy those exactly as given.";

        $parts = $body['system_instruction']['parts'] ?? [];
        $parts[] = ['text' => $rule];
        $body['system_instruction'] = ['parts' => $parts];

        return $body;
    }

    protected function generate(array $body, int $timeout): \Illuminate\Http\Client\Response
    {
        $body = self::withAnswerLanguage($body);
        $models = array_values(array_unique(array_filter([
            config('services.gemini.model'),
            config('services.gemini.fallback_model'),
        ])));
        $healthy = array_values(array_filter($models, fn ($m) => ! Cache::has("gemini-down:{$m}")));
        $order = $healthy ?: $models; // all marked down: still try them all

        $deadline = microtime(true) + $timeout;
        $response = null;
        $lastError = 'no model answered';
        foreach ($order as $i => $model) {
            $isLast = $i === count($order) - 1;
            $remaining = max(5, (int) floor($deadline - microtime(true)));
            $budget = $isLast ? $remaining : min(self::PER_MODEL_TIMEOUT, $remaining);

            try {
                $response = Http::withHeaders(['x-goog-api-key' => config('services.gemini.key')])
                    ->connectTimeout(5)
                    ->timeout($budget)
                    ->post(self::BASE_URL."/models/{$model}:generateContent", $body);
            } catch (\Illuminate\Http\Client\ConnectionException $e) {
                Cache::put("gemini-down:{$model}", true, 120);
                $lastError = "{$model} timed out";
                $response = null;

                continue;
            }

            if ($response->successful()) {
                return $response;
            }
            if (in_array($response->status(), [429, 500, 502, 503, 504], true)) {
                Cache::put("gemini-down:{$model}", true, 120);
                $lastError = "{$model}: ".($response->json('error.message') ?? $response->status());

                continue;
            }
            // 4xx (bad request, bad key, unknown model): retrying another model won't help.
            throw new RuntimeException('Gemini request failed: '.($response->json('error.message') ?? $response->body()));
        }

        throw new RuntimeException('Gemini request timed out: '.$lastError);
    }

    /** Thinking models may put a thought part first — take the first part that has real text. */
    protected function firstText(?array $json): ?string
    {
        foreach ($json['candidates'][0]['content']['parts'] ?? [] as $part) {
            if (! empty($part['text']) && empty($part['thought'])) {
                return $part['text'];
            }
        }

        return null;
    }

    /**
     * Despite being told not to, models sometimes wrap code output in a ```sql / ```python fence
     * anyway — strip it defensively so the result is always directly runnable.
     */
    protected function stripCodeFence(string $text): string
    {
        $text = preg_replace('/^```[a-zA-Z]*\n?/', '', $text);
        $text = preg_replace('/\n?```$/', '', $text ?? '');

        return trim($text ?? '');
    }

    /**
     * Only widened to include the "dashboard" branch (charts[]/dashboard_title/dashboard_explanation,
     * all marked required) when $allowDashboard is true — Gemini's schema has no way to make a
     * field "required only when response_type is X", so leaving the dashboard branch out entirely
     * for ordinary chart/answer requests avoids forcing the model to pad every response with a
     * throwaway 3-item charts array just to satisfy the schema.
     *
     * @param  string[]  $columns
     */
    protected function responseSchema(array $columns, bool $allowDashboard): array
    {
        $chartProperties = [
            'chart_title' => ['type' => 'STRING'],
            'chart_type' => ['type' => 'STRING', 'enum' => ['bar', 'line', 'pie', 'table', 'kpi']],
            'x_field' => ['type' => 'STRING', 'enum' => $columns],
            'y_field' => ['type' => 'STRING', 'enum' => $columns],
            'agg' => ['type' => 'STRING', 'enum' => ['sum', 'avg', 'count', 'min', 'max']],
        ];

        $properties = array_merge($chartProperties, [
            'response_type' => ['type' => 'STRING', 'enum' => $allowDashboard ? ['chart', 'answer', 'dashboard'] : ['chart', 'answer']],
            'answer' => ['type' => 'STRING'],
            'follow_ups' => ['type' => 'ARRAY', 'maxItems' => 3, 'items' => ['type' => 'STRING']],
        ]);
        $required = ['response_type'];

        if ($allowDashboard) {
            $properties['dashboard_title'] = ['type' => 'STRING'];
            $properties['dashboard_explanation'] = ['type' => 'STRING'];
            $properties['charts'] = [
                'type' => 'ARRAY',
                'minItems' => 3,
                'maxItems' => 6,
                'items' => [
                    'type' => 'OBJECT',
                    'properties' => $chartProperties,
                    'required' => ['chart_title', 'chart_type'],
                ],
            ];
            array_push($required, 'charts', 'dashboard_title', 'dashboard_explanation');
        }

        return ['type' => 'OBJECT', 'properties' => $properties, 'required' => $required];
    }

    /**
     * Cheap keyword gate deciding whether this turn's schema should offer the "dashboard" branch
     * at all (see responseSchema() for why it's not just always offered).
     */
    protected function looksLikeDashboardRequest(string $prompt): bool
    {
        $needle = strtolower($prompt);
        $phrases = [
            'dashboard', 'overview', 'full picture', 'multiple charts', 'several charts',
            'various charts', 'all the charts', 'set of charts', 'bunch of charts', 'suite of charts',
        ];

        foreach ($phrases as $phrase) {
            if (str_contains($needle, $phrase)) {
                return true;
            }
        }

        return false;
    }

    protected function sampleCaveat(Dataset $dataset): string
    {
        return $dataset->row_count <= self::SAMPLE_ROWS
            ? 'the complete dataset'
            : 'only the first ' . self::SAMPLE_ROWS . ' of ' . $dataset->row_count . ' rows';
    }

    protected function validateAgainstColumns(array $data, array $columns): array
    {
        if ($data['response_type'] === 'chart') {
            $this->validateChartFields($data, $columns);

            return $data;
        }

        if ($data['response_type'] === 'dashboard') {
            foreach ($data['charts'] ?? [] as $chart) {
                $this->validateChartFields($chart, $columns);
            }
        }

        return $data;
    }

    protected function validateChartFields(array $chart, array $columns): void
    {
        foreach (['x_field', 'y_field'] as $key) {
            if (! empty($chart[$key]) && ! in_array($chart[$key], $columns, true)) {
                throw new RuntimeException("AI proposed an unknown column: {$chart[$key]}");
            }
        }
    }
}
