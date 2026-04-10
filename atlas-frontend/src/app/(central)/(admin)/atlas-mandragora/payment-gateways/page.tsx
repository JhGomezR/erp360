'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import { paymentGatewaysApi } from '@/lib/api/central.api';
import type { PaymentGateway } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, Pencil, Trash2, Plus } from 'lucide-react';

const gwSchema = z.object({
  gateway:          z.literal('wompi'),
  is_sandbox:       z.boolean(),
  public_key:       z.string().min(10, 'Llave pública requerida'),
  private_key:      z.string().min(10, 'Llave privada requerida'),
  events_secret:    z.string().min(10, 'Secreto de eventos requerido'),
  integrity_secret: z.string().min(10, 'Secreto de integridad requerido'),
});

type GwForm = z.infer<typeof gwSchema>;

export default function PaymentGatewaysPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PaymentGateway | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: gateways = [], isLoading } = useQuery<PaymentGateway[]>({
    queryKey: ['payment-gateways'],
    queryFn: () => paymentGatewaysApi.list().then((r) => r.data),
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<GwForm>({
    resolver: zodResolver(gwSchema),
    defaultValues: { gateway: 'wompi', is_sandbox: true },
  });

  const isSandbox = watch('is_sandbox');

  const saveMutation = useMutation({
    mutationFn: (data: GwForm) =>
      editing
        ? paymentGatewaysApi.update(editing.id, data)
        : paymentGatewaysApi.save(data),
    onSuccess: () => {
      notify.success(editing ? 'Pasarela actualizada.' : 'Pasarela configurada.');
      qc.invalidateQueries({ queryKey: ['payment-gateways'] });
      setShowForm(false);
      setEditing(null);
      reset({ gateway: 'wompi', is_sandbox: true });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => paymentGatewaysApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-gateways'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => paymentGatewaysApi.destroy(id),
    onSuccess: () => {
      notify.success('Pasarela eliminada.');
      qc.invalidateQueries({ queryKey: ['payment-gateways'] });
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  function openCreate() {
    setEditing(null);
    reset({ gateway: 'wompi', is_sandbox: true, public_key: '', private_key: '', events_secret: '', integrity_secret: '' });
    setShowForm(true);
  }

  function openEdit(gw: PaymentGateway) {
    setEditing(gw);
    reset({
      gateway: 'wompi',
      is_sandbox: gw.is_sandbox,
      public_key: gw.public_key,
      private_key: '',
      events_secret: '',
      integrity_secret: '',
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pasarelas de pago</h1>
          <p className="text-sm text-muted-foreground">Configura las llaves de Wompi para procesar suscripciones y add-ons</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4 mr-2" /> Nueva configuración
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : gateways.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No hay pasarelas configuradas aún.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {gateways.map((gw) => (
            <Card key={gw.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className={`size-5 mt-0.5 ${gw.is_active ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold capitalize">{gw.gateway}</span>
                      <Badge variant={gw.is_sandbox ? 'secondary' : 'default'}>
                        {gw.is_sandbox ? 'Sandbox' : 'Producción'}
                      </Badge>
                      {gw.is_active && <Badge variant="outline" className="text-green-600 border-green-500">Activa</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      Pública: {gw.public_key}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      Privada: {gw.private_key_hint} · Eventos: {gw.events_secret_hint} · Integridad: {gw.integrity_secret_hint}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={gw.is_active}
                    onCheckedChange={() => toggleMutation.mutate(gw.id)}
                  />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(gw)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => { if (confirm('¿Eliminar esta configuración?')) deleteMutation.mutate(gw.id); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editing ? 'Editar configuración Wompi' : 'Nueva configuración Wompi'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">

              {/* Ambiente */}
              <div className="flex items-center gap-3">
                <Switch
                  id="is_sandbox"
                  checked={isSandbox}
                  onCheckedChange={(v) => setValue('is_sandbox', v)}
                />
                <Label htmlFor="is_sandbox">
                  {isSandbox ? 'Sandbox (pruebas)' : 'Producción (dinero real)'}
                </Label>
              </div>

              <div className="space-y-2">
                <Label>Llave pública <span className="text-xs text-muted-foreground">(pub_test_… / pub_prod_…)</span></Label>
                <Input placeholder="pub_test_…" {...register('public_key')} />
                {errors.public_key && <p className="text-xs text-destructive">{errors.public_key.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Llave privada <span className="text-xs text-muted-foreground">(prv_test_… / prv_prod_…)</span></Label>
                <Input type="password" placeholder={editing ? '(dejar vacío para no cambiar)' : 'prv_test_…'} {...register('private_key')} />
                {errors.private_key && <p className="text-xs text-destructive">{errors.private_key.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Secreto de eventos <span className="text-xs text-muted-foreground">(test_events_… / prod_events_…)</span></Label>
                <Input type="password" placeholder={editing ? '(dejar vacío para no cambiar)' : 'test_events_…'} {...register('events_secret')} />
                {errors.events_secret && <p className="text-xs text-destructive">{errors.events_secret.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Secreto de integridad <span className="text-xs text-muted-foreground">(test_integrity_… / prod_integrity_…)</span></Label>
                <Input type="password" placeholder={editing ? '(dejar vacío para no cambiar)' : 'test_integrity_…'} {...register('integrity_secret')} />
                {errors.integrity_secret && <p className="text-xs text-destructive">{errors.integrity_secret.message}</p>}
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditing(null); }}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Guardando…' : 'Guardar configuración'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
