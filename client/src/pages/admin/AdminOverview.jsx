import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { AnimatedNumber, Avatar, Badge, Button, Card, Skeleton, StatCard } from '../../components/ui';
import DonutChart from '../../components/DonutChart';
import {
  IconArrowRight,
  IconAward,
  IconBarChart,
  IconBookOpen,
  IconClipboard,
  IconFileText,
  IconGraduationCap,
  IconMail,
  IconMessage,
  IconPlus,
  IconShield,
  IconTerminal,
  IconUsers,
  IconZap,
} from '../../components/icons';
import { formatDate } from '../../lib/format';
import { ROLES } from '../../lib/constants';

const roleTone = { admin: 'rose', instructor: 'accent', student: 'brand' };

const ROLE_COLORS = { student: '#22d3ee', instructor: '#a78bfa', admin: '#fb7185' };
const ENROLLMENT_COLORS = { completed: '#34d399', active: '#38bdf8', dropped: '#fb7185' };

function localDateKey(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildWeeklySeries(data, weeks = 12) {
  const counts = new Map((data ?? []).map((item) => [localDateKey(item.week), Number(item.count) || 0]));
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const series = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - index * 7);
    const key = localDateKey(date);
    series.push({ week: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

function SeriesBars({ data, tone = 'brand' }) {
  if (!data?.length || data.every((item) => Number(item.count) === 0)) {
    return (
      <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 text-center">
        <IconBarChart size={20} className="text-slate-600" />
        <p className="text-[11px] text-slate-600">No weekly activity yet</p>
      </div>
    );
  }

  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((item) => (
        <div key={String(item.week)} className="group relative flex flex-1 flex-col items-center gap-1">
          <span className="text-[9px] text-slate-600 opacity-0 transition group-hover:opacity-100">{item.count}</span>
          <div
            className={`w-full rounded-t ${tone === 'brand' ? 'bg-brand-400/60 group-hover:bg-brand-300' : 'bg-accent-400/60 group-hover:bg-accent-300'} transition`}
            style={{ height: `${Math.max(4, (item.count / max) * 88)}px` }}
            title={`${new Date(item.week).toLocaleDateString()} · ${item.count}`}
          />
          <span className="text-[8px] text-slate-700">{new Date(item.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      ))}
    </div>
  );
}

function DonutLegend({ segments, total }) {
  const safeTotal = Number(total) || segments.reduce((sum, segment) => sum + Number(segment.value || 0), 0);
  return (
    <dl className="w-full min-w-0 space-y-2.5">
      {segments.map((segment) => {
        const value = Number(segment.value || 0);
        const share = safeTotal > 0 ? Math.round((value / safeTotal) * 100) : 0;
        return (
          <div key={segment.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="flex min-w-0 items-center gap-2 text-slate-400">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="truncate">{segment.label}</span>
            </dt>
            <dd className="shrink-0 tabular-nums text-slate-200">
              <span className="font-medium">{value}</span>
              <span className="ml-1 text-slate-600">{share}%</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/admin/overview')
      .then((res) => {
        if (!cancelled) setStats(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load platform statistics.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const completionRate = useMemo(() => {
    if (!stats?.enrollments?.total) return 0;
    return Math.round((stats.enrollments.completed / stats.enrollments.total) * 100);
  }, [stats]);

  const signupWeeks = useMemo(() => buildWeeklySeries(stats?.signupSeries), [stats]);
  const enrollmentWeeks = useMemo(() => buildWeeklySeries(stats?.enrollmentSeries), [stats]);

  const roleSegments = useMemo(
    () => [
      { label: 'Students', value: stats?.users.students ?? 0, color: ROLE_COLORS.student },
      { label: 'Instructors', value: stats?.users.instructors ?? 0, color: ROLE_COLORS.instructor },
      {
        label: 'Admins',
        value: stats?.users.admins ?? Math.max(0, (stats?.users.total ?? 0) - (stats?.users.students ?? 0) - (stats?.users.instructors ?? 0)),
        color: ROLE_COLORS.admin,
      },
    ],
    [stats]
  );

  const enrollmentSegments = useMemo(
    () => [
      { label: 'Completed', value: stats?.enrollments.completed ?? 0, color: ENROLLMENT_COLORS.completed },
      { label: 'In progress', value: stats?.enrollments.active ?? 0, color: ENROLLMENT_COLORS.active },
      { label: 'Dropped', value: stats?.enrollments.dropped ?? 0, color: ENROLLMENT_COLORS.dropped },
    ],
    [stats]
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  const topCourses = stats.topCourses ?? [];
  const recentUsers = stats.recentUsers ?? [];
  const engagement = stats.engagement ?? { active_learners_7d: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Platform overview</h1>
          <p className="mt-1 text-sm text-slate-400">Adoption, content and community health at a glance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to="/admin/users?create=1" size="sm">
            <IconPlus size={14} /> New account
          </Button>
          <Button as={Link} to="/admin/users" size="sm" variant="secondary">
            <IconUsers size={14} /> Users
          </Button>
          <Button as={Link} to="/admin/broadcast" size="sm" variant="ghost">
            <IconMessage size={14} /> Broadcast
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconUsers}
          label="Accounts"
          value={stats.users.total}
          hint={`${stats.users.students} learners · ${stats.users.instructors} instructors`}
        />
        <StatCard
          icon={IconBookOpen}
          label="Courses"
          value={stats.courses.total}
          hint={`${stats.courses.published} published · ${stats.courses.drafts} drafts`}
          tone="accent"
        />
        <StatCard
          icon={IconGraduationCap}
          label="Enrollments"
          value={stats.enrollments.total}
          hint={`${completionRate}% completion rate`}
          tone="emerald"
        />
        <StatCard
          icon={IconTerminal}
          label="Lab sessions"
          value={stats.labs.sessions}
          hint={`${stats.labs.completed_sessions} completed · ${stats.labs.steps_completed} steps`}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">New signups</h2>
              <p className="text-[11px] text-slate-500">Last 12 weeks</p>
            </div>
            <Badge tone="brand">{signupWeeks.reduce((sum, item) => sum + item.count, 0)} total</Badge>
          </div>
          <div className="mt-4">
            <SeriesBars data={signupWeeks} />
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Enrollments</h2>
              <p className="text-[11px] text-slate-500">Last 12 weeks</p>
            </div>
            <Badge tone="accent">{enrollmentWeeks.reduce((sum, item) => sum + item.count, 0)} total</Badge>
          </div>
          <div className="mt-4">
            <SeriesBars data={enrollmentWeeks} tone="accent" />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold">Account mix</h2>
          <p className="text-[11px] text-slate-500">People by access level</p>
          <div className="mt-5 flex items-center gap-4">
            <DonutChart segments={roleSegments} total={stats.users.total} label="accounts" size={132} thickness={13} />
            <DonutLegend segments={roleSegments} total={stats.users.total} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base font-semibold">Enrollment outcomes</h2>
          <p className="text-[11px] text-slate-500">Completion vs. in progress</p>
          <div className="mt-5 flex items-center gap-4">
            <DonutChart
              segments={enrollmentSegments}
              total={stats.enrollments.total}
              label="enrollments"
              size={132}
              thickness={13}
            />
            <DonutLegend segments={enrollmentSegments} total={stats.enrollments.total} />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Engagement</h2>
              <p className="text-[11px] text-slate-500">Live learning signals</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
              <IconZap size={16} />
            </span>
          </div>
          <dl className="mt-4 space-y-3">
            {[
              { label: 'Active learners', value: engagement.active_learners_7d, hint: 'last 7 days', icon: IconUsers, tone: 'text-brand-300' },
              { label: 'Avg. progress', value: Math.round(Number(stats.enrollments.avg_progress)), suffix: '%', hint: 'across enrollments', icon: IconBarChart, tone: 'text-accent-300' },
              { label: 'Completed labs', value: stats.labs.completed_sessions, hint: `of ${stats.labs.sessions} sessions`, icon: IconTerminal, tone: 'text-emerald-300' },
              { label: 'Certificates', value: stats.content.certificates, hint: 'issued to learners', icon: IconAward, tone: 'text-amber-300' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ${item.tone}`}>
                  <item.icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <dt className="text-xs text-slate-300">{item.label}</dt>
                  <p className="text-[10px] text-slate-600">{item.hint}</p>
                </div>
                <dd className="font-display text-sm font-semibold text-white tabular-nums">
                  <AnimatedNumber value={item.value} />
                  {item.suffix}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">Top courses</h2>
              <p className="text-[11px] text-slate-500">Ranked by enrollment and progress</p>
            </div>
            <Badge tone="brand">{topCourses.length} shown</Badge>
          </div>
          <div className="mt-4 space-y-2.5">
            {topCourses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                <IconBookOpen size={22} className="mx-auto text-slate-600" />
                <p className="mt-2 text-sm text-slate-400">No courses yet</p>
                <Link to="/instructor/courses/new" className="mt-1 inline-flex text-xs text-brand-300 hover:text-brand-200">
                  Create the first course
                </Link>
              </div>
            ) : (
              topCourses.map((course) => (
                <Link
                  key={course.id}
                  to={`/instructor/courses/${course.id}`}
                  className="group block rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition hover:border-brand-400/30 hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200 group-hover:text-white">{course.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {course.enrollments} enrolled · {course.completions} completed
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={course.status === 'published' ? 'emerald' : 'slate'}>{course.status}</Badge>
                      <span className="text-xs font-medium text-slate-300 tabular-nums">{Math.round(Number(course.avg_progress))}%</span>
                    </div>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400"
                      style={{ width: `${Math.min(100, Math.max(0, Number(course.avg_progress)))}%` }}
                    />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Inbox</h2>
              <Badge tone="amber">{stats.content.new_messages} new</Badge>
            </div>
            <Link
              to="/admin/messages"
              className="mt-3 flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 transition hover:border-amber-400/40"
            >
              <span className="flex items-center gap-2 text-xs text-amber-200">
                <IconMail size={14} /> Contact messages
              </span>
              <span className="font-display text-lg font-semibold text-amber-300 tabular-nums">
                <AnimatedNumber value={stats.content.new_messages} />
              </span>
            </Link>
            <Link to="/admin/messages" className="mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-400 transition hover:text-slate-200">
              Open inbox <IconArrowRight size={12} />
            </Link>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Recent accounts</h2>
              <Link to="/admin/users" className="text-[10px] text-brand-300 hover:text-brand-200">View all</Link>
            </div>
            <div className="mt-3 space-y-3">
              {recentUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center">
                  <IconUsers size={18} className="mx-auto text-slate-600" />
                  <p className="mt-2 text-xs text-slate-500">No accounts yet</p>
                  <Link to="/admin/users?create=1" className="mt-1 inline-flex text-[11px] text-brand-300 hover:text-brand-200">
                    Create the first account
                  </Link>
                </div>
              ) : (
                recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-2.5">
                    <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">{user.full_name}</p>
                      <p className="truncate text-[10px] text-slate-500">{user.email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={roleTone[user.role] ?? 'slate'}>{ROLES[user.role] ?? user.role}</Badge>
                      <p className="mt-1 text-[9px] text-slate-600">{formatDate(user.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Content pipeline</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Reports', value: stats.content.reports, hint: `${stats.content.reports_pending} pending review`, to: '/instructor/reports', icon: IconFileText, tone: 'text-amber-300' },
            { label: 'Blog posts', value: stats.content.posts, hint: 'published articles', to: '/instructor/blog', icon: IconBookOpen, tone: 'text-brand-300' },
            { label: 'Certificates', value: stats.content.certificates, hint: 'issued to learners', to: '/instructor/students', icon: IconAward, tone: 'text-emerald-300' },
            { label: 'Labs', value: stats.labs.labs, hint: `${stats.labs.screenshots} screenshots`, to: '/instructor/labs', icon: IconTerminal, tone: 'text-accent-300' },
          ].map((item) => (
            <Link key={item.label} to={item.to} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition hover:border-white/20 hover:bg-white/[0.04]">
              <item.icon size={17} className={item.tone} />
              <p className="mt-2 font-display text-2xl font-semibold text-white tabular-nums">
                <AnimatedNumber value={item.value} />
              </p>
              <p className="text-[11px] text-slate-400">{item.label}</p>
              <p className="mt-0.5 text-[10px] text-slate-600">{item.hint}</p>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { to: '/admin/users?create=1', label: 'Create account', icon: IconPlus, hint: 'Admins and instructors' },
          { to: '/instructor/courses', label: 'Manage courses', icon: IconBookOpen, hint: 'Curriculum, quizzes, labs' },
          { to: '/instructor/submissions', label: 'Submission review', icon: IconClipboard, hint: 'Assignment submissions' },
          { to: '/instructor/reports', label: 'Report review', icon: IconFileText, hint: 'Approve and publish' },
        ].map((action) => (
          <Link key={action.to} to={action.to} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-brand-400/30 hover:bg-white/[0.04]">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
              <action.icon size={17} />
            </span>
            <div>
              <p className="text-sm text-slate-200">{action.label}</p>
              <p className="text-[10px] text-slate-500">{action.hint}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
