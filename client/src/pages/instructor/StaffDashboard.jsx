import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { AnimatedNumber, Badge, Button, Card, ProgressBar, Skeleton, StatCard } from '../../components/ui';
import {
  IconArrowRight,
  IconBookOpen,
  IconClipboard,
  IconFileText,
  IconGraduationCap,
  IconLayers,
  IconPlus,
  IconTerminal,
  IconUsers,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';

const statusTone = { published: 'emerald', draft: 'amber', archived: 'slate' };

export default function StaffDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/instructor/overview'), api.get('/courses', { params: { all: true, limit: 60 } })])
      .then(([statsResponse, coursesResponse]) => {
        if (cancelled) return;
        setStats(statsResponse.data);
        const list = coursesResponse.data.courses || [];
        setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your dashboard.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const published = useMemo(() => courses.filter((course) => course.status === 'published').length, [courses]);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            Welcome back, {user?.full_name?.split(' ')[0] || 'instructor'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">Manage your courses, labs and the work your learners submit.</p>
        </div>
        <Button as={Link} to="/instructor/courses/new" size="sm">
          <IconPlus size={14} /> New course
        </Button>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IconBookOpen} label="Courses" value={stats?.courses?.total ?? courses.length} hint={`${stats?.courses?.published ?? published} published`} />
        <StatCard icon={IconUsers} label="Learners" value={stats?.students?.learners ?? 0} hint={`${stats?.students?.enrollments ?? 0} enrollments`} tone="accent" />
        <StatCard icon={IconTerminal} label="Lab sessions" value={stats?.labs?.sessions ?? 0} hint={`${stats?.labs?.screenshots ?? 0} screenshots captured`} tone="emerald" />
        <StatCard icon={IconClipboard} label="Awaiting review" value={(stats?.pending?.reports_pending ?? 0) + (stats?.pending?.submissions_pending ?? 0)} hint={`${stats?.pending?.reports_pending ?? 0} reports · ${stats?.pending?.submissions_pending ?? 0} assignments`} tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold">Your courses</h2>
              <p className="text-[11px] text-slate-500">Average learner progress across your catalog.</p>
            </div>
            <Button as={Link} to="/instructor/courses" variant="ghost" size="sm">
              Manage all <IconArrowRight size={13} />
            </Button>
          </div>
          {courses.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-400">You haven't created a course yet.</p>
              <Button as={Link} to="/instructor/courses/new" size="sm" className="mt-3">
                <IconPlus size={13} /> Create your first course
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {courses.slice(0, 6).map((course) => (
                <li key={course.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-night-950">
                    {course.cover_image ? (
                      <img src={course.cover_image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <IconLayers size={16} className="text-slate-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/instructor/courses/${course.id}`} className="truncate text-sm font-medium text-slate-200 hover:text-brand-300">
                        {course.title}
                      </Link>
                      <Badge tone={statusTone[course.status]}>{course.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {DIFFICULTIES[course.level]?.label || course.level} · {course.lesson_count ?? 0} lessons · {course.enrolled_count ?? 0} learners
                    </p>
                  </div>
                  <Button as={Link} to={`/instructor/courses/${course.id}`} size="sm" variant="ghost">
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Needs your attention</h2>
            <div className="mt-3 space-y-2">
              <Link
                to="/instructor/reports?status=submitted"
                className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 transition hover:border-amber-400/40"
              >
                <span className="flex items-center gap-2 text-xs text-amber-200">
                  <IconFileText size={14} /> Practical reports
                </span>
                <span className="font-display text-lg font-semibold text-amber-300 tabular-nums">
                  <AnimatedNumber value={stats?.pending?.reports_pending ?? 0} />
                </span>
              </Link>
              <Link
                to="/instructor/submissions"
                className="flex items-center justify-between rounded-xl border border-brand-400/20 bg-brand-400/[0.06] px-3 py-2.5 transition hover:border-brand-400/40"
              >
                <span className="flex items-center gap-2 text-xs text-brand-200">
                  <IconClipboard size={14} /> Assignment submissions
                </span>
                <span className="font-display text-lg font-semibold text-brand-300 tabular-nums">
                  <AnimatedNumber value={stats?.pending?.submissions_pending ?? 0} />
                </span>
              </Link>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Quick actions</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { to: '/instructor/labs', label: 'Manage labs', icon: IconTerminal },
                { to: '/instructor/courses', label: 'Course content', icon: IconLayers },
                { to: '/instructor/reports', label: 'Review reports', icon: IconFileText },
                { to: '/instructor/blog', label: 'Blog posts', icon: IconBookOpen },
                { to: '/instructor/students', label: 'Students', icon: IconGraduationCap },
                { to: '/instructor/submissions', label: 'Grading', icon: IconClipboard },
              ].map((action) => (
                <Link
                  key={action.label}
                  to={action.to}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <action.icon size={16} className="text-brand-300" />
                  {action.label}
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Avg. learner progress</span>
              <span className="font-mono text-slate-300">
                <AnimatedNumber value={Math.round(Number(stats?.students?.avg_progress ?? 0))} />%
              </span>
            </div>
            <ProgressBar value={Number(stats?.students?.avg_progress ?? 0)} size="sm" className="mt-2" />
            <p className="mt-2 text-[10px] leading-4 text-slate-600">
              Across {stats?.students?.enrollments ?? 0} enrollments in your courses.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
