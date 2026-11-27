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
        'model' => env('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
        // Used automatically when the main model is overloaded or rate-limited.
        'fallback_model' => env('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash'),
    ],

    'python' => [
        'bin' => env('PYTHON_BIN', 'python'),
        // Who may run notebook Python: 'all' = any workspace editor, 'admins' = platform
        // super-admins only, 'disabled' = nobody. Without a sandbox, 'all' is downgraded to
        // admins outside local development (unsandboxed code = code execution on the server).
        'access' => env('PYTHON_NOTEBOOK_ACCESS', 'admins'),
        // 'bwrap' = bubblewrap isolation (Linux production), 'none' = plain subprocess (local dev).
        'sandbox' => env('PYTHON_SANDBOX', 'none'),
        'bwrap' => env('PYTHON_BWRAP_BIN', '/usr/bin/bwrap'),
        // A dedicated virtualenv with pandas/numpy/matplotlib, mounted read-only in the sandbox.
        'env_dir' => env('PYTHON_ENV_DIR'),
        'memory_mb' => (int) env('PYTHON_MEMORY_MB', 2048),
        // 'process' = run in the web request; 'queue' = hand to the dedicated `python` queue worker
        // (needed where PHP-FPM forbids namespaces, e.g. systemd RestrictNamespaces=yes).
        'runner' => env('PYTHON_RUNNER', 'process'),
    ],

    'data_sources' => [
        // External DB connections to loopback/private/reserved addresses let a tenant
        // reach this server's own database (and anything else on the internal network).
        // Allowed by default only in the local environment, where connecting to a
        // localhost MySQL is the normal case.
        'allow_private_hosts' => (bool) env('DATA_SOURCES_ALLOW_PRIVATE_HOSTS', env('APP_ENV') === 'local'),
    ],

    'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000'),

    // Who hears about every new sign-up (empty = nobody).
    'signup_notify_email' => env('SIGNUP_NOTIFY_EMAIL', 'dahabidahatech@gmail.com'),

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
