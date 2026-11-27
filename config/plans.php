<?php

/*
| What each plan includes — the limits the pricing page promises, enforced on the server.
| null = unlimited, true/false = feature on/off. A workspace whose paid plan has lapsed falls
| back to "free" (see Organization::effectivePlan()). Nothing is ever deleted when a workspace
| is over a limit: it just can't add more until it upgrades.
*/

return [
    'free' => [
        'users' => 1,
        'dashboards' => 3,
        'share_links' => 1,
        'database_sources' => false, // CSV only
        'notebook' => false,
        'ai' => false,
        'branding' => false,
    ],
    'growth' => [
        'users' => 5,
        'dashboards' => null,
        'share_links' => 5,
        'database_sources' => true,
        'notebook' => true,
        'ai' => false,
        'branding' => false,
    ],
    'business' => [
        'users' => null,
        'dashboards' => null,
        'share_links' => null,
        'database_sources' => true,
        'notebook' => true,
        'ai' => true,
        'branding' => true,
    ],
];
