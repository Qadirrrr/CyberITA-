import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar, Badge } from '../ui';
import { IconChevronDown, IconLogOut, IconSettings } from '../icons';
import { ROLES } from '../../lib/constants';
import useClickOutside from '../../hooks/useClickOutside';

export default function UserMenu() {
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

  // Settings path based on role
  const settingsPath =
    user.role === 'admin'
      ? '/admin/settings'
      : user.role === 'instructor'
        ? '/instructor/settings'
        : '/student/profile';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 pr-2.5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
      >
        <Avatar name={user.full_name} src={user.avatar_url} size="xs" />
        <span className="hidden max-w-[120px] truncate text-xs font-semibold text-slate-800 sm:block dark:text-slate-200">{user.full_name}</span>
        <IconChevronDown size={14} className="text-slate-500 dark:text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-night-850 dark:shadow-2xl">
          {/* User info header */}
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10 bg-slate-50/50 dark:bg-transparent">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.full_name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            <Badge tone={user.role === 'admin' ? 'rose' : user.role === 'instructor' ? 'accent' : 'brand'} className="mt-2">
              {ROLES[user.role] || user.role}
            </Badge>
          </div>

          {/* Menu items */}
          <div className="p-1.5 space-y-0.5">
            {/* Settings - available for all roles */}
            <Link
              to={settingsPath}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <IconSettings size={16} /> Settings
            </Link>

            {/* Divider */}
            <div className="my-1 border-t border-slate-100 dark:border-white/10" />

            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <IconLogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
