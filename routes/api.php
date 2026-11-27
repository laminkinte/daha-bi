<?php

use App\Http\Controllers\Api\Admin\AdminController;
use App\Http\Controllers\Api\Admin\PlatformController;
use App\Http\Controllers\Api\AiConversationController;
use App\Http\Controllers\Api\AiPromptController;
use App\Http\Controllers\Api\AlertController;
use App\Http\Controllers\Api\GoalController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\CommentController;
use App\Http\Controllers\Api\DashboardShareController;
use App\Http\Controllers\Api\BrandingController;
use App\Http\Controllers\Api\EmbedController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\ChartController;
use App\Http\Controllers\Api\DashboardCollaboratorController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DashboardExportController;
use App\Http\Controllers\Api\DashboardTemplateController;
use App\Http\Controllers\Api\DataSourceController;
use App\Http\Controllers\Api\DatasetController;
use App\Http\Controllers\Api\NotebookController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\DataModelController;
use App\Http\Controllers\Api\RowLevelPolicyController;
use App\Http\Controllers\Api\PublicDashboardController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\ReportScheduleController;
use App\Http\Controllers\Api\SiteSettingsController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');

Route::get('/public/dashboards/{token}', [PublicDashboardController::class, 'show']);
Route::post('/public/dashboards/{token}/charts/{chart}/data', [PublicDashboardController::class, 'chartData']);

Route::get('/site-settings', [SiteSettingsController::class, 'show']);

Route::get('/public/invitations/{token}', [InvitationController::class, 'preview'])->middleware('throttle:30,1');
Route::get('/public/shares/{token}', [DashboardShareController::class, 'preview'])->middleware('throttle:30,1');

Route::get('/public/brand-logo/{organization}', [BrandingController::class, 'logo']);
Route::get('/public/embeds/{token}', [EmbedController::class, 'show'])->middleware('throttle:60,1');
Route::get('/public/embeds/{token}/frame-policy', [EmbedController::class, 'framePolicy'])->middleware('throttle:120,1');
Route::post('/public/embeds/{token}/charts/{chart}/data', [EmbedController::class, 'chartData'])->middleware('throttle:240,1');

// Paystack calls this server-to-server — authenticated by HMAC signature, not Sanctum.
Route::post('/webhooks/paystack', [BillingController::class, 'webhook']);

// Stripe calls this server-to-server — authenticated by its own signature scheme, not Sanctum.
Route::post('/webhooks/stripe', [BillingController::class, 'stripeWebhook']);

