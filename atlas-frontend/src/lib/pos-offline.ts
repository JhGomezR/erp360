/**
 * POS Offline Queue
 * ─────────────────────────────────────────────────────────────────────────────
 * When the device goes offline, sales are stored in localStorage and synced
 * automatically when connectivity is restored.
 *
 * Storage key: `atlas_pos_offline_queue_<slug>`
 *
 * Each entry:
 *   {
 *     id: string,          // uuid v4-like generated locally
 *     slug: string,
 *     payload: SalePayload,
 *     createdAt: string,
 *     status: 'pending' | 'synced' | 'failed',
 *     error?: string,
 *   }
 */

export interface OfflineSaleItem {
  product_id: number;
  fraction_id?: number;
  quantity: number;
  unit_price: number;
}

export interface OfflineSalePayload {
  items: OfflineSaleItem[];
  payment_method: string;
  discount?: number;
  notes?: string;
}

export interface OfflineQueueEntry {
  id: string;
  slug: string;
  payload: OfflineSalePayload;
  createdAt: string;
  status: 'pending' | 'synced' | 'failed';
  error?: string;
  syncedSaleCode?: string;
}

function storageKey(slug: string) {
  return `atlas_pos_offline_queue_${slug}`;
}

function generateId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getQueue(slug: string): OfflineQueueEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as OfflineQueueEntry[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(slug: string, queue: OfflineQueueEntry[]): void {
  localStorage.setItem(storageKey(slug), JSON.stringify(queue));
}

export function enqueue(slug: string, payload: OfflineSalePayload): OfflineQueueEntry {
  const queue = getQueue(slug);
  const entry: OfflineQueueEntry = {
    id: generateId(),
    slug,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  queue.push(entry);
  saveQueue(slug, queue);
  return entry;
}

export function pendingCount(slug: string): number {
  return getQueue(slug).filter((e) => e.status === 'pending').length;
}

export function clearSynced(slug: string): void {
  const queue = getQueue(slug).filter((e) => e.status !== 'synced');
  saveQueue(slug, queue);
}

/**
 * Sync all pending entries against the live API.
 * Returns how many were successfully synced.
 */
export async function syncQueue(
  slug: string,
  createSaleFn: (payload: OfflineSalePayload) => Promise<{ data: { code: string } }>,
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  const queue = getQueue(slug);
  const pending = queue.filter((e) => e.status === 'pending');

  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      const res = await createSaleFn(entry.payload);
      const idx = queue.findIndex((e) => e.id === entry.id);
      if (idx !== -1) {
        queue[idx].status          = 'synced';
        queue[idx].syncedSaleCode  = res.data.code;
        delete queue[idx].error;
      }
      synced++;
    } catch (err: unknown) {
      const idx = queue.findIndex((e) => e.id === entry.id);
      if (idx !== -1) {
        queue[idx].status = 'failed';
        queue[idx].error  = err instanceof Error ? err.message : 'Error desconocido';
      }
      failed++;
    }
    saveQueue(slug, queue);
    onProgress?.(synced, pending.length);
  }

  return { synced, failed };
}
