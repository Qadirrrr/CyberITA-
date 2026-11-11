import { useEffect, useMemo, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, Card, cx, EmptyState, ProgressBar, Skeleton } from '../../components/ui';
import { IconBell, IconCheckCircle, IconClock, IconSearch, IconTerminal, IconUsers } from '../../components/icons';
import { useConfirm } from '../../components/ConfirmDialog';
import { formatDateTime, timeAgo } from '../../lib/format';

const STATUS_FILTERS = [
  { id: 'all', label: 'All students' },
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'changes_requested', label: 'Changes requested' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
];

const STATUS_BADGES = {
  not_started: { tone: 'slate', label: 'Not started' },
  in_progress: { tone: 'amber', label: 'In progress' },
  submitted: { tone: 'brand', label: 'Submitted' },
  changes_requested: { tone: 'rose', label: 'Changes requested' },
  approved: { tone: 'emerald', label: 'Approved' },
};

const PENDING = ['not_started', 'in_progress', 'changes_requested'];

export default function DeadlineTrackerPage() {
  const toast = useToast();
  const [confirmNode, askConfirm] = useConfirm();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [remindingLabId, setRemindingLabId] = useState(null);
  const [remindingKey, setRemindingKey] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/labs/deadline-tracker');
      setLabs(data.labs || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the deadline tracker.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const sum = { labs: labs.length, pending: 0, overdue: 0 };
    for (const lab of labs) {
      sum.pending += (lab.counts?.not_started || 0) + (lab.counts?.in_progress || 0) + (lab.counts?.changes_requested || 0);
      if (lab.is_overdue && (lab.counts?.not_started || 0) + (lab.counts?.in_progress || 0) + (lab.counts?.changes_requested || 0) > 0) sum.overdue += 1;
    }
    return sum;
  }, [labs]);

  const visibleStudents = (lab) => {
    const term = search.trim().toLowerCase();
    return lab.students.filter((student) => {
      if (filter !== 'all' && student.status !== filter) return false;
      if (term && !`${student.name} ${student.email}`.toLowerCase().includes(term)) return false;
      return true;
    });
  };

  const remindLab = async (lab) => {
    const pendingCount = lab.students.filter((student) => PENDING.includes(student.status)).length;
    if (!pendingCount) return;
    const ok = await askConfirm({
      title: 'Remind pending students?',
      message: `Send a reminder to ${pendingCount} student${pendingCount === 1 ? '' : 's'} who ${pendingCount === 1 ? 'has' : 'have'} not finished "${lab.title}" yet?`,
      confirmLabel: 'Send reminders',
    });
    if (!ok) return;
    setRemindingLabId(lab.id);
    try {
      const { data } = await api.post(`/labs/${lab.id}/remind`, {});
      toast.success(`Reminder sent to ${data.sent} student${data.sent === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send reminders.'));
    } finally {
      setRemindingLabId(null);
    }
  };

  const remindStudent = async (lab, student) => {
    const key = `${lab.id}:${student.id}`;
    setRemindingKey(key);
    try {
      const { data } = await api.post(`/labs/${lab.id}/remind`, { userIds: [student.id] });
      if (data.sent > 0) toast.success(`Reminder sent to ${student.name}.`);
      else toast.error(`${student.name} is no longer pending for this lab.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send the reminder.'));
    } finally {
      setRemindingKey(null);
    }
  };

  return (
    <div className="space-y-5">
      {confirmNode}
      <div>
        <h1 className="font-display text-2xl font-semibold">Deadline tracker</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          See who has started, submitted or is still pending for every lab, and remind the students who are behind.
        </p>
      </div>

      {!loading && !error && labs.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 dark:border-white/10 dark:bg-night-900/40 dark:text-slate-300">
            <IconTerminal size={12} /> {totals.labs} lab{totals.labs === 1 ? '' : 's'} tracked
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 dark:border-white/10 dark:bg-night-900/40 dark:text-slate-300">
            <IconUsers size={12} /> {totals.pending} student{totals.pending === 1 ? '' : 's'} still pending
          </span>
          {totals.overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 font-medium text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
              <IconClock size={12} /> {totals.overdue} overdue lab{totals.overdue === 1 ? '' : 's'} with pending students
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <IconSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search students..."
            className="input !py-2 pl-8 text-xs"
            aria-label="Search students"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition',
                filter === item.id
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-white/10 dark:bg-night-900/40 dark:text-slate-300'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Alert tone="error">
          {error}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            Retry
          </button>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : labs.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={IconClock}
            title="No labs to track yet"
            message="Published course and assessment labs you are responsible for will appear here with every student's status."
            className="border-0"
          />
        </Card>
      ) : (
        labs.map((lab) => {
          const students = visibleStudents(lab);
          const pendingCount = lab.students.filter((student) => PENDING.includes(student.status)).length;
          const doneCount = (lab.counts?.submitted || 0) + (lab.counts?.approved || 0);
          if ((filter !== 'all' || search.trim()) && students.length === 0) return null;
          return (
            <Card key={lab.id} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">{lab.title}</h2>
                    <Badge tone={lab.lab_mode === 'vps' ? 'accent' : lab.lab_mode === 'real' ? 'rose' : 'brand'}>{lab.lab_mode === 'vps' ? 'Real VPS lab' : lab.lab_mode === 'real' ? 'Real lab' : 'Guided lab'}</Badge>
                    {lab.course_title && <Badge tone="slate">{lab.course_title}</Badge>}
                    {lab.is_overdue && <Badge tone="rose">Overdue</Badge>}
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <IconClock size={12} />
                      {lab.due_at ? `Due ${formatDateTime(lab.due_at)}` : 'No due date'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <IconCheckCircle size={12} />
                      {doneCount} of {lab.counts?.total || 0} submitted
                    </span>
                    {(lab.counts?.changes_requested || 0) > 0 && <span>{lab.counts.changes_requested} fixing changes</span>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => remindLab(lab)}
                  loading={remindingLabId === lab.id}
                  disabled={pendingCount === 0}
                  className="gap-1.5"
                >
                  <IconBell size={13} /> Remind pending ({pendingCount})
                </Button>
              </div>

              {lab.students.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No students yet. Enrolled students will appear here as soon as the lab has an audience.
                </p>
              ) : students.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No students match this filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-400 dark:border-white/5">
                        <th className="whitespace-nowrap px-5 py-2.5 font-semibold">Student</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Status</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Progress</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Last activity</th>
                        <th className="whitespace-nowrap px-5 py-2.5 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {students.map((student) => {
                        const badge = STATUS_BADGES[student.status] || STATUS_BADGES.not_started;
                        const key = `${lab.id}:${student.id}`;
                        return (
                          <tr key={student.id}>
                            <td className="px-5 py-3">
                              <p className="font-medium text-slate-800 dark:text-slate-100">{student.name}</p>
                              <p className="max-w-[220px] truncate text-xs text-slate-400">{student.email}</p>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex min-w-[150px] items-center gap-2">
                                <ProgressBar value={student.percent} className="w-24" />
                                <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                                  {student.percent}% · {student.progress_label}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                              {student.last_activity_at ? timeAgo(student.last_activity_at) : 'Never'}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-right">
                              {PENDING.includes(student.status) ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => remindStudent(lab, student)}
                                  loading={remindingKey === key}
                                  className="gap-1.5"
                                >
                                  <IconBell size={12} /> Remind
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-400">Done</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
