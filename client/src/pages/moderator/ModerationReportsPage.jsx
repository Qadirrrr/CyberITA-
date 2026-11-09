import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from '../../components/ui';
import {
  IconAlert,
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconFlag,
  IconRefresh,
  IconSearch,
  IconSend,
  IconShield,
  IconXCircle,
} from '../../components/icons';
import {
  MODERATION_REPORT_KIND,
  MODERATION_SEVERITY,
  reportKindMeta,
  reportStatusMeta,
  severityMeta,
  tierMeta,
} from '../../lib/moderation';
import { formatDateTime } from '../../lib/format';

const PAGE_SIZE = 15;

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'in_review', label: 'In review' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'resolved', label: 'Resolved' },
];

export default function ModerationReportsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStatus = STATUS_TABS.some((tab) => tab.id === searchParams.get('status'))
    ? searchParams.get('status')
    : 'all';

  const [workspace, setWorkspace] = useState(null);
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(initialStatus);
  const [kind, setKind] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolution, setResolution] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const role = workspace?.role;
  const isSenior = role === 'senior_moderator';

  const loadWorkspace = useCallback(async () => {
    try {
      const { data } = await api.get('/moderation/workspace');
      setWorkspace(data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load your moderation workspace.'));
    }
  }, [toast]);

  const loadReports = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { data } = await api.get('/moderation/reports', {
          params: {
            status: status === 'all' ? undefined : status,
            kind: kind === 'all' ? undefined : kind,
            severity: severity === 'all' ? undefined : severity,
            search: search || undefined,
            page,
            limit: PAGE_SIZE,
          },
        });
        setReports(data.reports || []);
        setTotal(data.total || 0);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not load moderation reports.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [status, kind, severity, search, page, toast]
  );

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const openReport = async (id) => {
    setDetailLoading(true);
    setSelected({ id });
    setResolution('');
    setEscalateReason('');
    try {
      const { data } = await api.get(`/moderation/reports/${id}`);
      setSelected(data.report);
      setResolution(data.report.resolution || '');
    } catch (err) {
      setSelected(null);
      toast.error(getErrorMessage(err, 'Could not load this report.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const patchReport = async (nextStatus) => {
    if (!selected?.id) return;
    if (nextStatus === 'resolved' && !resolution.trim()) {
      toast.error('Add a resolution before resolving the report.');
      return;
    }
    setActionLoading(nextStatus);
    try {
      const { data } = await api.patch(`/moderation/reports/${selected.id}`, {
        status: nextStatus,
        resolution: resolution.trim(),
      });
      setSelected(data.report);
      toast.success(`Report marked ${reportStatusMeta(nextStatus).label.toLowerCase()}.`);
      loadReports(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the report.'));
    } finally {
      setActionLoading('');
    }
  };

  const escalateReport = async () => {
    if (!selected?.id) return;
    setActionLoading('escalate');
    try {
      const { data } = await api.post(`/moderation/reports/${selected.id}/escalate`, {
        reason: escalateReason.trim(),
      });
      setSelected(data.report);
      setEscalateReason('');
      toast.success('Report escalated to your senior moderator.');
      loadReports(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not escalate the report.'));
    } finally {
      setActionLoading('');
    }
  };

  const activeFilters = status !== 'all' || kind !== 'all' || severity !== 'all' || Boolean(search);

  const changeStatus = useCallback(
    (next) => {
      setStatus(next);
      setPage(1);
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === 'all') params.delete('status');
          else params.set('status', next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearFilters = () => {
    changeStatus('all');
    setKind('all');
    setSeverity('all');
    setSearch('');
    setSearchInput('');
    setPage(1);
  };

  const stats = workspace?.stats || {};
  const summary = useMemo(
    () => [
      { label: 'Open', value: stats.open_reports ?? 0, tone: 'brand', icon: IconClock },
      { label: 'Escalated', value: stats.escalated_reports ?? 0, tone: 'accent', icon: IconAlert },
      { label: 'Resolved', value: stats.resolved_reports ?? 0, tone: 'emerald', icon: IconCheckCircle },
    ],
    [stats]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reports &amp; escalations</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isSenior
              ? 'Reports escalated to you and reports handled by the subject moderators you supervise.'
              : 'Complaints and content-quality reports for your assigned courses and instructors.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workspace?.moderator && (
            <Badge tone={tierMeta(workspace.moderator.tier).tone}>{tierMeta(workspace.moderator.tier).label}</Badge>
          )}
          <Button size="sm" variant="secondary" onClick={() => Promise.all([loadWorkspace(), loadReports()])}>
            <IconRefresh size={14} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {summary.map((item) => (
          <Card key={item.label} className="flex items-center gap-3 p-4">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                item.tone === 'emerald'
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300'
                  : item.tone === 'accent'
                    ? 'bg-purple-50 text-purple-600 dark:bg-accent-400/10 dark:text-accent-300'
                    : 'bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300'
              }`}
            >
              <item.icon size={18} />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              tabs={STATUS_TABS}
              value={status}
              onChange={changeStatus}
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
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search title or body…"
                className="h-9 min-w-[200px] text-xs"
                aria-label="Search reports"
              />
              <Button type="submit" size="sm" variant="secondary">
                <IconSearch size={14} />
              </Button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
              className="h-9 w-auto text-xs"
              aria-label="Filter by type"
            >
              <option value="all">All types</option>
              {Object.entries(MODERATION_REPORT_KIND).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Select
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value);
                setPage(1);
              }}
              className="h-9 w-auto text-xs"
              aria-label="Filter by severity"
            >
              <option value="all">All severities</option>
              {Object.entries(MODERATION_SEVERITY).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </Select>
            {activeFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <IconXCircle size={13} /> Clear filters
              </Button>
            )}
            <span className="ml-auto text-[11px] text-slate-500">{total} report{total === 1 ? '' : 's'}</span>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : reports.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={IconFlag}
              title={activeFilters ? 'No reports match' : 'No reports yet'}
              message={
                activeFilters
                  ? 'Adjust the status, type, severity or search filters.'
                  : 'Student complaints and content-quality flags will appear here.'
              }
              action={
                activeFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Report</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Severity</th>
                  <th className="px-3 py-2.5 font-medium">Course</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Raised</th>
                  <th className="px-5 py-2.5 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reports.map((report) => {
                  const statusInfo = reportStatusMeta(report.status);
                  const kindInfo = reportKindMeta(report.kind);
                  const severityInfo = severityMeta(report.severity);
                  return (
                    <tr key={report.id} className="hover:bg-white/[0.02]">
                      <td className="max-w-[320px] px-5 py-3">
                        <p className="truncate text-sm font-medium text-slate-200" title={report.title}>
                          {report.title}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {report.reporter_name ? `Raised by ${report.reporter_name}` : 'System generated'}
                          {report.subject_moderator_name ? ` · ${report.subject_moderator_name}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={kindInfo.tone}>{kindInfo.label}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={severityInfo.tone}>{severityInfo.label}</Badge>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-400">{report.course_title || '-'}</td>
                      <td className="px-3 py-3">
                        <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{formatDateTime(report.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openReport(report.id)}>
                          Review <IconArrowRight size={13} />
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
        title="Moderation report"
        size="lg"
        footer={
          selected && !detailLoading ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {selected.status !== 'in_review' && selected.status !== 'resolved' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => patchReport('in_review')}
                    loading={actionLoading === 'in_review'}
                  >
                    <IconClock size={13} /> Mark in review
                  </Button>
                )}
                {selected.status !== 'resolved' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => patchReport('resolved')}
                    loading={actionLoading === 'resolved'}
                  >
                    <IconCheckCircle size={13} /> Resolve
                  </Button>
                )}
                {selected.status !== 'dismissed' && selected.status !== 'resolved' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => patchReport('dismissed')}
                    loading={actionLoading === 'dismissed'}
                  >
                    <IconXCircle size={13} /> Dismiss
                  </Button>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailLoading || !selected?.title ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={reportStatusMeta(selected.status).tone}>{reportStatusMeta(selected.status).label}</Badge>
                <Badge tone={reportKindMeta(selected.kind).tone}>{reportKindMeta(selected.kind).label}</Badge>
                <Badge tone={severityMeta(selected.severity).tone}>{severityMeta(selected.severity).label}</Badge>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{selected.title}</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Raised {formatDateTime(selected.created_at)}
                {selected.reporter_name ? ` by ${selected.reporter_name}` : ''}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Course', selected.course_title],
                ['Instructor', selected.instructor_name],
                ['Student', selected.student_name],
                ['Assigned moderator', selected.subject_moderator_name],
                ['Escalated to', selected.escalated_to_name],
                ['Resolved', selected.resolved_at ? formatDateTime(selected.resolved_at) : null],
              ]
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="truncate text-xs text-slate-800 dark:text-slate-200">{value}</p>
                  </div>
                ))}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Description</p>
              <p className="mt-1 whitespace-pre-line rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-night-900/60 dark:text-slate-300">
                {selected.body || 'No description was provided.'}
              </p>
            </div>

            <Textarea
              label="Resolution / internal note"
              rows={3}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="Explain what you checked and how the issue was resolved."
              hint="Required before resolving. The reporter is notified."
            />

            {!isSenior && selected.status !== 'escalated' && selected.status !== 'resolved' && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 dark:border-accent-400/20 dark:bg-accent-400/[0.06]">
                <p className="flex items-center gap-1.5 text-xs font-medium text-purple-800 dark:text-accent-200">
                  <IconSend size={13} /> Escalate to senior moderator
                </p>
                <Textarea
                  rows={2}
                  value={escalateReason}
                  onChange={(event) => setEscalateReason(event.target.value)}
                  placeholder="Why does this need senior attention?"
                  className="mt-2"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={escalateReport}
                    loading={actionLoading === 'escalate'}
                  >
                    <IconArrowRight size={13} /> Escalate
                  </Button>
                </div>
              </div>
            )}

            {selected.status === 'escalated' && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-xs text-purple-800 dark:border-accent-400/20 dark:bg-accent-400/[0.06] dark:text-accent-200">
                <p className="flex items-center gap-1.5 font-medium">
                  <IconShield size={13} /> Escalated
                  {selected.escalated_to_name ? ` to ${selected.escalated_to_name}` : ''}
                </p>
                <p className="mt-1 text-[11px] opacity-80">
                  {selected.escalated_at ? `Escalated ${formatDateTime(selected.escalated_at)}.` : ''} The senior
                  moderator now owns this report.
                </p>
              </div>
            )}

            {selected.resolution && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Current resolution</p>
                <p className="mt-1 whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-200">
                  {selected.resolution}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
