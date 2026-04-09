'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import { Plus, DollarSign, CheckCircle, CreditCard, Search, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { expensesApi } from '@/lib/api/tenant.api';
import { setTenantSlug } from '@/lib/api/tenant.api';

// ─── Schemas ──────────────────────────────────────────────────────────────────
const expenseSchema = z.object({
  description: z.string().min(3, 'Mínimo 3 caracteres'),
  amount: z.string().min(1, 'Monto requerido'),
  category_id: z.string().min(1, 'Selecciona una categoría'),
  expense_date: z.string().min(1, 'Fecha requerida'),
  payment_method: z.string().optional(),
  notes: z.string().optional(),
});
type ExpenseForm = z.infer<typeof expenseSchema>;

const categorySchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  color: z.string().optional(),
});
type CategoryForm = z.infer<typeof categorySchema>;

interface Expense {
  id: number; description: string; amount: number; status: string;
  expense_date: string; category?: { id: number; name: string; color?: string };
  payment_method?: string; notes?: string;
}
interface Category { id: number; name: string; color?: string; }
interface Summary { total: number; by_category?: { name: string; total: number }[]; }

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', approved: 'Aprobado', paid: 'Pagado', rejected: 'Rechazado',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary', approved: 'default', paid: 'default', rejected: 'outline',
};
const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro'];
const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

