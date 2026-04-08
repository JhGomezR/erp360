'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/axios';
import { parseApiError } from '@/lib/notify';

interface ImageUploadProps {
  /** URL actual de la imagen (persistida en el servidor) */
  value?: string;
  /** Callback con la nueva URL tras subida exitosa */
  onChange: (url: string) => void;
  /**
   * Función de subida personalizada (ej. tenant media).
   * Recibe el File original — el servidor se encarga de convertir a WebP.
   */
  uploadFn?: (file: File) => Promise<{ url: string }>;
  /** Categoría para el endpoint central: 'branding' | 'general' | 'users' */
  category?: 'branding' | 'general' | 'users';
  label?: string;
  className?: string;
  disabled?: boolean;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function ImageUpload({
  value,
  onChange,
  uploadFn,
  category = 'branding',
  label = 'Arrastra una imagen o haz clic para seleccionar',
  className,
  disabled = false,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(null); // preview local inmediato
  const [error, setError]         = useState<string | null>(null);
  const [dragging, setDragging]   = useState(false);

  const upload = useCallback(async (file: File) => {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Solo se permiten imágenes JPG, PNG, GIF, WebP o BMP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('La imagen no puede superar 5 MB.');
      return;
    }

    // Preview inmediato — el usuario ve la imagen antes de que termine la subida
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);

    try {
      let url: string;

      if (uploadFn) {
        const result = await uploadFn(file);
        url = result.url;
      } else {
        const form = new FormData();
        form.append('file', file);
        form.append('category', category);
        const { data } = await apiClient.post<{ url: string }>(
          '/media/central/upload',
          form,
          { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }
        );
        url = data.url;
      }

      // Reemplazar preview local por URL definitiva del servidor
      URL.revokeObjectURL(localUrl);
      setPreview(null);
      onChange(url);
    } catch (err: unknown) {
      URL.revokeObjectURL(localUrl);
      setPreview(null);
      setError(parseApiError(err, 'Error al subir la imagen. Intenta de nuevo.'));
    } finally {
      setUploading(false);
    }
  }, [uploadFn, category, onChange]);

  const handleFile = (file: File | undefined) => { if (file) upload(file); };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    handleFile(e.dataTransfer.files[0]);
  }, [disabled, uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // La imagen a mostrar: preview local (inmediato) o URL del servidor (persistida)
  const displayImage = preview ?? value;

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !uploading) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors min-h-[140px] cursor-pointer select-none',
          dragging  && 'border-primary bg-primary/5',
          !dragging && 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {/* Imagen (preview local o URL del servidor) */}
        {displayImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayImage} alt="Preview" className="max-h-32 max-w-full rounded object-contain" />

            {/* Indicador de subida sobre la imagen */}
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/50 gap-2">
                <Loader2 className="size-6 animate-spin text-white" />
                <span className="text-xs text-white font-medium">Guardando…</span>
              </div>
            )}

            {/* Botón quitar — solo cuando no está subiendo */}
            {!uploading && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute top-1.5 right-1.5 rounded-full bg-destructive/90 p-0.5 text-destructive-foreground hover:bg-destructive"
                aria-label="Quitar imagen"
              >
                <X className="size-3.5" />
              </button>
            )}
          </>
        ) : (
          /* Estado vacío */
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <div className="rounded-full bg-muted p-3">
              <ImageIcon className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                JPG, PNG, GIF, WebP, BMP · máx 5 MB · se guarda como WebP
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Upload className="size-3.5" /> Seleccionar archivo
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <X className="size-3.5 shrink-0" /> {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
