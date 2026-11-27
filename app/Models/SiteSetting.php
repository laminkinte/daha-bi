<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SiteSetting extends Model
{
    protected $fillable = ['key', 'value'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }

    /**
     * Hardcoded fallback content — what the marketing site shows until an admin customizes
     * a given section. Keeping these here (not just in the frontend) means `GET /site-settings`
     * always returns a complete, valid payload even before any row exists.
     */
    public static function defaults(): array
    {
        return [
            'landing_hero' => [
                'headline_prefix' => 'Business intelligence built for the way',
                'headline_highlight' => 'growing businesses',
                'headline_suffix' => 'actually work',
                'subheadline' => 'Connect your data, build dashboards in minutes, and get answers in plain English — on a phone or a laptop, in Dollars, Euros, Naira, or any currency you use, anywhere in the world.',
            ],
            'landing_stats' => [
                ['value' => '180+', 'label' => 'world currencies formatted natively'],
                ['value' => '5', 'label' => 'chart types — bar, line, pie, KPI, table'],
                ['value' => 'SQL + Python', 'label' => 'notebook against your own data'],
                ['value' => '0', 'label' => 'cost to get started'],
            ],
            'landing_steps' => [
                ['title' => 'Connect your data', 'description' => 'Upload a CSV or point it at a live MySQL database — a table, or your own SQL query.'],
                ['title' => 'Build in minutes', 'description' => "Drag together bar, line, pie, KPI, and table charts, or just describe what you want in plain English."],
                ['title' => 'Share and stay ahead', 'description' => 'Invite your team, set alerts on the numbers that matter, and share a link with anyone else.'],
            ],
            'landing_features' => [
                ['icon' => 'dashboard', 'title' => 'Real dashboards, not spreadsheets', 'description' => 'Connect a CSV or a live MySQL database and build bar, line, pie, KPI, and table charts in minutes.'],
                ['icon' => 'sparkle', 'title' => 'Ask in plain English', 'description' => 'Describe what you want — "revenue by region as a bar chart" — and let AI build the chart or answer the question.'],
                ['icon' => 'code', 'title' => 'A real notebook when you need one', 'description' => 'Write full SQL or Python/pandas directly against your data. No exporting to another tool.'],
                ['icon' => 'share', 'title' => 'Share a dashboard with one link', 'description' => 'Send a read-only public link to a co-founder or investor — no account required to view it.'],
                ['icon' => 'globe', 'title' => 'Built for global currencies', 'description' => 'Format any figure in Dollars, Euros, Naira, Rand, Rupees, or any of 180+ world currencies — wherever your business runs.'],
                ['icon' => 'phone', 'title' => 'Mobile-first by design', 'description' => "The whole platform works properly on a phone, because that's how most of your team will use it."],
                ['icon' => 'team', 'title' => 'Built for teams, not just one login', 'description' => 'Invite teammates as viewers or editors on any dashboard — everyone sees the same live numbers.'],
                ['icon' => 'bell', 'title' => "Know the moment something's wrong", 'description' => 'Set a threshold on any KPI and get notified the instant it crosses — no need to keep checking back.'],
                ['icon' => 'report', 'title' => 'Reports that show up on their own', 'description' => 'Schedule a dashboard summary to land in your inbox daily or weekly, or send one on demand.'],
            ],
            'landing_faqs' => [
                ['question' => 'Do I need a credit card to start?', 'answer' => 'No. The free plan includes every feature — AI, the notebook, live databases, your whole team — for up to 15 dashboards, no card required. Growth raises that to 20 dashboards, Business to unlimited.'],
                ['question' => 'Can I connect my own MySQL database?', 'answer' => 'Yes — either point it at a specific table or write your own SQL query, and daha-bi keeps a synced copy for fast dashboards. You can also browse tables and preview data before connecting.'],
                ['question' => 'Can my team work in the same account?', 'answer' => 'Yes. Invite teammates to any dashboard as a viewer or an editor — everyone with access sees the same live data and charts, with permissions enforced on every action.'],
                ['question' => 'What happens when a number crosses a threshold I care about?', 'answer' => "Set an alert on any KPI chart (above or below a value). It's checked automatically and you'll see it flagged the moment it's breached."],
                ['question' => 'Is a shared dashboard really public?', 'answer' => 'Only if you turn sharing on. A shared dashboard gets a read-only link anyone can open without an account — you can disable it again at any time.'],
            ],
            'pricing_tiers' => [
                [
                    'plan' => 'free',
                    'name' => 'Free',
                    'amount_kobo' => 0,
                    'amount_usd_cents' => 0,
                    'period' => 'forever',
                    'tagline' => 'For getting your first dashboard live.',
                    'highlighted' => false,
                    'features' => ['Up to 15 dashboards', 'Every feature included', 'Unlimited users & share links', 'AI chat, notebook & live databases', 'All 14 chart types', 'Community support'],
                ],
                [
                    'plan' => 'growth',
                    'name' => 'Growth',
                    'amount_kobo' => 1_500_000,
                    'amount_usd_cents' => 1_000,
                    // 10x monthly (~2 months free) is the yearly price — a standard SaaS discount.
                    'amount_kobo_yearly' => 15_000_000,
                    'amount_usd_cents_yearly' => 10_000,
                    'period' => '/ month',
                    'tagline' => 'For a small team that lives in its data.',
                    'highlighted' => true,
                    'features' => ['Up to 20 dashboards', 'Every feature included', 'Unlimited users & share links', 'AI chat, notebook & live databases', 'Custom branding', 'Email support'],
                ],
                [
                    'plan' => 'business',
                    'name' => 'Business',
                    'amount_kobo' => 4_500_000,
                    'amount_usd_cents' => 3_000,
                    'amount_kobo_yearly' => 45_000_000,
                    'amount_usd_cents_yearly' => 30_000,
                    'period' => '/ month',
                    'tagline' => 'For companies scaling across teams.',
                    'highlighted' => false,
                    'features' => ['Unlimited dashboards', 'Every feature included', 'Unlimited users & share links', 'AI chat, notebook & live databases', 'Custom branding', 'Priority support'],
                ],
            ],
        ];
    }

    public static function get(string $key): mixed
    {
        $stored = static::where('key', $key)->value('value');

        return $stored ?? (static::defaults()[$key] ?? null);
    }

    /**
     * @return array<string, mixed>
     */
    public static function allMerged(): array
    {
        $stored = static::query()->pluck('value', 'key')->all();

        return array_merge(static::defaults(), $stored);
    }
}
