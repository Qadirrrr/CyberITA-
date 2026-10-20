import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui';
import { IconClock, IconRefresh } from '../../components/icons';
import { activityToneClasses, describeActivity } from '../../lib/activity';
import { formatDate, formatDateTime } from '../../lib/format';

function groupByDay(events) {
  const groups = new Map();
  for (const event of events) {
    const key = new Date(event.created_at).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.entries()];
}

export default function HistoryPage() {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/me/history', { params: { page: 1, limit: 30 } })
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data.events || []);
        setTotal(res.data.total || 0);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your learning history.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const { data } = await api.get('/me/history', { params: { page: nextPage, limit: 30 } });
      setEvents((current) => [...current, ...(data.events || [])]);
      setTotal(data.total || total);
      setPage(nextPage);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load more history.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const groups = groupByDay(events);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Learning history</h1>
          <p className="mt-1 text-sm text-slate-400">Every lesson, quiz, lab and report milestone on your account.</p>
        </div>
        {!loading && <p className="text-xs text-slate-500">{total} events</p>}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={IconClock}
          title="Nothing here yet"
          message="Start a course or lab and your activity will show up here automatically."
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, dayEvents]) => (
            <div key={day}>
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {day === new Date().toDateString() ? 'Today' : formatDate(day, { weekday: undefined })}
                </h2>
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-[10px] text-slate-600">{dayEvents.length} events</span>
              </div>
              <Card className="divide-y divide-white/5">
                {dayEvents.map((event) => {
                  const { title, tone } = describeActivity(event);
                  return (
                    <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold ${activityToneClasses(tone)}`}>
                        {event.action.split('.')[0]?.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-5 text-slate-200">{title}</p>
                        <p className="mt-0.5 text-[10px] text-slate-600">{formatDateTime(event.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}

          {events.length < total && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                <IconRefresh size={13} /> Load older activity
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
