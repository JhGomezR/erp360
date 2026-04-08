<?php

namespace App\Tenant\HRM\Controllers;

use App\Shared\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Expediente digital del empleado.
 *
 * GET    /hrm/employees/{employeeId}/documents              → index (carpeta)
 * POST   /hrm/employees/{employeeId}/documents              → upload (multipart o base64)
 * GET    /hrm/employees/{employeeId}/documents/{id}         → show
 * PUT    /hrm/employees/{employeeId}/documents/{id}         → update metadata
 * DELETE /hrm/employees/{employeeId}/documents/{id}         → archive
 * GET    /hrm/documents/expiring                            → próximos a vencer (global)
 */
class EmployeeDocumentController extends Controller
{
    public function index(string $employeeId): JsonResponse
    {
        $docs = DB::table('employee_documents')
            ->where('employee_id', $employeeId)
            ->whereIn('status', ['active', 'expired'])
            ->orderBy('category')
            ->orderByDesc('version')
            ->get()
            ->map(fn($d) => array_merge((array) $d, ['file_data' => null])); // no enviamos el blob en el listado

        return response()->json(['data' => $docs]);
    }

    public function store(Request $request, string $employeeId): JsonResponse
    {
        $request->validate([
            'category'    => ['required', 'in:contract,id_document,diploma,certificate,medical,disciplinary,social_security,other'],
            'title'       => ['required', 'string', 'max:200'],
            'issue_date'  => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
            'notes'       => ['nullable', 'string'],
        ]);

        $fileData  = null;
        $mimeType  = 'application/pdf';
        $fileName  = null;
        $sizeKb    = 0;

        // Opción A — archivo multipart
        if ($request->hasFile('file')) {
            $file     = $request->file('file');
            $allowed  = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg',
                         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            $mime     = $file->getMimeType();

            if (!in_array($mime, $allowed)) {
                return response()->json(['message' => 'Formato no permitido. Use PDF, JPG, PNG o DOC/DOCX.'], 422);
            }
            if ($file->getSize() > 10 * 1024 * 1024) {
                return response()->json(['message' => 'El archivo no debe superar 10 MB.'], 422);
            }

            $fileData = 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($file->getRealPath()));
            $mimeType = $mime;
            $fileName = $file->getClientOriginalName();
            $sizeKb   = (int) ceil($file->getSize() / 1024);
        }
        // Opción B — base64 en JSON
        elseif ($request->filled('file_data')) {
            $raw = $request->input('file_data');
            if (str_starts_with($raw, 'data:')) {
                [$meta, $b64] = explode(',', $raw, 2);
                if (!base64_decode($b64, true)) {
                    return response()->json(['message' => 'Base64 inválido.'], 422);
                }
                preg_match('/data:([^;]+);base64/', $meta, $m);
                $mimeType = $m[1] ?? 'application/pdf';
                $sizeKb   = (int) ceil(strlen(base64_decode($b64)) / 1024);
                $fileData = $raw;
            } else {
                return response()->json(['message' => 'Se requiere formato data:mime;base64,...'], 422);
            }
            $fileName = $request->input('file_name');
        } else {
            return response()->json(['message' => 'Se requiere un archivo o file_data en base64.'], 422);
        }

        // Versionar: si ya hay un documento activo de la misma categoría y título, lo reemplaza
        $previous = DB::table('employee_documents')
            ->where('employee_id', $employeeId)
            ->where('category', $request->category)
            ->where('title', $request->title)
            ->where('status', 'active')
            ->orderByDesc('version')
            ->first();

        $version = 1;
        if ($previous) {
            DB::table('employee_documents')->where('id', $previous->id)
                ->update(['status' => 'replaced', 'updated_at' => now()]);
            $version = $previous->version + 1;
        }

        $id = DB::table('employee_documents')->insertGetId([
            'employee_id'          => $employeeId,
            'category'             => $request->category,
            'title'                => $request->title,
            'file_data'            => $fileData,
            'mime_type'            => $mimeType,
            'file_size_kb'         => $sizeKb,
            'file_name'            => $fileName,
            'version'              => $version,
            'previous_version_id'  => $previous?->id,
            'issue_date'           => $request->issue_date,
            'expiry_date'          => $request->expiry_date,
            'status'               => 'active',
            'notes'                => $request->notes,
            'uploaded_by'          => auth('tenant')->id(),
            'created_at'           => now(),
            'updated_at'           => now(),
        ]);

        AuditService::log('employee.document.uploaded', 'info', 'hrm',
            "Documento '{$request->title}' v{$version} cargado para empleado #{$employeeId}",
            null, ['hrm', 'documents']
        );

        $doc = DB::table('employee_documents')->find($id);
        return response()->json(array_merge((array) $doc, ['file_data' => null]), 201);
    }

    public function show(string $employeeId, string $id): JsonResponse
    {
        $doc = DB::table('employee_documents')
            ->where('employee_id', $employeeId)
            ->where('id', $id)
            ->first();

        if (!$doc) return response()->json(['message' => 'Documento no encontrado.'], 404);

        return response()->json($doc); // incluye file_data para descarga
    }

    public function update(Request $request, string $employeeId, string $id): JsonResponse
    {
        $data = $request->validate([
            'title'       => ['nullable', 'string', 'max:200'],
            'expiry_date' => ['nullable', 'date'],
            'issue_date'  => ['nullable', 'date'],
            'notes'       => ['nullable', 'string'],
            'status'      => ['nullable', 'in:active,archived'],
        ]);

        DB::table('employee_documents')
            ->where('employee_id', $employeeId)
            ->where('id', $id)
            ->update(array_filter($data, fn($v) => $v !== null) + ['updated_at' => now()]);

        return response()->json(array_merge((array) DB::table('employee_documents')->find($id), ['file_data' => null]));
    }

    public function destroy(string $employeeId, string $id): JsonResponse
    {
        DB::table('employee_documents')
            ->where('employee_id', $employeeId)
            ->where('id', $id)
            ->update(['status' => 'archived', 'updated_at' => now()]);

        return response()->json(null, 204);
    }

    public function expiring(Request $request): JsonResponse
    {
        $days = (int) ($request->query('days', 30));
        $until = now()->addDays($days)->toDateString();

        $docs = DB::table('employee_documents as d')
            ->join('employees as e', 'e.id', '=', 'd.employee_id')
            ->where('d.status', 'active')
            ->whereNotNull('d.expiry_date')
            ->where('d.expiry_date', '<=', $until)
            ->select('d.id', 'd.employee_id', 'd.category', 'd.title', 'd.expiry_date', 'd.version',
                     'e.first_name', 'e.last_name')
            ->orderBy('d.expiry_date')
            ->get();

        return response()->json(['data' => $docs]);
    }
}
