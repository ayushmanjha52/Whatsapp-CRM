import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, UserPlus, Search, Users, MessageSquare, Trash2, Radio, FileSpreadsheet, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { createContact, deleteContact, importContacts, useContacts, useTags, type ContactQuery } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Badge, Button, ConfirmModal, EmptyState, ErrorState, IconButton, Input, Modal, Select, Spinner, TagEditor, Toggle, cn, tagTone } from '../components/ui';
import { buildImportRows, guessColumnRole, parseCsv, type ColumnRole } from '../lib/csv';
import { listTime } from '../lib/format';
import { errorMessage } from '../lib/api';
import { toast } from '../store/toast';
import type { Contact } from '../lib/types';

const ORIGIN_LABEL: Record<string, string> = { inbox: 'Inbox', pipeline: 'Pipeline', broadcast: 'Broadcast', manual: 'Manual' };

const AddContactModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const qc = useQueryClient();
  const { data: tags } = useTags();
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', tags: [] as string[], add_to_inbox: false });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({ name: '', phone: '', email: '', company: '', tags: [], add_to_inbox: false });
  }, [open]);
  const save = async () => {
    setSaving(true);
    try {
      await createContact({ ...form, email: form.email || undefined, company: form.company || undefined });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Contact added');
      onClose();
    } catch (e) {
      toast.error('Could not add contact', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contact"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!form.name.trim() || form.phone.replace(/\D/g, '').length < 8}>Add contact</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Input label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="col-span-2 sm:col-span-1" />
        <Input label="WhatsApp number" placeholder="+14155552671" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="col-span-2 sm:col-span-1" />
        <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="col-span-2 sm:col-span-1" />
        <Input label="Company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className="col-span-2 sm:col-span-1" />
        <div className="col-span-2 space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tags</p>
          <TagEditor tags={form.tags} onChange={t => setForm(f => ({ ...f, tags: t }))} suggestions={(tags || []).map(t => t.name)} />
        </div>
        <div className="col-span-2">
          <Toggle checked={form.add_to_inbox} onChange={v => setForm(f => ({ ...f, add_to_inbox: v }))} label="Show in Inbox now (otherwise it appears when they reply)" />
        </div>
      </div>
    </Modal>
  );
};

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'phone', label: 'Phone number' },
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'tags', label: 'Tags' },
  { value: 'custom', label: 'Custom field' },
  { value: 'ignore', label: "Don't import" }
];

const ImportModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importContacts>> | null>(null);

  useEffect(() => {
    if (!open) {
      setFileName('');
      setHeaders([]);
      setRows([]);
      setRoles([]);
      setResult(null);
      setTags([]);
    }
  }, [open]);

  const load = async (f: File | undefined) => {
    if (!f) return;
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) return toast.error('Empty file', 'The CSV needs a header row and at least one contact.');
    setFileName(f.name);
    setHeaders(parsed[0]);
    setRows(parsed.slice(1));
    setRoles(parsed[0].map(guessColumnRole));
    setTags([f.name.replace(/\.[^.]+$/, '').slice(0, 40)]);
  };

  const hasPhone = roles.includes('phone');
  const run = async () => {
    setImporting(true);
    try {
      const r = await importContacts(buildImportRows(rows, roles, headers), tags);
      setResult(r);
      qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch (e) {
      toast.error('Import failed', errorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Import contacts"
      description="Upload a CSV. Imported contacts join your broadcast lists and appear in the Inbox only once they reply."
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : rows.length > 0 ? (
          <>
            <Button variant="secondary" onClick={() => setRows([])}>Choose another file</Button>
            <Button icon={Upload} onClick={run} loading={importing} disabled={!hasPhone}>Import {rows.length} contacts</Button>
          </>
        ) : undefined
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="text-emerald-600" />
            <p className="text-sm text-emerald-800">
              <b>{result.inserted}</b> new contacts added, <b>{result.updated}</b> existing contacts updated.
            </p>
          </div>
          {result.invalid.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle size={16} /> {result.invalid.length} rows skipped (invalid phone number)</p>
              <p className="text-xs text-amber-700 mt-1">Numbers need a country code, e.g. +14155552671.</p>
              <p className="text-xs text-amber-700 mt-2 font-mono">{result.invalid.slice(0, 8).map(r => `row ${r.row}: ${r.phone || '(empty)'}`).join(' · ')}{result.invalid.length > 8 ? ' …' : ''}</p>
            </div>
          )}
        </div>
      ) : rows.length === 0 ? (
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            load(e.dataTransfer.files?.[0]);
          }}
          className="w-full border-2 border-dashed border-slate-300 hover:border-primary rounded-2xl py-14 flex flex-col items-center gap-3 text-slate-500 hover:text-primary transition"
        >
          <FileSpreadsheet size={36} />
          <span className="font-semibold">Drop a CSV here or click to browse</span>
          <span className="text-xs text-slate-400">Columns like name, phone, email, company — anything else becomes a custom field.</span>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => load(e.target.files?.[0])} />
        </button>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-600"><b>{fileName}</b> · {rows.length} rows. Check what each column contains:</p>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="p-2 text-left align-top min-w-[150px]">
                      <p className="text-xs font-bold text-slate-700 mb-1.5 truncate">{h || `Column ${i + 1}`}</p>
                      <select
                        value={roles[i]}
                        onChange={e => setRoles(r => r.map((x, j) => (j === i ? (e.target.value as ColumnRole) : x)))}
                        className={cn('w-full text-xs border rounded-lg px-2 py-1.5 bg-white', roles[i] === 'phone' ? 'border-primary text-primary font-semibold' : 'border-slate-200')}
                      >
                        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {headers.map((_, j) => <td key={j} className={cn('p-2 text-xs truncate max-w-[200px]', roles[j] === 'ignore' ? 'text-slate-300' : 'text-slate-600')}>{r[j]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasPhone && <p className="text-sm text-danger font-medium">Mark one column as “Phone number”.</p>}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tag everyone in this import</p>
            <TagEditor tags={tags} onChange={setTags} />
            <p className="text-xs text-slate-400">Use tags to target this list in a broadcast.</p>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default function Contacts() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [params, setParams] = useState<ContactQuery>({ audience: 'all', page: 1, page_size: 50 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Contact | null>(null);
  const { data: tags } = useTags();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const query = useMemo(() => ({ ...params, q: debounced || undefined }), [params, debounced]);
  useEffect(() => setParams(p => ({ ...p, page: 1 })), [debounced]);
  const { data, isLoading, error, refetch, isFetching } = useContacts(query);
  const pages = data ? Math.max(1, Math.ceil(data.total / (data.page_size || 50))) : 1;

  const toggle = (id: number) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const pageIds = (data?.contacts || []).map(c => c.id);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selected.has(id));

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteContact(toDelete.wa_id);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('Contact deleted');
    } catch (e) {
      toast.error('Could not delete', errorMessage(e));
    } finally {
      setToDelete(null);
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-900">Contacts</h2>
          <p className="text-sm text-slate-500 mt-1">Everyone you can reach on WhatsApp — from the inbox, the pipeline and imported lists.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && <Button variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>Import CSV</Button>}
          <Button icon={UserPlus} onClick={() => setAddOpen(true)}>Add contact</Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-card overflow-hidden">
        <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center border-b border-slate-100">
          <Input icon={Search} placeholder="Search name, phone, email or company" value={search} onChange={e => setSearch(e.target.value)} className="md:w-80" />
          <Select value={params.audience} onChange={e => setParams(p => ({ ...p, audience: e.target.value as ContactQuery['audience'], page: 1 }))} className="md:w-48">
            <option value="all">All contacts</option>
            <option value="inbox">In inbox</option>
            <option value="broadcast_only">Broadcast only</option>
            <option value="pipeline">In pipeline</option>
          </Select>
          <Select value={params.tag || ''} onChange={e => setParams(p => ({ ...p, tag: e.target.value || undefined, page: 1 }))} className="md:w-48">
            <option value="">Any tag</option>
            {(tags || []).map(t => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
          </Select>
          <div className="md:ml-auto flex items-center gap-3">
            {isFetching && <Spinner size={16} />}
            {selected.size > 0 && isAdmin && (
              <Button variant="dark" size="sm" icon={Radio} onClick={() => navigate('/broadcast/new', { state: { contactIds: [...selected] } })}>
                Broadcast to {selected.size}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center"><Spinner /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !data || data.contacts.length === 0 ? (
          <EmptyState icon={Users} title="No contacts found" body={debounced || params.tag ? 'Try clearing the filters.' : 'Add contacts one by one or import a CSV list.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70">
                  <th className="pl-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select page"
                      checked={allOnPage}
                      onChange={() => setSelected(s => {
                        const n = new Set(s);
                        pageIds.forEach(id => (allOnPage ? n.delete(id) : n.add(id)));
                        return n;
                      })}
                      className="accent-primary w-4 h-4"
                    />
                  </th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3 hidden md:table-cell">Company</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Email</th>
                  <th className="px-3 py-3">Tags</th>
                  <th className="px-3 py-3 hidden md:table-cell">Source</th>
                  <th className="px-3 py-3 hidden sm:table-cell">Last message</th>
                  <th className="px-3 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {data.contacts.map(c => (
                  <tr key={c.id} className={cn('border-t border-slate-100 hover:bg-slate-50/60', selected.has(c.id) && 'bg-blue-50/40')}>
                    <td className="pl-4 py-3">
                      <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary w-4 h-4" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} src={c.avatar_url} size={34} />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-slate-600">{c.company || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 hidden lg:table-cell text-slate-600">{c.email || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {c.opted_out && <Badge tone="red">Opted out</Badge>}
                        {c.deal?.stage_name && <Badge tone="violet">{c.deal.stage_name}</Badge>}
                        {c.tags.slice(0, 3).map(t => <Badge key={t} tone={tagTone(t)} className="normal-case">{t}</Badge>)}
                        {c.tags.length > 3 && <span className="text-xs text-slate-400">+{c.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className="text-xs text-slate-500">{ORIGIN_LABEL[c.origin] || c.origin}</span>
                      {!c.in_inbox && <span className="block text-[10px] text-slate-400">not in inbox yet</span>}
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell text-xs text-slate-500 whitespace-nowrap">{listTime(c.last_message_at) || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton icon={MessageSquare} label="Open chat" onClick={() => navigate(`/inbox/${c.wa_id}`)} />
                        {isAdmin && <IconButton icon={Trash2} tone="danger" label="Delete contact" onClick={() => setToDelete(c)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>
              {data.total} contacts{selected.size > 0 && <> · <b className="text-slate-700">{selected.size} selected</b> <button className="text-primary font-semibold ml-1" onClick={() => setSelected(new Set())}>clear</button></>}
            </span>
            <div className="flex items-center gap-2">
              <IconButton icon={ChevronLeft} label="Previous page" disabled={(params.page || 1) <= 1} onClick={() => setParams(p => ({ ...p, page: (p.page || 1) - 1 }))} />
              <span className="text-xs">Page {params.page} of {pages}</span>
              <IconButton icon={ChevronRight} label="Next page" disabled={(params.page || 1) >= pages} onClick={() => setParams(p => ({ ...p, page: (p.page || 1) + 1 }))} />
            </div>
          </div>
        )}
      </div>

      <AddContactModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete contact?"
        confirmLabel="Delete permanently"
        body={<>This permanently deletes <b>{toDelete?.name}</b>, their chat history, deal and reminders.</>}
      />
    </div>
  );
}
