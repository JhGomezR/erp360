'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Printer, Plus, Pencil, Trash2, Star, Wifi, Usb,
  Cable, Bluetooth, FlaskConical, X, Copy, Check,
  CircleDot, AlertCircle,
} from 'lucide-react';

import {
  printersApi,
  type PosPrinter, type PrinterType, type ConnectionType, type PrintPayload,
} from '@/lib/api/tenant.api';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRINTER_TYPES: { value: PrinterType; label: string }[] = [
  { value: 'escpos',  label: 'ESC/POS (genérico)' },
  { value: 'epson',   label: 'Epson TM' },
  { value: 'star',    label: 'Star Micronics' },
  { value: 'generic', label: 'Genérico' },
];

const CONNECTION_TYPES: { value: ConnectionType; label: string; icon: React.ElementType }[] = [
  { value: 'network',   label: 'Red (TCP/IP)',  icon: Wifi       },
  { value: 'usb',       label: 'USB',           icon: Usb        },
  { value: 'serial',    label: 'Serial / COM',  icon: Cable      },
  { value: 'bluetooth', label: 'Bluetooth',     icon: Bluetooth  },
];

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConnectionIcon({ type }: { type: ConnectionType }) {
  const found = CONNECTION_TYPES.find((c) => c.value === type);
  if (!found) return null;
  const Icon = found.icon;
  return <Icon className="size-3.5" />;
}

// ─── Printer Form Dialog ──────────────────────────────────────────────────────

const EMPTY_FORM = {
  name:            '',
  printer_type:    'escpos' as PrinterType,
  connection_type: 'network' as ConnectionType,
  host:            '',
  port:            9100,
  serial_port:     '',
  baud_rate:       9600,
  paper_width:     80 as 58 | 80,
  cut_paper:       true,
  open_drawer:     false,
  print_logo:      false,
  header_text:     '',
  footer_text:     '',
  is_default:      false,
  is_active:       true,
};

interface PrinterDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  printer: PosPrinter | null;
  slug: string;
}

