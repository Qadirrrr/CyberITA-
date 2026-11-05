import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  AnimatedNumber,
  Avatar,
  Badge,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  StatCard,
} from '../../components/ui';
import {
  IconArrowRight,
  IconBell,
  IconBookOpen,
  IconCheckCircle,
  IconFileText,
  IconGraduationCap,
  IconLayers,
  IconPlus,
  IconTerminal,
  IconUsers,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

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
  const pendingTotal = (stats?.pending?.reports_pending ?? 0) + (stats?.pending?.lab_submissions_pending ?? 0) + (stats?.pending?.projects_pending ?? 0);
  const unreadMessages = stats?.inbox?.unread_messages ?? 0;

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
          <p className="mt-1 text-sm text-slate-400">
            Manage courses, lab assignments and learner conversations from one workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to="/instructor/announcements" size="sm" variant="secondary">
            <IconBell size={14} /> Announcement
          </Button>
          {user?.role === 'admin' ? (
            <Button as={Link} to="/instructor/courses/new" size="sm">
              <IconPlus size={14} /> New course
            </Button>
          ) : (
            <Button as={Link} to="/instructor/labs" size="sm">
              <IconTerminal size={14} /> Lab builder
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconBookOpen}
          label={user?.role === 'admin' ? 'Courses' : 'Assigned courses'}
          value={stats?.courses?.total ?? courses.length}
          hint={`${stats?.courses?.published ?? published} published`}
          to="/instructor/courses"
        />
        <StatCard
          icon={IconUsers}
          label="Learners"
          value={stats?.students?.learners ?? 0}
          hint={`${stats?.students?.enrollments ?? 0} enrollments`}
          tone="accent"
          to="/instructor/students"
        />
        <StatCard
          icon={IconTerminal}
          label="Lab assignments"
          value={stats?.labs?.labs ?? 0}
          hint={`${stats?.labs?.published_labs ?? 0} published`}
          tone="emerald"
          to="/instructor/labs"
        />
        <StatCard
          icon={IconCheckCircle}
          label="Lab reviews"
          value={stats?.pending?.lab_submissions_pending ?? 0}
          hint="Waiting for review"
          tone="amber"
          to="/instructor/lab-submissions"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-display text-base font-semibold">
                  {user?.role === 'admin' ? 'All courses' : 'Assigned courses'}
                </h2>
                <p className="text-[11px] text-slate-500">Average learner progress across your catalog.</p>
              </div>
              <Button as={Link} to="/instructor/courses" variant="ghost" size="sm">
                View all <IconArrowRight size={13} />
              </Button>
            </div>
            {courses.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-400">
                  {user?.role === 'admin'
                    ? "You haven't created a course yet."
                    : 'No courses assigned to you yet.'}
                </p>
                {user?.role === 'admin' ? (
                  <Button as={Link} to="/instructor/courses/new" size="sm" className="mt-3">
                    <IconPlus size={13} /> Create your first course
                  </Button>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Courses assigned to you by the administrator will appear here.
                  </p>
                )}
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
                        <Link
                          to={`/instructor/courses/${course.id}`}
                          className="truncate text-sm font-medium text-slate-200 hover:text-brand-300"
                        >
                          {course.title}
                        </Link>
                        <Badge tone={statusTone[course.status]}>{course.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {DIFFICULTIES[course.level]?.label || course.level} · {course.lesson_count ?? 0} lessons ·{' '}
                        {course.enrolled_count ?? 0} learners
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

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-display text-base font-semibold">Recent learner activity</h2>
                <p className="text-[11px] text-slate-500">Latest lab submissions and project reviews in your courses.</p>
              </div>
              <Button as={Link} to="/instructor/students" variant="ghost" size="sm">
                My students <IconArrowRight size={13} />
              </Button>
            </div>
            <div className="grid gap-0 divide-y divide-white/5 md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="px-5 py-4">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                   <IconTerminal size={12} /> Lab submissions
                </p>
                {stats?.recentSubmissions?.length ? (
                  <ul className="space-y-2.5">
                    {(stats?.recentSubmissions || []).map((item) => (
                      <li key={`submission-${item.id}`} className="flex items-center gap-2.5">
                        <Avatar name={item.student_name} src={item.avatar_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link
                             to="/instructor/lab-submissions"
                            className="block truncate text-xs font-medium text-slate-200 hover:text-brand-300"
                          >
                            {item.student_name}
                          </Link>
                          <p className="truncate text-[10px] text-slate-500">
                             {item.lab_title || 'Lab submission'} · {formatDateTime(item.submitted_at)}
                          </p>
                        </div>
                        <Badge tone={item.status === 'submitted' ? 'amber' : 'emerald'}>
                          {item.status === 'submitted' ? 'new' : item.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-[11px] text-slate-500">No submissions yet.</p>
                )}
              </div>
               <div className="px-5 py-4">
                 <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                   <IconFileText size={12} /> Project reviews
                 </p>
                 {stats?.recentProjects?.length ? (
                   <ul className="space-y-2.5">
                     {(stats.recentProjects || []).map((item) => (
                       <li key={`project-${item.id}`} className="flex items-center gap-2.5">
                         <Avatar name={item.student_name} src={item.avatar_url} size="sm" />
                         <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{item.student_name}</p><p className="truncate text-[10px] text-slate-500">{item.title} · {formatDateTime(item.submitted_at)}</p></div>
                         <Badge tone={item.status === 'submitted' ? 'amber' : 'emerald'}>{item.status}</Badge>
                       </li>
                     ))}
                   </ul>
                 ) : <p className="py-3 text-[11px] text-slate-500">No project reviews yet.</p>}
               </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Needs your attention</h2>
            <div className="mt-3 space-y-2">
              <Link
                to="/instructor/lab-submissions"
                className="flex items-center justify-between rounded-xl border border-brand-400/30 bg-brand-400/[0.08] px-3 py-2.5 transition hover:border-brand-400/50 hover:bg-brand-400/[0.12]"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-brand-600 dark:text-brand-300">
                  <IconCheckCircle size={14} /> Lab submissions to review
                </span>
                <span className="font-display text-lg font-semibold text-brand-600 dark:text-brand-300 tabular-nums">
                  <AnimatedNumber value={stats?.pending?.lab_submissions_pending ?? 0} />
                </span>
              </Link>
              <Link
                to="/instructor/reports?status=submitted"
                className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2.5 transition hover:border-amber-400/50 hover:bg-amber-400/[0.12]"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <IconFileText size={14} /> Practical reports
                </span>
                <span className="font-display text-lg font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                  <AnimatedNumber value={stats?.pending?.reports_pending ?? 0} />
                </span>
              </Link>
              <Link
                to="/instructor/messages"
                className="flex items-center justify-between rounded-xl border border-sky-400/30 bg-sky-400/[0.08] px-3 py-2.5 transition hover:border-sky-400/50 hover:bg-sky-400/[0.12]"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-sky-700 dark:text-sky-300">
                  <IconBell size={14} /> Unread student messages
                </span>
                <span className="font-display text-lg font-semibold text-sky-700 dark:text-sky-300 tabular-nums">
                  <AnimatedNumber value={unreadMessages} />
                </span>
              </Link>
            </div>
            {pendingTotal === 0 && unreadMessages === 0 && (
              <p className="mt-3 text-[10px] leading-4 text-slate-500 dark:text-slate-500">
                You're all caught up. New submissions, reports and messages will appear here.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Quick actions</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { to: '/instructor/labs', label: 'New lab assignment', icon: IconTerminal },
                { to: '/instructor/lab-submissions', label: 'Review lab work', icon: IconCheckCircle },
                { to: '/instructor/announcements', label: 'Announcement', icon: IconBell },
                { to: '/instructor/messages', label: 'Student chat', icon: IconUsers },
                { to: '/instructor/labs', label: 'Lab builder', icon: IconTerminal },
                { to: '/instructor/courses', label: 'Course content', icon: IconLayers },
                { to: '/instructor/reports', label: 'Practical reports', icon: IconFileText },
                { to: '/instructor/students', label: 'My students', icon: IconGraduationCap },
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
            <h2 className="font-display text-base font-semibold">Cohort performance</h2>
            <div className="mt-3 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Avg. learner progress</span>
                  <span className="font-mono text-slate-300">
                    <AnimatedNumber value={Math.round(Number(stats?.students?.avg_progress ?? 0))} />%
                  </span>
                </div>
                <ProgressBar value={Number(stats?.students?.avg_progress ?? 0)} size="sm" className="mt-2" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Approved lab work</span>
                  <span className="font-mono text-slate-300">
                    <AnimatedNumber value={stats?.labs?.lab_submissions_approved ?? 0} />
                  </span>
                </div>
                <ProgressBar
                  value={Math.min(100, Number(stats?.labs?.lab_submissions_approved ?? 0))}
                  tone="emerald"
                  size="sm"
                  className="mt-2"
                />
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-600">
              Across {stats?.students?.enrollments ?? 0} enrollments and {stats?.labs?.sessions ?? 0} lab sessions.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
