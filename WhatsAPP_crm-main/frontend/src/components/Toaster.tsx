import React from 'react';
import { CheckCircle2, AlertCircle, Bell, X } from 'lucide-react';
import { useToasts } from '../store/toast';
import { cn } from './ui';

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Bell };
const ICON_BG = { success: 'bg-emerald-500', error: 'bg-danger', info: 'bg-primary' };

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 w-[min(380px,calc(100vw-3rem))]" aria-live="polite">
      {toasts.map(t => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} className="bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3.5 flex items-start gap-3 border border-slate-700/50 animate-in slide-in-from-bottom-4 fade-in duration-200">
            <div className={cn('rounded-full p-1 mt-0.5 flex-shrink-0', ICON_BG[t.tone])}>
              <Icon size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{t.title}</p>
              {t.body && <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">{t.body}</p>}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-2 text-xs font-bold text-sky-300 hover:text-sky-200"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-white p-0.5" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
