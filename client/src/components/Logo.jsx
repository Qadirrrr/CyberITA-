import { Link } from 'react-router-dom';
import { IconLogo } from '../components/icons';

export default function Logo({ to = '/', compact = false, className = '' }) {
  return (
    <Link to={to} className={`group flex items-center gap-2.5 ${className}`}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-slate-950 shadow-glow-sm transition group-hover:shadow-glow">
        <IconLogo size={20} strokeWidth={2.1} />
      </span>
      {!compact && (
        <span className="logo-wordmark font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          CyberITA<span className="text-brand-400">+</span>
        </span>
      )}
    </Link>
  );
}
