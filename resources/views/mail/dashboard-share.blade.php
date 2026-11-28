<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    <div style="font-weight: 700; color: #0f766e; font-size: 15px; margin-bottom: 24px;">Daha BI</div>

    <h2 style="margin: 0 0 8px; font-size: 20px;">{{ __(':company shared a dashboard with your company', ['company' => $company]) }}</h2>
    <p style="color: #444; margin: 0 0 20px; line-height: 1.5;">
        {{ __(':person at :company wants to share “:dashboard” with your team on Daha BI.', ['person' => $sharedBy ?? __('Someone'), 'company' => $company, 'dashboard' => $share->dashboard->name]) }}
        {{ __('Once you accept, everyone in your workspace can view it — live, always up to date.') }}
    </p>

    <a href="{{ $url }}" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 22px; border-radius: 8px;">{{ __('Review and accept') }}</a>

    <p style="font-size: 13px; color: #666; margin: 24px 0 4px;">{{ __('Or paste this link into your browser:') }}</p>
    <p style="font-size: 12px; color: #0f766e; word-break: break-all; margin: 0 0 24px;" dir="ltr">{{ $url }}</p>

    <p style="font-size: 12px; color: #888; line-height: 1.5;">
        {{ __("You'll need to be an owner or admin of a Daha BI workspace to accept (creating one is free).") }}
        {{ __('This link expires on :date.', ['date' => $share->expires_at->format('Y-m-d')]) }}
    </p>
</body>
</html>
