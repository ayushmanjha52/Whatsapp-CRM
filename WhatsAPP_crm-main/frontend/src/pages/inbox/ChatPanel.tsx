import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Paperclip, Send, Smile, PanelRightOpen, FileText, X, Lock, Radio, Loader2 } from 'lucide-react';
import { markRead, sendMessage, uploadMedia, useMessages } from '../../api';
import { Avatar, Button, IconButton, Spinner, cn } from '../../components/ui';
import { dayLabel, windowRemaining } from '../../lib/format';
import { errorMessage } from '../../lib/api';
import { upsertMessage } from '../../lib/realtime';
import { toast } from '../../store/toast';
import type { Contact, Message } from '../../lib/types';
import { MessageBubble } from './MessageBubble';
import { TemplateSendModal } from './TemplateSendModal';

const EMOJI = ['👍', '🙏', '😊', '😂', '❤️', '🎉', '✅', '👋', '🙌', '🔥', '😍', '🤝', '📞', '📦', '💬', '⏰', '👌', '😅', '🚀', '💯'];

type Pending = { file: File; preview?: string };

const Composer: React.FC<{ contact: Contact; onTemplate: () => void }> = ({ contact, onTemplate }) => {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    setText('');
    setPending(null);
    ref.current?.focus();
  }, [contact.wa_id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [text]);

  if (!contact.window_open) {
    return (
      <div className="p-4 border-t border-slate-100 bg-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
          <Lock size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            {contact.last_inbound_at
              ? "The 24-hour reply window has closed. WhatsApp only allows an approved template until the customer writes back."
              : "This contact hasn't messaged you yet. Start the conversation with an approved template."}
          </p>
          <Button size="sm" variant="dark" icon={Radio} onClick={onTemplate}>Send template</Button>
        </div>
      </div>
    );
  }

  const send = async () => {
    const body = text.trim();
    if ((!body && !pending) || busy) return;
    setBusy(true);
    try {
      let res;
      if (pending) {
        const up = await uploadMedia(pending.file);
        res = await sendMessage(contact.wa_id, { type: 'media', kind: up.kind, url: up.url, caption: body || undefined, filename: up.kind === 'document' ? pending.file.name : undefined });
      } else {
        res = await sendMessage(contact.wa_id, { type: 'text', text: body });
      }
      upsertMessage(qc, contact.wa_id, res.message);
      setText('');
      if (pending?.preview) URL.revokeObjectURL(pending.preview);
      setPending(null);
    } catch (e) {
      toast.error('Message not sent', errorMessage(e));
    } finally {
      setBusy(false);
      ref.current?.focus();
    }
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) return toast.error('File too large', 'WhatsApp allows up to 100 MB.');
    setPending({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined });
  };

  const remaining = windowRemaining(contact.last_inbound_at);

  return (
    <div className="p-3 border-t border-slate-100 bg-white">
      {pending && (
        <div className="mb-2 flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-200">
          {pending.preview ? <img src={pending.preview} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <FileText className="text-primary m-2" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{pending.file.name}</p>
            <p className="text-xs text-slate-400">{(pending.file.size / 1024 / 1024).toFixed(1)} MB · add a caption below (optional)</p>
          </div>
          <IconButton icon={X} label="Remove attachment" onClick={() => setPending(null)} />
        </div>
      )}
      <div
        className="flex items-end gap-1 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 focus-within:border-primary/40 focus-within:bg-white transition"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="relative">
          <IconButton icon={Smile} label="Emoji" onClick={() => setEmojiOpen(o => !o)} />
          {emojiOpen && (
            <div className="absolute bottom-11 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl p-2 grid grid-cols-5 gap-1 w-52" onMouseLeave={() => setEmojiOpen(false)}>
              {EMOJI.map(e => (
                <button
                  key={e}
                  className="text-xl p-1 rounded hover:bg-slate-100"
                  onClick={() => {
                    setText(t => t + e);
                    ref.current?.focus();
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <IconButton icon={Paperclip} label="Attach file" onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={e => {
            const f = Array.from(e.clipboardData.files)[0];
            if (f) {
              e.preventDefault();
              pick(f);
            }
          }}
          placeholder={pending ? 'Add a caption…' : 'Type a message'}
          className="flex-1 resize-none bg-transparent outline-none text-sm py-2 px-1 max-h-40"
        />
        <IconButton icon={Radio} label="Send template" onClick={onTemplate} />
        <button
          onClick={send}
          disabled={busy || (!text.trim() && !pending)}
          className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary-hover transition"
          aria-label="Send"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      {remaining && <p className="text-[11px] text-slate-400 mt-1.5 px-2">Reply window closes in {remaining} · Enter to send, Shift+Enter for a new line</p>}
    </div>
  );
};

export const ChatPanel: React.FC<{ contact: Contact; onBack: () => void; onToggleDetails: () => void }> = ({ contact, onBack, onToggleDetails }) => {
  const qc = useQueryClient();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(contact.wa_id);
  const [templateOpen, setTemplateOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const prevHeight = useRef<number | null>(null);
  const lastId = useRef<string | null>(null);

  const messages: Message[] = useMemo(() => (data ? [...data.pages].reverse().flatMap(p => p.messages) : []), [data]);

  // Keep the view anchored when older history is prepended; stick to the bottom for new messages.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || messages.length === 0) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
      return;
    }
    const newest = messages[messages.length - 1];
    if (newest.id !== lastId.current) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (lastId.current === null || nearBottom || newest.direction === 'out') el.scrollTop = el.scrollHeight;
      lastId.current = newest.id;
    }
  }, [messages]);

  useEffect(() => {
    lastId.current = null;
  }, [contact.wa_id]);

  useEffect(() => {
    if (contact.unread_count > 0 && !document.hidden) {
      markRead(contact.wa_id).then(() => {
        qc.invalidateQueries({ queryKey: ['conversations'] });
        qc.invalidateQueries({ queryKey: ['contact', contact.wa_id] });
      }).catch(() => {});
    }
  }, [contact.wa_id, contact.unread_count, qc]);

  const loadOlder = () => {
    if (!hasNextPage || isFetchingNextPage || !scroller.current) return;
    prevHeight.current = scroller.current.scrollHeight;
    fetchNextPage();
  };

  const remaining = windowRemaining(contact.last_inbound_at);

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="h-16 px-3 md:px-5 border-b border-slate-100 bg-white flex items-center gap-3 flex-shrink-0">
        <IconButton icon={ArrowLeft} label="Back" onClick={onBack} className="md:hidden -ml-1" />
        <button onClick={onToggleDetails} className="flex items-center gap-3 min-w-0 flex-1 text-left">
          <Avatar name={contact.name} src={contact.avatar_url} size={38} />
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{contact.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {contact.phone}
              {remaining ? <span className="text-emerald-600 font-medium"> · window open {remaining}</span> : <span className="text-amber-600 font-medium"> · template required</span>}
            </p>
          </div>
        </button>
        <IconButton icon={PanelRightOpen} label="Contact details" onClick={onToggleDetails} />
      </div>

      <div
        ref={scroller}
        className="flex-1 overflow-y-auto chat-wallpaper px-3 md:px-8 py-4"
        onScroll={e => {
          if (e.currentTarget.scrollTop < 80) loadOlder();
        }}
      >
        {isLoading ? (
          <div className="h-full flex items-center justify-center"><Spinner /></div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="bg-white/90 rounded-2xl px-6 py-5 text-center max-w-sm shadow-sm">
              <p className="font-semibold text-slate-800">No messages yet</p>
              <p className="text-sm text-slate-500 mt-1">Send an approved template to start the conversation.</p>
              <Button size="sm" className="mt-4" icon={Radio} onClick={() => setTemplateOpen(true)}>Send template</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-w-4xl mx-auto">
            {hasNextPage && (
              <div className="flex justify-center py-2">
                <button onClick={loadOlder} className="text-xs font-semibold text-slate-500 bg-white/80 rounded-full px-3 py-1 shadow-sm">
                  {isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const lastOfGroup = !next || next.direction !== m.direction;
              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className="flex justify-center py-3">
                      <span className="text-[11px] font-semibold text-slate-500 bg-white/90 px-3 py-1 rounded-lg shadow-sm">{dayLabel(m.created_at)}</span>
                    </div>
                  )}
                  <div className={cn(lastOfGroup && 'mb-3')}>
                    <MessageBubble m={m} showTail={lastOfGroup} />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <Composer contact={contact} onTemplate={() => setTemplateOpen(true)} />
      <TemplateSendModal open={templateOpen} onClose={() => setTemplateOpen(false)} contact={contact} />
    </div>
  );
};
