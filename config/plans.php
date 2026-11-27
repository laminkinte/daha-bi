<?php

/*
| What each plan includes, enforced on the server. Every plan gets every feature; plans differ
| only in how many dashboards a workspace can have.
| null = unlimited, true/false = feature on/off. A workspace whose paid plan has lapsed falls
| back to "free" (see Organization::effectivePlan()). Nothing is ever deleted when a workspace
| is over a limit: it just can't add more until it upgrades.
*/

$everything = [
    'users' => null,
    'share_links' => null,
    'database_sources' => true,
    'notebook' => true,
    'ai' => true,
    'branding' => true,
];

return [
    // Early access: until the platform has this many users, every new sign-up's workspace
    // starts on Business at no charge (and keeps it; an admin can change it in the console).
    // 0 turns the programme off.
    'early_access_users' => (int) env('EARLY_ACCESS_USERS', 100),

    'free' => ['dashboards' => 15] + $everything,
    'growth' => ['dashboards' => 20] + $everything,
    'business' => ['dashboards' => null] + $everything,
];
