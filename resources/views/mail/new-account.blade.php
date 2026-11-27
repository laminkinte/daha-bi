<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    <div style="font-weight: 700; color: #0f766e; font-size: 15px; margin-bottom: 24px;">Daha BI</div>

    <h2 style="margin: 0 0 8px; font-size: 20px;">New account created</h2>
    <p style="color: #444; margin: 0 0 20px; line-height: 1.5;">
        {{ $user->name }} just signed up. That makes {{ number_format($totalUsers) }} {{ $totalUsers === 1 ? 'user' : 'users' }} on the platform.
    </p>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 0 0 24px;">
        <tr><td style="padding: 6px 0; color: #666; width: 40%;">Name</td><td style="padding: 6px 0; font-weight: 600;">{{ $user->name }}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0;"><a href="mailto:{{ $user->email }}" style="color: #0f766e;">{{ $user->email }}</a></td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Account type</td><td style="padding: 6px 0;">{{ ucfirst($kind) }}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Workspace</td><td style="padding: 6px 0;">{{ $organization->name }}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Plan</td><td style="padding: 6px 0;">{{ ucfirst($organization->plan ?? 'free') }}</td></tr>
        @if ($joinedVia)
            <tr><td style="padding: 6px 0; color: #666;">Joined via</td><td style="padding: 6px 0;">{{ $joinedVia }}</td></tr>
        @endif
        <tr><td style="padding: 6px 0; color: #666;">Signed up</td><td style="padding: 6px 0;">{{ $user->created_at?->format('j M Y, H:i') }} (server time)</td></tr>
    </table>

    <a href="{{ $adminUrl }}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 22px; border-radius: 8px;">Open the admin console</a>

    <p style="font-size: 12px; color: #888; line-height: 1.5; margin-top: 24px;">
        Reply to this email to write to {{ $user->name }} directly.
    </p>
</body>
</html>
