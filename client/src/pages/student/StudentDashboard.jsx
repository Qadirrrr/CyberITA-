import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import CourseCard from '../../components/CourseCard';
import { Alert, AnimatedNumber, Badge, Button, Card, EmptyState, ProgressBar, Skeleton, StatCard } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconBarChart,
  IconBookOpen,
  IconCheckCircle,
  IconClock,
  IconFileText,
  IconFlame,
  IconPlay,
  IconTarget,
  IconTerminal,
  IconZap,
} from '../../components/icons';
import { describeActivity, activityToneClasses } from '../../lib/activity';
import { formatDate, timeAgo } from '../../lib/format';

const quickLinks = [
  { to: '/student/courses', label: 'My courses', icon: IconBookOpen, hint: 'Continue where you left off' },
  { to: '/student/labs', label: 'Open a lab', icon: IconTerminal, hint: 'Practice in the terminal' },
  { to: '/student/reports', label: 'Lab reports', icon: IconFileText, hint: 'Draft, submit, publish' },
  { to: '/student/certificates', label: 'Certificates', icon: IconAward, hint: 'Share verified proof' },
];

export default function StudentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/me/stats'),
      api.get('/my-courses'),
      api.get('/me/history', { params: { limit: 8 } }),
      api.get('/reports/mine'),
    ])
      .then(([statsRes, coursesRes, historyRes, reportsRes]) => {
        if (!active) return;
        setStats(statsRes.data);
        setEnrollments(coursesRes.data.enrollments);
        setEvents(historyRes.data.events);
        setReports(reportsRes.data.reports);
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load your dashboard.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const active = enrollments.filter((item) => item.status === 'active');
  const completed = enrollments.filter((item) => item.status === 'completed');
  const feedback = reports.filter((report) => report.status === 'rejected' && report.instructor_feedback);
  const awaitingReview = reports.filter((report) => report.status === 'submitted');

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const firstName = user?.full_name?.split(' ')[0] || 'learner';

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-night-900/60 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-brand-400/[0.07] blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-300">
              <IconSparkles /> {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Welcome back, {firstName}.</h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">
              {active.length > 0
                ? `You have ${active.length} course${active.length === 1 ? '' : 's'} in progress. Keep the momentum going.`
                : 'Ready to start something new? Pick a course and open your first lab.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button as={Link} to="/student/labs" variant="secondary" size="sm">
              <IconTerminal size={15} /> Open a lab
            </Button>
            <Button as={Link} to="/courses" size="sm">
              Browse courses <IconArrowRight size={15} />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconBookOpen}
          label="Active courses"
          value={stats?.enrollments.active ?? 0}
          hint={`${completed.length} completed`}
        />
        <StatCard
          icon={IconTerminal}
          label="Labs started"
          value={stats?.labs.started ?? 0}
          hint={`${stats?.labs.stepsCompleted ?? 0} steps verified`}
          tone="accent"
        />
        <StatCard
          icon={IconCheckCircle}
          label="Avg. progress"
          value={`${Math.round(Number(stats?.enrollments.avg_progress || 0))}%`}
          hint={`${stats?.quizzes.passed ?? 0} quizzes passed`}
          tone="emerald"
        />
        <StatCard
          icon={IconAward}
          label="Certificates"
          value={stats?.certificates ?? 0}
          hint={`${stats?.activeDays30 ?? 0} active days this month`}
          tone="amber"
        />
      </div>

      {(feedback.length > 0 || awaitingReview.length > 0) && (
        <Card className="border-amber-400/25 bg-amber-400/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
                <IconFileText size={19} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">
                  {feedback.length > 0
                    ? `${feedback.length} report${feedback.length === 1 ? '' : 's'} need${feedback.length === 1 ? 's' : ''} changes`
                    : `${awaitingReview.length} report${awaitingReview.length === 1 ? '' : 's'} awaiting review`}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {feedback.length > 0
                    ? 'Your instructor left feedback. Revise and resubmit to get it approved.'
                    : 'We will notify you as soon as your instructor reviews it.'}
                </p>
              </div>
            </div>
            <Button as={Link} to="/student/reports" variant="secondary" size="sm">
              Open reports <IconArrowRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Continue learning</h2>
            <Link to="/student/courses" className="text-xs text-slate-400 transition hover:text-brand-300">
              All courses
            </Link>
          </div>

          {active.length === 0 ? (
            <EmptyState
              icon={IconTarget}
              title="No active courses yet"
              message="Enroll in a course to unlock lessons, labs and instructor-reviewed reports."
              action={
                <Button as={Link} to="/courses">
                  Find your first course
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {active.slice(0, 4).map((enrollment) => (
                <Card key={enrollment.id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-500/25 to-accent-500/20">
                    {enrollment.cover_image ? (
                      <img src={enrollment.cover_image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <IconBookOpen size={22} className="text-brand-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="slate">{enrollment.category}</Badge>
                      {enrollment.has_certificate ? <Badge tone="emerald">Certificate</Badge> : null}
                    </div>
                    <Link
                      to={`/learn/${enrollment.slug}`}
                      className="mt-1 block truncate text-sm font-semibold text-white transition hover:text-brand-200"
                    >
                      {enrollment.title}
                    </Link>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressBar value={Number(enrollment.progress_percent)} size="sm" className="max-w-[220px]" />
                      <span className="shrink-0 text-[11px] font-medium text-slate-400">
                        {Math.round(Number(enrollment.progress_percent))}%
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-[11px] text-slate-500">
                      {enrollment.next_lesson_title ? `Next: ${enrollment.next_lesson_title}` : 'All lessons completed'}
                    </p>
                  </div>
                  <Button as={Link} to={`/learn/${enrollment.slug}`} size="sm" className="shrink-0">
                    <IconPlay size={14} /> Continue
                  </Button>
                </Card>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => {
              const IconComponent = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="group flex items-center gap-3 rounded-xl border border-white/10 bg-night-850/70 p-4 transition hover:border-brand-400/25 hover:bg-night-850"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-brand-300">
                    <IconComponent size={18} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-slate-200 group-hover:text-white">{link.label}</span>
                    <span className="block text-[11px] text-slate-500">{link.hint}</span>
                  </span>
                  <IconArrowRight size={15} className="text-slate-600 transition group-hover:text-brand-300" />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Recent activity</h2>
              <Link to="/student/history" className="text-[11px] text-slate-500 hover:text-brand-300">
                View all
              </Link>
            </div>
            {events.length === 0 ? (
              <p className="mt-6 text-center text-xs text-slate-500">Your activity will appear here as you learn.</p>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {events.slice(0, 6).map((event) => {
                  const info = describeActivity(event);
                  return (
                    <li key={event.id} className="flex gap-3">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${activityToneClasses(info.tone)}`}>
                        <IconZap size={13} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] leading-5 text-slate-300">{info.title}</p>
                        <p className="text-[10px] text-slate-600">{timeAgo(event.created_at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <IconFlame size={17} className="text-amber-400" /> Consistency
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="font-display text-xl font-semibold text-white tabular-nums">
                  <AnimatedNumber value={stats?.activeDays30 ?? 0} />
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">Active days (30d)</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <p className="font-display text-xl font-semibold text-white tabular-nums">
                  <AnimatedNumber value={stats?.quizzes.passed ?? 0} />
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">Quizzes passed</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Small sessions beat cramming. A lab step or a lesson a day keeps your progress moving.
            </p>
          </Card>

          {completed.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Completed</h2>
                <IconAward size={17} className="text-emerald-400" />
              </div>
              <ul className="mt-3 space-y-2.5">
                {completed.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-300">{item.title}</span>
                    <span className="shrink-0 text-slate-600">{formatDate(item.completed_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function IconSparkles() {
  return <IconZap size={13} />;
}
