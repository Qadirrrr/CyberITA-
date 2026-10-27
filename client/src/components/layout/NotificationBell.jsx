import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, dashboardPath } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { Badge, IconButton, Spinner } from '../ui';
import { IconBell, IconCheck, IconChevronRight, IconInbox } from '../icons';
import { timeAgo } from '../../lib/format';
import useClickOutside from '../../hooks/useClickOutside';

const typeTone = {
  course: 'bg-brand-400/15 text-brand-300',
  grade: 'bg-emerald-400/15 text-emerald-300',
  lab: 'bg-accent-400/15 text-accent-300',
  report: 'bg-amber-400/15 text-amber-300',
  certificate: 'bg-emerald-400/15 text-emerald-300',
  message: 'bg-sky-400/15 text-sky-300',
  announcement: 'bg-rose-400/15 text-rose-300',
  quiz: 'bg-amber-400/15 text-amber-300',
  assignment: 'bg-emerald-400/15 text-emerald-300',
  submission: 'bg-purple-400/15 text-purple-300',
};

export default function NotificationBell({ align = 'right' }) {
  const { user } = useAuth();
  const { notifications, unread, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  useClickOutside(panelRef, () => setOpen(false), open);

  if (!user) return null;

  const openItem = async (item) => {
    if (!item.read_at) await markRead(item.id);
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div className="relative" ref={panelRef}>
      <IconButton label="Notifications" onClick={() => setOpen((value) => !value)} className="relative">
        <IconBell size={19} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-400 px-1 text-[9px] font-bold text-night-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-white/10 bg-night-850 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">Notifications</p>
              {unread > 0 && <Badge tone="brand">{unread} new</Badge>}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs text-brand-300 transition hover:text-brand-200"
              >
                <IconCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-5 w-5 text-brand-400" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <IconInbox size={26} className="mb-2 text-slate-500" />
                <p className="text-sm text-slate-400">You're all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/5 ${
                        item.read_at ? '' : 'bg-brand-400/[0.04]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          typeTone[item.type] || 'bg-white/5 text-slate-400'
                        }`}
                      >
                        <IconBell size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-100">{item.title}</span>
                          {!item.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />}
                        </span>
                        {item.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-400">{item.body}</span>}
                        <span className="mt-1 block text-[11px] text-slate-500">{timeAgo(item.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            to={user.role === 'student' ? '/student/notifications' : dashboardPath(user.role)}
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            View all notifications
            <IconChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

