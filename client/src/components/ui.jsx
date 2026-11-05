import React, { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconAlert, IconCheckCircle, IconChevronLeft, IconChevronRight, IconInbox, IconInfo, IconX } from './icons';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const buttonVariants = {
  primary:
    'bg-brand-600 text-white font-medium hover:bg-brand-700 shadow-sm shadow-brand-600/25 active:scale-[0.98] focus-visible:ring-brand-500/40 dark:bg-brand-400 dark:text-night-950 dark:hover:bg-brand-300 dark:shadow-glow-sm',
  secondary:
    'border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98] focus-visible:ring-slate-400/30 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:border-white/25 dark:hover:bg-white/10 dark:shadow-none',
  ghost:
    'text-slate-700 font-medium hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/30 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
  danger:
    'bg-rose-600 text-white font-medium hover:bg-rose-700 shadow-sm shadow-rose-600/20 active:scale-[0.98] focus-visible:ring-rose-500/40 dark:bg-rose-500 dark:hover:bg-rose-400',
  outline:
    'border border-brand-500/50 text-brand-700 font-medium hover:bg-brand-50 hover:border-brand-600 active:scale-[0.98] focus-visible:ring-brand-500/40 dark:border-brand-400/40 dark:text-brand-300 dark:hover:border-brand-400/70 dark:hover:bg-brand-400/10',
};

const buttonSizes = {
  xs: 'h-8 gap-1.5 px-3 text-xs',
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
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
        'inline-flex select-none items-center justify-center gap-2 rounded-lg outline-none transition font-medium focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant] || buttonVariants.primary,
        buttonSizes[size] || buttonSizes.md,
        className
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </Component>
  );
});

