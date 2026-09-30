import React from 'react';
import { FileText, MapPin, Radio, Download, AlertCircle, Mic } from 'lucide-react';
import { MessageStatusIcon, cn } from '../../components/ui';
import { time } from '../../lib/format';
import type { Message } from '../../lib/types';

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

/** Renders WhatsApp-style formatting (*bold*, _italic_, ~strike~) and links, without HTML injection. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{formatInline(part)}</React.Fragment>
        )
      )}
    </>
  );
}

function formatInline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const inner = m[0].slice(1, -1);
    if (m[0][0] === '*') out.push(<strong key={k++}>{inner}</strong>);
    else if (m[0][0] === '_') out.push(<em key={k++}>{inner}</em>);
    else out.push(<s key={k++}>{inner}</s>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function MediaBlock({ m, out }: { m: Message; out: boolean }) {
  const media = m.media!;
  if (!media.url) {
    return (
      <div className={cn('flex items-center gap-2 text-xs py-2', out ? 'text-blue-100' : 'text-slate-400')}>
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Loading {media.kind}…
      </div>
    );
  }
  switch (media.kind) {
    case 'image':
    case 'sticker':
      return (
        <a href={media.url} target="_blank" rel="noopener noreferrer" className="block -mx-1.5 -mt-1 mb-1">
          <img src={media.url} alt={media.caption || 'Image'} loading="lazy" className={cn('rounded-xl object-cover', media.kind === 'sticker' ? 'w-32 h-32 object-contain' : 'max-h-80 w-full min-w-[180px]')} />
        </a>
      );
    case 'video':
      return <video src={media.url} controls preload="metadata" className="rounded-xl max-h-80 w-full -mx-0.5 mb-1" />;
    case 'audio':
      return (
        <div className="flex items-center gap-2 py-1">
          <Mic size={16} className="opacity-60" />
          <audio src={media.url} controls preload="none" className="h-9 max-w-[240px]" />
        </div>
      );
    default:
      return (
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('flex items-center gap-3 p-2.5 rounded-xl mb-1', out ? 'bg-white/15 hover:bg-white/20' : 'bg-slate-50 hover:bg-slate-100 border border-slate-100')}
        >
          <FileText size={22} className={out ? 'text-white' : 'text-primary'} />
          <span className="text-sm font-medium truncate flex-1">{media.filename || 'Document'}</span>
          <Download size={16} className="opacity-60" />
        </a>
      );
  }
}

export const MessageBubble: React.FC<{ m: Message; showTail?: boolean }> = ({ m, showTail }) => {
  const out = m.direction === 'out';
  const p = m.payload || {};
  if (m.type === 'reaction') {
    return (
      <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
        <span className="text-xs text-slate-500 bg-white/80 border border-slate-200 rounded-full px-2.5 py-1">{m.text}</span>
      </div>
    );
  }
  const isTemplate = m.type === 'template';
  return (
    <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[78%] md:max-w-[65%] px-3.5 pt-2 pb-1.5 shadow-sm text-[14px] leading-relaxed',
          out ? 'bg-primary text-white rounded-2xl' : 'bg-white text-slate-800 rounded-2xl border border-slate-100',
          showTail && (out ? 'rounded-br-md' : 'rounded-bl-md'),
          m.status === 'failed' && 'ring-2 ring-danger/40'
        )}
      >
        {isTemplate && (
          <p className={cn('text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1', out ? 'text-blue-100' : 'text-slate-400')}>
            <Radio size={10} /> {m.campaign_id ? 'Campaign' : 'Template'} · {p.template?.name}
          </p>
        )}
        {m.media && <MediaBlock m={m} out={out} />}
        {m.type === 'location' && p.location && (
          <a
            href={`https://maps.google.com/?q=${p.location.latitude},${p.location.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 font-medium underline underline-offset-2"
          >
            <MapPin size={16} /> {p.location.name || p.location.address || 'Shared location'}
          </a>
        )}
        {m.type !== 'location' && m.text && (
          <p className="whitespace-pre-wrap break-words">
            <RichText text={m.text} />
          </p>
        )}
        {m.type === 'unsupported' && <p className="italic opacity-70">This message type isn't supported yet.</p>}
        <div className={cn('flex items-center justify-end gap-1 mt-0.5 text-[10px]', out ? 'text-blue-100' : 'text-slate-400')}>
          <span>{time(m.created_at)}</span>
          {out && <MessageStatusIcon status={m.status} className={m.status === 'read' ? '!text-sky-200' : undefined} />}
        </div>
        {m.status === 'failed' && (
          <p className="mt-1 mb-0.5 text-[11px] font-medium flex items-start gap-1 text-rose-100 bg-danger/80 rounded-lg px-2 py-1">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            {m.error?.details || m.error?.message || m.error?.title || 'Not delivered'}
          </p>
        )}
      </div>
    </div>
  );
};
