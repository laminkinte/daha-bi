<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuditLogController extends Controller
{
    /**
     * Owner/admin only — the same audience allowed to manage members and billing sees who did
     * what to the organization's resources.
     */
    public function index(Request $request, Organization $organization)
    {
        abort_unless(
            in_array($request->user()->roleInOrganization($organization->id), ['owner', 'admin'], true),
            Response::HTTP_FORBIDDEN
        );

        return $organization->auditLogs()
            ->with('user:id,name,email')
            ->latest('created_at')
            ->limit(200)
            ->get();
    }
}
