import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, MessageSquare, Kanban, Radio, Settings, LogOut, Bell, ChevronLeft, ChevronRight,
  Users, FileText, Clock, CheckCircle2, WifiOff, Menu, X
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { applyRealtimeEvent, connectRealtime, onConnectionChange, onRealtime } from '../lib/realtime';
import { setToastNavigator, toast } from '../store/toast';
import { updateTask, useConversations, useTasks, useWhatsAppStatus } from '../api';
import { Avatar, Badge, cn } from './ui';
import { relativeFromNow } from '../lib/format';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inbox', label: 'Inbox', icon: MessageSquare, badge: 'unread' as const },
  { to: '/pipeline', label: 'Pipeline', icon: Kanban },
  { to: '/broadcast', label: 'Broadcast', icon: Radio },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/templates', label: 'Templates', icon: FileText }
];

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard', inbox: 'Inbox', pipeline: 'Pipeline', broadcast: 'Broadcast', contacts: 'Contacts', templates: 'Templates', settings: 'Settings'
};

/** Applies realtime events to the cache and surfaces the ones a person should notice. */
function useRealtimeBridge() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;
  const [connected, setConnected] = useState(true);

  useEffect(() => setToastNavigator(navigate), [navigate]);

  useEffect(() => {
    connectRealtime();
    let wasDisconnected = false;
    const offStatus = onConnectionChange(ok => {
      setConnected(ok);
      if (!ok) wasDisconnected = true;
      else if (wasDisconnected) {
        // Catch up on anything missed while offline.
        qc.invalidateQueries();
        wasDisconnected = false;
      }
    });
    const off = onRealtime(e => {
      applyRealtimeEvent(qc, e);
      if (e.event === 'message.created' && e.message?.direction === 'in' && e.wa_id) {
        const viewing = path.current === `/inbox/${e.wa_id}`;
        if (!viewing || document.hidden) {
          const waId = e.wa_id;
          const text = e.message.text || 'New message';
          toast.info('New WhatsApp message', text, { label: 'Open chat', onClick: () => navigate(`/inbox/${waId}`) });
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('New WhatsApp message', { body: text, tag: waId });
          }
        }
      }
      if (e.event === 'task.due' && e.task) {
        const t = e.task;
        toast.info('Reminder due', t.title + (t.contact ? ` · ${t.contact.name}` : ''), t.contact ? { label: 'Open chat', onClick: () => navigate(`/inbox/${t.contact!.wa_id}`) } : undefined);
      }
    });
    return () => {
      off();
      offStatus();
    };
  }, [qc, navigate]);

  return connected;
}

const NotificationsBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const { data: tasks = [] } = useTasks({ status: 'open', due_before: endOfToday.toISOString(), limit: 20 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="relative p-2 rounded-xl text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors" aria-label="Reminders">
        <Bell size={20} />
        {tasks.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full ring-2 ring-white" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="font-display font-bold text-sm text-slate-900">Due today</p>
            <Badge tone={tasks.length ? 'amber' : 'green'}>{tasks.length} open</Badge>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">You're all caught up.</p>
            ) : (
              tasks.map(t => {
                const overdue = new Date(t.due_at).getTime() < Date.now();
                return (
                  <div key={t.id} className="px-4 py-3 border-b border-slate-50 flex items-start gap-3 hover:bg-slate-50">
                    <button
                      className="mt-0.5 text-slate-300 hover:text-emerald-500"
                      aria-label="Mark done"
                      onClick={async () => {
                        await updateTask(t.id, { completed: true });
                        qc.invalidateQueries({ queryKey: ['tasks'] });
                        qc.invalidateQueries({ queryKey: ['dashboard'] });
                      }}
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => {
                        if (t.contact) navigate(`/inbox/${t.contact.wa_id}`);
                        setOpen(false);
                      }}
                    >
                      <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                      <p className={cn('text-xs flex items-center gap-1 mt-0.5', overdue ? 'text-danger' : 'text-slate-400')}>
                        <Clock size={11} /> {relativeFromNow(t.due_at)}
                        {t.contact && <span className="text-slate-400 truncate">· {t.contact.name}</span>}
                      </p>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const connected = useRealtimeBridge();
  const { data: unreadData } = useConversations('unread', '');
  const unread = unreadData?.pages[0]?.counts.unread ?? 0;
  const { data: wa } = useWhatsAppStatus();
  const section = location.pathname.split('/')[1] || 'dashboard';

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) WhatsApp CRM` : 'WhatsApp CRM';
  }, [unread]);
  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  const item = (to: string, label: string, Icon: React.ElementType, badge?: number) => (
    <NavLink
      key={to}
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center rounded-xl transition-all duration-200 group h-11',
          collapsed ? 'justify-center px-2' : 'gap-3 px-4',
          isActive ? 'bg-primary text-white shadow-glow' : 'text-slate-400 hover:bg-white/5 hover:text-white'
        )
      }
    >
      <Icon size={20} className="flex-shrink-0" />
      {!collapsed && <span className="font-medium text-sm">{label}</span>}
      {!!badge && (
        <span className={cn('min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center', collapsed ? 'absolute top-1 right-1' : 'ml-auto')}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && <div className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={cn(
          'bg-sidebar flex flex-col flex-shrink-0 z-40 transition-all duration-300 border-r border-slate-800',
          'fixed inset-y-0 left-0 lg:static',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-20 w-64' : 'w-64'
        )}
      >
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex absolute -right-3 top-8 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-full p-1 shadow-lg z-50"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        <div className="p-4 flex flex-col h-full">
          <div className={cn('flex items-center text-white mb-8 mt-2 h-10', collapsed ? 'lg:justify-center gap-3' : 'gap-3')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
              <MessageSquare size={20} className="text-white" />
            </div>
            <span className={cn('font-display font-bold text-lg tracking-tight whitespace-nowrap', collapsed && 'lg:hidden')}>WhatsApp CRM</span>
            <button className="ml-auto lg:hidden text-slate-400" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
          </div>
          <nav className="space-y-1 flex-1">{NAV.map(n => item(n.to, n.label, n.icon, n.badge ? unread : undefined))}</nav>
          <div className="pt-4 border-t border-slate-800 space-y-1">
            {item('/settings', 'Settings', Settings)}
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              title={collapsed ? 'Log out' : undefined}
              className={cn('w-full flex items-center h-11 rounded-xl text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}
            >
              <LogOut size={20} />
              {!collapsed && <span className="font-medium text-sm">Log out</span>}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-screen">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-4 lg:px-8 flex-shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button className="lg:hidden p-2 -ml-2 text-slate-500" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <h1 className="font-display font-bold text-xl text-slate-900 truncate">{TITLES[section] || 'WhatsApp CRM'}</h1>
            {!connected && (
              <Badge tone="amber" className="hidden sm:inline-flex">
                <WifiOff size={11} /> Reconnecting
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 lg:gap-5">
            {wa && !wa.connected && user?.role === 'admin' && (
              <button onClick={() => navigate('/settings?tab=whatsapp')} className="hidden md:inline-flex text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100">
                Connect WhatsApp to start messaging →
              </button>
            )}
            <NotificationsBell />
            <button onClick={() => navigate('/settings')} className="flex items-center gap-3 pl-3 lg:pl-5 border-l border-slate-200">
              <div className="text-right hidden md:block leading-tight">
                <p className="text-sm font-bold text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500 capitalize">{user?.role}{user?.tenant_name ? ` · ${user.tenant_name}` : ''}</p>
              </div>
              <Avatar name={user?.name || user?.email || '?'} size={36} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
