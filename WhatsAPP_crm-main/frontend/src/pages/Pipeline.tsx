import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, MessageSquare, Plus, Search, Trash2, Kanban, GripVertical } from 'lucide-react';
import { createDeal, deleteDeal, updateDeal, usePipeline, useTags, type DealInput } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Badge, Button, ConfirmModal, EmptyState, ErrorState, Input, Modal, PageLoader, Select, TagEditor, Textarea, cn, tagTone } from '../components/ui';
import { currency, shortDate } from '../lib/format';
import { errorMessage } from '../lib/api';
import { stageColor } from '../lib/colors';
import { toast } from '../store/toast';
import type { Deal, Stage } from '../lib/types';

type PipelineData = { stages: Stage[]; deals: Deal[] };

const DealCard: React.FC<{ deal: Deal; onOpen: () => void; draggable: boolean; onDragStart: (e: React.DragEvent) => void }> = ({ deal, onOpen, draggable, onDragStart }) => {
  const navigate = useNavigate();
  const c = deal.contact;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition cursor-pointer group active:cursor-grabbing"
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar name={c?.name || '?'} src={c?.avatar_url} size={36} />
          {!!c?.unread_count && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-danger rounded-full ring-2 ring-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-900 truncate">{deal.title || c?.name}</p>
          <p className="text-[11px] text-slate-500 uppercase tracking-wide truncate">{deal.title ? c?.name : c?.company || c?.phone}</p>
        </div>
        {draggable && <GripVertical size={14} className="text-slate-300 opacity-0 group-hover:opacity-100" />}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">{currency(deal.value)}</span>
        <div className="flex gap-1">{deal.tags.slice(0, 2).map(t => <Badge key={t} tone={tagTone(t)} className="normal-case">{t}</Badge>)}</div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><Calendar size={12} /> {shortDate(deal.stage_changed_at || deal.created_at)}</span>
        {c && (
          <button
            onClick={e => {
              e.stopPropagation();
              navigate(`/inbox/${c.wa_id}`);
            }}
            className="flex items-center gap-1 hover:text-primary font-semibold"
          >
            <MessageSquare size={12} /> Chat
          </button>
        )}
      </div>
    </div>
  );
};

const DealModal: React.FC<{ open: boolean; onClose: () => void; stages: Stage[]; deal?: Deal | null; defaultStage?: number }> = ({ open, onClose, stages, deal, defaultStage }) => {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: tags } = useTags();
  const [form, setForm] = useState({ name: '', phone: '', company: '', title: '', value: '0', notes: '', tags: [] as string[], stage_id: 0 });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      deal
        ? { name: deal.contact?.name || '', phone: deal.contact?.phone || '', company: deal.contact?.company || '', title: deal.title || '', value: String(deal.value), notes: deal.notes, tags: deal.tags, stage_id: deal.stage_id }
        : { name: '', phone: '', company: '', title: '', value: '', notes: '', tags: [], stage_id: defaultStage || stages[0]?.id || 0 }
    );
  }, [open, deal, defaultStage, stages]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      if (deal) {
        const patch: any = { notes: form.notes, stage_id: Number(form.stage_id) };
        if (isAdmin) Object.assign(patch, { value: Number(form.value || 0), title: form.title || null, tags: form.tags });
        await updateDeal(deal.id, patch);
        toast.success('Deal updated');
      } else {
        const body: DealInput = { name: form.name.trim(), phone: form.phone, company: form.company || undefined, title: form.title || undefined, value: Number(form.value || 0), notes: form.notes, tags: form.tags, stage_id: Number(form.stage_id) };
        await createDeal(body);
        toast.success('Deal created', 'The contact now appears in your inbox too.');
      }
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    } catch (e) {
      toast.error('Could not save deal', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deal) return;
    try {
      await deleteDeal(deal.id);
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('Deal removed from pipeline');
      onClose();
    } catch (e) {
      toast.error('Could not delete', errorMessage(e));
    }
  };

  const valid = deal ? true : form.name.trim().length > 0 && form.phone.replace(/\D/g, '').length >= 8;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={deal ? 'Edit deal' : 'New deal'}
        description={deal ? deal.contact?.phone : 'Creates the contact (if new) and puts it in your pipeline and inbox.'}
        footer={
          <>
            {deal && isAdmin && <Button variant="danger" icon={Trash2} className="mr-auto" onClick={() => setConfirmDelete(true)}>Remove</Button>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!valid}>{deal ? 'Save' : 'Create deal'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {!deal && (
            <>
              <Input label="Contact name" value={form.name} onChange={set('name')} className="col-span-2 sm:col-span-1" />
              <Input label="WhatsApp number" value={form.phone} onChange={set('phone')} placeholder="+14155552671" className="col-span-2 sm:col-span-1" />
              <Input label="Company" value={form.company} onChange={set('company')} className="col-span-2" />
            </>
          )}
          <Input label="Deal title" value={form.title} onChange={set('title')} placeholder="e.g. Annual plan" disabled={!isAdmin} className="col-span-2 sm:col-span-1" />
          <Input label="Value (USD)" type="number" min={0} value={form.value} onChange={set('value')} disabled={!isAdmin} className="col-span-2 sm:col-span-1" />
          <Select label="Stage" value={form.stage_id} onChange={set('stage_id')} className="col-span-2">
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div className="col-span-2 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tags</p>
            {isAdmin ? <TagEditor tags={form.tags} onChange={t => setForm(f => ({ ...f, tags: t }))} suggestions={(tags || []).map(t => t.name)} /> : <p className="text-sm text-slate-500">{form.tags.join(', ') || '—'}</p>}
          </div>
          <Textarea label="Notes" value={form.notes} onChange={set('notes')} className="col-span-2" rows={3} />
        </div>
      </Modal>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Remove this deal?"
        confirmLabel="Remove deal"
        body="The deal leaves the pipeline. The contact and chat history are kept."
      />
    </>
  );
};

