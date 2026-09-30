import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MessageSquare, BellRing } from 'lucide-react';
import { useContact, type InboxFilter } from '../../api';
import { Button, EmptyState, Spinner, cn } from '../../components/ui';
import { ConversationList } from './ConversationList';
import { ChatPanel } from './ChatPanel';
import { ContactPanel } from './ContactPanel';
import { NewConversationModal } from './NewConversationModal';

const FILTERS: InboxFilter[] = ['all', 'unread', 'vip', 'archived'];

export default function Inbox() {
  const { waId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filterParam = params.get('filter') as InboxFilter | null;
  const filter: InboxFilter = filterParam && FILTERS.includes(filterParam) ? filterParam : 'all';
  const [showDetails, setShowDetails] = useState(() => window.innerWidth >= 1280);
  const [newOpen, setNewOpen] = useState(false);
  const { data: contact, isLoading, error } = useContact(waId);
  const [notifAsked, setNotifAsked] = useState(() => !('Notification' in window) || Notification.permission !== 'default');

  useEffect(() => {
    if (window.innerWidth < 1280) setShowDetails(false);
  }, [waId]);

  return (
    <div className="h-full flex overflow-hidden bg-white">
      <div className={cn('w-full md:w-[340px] lg:w-[360px] flex-shrink-0 border-r border-slate-200', waId ? 'hidden md:flex md:flex-col' : 'flex flex-col')}>
        <ConversationList
          activeWaId={waId}
          filter={filter}
          onFilter={f => setParams(f === 'all' ? {} : { filter: f }, { replace: true })}
          onNew={() => setNewOpen(true)}
        />
      </div>

      <div className={cn('flex-1 min-w-0', waId ? 'flex flex-col' : 'hidden md:flex md:flex-col')}>
        {!waId ? (
          <div className="flex-1 flex items-center justify-center chat-wallpaper">
            <div className="bg-white/90 rounded-3xl p-2 shadow-sm max-w-md">
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                body="Pick a chat on the left, or start a new one with an approved template."
                action={
                  <div className="flex flex-col items-center gap-3">
                    <Button onClick={() => setNewOpen(true)}>New conversation</Button>
                    {!notifAsked && (
                      <button
                        className="text-xs font-semibold text-primary flex items-center gap-1.5 hover:underline"
                        onClick={() => Notification.requestPermission().finally(() => setNotifAsked(true))}
                      >
                        <BellRing size={13} /> Enable desktop notifications
                      </button>
                    )}
                  </div>
                }
              />
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center"><Spinner /></div>
        ) : error || !contact ? (
          <EmptyState icon={MessageSquare} title="Conversation not found" body="It may have been deleted." action={<Button variant="secondary" onClick={() => navigate('/inbox')}>Back to inbox</Button>} />
        ) : (
          <ChatPanel contact={contact} onBack={() => navigate('/inbox')} onToggleDetails={() => setShowDetails(s => !s)} />
        )}
      </div>

      {contact && showDetails && (
        <>
          <div className="fixed inset-0 bg-slate-900/30 z-30 xl:hidden" onClick={() => setShowDetails(false)} />
          <div className="fixed right-0 inset-y-0 z-40 w-[340px] max-w-full shadow-2xl xl:shadow-none xl:static xl:z-auto border-l border-slate-200 flex-shrink-0">
            <ContactPanel contact={contact} onClose={() => setShowDetails(false)} />
          </div>
        </>
      )}

      <NewConversationModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
