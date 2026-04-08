<?php

namespace App\Tenant\Ecommerce\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de carritos abandonados en la tienda e-commerce.
 *
 * GET  /store/abandoned-carts              → listar (paginado, filtros)
 * GET  /store/abandoned-carts/stats        → métricas de abandono
 * GET  /store/abandoned-carts/{id}         → detalle
 * POST /store/abandoned-carts/{id}/remind  → marcar recordatorio enviado
 * POST /store/abandoned-carts/{id}/lost    → marcar como perdido
 * POST /store/abandoned-carts/track        → API pública: guardar/actualizar carrito
 * POST /store/abandoned-carts/{id}/recover → vincular con pedido recuperado
 */
class AbandonedCartController extends Controller
{
    // ─── Admin endpoints ─────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $carts = DB::table('ecommerce_abandoned_carts')
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('from'),   fn($q) => $q->where('created_at', '>=', $request->from))
            ->when($request->filled('to'),     fn($q) => $q->where('created_at', '<=', $request->to . ' 23:59:59'))
            ->when($request->filled('email'),  fn($q) => $q->where('customer_email', 'ilike', '%' . $request->email . '%'))
            ->orderByDesc('created_at')
            ->paginate(25);

        return response()->json($carts);
    }

    public function stats(): JsonResponse
    {
        $total     = DB::table('ecommerce_abandoned_carts')->count();
        $abandoned = DB::table('ecommerce_abandoned_carts')->where('status', 'abandoned')->count();
        $recovered = DB::table('ecommerce_abandoned_carts')->where('status', 'recovered')->count();
        $revenue   = DB::table('ecommerce_abandoned_carts')
                       ->where('status', 'recovered')
                       ->sum('total');

        $potentialRevenue = DB::table('ecommerce_abandoned_carts')
                              ->whereIn('status', ['abandoned', 'reminder_sent'])
                              ->sum('total');

        $recoveryRate = $total > 0 ? round($recovered / $total * 100, 1) : 0;

        // By day (last 30 days)
        $byDay = DB::table('ecommerce_abandoned_carts')
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw("DATE(created_at) as date, COUNT(*) as count, SUM(total) as value")
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json(compact('total', 'abandoned', 'recovered', 'revenue', 'potentialRevenue', 'recoveryRate', 'byDay'));
    }

    public function show(string $id): JsonResponse
    {
        $cart = DB::table('ecommerce_abandoned_carts')->find($id);
        if (!$cart) {
            return response()->json(['message' => 'No encontrado.'], 404);
        }
        return response()->json($cart);
    }

    public function sendReminder(string $id): JsonResponse
    {
        $cart = DB::table('ecommerce_abandoned_carts')->find($id);
        if (!$cart) {
            return response()->json(['message' => 'No encontrado.'], 404);
        }

        DB::table('ecommerce_abandoned_carts')->where('id', $id)->update([
            'status'           => 'reminder_sent',
            'reminders_sent'   => DB::raw('reminders_sent + 1'),
            'last_reminder_at' => now(),
            'updated_at'       => now(),
        ]);

        // Aquí se podría disparar un Job de correo si existe la infraestructura
        // Mail::to($cart->customer_email)->queue(new AbandonedCartReminderMail($cart));

        AuditService::log(
            action: 'ecommerce.abandoned_cart.reminder', level: 'info', module: 'ecommerce',
            description: "Recordatorio enviado para carrito #{$id} ({$cart->customer_email})",
            subject: null, tags: ['ecommerce', 'abandoned-cart'],
        );

        return response()->json(DB::table('ecommerce_abandoned_carts')->find($id));
    }

    public function markLost(string $id): JsonResponse
    {
        DB::table('ecommerce_abandoned_carts')->where('id', $id)->update([
            'status'     => 'lost',
            'updated_at' => now(),
        ]);
        return response()->json(DB::table('ecommerce_abandoned_carts')->find($id));
    }

    public function recover(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'order_id' => ['required', 'integer'],
        ]);

        DB::table('ecommerce_abandoned_carts')->where('id', $id)->update([
            'status'               => 'recovered',
            'recovered_at'         => now(),
            'recovered_order_id'   => $data['order_id'],
            'updated_at'           => now(),
        ]);

        return response()->json(DB::table('ecommerce_abandoned_carts')->find($id));
    }

    // ─── Public API: tienda registra/actualiza carrito ───────────────────────

    /**
     * Llamado desde el frontend de la tienda cuando el cliente actualiza el carrito.
     * Si session_id ya existe → actualiza. Si no → crea.
     */
    public function track(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session_id'     => ['required', 'string', 'max:100'],
            'customer_email' => ['nullable', 'email', 'max:200'],
            'customer_name'  => ['nullable', 'string', 'max:150'],
            'customer_id'    => ['nullable', 'integer'],
            'items'          => ['required', 'array'],
            'total'          => ['required', 'numeric', 'min:0'],
            'utm_source'     => ['nullable', 'string'],
            'utm_medium'     => ['nullable', 'string'],
            'utm_campaign'   => ['nullable', 'string'],
        ]);

        $existing = DB::table('ecommerce_abandoned_carts')
            ->where('session_id', $data['session_id'])
            ->whereIn('status', ['abandoned', 'reminder_sent'])
            ->first();

        $payload = [
            'customer_email' => $data['customer_email'] ?? null,
            'customer_name'  => $data['customer_name'] ?? null,
            'customer_id'    => $data['customer_id'] ?? null,
            'cart_items'     => json_encode($data['items']),
            'total'          => $data['total'],
            'items_count'    => count($data['items']),
            'updated_at'     => now(),
        ];

        if ($existing) {
            DB::table('ecommerce_abandoned_carts')->where('id', $existing->id)->update($payload);
            return response()->json(['id' => $existing->id]);
        }

        $id = DB::table('ecommerce_abandoned_carts')->insertGetId(array_merge($payload, [
            'session_id'   => $data['session_id'],
            'status'       => 'abandoned',
            'utm_source'   => $data['utm_source'] ?? null,
            'utm_medium'   => $data['utm_medium'] ?? null,
            'utm_campaign' => $data['utm_campaign'] ?? null,
            'ip_address'   => $request->ip(),
            'user_agent'   => substr((string) $request->userAgent(), 0, 500),
            'created_at'   => now(),
        ]));

        return response()->json(['id' => $id], 201);
    }
}
