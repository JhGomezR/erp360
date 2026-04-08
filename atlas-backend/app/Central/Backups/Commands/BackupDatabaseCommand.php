<?php

namespace App\Central\Backups\Commands;

use App\Central\Backups\Models\DatabaseBackup;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class BackupDatabaseCommand extends Command
{
    protected $signature = 'atlas:backup-database {--manual : Marcar como backup manual}';
    protected $description = 'Crea un backup de PostgreSQL con pg_dump y lo almacena en storage/app/backups/';

    public function handle(): int
    {
        $isManual = (bool) $this->option('manual');
        $filename = 'backup_' . now()->format('Y-m-d_His') . '.sql.gz';
        $dir      = storage_path('app/backups');
        $filepath = $dir . DIRECTORY_SEPARATOR . $filename;

        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $backup = DatabaseBackup::create([
            'filename'  => $filename,
            'path'      => 'backups/' . $filename,
            'status'    => 'running',
            'is_manual' => $isManual,
        ]);

        $db   = config('database.connections.pgsql');
        $host = $db['host'];
        $port = $db['port'] ?? 5432;
        $name = $db['database'];
        $user = $db['username'];
        $pass = $db['password'];

        // pg_dump | gzip → archivo comprimido
        $cmd = sprintf(
            'PGPASSWORD=%s pg_dump -h %s -p %s -U %s -Fc %s | gzip > %s 2>&1',
            escapeshellarg($pass),
            escapeshellarg($host),
            escapeshellarg((string) $port),
            escapeshellarg($user),
            escapeshellarg($name),
            escapeshellarg($filepath)
        );

        exec($cmd, $output, $exitCode);

        if ($exitCode !== 0 || !file_exists($filepath)) {
            $backup->update([
                'status' => 'failed',
                'notes'  => implode("\n", $output),
            ]);
            $this->error("Backup failed (exit {$exitCode}).");
            return self::FAILURE;
        }

        $backup->update([
            'status'       => 'completed',
            'size_bytes'   => filesize($filepath),
            'completed_at' => now(),
        ]);

        $this->info("Backup completado: {$filename} (" . number_format(filesize($filepath) / 1_048_576, 2) . ' MB)');

        // Rotación: conservar solo los últimos N backups automáticos
        $keep = (int) env('BACKUP_KEEP_LAST', 30);
        DatabaseBackup::where('is_manual', false)
            ->where('status', 'completed')
            ->orderByDesc('id')
            ->skip($keep)
            ->take(PHP_INT_MAX)
            ->get()
            ->each(function (DatabaseBackup $old) {
                $oldPath = storage_path('app/' . $old->path);
                if (file_exists($oldPath)) {
                    unlink($oldPath);
                }
                $old->delete();
            });

        return self::SUCCESS;
    }
}
