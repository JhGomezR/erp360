'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Plus, Pencil, Trash2, Globe, BookLock,
  FileText, Shield, RefreshCw, Cookie, FileSignature,
  CheckCircle2, Clock,
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { legalApi } from '@/lib/api/central.api';
import type { LegalDocument } from '@/types';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'terms',    label: 'Términos y Condiciones',      icon: FileText },
  { value: 'privacy',  label: 'Política de Privacidad',      icon: Shield },
  { value: 'refund',   label: 'Política de Reembolso',       icon: RefreshCw },
  { value: 'cookies',  label: 'Política de Cookies',         icon: Cookie },
  { value: 'contract', label: 'Contrato de Servicio',        icon: FileSignature },
] as const;

const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.value, t]));

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const docSchema = z.object({
  type:           z.string().min(1, 'Selecciona el tipo de documento'),
  title:          z.string().min(3, 'El título debe tener al menos 3 caracteres'),
  content:        z.string().min(10, 'El contenido no puede estar vacío'),
  version:        z.string().min(1, 'Indica la versión').regex(/^[\d\w.\-]+$/, 'Solo letras, números, puntos y guiones'),
  language:       z.string().length(2, 'Código de 2 letras (ej: es, en)').default('es'),
  status:         z.enum(['draft', 'published']),
  effective_date: z.string().optional(),
});

type DocForm = z.infer<typeof docSchema>;

// ─── Dialog Editor ────────────────────────────────────────────────────────────

interface EditorDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: (LegalDocument & { id?: number }) | null;
}

