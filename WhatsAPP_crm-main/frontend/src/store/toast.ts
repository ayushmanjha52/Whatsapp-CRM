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

export const toast = {
  success: (title: string, body?: string) => useToasts.getState().push({ tone: 'success', title, body }),
  error: (title: string, body?: string) => useToasts.getState().push({ tone: 'error', title, body }, 6000),
  info: (title: string, body?: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'info', title, body, action }, 8000)
};
