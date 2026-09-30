import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCheck, Clock, Loader2, X, AlertCircle } from 'lucide-react';
import { initials } from '../lib/format';
import type { MessageStatus } from '../lib/types';

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/25',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-white text-danger border border-rose-200 hover:bg-rose-50',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/10',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20'
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl'
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: React.ElementType }
>(({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
      VARIANTS[variant],
      SIZES[size],
      className
    )}
    {...rest}
  >
    {loading ? <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
    {children}
  </button>
));
Button.displayName = 'Button';

export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ElementType; label: string; tone?: 'default' | 'danger' }> = ({
  icon: Icon,
  label,
  tone = 'default',
  className,
  ...rest
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    className={cn(
      'inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors disabled:opacity-40',
      tone === 'danger' ? 'text-slate-400 hover:text-danger hover:bg-rose-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100',
      className
    )}
    {...rest}
  >
    <Icon size={18} />
  </button>
);

// ---------- Form fields ----------

const inputBase =
  'w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-slate-500';

export const Field: React.FC<{ label?: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string; htmlFor?: string }> = ({
  label,
  hint,
  error,
  children,
  className,
  htmlFor
}) => (
  <div className={cn('space-y-1.5', className)}>
    {label && (
      <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
    )}
    {children}
    {error ? <p className="text-xs font-medium text-danger">{error}</p> : hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
  </div>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: React.ReactNode; error?: string; icon?: React.ElementType }>(
  ({ label, hint, error, icon: Icon, className, id, ...rest }, ref) => {
    const auto = useId();
    const inputId = id || auto;
    return (
      <Field label={label} hint={hint} error={error} className={className} htmlFor={inputId}>
        <div className="relative">
          {Icon && <Icon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
          <input ref={ref} id={inputId} className={cn(inputBase, Icon && 'pl-10', error && 'border-danger focus:border-danger focus:ring-danger/10')} {...rest} />
        </div>
      </Field>
    );
  }
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: React.ReactNode; error?: string }>(
  ({ label, hint, error, className, id, ...rest }, ref) => {
    const auto = useId();
    const inputId = id || auto;
    return (
      <Field label={label} hint={hint} error={error} className={className} htmlFor={inputId}>
        <textarea ref={ref} id={inputId} className={cn(inputBase, 'resize-y min-h-[88px]', error && 'border-danger')} {...rest} />
      </Field>
    );
  }
);
Textarea.displayName = 'Textarea';

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: React.ReactNode }> = ({ label, hint, className, id, children, ...rest }) => {
  const auto = useId();
  const inputId = id || auto;
  return (
    <Field label={label} hint={hint} className={className} htmlFor={inputId}>
      <select id={inputId} className={cn(inputBase, 'pr-8 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2394a3b8%27 stroke-width=%272%27%3E%3Cpath d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E")] bg-no-repeat bg-[right_0.75rem_center]')} {...rest}>
        {children}
      </select>
    </Field>
  );
};

// ---------- Display ----------

const TONES = {
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-rose-50 text-rose-700 border-rose-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100'
};
export type Tone = keyof typeof TONES;

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }> = ({ tone = 'slate', children, className, dot }) => (
  <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wide whitespace-nowrap', TONES[tone], className)}>
    {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
    {children}
  </span>
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...rest }) => (
  <div className={cn('bg-white rounded-2xl border border-slate-200/70 shadow-card', className)} {...rest} />
);

export const CardHeader: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }> = ({ title, subtitle, actions, className }) => (
  <div className={cn('flex items-start justify-between gap-4 px-6 pt-5 pb-4', className)}>
    <div className="min-w-0">
      <h3 className="font-display font-bold text-lg text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
  </div>
);

export const Spinner: React.FC<{ className?: string; size?: number }> = ({ className, size = 20 }) => (
  <Loader2 size={size} className={cn('animate-spin text-slate-400', className)} />
);

export const PageLoader: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-24">
    <Spinner size={28} />
  </div>
);

