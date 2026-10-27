import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { Badge, Button, Card, EmptyState, Skeleton, Tabs } from '../../components/ui';
import {
  IconBell,
  IconCheck,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconFileText,
  IconMessage,
  IconRefresh,
  IconZap,
} from '../../components/icons';
import { formatDateTime, timeAgo } from '../../lib/format';

const typeStyles = {
  message: { icon: IconMessage, className: 'bg-sky-400/15 text-sky-300' },
  grade: { icon: IconCheckCircle, className: 'bg-emerald-400/15 text-emerald-300' },
  review: { icon: IconFileText, className: 'bg-amber-400/15 text-amber-300' },
  certificate: { icon: IconCheckCircle, className: 'bg-emerald-400/15 text-emerald-300' },
  announcement: { icon: IconZap, className: 'bg-rose-400/15 text-rose-300' },
  enrollment: { icon: IconBell, className: 'bg-brand-400/15 text-brand-300' },
};

export default function StudentNotificationsPage() {
  const { notifications, unread, loading, markRead, markAllRead, refresh } = useNotifications();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(
    () => (tab === 'unread' ? notifications.filter((item) => !item.read_at) : notifications),
    [notifications, tab]
  );

  const openNotification = async (item) => {
    if (!item.read_at) await markRead(item.id);
    if (item.link) navigate(item.link);
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    await refresh({ silent: false });
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Notifications</h1>
          <p className="mt-1 text-sm text-slate-400">
            Grades, instructor feedback, new messages and platform announcements in one feed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unread > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <IconCheck size={14} /> Mark all read
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={manualRefresh} loading={refreshing}>
            <IconRefresh size={14} /> Refresh
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        className="max-w-sm"
        tabs={[
          { id: 'all', label: 'All', count: notifications.length },
          { id: 'unread', label: 'Unread', count: unread },
        ]}
      />

      {loading && notifications.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={IconBell}
          title={tab === 'unread' ? 'No unread notifications' : 'Nothing here yet'}
          message={
            tab === 'unread'
              ? 'You are all caught up. New grades and messages will appear here.'
              : 'Notifications about courses, labs, messages and certificates will show up here.'
          }
          action={
            tab === 'unread' ? (
              <Button variant="secondary" size="sm" onClick={() => setTab('all')}>
                View all notifications
              </Button>
            ) : null
          }
        />
      ) : (
        <Card className="divide-y divide-white/5 overflow-hidden">
          {visible.map((item) => {
            const style = typeStyles[item.type] || { icon: IconBell, className: 'bg-white/5 text-slate-400' };
            const IconComponent = style.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openNotification(item)}
                className={`flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-white/[0.03] sm:px-5 ${
                  item.read_at ? '' : 'bg-brand-400/[0.035]'
                }`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.className}`}>
                  <IconComponent size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{item.title}</span>
                    {!item.read_at && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
                  </span>
                  {item.body && <span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.body}</span>}
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <IconClock size={10} /> {timeAgo(item.created_at)}
                    </span>
                    <span>·</span>
                    <span>{formatDateTime(item.created_at)}</span>
                    {item.link && (
                      <Badge tone="slate" className="!px-1.5 !py-0 !text-[9px]">
                        Open
                      </Badge>
                    )}
                  </span>
                </span>
                <IconChevronRight size={15} className="mt-1 shrink-0 text-slate-600" />
              </button>
            );
          })}
        </Card>
      )}

      <p className="text-[11px] leading-5 text-slate-600">
        Notifications refresh automatically every 45 seconds. Enable browser notifications from your account settings if
        you want alerts outside this tab.
      </p>
    </div>
  );
}
