<?php

namespace App\Tenant\HRM\Controllers;

use App\Tenant\HRM\Models\Employee;
use App\Tenant\HRM\Models\Contract;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class EmployeeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Employee::with('activeContract')
            ->when($request->filled('status'),     fn($q) => $q->where('status', $request->status))
            ->when($request->filled('department'), fn($q) => $q->where('department', $request->department))
            ->when($request->filled('search'),     fn($q) => $q->where(function ($q) use ($request) {
                $q->where('first_name', 'ilike', "%{$request->search}%")
                  ->orWhere('last_name', 'ilike', "%{$request->search}%")
                  ->orWhere('document_number', 'ilike', "%{$request->search}%");
            }))
            ->orderBy('last_name');

        return response()->json($query->paginate(25));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name'      => ['required', 'string'],
            'last_name'       => ['required', 'string'],
            'document_type'   => ['required', 'in:CC,CE,PA,NIT'],
            'document_number' => ['required', 'string', 'unique:employees,document_number'],
            'email'           => ['nullable', 'email'],
            'phone'           => ['nullable', 'string'],
            'address'         => ['nullable', 'string'],
            'city'            => ['nullable', 'string'],
            'birth_date'      => ['nullable', 'date'],
            'gender'          => ['nullable', 'in:M,F,O'],
            'position'        => ['required', 'string'],
            'department'      => ['nullable', 'string'],
            'hire_date'       => ['required', 'date'],
            'eps'             => ['nullable', 'string'],
            'afp'             => ['nullable', 'string'],
            'arl'             => ['nullable', 'string'],
            'caja_compensacion' => ['nullable', 'string'],
            'bank_name'       => ['nullable', 'string'],
            'bank_account'    => ['nullable', 'string'],
            'bank_account_type' => ['nullable', 'in:savings,checking'],
            // Contrato inicial (opcional en el mismo request)
            'contract'        => ['nullable', 'array'],
            'contract.type'   => ['required_with:contract', 'in:indefinite,fixed_term,project,apprentice'],
            'contract.base_salary'   => ['required_with:contract', 'numeric', 'min:0'],
            'contract.salary_type'   => ['sometimes', 'in:monthly,daily,hourly'],
            'contract.work_schedule' => ['sometimes', 'in:full_time,part_time,remote'],
            'contract.start_date'    => ['required_with:contract', 'date'],
            'contract.end_date'      => ['nullable', 'date', 'after:contract.start_date'],
        ]);

        $employee = Employee::create(array_merge(
            collect($data)->except('contract')->toArray(),
            ['created_by' => auth('tenant')->id()]
        ));

        if (! empty($data['contract'])) {
            $employee->contracts()->create($data['contract']);
        }

        return response()->json($employee->load('activeContract', 'contracts'), 201);
    }

    public function show(string $id): JsonResponse
    {
        $employee = Employee::with(['activeContract', 'contracts', 'vacationRequests' => fn($q) => $q->latest()->limit(10)])
            ->findOrFail($id);

        return response()->json(array_merge($employee->toArray(), [
            'vacation_days_earned' => $employee->vacation_days_earned,
            'vacation_days_used'   => $employee->vacation_days_used,
            'vacation_days_available' => $employee->vacation_days_earned - $employee->vacation_days_used,
        ]));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $employee = Employee::findOrFail($id);

        $data = $request->validate([
            'first_name'      => ['sometimes', 'string'],
            'last_name'       => ['sometimes', 'string'],
            'email'           => ['nullable', 'email'],
            'phone'           => ['nullable', 'string'],
            'address'         => ['nullable', 'string'],
            'city'            => ['nullable', 'string'],
            'position'        => ['sometimes', 'string'],
            'department'      => ['nullable', 'string'],
            'status'          => ['sometimes', 'in:active,inactive,on_leave'],
            'eps'             => ['nullable', 'string'],
            'afp'             => ['nullable', 'string'],
            'bank_name'       => ['nullable', 'string'],
            'bank_account'    => ['nullable', 'string'],
            'bank_account_type' => ['nullable', 'in:savings,checking'],
        ]);

        $employee->update($data);
        return response()->json($employee->fresh('activeContract'));
    }

    public function destroy(string $id): JsonResponse
    {
        $employee = Employee::findOrFail($id);

        if ($employee->status === 'active') {
            return response()->json(['message' => 'Debe desactivar el empleado antes de eliminarlo.'], 422);
        }

        $employee->delete();
        return response()->json(['message' => "Empleado {$employee->employee_number} eliminado."]);
    }

    /** Agregar o actualizar contrato. */
    public function addContract(Request $request, string $id): JsonResponse
    {
        $employee = Employee::findOrFail($id);

        $data = $request->validate([
            'type'          => ['required', 'in:indefinite,fixed_term,project,apprentice'],
            'base_salary'   => ['required', 'numeric', 'min:0'],
            'salary_type'   => ['in:monthly,daily,hourly'],
            'work_schedule' => ['in:full_time,part_time,remote'],
            'hours_per_week'=> ['integer', 'min:1', 'max:60'],
            'start_date'    => ['required', 'date'],
            'end_date'      => ['nullable', 'date', 'after:start_date'],
            'notes'         => ['nullable', 'string'],
        ]);

        // Terminar contrato activo anterior
        $employee->contracts()->where('status', 'active')->update(['status' => 'terminated']);

        $contract = $employee->contracts()->create(array_merge($data, ['status' => 'active']));

        return response()->json($contract, 201);
    }

    /** Lista de departamentos únicos. */
    public function departments(): JsonResponse
    {
        $depts = Employee::whereNotNull('department')
            ->distinct()
            ->pluck('department')
            ->sort()
            ->values();

        return response()->json($depts);
    }
}
