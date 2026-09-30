import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, CheckCircle2, Clock, MessageSquare, Radio, TrendingUp, Users, Kanban, ArrowRight } from 'lucide-react';
import { updateTask, useDashboard } from '../api';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorState, PageLoader, cn } from '../components/ui';
import { compact, currency, duration, listTime, pct, time } from '../lib/format';
import { INK, SERIES, stageColor } from '../lib/colors';

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' }
];

const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType; tone?: 'blue' | 'red' | 'amber' | 'green'; to?: string }> = ({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'blue',
  to
}) => {
  const tones = { blue: 'bg-blue-50 text-primary', red: 'bg-rose-50 text-danger', amber: 'bg-amber-50 text-amber-600', green: 'bg-emerald-50 text-emerald-600' };
  const body = (
    <Card className="p-5 h-full hover:shadow-card-hover hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <div className={cn('p-2 rounded-xl', tones[tone])}>
          <Icon size={18} strokeWidth={2.4} />
        </div>
      </div>
      <p className="text-3xl font-display font-bold text-slate-900 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
    </Card>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
};

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-slate-300">{p.name}</span>
          <span className="font-bold ml-auto pl-3">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [days, setDays] = useState(7);
  const { data, isLoading, error, refetch } = useDashboard(days);
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const volume = data.volume.map(v => ({
    ...v,
    label: new Date(v.date + 'T12:00:00').toLocaleDateString([], days <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
  }));
  const r = data.response;
  const p = data.pipeline;
  const b = data.broadcast;
  const maxStage = Math.max(1, ...p.stages.map(s => s.count));

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-900">Overview</h2>
          <p className="text-slate-500 text-sm mt-1">How your WhatsApp conversations, pipeline and campaigns are doing.</p>
        </div>
        <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl">
          {RANGES.map(o => (
            <button
              key={o.days}
              onClick={() => setDays(o.days)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition', days === o.days ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Avg first reply" value={r.answered ? duration(r.avg_seconds) : '—'} sub={r.within_30m_pct !== null ? `${r.within_30m_pct}% answered within 30m` : 'No customer messages yet'} icon={Clock} />
        <Kpi
          label="Unread chats"
          value={data.kpis.unread_conversations}
          sub={`${data.kpis.open_conversations} open conversations`}
          icon={AlertCircle}
          tone={data.kpis.unread_conversations > 0 ? 'red' : 'green'}
          to="/inbox?filter=unread"
        />
        <Kpi label="Messages" value={compact(data.kpis.messages_in + data.kpis.messages_out)} sub={`${compact(data.kpis.messages_in)} in · ${compact(data.kpis.messages_out)} out`} icon={MessageSquare} />
        <Kpi label="Open pipeline" value={currency(p.open_value)} sub={`${p.total_deals} deals · ${p.win_rate ?? 0}% win rate`} icon={TrendingUp} tone="green" to="/pipeline" />
        <Kpi
          label="Due today"
          value={data.kpis.tasks_due_today}
          sub={data.kpis.overdue_tasks > 0 ? `${data.kpis.overdue_tasks} overdue` : 'Follow-ups on track'}
          icon={CheckCircle2}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Message volume"
            subtitle="Inbound vs outbound messages per day"
            actions={
              <div className="flex gap-4 text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: SERIES.inbound }} /> Inbound</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: SERIES.outbound }} /> Outbound</span>
              </div>
            }
          />
          <div className="h-72 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume} margin={{ top: 8, right: 20, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: INK.muted, fontSize: 12 }} dy={8} interval="preserveStartEnd" minTickGap={16} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: INK.muted, fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                <Line isAnimationActive={false} type="monotone" name="Inbound" dataKey="inbound" stroke={SERIES.inbound} strokeWidth={2} dot={days <= 7 ? { r: 4, fill: SERIES.inbound, stroke: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
                <Line isAnimationActive={false} type="monotone" name="Outbound" dataKey="outbound" stroke={SERIES.outbound} strokeWidth={2} dot={days <= 7 ? { r: 4, fill: SERIES.outbound, stroke: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="First reply time" subtitle={`${r.turns} customer message${r.turns === 1 ? '' : 's'} needing a reply`} />
          <div className="h-56 px-2">
            {r.turns === 0 ? (
              <EmptyState icon={Clock} title="No data yet" body="Reply times appear once customers message you." className="py-8" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.buckets} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 8 }} barSize={18}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis dataKey="range" type="category" axisLine={false} tickLine={false} width={60} tick={{ fill: INK.secondary, fontSize: 12, fontWeight: 600 }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar isAnimationActive={false} dataKey="count" name="Conversations" fill={SERIES.inbound} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" fill={INK.secondary} fontSize={12} fontWeight={600} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mx-6 py-4 border-t border-slate-100 text-sm text-slate-500 text-center">
            {r.unanswered > 0 ? (
              <span><span className="font-bold text-slate-900">{r.unanswered}</span> still waiting for a reply</span>
            ) : (
              <span>Every customer message has been answered</span>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="overflow-hidden flex flex-col">
          <CardHeader title="Priority inbox" actions={<Link to="/inbox" className="text-xs font-bold text-primary hover:underline">View all</Link>} className="border-b border-slate-100" />
          <div className="flex-1">
            {data.priority_inbox.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No conversations yet" body="Messages sent to your WhatsApp number show up here." />
            ) : (
              data.priority_inbox.map(c => (
                <button key={c.wa_id} onClick={() => navigate(`/inbox/${c.wa_id}`)} className="w-full text-left px-5 py-3.5 border-b border-slate-50 hover:bg-blue-50/40 flex items-center gap-3">
                  <div className="relative">
                    <Avatar name={c.name} src={c.avatar_url} size={40} />
                    {c.unread_count > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">{c.unread_count}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <p className={cn('text-sm truncate', c.unread_count ? 'font-bold text-slate-900' : 'font-semibold text-slate-700')}>{c.name}</p>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">{listTime(c.last_message_at)}</span>
                    </div>
                    <p className={cn('text-xs truncate mt-0.5', c.unread_count ? 'text-slate-700 font-medium' : 'text-slate-500')}>{c.last_message_preview}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Pipeline health" subtitle={p.avg_cycle_days ? `Avg ${p.avg_cycle_days} days to convert` : `${currency(p.won_value)} converted`} />
          <div className="px-6 space-y-4 flex-1">
            {p.stages.map((s, i) => (
              <div key={s.id} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: stageColor(i) }} />
                    {s.name}
                  </span>
                  <span className="text-slate-900 font-semibold">
                    {s.count} <span className="text-slate-400 font-normal">· {currency(s.value)}</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(s.count / maxStage) * 100}%`, background: stageColor(i) }} />
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 pt-5">
            <Link to="/pipeline" className="w-full py-3 bg-slate-50 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 uppercase tracking-wide flex items-center justify-center gap-2">
              <Kanban size={14} /> Manage deals
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Follow-ups today" actions={<Badge tone={data.tasks_today.length ? 'amber' : 'green'}>{data.tasks_today.length} pending</Badge>} />
          <div className="px-4 pb-4 space-y-2 flex-1">
            {data.tasks_today.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="All caught up" body="Schedule reminders from any conversation." className="py-8" />
            ) : (
              data.tasks_today.map(t => {
                const overdue = new Date(t.due_at).getTime() < Date.now();
                return (
                  <div key={t.id} className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3 hover:bg-white hover:shadow-sm transition">
                    <button
                      aria-label="Mark done"
                      className="text-slate-300 hover:text-emerald-500 mt-0.5"
                      onClick={async () => {
                        await updateTask(t.id, { completed: true });
                        qc.invalidateQueries({ queryKey: ['dashboard'] });
                        qc.invalidateQueries({ queryKey: ['tasks'] });
                      }}
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <span className={cn('flex items-center gap-1', overdue && 'text-danger font-semibold')}><Clock size={11} /> {overdue ? 'Overdue · ' : ''}{time(t.due_at)}</span>
                        {t.contact && (
                          <button onClick={() => navigate(`/inbox/${t.contact!.wa_id}`)} className="text-primary font-semibold hover:underline truncate">
                            {t.contact.name}
                          </button>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Broadcast performance"
          subtitle={`Campaign messages in the selected period`}
          actions={<Link to="/broadcast" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">Campaigns <ArrowRight size={12} /></Link>}
        />
        {b.recipients === 0 ? (
          <EmptyState icon={Radio} title="No campaigns in this period" body="Send an approved template to a list of contacts to see delivery and reply rates." className="pb-10" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-slate-100 border-t border-slate-100 rounded-b-2xl overflow-hidden">
            {[
              { label: 'Sent', value: b.sent, sub: `of ${b.recipients}` },
              { label: 'Delivered', value: b.delivered, sub: `${pct(b.delivered, b.sent)}% of sent` },
              { label: 'Read', value: b.read, sub: `${pct(b.read, b.sent)}% of sent` },
              { label: 'Replied', value: b.replied, sub: `${pct(b.replied, b.sent)}% reply rate` },
              { label: 'Failed', value: b.failed, sub: `${pct(b.failed, b.recipients)}% of recipients` }
            ].map(s => (
              <div key={s.label} className="bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
                <p className="text-2xl font-display font-bold text-slate-900 mt-1">{compact(s.value)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data.kpis.new_contacts > 0 && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Users size={12} /> {data.kpis.new_contacts} new contact{data.kpis.new_contacts === 1 ? '' : 's'} in this period
        </p>
      )}
    </div>
  );
}
