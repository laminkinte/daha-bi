<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    <div style="font-weight: 700; color: #0f766e; font-size: 15px; margin-bottom: 24px;">Daha BI</div>

    <h2 style="margin: 0 0 8px; font-size: 20px;">You're invited to {{ $target }}</h2>
    <p style="color: #444; margin: 0 0 20px; line-height: 1.5;">
        {{ $inviter }} invited you to collaborate on Daha BI
        @if ($invitation->dashboard)
            as a dashboard {{ $invitation->dashboard_role }}.
        @else
            as {{ in_array($invitation->role, ['admin', 'analyst']) ? 'an' : 'a' }} {{ $invitation->role }} in the {{ $invitation->organization->name }} workspace.
        @endif
    </p>

    <a href="{{ $url }}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 22px; border-radius: 8px;">Accept invitation</a>

    <p style="font-size: 13px; color: #666; margin: 24px 0 4px;">Or paste this link into your browser:</p>
    <p style="font-size: 12px; color: #0f766e; word-break: break-all; margin: 0 0 24px;">{{ $url }}</p>

    <p style="font-size: 12px; color: #888; line-height: 1.5;">
        This invitation expires on {{ $invitation->expires_at->format('j M Y') }} and only works for {{ $invitation->email }}.
        If you weren't expecting it, you can ignore this email.
    </p>
</body>
</html>
