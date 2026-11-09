import { useEffect, useMemo, useRef, useState } from 'react';
import { IconClock } from '../icons';

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

const TONES = {
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
  danger: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300',
  muted: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300',
};

/**
 * Visible countdown for a lab session. The server sends `remainingSeconds` so
 * the timer is not affected by a skewed local clock. When it reaches zero the
 * session is ended through `onExpire`.
 */
export default function LabTimer({
  expiresAt,
  remainingSeconds,
  running = true,
  limitMinutes = 0,
  endedReason = null,
  onExpire,
  size = 'md',
}) {
  const large = size === 'lg';
  const target = useMemo(() => {
    if (remainingSeconds !== null && remainingSeconds !== undefined && Number.isFinite(Number(remainingSeconds))) {
      return Date.now() + Math.max(0, Number(remainingSeconds)) * 1000;
    }
    if (expiresAt) return new Date(expiresAt).getTime();
    return null;
  }, [remainingSeconds, expiresAt]);

  const [remaining, setRemaining] = useState(() =>
    target ? Math.max(0, Math.floor((target - Date.now()) / 1000)) : null
  );
  const firedRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    firedRef.current = false;
    if (!target || !running) {
      if (!target) setRemaining(null);
      return undefined;
    }
    const tick = () => {
      const next = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0 && running && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [target, running]);

  if (target === null) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${TONES.muted} ${
          large ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs'
        }`}
      >
        <IconClock size={large ? 17 : 13} /> No time limit
      </span>
    );
  }

  if (!running) {
    const expired = endedReason === 'expired';
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${
          expired ? TONES.danger : TONES.muted
        } ${large ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs font-medium'}`}
        title={expired ? 'The lab time limit was reached' : 'This session has ended'}
      >
        <IconClock size={large ? 17 : 13} /> {expired ? "Time's up" : 'Session ended'}
      </span>
    );
  }

  const urgent = remaining !== null && remaining <= 60;
  const warning = !urgent && remaining !== null && remaining <= 5 * 60;
  const tone = urgent ? TONES.danger : warning ? TONES.warning : TONES.normal;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${tone} ${
        large ? 'gap-2 px-3.5 py-2 text-sm shadow-sm' : 'gap-2 px-3 py-1.5 text-xs font-semibold'
      } ${urgent ? 'animate-pulse' : ''}`}
      title={limitMinutes > 0 ? `This lab ends after ${limitMinutes} minutes` : 'Time remaining in this session'}
      role="timer"
      aria-live="off"
    >
      <IconClock size={large ? 16 : 14} />
      <span className={`uppercase tracking-wider opacity-70 ${large ? 'text-[11px]' : 'hidden text-[10px] sm:inline'}`}>
        Time left
      </span>
      <span className={`font-mono tabular-nums ${large ? 'text-base font-semibold leading-none' : 'text-sm'}`}>
        {formatDuration(remaining ?? 0)}
      </span>
    </span>
  );
}
