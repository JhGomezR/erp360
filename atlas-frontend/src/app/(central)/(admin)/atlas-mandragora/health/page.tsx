'use client';

import { useEffect, useState, useCallback } from 'react';
import apiClient from '@/lib/api/axios';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CheckResult {
  status: 'ok' | 'warning' | 'error';
  latency_ms?: number;
  driver?: string;
  pending?: number;
  used_percent?: number;
  free_gb?: number;
  total_gb?: number;
  message?: string;
}

interface HealthData {
  status: 'ok' | 'warning' | 'degraded';
  timestamp: string;
  app: string;
  env: string;
  version: string;
  checks: {
    database?: CheckResult;
    cache?: CheckResult;
    queue?: CheckResult;
    disk?: CheckResult;
  };
}

const STATUS_LABELS: Record<string, string> = {
  ok: 'OK',
  warning: 'Advertencia',
  degraded: 'Degradado',
  error: 'Error',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok')      return <CheckCircle className="size-5 text-green-500" />;
  if (status === 'warning') return <AlertTriangle className="size-5 text-yellow-500" />;
  return <XCircle className="size-5 text-red-500" />;
}

function CheckCard({ label, check }: { label: string; check?: CheckResult }) {
  if (!check) return null;
  return (
    <div className={cn(
      'rounded-lg border p-4 space-y-2',
      check.status === 'ok'      && 'border-green-500/30 bg-green-500/5',
      check.status === 'warning' && 'border-yellow-500/30 bg-yellow-500/5',
      check.status === 'error'   && 'border-red-500/30 bg-red-500/5',
    )}>
      <div className="flex items-center gap-2">
        <StatusIcon status={check.status} />
        <span className="font-medium">{label}</span>
        <span className={cn(
          'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
          check.status === 'ok'      && 'bg-green-500/20 text-green-700 dark:text-green-400',
          check.status === 'warning' && 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
          check.status === 'error'   && 'bg-red-500/20 text-red-700 dark:text-red-400',
        )}>
          {STATUS_LABELS[check.status] ?? check.status}
        </span>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5 pl-7">
        {check.latency_ms !== undefined && <p>Latencia: {check.latency_ms} ms</p>}
        {check.driver      !== undefined && <p>Driver: {check.driver}</p>}
        {check.pending     !== undefined && <p>Trabajos pendientes: {check.pending}</p>}
        {check.used_percent !== undefined && (
          <p>Disco usado: {check.used_percent}% — {check.free_gb} GB libres de {check.total_gb} GB</p>
        )}
        {check.message && <p className="text-red-500">{check.message}</p>}
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<HealthData>('/health');
      setData(res.data);
      setLastFetch(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al obtener estado del sistema';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000); // auto-refresh cada 30s
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overallColor = data?.status === 'ok'
    ? 'text-green-500'
    : data?.status === 'warning'
    ? 'text-yellow-500'
    : 'text-red-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Health Check</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Estado del sistema en tiempo real — actualización automática cada 30 s
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
          <RefreshCw className={cn('size-4 mr-2', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Estado general */}
          <div className="rounded-lg border p-6 flex items-center gap-4">
            <StatusIcon status={data.status} />
            <div>
              <p className={cn('text-2xl font-black', overallColor)}>
                {STATUS_LABELS[data.status] ?? data.status}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.app} — {data.env} — v{data.version}
              </p>
            </div>
            {lastFetch && (
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                Última lectura: {lastFetch.toLocaleTimeString('es-CO')}
              </div>
            )}
          </div>

          {/* Checks individuales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CheckCard label="Base de datos" check={data.checks.database} />
            <CheckCard label="Cache / Redis"  check={data.checks.cache}    />
            <CheckCard label="Queue"          check={data.checks.queue}    />
            <CheckCard label="Disco"          check={data.checks.disk}     />
          </div>

          <p className="text-xs text-muted-foreground">
            Timestamp: {new Date(data.timestamp).toLocaleString('es-CO')}
          </p>
        </>
      )}

      {loading && !data && (
        <div className="text-sm text-muted-foreground">Cargando estado del sistema...</div>
      )}
    </div>
  );
}
