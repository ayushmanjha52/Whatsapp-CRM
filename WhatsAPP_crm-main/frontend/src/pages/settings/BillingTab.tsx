import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Sparkles, Infinity as InfinityIcon } from 'lucide-react';
import { openBillingPortal, startCheckout, useBilling, type PlanInfo } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, CardHeader, PageLoader, cn } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { shortDate } from '../../lib/format';
import { toast } from '../../store/toast';

const Usage: React.FC<{ label: string; used: number; limit: number | null }> = ({ label, used, limit }) => {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">
          {used} / {limit ?? <InfinityIcon size={14} className="inline -mt-0.5" />}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-danger' : 'bg-primary')} style={{ width: limit ? `${pct}%` : '0%' }} />
      </div>
    </div>
  );
};

function features(p: PlanInfo): string[] {
  return [
    p.conversations ? `${p.conversations} conversations / month` : 'Unlimited conversations',
    p.seats ? `${p.seats} team seat${p.seats === 1 ? '' : 's'}` : 'Unlimited team seats',
    'Shared inbox, pipeline & reminders',
    ...(p.features.broadcasts ? ['Broadcast campaigns & follow-ups'] : []),
    ...(p.features.ai ? ['AI reply suggestions'] : [])
  ];
}

export const BillingTab: React.FC = () => {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useBilling();
  const [busy, setBusy] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    const result = params.get('checkout');
    if (!result || handled.current) return;
    handled.current = true;
    setParams({ tab: 'billing' }, { replace: true });
    if (result === 'success') {
      toast.success('Subscription active', 'Thanks! Your new plan is unlocked.');
      // The webhook may land a moment after the redirect.
      setTimeout(() => qc.invalidateQueries({ queryKey: ['billing'] }), 2500);
    }
  }, [params, setParams, qc]);

  if (isLoading || !data) return <PageLoader />;

  if (!data.enabled) {
    return (
      <Card className="p-6">
        <p className="font-display font-bold text-slate-900">All features unlocked</p>
        <p className="text-sm text-slate-500 mt-1">Billing isn't configured on this server (no STRIPE_SECRET_KEY), so there are no plan limits.</p>
      </Card>
    );
  }

  const go = async (key: string, fn: () => Promise<{ url: string }>) => {
    setBusy(key);
    try {
      window.location.href = (await fn()).url;
    } catch (e) {
      toast.error('Could not open billing', errorMessage(e));
      setBusy(null);
    }
  };

  const subscribed = data.plan.id !== 'starter';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {data.plan.name} plan
              {data.status === 'past_due' && <Badge tone="red">Payment failed</Badge>}
              {data.cancel_at_period_end && <Badge tone="amber">Cancels {shortDate(data.current_period_end)}</Badge>}
            </span>
          }
          subtitle={subscribed && data.current_period_end && !data.cancel_at_period_end ? `Renews ${shortDate(data.current_period_end)}` : data.plan.blurb}
          actions={isAdmin && data.has_customer && <Button variant="secondary" icon={CreditCard} loading={busy === 'portal'} onClick={() => go('portal', openBillingPortal)}>Manage billing</Button>}
        />
        <div className="px-6 pb-6 grid md:grid-cols-2 gap-6">
          <Usage label="Conversations this month" used={data.usage.conversations} limit={data.plan.conversations} />
          <Usage label="Team seats (incl. invites)" used={data.usage.seats} limit={data.plan.seats} />
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        {data.plans.map(p => {
          const current = p.id === data.plan.id;
          const highlight = p.id === 'growth';
          return (
            <div key={p.id} className={cn('rounded-2xl border p-6 flex flex-col bg-white', current ? 'border-primary ring-4 ring-primary/10' : 'border-slate-200')}>
              <div className="flex items-center justify-between">
                <p className="font-display font-bold text-lg text-slate-900">{p.name}</p>
                {current ? <Badge tone="blue">Current</Badge> : highlight ? <Badge tone="violet"><Sparkles size={10} /> Popular</Badge> : null}
              </div>
              <p className="mt-2"><span className="text-3xl font-display font-bold text-slate-900">${p.price}</span><span className="text-slate-500 text-sm">/mo</span></p>
              <p className="text-sm text-slate-500 mt-1">{p.blurb}</p>
              <ul className="mt-4 space-y-2 flex-1">
                {features(p).map(f => (
                  <li key={f} className="text-sm text-slate-700 flex items-start gap-2"><Check size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" /> {f}</li>
                ))}
              </ul>
              {isAdmin && !current && p.id !== 'starter' && (
                <Button
                  className="mt-5 w-full"
                  variant={highlight ? 'primary' : 'dark'}
                  loading={busy === p.id}
                  onClick={() => (subscribed ? go('portal', openBillingPortal) : go(p.id, () => startCheckout(p.id as 'growth' | 'business')))}
                >
                  {subscribed ? `Switch to ${p.name}` : `Upgrade to ${p.name}`}
                </Button>
              )}
              {isAdmin && !current && p.id === 'starter' && subscribed && (
                <Button className="mt-5 w-full" variant="secondary" loading={busy === 'portal'} onClick={() => go('portal', openBillingPortal)}>Downgrade</Button>
              )}
            </div>
          );
        })}
      </div>
      {!isAdmin && <p className="text-sm text-slate-500">Only workspace admins can change the plan.</p>}
    </div>
  );
};
