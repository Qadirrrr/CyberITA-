import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Skeleton, Tabs } from '../../components/ui';
import {
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconFileText,
  IconRefresh,
  IconSearch,
  IconSend,
  IconXCircle,
} from '../../components/icons';
import { formatDateTime, timeAgo } from '../../lib/format';
import { SUBMISSION_STATUS } from '../../lib/constants';
import { useNotifications } from '../../context/NotificationContext';

function submissionState(assignment) {
  if (!assignment.submission_id) return 'pending';
  if (assignment.submission_status === 'returned') return 'pending';
  if (assignment.submission_status === 'graded') return 'graded';
  return 'submitted';
}

export default function StudentAssignmentsPage() {
  const { markCategoryRead } = useNotifications() || {};
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');

  useEffect(() => {
    markCategoryRead?.('assignment');
  }, [markCategoryRead]);

  useEffect(() => {
    let active = true;
    api
      .get('/me/assignments')
      .then(({ data }) => {
        if (active) setAssignments(data.assignments || []);
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load your assignments.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(
    () => ({
      all: assignments.length,
      pending: assignments.filter((item) => submissionState(item) === 'pending').length,
      submitted: assignments.filter((item) => submissionState(item) === 'submitted').length,
      graded: assignments.filter((item) => submissionState(item) === 'graded').length,
      overdue: assignments.filter((item) => item.is_overdue).length,
    }),
    [assignments]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignments.filter((assignment) => {
      if (tab === 'pending' && submissionState(assignment) !== 'pending') return false;
      if (tab === 'submitted' && submissionState(assignment) !== 'submitted') return false;
      if (tab === 'graded' && submissionState(assignment) !== 'graded') return false;
      if (!term) return true;
      return `${assignment.title} ${assignment.course_title} ${assignment.description || ''}`.toLowerCase().includes(term);
    });
  }, [assignments, tab, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Assignments</h1>
          <p className="mt-1 text-sm text-slate-400">
            Submit written work, track instructor feedback and keep every deadline in view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={counts.pending > 0 ? 'amber' : 'emerald'}>
            <IconFileText size={12} /> {counts.pending} to do
          </Badge>
          {counts.overdue > 0 && <Badge tone="rose">{counts.overdue} overdue</Badge>}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!loading && assignments.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
              <IconFileText size={18} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{counts.pending}</p>
              <p className="text-[11px] text-slate-500">To submit</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
              <IconSend size={18} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{counts.submitted}</p>
              <p className="text-[11px] text-slate-500">Awaiting grade</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <IconCheckCircle size={18} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{counts.graded}</p>
              <p className="text-[11px] text-slate-500">Graded</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300">
              <IconClock size={18} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{counts.overdue}</p>
              <p className="text-[11px] text-slate-500">Overdue</p>
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'pending', label: 'To do', count: counts.pending },
            { id: 'submitted', label: 'Submitted', count: counts.submitted },
            { id: 'graded', label: 'Graded', count: counts.graded },
            { id: 'all', label: 'All', count: counts.all },
          ]}
        />
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assignments…"
            className="input pl-9"
            aria-label="Search assignments"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconFileText}
          title={assignments.length === 0 ? 'No assignments yet' : 'Nothing in this list'}
          message={
            assignments.length === 0
              ? 'When your instructor publishes an assignment it will appear here with its deadline.'
              : 'Switch tabs to see submitted or graded work.'
          }
          action={
            assignments.length === 0 ? (
              <Button as={Link} to="/student/courses" variant="secondary">
                View my courses <IconArrowRight size={14} />
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((assignment) => {
            const state = submissionState(assignment);
            const status = assignment.submission_status ? SUBMISSION_STATUS[assignment.submission_status] : null;
            return (
              <Card key={assignment.id} className="p-4 transition hover:border-white/20 sm:p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      assignment.is_overdue
                        ? 'bg-rose-400/10 text-rose-300'
                        : state === 'graded'
                          ? 'bg-emerald-400/10 text-emerald-300'
                          : state === 'submitted'
                            ? 'bg-brand-400/10 text-brand-300'
                            : 'bg-amber-400/10 text-amber-300'
                    }`}
                  >
                    {state === 'graded' ? <IconCheckCircle size={19} /> : assignment.is_overdue ? <IconXCircle size={19} /> : <IconFileText size={19} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="slate">{assignment.course_title}</Badge>
                      <Badge tone="slate">{assignment.points} points</Badge>
                      {assignment.due_at ? (
                        <Badge tone={assignment.is_overdue ? 'rose' : 'brand'}>
                          <IconClock size={11} /> {assignment.is_overdue ? 'Overdue' : 'Due'} {formatDateTime(assignment.due_at)}
                        </Badge>
                      ) : (
                        <Badge tone="slate">No deadline</Badge>
                      )}
                      {status && <Badge tone={status.tone}>{status.label}</Badge>}
                    </div>

                    <Link
                      to={`/learn/assignments/${assignment.id}`}
                      className="mt-2 block truncate font-display text-base font-semibold text-white transition hover:text-brand-200"
                    >
                      {assignment.title}
                    </Link>
                    {assignment.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{assignment.description}</p>
                    )}

                    {assignment.submission_status === 'returned' && assignment.feedback && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-2.5 py-2 text-[11px] leading-5 text-rose-200">
                        <IconRefresh size={12} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">Changes requested: {assignment.feedback}</span>
                      </p>
                    )}
                    {assignment.submission_status === 'graded' && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Scored {assignment.grade}/{assignment.points}
                        {assignment.graded_at ? ` · ${timeAgo(assignment.graded_at)}` : ''}
                      </p>
                    )}
                    {assignment.submission_status === 'submitted' && assignment.submitted_at && (
                      <p className="mt-2 text-[11px] text-slate-500">Submitted {timeAgo(assignment.submitted_at)}</p>
                    )}
                  </div>

                  <Button
                    as={Link}
                    to={`/learn/assignments/${assignment.id}`}
                    size="sm"
                    variant={state === 'pending' ? 'primary' : 'secondary'}
                    className="shrink-0"
                  >
                    {state === 'pending' ? (assignment.submission_id ? 'Revise' : 'Open') : 'View'} <IconArrowRight size={13} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