export function Field({ label, htmlFor, error, hint, required, showRequired = true, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && showRequired && <span className="ml-1 text-rose-500 font-bold">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, error, hint, required, showRequired = true, className = '', id, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} showRequired={showRequired}>
      <input
        ref={ref}
        id={inputId}
        className={cx('input', error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20', className)}
        {...props}
      />
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea({ label, error, hint, required, showRequired = true, className = '', id, rows = 4, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} showRequired={showRequired}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={cx('input resize-y', error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20', className)}
        {...props}
      />
    </Field>
  );
});

export const Select = forwardRef(function Select({ label, error, hint, required, showRequired = true, className = '', id, children, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} showRequired={showRequired}>
      <select ref={ref} id={inputId} className={cx('input', error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20', className)} {...props}>
        {children}
      </select>
    </Field>
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, className = '', id, ...props }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <label htmlFor={inputId} className={cx('flex cursor-pointer items-start gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-night-900 dark:text-brand-400 dark:accent-brand-400"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
});

const badgeTones = {
  slate:
    'bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-white/5 dark:text-slate-300 dark:border-white/10',
  brand:
    'bg-cyan-50 text-cyan-800 border-cyan-200/90 dark:bg-brand-400/10 dark:text-brand-300 dark:border-brand-400/20',
  emerald:
    'bg-emerald-50 text-emerald-800 border-emerald-200/90 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/20',
  amber:
    'bg-amber-50 text-amber-800 border-amber-200/90 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/20',
  rose:
    'bg-rose-50 text-rose-800 border-rose-200/90 dark:bg-rose-400/10 dark:text-rose-300 dark:border-rose-400/20',
  accent:
    'bg-purple-50 text-purple-800 border-purple-200/90 dark:bg-accent-400/10 dark:text-accent-300 dark:border-accent-400/20',
  sky:
    'bg-sky-50 text-sky-800 border-sky-200/90 dark:bg-sky-400/10 dark:text-sky-300 dark:border-sky-400/20',
};

const badgeDots = {
  slate: 'bg-slate-500 dark:bg-slate-400',
  brand: 'bg-cyan-600 dark:bg-brand-400',
  emerald: 'bg-emerald-600 dark:bg-emerald-400',
  amber: 'bg-amber-600 dark:bg-amber-400',
  rose: 'bg-rose-600 dark:bg-rose-400',
  accent: 'bg-purple-600 dark:bg-accent-400',
  sky: 'bg-sky-600 dark:bg-sky-400',
};

/**
 * Status chip. Use it ONLY for real state a user must recognise at a glance
 * (running, published, approved, error, passed...).
 */
export function Badge({ tone = 'slate', dot = false, className = '', children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium leading-5 transition-colors',
        badgeTones[tone] || badgeTones.slate,
        className
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cx(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            badgeDots[tone] || badgeDots.slate,
            typeof dot === 'string' && dot
          )}
        />
      )}
      {children}
    </span>
  );
}

/** Quiet secondary text for counts, units and meta information. */
export function Meta({ className = '', children }) {
  return <span className={cx('text-xs text-slate-500 dark:text-slate-400', className)}>{children}</span>;
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
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">{eyebrow}</p>}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>}
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
    brand: 'bg-gradient-to-r from-brand-600 to-brand-400',
    emerald: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
    accent: 'bg-gradient-to-r from-accent-600 to-accent-400',
    amber: 'bg-gradient-to-r from-amber-600 to-amber-400',
    rose: 'bg-gradient-to-r from-rose-600 to-rose-400',
  };
  return (
    <div
      className={cx('w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
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

export function StatCard({
  icon: IconComponent,
  label,
  value,
  hint,
  tone = 'brand',
  className = '',
  to,
  onClick,
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-300',
    accent: 'bg-purple-50 text-purple-700 dark:bg-accent-400/10 dark:text-accent-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300',
  };
  const interactive = Boolean(to || onClick);
  const card = (
    <Card
      className={cx(
        'p-5 transition-all hover:border-slate-300 hover:shadow-md dark:hover:border-white/20',
        interactive && 'h-full cursor-pointer focus-within:ring-2 focus-within:ring-brand-500/40',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        {IconComponent && (
          <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone] || tones.brand)}>
            <IconComponent size={18} />
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-[2rem] font-bold leading-none tracking-tight text-slate-900 dark:text-white tabular-nums">
        <AnimatedStatValue value={value ?? 0} />
      </p>
      {hint && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full focus:outline-none">
        {card}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block h-full w-full text-left focus:outline-none">
        {card}
      </button>
    );
  }
  return card;
}

export function EmptyState({ icon: IconComponent = IconInbox, title, message, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center dark:border-white/10 dark:bg-white/[0.02]', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm border border-slate-200/80 dark:border-transparent dark:bg-white/5 dark:text-slate-400">
        <IconComponent size={24} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      {message && <p className="mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-400">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name = '', src, size = 'md', className = '' }) {
  const sizes = { xs: 'h-7 w-7 text-xs', sm: 'h-9 w-9 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' };
  const label = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  if (src) {
    return <img src={src} alt={name} className={cx('rounded-full object-cover ring-1 ring-slate-200 dark:ring-white/10', sizes[size], className)} />;
  }
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600/15 to-accent-600/15 font-semibold text-brand-700 ring-1 ring-brand-500/20 dark:from-brand-500/30 dark:to-accent-500/30 dark:text-brand-200 dark:ring-white/10',
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
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-night-950/80" onClick={onClose} />
      <div
        className={cx(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-night-850 sm:rounded-2xl',
          sizes[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/10 bg-slate-50/50 dark:bg-transparent">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={cx('no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 dark:border-white/10 dark:bg-night-900/60', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cx(
            'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition',
            value === tab.id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          )}
        >
          {tab.label}
          {typeof tab.count === 'number' && (
            <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-300">{tab.count}</span>
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
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Showing <span className="font-medium text-slate-700 dark:text-slate-300">{start}</span>-<span className="font-medium text-slate-700 dark:text-slate-300">{end}</span> of{' '}
        <span className="font-medium text-slate-700 dark:text-slate-300">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <IconChevronLeft size={15} /> Prev
        </Button>
        <span className="px-2 text-xs font-medium text-slate-600 dark:text-slate-400">
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
  info: { wrap: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200', icon: IconInfo },
  success: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200', icon: IconCheckCircle },
  warning: { wrap: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200', icon: IconAlert },
  error: { wrap: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200', icon: IconAlert },
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
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200 dark:bg-white/5', className)} />;
}

export { IconInfo };
