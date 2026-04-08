<?php

namespace App\Tenant\Accounting\Controllers;

use App\Tenant\Accounting\Models\AccountingPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de períodos contables.
 *
 * Un período cerrado bloquea la creación/edición de asientos
 * en ese rango de fechas.
 */
class AccountingPeriodController extends Controller
{
    /** GET /accounting/periods */
    public function index(Request $request): JsonResponse
    {
        $periods = AccountingPeriod::orderByDesc('year')
            ->orderByDesc('month')
            ->when($request->filled('year'), fn ($q) => $q->where('year', $request->year))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->paginate(24);

        return response()->json($periods);
    }

    /**
     * Crear un período.
     * POST /accounting/periods
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'year'      => ['required', 'integer', 'min:2000', 'max:2100'],
            'month'     => ['nullable', 'integer', 'min:1', 'max:12'],
            'name'      => ['required', 'string', 'max:50'],
            'date_from' => ['required', 'date'],
            'date_to'   => ['required', 'date', 'after_or_equal:date_from'],
            'notes'     => ['nullable', 'string'],
        ]);

        $period = AccountingPeriod::create($data);

        return response()->json(['message' => 'Período creado.', 'period' => $period], 201);
    }

    /**
     * Generar períodos mensuales de un año completo.
     * POST /accounting/periods/generate-year
     */
    public function generateYear(Request $request): JsonResponse
    {
        $data = $request->validate(['year' => ['required', 'integer', 'min:2000', 'max:2100']]);
        $year = $data['year'];

        $created = DB::transaction(function () use ($year) {
            $periods = [];
            $months  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

            for ($m = 1; $m <= 12; $m++) {
                $from = \Carbon\Carbon::create($year, $m, 1)->startOfMonth();
                $to   = $from->copy()->endOfMonth();

                $periods[] = AccountingPeriod::firstOrCreate(
                    ['year' => $year, 'month' => $m],
                    [
                        'name'      => "{$months[$m-1]} {$year}",
                        'date_from' => $from->toDateString(),
                        'date_to'   => $to->toDateString(),
                        'status'    => 'open',
                    ]
                );
            }
            return $periods;
        });

        return response()->json(['message' => "Períodos de {$year} generados.", 'periods' => $created], 201);
    }

    /**
     * Cerrar un período (bloquea asientos).
     * POST /accounting/periods/{id}/close
     */
    public function close(Request $request, string $id): JsonResponse
    {
        $period = AccountingPeriod::findOrFail($id);

        if ($period->status === 'closed') {
            return response()->json(['message' => 'El período ya está cerrado.'], 422);
        }

        // Verificar que no haya asientos en borrador en ese rango
        $draftCount = DB::table('journal_entries')
            ->where('status', 'draft')
            ->whereBetween('entry_date', [$period->date_from, $period->date_to])
            ->count();

        if ($draftCount > 0) {
            return response()->json([
                'message' => "Hay {$draftCount} asiento(s) en borrador en este período. Publícalos o elimínalos antes de cerrar.",
            ], 422);
        }

        $period->close(auth('tenant')->id(), $request->input('notes'));

        return response()->json(['message' => 'Período cerrado.', 'period' => $period->fresh()]);
    }

    /**
     * Reabrir un período cerrado (solo admin/super).
     * POST /accounting/periods/{id}/reopen
     */
    public function reopen(string $id): JsonResponse
    {
        $period = AccountingPeriod::findOrFail($id);

        if ($period->status === 'open') {
            return response()->json(['message' => 'El período ya está abierto.'], 422);
        }

        $period->reopen(auth('tenant')->id());

        return response()->json(['message' => 'Período reabierto.', 'period' => $period->fresh()]);
    }
}
