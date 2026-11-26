<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/** White-label settings for a workspace: display name, brand colour, logo, "Powered by" badge. */
class BrandingController extends Controller
{
    public function __construct(protected AuditLogger $auditLog)
    {
    }

    public function show(Request $request, Organization $organization)
    {
        $this->authorize('view', $organization);

        return $organization->branding() + ['brand_name' => $organization->brand_name];
    }

    public function update(Request $request, Organization $organization)
    {
        $this->authorize('manage', $organization);

        $validated = $request->validate([
            'brand_name' => ['nullable', 'string', 'max:60'],
            'brand_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'brand_hide_powered_by' => ['nullable', 'boolean'],
            // Raster only: an SVG can carry script, and the logo is shown on other companies' sites.
            'logo' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:512'],
            'remove_logo' => ['nullable', 'boolean'],
        ]);

        $organization->fill([
            'brand_name' => $validated['brand_name'] ?? null,
            'brand_color' => isset($validated['brand_color']) ? strtolower($validated['brand_color']) : null,
            'brand_hide_powered_by' => (bool) ($validated['brand_hide_powered_by'] ?? false),
        ]);

        if ($request->hasFile('logo') || ($validated['remove_logo'] ?? false)) {
            if ($organization->brand_logo_path) {
                Storage::disk('local')->delete($organization->brand_logo_path);
            }
            $organization->brand_logo_path = $request->hasFile('logo')
                ? $request->file('logo')->store("branding/{$organization->id}", 'local')
                : null;
        }

        $organization->save();
        $this->auditLog->log($organization->id, $request->user()->id, 'organization.branding_updated', 'Updated workspace branding');

        return $organization->branding() + ['brand_name' => $organization->brand_name];
    }

    /** Public: the logo file, so embeds on other sites can show it without auth. */
    public function logo(Organization $organization)
    {
        abort_unless($organization->brand_logo_path && Storage::disk('local')->exists($organization->brand_logo_path), Response::HTTP_NOT_FOUND);

        return Storage::disk('local')->response($organization->brand_logo_path, null, [
            'Cache-Control' => 'public, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
