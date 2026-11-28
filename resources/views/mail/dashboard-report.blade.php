<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 4px;">{{ $dashboard->name }}</h2>
    <p style="color: #666; margin: 0 0 24px;">{{ __('Your scheduled Daha BI report') }}</p>

    @foreach ($chartSummaries as $item)
        <div style="border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px 18px; margin-bottom: 12px;">
            <div style="font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.03em;">{{ $item['type'] }}</div>
            <div style="font-size: 15px; font-weight: 600; margin: 2px 0 6px;">{{ $item['title'] }}</div>
            <div style="font-size: 14px; color: #333;">{{ $item['summary'] }}</div>
        </div>
    @endforeach

    <p style="font-size: 13px; color: #888; margin-top: 20px;">{{ __('Sent automatically by Daha BI based on your report schedule.') }}</p>
</body>
</html>
