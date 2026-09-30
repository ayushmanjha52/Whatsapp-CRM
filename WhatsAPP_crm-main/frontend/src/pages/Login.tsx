import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, CheckCircle2, Shield, BarChart3, MessageSquare, Kanban, Radio } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/api';
import { recoverPassword } from '../api';
import { cn } from '../components/ui';

type Mode = 'login' | 'signup' | 'forgot';

const inputCls =
  'w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-2xl outline-none font-semibold text-slate-900 placeholder:text-slate-400 transition-all';

export const Login: React.FC<{ mode: 'login' | 'signup' }> = ({ mode: initialMode }) => {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailOk = /.+@.+\..+/.test(email);
  const strength = [password.length >= 8, password.length >= 12, /[A-Z]/.test(password) && /[0-9]/.test(password)].filter(Boolean).length;

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    if (m !== 'forgot') navigate(m === 'login' ? '/login' : '/signup', { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'signup' && password.length < 8) return setError('Use at least 8 characters for your password.');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        const next = params.get('next');
        navigate(next && next.startsWith('/') ? next : '/dashboard', { replace: true });
      } else if (mode === 'signup') {
        const r = await signup(name, email, password);
        if (r.needsConfirmation) {
          setNotice(r.message || 'Check your inbox to confirm your email, then sign in.');
          setMode('login');
        } else navigate('/settings?tab=whatsapp', { replace: true });
      } else {
        await recoverPassword(email);
        setNotice('If an account exists for that email, a reset link is on its way.');
      }
    } catch (err) {
      setError(errorMessage(err, mode === 'login' ? 'Email or password is incorrect' : 'Could not create the account'));
    } finally {
      setLoading(false);
    }
  };

  const title = { login: 'Welcome back', signup: 'Create your workspace', forgot: 'Reset password' }[mode];
  const subtitle = {
    login: 'Enter your details to access your workspace.',
    signup: 'Turn WhatsApp conversations into a sales pipeline.',
    forgot: "We'll email you a link to set a new password."
  }[mode];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-[1200px] bg-white rounded-[2rem] shadow-2xl overflow-hidden flex min-h-[680px] border border-slate-100">
        <div className="w-full lg:w-1/2 p-8 sm:p-12 lg:p-16 flex flex-col justify-center relative">
          <Link to="/" className="absolute top-8 left-8 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary" aria-label="Home">
            <MessageSquare size={22} />
          </Link>
          <div className="max-w-md mx-auto w-full">
            <div className="mb-10">
              <h1 className="font-display font-bold text-4xl text-slate-900 mb-3 tracking-tight">{title}</h1>
              <p className="text-slate-500 text-base font-medium">{subtitle}</p>
            </div>

            <form onSubmit={submit} className="space-y-5" noValidate>
              {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium" role="alert">{error}</div>}
              {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">{notice}</div>}

              {mode === 'signup' && (
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={20} />
                  <input type="text" autoComplete="name" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} className={inputCls} required minLength={2} />
                  {name.trim().length >= 2 && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" size={20} />}
                </div>
              )}

              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={20} />
                <input type="email" autoComplete="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} required />
                {emailOk && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" size={20} />}
              </div>

              {mode !== 'forgot' && (
                <div className="space-y-2">
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={20} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={cn(inputCls, 'pr-12')}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <div className="flex gap-2 px-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', strength > i ? (strength === 1 ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-slate-100')} />
                      ))}
                    </div>
                  )}
                  {mode === 'login' && (
                    <div className="text-right">
                      <button type="button" onClick={() => switchMode('forgot')} className="text-sm font-semibold text-primary hover:underline">
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !emailOk || (mode !== 'forgot' && !password) || (mode === 'signup' && name.trim().length < 2)}
                className="w-full py-4 bg-primary text-white font-bold text-base rounded-2xl shadow-xl shadow-primary/30 hover:bg-primary-hover hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{{ login: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[mode]}</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-10 text-center text-slate-500 font-medium">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} className="ml-2 text-primary font-bold hover:underline">
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        <div className="hidden lg:flex w-1/2 bg-primary relative overflow-hidden items-center justify-center p-16">
          <div className="absolute top-[-20%] right-[-20%] w-[700px] h-[700px] bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-20%] left-[-20%] w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-3xl" />
          <div className="relative w-full max-w-md">
            <div className="bg-white rounded-3xl p-7 shadow-2xl rotate-[-2deg] hover:rotate-0 transition-transform mb-6 animate-in fade-in slide-in-from-bottom-10 duration-700">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Replied within 30m</p>
                  <h3 className="text-4xl font-display font-bold text-slate-900">92%</h3>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/20">
                  <BarChart3 className="text-white" />
                </div>
              </div>
              <div className="w-full h-16 bg-slate-50 rounded-xl overflow-hidden relative">
                <svg className="absolute bottom-0 left-0 w-full h-full" viewBox="0 0 300 64" preserveAspectRatio="none">
                  <path d="M0,40 Q50,10 100,30 T200,20 T300,30 L300,64 L0,64 Z" fill="rgba(37, 99, 235, 0.1)" />
                  <path d="M0,40 Q50,10 100,30 T200,20 T300,30" fill="none" stroke="#2563EB" strokeWidth="3" />
                </svg>
              </div>
            </div>
            <div className="bg-white rounded-3xl p-7 shadow-2xl translate-x-10 animate-in fade-in slide-in-from-right-10 duration-1000">
              <div className="space-y-3">
                {[
                  { icon: MessageSquare, label: 'Shared team inbox', tone: 'bg-blue-50 text-primary' },
                  { icon: Kanban, label: 'Deals pipeline', tone: 'bg-violet-50 text-violet-600' },
                  { icon: Radio, label: 'Template broadcasts', tone: 'bg-emerald-50 text-emerald-600' }
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', f.tone)}>
                      <f.icon size={18} />
                    </div>
                    <span className="font-semibold text-slate-700">{f.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-5 border-t border-slate-100 flex items-center gap-3">
                <Shield className="text-amber-500 w-7 h-7" />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Your data, your workspace</h4>
                  <p className="text-xs text-slate-400">Tokens encrypted at rest. Webhooks signature-verified.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
