<?php

namespace App\Central\Backups\Commands;

use App\Central\Backups\Models\DatabaseBackup;
use App\Central\Tenants\Models\Tenant;
use Illuminate\Console\Command;

/**
 * Genera un backup del schema PostgreSQL de un tenant específico.
 *
 * Uso:
 *   php artisan atlas:backup-tenant {slug}
 *   php artisan atlas:backup-tenant {slug} --manual
 *
 * Rotación automática: conserva los últimos BACKUP_TENANT_KEEP_LAST (default 7).
 */
class BackupTenantCommand extends Command
{
    protected $signature = 'atlas:backup-tenant
                            {slug : Slug del tenant a respaldar}
                            {--manual : Marcar como backup manual}';

    protected $description = 'Crea un backup del schema PostgreSQL de un tenant y lo guarda en storage/app/backups/tenants/';

    public function handle(): int
    {
        $slug   = $this->argument('slug');
        $tenant = Tenant::where('slug', $slug)->first();

        if (! $tenant) {
            $this->error("Tenant '{$slug}' no encontrado.");
            return self::FAILURE;
        }

        $isManual   = (bool) $this->option('manual');
        $schema     = $tenant->schema_name;
        $filename   = "tenant_{$slug}_" . now()->format('Y-m-d_His') . '.sql.gz';
        $dir        = storage_path('app/backups/tenants');
        $filepath   = $dir . DIRECTORY_SEPARATOR . $filename;

        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $backup = DatabaseBackup::create([
            'tenant_id'   => $tenant->id,
            'backup_type' => 'tenant',
            'filename'    => $filename,
            'path'        => 'backups/tenants/' . $filename,
            'status'      => 'running',
            'is_manual'   => $isManual,
        ]);

        $db   = config('database.connections.pgsql');
        $host = $db['host'];
        $port = $db['port'] ?? 5432;
        $name = $db['database'];
        $user = $db['username'];
        $pass = $db['password'];

        // pg_dump -n {schema} → solo el schema del tenant, comprimido con gzip
        $cmd = sprintf(
            'PGPASSWORD=%s pg_dump -h %s -p %s -U %s -n %s -Fc %s | gzip > %s 2>&1',
            escapeshellarg($pass),
            escapeshellarg($host),
            escapeshellarg((string) $port),
            escapeshellarg($user),
            escapeshellarg($schema),
            escapeshellarg($name),
            escapeshellarg($filepath)
        );

        exec($cmd, $output, $exitCode);

        if ($exitCode !== 0 || ! file_exists($filepath) || filesize($filepath) === 0) {
            $backup->update([
                'status' => 'failed',
                'notes'  => implode("\n", $output),
            ]);
            $this->error("Backup fallido (exit {$exitCode}): " . implode(' ', $output));
            return self::FAILURE;
        }

        $backup->update([
            'status'       => 'completed',
            'size_bytes'   => filesize($filepath),
            'completed_at' => now(),
        ]);

        $sizeMb = number_format(filesize($filepath) / 1_048_576, 2);
        $this->info("Backup completado: {$filename} ({$sizeMb} MB) — schema: {$schema}");

        // ── Rotación: conservar solo los últimos N backups automáticos del tenant ──
        $keep = (int) env('BACKUP_TENANT_KEEP_LAST', 7);

        DatabaseBackup::forTenant($tenant->id)
            ->where('is_manual', false)
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
