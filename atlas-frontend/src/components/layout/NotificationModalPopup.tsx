'use client';

import { useNotificationStore } from '@/store/notificationStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Info, AlertTriangle, CreditCard, Settings } from 'lucide-react';

const TYPE_ICON: Record<string, React.ReactNode> = {
  info:    <Info className="h-5 w-5 text-blue-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  billing: <CreditCard className="h-5 w-5 text-red-500" />,
  system:  <Settings className="h-5 w-5 text-muted-foreground" />,
};

const TYPE_BORDER: Record<string, string> = {
  info:    'border-blue-200 dark:border-blue-800',
  warning: 'border-amber-200 dark:border-amber-800',
  billing: 'border-red-200 dark:border-red-800',
  system:  'border-border',
};

export function NotificationModalPopup() {
  const { pendingModal, setPendingModal } = useNotificationStore();

  if (!pendingModal) return null;

  const icon   = TYPE_ICON[pendingModal.type] ?? <Bell className="h-5 w-5 text-primary" />;
  const border = TYPE_BORDER[pendingModal.type] ?? 'border-border';

  return (
    <Dialog open onOpenChange={(open) => !open && setPendingModal(null)}>
      <DialogContent className={`sm:max-w-md border-2 ${border}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base">
            {icon}
            {pendingModal.title}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {pendingModal.body}
        </p>

        <DialogFooter>
          <Button className="w-full" onClick={() => setPendingModal(null)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
