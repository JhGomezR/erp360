<?php

namespace App\Central\Backups\Controllers;

use App\Central\Backups\Models\DatabaseBackup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class BackupController
{
    /** Lista todos los backups */
    public function index(): JsonResponse
    {
        $backups = DatabaseBackup::orderByDesc('id')->paginate(20);
        return response()->json($backups);
    }

    /** Dispara un backup manual en background */
    public function store(): JsonResponse
    {
        Artisan::queue('atlas:backup-database', ['--manual' => true]);

        return response()->json([
            'message' => 'Backup iniciado. Aparecerá en la lista cuando termine.',
        ], 202);
    }

    /** Descarga el archivo de un backup */
    public function download(int $id): mixed
    {
        $backup = DatabaseBackup::findOrFail($id);

        if ($backup->status !== 'completed') {
            return response()->json(['error' => 'El backup no está disponible.'], 422);
        }

        $filepath = storage_path('app/' . $backup->path);

        if (!file_exists($filepath)) {
            return response()->json(['error' => 'Archivo no encontrado en disco.'], 404);
        }

        return response()->download($filepath, $backup->filename);
    }

    /** Elimina un backup (registro + archivo) */
    public function destroy(int $id): JsonResponse
    {
        $backup   = DatabaseBackup::findOrFail($id);
        $filepath = storage_path('app/' . $backup->path);

        if (file_exists($filepath)) {
            unlink($filepath);
        }

        $backup->delete();

        return response()->json(['message' => 'Backup eliminado.']);
    }
}
