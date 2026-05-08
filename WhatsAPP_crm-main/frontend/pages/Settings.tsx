import React, { useEffect, useState } from 'react';
import { useApp } from '../store';
import { User, Bell, Smartphone, Check, Save, Server, PlugZap, Loader2, Activity, Phone, AlertCircle, BarChart3 } from 'lucide-react';
import { getOAuthUrl, getCredentials, getNumbers, getTemplates, getVerification, getMessagesAnalytics, getTemplatesAnalytics, getWebhookStatus, disconnect as apiDisconnect } from '../api/whatsapp';
import { getProfile } from '../api/auth';

export const Settings: React.FC = () => {
  const { currentUser, updateCurrentUser } = useApp();

  // Initialize with empty strings (not mock data)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(currentUser.role || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  
  // API Config State
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  
  const [connecting, setConnecting] = useState(false);
  
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [verification, setVerification] = useState<any | null>(null);
  const [messagesCounts, setMessagesCounts] = useState<any | null>(null);
  const [templatesAnalytics, setTemplatesAnalytics] = useState<any | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<any | null>(null);
  
  const [notifications, setNotifications] = useState({
    newMessages: true,
    followUps: true,
    marketing: false
  });

  const [loading, setLoading] = useState(true);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    updateCurrentUser({ 
      name, 
      email, 
      role, 
      phone,
      whatsappConfig: {
        phoneNumberId,
        wabaId
      }
    });
  };

  

  const isApiConfigured = (credentials && credentials.length > 0);

  const loadAll = async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);
    setMetricsLoading(true);
    try {
      const [credsRes, numsRes, verRes, msgRes, tmplAnaRes, tmplRes, wsRes] = await Promise.all([
        getCredentials().catch(() => null),
        getNumbers().catch(() => null),
        getVerification().catch(() => null),
        getMessagesAnalytics().catch(() => null),
        getTemplatesAnalytics().catch(() => null),
        getTemplates().catch(() => null),
        getWebhookStatus().catch(() => null),
      ]);
      const creds = credsRes?.credentials || []
      setCredentials(creds);
      setNumbers(numsRes?.numbers || []);
      setVerification(verRes?.verification || null);
      setMessagesCounts(msgRes?.counts || null);
      setTemplatesAnalytics(tmplAnaRes || null);
      setTemplates(tmplRes?.templates || []);
      setWebhookStatus(wsRes?.status || null);
      const def = creds.find((c:any)=>c.default_sender) || creds[0]
      setPhoneNumberId(def?.phone_number_id || '')
      setWabaId(def?.waba_id || '')
    } finally {
      setMetricsLoading(false);
      if (isInitialLoad) setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(true);
    // Load real profile data
    getProfile().then(p => {
      console.info('[Settings] Profile loaded:', p)
      if (p) {
        setName(p.name || '')
        setEmail(p.email || '')
      }
    }).catch((err) => {
      console.warn('[Settings] Failed to load profile:', err)
    })

    // Check for onboarding error in URL params
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (error === 'already_connected') {
      setOnboardingError('This WhatsApp account is already connected to another user')
    } else if (error === 'failed') {
      setOnboardingError('Failed to connect WhatsApp. Please try again.')
    }
    // Clean URL params
    if (error || params.get('onboarded')) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    const onFocus = () => loadAll();
    const onVisibility = () => { if (document.visibilityState === 'visible') loadAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleConnect = async () => {
    setOnboardingError(null);
    setConnecting(true);
    try {
      const { url } = await getOAuthUrl();
      window.location.href = url;
    } catch (e: any) {
      setOnboardingError('Failed to start WhatsApp onboarding');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await apiDisconnect();
      await loadAll(true);
    } catch {}
    setDisconnecting(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-12 font-sans relative">
      {/* Full-screen loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="font-display font-bold text-4xl text-slate-900 tracking-tight">Settings</h2>
        <p className="text-slate-500 text-lg font-medium mt-2">Manage your account and preferences.</p>
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-10">
        {/* Profile Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-primary rounded-2xl">
                <User size={24} />
            </div>
            <div>
                <h3 className="font-display font-bold text-xl text-slate-900">Profile Information</h3>
                <p className="text-sm text-slate-500 font-medium">Update your personal details</p>
            </div>
          </div>
          
          <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-2 flex items-center space-x-8 mb-4">
                <div className="w-28 h-28 rounded-full border-4 border-white shadow-md bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">
                    {name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div>
                  <button type="button" className="px-6 py-3 bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-100 border border-slate-200 transition-colors shadow-sm">
                      Change Avatar
                  </button>
                  <p className="text-xs text-slate-400 mt-3 uppercase font-bold tracking-wide">JPG, GIF or PNG. Max 1MB.</p>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Full Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-bold text-slate-900 transition-all shadow-sm text-base"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-bold text-slate-900 transition-all shadow-sm text-base"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Job Role</label>
                <input 
                  type="text" 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-bold text-slate-900 transition-all shadow-sm text-base"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Phone Number</label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-bold text-slate-900 transition-all shadow-sm text-base"
                />
            </div>
          </div>
        </div>

        {/* Developer & API Configuration */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-4">
             <div className="p-3 bg-violet-100 text-violet-600 rounded-2xl">
                <Server size={24} />
             </div>
             <div>
                <h3 className="font-display font-bold text-xl text-slate-900">Developer & API</h3>
                <p className="text-sm text-slate-500 font-medium">Configure Meta Cloud API credentials</p>
             </div>
          </div>
          <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
             
             {/* Connection Status Banner */}
             <div className={`md:col-span-2 p-6 rounded-2xl border flex items-center justify-between ${isApiConfigured ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm ${isApiConfigured ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      {isApiConfigured ? <Check size={24} strokeWidth={3} /> : <Smartphone size={24} />}
                  </div>
                  <div>
                      <h4 className={`font-bold text-lg ${isApiConfigured ? 'text-emerald-900' : 'text-slate-900'}`}>
                        {isApiConfigured ? 'WhatsApp API Connected' : 'Not Connected'}
                      </h4>
                      <p className={`text-sm font-medium ${isApiConfigured ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {isApiConfigured ? 'Your CRM is ready to send messages.' : 'Click Connect to WhatsApp to start.'}
                      </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {isApiConfigured && (
                    <span className="px-4 py-1.5 bg-white text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200 shadow-sm">Verified</span>
                  )}
                  {isApiConfigured && (
                    <button type="button" onClick={handleDisconnect} className="px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-xl hover:bg-rose-700 shadow-sm">
                      {disconnecting ? 'Disconnecting…' : 'Disconnect WhatsApp'}
                    </button>
                  )}
                </div>
             </div>

            {/* Onboarding Action */}
            {!isApiConfigured && (
              <div className="md:col-span-2">
                <button type="button" onClick={handleConnect} className="px-6 py-4 bg-violet-600 text-white font-bold rounded-2xl hover:bg-violet-700 transition-all flex items-center space-x-3 shadow-md">
                  {connecting ? <Loader2 size={18} className="animate-spin" /> : <PlugZap size={18} />}
                  <span>Connect to WhatsApp</span>
                </button>
                {onboardingError && (
                  <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium flex items-center space-x-2">
                    <AlertCircle size={16} />
                    <span>{onboardingError}</span>
                  </div>
                )}
              </div>
            )}

             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Phone Number ID</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={phoneNumberId}
                    readOnly
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-mono text-sm text-slate-900"
                  />
                </div>
             </div>

             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">WhatsApp Business Account ID</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={wabaId}
                    readOnly
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-mono text-sm text-slate-900"
                  />
                </div>
             </div>

            
          </div>
        </div>

        {/* WhatsApp Metrics */}
        {isApiConfigured && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-4">
             <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                <BarChart3 size={24} />
             </div>
             <div>
                <h3 className="font-display font-bold text-xl text-slate-900">WhatsApp Metrics</h3>
                <p className="text-sm text-slate-500 font-medium">Live data from your connected WhatsApp Business</p>
             </div>
          </div>
          <div className="p-10 space-y-10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Refreshes automatically after onboarding</p>
              <button type="button" onClick={loadAll} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 flex items-center space-x-2">
                {metricsLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl border border-slate-200 bg-white">
                <p className="text-xs font-bold text-slate-500 uppercase">Messages</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-900 font-bold">{messagesCounts?.message_sent ?? 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Sent</p>
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold">{messagesCounts?.message_delivered ?? 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Delivered</p>
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold">{messagesCounts?.message_read ?? 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Read</p>
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold">{messagesCounts?.message_failed ?? 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Failed</p>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl border border-slate-200 bg-white">
                <p className="text-xs font-bold text-slate-500 uppercase">Templates</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-900 font-bold">{templatesAnalytics?.status_counts?.APPROVED ?? 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Approved</p>
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold">{templatesAnalytics?.status_counts?.REJECTED ?? 0}</p>
                    <p className="text-xs text-slate-500 font-medium">Rejected</p>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl border border-slate-200 bg-white">
                <p className="text-xs font-bold text-slate-500 uppercase">Verification</p>
                <div className="mt-4">
                  <p className="text-slate-900 font-bold">{verification?.verification_status ?? 'unknown'}</p>
                  <p className="text-xs text-slate-500 font-medium">Business</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <p className="text-xs font-bold text-slate-500 uppercase">Connected Senders</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {credentials.map((c, i) => (
                  <div key={i} className="p-6 rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-slate-100 rounded-xl"><Phone size={16} /></div>
                        <div>
                          <p className="font-bold text-slate-900">{c.display_phone_number}</p>
                          <p className="text-xs text-slate-500 font-medium">{c.verified_name}</p>
                        </div>
                      </div>
                      {c.default_sender && (
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200">Default</span>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 font-medium">Status</p>
                        <p className="font-bold text-slate-900">{c.status}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Quality</p>
                        <p className="font-bold text-slate-900">{c.quality_rating}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Mode</p>
                        <p className="font-bold text-slate-900">{c.account_mode}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Token Expires</p>
                        <p className="font-bold text-slate-900">{c.token_expires_at ? new Date(c.token_expires_at).toLocaleString() : '-'}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {credentials.length === 0 && (
                  <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 text-sm font-medium">No connected numbers yet</div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-bold text-slate-500 uppercase">Webhook</p>
              <div className="p-6 rounded-2xl border border-slate-200 bg-white grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 font-medium">Verify Token</p>
                  <p className="font-bold text-slate-900">{webhookStatus?.verify_token ? '••••••••' : '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">Callback URL</p>
                  <p className="font-bold text-slate-900 break-all">{webhookStatus?.callback_url ?? '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">Last Signature Valid</p>
                  <p className="font-bold text-slate-900">{webhookStatus?.last_signature_valid_at ? new Date(webhookStatus.last_signature_valid_at).toLocaleString() : '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Notification Preferences */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-4">
             <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
                <Bell size={24} />
             </div>
             <div>
                <h3 className="font-display font-bold text-xl text-slate-900">Notifications</h3>
                <p className="text-sm text-slate-500 font-medium">Control what alerts you receive</p>
             </div>
          </div>
          <div className="p-10 space-y-8">
             <div className="flex items-center justify-between">
                <div>
                   <p className="font-bold text-base text-slate-800">New Messages</p>
                   <p className="text-sm text-slate-500 font-medium mt-1">Get notified when a lead replies</p>
                </div>
                <button 
                   type="button"
                   onClick={() => setNotifications({...notifications, newMessages: !notifications.newMessages})}
                   className={`w-16 h-8 rounded-full p-1 transition-colors duration-300 focus:outline-none ${notifications.newMessages ? 'bg-primary' : 'bg-slate-200'}`}
                >
                   <div className={`w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${notifications.newMessages ? 'translate-x-8' : 'translate-x-0'}`} />
                </button>
             </div>
             <div className="flex items-center justify-between">
                <div>
                   <p className="font-bold text-base text-slate-800">Follow-up Reminders</p>
                   <p className="text-sm text-slate-500 font-medium mt-1">Alerts for scheduled tasks</p>
                </div>
                <button 
                   type="button"
                   onClick={() => setNotifications({...notifications, followUps: !notifications.followUps})}
                   className={`w-16 h-8 rounded-full p-1 transition-colors duration-300 focus:outline-none ${notifications.followUps ? 'bg-primary' : 'bg-slate-200'}`}
                >
                   <div className={`w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${notifications.followUps ? 'translate-x-8' : 'translate-x-0'}`} />
                </button>
             </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button type="submit" className="px-12 py-5 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all flex items-center space-x-3 shadow-xl hover:shadow-2xl hover:-translate-y-1 text-base">
             <Save size={22} />
             <span>Save All Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
