import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { IconAlert, IconCheckCircle, IconInfo, IconX } from '../components/icons';

const ToastContext = createContext(null);

const tones = {
  success: { wrap: 'border-emerald-400/30 bg-emerald-950/90 text-emerald-100', icon: IconCheckCircle, iconClass: 'text-emerald-300' },
  error: { wrap: 'border-rose-400/30 bg-rose-950/90 text-rose-100', icon: IconAlert, iconClass: 'text-rose-300' },
  info: { wrap: 'border-sky-400/30 bg-sky-950/90 text-sky-100', icon: IconInfo, iconClass: 'text-sky-300' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'success') => {
      const id = ++counter.current;
      setToasts((current) => [...current.slice(-3), { id, message, type }]);
      window.setTimeout(() => dismiss(id), 4500);
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      info: (message) => push(message, 'info'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-4 z-[60] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((item) => {
          const config = tones[item.type] || tones.info;
          const IconComponent = config.icon;
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${config.wrap}`}
              role="status"
            >
              <IconComponent size={18} className={`mt-0.5 shrink-0 ${config.iconClass}`} />
              <p className="flex-1 leading-5">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 opacity-60 transition hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <IconX size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
