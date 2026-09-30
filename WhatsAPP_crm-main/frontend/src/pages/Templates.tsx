import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, RefreshCw, Trash2, Braces, X, Info, Upload } from 'lucide-react';
import { createTemplate, deleteTemplate, syncTemplates, uploadMedia, useTemplates, useWhatsAppStatus, type TemplateInput } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Button, ConfirmModal, EmptyState, ErrorState, IconButton, Input, Modal, PageLoader, Segmented, Select, Textarea, type Tone } from '../components/ui';
import { TemplateBubble } from '../components/TemplatePreview';
import { errorMessage } from '../lib/api';
import { toast } from '../store/toast';
import type { Template, TemplateShape } from '../lib/types';
import { shortDate } from '../lib/format';

const STATUS_TONE: Record<string, Tone> = { APPROVED: 'green', PENDING: 'amber', REJECTED: 'red', PAUSED: 'amber', DISABLED: 'slate' };
const LANGUAGES = [
  ['en_US', 'English (US)'], ['en_GB', 'English (UK)'], ['en', 'English'], ['es', 'Spanish'], ['es_MX', 'Spanish (MEX)'], ['pt_BR', 'Portuguese (BR)'],
  ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['hi', 'Hindi'], ['id', 'Indonesian'], ['ar', 'Arabic'], ['tr', 'Turkish'], ['nl', 'Dutch']
];

const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const vars = (s: string) => [...new Set([...s.matchAll(VAR_RE)].map(m => m[1]))];

type Btn = { type: 'QUICK_REPLY' | 'URL'; text: string; url?: string };

const CreateTemplateModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const qc = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [category, setCategory] = useState<TemplateInput['category']>('MARKETING');
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('NONE');
  const [header, setHeader] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setHeader('');
      setHeaderType('NONE');
      setMediaUrl('');
      setBody('Hi {{1}}, ');
      setFooter('');
      setExamples({ '1': 'Jane' });
      setButtons([]);
    }
  }, [open]);

  const bodyVars = vars(body);
  const headerVars = headerType === 'TEXT' ? vars(header) : [];
  const isMedia = headerType !== 'NONE' && headerType !== 'TEXT';
  const urlVarButtons = buttons.map((b, i) => ({ b, i })).filter(({ b }) => b.type === 'URL' && /\{\{\s*1\s*\}\}$/.test(b.url || ''));
  const allVars = [...new Set([...headerVars, ...bodyVars])];

  const insertVar = () => {
    const nums = bodyVars.filter(v => /^\d+$/.test(v)).map(Number);
    const next = `{{${nums.length ? Math.max(...nums) + 1 : 1}}}`;
    const el = bodyRef.current;
    const pos = el?.selectionStart ?? body.length;
    setBody(body.slice(0, pos) + next + body.slice(pos));
    setTimeout(() => el?.focus(), 0);
  };

  const shape: TemplateShape = {
    headerFormat: headerType === 'NONE' ? null : headerType === 'TEXT' ? (header ? 'TEXT' : null) : headerType,
    headerText: headerType === 'TEXT' ? header || null : null,
    headerVars,
    bodyText: body,
    bodyVars,
    footerText: footer || null,
    buttons: buttons.filter(b => b.text).map(b => ({ type: b.type, text: b.text, url: b.url })),
    urlButtons: urlVarButtons.map(({ b, i }) => ({ index: i, variable: '1', url: b.url || '' })),
    dynamicUrlButtons: urlVarButtons.length
  };

  const save = async () => {
    setSaving(true);
    try {
      await createTemplate({
        name,
        language,
        category,
        header_text: headerType === 'TEXT' ? header || undefined : undefined,
        header_media: isMedia ? { format: headerType as 'IMAGE' | 'VIDEO' | 'DOCUMENT', url: mediaUrl } : undefined,
        body,
        footer: footer || undefined,
        examples,
        buttons: buttons.filter(b => b.text).map(b => (b.type === 'URL' ? { type: 'URL', text: b.text, url: b.url || '' } : { type: 'QUICK_REPLY', text: b.text }))
      });
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template submitted', 'Meta usually reviews templates within minutes to a few hours.');
      onClose();
    } catch (e) {
      toast.error('Template rejected by WhatsApp', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const valid =
    /^[a-z0-9_ -]+$/i.test(name) &&
    body.trim().length > 0 &&
    allVars.every(v => examples[v]?.trim()) &&
    urlVarButtons.every(({ i }) => examples[`button.${i}`]?.trim()) &&
    (!isMedia || !!mediaUrl) &&
    buttons.every(b => b.text && (b.type !== 'URL' || /^https?:\/\//.test(b.url || '')));

  const pickSample = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setMediaUrl((await uploadMedia(file)).url);
    } catch (e) {
      toast.error('Upload failed', errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="New message template"
      description="Templates are reviewed by Meta before you can use them to start conversations or broadcast."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!valid}>Submit for review</Button>
        </>
      }
    >
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Input label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="spring_sale" hint="Lowercase letters, numbers and underscores" className="sm:col-span-3" />
            <Select label="Category" value={category} onChange={e => setCategory(e.target.value as TemplateInput['category'])}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
            </Select>
            <Select label="Language" value={language} onChange={e => setLanguage(e.target.value)} className="sm:col-span-2">
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label} · {code}</option>)}
            </Select>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 items-start">
            <Select label="Header" value={headerType} onChange={e => setHeaderType(e.target.value as typeof headerType)}>
              <option value="NONE">None</option>
              <option value="TEXT">Text</option>
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="DOCUMENT">Document</option>
            </Select>
            {headerType === 'TEXT' && <Input label="Header text" value={header} onChange={e => setHeader(e.target.value)} maxLength={60} placeholder="Big news!" className="sm:col-span-2" />}
            {isMedia && (
              <div className="sm:col-span-2 space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sample {headerType.toLowerCase()}</p>
                <label className="flex items-center gap-2 h-[42px] px-3.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 cursor-pointer hover:border-primary">
                  <Upload size={15} />
                  <span className="truncate">{uploading ? 'Uploading…' : mediaUrl ? decodeURIComponent(mediaUrl.split('/').pop() || '') : 'Choose a file for Meta’s review'}</span>
                  <input
                    type="file"
                    hidden
                    accept={headerType === 'IMAGE' ? 'image/jpeg,image/png' : headerType === 'VIDEO' ? 'video/mp4' : 'application/pdf'}
                    onChange={e => pickSample(e.target.files?.[0])}
                  />
                </label>
                <p className="text-xs text-slate-400">Each send can use a different file; this one is the review sample and default.</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Body</label>
              <button type="button" onClick={insertVar} className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                <Braces size={12} /> Add variable
              </button>
            </div>
            <Textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={1024} hint={`${body.length}/1024 · use *bold*, _italic_, ~strike~`} />
          </div>
          {(allVars.length > 0 || urlVarButtons.length > 0) && (
            <div className="p-4 bg-slate-50 rounded-xl space-y-3">
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Info size={12} /> Meta needs a sample value for every variable.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {allVars.map(v => (
                  <Input key={v} label={`Example for {{${v}}}`} value={examples[v] || ''} onChange={e => setExamples(x => ({ ...x, [v]: e.target.value }))} />
                ))}
                {urlVarButtons.map(({ b, i }) => (
                  <Input key={`btn-${i}`} label={`Example for link “${b.text || 'button'}”`} placeholder="e.g. order-123" value={examples[`button.${i}`] || ''} onChange={e => setExamples(x => ({ ...x, [`button.${i}`]: e.target.value }))} />
                ))}
              </div>
            </div>
          )}
          <Input label="Footer (optional)" value={footer} onChange={e => setFooter(e.target.value)} maxLength={60} placeholder="Reply STOP to unsubscribe" />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Buttons (optional)</label>
              <div className="flex gap-3">
                <button type="button" disabled={buttons.length >= 3} onClick={() => setButtons(b => [...b, { type: 'QUICK_REPLY', text: '' }])} className="text-xs font-bold text-primary disabled:opacity-40">+ Quick reply</button>
                <button type="button" disabled={buttons.length >= 3 || buttons.some(b => b.type === 'URL')} onClick={() => setButtons(b => [...b, { type: 'URL', text: '', url: '' }])} className="text-xs font-bold text-primary disabled:opacity-40">+ Website link</button>
              </div>
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input placeholder={b.type === 'URL' ? 'Visit website' : 'Yes, interested'} value={b.text} maxLength={25} onChange={e => setButtons(bs => bs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="flex-1" />
                {b.type === 'URL' && <Input placeholder="https://… (end with {{1}} for a per-contact link)" value={b.url} onChange={e => setButtons(bs => bs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className="flex-1" />}
                <IconButton icon={X} label="Remove button" onClick={() => setButtons(bs => bs.filter((_, j) => j !== i))} className="mt-0.5" />
              </div>
            ))}
          </div>
        </div>
        <div className="chat-wallpaper rounded-2xl p-4 h-fit lg:sticky lg:top-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Preview</p>
          <TemplateBubble shape={shape} body={examples} header={examples} headerMediaUrl={headerType === 'IMAGE' ? mediaUrl : null} />
        </div>
      </div>
    </Modal>
  );
};

export default function Templates() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useTemplates();
  const { data: wa } = useWhatsAppStatus();
  const [filter, setFilter] = useState<'all' | 'APPROVED' | 'PENDING' | 'REJECTED'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [preview, setPreview] = useState<Template | null>(null);

  const rows = useMemo(() => (data || []).filter(t => filter === 'all' || t.status === filter), [data, filter]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await syncTemplates();
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`Synced ${r.synced} templates from WhatsApp`);
    } catch (e) {
      toast.error('Sync failed', errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteTemplate(toDelete.name);
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
    } catch (e) {
      toast.error('Could not delete', errorMessage(e));
    } finally {
      setToDelete(null);
    }
  };

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-900">Message templates</h2>
          <p className="text-sm text-slate-500 mt-1">Pre-approved messages for broadcasts and for re-opening conversations after 24 hours.</p>
        </div>
        {isAdmin && wa?.connected && (
          <div className="flex gap-2">
            <Button variant="secondary" icon={RefreshCw} loading={syncing} onClick={sync}>Sync from WhatsApp</Button>
            <Button icon={Plus} onClick={() => setCreateOpen(true)}>New template</Button>
          </div>
        )}
      </div>

      {wa && !wa.connected ? (
        <div className="bg-white rounded-2xl border border-slate-200/70">
          <EmptyState icon={FileText} title="Connect WhatsApp first" body="Templates live in your WhatsApp Business Account." action={<Link to="/settings?tab=whatsapp"><Button>Connect WhatsApp</Button></Link>} />
        </div>
      ) : (
        <>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${data?.length ?? 0}` },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'REJECTED', label: 'Rejected' }
            ]}
          />
          {rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/70">
              <EmptyState icon={FileText} title="No templates here" body={isAdmin ? 'Create one, or sync the templates that already exist in your WhatsApp account.' : undefined} />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {rows.map(t => (
                <div key={`${t.name}-${t.language}`} className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5 flex flex-col hover:shadow-card-hover transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t.language} · {t.category.toLowerCase()} · updated {shortDate(t.updated_at)}</p>
                    </div>
                    <Badge tone={STATUS_TONE[t.status] || 'slate'} dot>{t.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-3 line-clamp-4 whitespace-pre-wrap flex-1">{t.shape.bodyText}</p>
                  {t.rejected_reason && <p className="text-xs text-danger mt-2">Rejected: {t.rejected_reason.replace(/_/g, ' ').toLowerCase()}</p>}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-400">
                      {t.shape.bodyVars.length + t.shape.headerVars.length === 1 ? '1 variable' : `${t.shape.bodyVars.length + t.shape.headerVars.length} variables`}{t.shape.headerFormat && t.shape.headerFormat !== 'TEXT' ? ` · ${t.shape.headerFormat.toLowerCase()} header` : ''}
                    </span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPreview(t)}>Preview</Button>
                      {isAdmin && <IconButton icon={Trash2} tone="danger" label="Delete template" onClick={() => setToDelete(t)} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <CreateTemplateModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name} description={preview && `${preview.language} · ${preview.category.toLowerCase()}`} size="sm">
        <div className="chat-wallpaper rounded-2xl p-4 flex justify-center">{preview && <TemplateBubble shape={preview.shape} body={{}} header={{}} />}</div>
      </Modal>
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete template?"
        confirmLabel="Delete from WhatsApp"
        body={<>This deletes <b>{toDelete?.name}</b> (all languages) from your WhatsApp Business Account. Meta blocks reusing the name for 30 days.</>}
      />
    </div>
  );
}
