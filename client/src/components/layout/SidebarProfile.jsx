import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar, Badge } from '../ui';
import { IconChevronDown, IconLogOut, IconSettings } from '../icons';
import { ROLES } from '../../lib/constants';
import useClickOutside from '../../hooks/useClickOutside';

export default function SidebarProfile({ compact = false }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();
  useClickOutside(ref, () => setOpen(false), open);

  if (!user) return null;

  const onLogout = async () => {
    setOpen(false);
    await logout();
    toast.info('You have been signed out.');
    navigate('/');
  };

  const settingsPath =
    user.role === 'admin'
      ? '/admin/settings'
      : user.role === 'instructor'
        ? '/instructor/settings'
        : '/student/profile';

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div
          className={
            compact
              ? 'absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-night-850 dark:shadow-2xl'
              : 'absolute inset-x-0 bottom-full z-50 mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-night-850 dark:shadow-2xl'
          }
        >
          {/* User info */}
          <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/10 bg-slate-50/50 dark:bg-transparent">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{user.full_name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            <Badge tone={user.role === 'admin' ? 'rose' : user.role === 'instructor' ? 'accent' : 'brand'} className="mt-2">
              {ROLES[user.role] || user.role}
            </Badge>
          </div>

          {/* Menu links */}
          <div className="p-1.5 space-y-0.5">
            <Link
              to={settingsPath}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <IconSettings size={15} /> Settings
            </Link>

            {/* Divider */}
            <div className="my-1 border-t border-slate-100 dark:border-white/10" />

            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <IconLogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={compact ? user.full_name : undefined}
        className={
          compact
            ? 'flex w-full items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100/70 p-1.5 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]'
            : 'flex w-full items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-100/70 p-2 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]'
        }
      >
        <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{user.full_name}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{ROLES[user.role] || user.role}</span>
            </span>
            <IconChevronDown size={14} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
    </div>
  );
}
