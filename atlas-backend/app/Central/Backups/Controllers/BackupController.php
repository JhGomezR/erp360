<?php

namespace App\Central\Backups\Controllers;

use App\Central\Backups\Models\DatabaseBackup;
use App\Central\Tenants\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class BackupController
{
    // ── Backups completos (toda la BD) ────────────────────────────────────────

    /** Lista backups. ?type=full|tenant  ?tenant_id=xxx */
    public function index(Request $request): JsonResponse
    {
        $query = DatabaseBackup::with('tenant:id,slug,name')
            ->orderByDesc('id');

        if ($request->filled('type')) {
            $query->where('backup_type', $request->type);
        }

        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->tenant_id);
        }

        $backups = $query->paginate(20)->through(function (DatabaseBackup $b) {
            return [
                'id'           => $b->id,
                'backup_type'  => $b->backup_type,
                'tenant'       => $b->tenant ? ['id' => $b->tenant->id, 'slug' => $b->tenant->slug, 'name' => $b->tenant->name] : null,
                'filename'     => $b->filename,
                'size_bytes'   => $b->size_bytes,
                'size_human'   => $b->size_human,
                'status'       => $b->status,
                'is_manual'    => $b->is_manual,
                'notes'        => $b->notes,
                'completed_at' => $b->completed_at?->toIso8601String(),
                'created_at'   => $b->created_at->toIso8601String(),
            ];
        });

        return response()->json($backups);
    }

    /** Dispara un backup completo de toda la BD en background. */
    public function store(): JsonResponse
    {
        Artisan::queue('atlas:backup-database', ['--manual' => true]);

        return response()->json([
            'message' => 'Backup completo iniciado. Aparecerá en la lista cuando termine.',
        ], 202);
    }

    // ── Backups por tenant ────────────────────────────────────────────────────

    /** Dispara un backup del schema de un tenant específico. */
    public function storeTenant(string $slug): JsonResponse
    {
        $tenant = Tenant::where('slug', $slug)->first();

        if (! $tenant) {
            return response()->json(['error' => "Tenant '{$slug}' no encontrado."], 404);
        }

        Artisan::queue('atlas:backup-tenant', [
            'slug'     => $slug,
            '--manual' => true,
        ]);

        return response()->json([
            'message' => "Backup del tenant '{$tenant->name}' iniciado. Aparecerá en la lista cuando termine.",
            'tenant'  => ['id' => $tenant->id, 'slug' => $tenant->slug, 'name' => $tenant->name],
        ], 202);
    }

    /** Lista los backups de un tenant específico. */
    public function indexTenant(string $slug): JsonResponse
    {
        $tenant = Tenant::where('slug', $slug)->first();

        if (! $tenant) {
            return response()->json(['error' => "Tenant '{$slug}' no encontrado."], 404);
        }

        $backups = DatabaseBackup::forTenant($tenant->id)
            ->orderByDesc('id')
            ->paginate(20)
            ->through(fn (DatabaseBackup $b) => [
                'id'           => $b->id,
                'filename'     => $b->filename,
                'size_bytes'   => $b->size_bytes,
                'size_human'   => $b->size_human,
                'status'       => $b->status,
                'is_manual'    => $b->is_manual,
                'completed_at' => $b->completed_at?->toIso8601String(),
                'created_at'   => $b->created_at->toIso8601String(),
            ]);

        return response()->json([
            'tenant'  => ['id' => $tenant->id, 'slug' => $tenant->slug, 'name' => $tenant->name],
            'backups' => $backups,
        ]);
    }

    // ── Operaciones sobre un backup individual ────────────────────────────────

    /** Descarga el archivo de un backup. */
    public function download(int $id): mixed
    {
        $backup = DatabaseBackup::findOrFail($id);

        if ($backup->status !== 'completed') {
            return response()->json(['error' => 'El backup no está disponible todavía.'], 422);
        }

        $filepath = storage_path('app/' . $backup->path);

        if (! file_exists($filepath)) {
            return response()->json(['error' => 'Archivo no encontrado en disco.'], 404);
        }

        return response()->download($filepath, $backup->filename);
    }

    /** Elimina un backup: registro de BD + archivo del disco. */
    public function destroy(int $id): JsonResponse
    {
        $backup   = DatabaseBackup::findOrFail($id);
        $filepath = storage_path('app/' . $backup->path);

        if (file_exists($filepath)) {
            unlink($filepath);
        }

        $backup->delete();

        return response()->json(['message' => 'Backup eliminado correctamente.']);
    }
}
