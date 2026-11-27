<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'referral_code' => ['nullable', 'string', 'max:12'],
            'invite_token' => ['nullable', 'string', 'max:100'],
            // A personal account works alone; an organization account is named after the company
            // and is where teammates get invited. Both are workspaces underneath.
            'account_type' => ['nullable', 'in:personal,organization'],
            'organization_name' => ['required_if:account_type,organization', 'nullable', 'string', 'max:255'],
        ]);
        $accountType = $validated['account_type'] ?? 'personal';

        $referredBy = ! empty($validated['referral_code'])
            ? User::where('referral_code', strtoupper($validated['referral_code']))->first()
            : null;

        // Every account is an organization — a solo signup just gets one with a single member,
        // invisibly (see orgs:backfill for the equivalent one-time migration of pre-existing
        // users). Created before the user so current_organization_id (NOT NULL) can be set on
        // the very first insert — current_organization_id isn't $fillable, so forceFill it.
        $organization = new Organization([
            'name' => $accountType === 'organization' ? trim($validated['organization_name']) : "{$validated['name']} (Personal)",
        ]);
        $organization->forceFill(['account_type' => $accountType])->save();

        $user = new User();
        $user->forceFill([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
            'referred_by_id' => $referredBy?->id,
            'current_organization_id' => $organization->id,
        ])->save();

        $organization->members()->attach($user->id, ['role' => 'owner']);

        // Signing up from an invitation link: join the inviting workspace/dashboard right away.
        // A bad or mismatched link must not block the signup itself, so failures are reported, not thrown.
        $inviteError = null;
        if (! empty($validated['invite_token'])) {
            $invitation = \App\Models\Invitation::findByToken($validated['invite_token']);
            try {
                abort_unless($invitation, 404, 'This invitation link is not valid.');
                app(\App\Services\InvitationService::class)->accept($invitation, $user);
                $user->refresh();
            } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                $inviteError = $e->getMessage();
            }
        }

        $token = $user->createToken('api')->plainTextToken;

        if ($inviteError) {
            return response()->json([
                'user' => $user->load('currentOrganization'),
                'token' => $token,
                'invite_error' => $inviteError,
            ], 201);
        }

        return response()->json([
            'user' => $user->load('currentOrganization'),
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->suspended_at) {
            throw ValidationException::withMessages([
                'email' => ['This account has been suspended. Contact support if you think this is a mistake.'],
            ]);
        }

        $token = $user->createToken('api')->plainTextToken;
        $user->forceFill(['last_active_at' => now()])->saveQuietly();

        return response()->json([
            'user' => $user->load('currentOrganization'),
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('currentOrganization');
        // What the current workspace's plan includes and how much of it is used — drives the
        // plan card in Settings and upgrade prompts.
        $user->currentOrganization?->setAttribute('plan_usage', $user->currentOrganization->planUsage());

        return response()->json($user);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'low_bandwidth_mode' => ['sometimes', 'boolean'],
        ]);

        $user->update($validated);

        return response()->json($user->fresh()->load('currentOrganization'));
    }

    public function updatePassword(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->update(['password' => $validated['password']]);

        return response()->json(['message' => 'Password updated.']);
    }

    public function forgotPassword(Request $request)
    {
        $validated = $request->validate(['email' => ['required', 'string', 'email']]);

        Password::sendResetLink($validated);

        // Same response whether or not the email is registered, so this can't be used to enumerate accounts.
        return response()->json(['message' => 'If an account exists for that email, a reset link has been sent.']);
    }

    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset($validated, function (User $user, string $password) {
            $user->forceFill(['password' => $password])->save();
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => [__($status)]]);
        }

        return response()->json(['message' => 'Password has been reset.']);
    }
}
