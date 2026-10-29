import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, dashboardPath } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { Badge, IconButton, Spinner } from '../ui';
import { IconBell, IconCheck, IconChevronRight, IconInbox } from '../icons';
import { timeAgo } from '../../lib/format';
import useClickOutside from '../../hooks/useClickOutside';

const typeTone = {
  course: 'bg-brand-50 text-brand-700 dark:bg-brand-400/15 dark:text-brand-300',
  grade: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  lab: 'bg-purple-50 text-purple-700 dark:bg-accent-400/15 dark:text-accent-300',
  report: 'bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  certificate: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  message: 'bg-sky-50 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
  announcement: 'bg-rose-50 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  quiz: 'bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  assignment: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  submission: 'bg-purple-50 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300',
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
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white shadow-sm dark:bg-brand-400 dark:text-night-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>

      {open && (
        <div
          className={`absolute z-50 mt-2 w-[340px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-night-850 dark:shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-white/10 dark:bg-transparent">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</p>
              {unread > 0 && <Badge tone="brand">{unread} new</Badge>}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
              >
                <IconCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-5 w-5 text-brand-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <IconInbox size={26} className="mb-2 text-slate-400" />
                <p className="text-sm text-slate-500 dark:text-slate-400">You're all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                        item.read_at ? '' : 'bg-brand-50/50 dark:bg-brand-400/[0.04]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          typeTone[item.type] || 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'
                        }`}
                      >
                        <IconBell size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</span>
                          {!item.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500 dark:bg-brand-400" />}
                        </span>
                        {item.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-600 dark:text-slate-400">{item.body}</span>}
                        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{timeAgo(item.created_at)}</span>
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
            className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            View all notifications
            <IconChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