export const EmptyState: React.FC<{ icon: React.ElementType; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  icon: Icon,
  title,
  body,
  action,
  className
}) => (
  <div className={cn('flex flex-col items-center justify-center text-center py-14 px-6', className)}>
    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
      <Icon className="text-slate-400" size={26} />
    </div>
    <p className="font-display font-bold text-slate-800">{title}</p>
    {body && <p className="text-sm text-slate-500 mt-1 max-w-sm">{body}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{ error: unknown; onRetry?: () => void }> = ({ error, onRetry }) => (
  <EmptyState
    icon={AlertTriangle}
    title="Couldn't load this"
    body={error instanceof Error ? error.message : 'Something went wrong'}
    action={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
  />
);

const AVATAR_COLORS = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700', 'bg-orange-100 text-orange-700'];

export const Avatar: React.FC<{ name: string; src?: string | null; size?: number; className?: string }> = ({ name, src, size = 40, className }) => {
  const [failed, setFailed] = useState(false);
  const color = AVATAR_COLORS[Array.from(name || '?').reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) };
  if (src && !failed) {
    return <img src={src} alt="" style={style} onError={() => setFailed(true)} className={cn('rounded-full object-cover flex-shrink-0', className)} />;
  }
  return (
    <div style={style} className={cn('rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none', color, className)}>
      {initials(name)}
    </div>
  );
};

export const MessageStatusIcon: React.FC<{ status: MessageStatus | null; className?: string }> = ({ status, className }) => {
  switch (status) {
    case 'queued':
      return <Clock size={13} className={cn('opacity-70', className)} aria-label="Sending" />;
    case 'sent':
      return <Check size={14} className={className} aria-label="Sent" />;
    case 'delivered':
      return <CheckCheck size={14} className={className} aria-label="Delivered" />;
    case 'read':
      return <CheckCheck size={14} className={cn('text-sky-500', className)} aria-label="Read" />;
    case 'failed':
      return <AlertCircle size={14} className={cn('text-danger', className)} aria-label="Failed" />;
    default:
      return null;
  }
};

export const Segmented = <T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) => (
  <div className={cn('inline-flex p-1 bg-slate-100 rounded-xl gap-1', className)}>
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap',
          value === o.value ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <label className={cn('inline-flex items-center gap-3 select-none', disabled ? 'opacity-50' : 'cursor-pointer')}>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative w-10 h-6 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-slate-300')}
    >
      <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', checked && 'translate-x-4')} />
    </button>
    {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
  </label>
);

// ---------- Modal ----------

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ open, onClose, title, description, children, footer, size = 'md' }) => {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input,textarea,select,button[data-autofocus]')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        className={cn('relative w-full bg-white rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-8', width)}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-900">{title}</h2>
            {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="px-6 pb-5">{children}</div>
        {footer && <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export const ConfirmModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  danger?: boolean;
}> = ({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', loading, danger = true }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'dark' : 'primary'} className={danger ? '!bg-danger hover:!bg-rose-600' : ''} loading={loading} onClick={onConfirm} data-autofocus>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="text-sm text-slate-600 leading-relaxed">{body}</div>
  </Modal>
);

// ---------- Tags ----------

export const TagEditor: React.FC<{ tags: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; placeholder?: string }> = ({ tags, onChange, suggestions = [], placeholder = 'Add tag…' }) => {
  const [draft, setDraft] = useState('');
  const add = (t: string) => {
    const v = t.trim();
    if (!v || tags.some(x => x.toLowerCase() === v.toLowerCase())) return setDraft('');
    onChange([...tags, v]);
    setDraft('');
  };
  const listId = useId();
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 min-h-[42px] bg-white border border-slate-200 rounded-xl focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} className="p-0.5 rounded hover:bg-slate-200" aria-label={`Remove ${t}`}>
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={listId}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? '' : placeholder}
        className="flex-1 min-w-[80px] text-sm outline-none bg-transparent px-1"
      />
      <datalist id={listId}>
        {suggestions.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
};

export function tagTone(tag: string): Tone {
  const t = tag.toLowerCase();
  if (t === 'vip') return 'amber';
  if (t.includes('hot')) return 'red';
  if (t.includes('lead')) return 'blue';
  return 'slate';
}
