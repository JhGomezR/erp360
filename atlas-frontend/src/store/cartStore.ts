import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product } from '@/types';

interface CartState {
  items: CartItem[];
  tenantSlug: string | null;

  // Actions
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  setTenant: (slug: string) => void;

  // Computed
  subtotal: () => number;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      tenantSlug: null,

      addItem: (product, quantity = 1) => {
        const items = get().items;
        const existing = items.find((i) => i.product.id === product.id);

        if (existing) {
          set({
            items: items.map((i) =>
              i.product.id === product.id
                ? { ...i, quantity: i.quantity + quantity, subtotal: (i.quantity + quantity) * i.unit_price }
                : i
            ),
          });
        } else {
          set({
            items: [
              ...items,
              {
                product,
                quantity,
                unit_price: product.price,
                subtotal: product.price * quantity,
              },
            ],
          });
        }
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.product.id !== productId) });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.product.id === productId
              ? { ...i, quantity, subtotal: quantity * i.unit_price }
              : i
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      setTenant: (slug) => set({ tenantSlug: slug }),

      subtotal: () => get().items.reduce((acc, i) => acc + i.subtotal, 0),

      total: () => get().subtotal(),

      itemCount: () => get().items.reduce((acc, i) => acc + i.quantity, 0),
    }),
    {
      name: 'atlas-cart',
    }
  )
);