function EditorDialog({ open, onOpenChange, editing }: EditorDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(editing?.id);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<DocForm>({
      resolver: zodResolver(docSchema),
      defaultValues: {
        type: '', title: '', content: '', version: '1.0', language: 'es',
        status: 'draft', effective_date: '',
      },
    });

  const status = watch('status');

  // Poblar el formulario al editar
  const handleOpen = (v: boolean) => {
    if (v && editing) {
      reset({
        type:           editing.type,
        title:          editing.title,
        content:        editing.content,
        version:        editing.version,
        language:       editing.language,
        status:         editing.status as 'draft' | 'published',
        effective_date: editing.effective_date?.slice(0, 10) ?? '',
      });
    } else if (!v) {
      reset({ type: '', title: '', content: '', version: '1.0', language: 'es', status: 'draft', effective_date: '' });
    }
    onOpenChange(v);
  };

  const createMutation = useMutation({
    mutationFn: (data: DocForm) => legalApi.create(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-admin'] });
      notify.success('Documento creado');
      handleOpen(false);
    },
    onError: (e) => notify.error(e, 'Error al crear el documento'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: DocForm) => legalApi.update((editing as any).id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-admin'] });
      notify.success('Documento actualizado');
      handleOpen(false);
    },
    onError: (e) => notify.error(e, 'Error al actualizar el documento'),
  });

  const onSubmit = (data: DocForm) => {
    isEdit ? updateMutation.mutate(data) : createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar documento legal' : 'Nuevo documento legal'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Tipo + Idioma */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de documento <span className="text-destructive">*</span></Label>
              <Select
                defaultValue={editing?.type ?? ''}
                onValueChange={(v) => setValue('type', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tipo…" />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Input {...register('language')} placeholder="es" maxLength={2} />
              {errors.language && <p className="text-xs text-destructive">{errors.language.message}</p>}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label>Título <span className="text-destructive">*</span></Label>
            <Input {...register('title')} placeholder="Ej: Términos y Condiciones de Atlas ERP" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Versión + Estado + Fecha vigencia */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Versión <span className="text-destructive">*</span></Label>
              <Input {...register('version')} placeholder="1.0" />
              {errors.version && <p className="text-xs text-destructive">{errors.version.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                defaultValue={editing?.status ?? 'draft'}
                onValueChange={(v) => setValue('status', v as 'draft' | 'published')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha de vigencia</Label>
              <Input type="date" {...register('effective_date')} />
            </div>
          </div>

          {/* Contenido markdown */}
          <div className="space-y-1.5">
            <Label>
              Contenido{' '}
              <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground ml-1">(Markdown)</span>
            </Label>
            <textarea
              {...register('content')}
              rows={16}
              placeholder="# Título&#10;&#10;Escribe el contenido en formato Markdown..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring min-h-[200px]"
            />
            {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
          </div>

          {status === 'published' && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-600 dark:text-amber-400">
              Al guardar como <strong>Publicado</strong>, la versión anterior del mismo tipo e idioma pasará a Borrador automáticamente.
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function LegalAdminPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<(LegalDocument & { id?: number }) | null>(null);
  const [filterType, setFilterType]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['legal-admin', filterType, filterStatus],
    queryFn: () =>
      legalApi.list({
        type:   filterType   || undefined,
        status: filterStatus || undefined,
      }).then((r) => r.data.data ?? r.data),
  });

  const documents: (LegalDocument & { id: number })[] = (data as any) ?? [];

  const publishMutation = useMutation({
    mutationFn: (id: number) => legalApi.publish(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-admin'] });
      notify.success('Documento publicado');
    },
    onError: (e) => notify.error(e, 'Error al publicar'),
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: number) => legalApi.unpublish(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-admin'] });
      notify.success('Documento despublicado');
    },
    onError: (e) => notify.error(e, 'Error al despublicar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => legalApi.destroy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-admin'] });
      notify.success('Documento eliminado');
    },
    onError: (e) => notify.error(e, 'No se puede eliminar un documento publicado'),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit   = (doc: LegalDocument & { id: number }) => { setEditing(doc); setDialogOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documentos Legales</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona términos, políticas y contratos. Solo el documento <strong>publicado</strong> más reciente de cada tipo es visible públicamente.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-1.5" /> Nuevo documento
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos los tipos</SelectItem>
            {TYPES.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="published">Publicados</SelectItem>
            <SelectItem value="draft">Borradores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Título</th>
              <th className="text-left px-4 py-3 font-medium">Versión</th>
              <th className="text-left px-4 py-3 font-medium">Idioma</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Vigencia</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  No hay documentos legales aún.{' '}
                  <button onClick={openCreate} className="text-primary hover:underline">
                    Crea el primero
                  </button>
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const typeInfo = TYPE_MAP[doc.type];
                const Icon = typeInfo?.icon ?? FileText;
                return (
                  <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium">{typeInfo?.label ?? doc.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="line-clamp-1 font-medium">{doc.title}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      v{doc.version}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs uppercase">{doc.language}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {doc.status === 'published' ? (
                        <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                          <CheckCircle2 className="size-3" /> Publicado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Clock className="size-3" /> Borrador
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {doc.effective_date
                        ? new Date(doc.effective_date).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {/* Ver en público */}
                        {doc.status === 'published' && (
                          <a
                            href={`/legal/${doc.type}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver página pública"
                          >
                            <Globe className="size-4" />
                          </a>
                        )}
                        {/* Publicar / Despublicar */}
                        {doc.status === 'draft' ? (
                          <button
                            onClick={() => publishMutation.mutate(doc.id)}
                            disabled={publishMutation.isPending}
                            className="p-1.5 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-600 transition-colors"
                            title="Publicar"
                          >
                            <Globe className="size-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => unpublishMutation.mutate(doc.id)}
                            disabled={unpublishMutation.isPending}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Despublicar"
                          >
                            <BookLock className="size-4" />
                          </button>
                        )}
                        {/* Editar */}
                        <button
                          onClick={() => openEdit(doc)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="size-4" />
                        </button>
                        {/* Eliminar (solo borradores) */}
                        {doc.status === 'draft' && (
                          <button
                            onClick={() => {
                              if (confirm('¿Eliminar este borrador?')) deleteMutation.mutate(doc.id);
                            }}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <EditorDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
