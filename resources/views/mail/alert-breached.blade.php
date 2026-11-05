<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 4px;">Alert triggered</h2>
    <p style="color: #666; margin: 0 0 24px;">{{ $dashboard->name }}</p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <div style="font-size: 14px; color: #991b1b; font-weight: 600;">{{ $chart->title }}</div>
        <div style="font-size: 28px; font-weight: 700; margin: 4px 0;">{{ rtrim(rtrim(number_format($value, 2), '0'), '.') }}</div>
        @if ($alert->condition === 'anomaly' && $baselineMean !== null)
            <div style="font-size: 13px; color: #991b1b;">
                Unusual compared to the recent average of {{ rtrim(rtrim(number_format($baselineMean, 2), '0'), '.') }}
                @if ($baselineStddev)
                    (typically within ±{{ rtrim(rtrim(number_format($baselineStddev * $alert->sensitivity, 2), '0'), '.') }})
                @endif
            </div>
        @else
            <div style="font-size: 13px; color: #991b1b;">Condition: value is {{ $alert->condition }} {{ rtrim(rtrim(number_format($alert->threshold, 2), '0'), '.') }}</div>
        @endif
    </div>

    <p style="font-size: 13px; color: #888;">You're receiving this because you set an alert on this metric in Daha BI.</p>
</body>
</html>
