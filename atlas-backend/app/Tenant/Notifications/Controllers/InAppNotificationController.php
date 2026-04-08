<?php

namespace App\Tenant\Notifications\Controllers;

use App\Tenant\Notifications\Models\InAppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class InAppNotificationController extends Controller
{
    /**
     * GET /notifications
     * Lista las notificaciones del usuario autenticado.
     * Params: ?unread_only=1, ?per_page=20
     */
    public function index(Request $request): JsonResponse
    {
        $userId = auth('tenant')->id();

        $query = InAppNotification::forUser($userId)
            ->orderByRaw('read_at IS NULL DESC') // no leidas primero
            ->orderByDesc('created_at');

        if ($request->boolean('unread_only')) {
            $query->unread();
        }

        $notifications = $query->paginate($request->integer('per_page', 20));

        return response()->json($notifications);
    }

    /**
     * GET /notifications/count
     * Retorna el conteo de notificaciones no leidas (para el badge del icono).
     */
    public function unreadCount(): JsonResponse
    {
        $userId = auth('tenant')->id();

        $count = InAppNotification::forUser($userId)->unread()->count();

        return response()->json(['unread' => $count]);
    }

    /**
     * PATCH /notifications/{id}/read
     * Marca una notificacion como leida.
     */
    public function markRead(string $id): JsonResponse
    {
        $userId       = auth('tenant')->id();
        $notification = InAppNotification::forUser($userId)->findOrFail($id);

        if (! $notification->isRead()) {
            $notification->update(['read_at' => now()]);
        }

        return response()->json(['message' => 'Notificacion marcada como leida.']);
    }

    /**
     * POST /notifications/read-all
     * Marca todas las notificaciones del usuario como leidas.
     */
    public function markAllRead(): JsonResponse
    {
        $userId = auth('tenant')->id();

        $updated = InAppNotification::forUser($userId)
            ->unread()
            ->update(['read_at' => now()]);

        return response()->json(['message' => "{$updated} notificacion(es) marcadas como leidas."]);
    }

    /**
     * DELETE /notifications/{id}
     * Elimina una notificacion.
     */
    public function destroy(string $id): JsonResponse
    {
        $userId       = auth('tenant')->id();
        $notification = InAppNotification::forUser($userId)->findOrFail($id);
        $notification->delete();

        return response()->json(null, 204);
    }

    /**
     * DELETE /notifications
     * Elimina todas las notificaciones leidas del usuario.
     */
    public function clearRead(): JsonResponse
    {
        $userId = auth('tenant')->id();

        $deleted = InAppNotification::forUser($userId)
            ->whereNotNull('read_at')
            ->delete();

        return response()->json(['message' => "{$deleted} notificacion(es) eliminadas."]);
    }
}
