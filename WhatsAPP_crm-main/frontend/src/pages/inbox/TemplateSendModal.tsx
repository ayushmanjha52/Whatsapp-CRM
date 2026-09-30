import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { sendMessage, useTemplates } from '../../api';
import { Button, EmptyState, Input, Modal, Select, Spinner } from '../../components/ui';
import { TemplateBubble } from '../../components/TemplatePreview';
import { errorMessage } from '../../lib/api';
import { upsertMessage } from '../../lib/realtime';
import { toast } from '../../store/toast';
import type { Contact } from '../../lib/types';

export const TemplateSendModal: React.FC<{ open: boolean; onClose: () => void; contact: Contact }> = ({ open, onClose, contact }) => {
  const { data: templates, isLoading } = useTemplates();
  const approved = useMemo(() => (templates || []).filter(t => t.status === 'APPROVED'), [templates]);
  const [key, setKey] = useState('');
  const [header, setHeader] = useState<Record<string, string>>({});
  const [body, setBody] = useState<Record<string, string>>({});
  const [mediaUrl, setMediaUrl] = useState('');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const tpl = approved.find(t => `${t.name}|${t.language}` === key);

  useEffect(() => {
    if (!key && approved.length) setKey(`${approved[0].name}|${approved[0].language}`);
  }, [approved, key]);

  useEffect(() => {
    if (!tpl) return;
    // Prefill obvious variables with what we know about the contact.
    const first = contact.name.split(/\s+/)[0];
    const guess = (v: string) => (/^(1|name|first_name|customer_name)$/i.test(v) ? first : '');
    setBody(Object.fromEntries(tpl.shape.bodyVars.map(v => [v, guess(v)])));
    setHeader(Object.fromEntries(tpl.shape.headerVars.map(v => [v, guess(v)])));
    setLinks(Object.fromEntries((tpl.shape.urlButtons || []).map(b => [String(b.index), ''])));
    setMediaUrl(tpl.sample_media_url || '');
  }, [tpl?.name, tpl?.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsMedia = !!tpl?.shape.headerFormat && tpl.shape.headerFormat !== 'TEXT';
  const complete = !!tpl && Object.values(body).every(v => v.trim()) && Object.values(header).every(v => v.trim()) && Object.values(links).every(v => v.trim()) && (!needsMedia || /^https?:\/\//.test(mediaUrl));

  const send = async () => {
    if (!tpl) return;
    setSending(true);
    try {
      const variables: Record<string, string> = {};
      for (const [k, v] of Object.entries(body)) variables[`body.${k}`] = v;
      for (const [k, v] of Object.entries(links)) variables[`button.${k}`] = v;
      for (const [k, v] of Object.entries(header)) variables[`header.${k}`] = v;
      const { message } = await sendMessage(contact.wa_id, {
        type: 'template',
        template_name: tpl.name,
        language: tpl.language,
        variables,
        header_media_url: needsMedia ? mediaUrl : undefined
      });
      upsertMessage(qc, contact.wa_id, message);
      toast.success('Template sent');
      onClose();
    } catch (e) {
      toast.error('Could not send template', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Send a template"
      description="Approved templates can start or restart a conversation at any time."
      footer={
        approved.length > 0 && (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={send} loading={sending} disabled={!complete}>Send template</Button>
          </>
        )
      }
    >
      {isLoading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : approved.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No approved templates"
          body="Create a template and wait for Meta to approve it, or sync existing ones."
          action={<Link to="/templates" className="text-sm font-bold text-primary hover:underline">Go to templates →</Link>}
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Select label="Template" value={key} onChange={e => setKey(e.target.value)}>
              {approved.map(t => (
                <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                  {t.name} ({t.language}) · {t.category.toLowerCase()}
                </option>
              ))}
            </Select>
            {needsMedia && (
              <Input label={`Header ${tpl!.shape.headerFormat!.toLowerCase()} URL`} placeholder="https://…" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} hint="A public link WhatsApp can download." />
            )}
            {tpl?.shape.headerVars.map(v => (
              <Input key={`h-${v}`} label={`Header {{${v}}}`} value={header[v] || ''} onChange={e => setHeader(h => ({ ...h, [v]: e.target.value }))} />
            ))}
            {tpl?.shape.bodyVars.map(v => (
              <Input key={`b-${v}`} label={`Body {{${v}}}`} value={body[v] || ''} onChange={e => setBody(b => ({ ...b, [v]: e.target.value }))} />
            ))}
            {(tpl?.shape.urlButtons || []).map(b => (
              <Input
                key={`l-${b.index}`}
                label={`Link “${tpl!.shape.buttons[b.index]?.text}”`}
                value={links[String(b.index)] || ''}
                onChange={e => setLinks(l => ({ ...l, [String(b.index)]: e.target.value }))}
                hint={<span className="font-mono">{b.url.replace(/\{\{\s*1\s*\}\}$/, '…')}</span>}
              />
            ))}
            {tpl && tpl.shape.bodyVars.length === 0 && (tpl.shape.urlButtons || []).length === 0 && tpl.shape.headerVars.length === 0 && !needsMedia && (
              <p className="text-sm text-slate-500">This template has no variables — it's ready to send.</p>
            )}
          </div>
          <div className="chat-wallpaper rounded-2xl p-4 flex items-start justify-center min-h-[240px]">
            {tpl && <TemplateBubble shape={tpl.shape} body={body} header={header} headerMediaUrl={mediaUrl} />}
          </div>
        </div>
      )}
    </Modal>
  );
};
