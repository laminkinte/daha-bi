<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Dashboard;
use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DashboardCollaboratorController extends Controller
{
    public function index(Request $request, Dashboard $dashboard)
    {
        $this->authorizeOwner($request, $dashboard);

        return $dashboard->collaborators()->with('user:id,name,email')->latest()->get();
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        $this->authorizeOwner($request, $dashboard);

        $validated = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', 'in:viewer,editor'],
        ]);

        $collaborator = User::where('email', $validated['email'])->first();

        if (! $collaborator) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'No daha-bi account found with that email. They need to create an account first.');
        }

        if ($collaborator->id === $dashboard->user_id) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'That user already owns this dashboard.');
        }

        $record = $dashboard->collaborators()->updateOrCreate(
            ['user_id' => $collaborator->id],
            ['role' => $validated['role']]
        );

        return response()->json($record->load('user:id,name,email'), 201);
    }

    public function destroy(Request $request, Dashboard $dashboard, \App\Models\DashboardCollaborator $collaborator)
    {
        $this->authorizeOwner($request, $dashboard);

        abort_unless($collaborator->dashboard_id === $dashboard->id, Response::HTTP_NOT_FOUND);

        $collaborator->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    protected function authorizeOwner(Request $request, Dashboard $dashboard): void
    {
        $user = $request->user();

        abort_unless(
            $dashboard->user_id === $user->id
                || in_array($user->roleInOrganization($dashboard->organization_id), ['owner', 'admin'], true),
            Response::HTTP_FORBIDDEN
        );
    }
}
