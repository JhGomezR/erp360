"use client";

/**
 * AlertDialog — confirmación destructiva con Base UI.
 * API compatible con el patrón shadcn/Radix para que las páginas existentes funcionen sin cambios.
 */

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Root ─────────────────────────────────────────────────────────────────────

function AlertDialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

// ─── Content ──────────────────────────────────────────────────────────────────

function AlertDialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2",
          "rounded-xl bg-background p-6 text-sm shadow-lg ring-1 ring-foreground/10",
          "duration-100 outline-none",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          "sm:max-w-md",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

// ─── Header / Title / Description ────────────────────────────────────────────

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 mb-4", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

// ─── Footer / Actions ─────────────────────────────────────────────────────────

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-6", className)}
      {...props}
    />
  );
}

function AlertDialogCancel({ className, children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <DialogPrimitive.Close render={<Button variant="outline" className={className} {...props} />}>
      {children ?? "Cancelar"}
    </DialogPrimitive.Close>
  );
}

/** Botón de acción — NO cierra el dialog automáticamente. variant por defecto: destructive. */
function AlertDialogAction({ className, children, onClick, variant = 'destructive', ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant={variant}
      className={cn("gap-2", className)}
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
};
