<?php

use Illuminate\Support\Facades\Route;
use App\Central\Auth\Controllers\AuthController;
use App\Central\Auth\Controllers\PasswordResetController;
use App\Central\Auth\Controllers\TwoFactorController;
use App\Central\Auth\Controllers\TenantRegistrationController;
use App\Central\Plans\Controllers\PlanController;
use App\Central\Plans\Controllers\AddonController;
use App\Central\Tenants\Controllers\TenantController;
use App\Central\Tenants\Controllers\TenantUserAdminController;
use App\Central\Dashboard\Controllers\DashboardController;
use App\Central\Billing\Controllers\SubscriptionController;
use App\Central\Billing\Controllers\PaymentGatewayController;
use App\Central\Billing\Controllers\WompiWebhookController;
use App\Central\Audit\Controllers\AuditLogController;
use App\Central\Notifications\Controllers\NotificationController;
use App\Central\Notifications\Controllers\NotificationRuleController;
use App\Central\Modules\Controllers\ModuleRegistryController;
use App\Central\Modules\Controllers\BusinessTypeController;
use App\Central\Params\Controllers\SystemParamController;
use App\Central\Params\Controllers\PublicSettingsController;
use App\Shared\Media\MediaController;
use App\Shared\Media\CentralMediaController;
use App\Central\Auth\Controllers\CentralUserController;

/*
|--------------------------------------------------------------------------
| Rutas Centrales (Base de datos public)
| Accesibles desde el dominio principal: atlas.com
|--------------------------------------------------------------------------
*/

// ─── Health Check ─────────────────────────────────────────────────────────────
Route::get('health', \App\Central\Health\Controllers\HealthCheckController::class);

// ─── Autenticación Central ────────────────────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::post('register',              [TenantRegistrationController::class, 'register'])->middleware('throttle:register');
    Route::post('register/resume',       [TenantRegistrationController::class, 'resume'])->middleware('throttle:register');
    Route::get('setup-status/{slug}',    [TenantRegistrationController::class, 'setupStatus']);
    Route::post('login',           [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('forgot-password', [PasswordResetController::class, 'forgotPassword'])->middleware('throttle:password-reset');
    Route::post('reset-password',  [PasswordResetController::class, 'resetPassword'])->middleware('throttle:password-reset');

    // Google OAuth (publico)
    Route::get('google/status',          [\App\Central\Auth\Controllers\GoogleAuthController::class, 'status']);
    Route::get('google',                 [\App\Central\Auth\Controllers\GoogleAuthController::class, 'redirect']);
    Route::get('google/callback',        [\App\Central\Auth\Controllers\GoogleAuthController::class, 'callback']);
    Route::post('google/complete-setup', [\App\Central\Auth\Controllers\GoogleAuthController::class, 'completeSetup']);
    Route::middleware('auth:api')->group(function () {
        Route::post('logout',  [AuthController::class, 'logout']);
        Route::get('me',       [AuthController::class, 'me']);

        // ─── Perfil del usuario autenticado ────────────────────────────────
        Route::put('profile',  [AuthController::class, 'updateProfile']);
        Route::put('password', [AuthController::class, 'changePassword']);

        // ─── 2FA TOTP ──────────────────────────────────────────────────────
        Route::prefix('2fa')->group(function () {
            Route::get('/',        [TwoFactorController::class, 'status']);   // estado actual
            Route::post('setup',   [TwoFactorController::class, 'setup']);   // genera secreto + QR URI
            Route::post('enable',  [TwoFactorController::class, 'enable']);  // verifica código y activa
            Route::delete('/',     [TwoFactorController::class, 'disable']); // desactiva (requiere código o password)
        });
    });
});

// ─── Planes (público para ver, protegido para gestionar) ──────────────────────
Route::prefix('plans')->group(function () {
    Route::get('/',     [PlanController::class, 'index']);
    Route::get('/{id}', [PlanController::class, 'show']);

    Route::middleware(['auth:api', 'role:super'])->group(function () {
        Route::post('/',        [PlanController::class, 'store']);
        Route::put('/{id}',    [PlanController::class, 'update']);
        Route::delete('/{id}', [PlanController::class, 'destroy']);
    });
});

