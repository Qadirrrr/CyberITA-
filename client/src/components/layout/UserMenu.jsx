import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardPath, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar, Badge } from '../ui';
import { IconChevronDown, IconGlobe, IconLogOut, IconUser } from '../icons';
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1 pr-2 transition hover:border-white/20 hover:bg-white/10"
      >
        <Avatar name={user.full_name} src={user.avatar_url} size="xs" />
        <span className="hidden max-w-[120px] truncate text-xs font-medium text-slate-200 sm:block">{user.full_name}</span>
        <IconChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-night-850 shadow-2xl">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <Badge tone={user.role === 'admin' ? 'rose' : user.role === 'instructor' ? 'accent' : 'brand'} className="mt-2">
              {ROLES[user.role] || user.role}
            </Badge>
          </div>
          <div className="p-1.5">
            <Link
              to={dashboardPath(user.role)}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconUser size={16} /> Dashboard
            </Link>
            {user.role === 'student' && (
              <Link
                to="/student/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <IconUser size={16} /> Profile settings
              </Link>
            )}
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <IconGlobe size={16} /> Learning site
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10"
            >
              <IconLogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
