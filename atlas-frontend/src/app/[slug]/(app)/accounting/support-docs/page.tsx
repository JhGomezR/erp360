'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  FileText, Plus, Eye, Trash2, Send, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supportDocsApi, suppliersApi, setTenantSlug } from '@/lib/api/tenant.api';
import type { ElectronicSupportDoc, ElectronicSupportDocItem, Supplier } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', issued: 'Emitido', accepted: 'Aceptado', rejected: 'Rechazado',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'secondary', issued: 'default', accepted: 'default', rejected: 'destructive',
};

// ─── Empty item factory ───────────────────────────────────────────────────────

function emptyItem(): ElectronicSupportDocItem {
  return { description: '', quantity: 1, unit_price: 0, discount: 0, tax_rate: 19 };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupportDocsPage() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewDoc, setViewDoc] = useState<ElectronicSupportDoc | null>(null);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['support-docs', slug, page, filterStatus],
    queryFn: () =>
      supportDocsApi.list({ page, ...(filterStatus ? { status: filterStatus } : {}) })
        .then((r) => r.data),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-simple', slug],
    queryFn: () => suppliersApi.list().then((r) => (r.data as { data?: Supplier[] })?.data ?? r.data),
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: ['support-docs', slug] });

  const issueMutation = useMutation({
    mutationFn: (id: number) => supportDocsApi.issue(id).then((r) => r.data),
    onSuccess: () => { notify.success('Documento soporte emitido.'); invalidate(); setViewDoc(null); },
    onError: () => notify.error('Error al emitir el documento.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => supportDocsApi.delete(id),
    onSuccess: () => { notify.success('Documento eliminado.'); invalidate(); },
    onError: () => notify.error('Error al eliminar el documento.'),
  });

  const docs: ElectronicSupportDoc[] = (docsData as { data?: ElectronicSupportDoc[] })?.data ?? [];
  const lastPage: number = (docsData as { last_page?: number })?.last_page ?? 1;
  const suppliers: Supplier[] = (suppliersData as Supplier[] | undefined) ?? [];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Documento Soporte Electrónico
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Art. 616-1 E.T. — Emitido por el adquiriente a proveedores no obligados a FE.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo DSE
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Select value={filterStatus || '_all'} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="issued">Emitido</SelectItem>
            <SelectItem value="accepted">Aceptado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : docs.map((doc) => (
                    <tr key={doc.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-medium">{doc.doc_number}</td>
                      <td className="px-4 py-3">{doc.supplier?.name ?? `#${doc.supplier_id}`}</td>
                      <td className="px-4 py-3">{doc.doc_date}</td>
                      <td className="px-4 py-3 text-right">{fmt(doc.total)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_COLOR[doc.status] as 'secondary' | 'default' | 'destructive'}>
                          {STATUS_LABEL[doc.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewDoc(doc)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {doc.status === 'draft' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => issueMutation.mutate(doc.id)}
                              disabled={issueMutation.isPending}
                            >
                              <Send className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { if (confirm('¿Eliminar este documento?')) deleteMutation.mutate(doc.id); }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              {!isLoading && docs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No hay documentos soporte registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm self-center">Página {page} / {lastPage}</span>
          <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Create Form Dialog */}
      {showForm && (
        <SupportDocForm
          suppliers={suppliers}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); invalidate(); }}
        />
      )}

      {/* View Dialog */}
      {viewDoc && (
        <DocViewDialog
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          onIssue={() => issueMutation.mutate(viewDoc.id)}
          issuing={issueMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Form Dialog ─────────────────────────────────────────────────────────────

function SupportDocForm({
  suppliers,
  onClose,
  onSaved,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ElectronicSupportDocItem[]>([emptyItem()]);

  const createMutation = useMutation({
    mutationFn: () =>
      supportDocsApi.create({
        supplier_id: Number(supplierId),
        doc_date: docDate,
        notes: notes || undefined,
        items,
      }).then((r) => r.data),
    onSuccess: () => { notify.success('Documento soporte creado.'); onSaved(); },
    onError: () => notify.error('Error al crear el documento.'),
  });

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ElectronicSupportDocItem, value: string | number) =>
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const subtotal = items.reduce((s, it) => {
    const base = (it.unit_price * it.quantity) - (it.discount ?? 0);
    return s + base + base * ((it.tax_rate ?? 0) / 100);
  }, 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Documento Soporte Electrónico</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Proveedor *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha del documento *</Label>
              <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Ítems</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Agregar ítem
              </Button>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-right w-20">Cant.</th>
                    <th className="px-2 py-2 text-right w-28">Precio unit.</th>
                    <th className="px-2 py-2 text-right w-24">IVA %</th>
                    <th className="px-2 py-2 text-right w-28">Subtotal</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const base = item.unit_price * item.quantity - (item.discount ?? 0);
                    const lineTotal = base + base * ((item.tax_rate ?? 0) / 100);
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(i, 'description', e.target.value)}
                            placeholder="Descripción"
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            value={item.tax_rate}
                            onChange={(e) => updateItem(i, 'tax_rate', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(lineTotal)}</td>
                        <td className="px-2 py-1">
                          {items.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeItem(i)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right font-semibold">Total:</td>
                    <td className="px-2 py-2 text-right font-mono font-bold">{fmt(subtotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!supplierId || items.every((it) => !it.description) || createMutation.isPending}
          >
            Guardar borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Dialog ──────────────────────────────────────────────────────────────

function DocViewDialog({
  doc,
  onClose,
  onIssue,
  issuing,
}: {
  doc: ElectronicSupportDoc;
  onClose: () => void;
  onIssue: () => void;
  issuing: boolean;
}) {
  const { slug } = useParams<{ slug: string }>();

  const { data: fullDoc } = useQuery({
    queryKey: ['support-doc', slug, doc.id],
    queryFn: () => supportDocsApi.get(doc.id).then((r) => r.data),
  });

  const d = fullDoc ?? doc;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{d.doc_number}</span>
            <Badge variant={STATUS_COLOR[d.status] as any}>{STATUS_LABEL[d.status]}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">Proveedor</p>
              <p className="font-medium">{d.supplier?.name ?? `#${d.supplier_id}`}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha</p>
              <p className="font-medium">{d.doc_date}</p>
            </div>
          </div>

          {d.cuds && (
            <div>
              <p className="text-muted-foreground">CUDS</p>
              <p className="font-mono text-xs break-all">{d.cuds}</p>
            </div>
          )}

          {d.notes && (
            <div>
              <p className="text-muted-foreground">Notas</p>
              <p>{d.notes}</p>
            </div>
          )}

          {/* Items */}
          {d.items && d.items.length > 0 && (
            <div>
              <p className="font-semibold mb-2">Ítems</p>
              <table className="w-full text-xs border rounded-md overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1 text-left">Descripción</th>
                    <th className="px-2 py-1 text-right">Cant.</th>
                    <th className="px-2 py-1 text-right">Precio</th>
                    <th className="px-2 py-1 text-right">IVA</th>
                    <th className="px-2 py-1 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{it.description}</td>
                      <td className="px-2 py-1 text-right">{it.quantity}</td>
                      <td className="px-2 py-1 text-right">{fmt(it.unit_price)}</td>
                      <td className="px-2 py-1 text-right">{it.tax_rate ?? 0}%</td>
                      <td className="px-2 py-1 text-right">{fmt(it.subtotal ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr>
                    <td colSpan={3} className="px-2 py-2 text-right">IVA:</td>
                    <td colSpan={2} className="px-2 py-2 text-right font-mono">{fmt(d.tax)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-2 py-2 text-right font-semibold">Total:</td>
                    <td colSpan={2} className="px-2 py-2 text-right font-mono font-bold">{fmt(d.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          {d.status === 'draft' && (
            <Button onClick={onIssue} disabled={issuing}>
              <Send className="h-4 w-4 mr-2" />
              {issuing ? 'Emitiendo...' : 'Emitir DSE'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