// ─── Add-ons ──────────────────────────────────────────────────────────────────
Route::prefix('addons')->group(function () {
    Route::get('/', [AddonController::class, 'index']);

    Route::middleware(['auth:api', 'role:super'])->group(function () {
        Route::post('/',        [AddonController::class, 'store']);
        Route::put('/{id}',    [AddonController::class, 'update']);
        Route::delete('/{id}', [AddonController::class, 'destroy']);
    });
});

// ─── Module Registry (público para leer, protegido para gestionar) ────────────
Route::prefix('modules')->group(function () {
    Route::get('/',     [ModuleRegistryController::class, 'index']);
    Route::get('/{id}', [ModuleRegistryController::class, 'show']);

    Route::middleware(['auth:api', 'role:super'])->group(function () {
        Route::post('/',        [ModuleRegistryController::class, 'store']);
        Route::put('/{id}',    [ModuleRegistryController::class, 'update']);
        Route::delete('/{id}', [ModuleRegistryController::class, 'destroy']);
    });
});

// ─── Tipos de Negocio (público para leer, protegido para gestionar) ───────────
Route::prefix('business-types')->group(function () {
    Route::get('/',     [BusinessTypeController::class, 'index']);
    Route::get('/{id}', [BusinessTypeController::class, 'show']);

    Route::middleware(['auth:api', 'role:super'])->group(function () {
        Route::post('/',                  [BusinessTypeController::class, 'store']);
        Route::put('/{id}',              [BusinessTypeController::class, 'update']);
        Route::delete('/{id}',           [BusinessTypeController::class, 'destroy']);
        Route::post('/{id}/modules',     [BusinessTypeController::class, 'syncModules']);
    });
});