function PrinterDialog({ open, onOpenChange, printer, slug }: PrinterDialogProps) {
  const qc     = useQueryClient();
  const isEdit = Boolean(printer);

  const [form, setForm] = useState(() =>
    printer
      ? {
          name:            printer.name,
          printer_type:    printer.printer_type,
          connection_type: printer.connection_type,
          host:            printer.host ?? '',
          port:            printer.port ?? 9100,
          serial_port:     printer.serial_port ?? '',
          baud_rate:       printer.baud_rate ?? 9600,
          paper_width:     printer.paper_width,
          cut_paper:       printer.cut_paper,
          open_drawer:     printer.open_drawer,
          print_logo:      printer.print_logo,
          header_text:     printer.header_text ?? '',
          footer_text:     printer.footer_text ?? '',
          is_default:      printer.is_default,
          is_active:       printer.is_active,
        }
      : { ...EMPTY_FORM }
  );

  // Reset form when dialog opens with a different printer
  const handleOpen = (v: boolean) => {
    if (v) {
      setForm(
        printer
          ? {
              name:            printer.name,
              printer_type:    printer.printer_type,
              connection_type: printer.connection_type,
              host:            printer.host ?? '',
              port:            printer.port ?? 9100,
              serial_port:     printer.serial_port ?? '',
              baud_rate:       printer.baud_rate ?? 9600,
              paper_width:     printer.paper_width,
              cut_paper:       printer.cut_paper,
              open_drawer:     printer.open_drawer,
              print_logo:      printer.print_logo,
              header_text:     printer.header_text ?? '',
              footer_text:     printer.footer_text ?? '',
              is_default:      printer.is_default,
              is_active:       printer.is_active,
            }
          : { ...EMPTY_FORM }
      );
    }
    onOpenChange(v);
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        host:        form.connection_type === 'network'  ? form.host || null        : null,
        port:        form.connection_type === 'network'  ? Number(form.port)         : null,
        serial_port: form.connection_type === 'serial'   ? form.serial_port || null  : null,
        baud_rate:   form.connection_type === 'serial'   ? Number(form.baud_rate)    : null,
        header_text: form.header_text || null,
        footer_text: form.footer_text || null,
      };
      return isEdit
        ? printersApi.update(printer!.id, payload)
        : printersApi.create(payload as Omit<PosPrinter, 'id'>);
    },
    onSuccess: () => {
      notify.success(isEdit ? 'Impresora actualizada' : 'Impresora creada');
      qc.invalidateQueries({ queryKey: ['printers', slug] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Error al guardar';
      notify.error(msg);
    },
  });

  const canSave = form.name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar impresora' : 'Nueva impresora POS'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Nombre */}
          <div className="flex flex-col gap-1.5">
            <Label>Nombre *</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ej: Caja 1, Recepción…"
              autoFocus
            />
          </div>

          {/* Tipo impresora + conexión (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Protocolo</Label>
              <Select value={form.printer_type} onValueChange={(v) => set('printer_type', v as PrinterType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRINTER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Tipo de conexión</Label>
              <Select value={form.connection_type} onValueChange={(v) => set('connection_type', v as ConnectionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONNECTION_TYPES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Campos condicionales por tipo de conexión */}
          {form.connection_type === 'network' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Host / IP</Label>
                <Input
                  value={form.host}
                  onChange={(e) => set('host', e.target.value)}
                  placeholder="192.168.1.100"
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Puerto</Label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => set('port', Number(e.target.value) as any)}
                  placeholder="9100"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}

          {form.connection_type === 'serial' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Puerto serie</Label>
                <Input
                  value={form.serial_port}
                  onChange={(e) => set('serial_port', e.target.value)}
                  placeholder="COM1 o /dev/ttyUSB0"
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Baudios</Label>
                <Select
                  value={String(form.baud_rate)}
                  onValueChange={(v) => set('baud_rate', Number(v) as any)}
                >
                  <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BAUD_RATES.map((b) => (
                      <SelectItem key={b} value={String(b)}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(form.connection_type === 'usb' || form.connection_type === 'bluetooth') && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {form.connection_type === 'usb'
                ? 'La conexión USB se establece via WebUSB API directamente en el navegador. No requiere configuración adicional de red.'
                : 'La conexión Bluetooth se establece via Web Bluetooth API. Asegúrate de que el navegador tenga permiso Bluetooth.'}
            </div>
          )}

          {/* Ancho de papel */}
          <div className="flex flex-col gap-2">
            <Label>Ancho de papel</Label>
            <div className="flex gap-3">
              {([58, 80] as const).map((w) => (
                <label key={w} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    checked={form.paper_width === w}
                    onChange={() => set('paper_width', w)}
                    className="accent-primary"
                  />
                  {w} mm
                </label>
              ))}
            </div>
          </div>

          {/* Opciones de impresión */}
          <div className="flex flex-col gap-2">
            <Label>Opciones</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'cut_paper',  label: 'Cortar papel al final' },
                { key: 'open_drawer', label: 'Abrir cajón de dinero' },
                { key: 'print_logo', label: 'Imprimir logo' },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => set(key, e.target.checked)}
                    className="size-4 rounded accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Encabezado / Pie */}
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Encabezado del ticket</Label>
              <textarea
                value={form.header_text}
                onChange={(e) => set('header_text', e.target.value)}
                placeholder="Nombre del negocio, NIT, dirección…"
                rows={2}
                className="min-h-[60px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Pie del ticket</Label>
              <textarea
                value={form.footer_text}
                onChange={(e) => set('footer_text', e.target.value)}
                placeholder="Gracias por su compra…"
                rows={2}
                className="min-h-[60px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>
          </div>

          {/* Estado y defecto */}
          <div className="flex flex-col gap-2 border-t pt-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => set('is_default', e.target.checked)}
                className="size-4 rounded accent-primary"
              />
              Impresora por defecto
              <span className="text-xs text-muted-foreground">(se usa cuando no se especifica impresora)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set('is_active', e.target.checked)}
                className="size-4 rounded accent-primary"
              />
              Activa
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Test Result Dialog ───────────────────────────────────────────────────────

interface TestDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: { printer: PosPrinter; print_payload: PrintPayload } | null;
}

