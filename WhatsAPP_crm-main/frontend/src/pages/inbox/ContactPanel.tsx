import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Building2, Clock, Mail, Phone, Trash2, X, Plus, CheckCircle2, Pencil, Kanban, BellRing } from 'lucide-react';
import {
  createDeal, createTask, deleteConversation, deleteTask, setArchived, updateDeal, updateTask, usePipeline, useTags, useTasks, useUpdateContact
} from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { Avatar, Badge, Button, ConfirmModal, IconButton, Input, Modal, Select, TagEditor, cn } from '../../components/ui';
import { currency, dateTime, relativeFromNow, toLocalInput } from '../../lib/format';
import { errorMessage } from '../../lib/api';
import { toast } from '../../store/toast';
import type { Contact } from '../../lib/types';

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <div className="px-5 py-4 border-b border-slate-100">
    <div className="flex items-center justify-between mb-2.5">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h4>
      {action}
    </div>
    {children}
  </div>
);

const EditableRow: React.FC<{ icon: React.ElementType; label: string; value: string | null; placeholder: string; onSave: (v: string) => Promise<void>; type?: string }> = ({
  icon: Icon,
  label,
  value,
  placeholder,
  onSave,
  type = 'text'
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  const commit = async () => {
    setEditing(false);
    if (draft.trim() !== (value || '')) await onSave(draft.trim());
  };
  return (
    <div className="flex items-center gap-3 py-2 group">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {editing ? (
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(value || '');
                setEditing(false);
              }
            }}
            className="w-full text-sm border-b border-primary outline-none py-0.5"
          />
        ) : (
          <button onClick={() => setEditing(true)} className={cn('text-sm truncate w-full text-left', value ? 'text-slate-800 font-medium' : 'text-slate-400 italic')}>
            {value || placeholder}
          </button>
        )}
      </div>
      {!editing && <Pencil size={13} className="text-slate-300 opacity-0 group-hover:opacity-100" />}
    </div>
  );
};