// ─── Super Admin ──────────────────────────────────────────────────────────────
Route::middleware(['auth:api', 'role:super'])->group(function () {

    // Dashboard
    Route::get('dashboard', [DashboardController::class, 'index']);

    // ─── Tenants ──────────────────────────────────────────────────────────────
    Route::prefix('tenants')->group(function () {
        Route::get('/',                       [TenantController::class, 'index']);
        Route::get('/{id}',                   [TenantController::class, 'show']);
        Route::patch('/{id}/status',          [TenantController::class, 'updateStatus']);
        Route::patch('/{id}/plan',            [TenantController::class, 'changePlan']);
        Route::post('/{id}/addons',           [TenantController::class, 'syncAddon']);
        Route::patch('/{id}/business-type',   [TenantController::class, 'updateBusinessType']);

        // Módulos del tenant (desde admin central)
        Route::get('/{id}/modules',                       [TenantController::class, 'getModules']);
        Route::patch('/{id}/modules/{moduleKey}',         [TenantController::class, 'patchModule']);

        // Settings del tenant (desde admin central)
        Route::get('/{id}/settings',                      [TenantController::class, 'getSettings']);
        Route::patch('/{id}/settings',                    [TenantController::class, 'patchSettings']);

        // Acciones de inicialización
        Route::post('/{id}/seed-puc',                     [TenantController::class, 'seedPUC']);
    });

    // ─── Billing / Suscripciones ──────────────────────────────────────────────
    Route::prefix('subscriptions')->group(function () {
        Route::get('/',                           [SubscriptionController::class, 'index']);
        Route::post('/',                          [SubscriptionController::class, 'store']);
        Route::get('/{id}',                      [SubscriptionController::class, 'show']);
        Route::post('/{id}/payments',            [SubscriptionController::class, 'recordPayment']);
        Route::patch('/{id}/cancel',             [SubscriptionController::class, 'cancel']);
        Route::get('/tenant/{tenantId}/history', [SubscriptionController::class, 'tenantHistory']);
    });

    // ─── Pasarelas de pago ────────────────────────────────────────────────────
    Route::prefix('payment-gateways')->group(function () {
        Route::get('/',            [PaymentGatewayController::class, 'index']);
        Route::post('/',           [PaymentGatewayController::class, 'store']);
        Route::get('/{id}',        [PaymentGatewayController::class, 'show']);
        Route::put('/{id}',        [PaymentGatewayController::class, 'update']);
        Route::delete('/{id}',     [PaymentGatewayController::class, 'destroy']);
        Route::patch('/{id}/toggle', [PaymentGatewayController::class, 'toggle']);
    });

    // ─── Historial de Add-ons por tenant ─────────────────────────────────────
    Route::prefix('addon-history')->group(function () {
        Route::get('/', [\App\Central\Billing\Controllers\TenantAddonHistoryController::class, 'index']);
        Route::patch('/{tenantId}/{addonId}/deactivate', [\App\Central\Billing\Controllers\TenantAddonHistoryController::class, 'deactivate']);
        Route::patch('/{tenantId}/{addonId}/activate',   [\App\Central\Billing\Controllers\TenantAddonHistoryController::class, 'activate']);
        // Renovación: aplica precio vigente de addons.price como price_paid
        Route::patch('/{tenantId}/{addonId}/renew',      [\App\Central\Billing\Controllers\TenantAddonHistoryController::class, 'renew']);
    });

    // ─── Usuarios de Tenants (gestión super admin) ────────────────────────────
    Route::prefix('tenants/{tenantId}/users')->group(function () {
        Route::get('/',                          [TenantUserAdminController::class, 'index']);
        Route::get('/{userId}',                 [TenantUserAdminController::class, 'show']);
        Route::patch('/{userId}/toggle',        [TenantUserAdminController::class, 'toggleActive']);
        Route::post('/{userId}/reset-password', [TenantUserAdminController::class, 'resetPassword']);
    });

    // ─── Audit Log ────────────────────────────────────────────────────────────
    Route::prefix('audit')->group(function () {
        Route::get('/stats',   [AuditLogController::class, 'stats']);
        Route::get('/filters', [AuditLogController::class, 'filters']);
        Route::get('/{id}',    [AuditLogController::class, 'show']);
        Route::get('/',        [AuditLogController::class, 'index']);
    });

    // ─── Notificaciones a Tenants ─────────────────────────────────────────────
    Route::prefix('notifications')->group(function () {
        Route::get('/',                [NotificationController::class, 'index']);
        Route::post('/send',           [NotificationController::class, 'send']);
        Route::post('/trial-expiring', [NotificationController::class, 'sendTrialExpiring']);
        Route::get('/{id}',           [NotificationController::class, 'show']);
    });

    // ─── Reglas de Notificación Automática ───────────────────────────────────
    Route::prefix('notification-rules')->group(function () {
        Route::get('/',                                          [NotificationRuleController::class, 'index']);
        Route::post('/',                                         [NotificationRuleController::class, 'store']);
        Route::get('/{notificationRule}',                        [NotificationRuleController::class, 'show']);
        Route::put('/{notificationRule}',                        [NotificationRuleController::class, 'update']);
        Route::delete('/{notificationRule}',                     [NotificationRuleController::class, 'destroy']);
        Route::patch('/{notificationRule}/toggle',               [NotificationRuleController::class, 'toggle']);
        Route::post('/{notificationRule}/run',                   [NotificationRuleController::class, 'runNow']);
    });

    // ─── Usuarios Centrales (RBAC) ────────────────────────────────────────────
    Route::prefix('central-users')->group(function () {
        Route::get('/',         [CentralUserController::class, 'index']);
        Route::post('/',        [CentralUserController::class, 'store']);
        Route::get('/roles',    [CentralUserController::class, 'roles']);
        Route::get('/{id}',     [CentralUserController::class, 'show']);
        Route::put('/{id}',     [CentralUserController::class, 'update']);
        Route::delete('/{id}',  [CentralUserController::class, 'destroy']);
    });

    // ─── Roles y Permisos Centrales ───────────────────────────────────────────
    $RC = \App\Central\Auth\Controllers\CentralRoleController::class;
    Route::prefix('central-roles')->group(function () use ($RC) {
        Route::get('/',                     [$RC, 'index']);
        Route::post('/',                    [$RC, 'store']);
        Route::get('/permissions',          [$RC, 'permissions']);
        Route::put('/{id}',                 [$RC, 'update']);
        Route::delete('/{id}',              [$RC, 'destroy']);
        Route::put('/{id}/permissions',     [$RC, 'syncPermissions']);
    });

    // ─── Parametros del Sistema ───────────────────────────────────────────────
    Route::prefix('params')->group(function () {
        Route::get('/',        [SystemParamController::class, 'index']);   // ?group=payroll
        Route::patch('/',      [SystemParamController::class, 'update']);  // PATCH multiple params
        Route::get('/{key}',   [SystemParamController::class, 'show']);    // single param with cast value
    });

    // ─── Backups de Base de Datos ─────────────────────────────────────────────
    Route::prefix('backups')->group(function () {
        Route::get('/',                      [\App\Central\Backups\Controllers\BackupController::class, 'index']);
        Route::post('/',                     [\App\Central\Backups\Controllers\BackupController::class, 'store']);
        Route::get('/tenant/{slug}',         [\App\Central\Backups\Controllers\BackupController::class, 'indexTenant']);
        Route::post('/tenant/{slug}',        [\App\Central\Backups\Controllers\BackupController::class, 'storeTenant']);
        Route::get('/{id}/download',         [\App\Central\Backups\Controllers\BackupController::class, 'download']);
        Route::delete('/{id}',               [\App\Central\Backups\Controllers\BackupController::class, 'destroy']);
    });
});

