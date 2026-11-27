<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * For signed-in API requests: blocks suspended accounts (and kills the token they used), and
 * records "last active" — at most once every 5 minutes, so it costs one write per session-ish.
 */
class TrackUserActivity
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->suspended_at) {
            $user->currentAccessToken()?->delete();

            return response()->json(['message' => 'This account has been suspended. Contact support if you think this is a mistake.'], Response::HTTP_FORBIDDEN);
        }

        if ($user && (! $user->last_active_at || $user->last_active_at->lt(now()->subMinutes(5)))) {
            $user->forceFill(['last_active_at' => now()])->saveQuietly();
        }

        return $next($request);
    }
}
