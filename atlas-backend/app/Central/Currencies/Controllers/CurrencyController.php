<?php

namespace App\Central\Currencies\Controllers;

use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CurrencyController extends Controller
{
    use HasCentralAudit;

    public function index(): JsonResponse
    {
        $currencies = DB::table('currencies')
            ->where('is_active', true)
            ->orderBy('code')
            ->get();

        return response()->json($currencies);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code'           => ['required', 'string', 'size:3', 'unique:currencies,code'],
            'name'           => ['required', 'string', 'max:60'],
            'symbol'         => ['required', 'string', 'max:5'],
            'decimal_places' => ['nullable', 'integer', 'min:0', 'max:8'],
            'is_active'      => ['nullable', 'boolean'],
        ]);

        DB::table('currencies')->insert(array_merge($data, [
            'code'           => strtoupper($data['code']),
            'decimal_places' => $data['decimal_places'] ?? 2,
            'is_active'      => $data['is_active'] ?? true,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]));

        $currency = DB::table('currencies')->where('code', strtoupper($data['code']))->first();

        $this->centralAudit(
            action:      'currency.created',
            level:       'success',
            description: "Moneda creada: {$currency->code} — {$currency->name} ({$currency->symbol})",
            module:      'currencies',
            after:       ['code' => $currency->code, 'name' => $currency->name, 'symbol' => $currency->symbol],
        );

        return response()->json($currency, 201);
    }

    public function update(Request $request, string $code): JsonResponse
    {
        $currency = DB::table('currencies')->where('code', strtoupper($code))->first();
        if (! $currency) {
            return response()->json(['message' => 'Moneda no encontrada.'], 404);
        }

        $before = (array) $currency;

        $data = $request->validate([
            'name'           => ['sometimes', 'string', 'max:60'],
            'symbol'         => ['sometimes', 'string', 'max:5'],
            'decimal_places' => ['sometimes', 'integer', 'min:0', 'max:8'],
            'is_active'      => ['sometimes', 'boolean'],
        ]);

        DB::table('currencies')
            ->where('code', strtoupper($code))
            ->update(array_merge($data, ['updated_at' => now()]));

        $updated = DB::table('currencies')->where('code', strtoupper($code))->first();

        $this->centralAudit(
            action:      'currency.updated',
            level:       'warning',
            description: "Moneda actualizada: {$code}",
            module:      'currencies',
            before:      array_intersect_key($before, array_flip(['name', 'symbol', 'decimal_places', 'is_active'])),
            after:       $data,
        );

        return response()->json($updated);
    }

    public function rateIndex(Request $request): JsonResponse
    {
        $query = DB::table('exchange_rates')->orderByDesc('effective_date');

        if ($request->filled('base')) {
            $query->where('base_code', strtoupper($request->base));
        }
        if ($request->filled('date')) {
            $query->whereDate('effective_date', $request->date);
        }

        return response()->json($query->limit(100)->get());
    }

    public function rateStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'base_code'      => ['required', 'string', 'max:3'],
            'target_code'    => ['required', 'string', 'max:3'],
            'rate'           => ['required', 'numeric', 'min:0.0000001'],
            'effective_date' => ['required', 'date'],
            'source'         => ['nullable', 'string', 'max:50'],
        ]);

        DB::table('exchange_rates')->upsert(
            [array_merge($data, [
                'base_code'      => strtoupper($data['base_code']),
                'target_code'    => strtoupper($data['target_code']),
                'source'         => $data['source'] ?? 'manual',
                'created_at'     => now(),
                'updated_at'     => now(),
            ])],
            ['base_code', 'target_code', 'effective_date'],
            ['rate', 'source', 'updated_at'],
        );

        $rate = DB::table('exchange_rates')
            ->where('base_code', strtoupper($data['base_code']))
            ->where('target_code', strtoupper($data['target_code']))
            ->whereDate('effective_date', $data['effective_date'])
            ->first();

        $this->centralAudit(
            action:      'exchange_rate.upserted',
            level:       'info',
            description: "Tasa de cambio actualizada: {$data['base_code']}/{$data['target_code']} = {$data['rate']} ({$data['effective_date']})",
            module:      'currencies',
            after:       ['base' => strtoupper($data['base_code']), 'target' => strtoupper($data['target_code']), 'rate' => $data['rate'], 'date' => $data['effective_date']],
        );

        return response()->json($rate, 201);
    }
}