export default function ExpensesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const qc = useQueryClient();

  const [tab, setTab] = useState<'expenses' | 'categories'>('expenses');
  const [expDialog, setExpDialog] = useState(false);
  const [catDialog, setCatDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: expenses = [], isLoading: loadingExp } = useQuery<Expense[]>({
    queryKey: ['expenses', slug, statusFilter],
    queryFn: async () => {
      const r = await expensesApi.list({ status: statusFilter || undefined });
      return (r.data as { data?: Expense[] }).data ?? (r.data as Expense[]) ?? [];
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['expense-categories', slug],
    queryFn: async () => {
      const r = await expensesApi.categories();
      return (r.data as Category[]) ?? [];
    },
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ['expense-summary', slug],
    queryFn: async () => {
      const r = await expensesApi.summary();
      return r.data as Summary;
    },
  });

  // ─── Forms ────────────────────────────────────────────────────────────────
  const expForm = useForm<ExpenseForm>({ resolver: zodResolver(expenseSchema) });
  const catForm = useForm<CategoryForm>({ resolver: zodResolver(categorySchema) });

  const saveExpense = useMutation({
    mutationFn: (d: ExpenseForm) => expensesApi.create({
      ...d, amount: Number(d.amount), category_id: Number(d.category_id),
    }),
    onSuccess: () => {
      notify.success('Gasto registrado');
      setExpDialog(false); expForm.reset();
      qc.invalidateQueries({ queryKey: ['expenses', slug] });
      qc.invalidateQueries({ queryKey: ['expense-summary', slug] });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  const approve = useMutation({
    mutationFn: (id: number) => expensesApi.approve(id),
    onSuccess: () => { notify.success('Gasto aprobado'); qc.invalidateQueries({ queryKey: ['expenses', slug] }); },
    onError: (err) => notify.error(err, 'Error al aprobar'),
  });

  const markPaid = useMutation({
    mutationFn: (id: number) => expensesApi.markPaid(id, { paid_at: new Date().toISOString() }),
    onSuccess: () => { notify.success('Marcado como pagado'); qc.invalidateQueries({ queryKey: ['expenses', slug] }); },
    onError: (err) => notify.error(err, 'Error al marcar'),
  });

  const saveCategory = useMutation({
    mutationFn: (d: CategoryForm) => expensesApi.createCategory(d),
    onSuccess: () => {
      notify.success('Categoría creada');
      setCatDialog(false); catForm.reset();
      qc.invalidateQueries({ queryKey: ['expense-categories', slug] });
    },
    onError: (err) => notify.error(err, 'Error al crear categoría'),
  });

  const filtered = expenses.filter((e) =>
    e.description.toLowerCase().includes(search.toLowerCase())
  );

  const TABS = [
    { key: 'expenses', label: 'Gastos', icon: DollarSign },
    { key: 'categories', label: 'Categorías', icon: Tag },
  ] as const;

  const STATUS_FILTERS = ['', 'draft', 'approved', 'paid'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro y aprobación de gastos operativos</p>
        </div>
        {tab === 'expenses' ? (
          <Button onClick={() => setExpDialog(true)} className="gap-2">
            <Plus className="size-4" /> Nuevo gasto
          </Button>
        ) : (
          <Button onClick={() => setCatDialog(true)} className="gap-2">
            <Plus className="size-4" /> Nueva categoría
          </Button>
        )}
      </div>

      {/* Resumen KPI */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-stretch">
                <div className="w-1.5 bg-red-500 shrink-0" />
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total gastos</p>
                  <p className="text-xl font-bold">{fmt(summary.total ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {summary.by_category?.slice(0, 3).map((c) => (
            <Card key={c.name} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-stretch">
                  <div className="w-1.5 bg-amber-400 shrink-0" />
                  <div className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 truncate">{c.name}</p>
                    <p className="text-xl font-bold">{fmt(c.total)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Gastos */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Buscar gasto..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? '')}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>{s ? STATUS_LABEL[s] : 'Todos los estados'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingExp ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-2xl border">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-3">
                <DollarSign className="size-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No hay gastos registrados</p>
              <Button onClick={() => setExpDialog(true)} className="mt-4 gap-2" size="sm">
                <Plus className="size-4" /> Registrar primer gasto
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => {
                const STATUS_COLOR: Record<string, string> = {
                  draft: 'bg-slate-500/10 text-slate-600',
                  approved: 'bg-blue-500/10 text-blue-700',
                  paid: 'bg-green-500/10 text-green-700',
                  rejected: 'bg-red-500/10 text-red-700',
                };
                return (
                  <div key={e.id} className="flex items-center gap-3 p-4 rounded-2xl border bg-card hover:shadow-sm hover:border-primary/20 transition-all">
                    {/* Category dot */}
                    <div
                      className="size-10 rounded-xl shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: e.category?.color ? `${e.category.color}20` : '#f1f5f9' }}
                    >
                      <DollarSign className="size-5" style={{ color: e.category?.color ?? '#64748b' }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{e.description}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {e.category && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ backgroundColor: e.category.color ? `${e.category.color}20` : '#f1f5f9', color: e.category.color ?? '#64748b' }}
                          >
                            {e.category.name}
                          </span>
                        )}
                        <span>{new Date(e.expense_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </p>
                    </div>

                    {/* Monto */}
                    <p className="font-bold text-sm tabular-nums shrink-0">{fmt(e.amount)}</p>

                    {/* Estado */}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[e.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>

                    {/* Acciones */}
                    <div className="flex gap-1 shrink-0">
                      {e.status === 'draft' && (
                        <Button variant="outline" size="sm" className="gap-1 text-xs h-7 px-2"
                          onClick={() => approve.mutate(e.id)} disabled={approve.isPending}>
                          <CheckCircle className="size-3" /> Aprobar
                        </Button>
                      )}
                      {e.status === 'approved' && (
                        <Button variant="outline" size="sm" className="gap-1 text-xs h-7 px-2"
                          onClick={() => markPaid.mutate(e.id)} disabled={markPaid.isPending}>
                          <CreditCard className="size-3" /> Pagar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Categorías */}
      {tab === 'categories' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 p-4 rounded-2xl border bg-card hover:shadow-sm transition-all">
              <div className="size-10 rounded-xl shrink-0" style={{ backgroundColor: cat.color ?? '#94a3b8' }} />
              <span className="font-semibold">{cat.name}</span>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="col-span-4 flex flex-col items-center justify-center py-16 text-center">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-3">
                <Tag className="size-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Sin categorías</p>
              <Button onClick={() => setCatDialog(true)} className="mt-4 gap-2" size="sm">
                <Plus className="size-4" /> Crear primera categoría
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dialog: Nuevo gasto */}
      <Dialog open={expDialog} onOpenChange={setExpDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="size-4" />Nuevo gasto</DialogTitle></DialogHeader>
          <form onSubmit={expForm.handleSubmit((d) => saveExpense.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Descripción *</Label>
              <Input {...expForm.register('description')} />
              {expForm.formState.errors.description && <p className="text-xs text-destructive">{expForm.formState.errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Monto ($) *</Label>
                <Input type="number" step="0.01" {...expForm.register('amount')} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" {...expForm.register('expense_date')}
                  defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select onValueChange={(v: string | null) => expForm.setValue('category_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select onValueChange={(v: string | null) => expForm.setValue('payment_method', v ?? undefined)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input {...expForm.register('notes')} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setExpDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveExpense.isPending}>
                {saveExpense.isPending ? 'Guardando...' : 'Guardar gasto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nueva categoría */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
          <form onSubmit={catForm.handleSubmit((d) => saveCategory.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input {...catForm.register('name')} />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Input type="color" {...catForm.register('color')} className="h-10 w-full" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setCatDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveCategory.isPending}>
                {saveCategory.isPending ? 'Creando...' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
