import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Users, Tag, UserCheck, Inbox, Send, Clock, Save, AlertTriangle, FileText, CornerDownRight } from 'lucide-react';
import {
  audiencePreview, createCampaign, createFollowUp, useContacts, useCustomFields, useTags, useTemplates, useWhatsAppStatus, type Audience
} from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { Button, EmptyState, Input, Select, Spinner, cn } from '../../components/ui';
import { PhoneFrame, TemplateBubble } from '../../components/TemplatePreview';
import { errorMessage } from '../../lib/api';
import { toLocalInput } from '../../lib/format';
import { toast } from '../../store/toast';
import type { Contact, VariableSource } from '../../lib/types';

type Segment = 'not_replied' | 'not_read' | 'failed' | 'replied';
type WizardState = { contactIds?: number[]; followUp?: { parentId: number; parentName: string } };

const FIELD_OPTIONS = [
  { value: 'first_name', label: 'First name' },
  { value: 'name', label: 'Full name' },
  { value: 'company', label: 'Company' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' }
];

const SEGMENTS: { value: Segment; label: string; body: string }[] = [
  { value: 'not_replied', label: "Didn't reply", body: 'Received the message but never answered.' },
  { value: 'not_read', label: "Didn't read", body: 'Delivered but not opened yet.' },
  { value: 'failed', label: 'Failed', body: 'Retry recipients whose message failed.' },
  { value: 'replied', label: 'Replied', body: 'Thank or upsell people who engaged.' }
];

function sampleValue(src: VariableSource | undefined, c: Partial<Contact> | undefined): string {
  if (!src) return '';
  if (src.source === 'static') return src.value;
  const name = c?.name && c.name !== c.phone ? c.name : '';
  const custom = src.field.startsWith('custom.') ? c?.custom_fields?.[src.field.slice(7)] : undefined;
  const v = {
    name,
    first_name: name.split(' ')[0],
    company: c?.company || '',
    email: c?.email || '',
    phone: c?.phone || ''
  }[src.field] ?? (custom !== undefined && custom !== null ? String(custom) : '');
  return v || src.fallback || '';
}

const Step: React.FC<{ n: number; label: string; active: boolean; done: boolean }> = ({ n, label, active, done }) => (
  <div className="flex items-center gap-2.5">
    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition', done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-white shadow-glow' : 'bg-slate-100 text-slate-400')}>
      {done ? <Check size={16} /> : n}
    </div>
    <span className={cn('text-sm font-semibold hidden sm:inline', active ? 'text-slate-900' : 'text-slate-400')}>{label}</span>
  </div>
);

const Choice: React.FC<{ active: boolean; onClick: () => void; icon: React.ElementType; title: string; body: string }> = ({ active, onClick, icon: Icon, title, body }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn('text-left p-4 rounded-xl border-2 transition flex gap-3', active ? 'border-primary bg-blue-50/50' : 'border-slate-200 hover:border-slate-300')}
  >
    <Icon size={20} className={active ? 'text-primary' : 'text-slate-400'} />
    <div>
      <p className="font-semibold text-sm text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{body}</p>
    </div>
  </button>
);

