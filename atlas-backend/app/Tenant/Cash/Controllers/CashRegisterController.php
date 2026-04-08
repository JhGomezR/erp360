<?php

namespace App\Tenant\Cash\Controllers;

use App\Events\CashRegisterUpdated;
use App\Tenant\Cash\Models\CashMovement;
use App\Tenant\Cash\Models\CashRegister;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CashRegisterController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = CashRegister::query()->orderByDesc('opened_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date')) {
            $query->whereDate('opened_at', $request->date);
        }

        if ($request->filled('from')) {
            $query->whereDate('opened_at', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('opened_at', '<=', $request->to);
        }

        $registers = $query->paginate(20);

        $openRegisters = CashRegister::where('status', 'open')->get();
        $totalOpenCash = $openRegisters->sum(function ($reg) {
            return $reg->opening_amount + $reg->total_in - $reg->total_out;
        });

        return response()->json([
            'data'     => $registers,
            'summary'  => [
                'total_open_registers' => $openRegisters->count(),
                'total_cash_in_open'   => number_format($totalOpenCash, 2, '.', ''),
            ],
        ]);
    }

    public function current(): JsonResponse
    {
        $register = CashRegister::where('status', 'open')
            ->with('movements')
            ->orderByDesc('opened_at')
            ->first();

        if (! $register) {
            return response()->json(['message' => 'No hay caja abierta actualmente.'], 404);
        }

        $totalIn  = $register->movements->where('type', 'in')->sum('amount');
        $totalOut = $register->movements->where('type', 'out')->sum('amount');

        return response()->json([
            'cash_register'   => $register,
            'summary' => [
                'total_in'        => number_format($totalIn, 2, '.', ''),
                'total_out'       => number_format($totalOut, 2, '.', ''),
                'current_balance' => number_format($register->opening_amount + $totalIn - $totalOut, 2, '.', ''),
            ],
        ]);
    }

    public function open(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'           => ['required', 'string', 'max:255'],
            'opening_amount' => ['required', 'numeric', 'min:0'],
            'warehouse_id'   => ['nullable', 'integer'],
            'notes'          => ['nullable', 'string'],
        ]);

        // Validar que la ubicacion sea de tipo tienda
        if (! empty($data['warehouse_id'])) {
            $warehouse = \Illuminate\Support\Facades\DB::table('warehouses')
                ->where('id', $data['warehouse_id'])
                ->where('is_active', true)
                ->first();

            if (! $warehouse) {
                return response()->json(['message' => 'Ubicacion no encontrada o inactiva.'], 422);
            }

            if ($warehouse->type !== 'store') {
                return response()->json([
                    'message' => "La ubicacion '{$warehouse->name}' es de tipo bodega. Solo se puede vincular una caja a una tienda (type=store).",
                ], 422);
            }
        }

        // Un usuario solo puede tener una caja abierta a la vez
        $existing = CashRegister::where('status', 'open')
            ->where('opened_by', auth('tenant')->id())
            ->first();

        if ($existing) {
            return response()->json([
                'message' => "Ya tienes una caja abierta: '{$existing->name}'. Cierrala antes de abrir una nueva.",
            ], 422);
        }

        // Si no se especifica tienda, buscar la tienda por defecto
        $warehouseId = $data['warehouse_id'] ?? null;
        if (! $warehouseId) {
            $defaultStore = \Illuminate\Support\Facades\DB::table('warehouses')
                ->where('type', 'store')
                ->where('is_default', true)
                ->where('is_active', true)
                ->value('id');
            $warehouseId = $defaultStore;
        }

        $register = CashRegister::create([
            'name'           => $data['name'],
            'warehouse_id'   => $warehouseId,
            'opening_amount' => $data['opening_amount'],
            'status'         => 'open',
            'opened_at'      => now(),
            'opened_by'      => auth('tenant')->id(),
            'notes'          => $data['notes'] ?? null,
        ]);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new CashRegisterUpdated($schema, 'opened', [
            'cash_register_id' => $register->id,
            'name'             => $register->name,
            'opening_amount'   => $register->opening_amount,
        ]));

        return response()->json($register, 201);
    }

    public function close(Request $request, string $id): JsonResponse
    {
        $register = CashRegister::findOrFail($id);

        if ($register->status === 'closed') {
            return response()->json(['message' => 'Esta caja ya está cerrada.'], 422);
        }

        $data = $request->validate([
            'closing_amount' => ['required', 'numeric', 'min:0'],
            'notes'          => ['nullable', 'string'],
        ]);

        $totalIn  = $register->movements()->where('type', 'in')->sum('amount');
        $totalOut = $register->movements()->where('type', 'out')->sum('amount');

        $expectedAmount = $register->opening_amount + $totalIn - $totalOut;
        $difference     = $data['closing_amount'] - $expectedAmount;

        $register->update([
            'closing_amount'  => $data['closing_amount'],
            'expected_amount' => $expectedAmount,
            'difference'      => $difference,
            'status'          => 'closed',
            'closed_at'       => now(),
            'closed_by'       => auth('tenant')->id(),
            'notes'           => $data['notes'] ?? $register->notes,
        ]);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new CashRegisterUpdated($schema, 'closed', [
            'cash_register_id' => $register->id,
            'closing_amount'   => $data['closing_amount'],
            'expected_amount'  => $expectedAmount,
            'difference'       => $difference,
        ]));

        return response()->json($register->fresh());
    }

    public function addMovement(Request $request, string $id): JsonResponse
    {
        $register = CashRegister::findOrFail($id);

        if ($register->status !== 'open') {
            return response()->json(['message' => 'Solo se pueden agregar movimientos a una caja abierta.'], 422);
        }

        $data = $request->validate([
            // withdrawal: recogida de dinero (supervisor retira efectivo de la caja)
            'type'    => ['required', 'in:in,out,withdrawal'],
            'concept' => ['required', 'string', 'max:255'],
            'amount'  => ['required', 'numeric', 'min:0.01'],
            'notes'   => ['nullable', 'string'],
        ]);

        // withdrawal cuenta como 'out' para el balance; se guarda tipo propio para reporting
        $balanceType = $data['type'] === 'withdrawal' ? 'out' : $data['type'];

        $movement = CashMovement::create([
            'cash_register_id' => $register->id,
            'type'             => $balanceType,
            'concept'          => $data['concept'],
            'amount'           => $data['amount'],
            'reference_type'   => $data['type'] === 'withdrawal' ? 'withdrawal' : 'manual',
            'user_id'          => auth('tenant')->id(),
            'notes'            => $data['notes'] ?? null,
        ]);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new CashRegisterUpdated($schema, 'movement', [
            'cash_register_id' => $register->id,
            'movement_type'    => $data['type'],
            'amount'           => $data['amount'],
            'concept'          => $data['concept'],
        ]));

        return response()->json($movement, 201);
    }

    public function show(string $id): JsonResponse
    {
        $register = CashRegister::with('movements')->findOrFail($id);

        $totalIn  = $register->movements->where('type', 'in')->sum('amount');
        $totalOut = $register->movements->where('type', 'out')->sum('amount');

        return response()->json([
            'cash_register' => $register,
            'summary'       => [
                'total_in'        => number_format($totalIn, 2, '.', ''),
                'total_out'       => number_format($totalOut, 2, '.', ''),
                'current_balance' => number_format($register->opening_amount + $totalIn - $totalOut, 2, '.', ''),
            ],
        ]);
    }
}
