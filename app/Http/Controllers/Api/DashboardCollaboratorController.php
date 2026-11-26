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
        $this->authorize('manage', $dashboard);

        return $dashboard->collaborators()->with('user:id,name,email')->latest()->get();
    }

    public function store(Request $request, Dashboard $dashboard)
    {
        $this->authorize('manage', $dashboard);

        $validated = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', 'in:viewer,editor'],
        ]);

        $collaborator = User::whereRaw('LOWER(email) = ?', [strtolower(trim($validated['email']))])->first();

        // No account yet (typically someone at a partner company): email them a guest invitation.
        if (! $collaborator) {
            [$invitation, $token, $sent] = app(\App\Services\InvitationService::class)->invite(
                $dashboard->organization, $request->user(), $validated['email'], null, $dashboard, $validated['role']
            );

            return response()->json([
                'pending' => true,
                'id' => $invitation->id,
                'email' => $invitation->email,
                'role' => $invitation->dashboard_role,
                'invite_url' => \App\Services\InvitationService::url($token),
                'email_sent' => $sent,
            ], 202);
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
        $this->authorize('manage', $dashboard);

        abort_unless($collaborator->dashboard_id === $dashboard->id, Response::HTTP_NOT_FOUND);

        $collaborator->delete();

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
