<?php

namespace App\Tenant\FixedAssets\Controllers;

use App\Tenant\FixedAssets\Models\AssetDisposal;
use App\Tenant\FixedAssets\Models\FixedAsset;
use App\Tenant\FixedAssets\Services\DepreciationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class FixedAssetController extends Controller
{
    public function __construct(private readonly DepreciationService $depreciation) {}

    public function index(Request $request): JsonResponse
    {
        $query = FixedAsset::query()
            ->when($request->filled('status'),   fn($q) => $q->where('status',   $request->status))
            ->when($request->filled('category'), fn($q) => $q->where('category', $request->category))
            ->when($request->filled('search'),   fn($q) => $q->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                  ->orWhere('asset_code', 'like', "%{$request->search}%");
            }))
            ->orderByDesc('acquisition_date');

        return response()->json($query->paginate(25));
    }

    public function show(string $id): JsonResponse
    {
        $asset = FixedAsset::with(['depreciations' => fn($q) => $q->orderByDesc('year')->orderByDesc('month')->limit(12),
                                   'disposals'])->findOrFail($id);
        return response()->json($asset);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                => ['required', 'string', 'max:255'],
            'category'            => ['required', 'string'],
            'acquisition_date'    => ['required', 'date'],
            'acquisition_cost'    => ['required', 'numeric', 'min:0'],
            'residual_value'      => ['nullable', 'numeric', 'min:0'],
            'useful_life_years'   => ['required', 'integer', 'min:1', 'max:100'],
            'depreciation_method' => ['nullable', 'in:straight_line,declining_balance'],
            'description'         => ['nullable', 'string'],
            'location'            => ['nullable', 'string'],
            'serial_number'       => ['nullable', 'string'],
            'supplier'            => ['nullable', 'string'],
            'responsible_employee_id' => ['nullable', 'integer'],
            'notes'               => ['nullable', 'string'],
        ]);

        $data['book_value']  = $data['acquisition_cost'];
        $data['created_by']  = $request->user()?->id;
        $asset = FixedAsset::create($data);

        return response()->json($asset, 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $asset = FixedAsset::findOrFail($id);

        $data = $request->validate([
            'name'                => ['sometimes', 'string', 'max:255'],
            'category'            => ['sometimes', 'string'],
            'description'         => ['nullable', 'string'],
            'location'            => ['nullable', 'string'],
            'serial_number'       => ['nullable', 'string'],
            'supplier'            => ['nullable', 'string'],
            'responsible_employee_id' => ['nullable', 'integer'],
            'notes'               => ['nullable', 'string'],
            'status'              => ['sometimes', 'in:active,inactive,fully_depreciated'],
        ]);

        $asset->update($data);
        return response()->json($asset);
    }

    public function destroy(string $id): JsonResponse
    {
        $asset = FixedAsset::findOrFail($id);
        if ($asset->depreciations()->exists()) {
            return response()->json(['message' => 'No se puede eliminar un activo con depreciaciones registradas.'], 422);
        }
        $asset->delete();
        return response()->json(['message' => 'Activo eliminado.']);
    }

    /** POST /fixed-assets/depreciate — Run monthly depreciation */
    public function runDepreciation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'year'  => ['required', 'integer', 'min:2000', 'max:2100'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
        ]);

        $result = $this->depreciation->runPeriod($data['year'], $data['month'], $request->user()?->id ?? 0);
        return response()->json($result);
    }

    /** GET /fixed-assets/{id}/schedule — Preview depreciation schedule */
    public function schedule(string $id): JsonResponse
    {
        $asset    = FixedAsset::findOrFail($id);
        $schedule = $this->depreciation->previewSchedule($asset);
        return response()->json(['asset' => $asset, 'schedule' => $schedule]);
    }

    /** POST /fixed-assets/{id}/dispose — Retire an asset */
    public function dispose(Request $request, string $id): JsonResponse
    {
        $asset = FixedAsset::findOrFail($id);
        if ($asset->status === 'disposed') {
            return response()->json(['message' => 'Este activo ya fue dado de baja.'], 422);
        }

        $data = $request->validate([
            'disposal_date' => ['required', 'date'],
            'reason'        => ['required', 'in:sale,scrap,donation,loss,other'],
            'sale_amount'   => ['nullable', 'numeric', 'min:0'],
            'notes'         => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($asset, $data, $request) {
            AssetDisposal::create([
                'asset_id'               => $asset->id,
                'disposal_date'          => $data['disposal_date'],
                'reason'                 => $data['reason'],
                'sale_amount'            => $data['sale_amount'] ?? 0,
                'book_value_at_disposal' => $asset->book_value,
                'notes'                  => $data['notes'] ?? null,
                'created_by'             => $request->user()?->id,
            ]);

            $asset->update(['status' => 'disposed']);
        });

        return response()->json(['message' => 'Activo dado de baja correctamente.']);
    }

    /** GET /fixed-assets/summary — KPIs card */
    public function summary(): JsonResponse
    {
        $totals = FixedAsset::selectRaw('
            COUNT(*) as total_assets,
            SUM(acquisition_cost) as total_cost,
            SUM(accumulated_depreciation) as total_depreciation,
            SUM(book_value) as total_book_value
        ')->whereIn('status', ['active', 'fully_depreciated'])->first();

        $byCategory = FixedAsset::selectRaw('category, COUNT(*) as count, SUM(book_value) as book_value')
            ->whereIn('status', ['active', 'fully_depreciated'])
            ->groupBy('category')
            ->get();

        return response()->json(['totals' => $totals, 'by_category' => $byCategory]);
    }
}
