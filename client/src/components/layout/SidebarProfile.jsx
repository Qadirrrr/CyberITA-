import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardPath, useAuth } from '../../context/AuthContext';
import { Avatar, Badge } from '../ui';
import { IconChevronDown, IconUser } from '../icons';
import { ROLES } from '../../lib/constants';
import useClickOutside from '../../hooks/useClickOutside';

export default function SidebarProfile({ compact = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div
          className={
            compact
              ? 'absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-night-850 shadow-2xl'
              : 'absolute inset-x-0 bottom-full z-50 mb-2 overflow-hidden rounded-xl border border-white/10 bg-night-850 shadow-2xl'
          }
        >
          <div className="border-b border-white/10 px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-white">{user.full_name}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{user.email}</p>
            <Badge tone={user.role === 'admin' ? 'rose' : user.role === 'instructor' ? 'accent' : 'brand'} className="mt-2">
              {ROLES[user.role] || user.role}
            </Badge>
          </div>
          <div className="p-1.5">
            <Link
              to={dashboardPath(user.role)}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconUser size={15} /> Dashboard
            </Link>
            {user.role === 'student' && (
              <Link
                to="/student/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <IconUser size={15} /> Profile settings
              </Link>
            )}
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
            ? 'flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] p-1.5 text-left transition hover:border-white/15 hover:bg-white/[0.06]'
            : 'flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 text-left transition hover:border-white/15 hover:bg-white/[0.06]'
        }
      >
        <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-200">{user.full_name}</span>
              <span className="mt-0.5 block truncate text-[10px] text-slate-500">{ROLES[user.role] || user.role}</span>
            </span>
            <IconChevronDown size={14} className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
    </div>
  );
}
