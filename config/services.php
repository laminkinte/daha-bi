<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-flash-lite-latest'),
    ],

    'python' => [
        'bin' => env('PYTHON_BIN', 'python'),
        // Who may run notebook Python. It executes unsandboxed as the web server's OS
        // user, so in a multi-tenant deployment it is remote code execution for anyone
        // allowed to use it. 'admins' = platform super-admins only; 'all' = any org
        // editor (single-user local machines only); 'disabled' = nobody.
        'access' => env('PYTHON_NOTEBOOK_ACCESS', 'admins'),
    ],

    'data_sources' => [
        // External DB connections to loopback/private/reserved addresses let a tenant
        // reach this server's own database (and anything else on the internal network).
        // Allowed by default only in the local environment, where connecting to a
        // localhost MySQL is the normal case.
        'allow_private_hosts' => (bool) env('DATA_SOURCES_ALLOW_PRIVATE_HOSTS', env('APP_ENV') === 'local'),
    ],

    'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000'),

    'paystack' => [
        'secret_key' => env('PAYSTACK_SECRET_KEY'),
        'public_key' => env('PAYSTACK_PUBLIC_KEY'),
    ],

    'stripe' => [
        'secret_key' => env('STRIPE_SECRET_KEY'),
        'publishable_key' => env('STRIPE_PUBLISHABLE_KEY'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
    ],

    'flutterwave' => [
        'secret_key' => env('FLUTTERWAVE_SECRET_KEY'),
        'public_key' => env('FLUTTERWAVE_PUBLIC_KEY'),
        'secret_hash' => env('FLUTTERWAVE_SECRET_HASH'),
    ],

];
