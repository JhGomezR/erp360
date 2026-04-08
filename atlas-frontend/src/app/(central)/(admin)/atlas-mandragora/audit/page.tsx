'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, AlertTriangle, AlertOctagon, Info, CheckCircle2,
  Search, Filter, ChevronDown, ChevronRight, Clock, User,
  Layers, RefreshCw, Building2, Monitor, Smartphone, Tablet, Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { auditApi } from '@/lib/api/central.api';
import { cn } from '@/lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: number;
  tenant_slug: string;
  tenant_name: string;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  level: string;
  module: string | null;
  model_type: string | null;
  model_id: string | null;
  old_values: string | null; // JSON string from raw SQL
  new_values: string | null;
  description: string | null;
  tags: string | null;
  ip_address: string | null;
  device_type: string | null;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  created_at: string;
}

interface AuditStats {
  period_hours: number;
  total: number;
  by_level: Record<string, number>;
  by_module: { module: string; total: number }[];
  by_tenant: { tenant_slug: string; tenant_name: string; total: number }[];
  critical_recent: AuditLog[];
}

interface Filters {
  levels: string[];
  modules: string[];
  model_types: string[];
  tenants: { id: number; name: string; slug: string }[];
}

// ─── Helpers de nivel ─────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<string, {
  label: string; icon: React.ElementType; badge: string; row: string;
}> = {
  info:     { label: 'Info',    icon: Info,          badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',         row: '' },
  success:  { label: 'Éxito',   icon: CheckCircle2,  badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',     row: '' },
  warning:  { label: 'Alerta',  icon: AlertTriangle, badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', row: 'bg-yellow-50/50 dark:bg-yellow-900/10' },
  error:    { label: 'Error',   icon: AlertOctagon,  badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',             row: 'bg-red-50/50 dark:bg-red-900/10' },
  critical: { label: 'Crítico', icon: ShieldCheck,   badge: 'bg-red-200 text-red-900 dark:bg-red-800/60 dark:text-red-200 font-bold',  row: 'bg-red-100/60 dark:bg-red-900/20' },
};

function LevelBadge({ level }: { level: string }) {
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cfg.badge)}>
      <Icon className="size-3" />
      {cfg.label}
    </span>
  );
}

// ─── Device helpers ───────────────────────────────────────────────────────────

const DEVICE_ICON: Record<string, React.ElementType> = {
  mobile:  Smartphone,
  tablet:  Tablet,
  desktop: Monitor,
  bot:     Bot,
};

function DeviceIcon({ type, className }: { type: string | null; className?: string }) {
  const Icon = DEVICE_ICON[type ?? ''] ?? Monitor;
  return <Icon className={cn('size-3.5', className)} />;
}

function parseJson(val: string | null | Record<string, unknown>): Record<string, unknown> | null {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

// ─── Fila expandible ─────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const cfg = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info;
  const oldVals   = parseJson(log.old_values);
  const newVals   = parseJson(log.new_values);
  const tags      = parseJson(log.tags);
  const hasDetail = oldVals || newVals || log.device_type || log.browser || log.os;

  return (
    <>
      <tr
        className={cn('border-b text-sm transition-colors hover:bg-muted/40', hasDetail && 'cursor-pointer', cfg.row)}
        onClick={() => hasDetail && setOpen(v => !v)}
      >
        <td className="w-6 pl-3 pr-1">
          {hasDetail
            ? open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />
            : null}
        </td>
        <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted-foreground">
          {new Date(log.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' })}
        </td>
        <td className="pr-3 py-2.5">
          <LevelBadge level={log.level} />
        </td>
        {/* Tenant */}
        <td className="pr-3 py-2.5">
          <div>
            <p className="text-xs font-medium leading-none">{log.tenant_name}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{log.tenant_slug}</p>
          </div>
        </td>
        {/* Módulo */}
        <td className="pr-3 py-2.5">
          {log.module && (
            <Badge variant="outline" className="text-xs font-normal capitalize">{log.module}</Badge>
          )}
        </td>
        {/* Acción */}
        <td className="pr-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
          {log.action}
        </td>
        {/* Descripción */}
        <td className="py-2.5 pr-3 max-w-xs truncate text-sm">
          {log.description ?? <span className="text-muted-foreground/50 italic">—</span>}
        </td>
        {/* Usuario */}
        <td className="py-2.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">
          <div>
            <span>{log.user_name ?? <span className="italic">Sistema</span>}</span>
            {log.user_email && log.user_email !== log.user_name && (
              <div className="text-[11px] text-muted-foreground/60 font-mono">{log.user_email}</div>
            )}
          </div>
        </td>
        {/* Dispositivo */}
        <td className="py-2.5 pr-3 text-xs text-muted-foreground hidden lg:table-cell">
          {log.device_type ? (
            <div className="flex items-center gap-1" title={[log.device_name, log.browser, log.os].filter(Boolean).join(' · ')}>
              <DeviceIcon type={log.device_type} className="text-muted-foreground/70" />
              <span className="capitalize">{log.device_type}</span>
            </div>
          ) : '—'}
        </td>
        {/* IP */}
        <td className="py-2.5 pr-3 text-xs text-muted-foreground font-mono hidden xl:table-cell">
          {log.ip_address ?? '—'}
        </td>
      </tr>

      {open && hasDetail && (
        <tr className={cn('border-b', cfg.row)}>
          <td colSpan={10} className="px-6 pb-4 pt-1">
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              {/* Información de dispositivo */}
              {(log.device_type || log.browser || log.os || log.device_name) && (
                <div className="sm:col-span-2">
                  <p className="font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <DeviceIcon type={log.device_type} />
                    Dispositivo
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] bg-muted/40 rounded p-2">
                    {log.device_type && (
                      <span><span className="text-muted-foreground">Tipo:</span> <span className="capitalize font-medium">{log.device_type}</span></span>
                    )}
                    {log.device_name && (
                      <span><span className="text-muted-foreground">Modelo:</span> <span className="font-medium">{log.device_name}</span></span>
                    )}
                    {log.browser && (
                      <span><span className="text-muted-foreground">Navegador:</span> <span className="font-medium">{log.browser}</span></span>
                    )}
                    {log.os && (
                      <span><span className="text-muted-foreground">SO:</span> <span className="font-medium">{log.os}</span></span>
                    )}
                    {log.ip_address && (
                      <span><span className="text-muted-foreground">IP:</span> <span className="font-mono font-medium">{log.ip_address}</span></span>
                    )}
                  </div>
                </div>
              )}

              {oldVals && (
                <div>
                  <p className="font-semibold text-red-600 dark:text-red-400 mb-1">Antes</p>
                  <pre className="rounded bg-red-50 dark:bg-red-900/20 p-2 overflow-auto max-h-52 text-[11px] leading-relaxed">
                    {JSON.stringify(oldVals, null, 2)}
                  </pre>
                </div>
              )}
              {newVals && (
                <div>
                  <p className="font-semibold text-green-600 dark:text-green-400 mb-1">Después</p>
                  <pre className="rounded bg-green-50 dark:bg-green-900/20 p-2 overflow-auto max-h-52 text-[11px] leading-relaxed">
                    {JSON.stringify(newVals, null, 2)}
                  </pre>
                </div>
              )}
              {Array.isArray(tags) && tags.length > 0 && (
                <div className="sm:col-span-2 flex flex-wrap gap-1 mt-1">
                  {tags.map((tag: string) => (
                    <span key={tag} className="bg-muted rounded px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Tarjeta estadística ──────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, className }: {
  label: string; value: number | string; icon: React.ElementType; className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="size-7 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [search, setSearch]           = useState('');
  const [level, setLevel]             = useState('');
  const [module, setModule]           = useState('');
  const [tenantSlug, setTenantSlug]   = useState('');
  const [deviceType, setDeviceType]   = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [page, setPage]               = useState(1);

  const params = {
    ...(search     && { search }),
    ...(level      && { level }),
    ...(module     && { module }),
    ...(tenantSlug && { tenant_slug: tenantSlug }),
    ...(deviceType && { device_type: deviceType }),
    ...(dateFrom   && { from: dateFrom }),
    ...(dateTo     && { to: dateTo }),
    page,
    per_page: 50,
  };

  const { data: logsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['central-audit-logs', params],
    queryFn:  () => auditApi.list(params).then(r => r.data as {
      data: AuditLog[]; total: number; last_page: number; current_page: number;
    }),
  });

  const { data: stats } = useQuery({
    queryKey: ['central-audit-stats', tenantSlug],
    queryFn:  () => auditApi.stats({ hours: 24, ...(tenantSlug && { tenant_slug: tenantSlug }) }).then(r => r.data as AuditStats),
    refetchInterval: 60_000,
  });

  const { data: filters } = useQuery({
    queryKey: ['central-audit-filters'],
    queryFn:  () => auditApi.filters().then(r => r.data as Filters),
  });

  const resetFilters = useCallback(() => {
    setSearch(''); setLevel(''); setModule('');
    setTenantSlug(''); setDeviceType(''); setDateFrom(''); setDateTo(''); setPage(1);
  }, []);

  const logs = logsData?.data ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="size-6" />
            Registro de Auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todos los eventos de Atlas Central y de todos los tenants
            {logsData && <span className="ml-2 font-medium text-foreground">· {logsData.total.toLocaleString('es-CO')} registros</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('size-4 mr-1.5', isFetching && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Estadísticas 24h */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Total (24h)"  value={stats.total}                     icon={Layers} />
          <StatCard label="Info"         value={stats.by_level.info ?? 0}        icon={Info}          className="border-blue-200 dark:border-blue-800" />
          <StatCard label="Éxito"        value={stats.by_level.success ?? 0}     icon={CheckCircle2}  className="border-green-200 dark:border-green-800" />
          <StatCard label="Alertas"      value={stats.by_level.warning ?? 0}     icon={AlertTriangle} className="border-yellow-200 dark:border-yellow-800" />
          <StatCard label="Errores"      value={stats.by_level.error ?? 0}       icon={AlertOctagon}  className="border-red-200 dark:border-red-800" />
          <StatCard label="Críticos"     value={stats.by_level.critical ?? 0}    icon={ShieldCheck}   className="border-red-300 dark:border-red-700" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      )}

      {/* Top tenants actividad */}
      {stats?.by_tenant && stats.by_tenant.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {stats.by_tenant.slice(0, 8).map(t => (
            <button
              key={t.tenant_slug}
              onClick={() => { setTenantSlug(tenantSlug === t.tenant_slug ? '' : t.tenant_slug); setPage(1); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                tenantSlug === t.tenant_slug
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              )}
            >
              <Building2 className="size-3" />
              {t.tenant_name}
              <span className="font-mono opacity-60">{t.total}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Filter className="size-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {/* Búsqueda */}
            <div className="col-span-2 relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar descripción, acción, usuario..."
                className="pl-8 h-8 text-sm"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Tenant */}
            <Select value={tenantSlug || 'all'} onValueChange={v => { if (v) { setTenantSlug(v === 'all' ? '' : v); setPage(1); } }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="central">⚙ Atlas Central</SelectItem>
                {(filters?.tenants ?? []).map(t => (
                  <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Nivel */}
            <Select value={level || 'all'} onValueChange={v => { if (v) { setLevel(v === 'all' ? '' : v); setPage(1); } }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los niveles</SelectItem>
                {(filters?.levels ?? ['info','success','warning','error','critical']).map(l => (
                  <SelectItem key={l} value={l}>{LEVEL_CONFIG[l]?.label ?? l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Módulo */}
            <Select value={module || 'all'} onValueChange={v => { if (v) { setModule(v === 'all' ? '' : v); setPage(1); } }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los módulos</SelectItem>
                {(filters?.modules ?? []).map(m => (
                  <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Dispositivo */}
            <Select value={deviceType || 'all'} onValueChange={v => { if (v) { setDeviceType(v === 'all' ? '' : v); setPage(1); } }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Dispositivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los dispositivos</SelectItem>
                <SelectItem value="desktop"><Monitor className="inline size-3 mr-1" />Desktop</SelectItem>
                <SelectItem value="mobile"><Smartphone className="inline size-3 mr-1" />Móvil</SelectItem>
                <SelectItem value="tablet"><Tablet className="inline size-3 mr-1" />Tablet</SelectItem>
                <SelectItem value="bot"><Bot className="inline size-3 mr-1" />Bot</SelectItem>
              </SelectContent>
            </Select>

            {/* Desde */}
            <Input
              type="date" className="h-8 text-sm"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            />

            {/* Hasta */}
            <Input
              type="date" className="h-8 text-sm"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
            />

            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="w-6 pl-3" />
                <th className="text-left py-2.5 pr-3 whitespace-nowrap">
                  <Clock className="inline size-3 mr-1" />Fecha
                </th>
                <th className="text-left py-2.5 pr-3">Nivel</th>
                <th className="text-left py-2.5 pr-3">
                  <Building2 className="inline size-3 mr-1" />Tenant
                </th>
                <th className="text-left py-2.5 pr-3">Módulo</th>
                <th className="text-left py-2.5 pr-3">Acción</th>
                <th className="text-left py-2.5 pr-3">Descripción</th>
                <th className="text-left py-2.5 pr-3">
                  <User className="inline size-3 mr-1" />Usuario
                </th>
                <th className="text-left py-2.5 pr-3 hidden lg:table-cell">Dispositivo</th>
                <th className="text-left py-2.5 pr-3 hidden xl:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={10} className="py-2.5 px-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
                : logs.length === 0
                  ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-muted-foreground">
                        No se encontraron registros para los filtros aplicados.
                      </td>
                    </tr>
                  )
                  : logs.map((log, i) => <LogRow key={`${log.tenant_slug}-${log.id}-${i}`} log={log} />)
              }
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {logsData && logsData.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <span className="text-muted-foreground">
              Página {page} de {logsData.last_page} · {logsData.total.toLocaleString('es-CO')} registros
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= logsData.last_page} onClick={() => setPage(p => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
