@php($n = fn ($v) => rtrim(rtrim(number_format($v, 2), '0'), '.'))
<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 4px;">{{ __('Alert triggered') }}</h2>
    <p style="color: #666; margin: 0 0 24px;">{{ $dashboard->name }}</p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <div style="font-size: 14px; color: #991b1b; font-weight: 600;">{{ $chart->title }}</div>
        <div style="font-size: 28px; font-weight: 700; margin: 4px 0;" dir="ltr">{{ $n($value) }}</div>
        @if ($alert->condition === 'anomaly' && $baselineMean !== null)
            <div style="font-size: 13px; color: #991b1b;">
                {{ __('Unusual compared to the recent average of :mean', ['mean' => $n($baselineMean)]) }}
                @if ($baselineStddev)
                    {{ __('(typically within ±:range)', ['range' => $n($baselineStddev * $alert->sensitivity)]) }}
                @endif
            </div>
        @else
            <div style="font-size: 13px; color: #991b1b;">{{ __('Condition: value is :condition :threshold', ['condition' => __($alert->condition), 'threshold' => $n($alert->threshold)]) }}</div>
        @endif
    </div>

    <p style="font-size: 13px; color: #888;">{{ __("You're receiving this because you set an alert on this metric in Daha BI.") }}</p>
</body>
</html>