const ReminderModal: React.FC<{ open: boolean; onClose: () => void; contact: Contact }> = ({ open, onClose, contact }) => {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(() => toLocalInput(new Date(Date.now() + 24 * 3600e3)));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle(`Follow up with ${contact.name.split(' ')[0]}`);
      const d = new Date(Date.now() + 24 * 3600e3);
      d.setMinutes(0, 0, 0);
      setDue(toLocalInput(d));
    }
  }, [open, contact.name]);
  const quick = (hours: number) => setDue(toLocalInput(new Date(Date.now() + hours * 3600e3)));
  const save = async () => {
    setSaving(true);
    try {
      await createTask({ title: title.trim(), due_at: new Date(due).toISOString(), wa_id: contact.wa_id });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Reminder scheduled', `We'll notify you ${relativeFromNow(new Date(due).toISOString())}.`);
      onClose();
    } catch (e) {
      toast.error('Could not schedule', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a reminder"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!title.trim() || !due}>Schedule</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="What to do" value={title} onChange={e => setTitle(e.target.value)} />
        <Input label="When" type="datetime-local" value={due} onChange={e => setDue(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {[{ h: 1, l: 'In 1 hour' }, { h: 4, l: 'In 4 hours' }, { h: 24, l: 'Tomorrow' }, { h: 72, l: 'In 3 days' }, { h: 168, l: 'Next week' }].map(q => (
            <button key={q.h} onClick={() => quick(q.h)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
              {q.l}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export const ContactPanel: React.FC<{ contact: Contact; onClose: () => void }> = ({ contact, onClose }) => {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const update = useUpdateContact();
  const { data: pipeline } = usePipeline();
  const { data: tagList } = useTags();
  const { data: tasks = [] } = useTasks({ status: 'open', wa_id: contact.wa_id });
  const [notes, setNotes] = useState(contact.notes);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(contact.name);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNotes(contact.notes);
    setName(contact.name);
  }, [contact.wa_id, contact.notes, contact.name]);

  const save = async (patch: Parameters<typeof update.mutateAsync>[0]['patch'], ok?: string) => {
    try {
      await update.mutateAsync({ waId: contact.wa_id, patch });
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error('Could not save', errorMessage(e));
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['contact', contact.wa_id] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
    qc.invalidateQueries({ queryKey: ['pipeline'] });
  };

  const addToPipeline = async () => {
    setBusy(true);
    try {
      await createDeal({ wa_id: contact.wa_id, value: 0 });
      refresh();
      toast.success('Added to pipeline');
    } catch (e) {
      toast.error('Could not add to pipeline', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const moveStage = async (stageId: number) => {
    if (!contact.deal) return;
    try {
      await updateDeal(contact.deal.id, { stage_id: stageId });
      refresh();
    } catch (e) {
      toast.error('Could not move deal', errorMessage(e));
    }
  };

  const archive = async () => {
    try {
      await setArchived(contact.wa_id, !contact.archived);
      refresh();
      toast.success(contact.archived ? 'Moved back to inbox' : 'Conversation archived');
    } catch (e) {
      toast.error('Could not update', errorMessage(e));
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteConversation(contact.wa_id);
      qc.removeQueries({ queryKey: ['messages', contact.wa_id] });
      refresh();
      toast.success('Conversation deleted');
      navigate('/inbox');
    } catch (e) {
      toast.error('Could not delete', errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const originLabel = { inbox: 'Inbound lead', pipeline: 'Pipeline contact', broadcast: 'Broadcast list', manual: 'Added manually' }[contact.origin] || contact.origin;

  return (
    <div className="h-full flex flex-col bg-white overflow-y-auto">
      <div className="flex justify-end p-2 xl:hidden">
        <IconButton icon={X} label="Close details" onClick={onClose} />
      </div>
      <div className="px-5 pt-4 xl:pt-8 pb-5 text-center border-b border-slate-100">
        <Avatar name={contact.name} src={contact.avatar_url} size={80} className="mx-auto ring-4 ring-slate-50" />
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              if (name.trim() && name.trim() !== contact.name) save({ name: name.trim() });
            }}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="mt-3 text-center font-display font-bold text-lg w-full border-b border-primary outline-none"
          />
        ) : (
          <button onClick={() => setEditingName(true)} className="mt-3 font-display font-bold text-lg text-slate-900 hover:text-primary inline-flex items-center gap-1.5 group">
            {contact.name} <Pencil size={13} className="text-slate-300 opacity-0 group-hover:opacity-100" />
          </button>
        )}
        <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
          <Badge>{originLabel}</Badge>
          {contact.opted_out && <Badge tone="red">Opted out</Badge>}
        </div>
      </div>

      <Section
        title="Pipeline"
        action={!contact.deal && isAdmin && (
          <button onClick={addToPipeline} disabled={busy} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
            <Kanban size={12} /> Add to pipeline
          </button>
        )}
      >
        {contact.deal ? (
          <div className="space-y-2">
            <Select value={contact.deal.stage_id ?? ''} onChange={e => moveStage(Number(e.target.value))}>
              {(pipeline?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <p className="text-xs text-slate-500">Deal value <span className="font-bold text-slate-800">{currency(contact.deal.value)}</span></p>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic bg-slate-50 rounded-xl px-3 py-2.5 text-center">Not in the sales pipeline</p>
        )}
      </Section>

      <Section title="Notes" action={update.isPending && <span className="text-[10px] text-slate-400">Saving…</span>}>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => notes !== contact.notes && save({ notes })}
          placeholder="Add a note for your team…"
          rows={3}
          className="w-full text-sm bg-amber-50/60 border border-amber-100 rounded-xl p-3 outline-none focus:border-amber-300 resize-y placeholder:text-slate-400"
        />
      </Section>

      <Section title="Contact info">
        <div className="flex items-center gap-3 py-2">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
            <Phone size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">WhatsApp</p>
            <a href={`https://wa.me/${contact.wa_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-800 hover:text-primary">{contact.phone}</a>
          </div>
        </div>
        <EditableRow icon={Mail} label="Email" type="email" value={contact.email} placeholder="Add email" onSave={v => save({ email: v || null })} />
        <EditableRow icon={Building2} label="Company" value={contact.company} placeholder="Add company" onSave={v => save({ company: v || null })} />
        {Object.entries(contact.custom_fields || {}).map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm py-1.5 border-t border-slate-50">
            <span className="text-slate-400">{k}</span>
            <span className="text-slate-700 font-medium truncate ml-3">{String(v ?? '')}</span>
          </div>
        ))}
      </Section>

      <Section title="Tags">
        <TagEditor tags={contact.tags} onChange={tags => save({ tags })} suggestions={['VIP', ...(tagList || []).map(t => t.name)]} />
      </Section>

      <Section
        title="Reminders"
        action={<button onClick={() => setReminderOpen(true)} className="text-xs font-bold text-primary hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>}
      >
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No open reminders</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-xl group">
                <button
                  className="text-slate-300 hover:text-emerald-500 mt-0.5"
                  aria-label="Mark done"
                  onClick={async () => {
                    await updateTask(t.id, { completed: true });
                    qc.invalidateQueries({ queryKey: ['tasks'] });
                  }}
                >
                  <CheckCircle2 size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">{t.title}</p>
                  <p className={cn('text-xs flex items-center gap-1', new Date(t.due_at) < new Date() ? 'text-danger' : 'text-slate-400')}>
                    <Clock size={11} /> {dateTime(t.due_at)}
                  </p>
                </div>
                <button
                  className="text-slate-300 hover:text-danger opacity-0 group-hover:opacity-100"
                  aria-label="Delete reminder"
                  onClick={async () => {
                    await deleteTask(t.id);
                    qc.invalidateQueries({ queryKey: ['tasks'] });
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="p-5 space-y-2 mt-auto">
        <Button variant="dark" className="w-full" icon={BellRing} onClick={() => setReminderOpen(true)}>Schedule reminder</Button>
        <Button variant="secondary" className="w-full" icon={contact.archived ? ArchiveRestore : Archive} onClick={archive}>
          {contact.archived ? 'Move back to inbox' : 'Archive conversation'}
        </Button>
        {isAdmin && (
          <Button variant="danger" className="w-full" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete conversation</Button>
        )}
      </div>

      <ReminderModal open={reminderOpen} onClose={() => setReminderOpen(false)} contact={contact} />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy}
        title="Delete this conversation?"
        confirmLabel="Delete chat history"
        body={<>All messages with <b>{contact.name}</b> will be permanently deleted and the chat removed from the inbox. The contact, their deal and list memberships are kept.</>}
      />
    </div>
  );
};
