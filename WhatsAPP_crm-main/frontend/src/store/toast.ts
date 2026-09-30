import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t, ms = 4000) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    if (ms > 0) setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: id => set({ toasts: get().toasts.filter(t => t.id !== id) })
}));

/** Set by the app shell so toasts can link to routes (e.g. billing) without a router hook. */
let navigateTo: ((path: string) => void) | null = null;
export function setToastNavigator(fn: (path: string) => void) {
  navigateTo = fn;
}

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ tone: 'success', title, body }),
  error: (title: string, body?: string) => {
    // Plan limits get a direct path to upgrading.
    const upgrade = body && /upgrade/i.test(body) && navigateTo ? { label: 'See plans', onClick: () => navigateTo!('/settings?tab=billing') } : undefined;
    useToasts.getState().push({ tone: 'error', title, body, action: upgrade }, upgrade ? 9000 : 6000);
  },
  info: (title: string, body?: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'info', title, body, action }, 8000)
};
