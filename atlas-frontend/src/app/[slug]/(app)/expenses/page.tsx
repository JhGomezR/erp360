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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-muted-foreground text-sm">Registro y aprobación de gastos operativos</p>
        </div>
        {tab === 'expenses' ? (
          <Button onClick={() => setExpDialog(true)} className="gap-2">
            <Plus className="size-4" />Nuevo gasto
          </Button>
        ) : (
          <Button onClick={() => setCatDialog(true)} className="gap-2">
            <Plus className="size-4" />Nueva categoría
          </Button>
        )}
      </div>

      {/* Resumen */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <DollarSign className="size-8 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground">Total gastos</p>
                <p className="text-lg font-bold">{fmt(summary.total ?? 0)}</p>
              </div>
            </CardContent>
          </Card>
          {summary.by_category?.slice(0, 3).map((c) => (
            <Card key={c.name}>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground truncate">{c.name}</p>
                <p className="text-lg font-bold">{fmt(c.total)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {/* Gastos */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? '')}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>{s ? STATUS_LABEL[s] : 'Todos'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Descripción</th>
                    <th className="text-left px-4 py-3 font-medium">Categoría</th>
                    <th className="text-right px-4 py-3 font-medium">Monto</th>
                    <th className="text-left px-4 py-3 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingExp
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                        ))}</tr>
                      ))
                    : filtered.map((e) => (
                        <tr key={e.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{e.description}</td>
                          <td className="px-4 py-3 text-muted-foreground">{e.category?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(e.amount)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(e.expense_date).toLocaleDateString('es-CO')}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={STATUS_VARIANT[e.status] ?? 'outline'}>
                              {STATUS_LABEL[e.status] ?? e.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 flex gap-1">
                            {e.status === 'draft' && (
                              <Button variant="outline" size="sm" className="gap-1"
                                onClick={() => approve.mutate(e.id)} disabled={approve.isPending}>
                                <CheckCircle className="size-3" />Aprobar
                              </Button>
                            )}
                            {e.status === 'approved' && (
                              <Button variant="outline" size="sm" className="gap-1"
                                onClick={() => markPaid.mutate(e.id)} disabled={markPaid.isPending}>
                                <CreditCard className="size-3" />Pagar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                  {!loadingExp && filtered.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      No hay gastos registrados
                    </td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Categorías */}
      {tab === 'categories' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id}>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="size-8 rounded-full" style={{ backgroundColor: cat.color ?? '#94a3b8' }} />
                <span className="font-medium">{cat.name}</span>
              </CardContent>
            </Card>
          ))}
          {categories.length === 0 && (
            <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">
              No hay categorías. Crea la primera.
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
