<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    <div style="font-weight: 700; color: #0f766e; font-size: 15px; margin-bottom: 24px;">Daha BI</div>

    <h2 style="margin: 0 0 8px; font-size: 20px;">{{ __("You're invited to :target", ['target' => $target]) }}</h2>
    <p style="color: #444; margin: 0 0 20px; line-height: 1.5;">
        @if ($invitation->dashboard)
            {{ __(':inviter invited you to collaborate on Daha BI as a dashboard :role.', ['inviter' => $inviter, 'role' => __($invitation->dashboard_role)]) }}
        @else
            {{ __(':inviter invited you to collaborate on Daha BI as :role in the :workspace workspace.', ['inviter' => $inviter, 'role' => ['owner' => __('an owner'), 'admin' => __('an admin'), 'analyst' => __('an analyst'), 'viewer' => __('a viewer'), 'editor' => __('an editor')][$invitation->role] ?? $invitation->role, 'workspace' => $invitation->organization->name]) }}
        @endif
    </p>

    <a href="{{ $url }}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 22px; border-radius: 8px;">{{ __('Accept invitation') }}</a>

    <p style="font-size: 13px; color: #666; margin: 24px 0 4px;">{{ __('Or paste this link into your browser:') }}</p>
    <p style="font-size: 12px; color: #0f766e; word-break: break-all; margin: 0 0 24px;" dir="ltr">{{ $url }}</p>

    <p style="font-size: 12px; color: #888; line-height: 1.5;">
        {{ __('This invitation expires on :date and only works for :email.', ['date' => $invitation->expires_at->format('Y-m-d'), 'email' => $invitation->email]) }}
        {{ __("If you weren't expecting it, you can ignore this email.") }}
    </p>
</body>
</html>
