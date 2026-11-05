<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * A thin, deliberately simple recorder — not every write in the app logs here, only the
 * governance-relevant ones (membership changes, resource lifecycle, billing) that an org owner
 * would actually want to audit later. See AuditLogController for how these are read back.
 */
class AuditLogger
{
    public function log(
        int $organizationId,
        ?int $userId,
        string $action,
        string $description,
        ?Model $auditable = null,
        array $metadata = [],
    ): void {
        AuditLog::create([
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'action' => $action,
            'description' => $description,
            'auditable_type' => $auditable ? get_class($auditable) : null,
            'auditable_id' => $auditable?->id,
            'metadata' => $metadata ?: null,
            'ip_address' => request()->ip(),
            'created_at' => now(),
        ]);
    }
}
