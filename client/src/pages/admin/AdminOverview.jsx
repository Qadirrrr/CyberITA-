import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Badge, Button, Card, Skeleton, StatCard } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconBookOpen,
  IconClipboard,
  IconFileText,
  IconGraduationCap,
  IconMail,
  IconMessage,
  IconShield,
  IconTerminal,
  IconUsers,
} from '../../components/icons';

function SeriesBars({ data, tone = 'brand' }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((item) => (
        <div key={String(item.week)} className="group relative flex flex-1 flex-col items-center gap-1">
          <span className="text-[9px] text-slate-600 opacity-0 transition group-hover:opacity-100">{item.count}</span>
          <div
            className={`w-full rounded-t ${tone === 'brand' ? 'bg-brand-400/60 group-hover:bg-brand-300' : 'bg-accent-400/60 group-hover:bg-accent-300'} transition`}
            style={{ height: `${Math.max(4, (item.count / max) * 88)}px` }}
            title={`${new Date(item.week).toLocaleDateString()} Â· ${item.count}`}
          />
          <span className="text-[8px] text-slate-700">{new Date(item.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      ))}
    </div>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Platform overview</h1>
          <p className="mt-1 text-sm text-slate-400">Adoption, content and community health at a glance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to="/admin/users" size="sm" variant="secondary">
            <IconUsers size={14} /> Users
          </Button>
          <Button as={Link} to="/admin/broadcast" size="sm">
            <IconMessage size={14} /> Broadcast
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IconUsers} label="Users" value={stats.users.total} hint={`${stats.users.new_this_week} new this week`} />
        <StatCard icon={IconBookOpen} label="Courses" value={stats.courses.total} hint={`${stats.courses.published} published Â· ${stats.courses.drafts} drafts`} tone="accent" />
        <StatCard icon={IconGraduationCap} label="Enrollments" value={stats.enrollments.total} hint={`${completionRate}% completion rate`} tone="emerald" />
        <StatCard icon={IconTerminal} label="Lab sessions" value={stats.labs.sessions} hint={`${stats.labs.steps_completed} steps completed`} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">New signups</h2>
              <p className="text-[11px] text-slate-500">Last 12 weeks</p>
            </div>
            <Badge tone="brand">{stats.signupSeries.reduce((sum, item) => sum + item.count, 0)} total</Badge>
          </div>
          <div className="mt-4">
            <SeriesBars data={stats.signupSeries} />
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Enrollments</h2>
              <p className="text-[11px] text-slate-500">Last 12 weeks</p>
            </div>
            <Badge tone="accent">{stats.enrollmentSeries.reduce((sum, item) => sum + item.count, 0)} total</Badge>
          </div>
          <div className="mt-4">
            <SeriesBars data={stats.enrollmentSeries} tone="accent" />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                <p className="mt-2 font-display text-2xl font-semibold text-white">{item.value}</p>
                <p className="text-[11px] text-slate-400">{item.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-600">{item.hint}</p>
              </Link>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Inbox</h2>
            <Link to="/admin/messages" className="mt-3 flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 transition hover:border-amber-400/40">
              <span className="flex items-center gap-2 text-xs text-amber-200">
                <IconMail size={14} /> New contact messages
              </span>
              <span className="font-display text-lg font-semibold text-amber-300">{stats.content.new_messages}</span>
            </Link>
            <Link to="/admin/messages" className="mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-400 transition hover:text-slate-200">
              Open inbox <IconArrowRight size={12} />
            </Link>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Platform mix</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between"><dt className="text-slate-500">Students</dt><dd className="text-slate-300">{stats.users.students}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-500">Instructors</dt><dd className="text-slate-300">{stats.users.instructors}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-500">Admins</dt><dd className="text-slate-300">{stats.users.total - stats.users.students - stats.users.instructors}</dd></div>
              <div className="flex items-center justify-between border-t border-white/10 pt-2"><dt className="text-slate-500">Avg. progress</dt><dd className="text-slate-300">{Math.round(Number(stats.enrollments.avg_progress))}%</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { to: '/instructor/courses', label: 'Manage courses', icon: IconBookOpen, hint: 'Curriculum, quizzes, labs' },
          { to: '/instructor/submissions', label: 'Grading queue', icon: IconClipboard, hint: 'Assignment submissions' },
          { to: '/instructor/reports', label: 'Report review', icon: IconFileText, hint: 'Approve and publish' },
          { to: '/admin/users', label: 'User management', icon: IconShield, hint: 'Roles and access' },
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
