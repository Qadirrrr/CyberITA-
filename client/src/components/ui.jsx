import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { IconAlert, IconCheckCircle, IconChevronLeft, IconChevronRight, IconInbox, IconInfo, IconX } from './icons';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const buttonVariants = {
  primary:
    'bg-brand-400 text-night-950 font-semibold hover:bg-brand-300 focus-visible:ring-brand-400/50',
  secondary:
    'border border-white/15 bg-white/5 text-slate-100 hover:border-white/25 hover:bg-white/10 focus-visible:ring-white/30',
  ghost: 'text-slate-300 hover:bg-white/5 hover:text-white focus-visible:ring-white/20',
  danger: 'bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-400/50',
  outline:
    'border border-brand-400/40 text-brand-300 hover:border-brand-400/70 hover:bg-brand-400/10 focus-visible:ring-brand-400/40',
};

const buttonSizes = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-9 w-9',
};

export const Button = forwardRef(function Button(
  { as: Component = 'button', variant = 'primary', size = 'md', className = '', loading, disabled, children, ...props },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <Component
      ref={ref}
      disabled={Component === 'button' ? isDisabled : undefined}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl outline-none transition focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </Component>
  );
});

export function Field({ label, htmlFor, error, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="ml-1 text-rose-400">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, error, hint, required, className = '', id, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      <input
        ref={ref}
        id={inputId}
        className={cx('input', error && 'border-rose-500/60 focus:border-rose-500/70 focus:ring-rose-500/20', className)}
        {...props}
      />
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea({ label, error, hint, required, className = '', id, rows = 4, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={cx('input resize-y', error && 'border-rose-500/60', className)}
        {...props}
      />
    </Field>
  );
});

export const Select = forwardRef(function Select({ label, error, hint, required, className = '', id, children, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      <select ref={ref} id={inputId} className={cx('input', error && 'border-rose-500/60', className)} {...props}>
        {children}
      </select>
    </Field>
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, className = '', id, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <label htmlFor={inputId} className={cx('flex cursor-pointer items-start gap-2.5 text-sm text-slate-300', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-night-900 text-brand-400 accent-brand-400"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
});

const badgeTones = {
  slate: 'border-white/10 bg-white/5 text-slate-300',
  brand: 'border-brand-400/30 bg-brand-400/10 text-brand-300',
  emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  rose: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  accent: 'border-accent-400/30 bg-accent-400/10 text-accent-300',
  sky: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

export function Badge({ tone = 'slate', className = '', children }) {
  return <span className={cx('chip', badgeTones[tone] || badgeTones.slate, className)}>{children}</span>;
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={cx('card', className)} {...props}>
      {children}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, action, className = '' }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">{eyebrow}</p>}
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ value = 0, className = '', tone = 'brand', size = 'md' }) {
  const toneMap = {
    brand: 'bg-gradient-to-r from-brand-500 to-brand-300',
    emerald: 'bg-gradient-to-r from-emerald-500 to-emerald-300',
    accent: 'bg-gradient-to-r from-accent-500 to-accent-300',
    amber: 'bg-gradient-to-r from-amber-500 to-amber-300',
    rose: 'bg-gradient-to-r from-rose-500 to-rose-300',
  };
  return (
    <div
      className={cx('w-full overflow-hidden rounded-full bg-white/10', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx('h-full rounded-full transition-all duration-500', toneMap[tone] || toneMap.brand)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

const easeOutCubic = (progress) => 1 - Math.pow(1 - progress, 3);

export function AnimatedNumber({ value = 0, duration = 1100, decimals = 0, className = '' }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [display, setDisplay] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      current.current = target;
      setDisplay(target);
      return undefined;
    }

    const from = current.current;
    if (from === target) {
      setDisplay(target);
      return undefined;
    }

    let frame;
    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const next = from + (target - from) * easeOutCubic(progress);
      current.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(step);
      else current.current = target;
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return (
    <span className={className}>
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

export function AnimatedStatValue({ value }) {
  if (typeof value === 'number') {
    return (
      <>
        <span className="sr-only">{value}</span>
        <span aria-hidden="true">
          <AnimatedNumber value={value} />
        </span>
      </>
    );
  }

  if (typeof value !== 'string') return value;

  const match = value.match(/^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(\D*)$/);
  if (!match) return value;

  const [, prefix, rawNumber, suffix] = match;
  const numeric = Number(rawNumber.replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return value;

  const decimals = (rawNumber.split('.')[1] || '').length;

  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {prefix}
        <AnimatedNumber value={numeric} decimals={decimals} />
        {suffix}
      </span>
    </>
  );
}

export function StatCard({ icon: IconComponent, label, value, hint, tone = 'brand', className = '' }) {
  const tones = {
    brand: 'bg-brand-400/10 text-brand-300',
    accent: 'bg-accent-400/10 text-accent-300',
    emerald: 'bg-emerald-400/10 text-emerald-300',
    amber: 'bg-amber-400/10 text-amber-300',
    rose: 'bg-rose-400/10 text-rose-300',
  };
  return (
    <Card className={cx('p-5 transition-colors hover:border-white/20', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {IconComponent && (
          <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone] || tones.brand)}>
            <IconComponent size={18} />
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-[2rem] font-semibold leading-none tracking-tight text-white tabular-nums">
        <AnimatedStatValue value={value ?? 0} />
      </p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function EmptyState({ icon: IconComponent = IconInbox, title, message, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
        <IconComponent size={24} />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {message && <p className="mt-1.5 max-w-md text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name = '', src, size = 'md', className = '' }) {
  const sizes = { xs: 'h-7 w-7 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg' };
  const label = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  if (src) {
    return <img src={src} alt={name} className={cx('rounded-full object-cover ring-1 ring-white/10', sizes[size], className)} />;
  }
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-accent-500/30 font-semibold text-brand-200 ring-1 ring-white/10',
        sizes[size],
        className
      )}
      aria-hidden="true"
    >
      {label || '?'}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', className = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-night-950/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cx(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-night-850 shadow-2xl sm:rounded-2xl',
          sizes[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={cx('no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-night-900/60 p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cx(
            'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition',
            value === tab.id ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {tab.label}
          {typeof tab.count === 'number' && (
            <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page = 1, limit = 12, total = 0, onPageChange, className = '' }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);
  if (total <= limit) return null;
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 pt-4', className)}>
      <p className="text-xs text-slate-500">
        Showing <span className="text-slate-300">{start}</span>–<span className="text-slate-300">{end}</span> of{' '}
        <span className="text-slate-300">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <IconChevronLeft size={15} /> Prev
        </Button>
        <span className="px-2 text-xs text-slate-400">
          Page {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next <IconChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

const alertTones = {
  info: { wrap: 'border-sky-400/30 bg-sky-400/10 text-sky-200', icon: IconInfo },
  success: { wrap: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200', icon: IconCheckCircle },
  warning: { wrap: 'border-amber-400/30 bg-amber-400/10 text-amber-200', icon: IconAlert },
  error: { wrap: 'border-rose-400/30 bg-rose-400/10 text-rose-200', icon: IconAlert },
};

export function Alert({ tone = 'info', title, children, className = '' }) {
  const config = alertTones[tone] || alertTones.info;
  const IconComponent = config.icon;
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', config.wrap, className)}>
      <IconComponent size={18} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={cx(title && 'mt-1', 'leading-6 opacity-90')}>{children}</div>
      </div>
    </div>
  );
}

export function IconButton({ label, className = '', children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={cx('animate-pulse rounded-xl bg-white/5', className)} />;
}

export { IconInfo };
