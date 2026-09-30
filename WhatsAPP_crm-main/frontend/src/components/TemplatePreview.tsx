import React from 'react';
import { ExternalLink, Image as ImageIcon, Phone, Reply, Video, FileText } from 'lucide-react';
import type { TemplateShape } from '../lib/types';
import { RichText } from '../pages/inbox/MessageBubble';

const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (_, k) => (values[k] && values[k].trim() ? values[k] : `{{${k}}}`));
}

/** A WhatsApp-style bubble for a template, with variables filled from `body`/`header` values. */
export const TemplateBubble: React.FC<{
  shape: TemplateShape;
  body: Record<string, string>;
  header?: Record<string, string>;
  headerMediaUrl?: string | null;
}> = ({ shape, body, header = {}, headerMediaUrl }) => {
  const MediaIcon = shape.headerFormat === 'VIDEO' ? Video : shape.headerFormat === 'DOCUMENT' ? FileText : ImageIcon;
  return (
    <div className="w-full max-w-[280px]">
      <div className="bg-white rounded-xl rounded-tl-sm shadow-sm overflow-hidden">
        {shape.headerFormat && shape.headerFormat !== 'TEXT' && (
          <div className="h-32 bg-slate-100 flex items-center justify-center overflow-hidden">
            {headerMediaUrl && shape.headerFormat === 'IMAGE' ? (
              <img src={headerMediaUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <MediaIcon className="text-slate-300" size={36} />
            )}
          </div>
        )}
        <div className="px-3 pt-2 pb-1.5 text-[13px] leading-snug text-slate-800">
          {shape.headerText && <p className="font-bold mb-1">{fillTemplate(shape.headerText, header)}</p>}
          <p className="whitespace-pre-wrap break-words">
            <RichText text={fillTemplate(shape.bodyText, body)} />
          </p>
          {shape.footerText && <p className="text-[11px] text-slate-400 mt-1.5">{shape.footerText}</p>}
          <p className="text-[10px] text-slate-400 text-right mt-0.5">10:42</p>
        </div>
      </div>
      {shape.buttons.length > 0 && (
        <div className="mt-1 space-y-1">
          {shape.buttons.map((b, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm py-2 text-center text-[13px] font-medium text-sky-600 flex items-center justify-center gap-1.5">
              {b.type === 'URL' ? <ExternalLink size={13} /> : b.type === 'PHONE_NUMBER' ? <Phone size={13} /> : <Reply size={13} />}
              {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Phone mockup used for live previews. */
export const PhoneFrame: React.FC<{ businessName: string; children: React.ReactNode }> = ({ businessName, children }) => (
  <div className="w-[300px] mx-auto rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden">
    <div className="bg-whatsapp text-white px-4 pt-5 pb-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">{businessName.slice(0, 1).toUpperCase()}</div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">{businessName}</p>
        <p className="text-[10px] opacity-80">Business account</p>
      </div>
    </div>
    <div className="chat-wallpaper h-[420px] p-3 overflow-y-auto">
      <div className="flex justify-center mb-3">
        <span className="text-[10px] font-semibold text-slate-500 bg-white/90 px-2 py-0.5 rounded-md shadow-sm uppercase">Today</span>
      </div>
      {children}
    </div>
  </div>
);
