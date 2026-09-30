import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, XCircle, Trash2, CornerDownRight, MessageSquare, ChevronLeft, ChevronRight, AlertCircle, Reply } from 'lucide-react';
import { cancelCampaign, deleteCampaign, sendDraft, useCampaign } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorState, IconButton, PageLoader, Segmented, cn, type Tone } from '../../components/ui';
import { dateTime, pct } from '../../lib/format';
import { errorMessage } from '../../lib/api';
import { toast } from '../../store/toast';
import { StatusBadge } from './Broadcasts';

const RECIPIENT_TONE: Record<string, Tone> = { pending: 'slate', queued: 'slate', sent: 'blue', delivered: 'blue', read: 'green', failed: 'red', skipped: 'slate' };
const FILTERS = ['all', 'read', 'delivered', 'sent', 'failed', 'replied', 'pending'] as const;

export default function CampaignDetail() {
  const { id } = useParams();
  const campaignId = Number(id);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('all');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useCampaign(campaignId, status, page);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const c = data.campaign;
  const s = c.stats;
  const pages = Math.max(1, Math.ceil(data.recipients_total / data.page_size));
  const progress = pct(s.total - s.pending, s.total);

  const act = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      toast.success(ok);
      after?.();
    } catch (e) {
      toast.error('Something went wrong', errorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const tiles = [
    { label: 'Recipients', value: s.total, sub: s.pending ? `${s.pending} waiting` : 'all processed' },
    { label: 'Sent', value: s.sent, sub: `${pct(s.sent, s.total)}%` },
    { label: 'Delivered', value: s.delivered, sub: `${pct(s.delivered, s.sent)}% of sent` },
    { label: 'Read', value: s.read, sub: `${pct(s.read, s.sent)}% of sent` },
    { label: 'Replied', value: s.replied, sub: `${s.reply_rate}% reply rate` },
    { label: 'Failed', value: s.failed, sub: `${pct(s.failed, s.total)}%`, danger: s.failed > 0 }
  ];

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link to="/broadcast" className="p-2 rounded-lg hover:bg-white text-slate-500 mt-0.5"><ArrowLeft size={18} /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-display font-bold text-2xl text-slate-900 truncate">{c.name}</h2>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Template <span className="font-mono">{c.template_name}</span> ({c.template_language}) ·{' '}
              {c.status === 'scheduled' ? `scheduled for ${dateTime(c.scheduled_at)}` : c.started_at ? `started ${dateTime(c.started_at)}` : `created ${dateTime(c.created_at)}`}
              {c.completed_at && c.status === 'completed' && ` · finished ${dateTime(c.completed_at)}`}
            </p>
            {c.parent_campaign_id && (
              <Link to={`/broadcast/${c.parent_campaign_id}`} className="text-xs font-semibold text-primary flex items-center gap-1 mt-1"><CornerDownRight size={12} /> Follow-up of an earlier campaign</Link>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            {c.status === 'draft' && <Button icon={Send} loading={busy} onClick={() => act(() => sendDraft(c.id), 'Campaign is sending')}>Send now</Button>}
            {['draft', 'scheduled', 'sending'].includes(c.status) && <Button variant="danger" icon={XCircle} onClick={() => setConfirm('cancel')}>Cancel</Button>}
            {['completed', 'cancelled', 'failed'].includes(c.status) && s.sent > 0 && (
              <Button icon={Reply} onClick={() => navigate('/broadcast/new', { state: { followUp: { parentId: c.id, parentName: c.name } } })}>Follow up</Button>
            )}
            {!['scheduled', 'sending'].includes(c.status) && <IconButton icon={Trash2} tone="danger" label="Delete campaign" onClick={() => setConfirm('delete')} />}
          </div>
        )}
      </div>

      {c.last_error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-center gap-2"><AlertCircle size={16} /> {c.last_error}</div>
      )}

      {c.status === 'sending' && (
        <Card className="p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-slate-700">Sending…</span>
            <span className="text-slate-500">{s.total - s.pending} / {s.total}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {tiles.map(t => (
          <Card key={t.label} className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t.label}</p>
            <p className={cn('text-2xl font-display font-bold mt-1', t.danger ? 'text-danger' : 'text-slate-900')}>{t.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{t.sub}</p>
          </Card>
        ))}
      </div>

      {data.follow_ups.length > 0 && (
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Follow-ups</span>
          {data.follow_ups.map(f => (
            <Link key={f.id} to={`/broadcast/${f.id}`} className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"><CornerDownRight size={12} /> {f.name}</Link>
          ))}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="font-display font-bold text-slate-900">Recipients</h3>
          <Segmented
            value={status}
            onChange={v => {
              setStatus(v);
              setPage(1);
            }}
            options={FILTERS.map(f => ({ value: f, label: f }))}
          />
        </div>
        {data.recipients.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Nobody in this view" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70">
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden md:table-cell">Sent</th>
                  <th className="px-4 py-3 hidden md:table-cell">Read</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Replied</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {data.recipients.map(r => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{r.contact?.name || 'Deleted contact'}</p>
                      <p className="text-xs text-slate-500">{r.contact?.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge tone={RECIPIENT_TONE[r.status] || 'slate'}>{r.status}</Badge>
                        {r.replied_at && <Badge tone="violet">replied</Badge>}
                      </div>
                      {r.error && <p className="text-xs text-danger mt-1 max-w-xs">{r.error.details || r.error.message || r.error.title}</p>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">{dateTime(r.sent_at)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">{dateTime(r.read_at)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">{dateTime(r.replied_at)}</td>
                    <td className="px-4 py-3">{r.contact && <IconButton icon={MessageSquare} label="Open chat" onClick={() => navigate(`/inbox/${r.contact!.wa_id}`)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs text-slate-500">
            <IconButton icon={ChevronLeft} label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)} />
            Page {page} of {pages}
            <IconButton icon={ChevronRight} label="Next page" disabled={page >= pages} onClick={() => setPage(p => p + 1)} />
          </div>
        )}
      </Card>

      <ConfirmModal
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        loading={busy}
        onConfirm={() => act(() => cancelCampaign(c.id), 'Campaign cancelled')}
        title="Cancel this campaign?"
        confirmLabel="Stop sending"
        body="Nothing more will be sent. Messages WhatsApp already accepted can't be recalled."
      />
      <ConfirmModal
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        loading={busy}
        onConfirm={() => act(() => deleteCampaign(c.id), 'Campaign deleted', () => navigate('/broadcast'))}
        title="Delete this campaign?"
        confirmLabel="Delete"
        body="Its statistics are removed. Messages already sent stay in each contact's chat history."
      />
    </div>
  );
}