function TestResultDialog({ open, onOpenChange, result }: TestDialogProps) {
  const [copied, setCopied] = useState(false);

  const payloadStr = result ? JSON.stringify(result.print_payload, null, 2) : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!result) return null;

  const { printer, print_payload } = result;
  const connType = CONNECTION_TYPES.find((c) => c.value === printer.connection_type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" />
            Resultado de prueba — {printer.name}
          </DialogTitle>
        </DialogHeader>

        {/* Connection info */}
        <div className="rounded-lg border p-3 flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <ConnectionIcon type={printer.connection_type} />
            <span>{connType?.label}</span>
          </div>

          {printer.connection_type === 'network' && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Dirección:</span>
              <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                {printer.host}:{printer.port}
              </code>
              <span className="text-xs text-muted-foreground">
                — Conecta via TCP y envía el payload ESC/POS a este socket.
              </span>
            </div>
          )}
          {printer.connection_type === 'usb' && (
            <p className="text-muted-foreground text-xs">
              Conecta via <strong>WebUSB API</strong> del navegador y envía el payload al endpoint bulk-out de la impresora.
            </p>
          )}
          {printer.connection_type === 'serial' && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Puerto:</span>
              <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                {printer.serial_port} @ {printer.baud_rate} bps
              </code>
            </div>
          )}
          {printer.connection_type === 'bluetooth' && (
            <p className="text-muted-foreground text-xs">
              Conecta via <strong>Web Bluetooth API</strong> y escribe el payload al characteristic de la impresora.
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2 mt-1">
            <span>Protocolo: <strong className="text-foreground">{printer.printer_type.toUpperCase()}</strong></span>
            <span>Papel: <strong className="text-foreground">{printer.paper_width} mm</strong></span>
          </div>
        </div>

        {/* Payload preview */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Payload generado</Label>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleCopy}>
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto max-h-72 overflow-y-auto leading-relaxed">
            {payloadStr}
          </pre>
        </div>

        {/* Ticket preview (text simulation) */}
        <div className="flex flex-col gap-2">
          <Label>Vista previa del ticket</Label>
          <div
            className="rounded-lg border bg-white dark:bg-zinc-950 p-4 font-mono text-[11px] leading-5 overflow-x-auto"
            style={{ minWidth: printer.paper_width === 58 ? '200px' : '280px', maxWidth: '320px', margin: '0 auto' }}
          >
            {print_payload.lines.map((line, i) => {
              if (line.type === 'cut')     return <div key={i} className="border-t border-dashed border-muted-foreground my-1" />;
              if (line.type === 'drawer')  return null;
              if (line.type === 'divider') return <div key={i} className="text-muted-foreground">{line.content}</div>;
              if (line.type === 'row') {
                return (
                  <div key={i} className="flex justify-between gap-2">
                    <span className={line.bold ? 'font-bold' : ''}>{line.left}</span>
                    <span className={line.bold ? 'font-bold' : ''}>{line.right}</span>
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={[
                    line.align === 'center' ? 'text-center' : line.align === 'right' ? 'text-right' : '',
                    line.bold ? 'font-bold' : '',
                  ].join(' ')}
                >
                  {line.content}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Printer Card ─────────────────────────────────────────────────────────────

interface PrinterCardProps {
  printer: PosPrinter;
  slug: string;
  onEdit: (p: PosPrinter) => void;
  onDelete: (p: PosPrinter) => void;
  onTest: (p: PosPrinter) => void;
  testing: boolean;
}

function PrinterCard({ printer, onEdit, onDelete, onTest, testing }: PrinterCardProps) {
  const connType = CONNECTION_TYPES.find((c) => c.value === printer.connection_type);
  const Icon = connType?.icon ?? Wifi;

  return (
    <div className={`rounded-xl border bg-card flex flex-col gap-0 overflow-hidden transition-shadow hover:shadow-sm ${!printer.is_active ? 'opacity-60' : ''}`}>
      {/* Card header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Printer className="size-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{printer.name}</span>
              {printer.is_default && (
                <Badge className="gap-1 text-[10px] py-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                  <Star className="size-2.5" />
                  Por defecto
                </Badge>
              )}
              {!printer.is_active && (
                <Badge variant="secondary" className="text-[10px] py-0">Inactiva</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {PRINTER_TYPES.find((t) => t.value === printer.printer_type)?.label}
            </p>
          </div>
        </div>
      </div>

      {/* Connection details */}
      <div className="px-4 pb-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span>{connType?.label}</span>
          {printer.connection_type === 'network' && printer.host && (
            <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
              {printer.host}:{printer.port}
            </code>
          )}
          {printer.connection_type === 'serial' && printer.serial_port && (
            <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
              {printer.serial_port}
            </code>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CircleDot className="size-3" />
            {printer.paper_width} mm
          </span>
          {printer.cut_paper && <span>• Corte automático</span>}
          {printer.open_drawer && <span>• Cajón</span>}
        </div>

        {printer.header_text && (
          <p className="text-[11px] text-muted-foreground italic truncate border-t pt-1.5 mt-0.5">
            "{printer.header_text}"
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="border-t px-3 py-2 flex items-center gap-1 bg-muted/30">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          disabled={testing}
          onClick={() => onTest(printer)}
        >
          <FlaskConical className="size-3.5" />
          {testing ? 'Generando…' : 'Probar'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={() => onEdit(printer)}
        >
          <Pencil className="size-3.5" />
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs ml-auto text-destructive hover:text-destructive"
          onClick={() => onDelete(printer)}
        >
          <Trash2 className="size-3.5" />
          Eliminar
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrintersPage() {
  const params = useParams();
  const slug   = params.slug as string;

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editTarget, setEditTarget]     = useState<PosPrinter | null>(null);
  const [testResult, setTestResult]     = useState<{ printer: PosPrinter; print_payload: PrintPayload } | null>(null);
  const [testingId, setTestingId]       = useState<number | null>(null);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['printers', slug],
    queryFn: () => printersApi.list().then((r) => r.data),
    staleTime: 30_000,
  });

  const printers: PosPrinter[] = (data as PosPrinter[]) ?? [];

  const destroyMutation = useMutation({
    mutationFn: (id: number) => printersApi.destroy(id),
    onSuccess: () => {
      notify.success('Impresora eliminada');
      qc.invalidateQueries({ queryKey: ['printers', slug] });
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const handleTest = async (printer: PosPrinter) => {
    setTestingId(printer.id);
    try {
      const res = await printersApi.test(printer.id);
      setTestResult({ printer: res.data.printer, print_payload: res.data.print_payload });
    } catch {
      notify.error('Error al generar ticket de prueba');
    } finally {
      setTestingId(null);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (printer: PosPrinter) => {
    setEditTarget(printer);
    setDialogOpen(true);
  };

  const handleDelete = (printer: PosPrinter) => {
    if (window.confirm(`¿Eliminar la impresora "${printer.name}"?`)) {
      destroyMutation.mutate(printer.id);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Printer className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Impresoras POS</h1>
            <p className="text-sm text-muted-foreground">
              Configura las impresoras de tickets para el punto de venta.
            </p>
          </div>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          Agregar impresora
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50 px-4 py-3 flex gap-3 text-sm text-blue-800 dark:text-blue-300">
        <AlertCircle className="size-4 shrink-0 mt-0.5" />
        <span>
          La impresión desde el navegador requiere <strong>WebUSB</strong> (USB), <strong>TCP directo</strong> (red),
          <strong> Web Serial</strong> (COM) o <strong>Web Bluetooth</strong>. El botón <em>Probar</em> genera el
          payload ESC/POS que se envía a la impresora.
        </span>
      </div>

      {/* Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 flex flex-col gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && printers.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 flex flex-col items-center gap-3 text-center">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <Printer className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">Sin impresoras configuradas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Agrega una impresora ESC/POS para imprimir tickets directamente desde el POS.
            </p>
          </div>
          <Button size="sm" className="gap-2 mt-1" onClick={openCreate}>
            <Plus className="size-4" />
            Agregar primera impresora
          </Button>
        </div>
      )}

      {/* Printer cards grid */}
      {!isLoading && printers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {printers.map((printer) => (
            <PrinterCard
              key={printer.id}
              printer={printer}
              slug={slug}
              onEdit={openEdit}
              onDelete={handleDelete}
              onTest={handleTest}
              testing={testingId === printer.id}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <PrinterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        printer={editTarget}
        slug={slug}
      />

      <TestResultDialog
        open={testResult !== null}
        onOpenChange={(v) => !v && setTestResult(null)}
        result={testResult}
      />
    </div>
  );
}
