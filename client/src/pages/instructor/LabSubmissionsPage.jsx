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
import { IconCheckCircle, IconClock, IconSearch, IconTerminal, IconXCircle } from '../../components/icons';
import LabSubmissionDetail from '../../components/lab/LabSubmissionDetail';
import { LAB_SUBMISSION_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

const PAGE_SIZE = 15;

const STATUS_TABS = [
  { id: 'submitted', label: 'Pending review' },
  { id: 'changes_requested', label: 'Changes requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'all', label: 'All' },
];

/**
 * Instructor review queue for completed labs. Only submissions for the
 * instructor's own courses are returned by the API, so no client-side
 * filtering is used for security.
 */
export default function LabSubmissionsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('submitted');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [listRes, statsRes] = await Promise.all([
          api.get('/lab-submissions', {
            params: { status, page, limit: PAGE_SIZE, search: search || undefined },
          }),
          api.get('/lab-submissions/stats'),
        ]);
        setSubmissions(listRes.data.submissions || []);
        setTotal(listRes.data.total || 0);
        setStats(statsRes.data.stats || null);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not load lab submissions.'));
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
      setCanReview(Boolean(data.can_review));
    } catch (err) {
      setSelected(null);
      toast.error(getErrorMessage(err, 'Could not load this submission.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReview = async (nextStatus, feedback) => {
    if (!selected?.id) return;
    setReviewing(true);
    try {
      const { data } = await api.post(`/lab-submissions/${selected.id}/review`, {
        status: nextStatus,
        feedback,
      });
      setSelected((current) => ({ ...current, ...data.submission }));
      setCanReview(false);
      toast.success(nextStatus === 'approved' ? 'Lab submission approved.' : 'Changes requested from the student.');
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the review.'));
    } finally {
      setReviewing(false);
    }
  };

  const tabs = STATUS_TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === 'submitted'
        ? stats?.pending
        : tab.id === 'changes_requested'
          ? stats?.changes_requested
          : tab.id === 'approved'
            ? stats?.approved
            : stats?.total,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Lab submissions</h1>
          <p className="mt-1 text-xs text-slate-400">
            Completed labs from your courses. Each submission contains a server-captured evidence snapshot.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => load()}>
          <IconCheckCircle size={14} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending review" value={stats?.pending ?? 0} tone="amber" icon={IconClock} hint="Waiting for you" onClick={() => { setStatus('submitted'); setPage(1); }} />
        <StatCard
          label="Changes requested"
          value={stats?.changes_requested ?? 0}
          tone="rose"
          icon={IconXCircle}
          hint="Returned to students"
          onClick={() => { setStatus('changes_requested'); setPage(1); }}
        />
        <StatCard label="Approved" value={stats?.approved ?? 0} tone="emerald" icon={IconCheckCircle} hint="Completed labs" onClick={() => { setStatus('approved'); setPage(1); }} />
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
              placeholder="Search student or lab..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="min-w-[200px] text-xs"
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
              icon={IconTerminal}
              title="No lab submissions"
              message={
                status === 'all'
                  ? 'Students will appear here after they finish a lab and upload it.'
                  : 'Nothing matches this filter right now.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/5 bg-white/[0.02] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Lab</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Review</th>
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
                        <div className="text-[10px] text-slate-500">
                          {item.has_attachment ? 'With attachment' : 'Checklist evidence only'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{item.course_title || 'Standalone'}</td>
                      <td className="px-4 py-3 text-slate-400">{formatDateTime(item.submitted_at)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
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
        onClose={() => {
          setSelected(null);
          setCanReview(false);
        }}
        title="Lab submission"
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
            canReview={canReview}
            onReview={handleReview}
            reviewing={reviewing}
          />
        )}
      </Modal>
    </div>
  );
}
