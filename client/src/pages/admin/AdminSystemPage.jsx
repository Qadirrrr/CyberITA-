import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  Skeleton,
  StatCard,
} from '../../components/ui';
import {
  IconBarChart,
  IconCheckCircle,
  IconFileText,
  IconGraduationCap,
  IconRefresh,
  IconServer,
  IconShield,
  IconTerminal,
  IconUsers,
  IconXCircle,
} from '../../components/icons';
import { formatDateTime, timeAgo } from '../../lib/format';

function bytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = Number(n);
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(1)} ${units[i]}`;
}

function uptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

const authActionTone = {
  'account.login': 'emerald',
  'account.logout': 'slate',
  'account.registered': 'brand',
  'account.login_failed': 'rose',
  'account.password_reset': 'amber',
  'account.email_verified': 'slate',
  // legacy keys kept so older rows render correctly
  'auth.login': 'emerald',
  'auth.logout': 'slate',
  'auth.register': 'brand',
  'auth.login_failed': 'rose',
};

export default function AdminSystemPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: res } = await api.get('/admin/system-status');
      setData(res);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load system status.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const security = data?.security ?? {};
  const database = data?.database ?? {};
  const memory = data?.memory ?? {};
  const errors = data?.errors ?? {};
  const learning = data?.learning ?? {};
  const backups = data?.backups ?? {};

  const dbSizeDisplay = bytes(database.sizeBytes);
  const memUsedDisplay = bytes(memory.heapUsedBytes);
  const memTotalDisplay = bytes(memory.totalBytes);
  const rssDisplay = bytes(memory.rssBytes);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">System Status & Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">
            Security posture, database health, error log, backup status and learning analytics.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => load(false)}>
            <IconRefresh size={14} /> Refresh
          </Button>
          <Button as={Link} to="/admin/logs" size="sm" variant="secondary">
            <IconFileText size={14} /> Audit Logs
          </Button>
          <Button as={Link} to="/admin/settings" size="sm" variant="secondary">
            <IconServer size={14} /> Settings
          </Button>
        </div>
      </div>

      {/* System alerts */}
      {errors.failedLabSessions > 0 && (
        <Alert tone="rose" title={`${errors.failedLabSessions} failed lab session${errors.failedLabSessions !== 1 ? 's' : ''} detected`}>
          Review the failed sessions below and consider cleaning up orphaned containers.
        </Alert>
      )}

      {/* Key System Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          className="p-4 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-white/20"
          onClick={() => document.getElementById('database-health')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Server Uptime</span>
            <Badge tone="emerald">online</Badge>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-white tabular-nums">
            {uptime(data?.uptimeSeconds ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {data?.time ? `As of ${new Date(data.time).toLocaleTimeString()}` : ''}
          </p>
        </Card>
        <Card
          className="p-4 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-white/20"
          onClick={() => document.getElementById('database-health')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Database</span>
            <Badge tone={database.latencyMs >= 0 ? 'emerald' : 'rose'}>
              {database.latencyMs >= 0 ? `${database.latencyMs}ms` : 'error'}
            </Badge>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-white">{dbSizeDisplay}</p>
          <p className="mt-1 text-[11px] text-slate-500">{(database.tables ?? []).length} tables tracked</p>
        </Card>
        <Card
          className="p-4 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-white/20"
          onClick={() => document.getElementById('database-health')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Memory (Heap)</span>
            <span className="text-xs text-slate-500">Node.js</span>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-white">{memUsedDisplay}</p>
          <p className="mt-1 text-[11px] text-slate-500">RSS {rssDisplay} · System {memTotalDisplay}</p>
        </Card>
        <Card
          className="p-4 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-white/20"
          onClick={() => document.getElementById('security-posture')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Sessions</span>
            <Badge tone="brand">{security.active_sessions ?? 0}</Badge>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-white">
            {security.active_sessions ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">live refresh tokens</p>
        </Card>
      </div>

      {/* Security Posture */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card id="security-posture" className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Security Posture</h2>
              <p className="text-[11px] text-slate-500">Access control & account health</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
              <IconShield size={16} />
            </span>
          </div>
          <dl className="mt-4 space-y-3">
            {[
              { label: 'Admin accounts', value: security.admins ?? 0, tone: 'text-rose-300' },
              { label: 'Instructor accounts', value: security.instructors ?? 0, tone: 'text-accent-300' },
              { label: 'Student accounts', value: security.students ?? 0, tone: 'text-brand-300' },
              { label: 'Disabled accounts', value: security.disabled_accounts ?? 0, tone: 'text-slate-500', warn: security.disabled_accounts > 0 },
              { label: 'Active sessions (tokens)', value: security.active_sessions ?? 0, tone: 'text-emerald-300' },
              { label: 'Instructors without courses', value: security.instructors_without_courses ?? 0, tone: 'text-amber-300', warn: security.instructors_without_courses > 0 },
              { label: 'Students without enrollments', value: security.students_without_enrollments ?? 0, tone: 'text-slate-400' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <dt className={`text-xs ${item.warn ? 'text-amber-200' : 'text-slate-400'}`}>{item.label}</dt>
                <dd className={`font-display text-sm font-semibold tabular-nums ${item.tone}`}>{item.value}</dd>
              </div>
            ))}
            {security.last_admin_login && (
              <div className="flex items-center justify-between border-t border-white/5 pt-3">
                <dt className="text-xs text-slate-400">Last admin login</dt>
                <dd className="text-[11px] text-slate-500">{formatDateTime(security.last_admin_login)}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Recent Auth Events</h2>
              <p className="text-[11px] text-slate-500">Sign-ins and security activity</p>
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            {(security.recentAuth ?? []).length === 0 ? (
              <p className="text-xs text-slate-600">No recent auth events.</p>
            ) : (
              (security.recentAuth ?? []).map((event) => (
                <div key={event.id} className="flex items-center gap-3">
                  <Badge tone={authActionTone[event.action] ?? 'slate'} className="shrink-0 font-mono text-[10px]">
                    {event.action.replace(/^(auth|account)\./, '')}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-300">{event.user_name || event.user_email || 'Unknown'}</p>
                    <p className="text-[10px] text-slate-600">{event.user_email}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-600">{timeAgo(event.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Learning Analytics */}
      <Card id="learning-analytics" className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Learning Analytics</h2>
            <p className="text-[11px] text-slate-500">Platform-wide learning performance</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
            <IconBarChart size={16} />
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Enrollments', value: learning.enrollments ?? 0, hint: `${learning.active ?? 0} active`, icon: IconGraduationCap, tone: 'text-brand-300' },
            { label: 'Completion Rate', value: `${learning.completionRate ?? 0}%`, hint: `${learning.completed ?? 0} completed`, icon: IconCheckCircle, tone: 'text-emerald-300' },
            { label: 'Pending Lab Reviews', value: learning.pending_lab_submissions ?? 0, hint: `${learning.pending_projects ?? 0} projects pending`, icon: IconTerminal, tone: 'text-amber-300' },
            { label: 'Active Users (7d)', value: learning.active_users_7d ?? 0, hint: 'unique users active', icon: IconUsers, tone: 'text-accent-300' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 ${item.tone}`}>
                <item.icon size={17} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-semibold text-white tabular-nums">{item.value}</p>
                <p className="text-[10px] text-slate-400">{item.label}</p>
                <p className="text-[10px] text-slate-600">{item.hint}</p>
              </div>
            </div>
          ))}
        </div>
        {(learning.topCourses ?? []).length > 0 && (
          <div className="mt-4 border-t border-white/5 pt-4">
            <p className="mb-3 text-xs font-medium text-slate-400">Top courses by enrollment</p>
            <div className="space-y-2">
              {(learning?.topCourses || []).map((course) => (
                <div key={course.id} className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate text-xs text-slate-300">{course.title}</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-20 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.min(100, Number(course.avg_progress))}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-[10px] tabular-nums text-slate-500">
                      {course.enrollments} enrolled
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Database Health */}
      <Card id="database-health" className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Database Health</h2>
            <p className="text-[11px] text-slate-500">Table row counts and migration status</p>
          </div>
          <Badge tone={database.latencyMs >= 0 ? 'emerald' : 'rose'}>
            {database.latencyMs >= 0 ? `${database.latencyMs}ms latency` : 'connection error'}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Latest Migration</p>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <p className="font-mono text-[11px] text-slate-300">{database.latestMigration || 'None'}</p>
              {database.latestMigrationAt && (
                <p className="mt-0.5 text-[10px] text-slate-600">{formatDateTime(database.latestMigrationAt)}</p>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Backup Status</p>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <p className="text-[11px] text-slate-300">{backups.strategy}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                Status: {backups.status} · DB Size: {bytes(backups.databaseSizeBytes)}
              </p>
            </div>
          </div>
        </div>
        {(database.tables ?? []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-400">Table Overview</p>
            <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {(database?.tables || []).map((table) => (
                <div key={table.name} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-1.5 text-xs">
                  <span className="font-mono text-slate-400">{table.name}</span>
                  <span className="tabular-nums text-slate-600">{table.rows.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Error Log */}
      {(errors.failedLabSessionList ?? []).length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Failed Lab Sessions</h2>
              <p className="text-[11px] text-slate-500">Recent container failures requiring attention</p>
            </div>
            <Badge tone="rose">{errors.failedLabSessions} failed</Badge>
          </div>
          <div className="mt-4 space-y-2.5">
            {(errors?.failedLabSessionList || []).map((session) => (
              <div key={session.id} className="flex items-start gap-3 rounded-xl border border-rose-400/10 bg-rose-400/[0.04] p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-400/10 text-rose-300">
                  <IconXCircle size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-200">
                    {session.lab_title} · {session.user_name}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {session.user_email} · Provider: {session.provider} · {timeAgo(session.started_at)}
                  </p>
                  {session.instance_id && (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-600">Instance: {session.instance_id}</p>
                  )}
                </div>
                <Badge tone="rose">error</Badge>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Button as={Link} to="/admin/labs" size="sm" variant="secondary">
              <IconTerminal size={13} /> Manage Lab Sessions
            </Button>
          </div>
        </Card>
      )}

      {/* Recent System Failures */}
      {(errors.recentFailures ?? []).length > 0 && (
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold">Recent System Errors</h2>
          <p className="text-[11px] text-slate-500">Events matching error or fail patterns in audit log</p>
          <div className="mt-4 space-y-2">
            {(errors?.recentFailures || []).map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-lg border border-white/5 px-3 py-2.5">
                <Badge tone="rose" className="font-mono text-[10px] shrink-0">{event.action}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-300">
                    {event.user_name ? `${event.user_name} (${event.user_email})` : 'System'}
                  </p>
                  {event.metadata && (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-600 truncate">
                      {JSON.stringify(event.metadata)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-slate-600">{timeAgo(event.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