export default function CampaignWizard() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = (useLocation().state || {}) as WizardState;
  const followUp = state.followUp;
  const [step, setStep] = useState(1);

  // Audience
  const [mode, setMode] = useState<'all' | 'tags' | 'broadcast_only' | 'inbox' | 'selected'>(state.contactIds?.length ? 'selected' : 'tags');
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [segment, setSegment] = useState<Segment>('not_replied');
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const { data: tags } = useTags();

  // Message
  const { data: templates, isLoading: tplLoading } = useTemplates();
  const approved = useMemo(() => (templates || []).filter(t => t.status === 'APPROVED'), [templates]);
  const [tplKey, setTplKey] = useState('');
  const tpl = approved.find(t => `${t.name}|${t.language}` === tplKey);
  const [mapping, setMapping] = useState<Record<string, VariableSource>>({});
  const [mediaUrl, setMediaUrl] = useState('');
  const { data: fields = [] } = useCustomFields();
  const { data: sample } = useContacts({ page_size: 1, audience: 'all' });
  const sampleContact = sample?.contacts[0];

  // Review
  const [name, setName] = useState(followUp ? `${followUp.parentName} — follow-up` : '');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInput(new Date(Date.now() + 3600e3)));
  const [saving, setSaving] = useState(false);
  const { data: wa } = useWhatsAppStatus();

  const audience: Audience = useMemo(() => {
    if (mode === 'selected') return { contact_ids: state.contactIds || [] };
    if (mode === 'tags') return { tags: pickedTags };
    if (mode === 'broadcast_only') return { audience: 'broadcast_only' };
    if (mode === 'inbox') return { audience: 'inbox' };
    return { audience: 'all' };
  }, [mode, pickedTags, state.contactIds]);

  useEffect(() => {
    if (followUp) return;
    if (mode === 'tags' && pickedTags.length === 0) return setCount(0);
    let alive = true;
    setCounting(true);
    const t = setTimeout(() => {
      audiencePreview(audience)
        .then(r => alive && setCount(r.count))
        .catch(() => alive && setCount(null))
        .finally(() => alive && setCounting(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [audience, followUp, mode, pickedTags.length]);

  useEffect(() => {
    if (!tplKey && approved.length) setTplKey(`${approved[0].name}|${approved[0].language}`);
  }, [approved, tplKey]);

  useEffect(() => {
    if (!tpl) return;
    const m: Record<string, VariableSource> = {};
    const guess = (v: string, i: number): VariableSource =>
      i === 0 || /name/i.test(v) ? { source: 'field', field: 'first_name', fallback: 'there' } : /company/i.test(v) ? { source: 'field', field: 'company', fallback: '' } : { source: 'static', value: '' };
    tpl.shape.headerVars.forEach((v, i) => (m[`header.${v}`] = guess(v, i)));
    tpl.shape.bodyVars.forEach((v, i) => (m[`body.${v}`] = guess(v, i)));
    setMapping(m);
    setMediaUrl('');
  }, [tpl?.name, tpl?.language]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) return <EmptyState icon={Send} title="Admins only" body="Ask a workspace admin to send campaigns." />;

  const needsMedia = !!tpl?.shape.headerFormat && tpl.shape.headerFormat !== 'TEXT';
  const mappingComplete = !!tpl && Object.values(mapping).every(s => (s.source === 'static' ? s.value.trim() : s.field)) && (!needsMedia || /^https?:\/\//.test(mediaUrl));
  const audienceOk = followUp ? true : (count ?? 0) > 0;

  const values = (prefix: 'body' | 'header') =>
    Object.fromEntries(Object.entries(mapping).filter(([k]) => k.startsWith(prefix + '.')).map(([k, v]) => [k.slice(prefix.length + 1), sampleValue(v, sampleContact)]));

  const submit = async (send: boolean) => {
    if (!tpl) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        template_name: tpl.name,
        template_language: tpl.language,
        variables: mapping,
        header_media_url: needsMedia ? mediaUrl : null,
        scheduled_at: send && when === 'later' ? new Date(scheduledAt).toISOString() : null,
        send
      };
      const { campaign } = followUp ? await createFollowUp(followUp.parentId, { ...body, segment }) : await createCampaign({ ...body, audience });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(send ? (when === 'later' ? 'Campaign scheduled' : 'Campaign is sending') : 'Draft saved', `${campaign.stats.total} recipients`);
      navigate(`/broadcast/${campaign.id}`, { replace: true });
    } catch (e) {
      toast.error('Could not create campaign', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const setVar = (key: string, src: VariableSource) => setMapping(m => ({ ...m, [key]: src }));

  const varRow = (key: string, label: string) => {
    const src = mapping[key];
    if (!src) return null;
    return (
      <div key={key} className="grid sm:grid-cols-[110px_1fr_1fr] gap-2 items-center p-3 bg-slate-50 rounded-xl">
        <span className="font-mono text-xs font-bold text-slate-600">{label}</span>
        <Select
          value={src.source === 'static' ? '__static' : src.field}
          onChange={e => setVar(key, e.target.value === '__static' ? { source: 'static', value: '' } : { source: 'field', field: e.target.value, fallback: src.source === 'field' ? src.fallback : '' })}
        >
          <optgroup label="Contact field">
            {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            {fields.map(f => <option key={f} value={`custom.${f}`}>{f} (custom)</option>)}
          </optgroup>
          <option value="__static">Same text for everyone…</option>
        </Select>
        {src.source === 'static' ? (
          <Input placeholder="Text" value={src.value} onChange={e => setVar(key, { source: 'static', value: e.target.value })} />
        ) : (
          <Input placeholder="If empty, use…" value={src.fallback || ''} onChange={e => setVar(key, { ...src, fallback: e.target.value })} />
        )}
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/broadcast" className="p-2 rounded-lg hover:bg-white text-slate-500"><ArrowLeft size={18} /></Link>
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-900 flex items-center gap-2">
            {followUp && <CornerDownRight size={20} className="text-slate-400" />}
            {followUp ? 'Follow-up campaign' : 'New campaign'}
          </h2>
          {followUp && <p className="text-sm text-slate-500">Following up on “{followUp.parentName}”</p>}
        </div>
      </div>

      {wa && !wa.connected && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-3">
          <AlertTriangle size={18} /> Connect a WhatsApp number in <Link to="/settings?tab=whatsapp" className="font-bold underline">Settings</Link> before sending.
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_340px] gap-8">
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card">
          <div className="flex items-center justify-center gap-6 sm:gap-12 px-6 py-5 border-b border-slate-100">
            <Step n={1} label="Audience" active={step === 1} done={step > 1} />
            <div className="h-px w-10 bg-slate-200" />
            <Step n={2} label="Message" active={step === 2} done={step > 2} />
            <div className="h-px w-10 bg-slate-200" />
            <Step n={3} label="Review & send" active={step === 3} done={false} />
          </div>

          <div className="p-6 lg:p-8 min-h-[420px]">
            {step === 1 && (
              <div className="space-y-5 max-w-2xl mx-auto">
                {followUp ? (
                  <>
                    <p className="text-sm text-slate-600">Who should get the follow-up?</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {SEGMENTS.map(s => <Choice key={s.value} active={segment === s.value} onClick={() => setSegment(s.value)} icon={UserCheck} title={s.label} body={s.body} />)}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">Who should receive this campaign? Contacts who replied STOP are always excluded.</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Choice active={mode === 'tags'} onClick={() => setMode('tags')} icon={Tag} title="Contacts with tags" body="Target an imported list or segment." />
                      <Choice active={mode === 'broadcast_only'} onClick={() => setMode('broadcast_only')} icon={Users} title="Broadcast-only contacts" body="Imported leads who haven't chatted yet." />
                      <Choice active={mode === 'inbox'} onClick={() => setMode('inbox')} icon={Inbox} title="Inbox contacts" body="People you've already talked to." />
                      <Choice active={mode === 'all'} onClick={() => setMode('all')} icon={Users} title="Everyone" body="All contacts in the workspace." />
                      {!!state.contactIds?.length && (
                        <Choice active={mode === 'selected'} onClick={() => setMode('selected')} icon={UserCheck} title={`Selected contacts (${state.contactIds.length})`} body="Picked on the Contacts page." />
                      )}
                    </div>
                    {mode === 'tags' && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tags (any of)</p>
                        {(tags || []).length === 0 ? (
                          <p className="text-sm text-slate-400">No tags yet — <Link to="/contacts" className="text-primary font-semibold">import a list</Link> to create one.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {tags!.map(t => {
                              const on = pickedTags.includes(t.name);
                              return (
                                <button
                                  key={t.name}
                                  onClick={() => setPickedTags(p => (on ? p.filter(x => x !== t.name) : [...p, t.name]))}
                                  className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold border transition', on ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300')}
                                >
                                  {t.name} <span className={on ? 'text-blue-100' : 'text-slate-400'}>{t.count}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                      <Users size={20} className="text-primary" />
                      <p className="text-sm text-slate-700">
                        Estimated reach: {counting ? <Spinner size={14} className="inline" /> : <b className="text-slate-900 text-base">{count ?? '—'}</b>} contacts
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5 max-w-2xl mx-auto">
                {tplLoading ? (
                  <Spinner />
                ) : approved.length === 0 ? (
                  <EmptyState icon={FileText} title="No approved templates" body="WhatsApp only allows approved templates for broadcasts." action={<Link to="/templates"><Button>Create a template</Button></Link>} />
                ) : (
                  <>
                    <Select label="Template" value={tplKey} onChange={e => setTplKey(e.target.value)}>
                      {approved.map(t => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language}) · {t.category.toLowerCase()}</option>)}
                    </Select>
                    {tpl && tpl.shape.dynamicUrlButtons > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">This template has a link button with a variable, which campaigns don't support yet. Sends will fail — pick another template.</p>
                    )}
                    {needsMedia && <Input label={`Header ${tpl!.shape.headerFormat!.toLowerCase()} URL`} placeholder="https://…" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} hint="Public link to the image/video/document everyone receives." />}
                    {tpl && Object.keys(mapping).length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Personalize each variable</p>
                        {tpl.shape.headerVars.map(v => varRow(`header.${v}`, `header {{${v}}}`))}
                        {tpl.shape.bodyVars.map(v => varRow(`body.${v}`, `{{${v}}}`))}
                      </div>
                    ) : (
                      tpl && <p className="text-sm text-slate-500">This template has no variables — everyone gets the same message.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5 max-w-2xl mx-auto">
                <Input label="Campaign name" value={name} onChange={e => setName(e.target.value)} placeholder="Spring promo — VIP list" />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Choice active={when === 'now'} onClick={() => setWhen('now')} icon={Send} title="Send now" body="Starts within a few seconds." />
                  <Choice active={when === 'later'} onClick={() => setWhen('later')} icon={Clock} title="Schedule" body="Pick a date and time." />
                </div>
                {when === 'later' && <Input type="datetime-local" label="Send at" value={scheduledAt} min={toLocalInput(new Date())} onChange={e => setScheduledAt(e.target.value)} />}
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between p-3"><span className="text-slate-500">Recipients</span><b>{followUp ? SEGMENTS.find(s => s.value === segment)?.label : `${count ?? '—'} contacts`}</b></div>
                  <div className="flex justify-between p-3"><span className="text-slate-500">Template</span><b className="font-mono">{tpl?.name}</b></div>
                  <div className="flex justify-between p-3"><span className="text-slate-500">Category</span><b className="capitalize">{tpl?.category.toLowerCase()}</b></div>
                </div>
                <p className="text-xs text-slate-500">
                  WhatsApp charges per delivered template message by category and country, and limits how many new customers a number can message per day. Replies arrive in your Inbox.
                </p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <Button variant="ghost" icon={ArrowLeft} onClick={() => (step === 1 ? navigate('/broadcast') : setStep(s => s - 1))}>Back</Button>
            {step < 3 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 ? !audienceOk : !mappingComplete}>
                Continue <ArrowRight size={16} />
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" icon={Save} loading={saving} disabled={!name.trim()} onClick={() => submit(false)}>Save draft</Button>
                <Button icon={when === 'later' ? Clock : Send} loading={saving} disabled={!name.trim() || !wa?.connected} onClick={() => submit(true)}>
                  {when === 'later' ? 'Schedule campaign' : 'Send campaign'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="hidden xl:block">
          <p className="text-center font-display font-bold text-slate-900">Live preview</p>
          <p className="text-center text-xs text-slate-500 mb-4">{sampleContact ? `As ${sampleContact.name} would see it` : 'With sample data'}</p>
          <PhoneFrame businessName={wa?.numbers.find(n => n.default_sender)?.verified_name || 'Your business'}>
            {tpl ? (
              <TemplateBubble shape={tpl.shape} body={values('body')} header={values('header')} headerMediaUrl={mediaUrl} />
            ) : (
              <div className="bg-white rounded-xl p-3 text-sm text-slate-400 italic max-w-[240px]">Pick a template…</div>
            )}
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}
