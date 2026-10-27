import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconCalendarGrid,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFileText,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function buildMonth(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, inMonth: date.getMonth() === cursor.getMonth() };
  });
}

export default function StudentCalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    let active = true;
    api
      .get('/me/calendar')
      .then(({ data }) => {
        if (active) setEvents(data.events || []);
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load your calendar.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const date = new Date(event.due_at);
      if (Number.isNaN(date.getTime())) continue;
      const key = dayKey(date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...event, date });
    }
    return map;
  }, [events]);

  const days = useMemo(() => buildMonth(cursor), [cursor]);
  const selectedEvents = eventsByDay.get(dayKey(selected)) || [];
  const today = startOfDay(new Date());

  const upcoming = useMemo(
    () =>
      events
        .map((event) => ({ ...event, date: new Date(event.due_at) }))
        .filter((event) => !Number.isNaN(event.date.getTime()) && startOfDay(event.date) >= today)
        .sort((a, b) => a.date - b.date)
        .slice(0, 6),
    [events, today]
  );

  const monthEventCount = days
    .filter((day) => day.inMonth)
    .reduce((total, day) => total + (eventsByDay.get(dayKey(day.date))?.length || 0), 0);

  const moveMonth = (offset) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Calendar</h1>
          <p className="mt-1 text-sm text-slate-400">
            Assignment deadlines from all your courses, grouped by date so nothing slips through.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="brand">
            <IconCalendarGrid size={12} /> {events.length} dated deadlines
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(startOfDay(now));
            }}
          >
            Today
          </Button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={IconCalendarGrid}
          title="No deadlines on the calendar"
          message="Assignments with due dates will appear here automatically. You can still browse your courses and labs."
          action={
            <Button as={Link} to="/student/assignments" variant="secondary">
              View assignments <IconArrowRight size={14} />
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <p className="font-display text-base font-semibold">
                  {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-[11px] text-slate-500">{monthEventCount} deadlines this month</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => moveMonth(-1)}>
                  <IconChevronLeft size={16} />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => moveMonth(1)}>
                  <IconChevronRight size={16} />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-white/5 bg-white/[0.02]">
              {WEEKDAYS.map((day) => (
                <div key={day} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map(({ date, inMonth }) => {
                const dayEvents = eventsByDay.get(dayKey(date)) || [];
                const isToday = sameDay(date, today);
                const isSelected = sameDay(date, selected);
                return (
                  <button
                    key={dayKey(date)}
                    type="button"
                    onClick={() => setSelected(startOfDay(date))}
                    className={`relative min-h-[74px] border-b border-r border-white/5 p-1.5 text-left transition last:border-r-0 sm:min-h-[88px] sm:p-2 ${
                      isSelected ? 'bg-brand-400/[0.07]' : 'hover:bg-white/[0.03]'
                    } ${inMonth ? '' : 'opacity-35'}`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                        isToday
                          ? 'bg-brand-400 text-night-950'
                          : isSelected
                            ? 'bg-white/10 text-white'
                            : 'text-slate-400'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <span className="mt-1 block space-y-0.5">
                      {dayEvents.slice(0, 2).map((event) => (
                        <span
                          key={event.id}
                          className={`block truncate rounded px-1 py-0.5 text-[9px] leading-3 ${
                            event.is_overdue
                              ? 'bg-rose-400/15 text-rose-200'
                              : 'bg-brand-400/15 text-brand-200'
                          }`}
                        >
                          {event.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="block px-1 text-[9px] text-slate-500">+{dayEvents.length - 2} more</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold">
                  {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </h2>
                <Badge tone={selectedEvents.length ? 'brand' : 'slate'}>{selectedEvents.length} due</Badge>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Nothing due on this day. Pick another date or check your upcoming deadlines below.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {selectedEvents.map((event) => (
                    <li key={event.id}>
                      <Link
                        to={`/learn/assignments/${event.id}`}
                        className="group block rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-brand-400/30 hover:bg-white/[0.04]"
                      >
                        <div className="flex items-start gap-2">
                          <IconFileText size={14} className="mt-0.5 shrink-0 text-amber-300" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium leading-5 text-slate-100 group-hover:text-white">{event.title}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500">{event.course_title}</p>
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                              <IconClock size={10} /> {formatDateTime(event.due_at)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="font-display text-sm font-semibold">Upcoming deadlines</h2>
              {upcoming.length === 0 ? (
                <p className="mt-4 text-xs leading-5 text-slate-500">No upcoming due dates. You are all caught up.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {upcoming.map((event) => (
                    <li key={event.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg bg-white/5 text-[9px] font-semibold uppercase leading-none text-slate-400">
                        <span>{event.date.toLocaleDateString('en-US', { month: 'short' })}</span>
                        <span className="text-[11px] text-slate-200">{event.date.getDate()}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/learn/assignments/${event.id}`}
                          className="block truncate text-xs font-medium text-slate-200 transition hover:text-brand-200"
                        >
                          {event.title}
                        </Link>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">{event.course_title}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
