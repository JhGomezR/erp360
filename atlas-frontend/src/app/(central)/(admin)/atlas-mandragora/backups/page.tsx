'use client';

import { useEffect, useState, useCallback } from 'react';
import apiClient from '@/lib/api/axios';
import { Database, Download, Trash2, RefreshCw, Plus, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DatabaseBackup {
  id: number;
  filename: string;
  path: string;
  size_bytes: number | null;
  size_human: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  is_manual: boolean;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

interface PaginatedResponse {
  data: DatabaseBackup[];
  total: number;
  current_page: number;
  last_page: number;
}

function StatusBadge({ status }: { status: DatabaseBackup['status'] }) {
  const map = {
    pending:   { label: 'Pendiente',   icon: Clock,      cls: 'bg-muted text-muted-foreground' },
    running:   { label: 'En progreso', icon: Loader2,    cls: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
    completed: { label: 'Completado',  icon: CheckCircle,cls: 'bg-green-500/20 text-green-600 dark:text-green-400' },
    failed:    { label: 'Fallido',     icon: XCircle,    cls: 'bg-red-500/20 text-red-600 dark:text-red-400' },
  };
  const { label, icon: Icon, cls } = map[status] ?? map.failed;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cls)}>
      <Icon className={cn('size-3', status === 'running' && 'animate-spin')} />
      {label}
    </span>
  );
}

export default function BackupsPage() {
  const [backups, setBackups]   = useState<DatabaseBackup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PaginatedResponse>('/backups');
      setBackups(res.data.data);
    } catch {
      setError('Error al cargar los backups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const createBackup = async () => {
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.post('/backups');
      setSuccess('Backup iniciado. Aparecerá en la lista cuando termine (puede tardar unos minutos).');
      setTimeout(fetchBackups, 3000);
    } catch {
      setError('No se pudo iniciar el backup.');
    } finally {
      setCreating(false);
    }
  };

  const deleteBackup = async (id: number) => {
    if (!confirm('¿Eliminar este backup? Esta acción no se puede deshacer.')) return;
    setDeletingId(id);
    try {
      await apiClient.delete(`/backups/${id}`);
      setBackups((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError('No se pudo eliminar el backup.');
    } finally {
      setDeletingId(null);
    }
  };

  const downloadBackup = (id: number, filename: string) => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? '/api';
    window.open(`${base}/backups/${id}/download`, '_blank');
    void filename;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backups de Base de Datos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Backups automáticos diarios a las 03:00 AM. Retención: últimos 30.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchBackups} disabled={loading}>
            <RefreshCw className={cn('size-4 mr-2', loading && 'animate-spin')} />
            Actualizar
          </Button>
          <Button size="sm" onClick={createBackup} disabled={creating}>
            {creating
              ? <Loader2 className="size-4 mr-2 animate-spin" />
              : <Plus className="size-4 mr-2" />}
            Crear backup ahora
          </Button>
        </div>
      </div>

      {error   && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
      {success && <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">{success}</div>}

      {/* Tabla */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Archivo</th>
              <th className="text-left px-4 py-3 font-medium">Tamaño</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin inline mr-2" />
                  Cargando...
                </td>
              </tr>
            )}
            {!loading && backups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <Database className="size-8 mx-auto mb-2 opacity-30" />
                  No hay backups aún. El primero se creará automáticamente esta noche a las 03:00 AM.
                </td>
              </tr>
            )}
            {backups.map((backup) => (
              <tr key={backup.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{backup.filename}</td>
                <td className="px-4 py-3">{backup.size_bytes ? backup.size_human : '—'}</td>
                <td className="px-4 py-3"><StatusBadge status={backup.status} /></td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-medium',
                    backup.is_manual ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' : 'bg-muted text-muted-foreground'
                  )}>
                    {backup.is_manual ? 'Manual' : 'Automático'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(backup.created_at).toLocaleString('es-CO')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {backup.status === 'completed' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => downloadBackup(backup.id, backup.filename)}
                        title="Descargar"
                      >
                        <Download className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => deleteBackup(backup.id)}
                      disabled={deletingId === backup.id}
                      title="Eliminar"
                    >
                      {deletingId === backup.id
                        ? <Loader2 className="size-4 animate-spin" />
                        : <Trash2 className="size-4" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground space-y-1 border rounded-lg p-4 bg-muted/30">
        <p className="font-medium text-foreground">Notas de configuración</p>
        <p>• Los backups se almacenan en <code className="bg-muted px-1 rounded">storage/app/backups/</code> del servidor.</p>
        <p>• Formato: <code className="bg-muted px-1 rounded">pg_dump</code> comprimido con gzip (<code className="bg-muted px-1 rounded">.sql.gz</code>).</p>
        <p>• Se conservan automáticamente los últimos <strong>30</strong> backups automáticos (configurable con <code className="bg-muted px-1 rounded">BACKUP_KEEP_LAST</code>).</p>
        <p>• Requiere que <code className="bg-muted px-1 rounded">pg_dump</code> esté instalado en el servidor y en el PATH.</p>
        <p>• Para restaurar: <code className="bg-muted px-1 rounded">gunzip -c archivo.sql.gz | psql -U usuario -d base_de_datos</code></p>
      </div>
    </div>
  );
}
