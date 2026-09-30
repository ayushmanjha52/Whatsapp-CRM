import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { User, Smartphone, Users, Copy, CheckCircle2, PlugZap, Unplug, KeyRound, Star, Mail, Trash2, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  changePassword, completeOnboarding, connectManual, disconnectWhatsApp, getOAuthUrl, inviteMember, removeMember, setDefaultSender,
  updateMember, updateProfile, useTeam, useWhatsAppStatus
} from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Badge, Button, Card, CardHeader, ConfirmModal, IconButton, Input, PageLoader, Select, cn } from '../components/ui';
import { errorMessage } from '../lib/api';
import { toast } from '../store/toast';

type Tab = 'profile' | 'whatsapp' | 'team';

const CopyField: React.FC<{ label: string; value: string | null; hint?: string }> = ({ label, value, hint }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
        <code className="text-sm text-slate-700 flex-1 truncate">{value || 'Not configured'}</code>
        {value && (
          <IconButton
            icon={copied ? CheckCircle2 : Copy}
            label="Copy"
            className="w-7 h-7"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        )}
      </div>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
};

const ProfileTab: React.FC = () => {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [saving, setSaving] = useState<'name' | 'pw' | null>(null);
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader title="Your profile" subtitle="How teammates see you." />
        <div className="px-6 pb-6 space-y-4">
          <div className="flex items-center gap-4">
            <Avatar name={user?.name || '?'} size={56} />
            <div>
              <p className="font-semibold text-slate-900">{user?.name}</p>
              <p className="text-sm text-slate-500">{user?.email} · <span className="capitalize">{user?.role}</span></p>
            </div>
          </div>
          <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
          <Input label="Email" value={user?.email || ''} disabled />
          <Button
            loading={saving === 'name'}
            disabled={name.trim().length < 2 || name === user?.name}
            onClick={async () => {
              setSaving('name');
              try {
                await updateProfile(name.trim());
                await refresh();
                toast.success('Profile saved');
              } catch (e) {
                toast.error('Could not save', errorMessage(e));
              } finally {
                setSaving(null);
              }
            }}
          >
            Save profile
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Password" subtitle="At least 8 characters." />
        <form
          className="px-6 pb-6 space-y-4"
          onSubmit={async e => {
            e.preventDefault();
            setSaving('pw');
            try {
              await changePassword(pw.current, pw.next);
              setPw({ current: '', next: '' });
              toast.success('Password changed');
            } catch (err) {
              toast.error('Could not change password', errorMessage(err));
            } finally {
              setSaving(null);
            }
          }}
        >
          <Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
          <Input label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
          <Button type="submit" icon={KeyRound} loading={saving === 'pw'} disabled={!pw.current || pw.next.length < 8}>Change password</Button>
        </form>
      </Card>
    </div>
  );
};

