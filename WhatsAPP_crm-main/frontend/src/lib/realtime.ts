import { io, type Socket } from 'socket.io-client';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from './api';
import type { Message, Task } from './types';

export type RealtimeEvent = {
  event: string;
  wa_id?: string;
  message?: Partial<Message> & { id: string };
  campaign_id?: number;
  deal_id?: number;
  task?: Task;
  inbound?: boolean;
  deleted?: boolean;
  ts?: number;
};

type Listener = (e: RealtimeEvent) => void;

let socket: Socket | null = null;
const listeners = new Set<Listener>();
const statusListeners = new Set<(connected: boolean) => void>();

export function connectRealtime(): Socket {
  if (socket) return socket;
  socket = io(API_BASE_URL || window.location.origin, {
    path: '/socket.io/',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  });
  socket.on('event', (e: RealtimeEvent) => listeners.forEach(l => l(e)));
  socket.on('connect', () => statusListeners.forEach(l => l(true)));
  socket.on('disconnect', () => statusListeners.forEach(l => l(false)));
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

export function onRealtime(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onConnectionChange(fn: (connected: boolean) => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export type MessagesPage = { messages: Message[]; has_more: boolean };

/** Adds or merges a message into the cached conversation, keyed by id. */
export function upsertMessage(qc: QueryClient, waId: string, msg: Partial<Message> & { id: string }) {
  qc.setQueryData<InfiniteData<MessagesPage>>(['messages', waId], data => {
    if (!data) return data;
    let found = false;
    const pages = data.pages.map(p => ({
      ...p,
      messages: p.messages.map(m => {
        if (m.id !== msg.id) return m;
        found = true;
        return { ...m, ...stripUndefined(msg) } as Message;
      })
    }));
    if (!found && isFullMessage(msg)) {
      pages[0] = { ...pages[0], messages: [...pages[0].messages, msg as Message] };
    }
    return { ...data, pages };
  });
}

function isFullMessage(m: Partial<Message>): boolean {
  return !!(m.id && m.direction && m.created_at);
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Keeps cached server state fresh as events arrive. */
export function applyRealtimeEvent(qc: QueryClient, e: RealtimeEvent) {
  switch (e.event) {
    case 'message.created':
    case 'message.updated':
      if (e.wa_id && e.message) upsertMessage(qc, e.wa_id, e.message);
      if (e.event === 'message.created') qc.invalidateQueries({ queryKey: ['conversations'] });
      break;
    case 'conversation.updated':
    case 'contact.updated':
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      if (e.wa_id) qc.invalidateQueries({ queryKey: ['contact', e.wa_id] });
      if (e.deleted && e.wa_id) qc.removeQueries({ queryKey: ['messages', e.wa_id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      break;
    case 'deal.created':
    case 'deal.updated':
    case 'deal.deleted':
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      break;
    case 'campaign.updated':
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      if (e.campaign_id) qc.invalidateQueries({ queryKey: ['campaign', e.campaign_id] });
      break;
    case 'template.updated':
      qc.invalidateQueries({ queryKey: ['templates'] });
      break;
    case 'task.updated':
    case 'task.due':
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      break;
  }
}
