<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ─── Tareas programadas ───────────────────────────────────────────────────────

// Alertas de stock bajo: cada hora revisa todos los tenants activos
Schedule::command('atlas:check-stock-alerts')->hourly()->withoutOverlapping();

// Notificaciones de trial por vencer: diariamente a las 9am
Schedule::command('atlas:notify-trial-expiring')->dailyAt('09:00')->withoutOverlapping();

// Recordatorios de pago (previos al vencimiento, vencidos, advertencia de suspensión)
Schedule::command('atlas:notify-payment-due')->dailyAt('08:00')->withoutOverlapping();

// Suspensión automática de tenants sin pago tras el período de gracia
// Corre a las 01:00 AM (bajo tráfico, antes que los recordatorios del día)
Schedule::command('atlas:suspend-overdue')->dailyAt('01:00')->withoutOverlapping();

// Facturación recurrente: genera facturas automáticas a las 6am
Schedule::command('atlas:generate-recurring-invoices')->dailyAt('06:00')->withoutOverlapping();

// Reglas de notificación automática: evalúa cada 5 minutos cuáles reglas son debidas según su horario
Schedule::command('atlas:process-notification-rules')->everyFiveMinutes()->withoutOverlapping();

// Depreciación mensual de activos fijos: día 1 de cada mes a las 02:00 AM
Schedule::command('atlas:depreciate')->monthlyOn(1, '02:00')->withoutOverlapping();

// Reposición automática de inventario: diariamente a las 07:00 AM
Schedule::command('atlas:auto-replenishment')->dailyAt('07:00')->withoutOverlapping();

// Backup automático de PostgreSQL: diariamente a las 03:00 AM (bajo tráfico)
Schedule::command('atlas:backup-database')->dailyAt('03:00')->withoutOverlapping();
