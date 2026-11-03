import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Skeleton, Tabs } from '../../components/ui';
import { IconArrowRight, IconCheckCircle, IconClock, IconRefresh, IconSearch, IconTerminal, IconXCircle } from '../../components/icons';
import { LAB_SUBMISSION_STATUS } from '../../lib/constants';
import { formatDateTime, timeAgo } from '../../lib/format';

function assignmentState(item) {
  if (!item.submission_id || item.submission_status === 'changes_requested') return 'pending';
  if (item.submission_status === 'approved') return 'approved';
  return 'submitted';
}

export default function LabAssignmentsPage() {
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/me/lab-assignments')
      .then(({ data }) => active && setAssignments(data.labAssignments || []))
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load lab assignments.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => ({
    all: assignments.length,
    pending: assignments.filter((item) => assignmentState(item) === 'pending').length,
    submitted: assignments.filter((item) => assignmentState(item) === 'submitted').length,
    approved: assignments.filter((item) => assignmentState(item) === 'approved').length,
    overdue: assignments.filter((item) => item.is_overdue).length,
  }), [assignments]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignments.filter((item) => {
      const state = assignmentState(item);
      if (tab !== 'all' && state !== tab) return false;
      return !term || `${item.title} ${item.course_title || ''} ${item.summary || ''}`.toLowerCase().includes(term);
    });
  }, [assignments, search, tab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Lab assignments</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Complete the verified lab steps, submit your evidence, and track instructor review here.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={counts.pending ? 'amber' : 'emerald'}><IconTerminal size={12} /> {counts.pending} to complete</Badge>
          {counts.overdue > 0 && <Badge tone="rose">{counts.overdue} overdue</Badge>}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'pending', label: 'To complete', count: counts.pending },
            { id: 'submitted', label: 'Submitted', count: counts.submitted },
            { id: 'approved', label: 'Approved', count: counts.approved },
            { id: 'all', label: 'All', count: counts.all },
          ]}
        />
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lab assignments…" className="input pl-9" aria-label="Search lab assignments" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconTerminal}
          title={assignments.length ? 'Nothing in this list' : 'No lab assignments yet'}
          message={assignments.length ? 'Try another filter.' : 'Published course labs with a deadline will appear here.'}
          action={<Button as={Link} to="/student/labs" variant="secondary">Browse labs <IconArrowRight size={14} /></Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const state = assignmentState(item);
            const status = item.submission_status ? LAB_SUBMISSION_STATUS[item.submission_status] : null;
            return (
              <Card key={item.id} className="p-4 transition hover:border-white/20 sm:p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.is_overdue ? 'bg-rose-400/10 text-rose-300' : state === 'approved' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-brand-400/10 text-brand-300'}`}>
                    {state === 'approved' ? <IconCheckCircle size={19} /> : item.is_overdue ? <IconXCircle size={19} /> : <IconTerminal size={19} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="slate">{item.course_title}</Badge>
                      <Badge tone="slate">{item.step_count} verified steps</Badge>
                      {item.due_at ? <Badge tone={item.is_overdue ? 'rose' : 'brand'}><IconClock size={11} /> {item.is_overdue ? 'Overdue' : 'Due'} {formatDateTime(item.due_at)}</Badge> : <Badge tone="slate">No deadline</Badge>}
                      {status && <Badge tone={status.tone}>{status.label}</Badge>}
                    </div>
                    <Link to={`/labs/${item.id}`} className="mt-2 block truncate font-display text-base font-semibold text-white hover:text-brand-200">{item.title}</Link>
                    {item.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.summary}</p>}
                    {item.submission_status === 'changes_requested' && item.instructor_feedback && <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-2.5 py-2 text-[11px] leading-5 text-rose-200"><IconRefresh size={12} className="mt-0.5 shrink-0" />Changes requested: {item.instructor_feedback}</p>}
                    {item.submitted_at && <p className="mt-2 text-[11px] text-slate-500">Submitted {timeAgo(item.submitted_at)}</p>}
                  </div>
                  <Button as={Link} to={`/labs/${item.id}`} size="sm" variant={state === 'pending' ? 'primary' : 'secondary'} className="shrink-0">
                    {state === 'pending' ? (item.submission_id ? 'Revise lab' : 'Start lab') : 'View lab'} <IconArrowRight size={13} />
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
