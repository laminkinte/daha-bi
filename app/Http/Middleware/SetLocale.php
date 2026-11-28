<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Answers in the interface language the frontend sends (Accept-Language: en, fr or ar), so
 * error messages, validation errors and AI answers match what the person is reading.
 */
class SetLocale
{
    public const SUPPORTED = ['en', 'fr', 'ar'];

    public function handle(Request $request, Closure $next): Response
    {
        $locale = self::fromHeader($request->header('Accept-Language'));
        if ($locale) {
            app()->setLocale($locale);
        }

        return $next($request);
    }

    public static function fromHeader(?string $header): ?string
    {
        if (! $header) {
            return null;
        }
        // "fr", "fr-FR", "ar;q=0.9,en;q=0.8" — the first supported language wins.
        foreach (explode(',', $header) as $part) {
            $code = strtolower(substr(trim(explode(';', $part)[0]), 0, 2));
            if (in_array($code, self::SUPPORTED, true)) {
                return $code;
            }
        }

        return null;
    }
}
