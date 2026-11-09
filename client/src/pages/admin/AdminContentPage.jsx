import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatCard,
} from '../../components/ui';
import {
  IconAward,
  IconBookOpen,
  IconCheckCircle,
  IconFileText,
  IconFlag,
  IconMail,
  IconRefresh,
  IconShield,
} from '../../components/icons';
import { formatDate, timeAgo } from '../../lib/format';

const reportStatusTone = { submitted: 'amber', approved: 'emerald', rejected: 'rose', published: 'brand' };
const flagStatusTone = { open: 'rose', reviewing: 'amber', resolved: 'emerald', dismissed: 'slate' };
const postStatusTone = { published: 'emerald', draft: 'amber' };

export default function AdminContentPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvingFlag, setResolvingFlag] = useState(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: res } = await api.get('/admin/content-overview');
      setData(res);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load content overview.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFlagAction = async (flagId, status, note = '') => {
    setResolvingFlag(flagId);
    try {
      await api.patch(`/admin/content-reports/${flagId}`, { status, note });
      toast.success(`Report marked as ${status}.`);
      load(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update report.'));
    } finally {
      setResolvingFlag(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stats = data?.stats ?? {};
  const policies = data?.policies ?? {};
  const recentPosts = data?.recentPosts ?? [];
  const pendingReports = data?.pendingReports ?? [];
  const flags = data?.flags ?? [];

  const contentPolicies = policies?.content ?? {};
  const enrollmentPolicies = policies?.enrollment ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Content & Publication</h1>
          <p className="mt-1 text-sm text-slate-400">
            Blog oversight, lab report review, reported content flags and editorial policies.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => load(false)}>
          <IconRefresh size={14} /> Refresh
        </Button>
      </div>

      {/* Alert for pending flags */}
      {stats.flags_open > 0 && (
        <Alert tone="amber" title={`${stats.flags_open} reported content item${stats.flags_open !== 1 ? 's' : ''} pending review`}>
          Review and resolve flagged content to maintain platform quality.
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconBookOpen}
          label="Blog Posts"
          value={stats.posts_published ?? 0}
          hint={`${stats.posts_drafts ?? 0} drafts · ${stats.posts_from_reports ?? 0} from reports`}
          to="/instructor/blog"
        />
        <StatCard
          icon={IconFileText}
          label="Lab Reports"
          value={(stats.reports_submitted ?? 0) + (stats.reports_approved ?? 0) + (stats.reports_published ?? 0)}
          hint={`${stats.reports_submitted ?? 0} pending review`}
          tone="amber"
          to="/instructor/reports"
        />
        <StatCard
          icon={IconFlag}
          label="Content Flags"
          value={stats.flags_open ?? 0}
          hint={`of ${stats.flags_total ?? 0} total reports`}
          tone="rose"
          onClick={() => document.getElementById('content-flags')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatCard
          icon={IconAward}
          label="Certificates"
          value={stats.certificates ?? 0}
          hint="issued to learners"
          tone="emerald"
          to="/student/certificates"
        />
      </div>

      {/* Policies */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Active Policies</h2>
            <p className="text-[11px] text-slate-500">Current platform editorial & evaluation rules</p>
          </div>
          <Button as={Link} to="/admin/settings" size="sm" variant="secondary">
            <IconShield size={13} /> Edit Policies
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              label: 'Report Review Required',
              value: contentPolicies.requireReportReview !== false,
              hint: 'Instructor must review before publication',
            },
            {
              label: 'Certificate Auto-Issue',
              value: contentPolicies.certificateAutoIssue !== false,
              hint: 'Auto-issue at 100% course progress',
            },
            {
              label: 'Blog Auto-Publish',
              value: Boolean(contentPolicies.blogAutoPublish),
              hint: 'Instructors publish without admin approval',
            },
            {
              label: 'Open Registration',
              value: Boolean((policies?.general ?? {}).registrationOpen),
              hint: 'New student self-registration',
            },
            {
              label: 'Maintenance Mode',
              value: Boolean((policies?.general ?? {}).maintenanceMode),
              hint: 'Non-admin users see advisory',
              danger: true,
            },
          ].map((policy) => (
            <div key={policy.label} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                policy.value
                  ? policy.danger
                    ? 'bg-rose-400/10 text-rose-300'
                    : 'bg-emerald-400/10 text-emerald-300'
                  : 'bg-white/5 text-slate-600'
              }`}>
                <IconCheckCircle size={12} />
              </span>
              <div className="min-w-0">
                <p className={`text-xs font-medium ${policy.value ? (policy.danger ? 'text-rose-200' : 'text-slate-100') : 'text-slate-500'}`}>
                  {policy.label}
                </p>
                <p className="text-[10px] text-slate-600">{policy.hint}</p>
              </div>
              <Badge tone={policy.value ? (policy.danger ? 'rose' : 'emerald') : 'slate'} className="ml-auto shrink-0">
                {policy.value ? 'On' : 'Off'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Pending Lab Reports */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Pending Lab Reports</h2>
            <p className="text-[11px] text-slate-500">Submitted by students, awaiting instructor review</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="amber">{stats.reports_submitted ?? 0} pending</Badge>
            <Button as={Link} to="/instructor/reports" size="sm" variant="secondary">
              Review All
            </Button>
          </div>
        </div>

        {pendingReports.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={IconFileText} title="No pending reports" message="All reports have been reviewed." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Lab</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pendingReports.map((report) => (
                  <tr key={report.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-200">{report.student_name}</p>
                      <p className="text-[10px] text-slate-500">{report.student_email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 max-w-[150px] truncate">{report.lab_title}</td>
                    <td className="px-3 py-2.5 text-slate-400 max-w-[120px] truncate">{report.course_title || '-'}</td>
                    <td className="px-3 py-2.5">
                      {report.max_score > 0 ? (
                        <Badge tone="brand">{report.score}/{report.max_score}</Badge>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{timeAgo(report.created_at)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button as={Link} to={`/instructor/reports/${report.id}`} size="sm" variant="secondary">
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Recent Blog Posts */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Blog Posts</h2>
            <p className="text-[11px] text-slate-500">Recent articles and publication status</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="brand">{stats.posts_published ?? 0} published</Badge>
            <Button as={Link} to="/instructor/blog" size="sm" variant="secondary">
              Manage Blog
            </Button>
          </div>
        </div>

        {recentPosts.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={IconBookOpen} title="No blog posts" message="No articles have been published yet." />
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {recentPosts.map((post) => (
              <div key={post.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">{post.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    by {post.author_name || 'Unknown'}
                    {post.source_report_id && <span className="ml-1.5 text-accent-400">· from lab report</span>}
                    <span className="ml-1.5">{timeAgo(post.created_at)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {post.view_count > 0 && (
                    <span className="text-[10px] text-slate-600">{post.view_count} views</span>
                  )}
                  <Badge tone={postStatusTone[post.status] ?? 'slate'}>{post.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Reported Content Flags */}
      <Card id="content-flags" className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Reported Content</h2>
            <p className="text-[11px] text-slate-500">User-submitted content flags requiring moderation</p>
          </div>
          <Badge tone={stats.flags_open > 0 ? 'rose' : 'slate'}>
            {stats.flags_open ?? 0} open
          </Badge>
        </div>

        {flags.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={IconFlag} title="No open flags" message="All content reports have been resolved." />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {flags.map((flag) => (
              <div key={flag.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={flagStatusTone[flag.status] ?? 'slate'}>{flag.status}</Badge>
                      <Badge tone="slate" className="capitalize">{flag.content_type}</Badge>
                      {flag.content_title && (
                        <span className="text-xs text-slate-300 truncate max-w-[200px]">{flag.content_title}</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      <strong className="text-slate-300">Reason:</strong> {flag.reason}
                    </p>
                    {flag.details && (
                      <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{flag.details}</p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-600">
                      Reported by {flag.reporter_name} ({flag.reporter_email}) · {timeAgo(flag.created_at)}
                    </p>
                  </div>
                  {flag.status === 'open' && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-amber-400 hover:text-amber-300"
                        onClick={() => handleFlagAction(flag.id, 'reviewing')}
                        loading={resolvingFlag === flag.id}
                      >
                        Review
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-400 hover:text-emerald-300"
                        onClick={() => handleFlagAction(flag.id, 'resolved', 'Resolved by admin.')}
                        loading={resolvingFlag === flag.id}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-slate-300"
                        onClick={() => handleFlagAction(flag.id, 'dismissed', 'Dismissed by admin.')}
                        loading={resolvingFlag === flag.id}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                  {flag.status === 'reviewing' && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-400 hover:text-emerald-300"
                        onClick={() => handleFlagAction(flag.id, 'resolved', 'Resolved by admin.')}
                        loading={resolvingFlag === flag.id}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-slate-300"
                        onClick={() => handleFlagAction(flag.id, 'dismissed', 'Dismissed by admin.')}
                        loading={resolvingFlag === flag.id}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {(data?.flagsTotal ?? 0) > flags.length && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 px-4 py-3">
            <span className="text-xs text-slate-500">
              Showing {flags.length} of {data.flagsTotal} total flags
            </span>
            <Button variant="ghost" size="sm">View All</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
