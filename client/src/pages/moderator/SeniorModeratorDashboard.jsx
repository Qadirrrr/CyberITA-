import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Skeleton,
  StatCard,
} from '../../components/ui';
import {
  IconAlert,
  IconArrowRight,
  IconCheckCircle,
  IconFlag,
  IconRefresh,
  IconShield,
  IconUsers,
} from '../../components/icons';
import {
  ASSIGNMENT_KIND_LABEL,
  MODERATOR_STATUS,
  describeAssignment,
  reportKindMeta,
  reportStatusMeta,
  severityMeta,
  tierMeta,
} from '../../lib/moderation';
import { formatDateTime } from '../../lib/format';

export default function SeniorModeratorDashboard() {
  const toast = useToast();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { data } = await api.get('/moderation/workspace');
        setWorkspace(data);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not load your moderation workspace.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id) => {
    setDetail({ id });
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/moderation/supervised/${id}`);
      setDetail(data);
    } catch (err) {
      setDetail(null);
      toast.error(getErrorMessage(err, 'Could not load this moderator.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const stats = workspace?.stats || {};
  const supervised = workspace?.supervised || [];
  const escalated = workspace?.escalated || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-accent-400/10 dark:text-accent-300">
              <IconShield size={18} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold">Senior moderator workspace</h1>
              <p className="text-xs text-slate-400">
                Supervise subject moderators, review their activity and resolve escalations.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to="/moderator/reports" size="sm" variant="secondary">
            <IconFlag size={14} /> Reports &amp; escalations
          </Button>
          <Button size="sm" variant="ghost" onClick={() => load()}>
            <IconRefresh size={14} /> Refresh
          </Button>
        </div>
      </div>

      {workspace?.moderator && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={workspace.moderator.avatar_url}
              name={workspace.moderator.display_name || workspace.moderator.user_name}
            />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {workspace.moderator.display_name || workspace.moderator.user_name}
              </p>
              <p className="text-[11px] text-slate-500">{workspace.moderator.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tierMeta(workspace.moderator.tier).tone}>{tierMeta(workspace.moderator.tier).label}</Badge>
            <Badge tone={MODERATOR_STATUS[workspace.moderator.status]?.tone || 'slate'}>
              {MODERATOR_STATUS[workspace.moderator.status]?.label || workspace.moderator.status}
            </Badge>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconUsers}
          label="Supervised moderators"
          value={stats.supervised_moderators ?? supervised.length}
          hint="Subject / course moderators"
        />
        <StatCard
          icon={IconAlert}
          label="Escalated to you"
          value={stats.escalated_reports ?? 0}
          hint="Needs a senior decision"
          tone="accent"
        />
        <StatCard
          icon={IconFlag}
          label="Open in your team"
          value={stats.open_reports ?? 0}
          hint="Open or in review"
          tone="amber"
        />
        <StatCard
          icon={IconCheckCircle}
          label="Resolved by your team"
          value={stats.resolved_reports ?? 0}
          hint="Closed reports"
          tone="emerald"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Subject moderators you supervise</h2>
              <p className="text-[11px] text-slate-500">Monitor workload, assigned scope and open reports.</p>
            </div>
            <Badge tone="slate">{supervised.length}</Badge>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : supervised.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={IconUsers}
                title="No moderators assigned"
                message="Ask an administrator to assign subject/course moderators to your supervision."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Moderator</th>
                    <th className="px-3 py-2.5 font-medium">Scope</th>
                    <th className="px-3 py-2.5 font-medium">Open</th>
                    <th className="px-3 py-2.5 font-medium">Escalated</th>
                    <th className="px-5 py-2.5 text-right font-medium">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {supervised.map((moderator) => (
                    <tr key={moderator.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={moderator.avatar_url} name={moderator.display_name || moderator.full_name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-200">
                              {moderator.display_name || moderator.full_name}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">{moderator.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-400">
                        {moderator.course_count} courses · {moderator.instructor_count} instructors
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={Number(moderator.open_reports) > 0 ? 'amber' : 'slate'}>
                          {moderator.open_reports ?? 0}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={Number(moderator.escalated_reports) > 0 ? 'accent' : 'slate'}>
                          {moderator.escalated_reports ?? 0}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(moderator.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Escalated to you</h2>
              <p className="text-[11px] text-slate-500">Reports your team could not resolve.</p>
            </div>
            <Link to="/moderator/reports?status=escalated" className="text-[11px] text-brand-600 hover:text-brand-500 dark:text-brand-300">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : escalated.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={IconCheckCircle}
                title="Nothing escalated"
                message="When a subject moderator escalates a report it will appear here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {escalated.map((report) => (
                <li key={report.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200" title={report.title}>
                        {report.title}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">
                        {report.course_title || 'General'} · {report.subject_moderator_name || 'Unassigned'}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-600">{formatDateTime(report.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={severityMeta(report.severity).tone}>{severityMeta(report.severity).label}</Badge>
                      <Badge tone={reportStatusMeta(report.status).tone}>{reportStatusMeta(report.status).label}</Badge>
                    </div>
                  </div>
                  <Link
                    to="/moderator/reports?status=escalated"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-500 dark:text-brand-300"
                  >
                    Review escalation <IconArrowRight size={12} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">Moderation guardrails</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            You can only see the subject moderators assigned to you and their reports. Admin settings,
            infrastructure and API keys remain outside moderator access.
          </p>
        </div>
        <Button as={Link} to="/moderator/reports" size="sm" variant="secondary">
          <IconFlag size={14} /> Open reports
        </Button>
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Moderator activity"
        description={detail?.moderator ? detail.moderator.display_name || detail.moderator.full_name : undefined}
        size="lg"
      >
        {detailLoading || !detail?.moderator ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{tierMeta(detail.moderator.tier || 'subject_moderator').label}</Badge>
              <Badge tone={MODERATOR_STATUS[detail.moderator.status]?.tone || 'slate'}>
                {MODERATOR_STATUS[detail.moderator.status]?.label || detail.moderator.status}
              </Badge>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Assigned scope</p>
              {detail.assignments?.length ? (
                <ul className="mt-1 space-y-1">
                  {detail.assignments.map((assignment, index) => (
                    <li
                      key={`${assignment.kind}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <span className="text-slate-700 dark:text-slate-300">{describeAssignment(assignment)}</span>
                      <Badge tone="slate">{ASSIGNMENT_KIND_LABEL[assignment.kind] || assignment.kind}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No assignments yet.</p>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Recent reports</p>
              {detail.reports?.length ? (
                <ul className="mt-1 divide-y divide-white/5">
                  {detail.reports.map((report) => (
                    <li key={report.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-200">{report.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {report.course_title || 'General'} · {formatDateTime(report.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Badge tone={reportKindMeta(report.kind).tone}>{reportKindMeta(report.kind).label}</Badge>
                        <Badge tone={reportStatusMeta(report.status).tone}>
                          {reportStatusMeta(report.status).label}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">No reports from this moderator yet.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