// Flutterwave calls this server-to-server — authenticated by the verif-hash header, not Sanctum.
Route::post('/webhooks/flutterwave', [BillingController::class, 'flutterwaveWebhook']);

Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::put('/user', [AuthController::class, 'updateProfile']);
    Route::put('/user/password', [AuthController::class, 'updatePassword']);
    Route::get('/referrals', [ReferralController::class, 'index']);

    Route::get('/organizations', [OrganizationController::class, 'index']);
    Route::put('/user/organization', [OrganizationController::class, 'switch']);
    Route::get('/organizations/{organization}/members', [OrganizationController::class, 'members']);
    Route::post('/organizations/{organization}/members', [OrganizationController::class, 'invite']);
    Route::put('/organizations/{organization}/members/{member}', [OrganizationController::class, 'updateMember']);
    Route::delete('/organizations/{organization}/members/{member}', [OrganizationController::class, 'removeMember']);
    Route::put('/organizations/{organization}', [OrganizationController::class, 'update']);
    Route::get('/organizations/{organization}/audit-logs', [AuditLogController::class, 'index']);
    Route::get('/organizations/{organization}/invitations', [InvitationController::class, 'index']);
    Route::get('/dashboards/{dashboard}/invitations', [InvitationController::class, 'forDashboard']);
    Route::post('/invitations/{invitation}/resend', [InvitationController::class, 'resend'])->middleware('throttle:10,1');
    Route::delete('/invitations/{invitation}', [InvitationController::class, 'destroy']);
    Route::post('/invitations/{token}/accept', [InvitationController::class, 'accept'])->middleware('throttle:10,1');

    Route::get('/organizations/{organization}/branding', [BrandingController::class, 'show']);
    Route::post('/organizations/{organization}/branding', [BrandingController::class, 'update']);
    Route::get('/dashboards/{dashboard}/embeds', [EmbedController::class, 'index']);
    Route::post('/dashboards/{dashboard}/embeds', [EmbedController::class, 'store'])->middleware('throttle:20,1');
    Route::delete('/embeds/{embed}', [EmbedController::class, 'destroy']);

    Route::get('/dashboards/{dashboard}/company-shares', [DashboardShareController::class, 'index']);
    Route::post('/dashboards/{dashboard}/company-shares', [DashboardShareController::class, 'store'])->middleware('throttle:20,1');
    Route::put('/company-shares/{share}', [DashboardShareController::class, 'update']);
    Route::delete('/company-shares/{share}', [DashboardShareController::class, 'destroy']);
    Route::post('/shares/{token}/accept', [DashboardShareController::class, 'accept'])->middleware('throttle:10,1');

    Route::get('/dashboards/{dashboard}/comments', [CommentController::class, 'index']);
    Route::get('/dashboards/{dashboard}/mentionable', [CommentController::class, 'mentionable']);
    Route::post('/dashboards/{dashboard}/comments', [CommentController::class, 'store'])->middleware('throttle:30,1');
    Route::patch('/comments/{comment}', [CommentController::class, 'update']);
    Route::delete('/comments/{comment}', [CommentController::class, 'destroy']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'readAll']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'read']);

    Route::post('/billing/checkout', [BillingController::class, 'checkout']);
    Route::get('/billing/verify', [BillingController::class, 'verify']);
    Route::post('/billing/stripe/checkout', [BillingController::class, 'stripeCheckout']);
    Route::get('/billing/stripe/verify', [BillingController::class, 'stripeVerify']);
    Route::post('/billing/flutterwave/checkout', [BillingController::class, 'flutterwaveCheckout']);
    Route::get('/billing/flutterwave/verify', [BillingController::class, 'flutterwaveVerify']);

    Route::apiResource('data-sources', DataSourceController::class);
    Route::post('/sample-data', [\App\Http\Controllers\Api\SampleDataController::class, 'store'])->middleware('throttle:5,1');
    Route::post('/data-sources/{dataSource}/resync', [DataSourceController::class, 'resync']);
    Route::get('/data-sources/{dataSource}/tables', [DataSourceController::class, 'tables']);
    Route::get('/data-sources/{dataSource}/tables/{table}/preview', [DataSourceController::class, 'previewTable']);
    Route::post('/data-sources/{dataSource}/notebook/run', [NotebookController::class, 'run']);
    Route::post('/data-sources/{dataSource}/notebook/save', [NotebookController::class, 'save']);
    Route::post('/data-sources/{dataSource}/notebook/suggest-sql', [NotebookController::class, 'suggestSql']);
    Route::post('/datasets/{dataset}/notebook/python', [NotebookController::class, 'runPython'])->middleware('throttle:30,1');
    Route::get('/notebook/python-status', [NotebookController::class, 'pythonStatus']);
    Route::post('/datasets/{dataset}/notebook/suggest-python', [NotebookController::class, 'suggestPython']);

    Route::apiResource('datasets', DatasetController::class)->only(['index', 'show', 'destroy']);
    Route::get('/datasets/{dataset}/preview', [DatasetController::class, 'preview']);
    Route::get('/datasets/{dataset}/quality-report', [DatasetController::class, 'qualityReport']);
    Route::post('/datasets/{dataset}/remove-duplicates', [DatasetController::class, 'removeDuplicates']);
    Route::get('/datasets/{dataset}/row-level-policies', [RowLevelPolicyController::class, 'index']);
    Route::post('/datasets/{dataset}/row-level-policies', [RowLevelPolicyController::class, 'store']);
    Route::delete('/row-level-policies/{rowLevelPolicy}', [RowLevelPolicyController::class, 'destroy']);

    Route::get('/data-models', [DataModelController::class, 'index']);
    Route::post('/data-models', [DataModelController::class, 'store']);
    Route::get('/data-models/{dataModel}', [DataModelController::class, 'show']);
    Route::put('/data-models/{dataModel}', [DataModelController::class, 'update']);
    Route::post('/data-models/{dataModel}/run', [DataModelController::class, 'run']);
    Route::delete('/data-models/{dataModel}', [DataModelController::class, 'destroy']);

    Route::apiResource('dashboards', DashboardController::class);
    Route::get('/dashboard-templates', [DashboardTemplateController::class, 'index']);
    Route::post('/dashboard-templates', [DashboardTemplateController::class, 'store']);
    Route::post('/dashboards/{dashboard}/share', [DashboardController::class, 'share']);
    Route::delete('/dashboards/{dashboard}/share', [DashboardController::class, 'unshare']);
    Route::post('/dashboards/{dashboard}/ai-recommendations', [DashboardController::class, 'aiRecommendations']);
    Route::post('/dashboards/{dashboard}/duplicate', [DashboardController::class, 'duplicate']);
    Route::get('/dashboards/{dashboard}/slicer-values', [DashboardController::class, 'slicerValues']);
    Route::get('/dashboards/{dashboard}/export/excel', [DashboardExportController::class, 'excel']);

    Route::get('/dashboards/{dashboard}/collaborators', [DashboardCollaboratorController::class, 'index']);
    Route::post('/dashboards/{dashboard}/collaborators', [DashboardCollaboratorController::class, 'store']);
    Route::delete('/dashboards/{dashboard}/collaborators/{collaborator}', [DashboardCollaboratorController::class, 'destroy']);

    Route::get('/dashboards/{dashboard}/report-schedules', [ReportScheduleController::class, 'index']);
    Route::post('/dashboards/{dashboard}/report-schedules', [ReportScheduleController::class, 'store']);
    Route::delete('/report-schedules/{reportSchedule}', [ReportScheduleController::class, 'destroy']);
    Route::post('/report-schedules/{reportSchedule}/send-now', [ReportScheduleController::class, 'sendNow']);

    Route::post('/dashboards/{dashboard}/ai-prompt', [AiPromptController::class, 'respond']);

    Route::apiResource('ai-conversations', AiConversationController::class)
        ->only(['index', 'store', 'show', 'destroy'])
        ->parameters(['ai-conversations' => 'conversation']);
    Route::post('/ai-conversations/{conversation}/messages', [AiConversationController::class, 'sendMessage']);
    Route::post('/ai-messages/{message}/save-chart', [AiConversationController::class, 'saveChart']);
    Route::post('/ai-messages/{message}/save-dashboard', [AiConversationController::class, 'saveDashboard']);

    Route::post('/dashboards/{dashboard}/charts', [ChartController::class, 'store']);
    Route::post('/dashboards/{dashboard}/charts/preview', [ChartController::class, 'preview']);
    Route::get('/charts/{chart}', [ChartController::class, 'show']);
    Route::put('/charts/{chart}', [ChartController::class, 'update']);
    Route::delete('/charts/{chart}', [ChartController::class, 'destroy']);
    Route::post('/charts/{chart}/data', [ChartController::class, 'data']);
    Route::post('/charts/{chart}/duplicate', [ChartController::class, 'duplicate']);

    Route::get('/alerts', [AlertController::class, 'index']);
    Route::get('/charts/{chart}/alerts', [AlertController::class, 'forChart']);
    Route::post('/charts/{chart}/alerts', [AlertController::class, 'store']);
    Route::delete('/alerts/{alert}', [AlertController::class, 'destroy']);

    Route::get('/goals', [GoalController::class, 'index']);
    Route::get('/charts/{chart}/goals', [GoalController::class, 'forChart']);
    Route::post('/charts/{chart}/goals', [GoalController::class, 'store']);
    Route::delete('/goals/{goal}', [GoalController::class, 'destroy']);
    Route::post('/goals/{goal}/recommend', [GoalController::class, 'recommend']);

    Route::middleware('admin')->prefix('admin')->group(function () {
        Route::get('/stats', [AdminController::class, 'stats']);
        Route::get('/users', [AdminController::class, 'users']);
        Route::put('/users/{user}/admin', [AdminController::class, 'setAdmin']);
        Route::delete('/users/{user}', [AdminController::class, 'destroyUser']);
        Route::get('/subscriptions', [AdminController::class, 'subscriptions']);
        Route::get('/payments', [AdminController::class, 'payments']);
        Route::put('/site-settings/{key}', [SiteSettingsController::class, 'update']);

        Route::get('/overview', [PlatformController::class, 'overview']);
        Route::get('/health', [PlatformController::class, 'health']);
        Route::get('/actions', [PlatformController::class, 'actions']);
        Route::get('/users/{user}', [PlatformController::class, 'showUser']);
        Route::post('/users/{user}/suspend', [PlatformController::class, 'suspend']);
        Route::post('/users/{user}/unsuspend', [PlatformController::class, 'unsuspend']);
        Route::post('/users/{user}/sign-out', [PlatformController::class, 'signOutEverywhere']);
        Route::post('/users/{user}/password-reset', [PlatformController::class, 'sendPasswordReset'])->middleware('throttle:10,1');
        Route::get('/organizations', [PlatformController::class, 'organizations']);
        Route::put('/organizations/{organization}/plan', [PlatformController::class, 'updatePlan']);
    });
});