const WhatsAppTab: React.FC = () => {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useWhatsAppStatus();
  const [manual, setManual] = useState({ waba_id: '', phone_number_id: '', access_token: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const handled = useRef(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['whatsapp-status'] });
    qc.invalidateQueries({ queryKey: ['templates'] });
  };

  const connected = (r: { phone_numbers: number; webhooks_subscribed: boolean; templates_synced: number }) => {
    refresh();
    toast.success('WhatsApp connected', `${r.phone_numbers} number(s), ${r.templates_synced} templates synced.`);
    if (!r.webhooks_subscribed) toast.error('Webhook subscription failed', 'Incoming messages may not arrive — check the app subscription in Meta.');
  };

  // Finish OAuth when Meta redirects back with ?code=…
  useEffect(() => {
    const code = params.get('code');
    const err = params.get('error_description') || params.get('error');
    if (handled.current || (!code && !err)) return;
    handled.current = true;
    setParams({ tab: 'whatsapp' }, { replace: true });
    if (err) {
      toast.error('WhatsApp connection cancelled', err);
      return;
    }
    setBusy('oauth');
    completeOnboarding(code!, params.get('state') || undefined)
      .then(connected)
      .catch(e => toast.error('Could not connect WhatsApp', errorMessage(e)))
      .finally(() => setBusy(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !data) return <PageLoader />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="WhatsApp Business connection" subtitle="The number your team chats and broadcasts from." />
        <div className="px-6 pb-6 space-y-5">
          {busy === 'oauth' ? (
            <div className="p-5 bg-blue-50 rounded-xl text-sm text-primary font-medium">Finishing the connection with Meta…</div>
          ) : data.connected ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="w-11 h-11 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"><CheckCircle2 /></div>
                <div className="flex-1">
                  <p className="font-display font-bold text-emerald-900">WhatsApp API connected</p>
                  <p className="text-sm text-emerald-700">Account {data.waba_id} · your CRM is ready to send and receive.</p>
                </div>
                {isAdmin && <Button variant="danger" icon={Unplug} onClick={() => setConfirmDisconnect(true)}>Disconnect</Button>}
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {data.numbers.map(n => (
                  <div key={n.phone_number_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Smartphone className="text-slate-400" size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{n.display_phone_number || n.phone_number_id} {n.verified_name && <span className="text-slate-500 font-normal">· {n.verified_name}</span>}</p>
                      <p className="text-xs text-slate-400 font-mono">ID {n.phone_number_id}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.quality_rating && <Badge tone={n.quality_rating === 'GREEN' ? 'green' : n.quality_rating === 'YELLOW' ? 'amber' : 'red'}>Quality {n.quality_rating.toLowerCase()}</Badge>}
                      {n.account_mode === 'SANDBOX' && <Badge tone="amber">Test number</Badge>}
                      {n.default_sender ? (
                        <Badge tone="blue"><Star size={10} /> Default sender</Badge>
                      ) : (
                        isAdmin && (
                          <Button size="sm" variant="secondary" onClick={async () => {
                            try {
                              await setDefaultSender(n.phone_number_id);
                              refresh();
                            } catch (e) {
                              toast.error('Could not update', errorMessage(e));
                            }
                          }}>Make default</Button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : !isAdmin ? (
            <p className="text-sm text-slate-500">Not connected yet. Ask an admin to connect your WhatsApp Business number.</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl border border-slate-200 space-y-3">
                <p className="font-display font-bold text-slate-900 flex items-center gap-2"><PlugZap size={18} className="text-violet-600" /> Connect with Facebook</p>
                <p className="text-sm text-slate-500">Log in with Meta, pick your WhatsApp Business Account and we'll set everything up — webhooks and templates included.</p>
                <Button
                  className="bg-violet-600 hover:bg-violet-700 shadow-violet-600/25"
                  icon={PlugZap}
                  disabled={!data.oauth_available}
                  loading={busy === 'url'}
                  onClick={async () => {
                    setBusy('url');
                    try {
                      window.location.href = (await getOAuthUrl()).url;
                    } catch (e) {
                      toast.error('Could not start connection', errorMessage(e));
                      setBusy(null);
                    }
                  }}
                >
                  Connect WhatsApp
                </Button>
                {!data.oauth_available && <p className="text-xs text-slate-400">Needs META_APP_ID, META_APP_SECRET and OAUTH_REDIRECT_URI on the server.</p>}
              </div>
              <form
                className="p-5 rounded-xl border border-slate-200 space-y-3"
                onSubmit={async e => {
                  e.preventDefault();
                  setBusy('manual');
                  try {
                    connected(await connectManual(manual));
                    setManual({ waba_id: '', phone_number_id: '', access_token: '' });
                  } catch (err) {
                    toast.error('Could not connect', errorMessage(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <p className="font-display font-bold text-slate-900 flex items-center gap-2"><KeyRound size={18} className="text-primary" /> Use a permanent token</p>
                <p className="text-sm text-slate-500">
                  From Meta Business Settings → System users. The token needs <code className="text-xs">whatsapp_business_messaging</code> and <code className="text-xs">whatsapp_business_management</code>.
                </p>
                <Input label="WhatsApp Business Account ID" value={manual.waba_id} onChange={e => setManual(m => ({ ...m, waba_id: e.target.value.trim() }))} />
                <Input label="Phone number ID" value={manual.phone_number_id} onChange={e => setManual(m => ({ ...m, phone_number_id: e.target.value.trim() }))} />
                <Input label="Access token" type="password" autoComplete="off" value={manual.access_token} onChange={e => setManual(m => ({ ...m, access_token: e.target.value.trim() }))} hint="Stored encrypted (AES-256-GCM). Never shown again." />
                <Button type="submit" loading={busy === 'manual'} disabled={!manual.waba_id || !manual.phone_number_id || manual.access_token.length < 20}>Verify & connect</Button>
              </form>
            </div>
          )}
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader title="Webhook" subtitle="Meta sends incoming messages and delivery receipts here. Configure it once in your Meta app → WhatsApp → Configuration." />
          <div className="px-6 pb-6 grid md:grid-cols-2 gap-4">
            <CopyField label="Callback URL" value={data.webhook.callback_url} hint="Set PUBLIC_WEBHOOK_URL on the server." />
            <CopyField label="Verify token" value={data.webhook.verify_token} hint="Set WHATSAPP_VERIFY_TOKEN on the server." />
            <p className="md:col-span-2 text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-emerald-500" /> Subscribe to the <b>messages</b> and <b>message_template_status_update</b> fields. Every request is verified against your app secret.
              <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold inline-flex items-center gap-0.5 ml-1">Guide <ExternalLink size={11} /></a>
            </p>
          </div>
        </Card>
      )}

      <ConfirmModal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        loading={busy === 'disconnect'}
        onConfirm={async () => {
          setBusy('disconnect');
          try {
            await disconnectWhatsApp();
            refresh();
            toast.success('WhatsApp disconnected');
          } catch (e) {
            toast.error('Could not disconnect', errorMessage(e));
          } finally {
            setBusy(null);
            setConfirmDisconnect(false);
          }
        }}
        title="Disconnect WhatsApp?"
        confirmLabel="Disconnect"
        body="You'll stop receiving and sending messages until you connect again. Your contacts and history are kept."
      />
    </div>
  );
};

const TeamTab: React.FC = () => {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: members, isLoading } = useTeam();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'agent'>('agent');
  const [inviting, setInviting] = useState(false);
  const [toRemove, setToRemove] = useState<number | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ['team'] });

  if (isLoading) return <PageLoader />;
  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardHeader title="Invite a teammate" subtitle="They join this workspace automatically when they sign up or log in with this email." />
          <form
            className="px-6 pb-6 flex flex-col md:flex-row gap-3 md:items-end"
            onSubmit={async e => {
              e.preventDefault();
              setInviting(true);
              try {
                await inviteMember(email, role);
                setEmail('');
                reload();
                toast.success('Invitation added', `Ask ${email} to sign up at ${window.location.origin}/signup`);
              } catch (err) {
                toast.error('Could not invite', errorMessage(err));
              } finally {
                setInviting(false);
              }
            }}
          >
            <Input label="Email" type="email" icon={Mail} value={email} onChange={e => setEmail(e.target.value)} className="flex-1" />
            <Select label="Role" value={role} onChange={e => setRole(e.target.value as 'admin' | 'agent')} className="md:w-40">
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </Select>
            <Button type="submit" loading={inviting} disabled={!/.+@.+\..+/.test(email)}>Invite</Button>
          </form>
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader title="Team" subtitle="Admins manage campaigns, templates, WhatsApp and the team. Agents chat, add notes, set reminders and move deals." />
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {(members || []).map(m => (
            <div key={m.id} className="px-6 py-4 flex items-center gap-4">
              <Avatar name={m.name || m.email} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{m.name || m.email} {m.is_you && <span className="text-xs text-slate-400 font-normal">(you)</span>}</p>
                <p className="text-sm text-slate-500 truncate">{m.email}</p>
              </div>
              {m.status === 'invited' && <Badge tone="amber">Invited</Badge>}
              {isAdmin && !m.is_you ? (
                <select
                  value={m.role}
                  onChange={async e => {
                    try {
                      await updateMember(m.id, e.target.value as 'admin' | 'agent');
                      reload();
                    } catch (err) {
                      toast.error('Could not change role', errorMessage(err));
                    }
                  }}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <Badge tone={m.role === 'admin' ? 'violet' : 'slate'}>{m.role}</Badge>
              )}
              {isAdmin && !m.is_you && <IconButton icon={Trash2} tone="danger" label="Remove" onClick={() => setToRemove(m.id)} />}
            </div>
          ))}
        </div>
      </Card>
      <ConfirmModal
        open={toRemove !== null}
        onClose={() => setToRemove(null)}
        onConfirm={async () => {
          try {
            await removeMember(toRemove!);
            reload();
            toast.success('Removed from team');
          } catch (e) {
            toast.error('Could not remove', errorMessage(e));
          } finally {
            setToRemove(null);
          }
        }}
        title="Remove teammate?"
        confirmLabel="Remove"
        body="They lose access to this workspace on their next sign-in (within a minute)."
      />
    </div>
  );
};

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (['profile', 'whatsapp', 'team'].includes(params.get('tab') || '') ? params.get('tab') : params.get('code') ? 'whatsapp' : 'profile') as Tab;
  const { data: wa } = useWhatsAppStatus();
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
    { id: 'team', label: 'Team', icon: Users }
  ];
  return (
    <div className="p-4 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition', tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800')}
          >
            <t.icon size={16} /> {t.label}
            {t.id === 'whatsapp' && wa && !wa.connected && <AlertTriangle size={13} className="text-amber-500" />}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'whatsapp' && <WhatsAppTab />}
      {tab === 'team' && <TeamTab />}
    </div>
  );
}
