<?php

namespace App\Tenant\Notifications\Services;

use App\Tenant\Notifications\Models\InAppNotification;

class InAppNotificationService
{
    /**
     * Crea una notificacion para un usuario especifico.
     */
    public static function notify(
        int    $userId,
        string $type,
        string $title,
        string $body,
        array  $data = [],
        string $icon = 'bell',
        string $color = '#6b7280',
        ?string $actionUrl = null,
    ): InAppNotification {
        return InAppNotification::create([
            'user_id'    => $userId,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'data'       => $data ?: null,
            'icon'       => $icon,
            'color'      => $color,
            'action_url' => $actionUrl,
        ]);
    }

    /**
     * Crea una notificacion broadcast para todos los usuarios del tenant (user_id = null).
     */
    public static function broadcast(
        string $type,
        string $title,
        string $body,
        array  $data = [],
        string $icon = 'bell',
        string $color = '#6b7280',
        ?string $actionUrl = null,
    ): InAppNotification {
        return InAppNotification::create([
            'user_id'    => null,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'data'       => $data ?: null,
            'icon'       => $icon,
            'color'      => $color,
            'action_url' => $actionUrl,
        ]);
    }

    /**
     * Helpers de tipo para llamada rapida desde eventos.
     */
    public static function stockAlert(int $userId, string $productName, int $stock, int $minStock): InAppNotification
    {
        return self::notify(
            userId:    $userId,
            type:      'stock_alert',
            title:     'Stock bajo: ' . $productName,
            body:      "Stock actual: {$stock} / Minimo: {$minStock}",
            data:      ['stock' => $stock, 'min_stock' => $minStock],
            icon:      'alert-triangle',
            color:     '#f59e0b',
            actionUrl: '/inventory/products',
        );
    }

    public static function saleCreated(int $userId, string $saleNumber, float $total): InAppNotification
    {
        return self::notify(
            userId:    $userId,
            type:      'sale',
            title:     'Venta registrada ' . $saleNumber,
            body:      'Total: $' . number_format($total, 0),
            data:      ['sale_number' => $saleNumber, 'total' => $total],
            icon:      'check-circle',
            color:     '#22c55e',
            actionUrl: '/pos/sales',
        );
    }

    public static function transferStatusChanged(int $userId, string $transferNumber, string $status): InAppNotification
    {
        $colors = ['pending' => '#f59e0b', 'in_transit' => '#3b82f6', 'received' => '#22c55e', 'cancelled' => '#ef4444'];
        return self::notify(
            userId:    $userId,
            type:      'transfer',
            title:     'Transferencia ' . $transferNumber,
            body:      'Estado actualizado a: ' . $status,
            data:      ['status' => $status],
            icon:      'truck',
            color:     $colors[$status] ?? '#6b7280',
            actionUrl: '/warehouse/transfers',
        );
    }

    public static function billingAlert(string $title, string $body): InAppNotification
    {
        return self::broadcast(
            type:  'billing',
            title: $title,
            body:  $body,
            icon:  'credit-card',
            color: '#ef4444',
        );
    }
}
