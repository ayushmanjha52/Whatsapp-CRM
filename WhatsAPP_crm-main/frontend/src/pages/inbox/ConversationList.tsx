import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Inbox as InboxIcon, Loader2 } from 'lucide-react';
import { useConversations, type InboxFilter } from '../../api';
import { Avatar, Badge, EmptyState, IconButton, MessageStatusIcon, Segmented, Spinner, cn, tagTone } from '../../components/ui';
import { listTime } from '../../lib/format';
import type { Contact } from '../../lib/types';

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const Row: React.FC<{ c: Contact; active: boolean; onClick: () => void }> = ({ c, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full text-left px-4 py-3.5 flex gap-3 border-b border-slate-100 transition-colors relative',
      active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
    )}
  >
    {active && <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />}
    <div className="relative">
      <Avatar name={c.name} src={c.avatar_url} size={44} />
      {c.window_open && <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" title="Reply window open" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn('truncate text-sm', c.unread_count ? 'font-bold text-slate-900' : 'font-semibold text-slate-800', active && 'text-primary')}>{c.name}</p>
        <span className={cn('text-[11px] whitespace-nowrap', c.unread_count ? 'text-primary font-bold' : 'text-slate-400')}>{listTime(c.last_message_at)}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <p className={cn('text-xs truncate flex-1 flex items-center gap-1', c.unread_count ? 'text-slate-800 font-medium' : 'text-slate-500')}>
          {c.last_message_direction === 'out' && <MessageStatusIcon status="sent" className="flex-shrink-0 text-slate-400" />}
          <span className="truncate">{c.last_message_preview || <span className="italic text-slate-400">No messages yet</span>}</span>
        </p>
        {c.unread_count > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{c.unread_count}</span>
        )}
      </div>
      {(c.deal || c.tags.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {c.deal?.stage_name && <Badge tone="violet">{c.deal.stage_name}</Badge>}
          {c.tags.slice(0, 3).map(t => <Badge key={t} tone={tagTone(t)} className="normal-case">{t}</Badge>)}
        </div>
      )}
    </div>
  </button>
);

export const ConversationList: React.FC<{ activeWaId?: string; filter: InboxFilter; onFilter: (f: InboxFilter) => void; onNew: () => void }> = ({ activeWaId, filter, onFilter, onNew }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const { data, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversations(filter, q);
  const rows = data?.pages.flatMap(p => p.conversations) ?? [];
  const unread = data?.pages[0]?.counts.unread ?? 0;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 space-y-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
            Chats {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-slate-300" />}
          </h2>
          <IconButton icon={Plus} label="New conversation" onClick={onNew} className="text-primary bg-blue-50 hover:bg-blue-100 hover:text-primary" />
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, number or company"
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-transparent focus:border-primary/30 focus:bg-white rounded-xl text-sm outline-none"
          />
        </div>
        <Segmented
          className="w-full [&>button]:flex-1"
          value={filter}
          onChange={onFilter}
          options={[
            { value: 'all', label: 'All' },
            {
              value: 'unread',
              label: (
                <span className="inline-flex items-center gap-1">
                  Unread{unread > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[9px] leading-4">{unread}</span>}
                </span>
              )
            },
            { value: 'vip', label: 'VIP' },
            { value: 'archived', label: 'Archived' }
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={q ? 'No matches' : filter === 'all' ? 'No conversations yet' : `No ${filter} conversations`}
            body={q ? 'Try a different name or number.' : filter === 'all' ? 'When customers message your WhatsApp number, their chats appear here.' : undefined}
          />
        ) : (
          <>
            {rows.map(c => (
              <Row key={c.wa_id} c={c} active={c.wa_id === activeWaId} onClick={() => navigate(`/inbox/${c.wa_id}${filter !== 'all' ? `?filter=${filter}` : ''}`)} />
            ))}
            {hasNextPage && (
              <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="w-full py-3 text-xs font-bold text-primary hover:bg-slate-50">
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
