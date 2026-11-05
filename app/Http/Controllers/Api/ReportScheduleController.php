<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dashboard;
use App\Models\ReportSchedule;
use App\Services\DashboardReportService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ReportScheduleController extends Controller
{
    public function __construct(protected DashboardReportService $reports)
    {
    }

    public function index(Request $request, Dashboard $dashboard)
    {
        $this->authorizeAccess($request, $dashboard);

        return $dashboard->reportSchedules()->latest()->get();
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        $this->authorizeAccess($request, $dashboard);

        $validated = $request->validate([
            'recipients' => ['required', 'array', 'min:1'],
            'recipients.*' => ['email'],
            'frequency' => ['required', 'in:daily,weekly'],
            'day_of_week' => ['required_if:frequency,weekly', 'nullable', 'integer', 'min:0', 'max:6'],
            'time_of_day' => ['nullable', 'date_format:H:i'],
        ]);

        $timeOfDay = $validated['time_of_day'] ?? '08:00';

        $schedule = $dashboard->reportSchedules()->create([
            'user_id' => $request->user()->id,
            'recipients' => $validated['recipients'],
            'frequency' => $validated['frequency'],
            'day_of_week' => $validated['day_of_week'] ?? null,
            'time_of_day' => $timeOfDay,
            'next_run_at' => $this->computeNextRun($validated['frequency'], $validated['day_of_week'] ?? null, $timeOfDay),
        ]);

        return response()->json($schedule, 201);
    }

    public function destroy(Request $request, ReportSchedule $reportSchedule)
    {
        abort_unless(
            in_array($reportSchedule->dashboard->roleFor($request->user()), ['owner', 'editor'], true),
            Response::HTTP_FORBIDDEN
        );

        $reportSchedule->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    public function sendNow(Request $request, ReportSchedule $reportSchedule)
    {
        abort_unless(
            in_array($reportSchedule->dashboard->roleFor($request->user()), ['owner', 'editor'], true),
            Response::HTTP_FORBIDDEN
        );

        $this->reports->send($reportSchedule);

        $reportSchedule->update(['last_sent_at' => now()]);

        return response()->json(['sent' => true]);
    }

    public function computeNextRun(string $frequency, ?int $dayOfWeek, string $timeOfDay): Carbon
    {
        [$hour, $minute] = array_map('intval', explode(':', $timeOfDay));

        if ($frequency === 'daily') {
            $next = now()->setTime($hour, $minute, 0);

            return $next->isFuture() ? $next : $next->addDay();
        }

        if (now()->dayOfWeek === $dayOfWeek) {
            $today = now()->setTime($hour, $minute, 0);
            if ($today->isFuture()) {
                return $today;
            }
        }

        return now()->next($dayOfWeek)->setTime($hour, $minute, 0);
    }

    protected function authorizeAccess(Request $request, Dashboard $dashboard): void
    {
        abort_unless(
            in_array($dashboard->roleFor($request->user()), ['owner', 'editor'], true),
            Response::HTTP_FORBIDDEN
        );
    }
}
