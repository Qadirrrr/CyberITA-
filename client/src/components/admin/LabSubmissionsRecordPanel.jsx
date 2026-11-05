import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Pagination,
  Skeleton,
  StatCard,
  Tabs,
} from '../../components/ui';
import {
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconRefresh,
  IconSearch,
  IconXCircle,
} from '../../components/icons';
import LabSubmissionDetail from '../../components/lab/LabSubmissionDetail';
import { LAB_SUBMISSION_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

const PAGE_SIZE = 15;

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'submitted', label: 'Pending' },
  { id: 'changes_requested', label: 'Changes requested' },
  { id: 'approved', label: 'Approved' },
];

/**
 * Administrator's read-only record of every lab submission.
 * The instructor owns the review; admins can inspect evidence and acknowledge
 * that the platform record was seen.
 */
export default function LabSubmissionsRecordPanel() {
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { data } = await api.get('/admin/lab-submissions', {
          params: { status, page, limit: PAGE_SIZE, search: search || undefined },
        });
        setSubmissions(data.submissions || []);
        setTotal(data.total || 0);
        setStats(data.stats || null);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not load the submission record.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, page, search]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openSubmission = async (id) => {
    setDetailLoading(true);
    setSelected({ id });
    try {
      const { data } = await api.get(`/lab-submissions/${id}`);
      setSelected(data.submission);
    } catch (err) {
      setSelected(null);
      toast.error(getErrorMessage(err, 'Could not load this submission.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const acknowledge = async () => {
    if (!selected?.id) return;
    setAcknowledging(true);
    try {
      const { data } = await api.post(`/admin/lab-submissions/${selected.id}/acknowledge`);
      setSelected((current) => ({ ...current, ...data.submission }));
      toast.success('Submission acknowledged in the admin record.');
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not acknowledge the submission.'));
    } finally {
      setAcknowledging(false);
    }
  };

  const tabs = STATUS_TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === 'all'
        ? stats?.total
        : tab.id === 'submitted'
          ? stats?.pending
          : tab.id === 'changes_requested'
            ? stats?.changes_requested
            : stats?.approved,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
            <IconClipboard size={16} className="text-brand-300" /> Lab submission record
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Every completed lab students upload, who reviewed it and the evidence captured at submit time. Read-only.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => load()}>
          <IconRefresh size={14} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total" value={stats?.total ?? 0} tone="brand" icon={IconClipboard} hint="All submissions" onClick={() => { setStatus('all'); setPage(1); }} />
        <StatCard label="Pending review" value={stats?.pending ?? 0} tone="amber" icon={IconClock} hint="With instructors" onClick={() => { setStatus('submitted'); setPage(1); }} />
        <StatCard
          label="Changes requested"
          value={stats?.changes_requested ?? 0}
          tone="rose"
          icon={IconXCircle}
          hint="Back with students"
          onClick={() => { setStatus('changes_requested'); setPage(1); }}
        />
        <StatCard label="Approved" value={stats?.approved ?? 0} tone="emerald" icon={IconCheckCircle} hint="Completed" onClick={() => { setStatus('approved'); setPage(1); }} />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            tabs={tabs}
            value={status}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
          />
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <Input
              placeholder="Search student, lab or email..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="min-w-[220px] text-xs"
            />
            <Button type="submit" size="sm" variant="secondary">
              <IconSearch size={14} />
            </Button>
          </form>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={IconClipboard}
              title="No submissions recorded"
              message="When a student uploads a completed lab it is recorded here for the platform."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/5 bg-white/[0.02] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Lab</th>
                  <th className="px-4 py-3 font-medium">Instructor</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Record</th>
                  <th className="px-4 py-3 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {submissions.map((item) => {
                  const meta = LAB_SUBMISSION_STATUS[item.status] || { label: item.status, tone: 'slate' };
                  return (
                    <tr key={item.id} className="transition hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">{item.student_name}</div>
                        <div className="text-[10px] text-slate-500">{item.student_email}</div>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <div className="truncate font-medium text-slate-200" title={item.lab_title}>
                          {item.lab_title}
                        </div>
                        <div className="text-[10px] text-slate-500">{item.course_title || 'Standalone lab'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{item.instructor_name || 'Unassigned'}</td>
                      <td className="px-4 py-3 text-slate-400">{formatDateTime(item.submitted_at)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {item.admin_acknowledged ? (
                          <Badge tone="brand">Acknowledged</Badge>
                        ) : (
                          <span className="text-[10px] text-slate-500">Not yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openSubmission(item.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 pb-4">
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Submission record"
        size="xl"
      >
        {detailLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <LabSubmissionDetail
            submission={selected}
            canReview={false}
            adminMode
            onAcknowledge={acknowledge}
            acknowledging={acknowledging}
          />
        )}
      </Modal>
    </div>
  );
}