// ─── Monedas y tasas de cambio ────────────────────────────────────────────────

// Públicas (sin auth — para que el frontend las lea)
Route::get('currencies',    [\App\Central\Currencies\Controllers\CurrencyController::class, 'index']);
Route::get('exchange-rates',[\App\Central\Currencies\Controllers\CurrencyController::class, 'rateIndex']);

// Super-admin
Route::middleware(['auth:api', 'role:super'])->group(function () {
    Route::post('currencies',          [\App\Central\Currencies\Controllers\CurrencyController::class, 'store']);
    Route::put('currencies/{code}',    [\App\Central\Currencies\Controllers\CurrencyController::class, 'update']);
    Route::post('exchange-rates',      [\App\Central\Currencies\Controllers\CurrencyController::class, 'rateStore']);
});

// ─── Configuración pública (sin auth, para login page y registro) ────────────
Route::get('settings/public', [PublicSettingsController::class, 'show']);

// ─── Media central (imágenes del panel de administración) ─────────────────────
Route::middleware(['auth:api', 'role:super'])->group(function () {
    Route::post('media/central/upload',  [CentralMediaController::class, 'upload'])->middleware('throttle:20,1');
    Route::delete('media/central',       [CentralMediaController::class, 'destroy']);
});
// Servir imágenes centrales (público)
Route::get(
    'media/central/{category}/{year}/{month}/{filename}',
    [CentralMediaController::class, 'serve']
)->where('filename', '.+');

// ─── Tienda pública (sin auth) ────────────────────────────────────────────────
Route::prefix('store/{tenant}')->group(function () {
    Route::get('config',           [\App\Tenant\Ecommerce\Controllers\StoreController::class, 'config']);
    Route::get('products',         [\App\Tenant\Ecommerce\Controllers\StoreController::class, 'catalog']);
    Route::get('products/{id}',    [\App\Tenant\Ecommerce\Controllers\StoreController::class, 'product']);
    Route::post('orders',          [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'checkout'])->middleware('throttle:10,1');
    Route::get('orders/{id}',      [\App\Tenant\Ecommerce\Controllers\StoreOrderController::class, 'orderStatus']);
});

// ─── Imágenes (servir archivos publicamente) ──────────────────────────────────
Route::get(
    'media/{tenant}/{module}/{year}/{month}/{filename}',
    [MediaController::class, 'serve']
)->where('filename', '.+');

// ─── Webhooks de pasarelas de pago (sin auth, verifican firma interna) ────────
Route::prefix('webhooks/{tenant}')->group(function () {
    Route::post('mercadopago', [\App\Tenant\Ecommerce\Controllers\PaymentWebhookController::class, 'mercadoPago']);
    Route::post('stripe',      [\App\Tenant\Ecommerce\Controllers\PaymentWebhookController::class, 'stripe']);
    Route::post('pse',         [\App\Tenant\Ecommerce\Controllers\PaymentWebhookController::class, 'pse']);
});

// ─── Webhook Wompi (suscripciones SaaS — sin auth, sin tenant scope) ─────────
Route::post('webhooks/wompi', [WompiWebhookController::class, 'handle'])
    ->middleware('throttle:60,1');
