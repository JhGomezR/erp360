<?php

namespace App\Tenant\Customers\Controllers;

use App\Events\CustomerUpdated;
use App\Tenant\Customers\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Customer::query();

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->whereRaw('name ILIKE ?', ["%{$search}%"])
                  ->orWhereRaw('email ILIKE ?', ["%{$search}%"])
                  ->orWhereRaw('document ILIKE ?', ["%{$search}%"]);
            });
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        $customers = $query->orderBy('name')->paginate(20);

        return response()->json($customers);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:255'],
            'email'         => ['nullable', 'email', 'unique:customers,email'],
            'document'      => ['nullable', 'string', 'max:50'],
            'document_type' => ['nullable', 'in:cc,nit,passport,foreigner'],
            'phone'         => ['nullable', 'string', 'max:30'],
            'address'       => ['nullable', 'string'],
            'city'          => ['nullable', 'string', 'max:100'],
            'birth_date'    => ['nullable', 'date'],
            'notes'         => ['nullable', 'string'],
            'is_active'     => ['nullable', 'boolean'],
        ]);

        $customer = Customer::create($data);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new CustomerUpdated($schema, 'created', [
            'customer_id' => $customer->id,
            'name'        => $customer->name,
        ]));

        return response()->json($customer, 201);
    }

    public function show(string $id): JsonResponse
    {
        $customer = Customer::withCount('sales')
            ->withSum('sales', 'total')
            ->findOrFail($id);

        return response()->json($customer);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        $data = $request->validate([
            'name'          => ['sometimes', 'required', 'string', 'max:255'],
            'email'         => ['sometimes', 'nullable', 'email', "unique:customers,email,{$id}"],
            'document'      => ['sometimes', 'nullable', 'string', 'max:50'],
            'document_type' => ['sometimes', 'nullable', 'in:cc,nit,passport,foreigner'],
            'phone'         => ['sometimes', 'nullable', 'string', 'max:30'],
            'address'       => ['sometimes', 'nullable', 'string'],
            'city'          => ['sometimes', 'nullable', 'string', 'max:100'],
            'birth_date'    => ['sometimes', 'nullable', 'date'],
            'notes'         => ['sometimes', 'nullable', 'string'],
            'is_active'     => ['sometimes', 'boolean'],
        ]);

        $customer->update($data);

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new CustomerUpdated($schema, 'updated', [
            'customer_id' => $customer->id,
            'name'        => $customer->name,
        ]));

        return response()->json($customer);
    }

    public function destroy(string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        // Prevent deletion if has active/recent sales (within 30 days)
        $recentSales = $customer->sales()
            ->where('created_at', '>=', now()->subDays(30))
            ->count();

        if ($recentSales > 0) {
            return response()->json([
                'message' => 'No se puede eliminar el cliente porque tiene ventas recientes (últimos 30 días).',
            ], 422);
        }

        $customer->delete();

        return response()->json(['message' => 'Cliente eliminado correctamente.']);
    }

    public function purchaseHistory(Request $request, string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        $sales = $customer->sales()
            ->with('items')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($sales);
    }

    public function addPoints(Request $request, string $id): JsonResponse
    {
        $customer = Customer::findOrFail($id);

        $data = $request->validate([
            'points' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $customer->increment('loyalty_points', $data['points']);
        $customer->refresh();

        $schema = DB::selectOne('SELECT current_schema() AS s')?->s ?? 'public';
        broadcast(new CustomerUpdated($schema, 'points_added', [
            'customer_id'    => $customer->id,
            'points_added'   => $data['points'],
            'loyalty_points' => $customer->loyalty_points,
        ]));

        return response()->json([
            'message'        => "Se agregaron {$data['points']} puntos al cliente.",
            'loyalty_points' => $customer->loyalty_points,
            'reason'         => $data['reason'],
        ]);
    }
}
