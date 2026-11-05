<?php

// Plan prices themselves live in the site_settings 'pricing_tiers' row (admin-editable, and
// the actual source PaystackService charges from — see App\Models\SiteSetting::defaults()).
// This file only holds things that aren't meant to be edited per-tier.
return [
    'currency' => 'NGN',
];
