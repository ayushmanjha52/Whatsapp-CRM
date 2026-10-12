import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, CheckCircle2, MessageSquare, CheckCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/api';
import { recoverPassword } from '../api';
import { cn } from '../components/ui';

type Mode = 'login' | 'signup' | 'forgot';

const inputCls =
  'w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-primary/60 focus:bg-white rounded-xl outline-none text-slate-900 placeholder:text-slate-400 transition-colors';

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
    <div className="min-h-screen bg-background flex">
      <div className="w-full lg:w-[52%] px-6 sm:px-12 lg:px-20 py-10 flex flex-col">
        <Link to="/" className="flex items-center gap-2.5 text-slate-900 w-fit" aria-label="Home">
          <span className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
            <MessageSquare size={17} />
          </span>
          <span className="font-display text-xl">WhatsApp CRM</span>
        </Link>

        <div className="flex-1 flex items-center">
          <div className="max-w-[400px] w-full mx-auto lg:mx-0 py-12">
            <h1 className="font-display text-5xl leading-[1.05] text-slate-900 mb-3">{title}</h1>
            <p className="text-slate-500 mb-10">{subtitle}</p>

            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm" role="alert">{error}</div>}
              {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm">{notice}</div>}

              {mode === 'signup' && (
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={18} />
                  <input type="text" autoComplete="name" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} className={inputCls} required minLength={2} />
                  {name.trim().length >= 2 && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />}
                </div>
              )}

              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={18} />
                <input type="email" autoComplete="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} required />
                {emailOk && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />}
              </div>

              {mode !== 'forgot' && (
                <div className="space-y-2">
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={cn(inputCls, 'pr-12')}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <div className="flex gap-1.5 px-0.5">
                      {[0, 1, 2].map(i => (
                        <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', strength > i ? (strength === 1 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-100')} />
                      ))}
                    </div>
                  )}
                  {mode === 'login' && (
                    <div className="text-right">
                      <button type="button" onClick={() => switchMode('forgot')} className="text-sm text-slate-500 hover:text-slate-900 underline-offset-4 hover:underline">
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !emailOk || (mode !== 'forgot' && !password) || (mode === 'signup' && name.trim().length < 2)}
                className="w-full py-3.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black/70 rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{{ login: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[mode]}</span>
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-sm text-slate-500">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} className="ml-1.5 text-slate-900 font-medium underline underline-offset-4 decoration-primary/60 hover:decoration-primary">
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>

      <aside className="hidden lg:flex flex-1 relative overflow-hidden border-l border-slate-200 bg-slate-50 items-center justify-center p-16">
        <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="relative max-w-md w-full">
          <p className="font-display text-[44px] leading-[1.08] text-slate-900">
            Every chat, every deal, <em className="text-primary">one</em> calm inbox.
          </p>
          <div className="mt-12 space-y-3">
            <div className="max-w-[78%] bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-slate-700">
              Hi! Is the annual plan still 20% off this week?
              <span className="block text-right text-[10px] text-slate-400 mt-1">10:42</span>
            </div>
            <div className="max-w-[78%] ml-auto bg-primary text-white rounded-2xl rounded-br-md px-4 py-3 text-sm">
              It is. Want me to send the quote over now?
              <span className="flex justify-end items-center gap-1 text-[10px] text-blue-100 mt-1">10:43 <CheckCheck size={12} /></span>
            </div>
          </div>
          <div className="mt-12 grid grid-cols-3 border-t border-slate-200 pt-6 text-sm">
            {[
              ['Inbox', 'shared, real-time'],
              ['Pipeline', 'drag-and-drop'],
              ['Broadcasts', 'tracked to reply']
            ].map(([a, b]) => (
              <div key={a}>
                <p className="text-slate-900 font-medium">{a}</p>
                <p className="text-slate-500 text-xs mt-0.5">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};
