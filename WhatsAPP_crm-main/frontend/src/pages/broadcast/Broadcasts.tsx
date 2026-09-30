import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Radio, Clock, Send, CheckCircle2, XCircle, Loader2, FileEdit, CornerDownRight } from 'lucide-react';
import { useCampaigns } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, EmptyState, ErrorState, PageLoader, type Tone } from '../../components/ui';
import { compact, dateTime, pct } from '../../lib/format';
import type { Campaign, CampaignStatus } from '../../lib/types';

export const STATUS_META: Record<CampaignStatus, { tone: Tone; label: string; icon: React.ElementType }> = {
  draft: { tone: 'slate', label: 'Draft', icon: FileEdit },
  scheduled: { tone: 'blue', label: 'Scheduled', icon: Clock },
  sending: { tone: 'amber', label: 'Sending', icon: Loader2 },
  completed: { tone: 'green', label: 'Completed', icon: CheckCircle2 },
  cancelled: { tone: 'slate', label: 'Cancelled', icon: XCircle },
  failed: { tone: 'red', label: 'Failed', icon: XCircle }
};

export const StatusBadge: React.FC<{ status: CampaignStatus }> = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <Badge tone={m.tone}>
      <m.icon size={11} className={status === 'sending' ? 'animate-spin' : ''} /> {m.label}
    </Badge>
  );
};

/** Sent → delivered → read → replied, as a compact funnel. */
export const Funnel: React.FC<{ c: Campaign }> = ({ c }) => {
  const s = c.stats;
  const steps = [
    { label: 'Sent', value: s.sent, of: s.total },
    { label: 'Delivered', value: s.delivered, of: s.sent },
    { label: 'Read', value: s.read, of: s.sent },
    { label: 'Replied', value: s.replied, of: s.sent }
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {steps.map(st => (
        <div key={st.label}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{st.label}</p>
          <p className="text-lg font-display font-bold text-slate-900">{compact(st.value)}</p>
          <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${pct(st.value, st.of)}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{pct(st.value, st.of)}%</p>
        </div>
      ))}
    </div>
  );
};

export default function Broadcasts() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useCampaigns();

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-900">Broadcasts</h2>
          <p className="text-sm text-slate-500 mt-1">Send approved templates to your lists. Replies land in the Inbox automatically.</p>
        </div>
        {isAdmin && <Button icon={Plus} onClick={() => navigate('/broadcast/new')}>New campaign</Button>}
      </div>

      {!data || data.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/70">
          <EmptyState
            icon={Radio}
            title="No campaigns yet"
            body="Import a contact list, pick an approved template and send it to hundreds of customers at once — with delivery, read and reply tracking."
            action={isAdmin && <Button icon={Send} onClick={() => navigate('/broadcast/new')}>Create your first campaign</Button>}
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {data.map(c => (
            <Link key={c.id} to={`/broadcast/${c.id}`} className="bg-white rounded-2xl border border-slate-200/70 shadow-card p-5 hover:shadow-card-hover hover:border-primary/30 transition block">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <p className="font-display font-bold text-slate-900 truncate flex items-center gap-1.5">
                    {c.parent_campaign_id && <CornerDownRight size={14} className="text-slate-400 flex-shrink-0" />}
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    <span className="font-mono">{c.template_name}</span> · {c.stats.total} recipients ·{' '}
                    {c.status === 'scheduled' && c.scheduled_at ? `scheduled for ${dateTime(c.scheduled_at)}` : dateTime(c.started_at || c.created_at)}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              {c.status === 'draft' || c.status === 'scheduled' ? (
                <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
                  {c.status === 'draft' ? 'Not sent yet — open to review and send.' : 'Waiting for the scheduled time.'}
                </p>
              ) : (
                <Funnel c={c} />
              )}
              {c.stats.failed > 0 && <p className="text-xs text-danger mt-3">{c.stats.failed} failed</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