export default function Pipeline() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = usePipeline();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Deal | null>(null);
  const [creating, setCreating] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<number | null>(null);

  const deals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.deals || []).filter(d => !q || [d.title, d.contact?.name, d.contact?.company, d.contact?.phone, ...d.tags].some(v => v?.toLowerCase().includes(q)));
  }, [data, search]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const move = async (dealId: number, stageId: number) => {
    const deal = data.deals.find(d => d.id === dealId);
    if (!deal || deal.stage_id === stageId) return;
    const prev = qc.getQueryData<PipelineData>(['pipeline']);
    qc.setQueryData<PipelineData>(['pipeline'], d => d && { ...d, deals: d.deals.map(x => (x.id === dealId ? { ...x, stage_id: stageId, stage_changed_at: new Date().toISOString() } : x)) });
    try {
      await updateDeal(dealId, { stage_id: stageId });
      const stage = data.stages.find(s => s.id === stageId);
      if (stage && stage.id === data.stages[data.stages.length - 1].id) toast.success('Deal converted 🎉', `${deal.contact?.name} · ${currency(deal.value)}`);
    } catch (e) {
      qc.setQueryData(['pipeline'], prev);
      toast.error('Could not move deal', errorMessage(e));
    }
  };

  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <div className="p-4 lg:p-8 h-full flex flex-col gap-6 min-h-0">
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-900">Deals pipeline</h2>
          <p className="text-sm text-slate-500 mt-0.5">{deals.length} deals · {currency(total)} total value. Drag cards between stages.</p>
        </div>
        <div className="flex items-center gap-3">
          <Input icon={Search} placeholder="Search deals" value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-64" />
          {isAdmin && <Button icon={Plus} onClick={() => setCreating(data.stages[0]?.id ?? 0)}>New deal</Button>}
        </div>
      </div>

      {data.deals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/70">
          <EmptyState
            icon={Kanban}
            title="Your pipeline is empty"
            body="Add a deal here, or open a conversation in the Inbox and click “Add to pipeline”."
            action={isAdmin && <Button icon={Plus} onClick={() => setCreating(data.stages[0]?.id ?? 0)}>Create first deal</Button>}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-5 overflow-x-auto pb-2">
          {data.stages.map((stage, i) => {
            const items = deals.filter(d => d.stage_id === stage.id);
            const value = items.reduce((s, d) => s + d.value, 0);
            return (
              <div
                key={stage.id}
                onDragOver={e => {
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage(s => (s === stage.id ? null : s))}
                onDrop={e => {
                  e.preventDefault();
                  const id = Number(e.dataTransfer.getData('text/plain'));
                  setOverStage(null);
                  setDragId(null);
                  if (id) move(id, stage.id);
                }}
                className={cn(
                  'flex-1 min-w-[260px] max-w-[380px] flex flex-col rounded-2xl border transition-colors min-h-0',
                  overStage === stage.id && dragId ? 'bg-blue-50/70 border-primary/40' : 'bg-slate-100/60 border-slate-200/70'
                )}
              >
                <div className="p-4 bg-white rounded-t-2xl border-b border-slate-200/70">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: stageColor(i) }} />
                      {stage.name}
                    </h3>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 rounded-md px-2 py-0.5">{items.length}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 text-right">
                    Value <span className="font-bold text-slate-700">{currency(value)}</span>
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {items.map(d => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      draggable
                      onOpen={() => setEditing(d)}
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', String(d.id));
                        e.dataTransfer.effectAllowed = 'move';
                        setDragId(d.id);
                      }}
                    />
                  ))}
                  {items.length === 0 && <p className="text-xs text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">Drop deals here</p>}
                  {isAdmin && (
                    <button onClick={() => setCreating(stage.id)} className="w-full text-xs font-semibold text-slate-400 hover:text-primary py-2 flex items-center justify-center gap-1">
                      <Plus size={13} /> Add deal
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DealModal open={!!editing} onClose={() => setEditing(null)} stages={data.stages} deal={editing} />
      <DealModal open={creating !== null} onClose={() => setCreating(null)} stages={data.stages} defaultStage={creating ?? undefined} />
    </div>
  );
}
