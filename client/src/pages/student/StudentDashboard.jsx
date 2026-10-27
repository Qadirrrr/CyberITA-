import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, AnimatedNumber, Badge, Button, Card, EmptyState, ProgressBar, Skeleton, StatCard } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconBookOpen,
  IconChatBubble,
  IconClipboard,
  IconClock,
  IconFileText,
  IconFlame,
  IconPlay,
  IconTarget,
  IconTerminal,
  IconZap,
} from '../../components/icons';
import { describeActivity, activityToneClasses } from '../../lib/activity';
import { formatDate, formatDateTime, timeAgo } from '../../lib/format';

const quickLinks = [
  { to: '/student/courses', label: 'My courses', icon: IconBookOpen, hint: 'Continue where you left off' },
  { to: '/student/lessons', label: 'My lessons', icon: IconPlay, hint: 'Every lesson in one place' },
  { to: '/student/quizzes', label: 'Quizzes', icon: IconZap, hint: 'Check your understanding' },
  { to: '/student/assignments', label: 'Assignments', icon: IconClipboard, hint: 'Submit work and track grades' },
  { to: '/student/labs', label: 'Open a lab', icon: IconTerminal, hint: 'Practice in the terminal' },
  { to: '/student/chat', label: 'Chat', icon: IconChatBubble, hint: 'Ask your instructor a question' },
];

function assignmentState(assignment) {
  if (!assignment.submission_id) return 'pending';
  if (assignment.submission_status === 'returned') return 'pending';
  if (assignment.submission_status === 'graded') return 'graded';
  return 'submitted';
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [events, setEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/me/stats'),
      api.get('/my-courses'),
      api.get('/me/history', { params: { limit: 8 } }),
      api.get('/reports/mine'),
      api.get('/me/quizzes'),
      api.get('/me/assignments'),
      api.get('/messages/unread-count'),
    ])
      .then(([statsRes, coursesRes, historyRes, reportsRes, quizzesRes, assignmentsRes, unreadRes]) => {
        if (!active) return;
        setStats(statsRes.data);
        setEnrollments(coursesRes.data.enrollments || []);
        setEvents(historyRes.data.events || []);
        setReports(reportsRes.data.reports || []);
        setQuizzes(quizzesRes.data.quizzes || []);
        setAssignments(assignmentsRes.data.assignments || []);
        setUnreadMessages(Number(unreadRes.data.unread) || 0);
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

  const pendingAssignments = assignments.filter((assignment) => assignmentState(assignment) === 'pending');
  const overdueAssignments = pendingAssignments.filter((assignment) => assignment.is_overdue);
  const returnedAssignments = pendingAssignments.filter((assignment) => assignment.submission_status === 'returned');
  const upcomingAssignments = pendingAssignments
    .filter((assignment) => assignment.due_at)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 4);
  const unpassedQuizCount = quizzes.filter((quiz) => !quiz.has_passed).length;
  const quizzesToTake = quizzes.filter((quiz) => !quiz.has_passed).slice(0, 3);

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
  const attentionCount = returnedAssignments.length + overdueAssignments.length;

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
          <div className="flex flex-wrap gap-2">
            {unreadMessages > 0 && (
              <Button as={Link} to="/student/chat" variant="secondary" size="sm">
                <IconChatBubble size={15} /> {unreadMessages} unread {unreadMessages === 1 ? 'reply' : 'replies'}
              </Button>
            )}
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
          value={stats?.enrollments.active ?? active.length}
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
          icon={IconZap}
          label="Quizzes passed"
          value={quizzes.filter((quiz) => quiz.has_passed).length}
          hint={`${quizzes.length} available · ${unpassedQuizCount} to try`}
          tone="emerald"
        />
        <StatCard
          icon={IconClipboard}
          label="Assignments to do"
          value={pendingAssignments.length}
          hint={
            overdueAssignments.length > 0
              ? `${overdueAssignments.length} overdue`
              : `${assignments.length} assigned in total`
          }
          tone="amber"
        />
      </div>

      {attentionCount > 0 && (
        <Card className="border-amber-400/25 bg-amber-400/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
                <IconClipboard size={19} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">
                  {returnedAssignments.length > 0
                    ? `${returnedAssignments.length} assignment${returnedAssignments.length === 1 ? '' : 's'} need${returnedAssignments.length === 1 ? 's' : ''} attention`
                    : `${overdueAssignments.length} overdue assignment${overdueAssignments.length === 1 ? '' : 's'}`}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {returnedAssignments.length > 0
                    ? 'Your instructor returned work with feedback. Revise it and resubmit.'
                    : 'These deadlines have passed. Submit as soon as you can so your instructor can grade your work.'}
                </p>
              </div>
            </div>
            <Button as={Link} to="/student/assignments" variant="secondary" size="sm">
              Open assignments <IconArrowRight size={14} />
            </Button>
          </div>
        </Card>
      )}

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
              message="Enroll in a course to unlock lessons, labs, quizzes and instructor-reviewed reports."
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

          {(pendingAssignments.length > 0 || quizzesToTake.length > 0) && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold">Coming up next</h2>
                <div className="flex items-center gap-2">
                  {pendingAssignments.length > 0 && (
                    <Link to="/student/assignments" className="text-[11px] text-slate-400 hover:text-brand-300">
                      {pendingAssignments.length} assignment{pendingAssignments.length === 1 ? '' : 's'}
                    </Link>
                  )}
                  {quizzesToTake.length > 0 && (
                    <Link to="/student/quizzes" className="text-[11px] text-slate-400 hover:text-brand-300">
                      {quizzesToTake.length} quiz{quizzesToTake.length === 1 ? '' : 'zes'}
                    </Link>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {pendingAssignments.slice(0, 2).map((assignment) => (
                  <Link
                    key={assignment.id}
                    to={`/learn/assignments/${assignment.id}`}
                    className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-amber-400/30 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                        <IconClipboard size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-100 group-hover:text-white">{assignment.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">{assignment.course_title}</p>
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                          <IconClock size={10} />
                          {assignment.due_at ? formatDateTime(assignment.due_at) : 'No deadline'}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
                {quizzesToTake.slice(0, 2).map((quiz) => (
                  <Link
                    key={quiz.id}
                    to={`/learn/quizzes/${quiz.id}`}
                    className="group rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-brand-400/30 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                        <IconZap size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-100 group-hover:text-white">{quiz.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">{quiz.course_title}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {quiz.question_count} questions · pass at {Math.round(Number(quiz.pass_score))}%
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
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
              <h2 className="font-display text-base font-semibold">Upcoming deadlines</h2>
              <Link to="/student/calendar" className="text-[11px] text-slate-500 hover:text-brand-300">
                Calendar
              </Link>
            </div>
            {upcomingAssignments.length === 0 ? (
              <p className="mt-6 text-center text-xs leading-5 text-slate-500">
                No pending assignment deadlines. You are all caught up.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {upcomingAssignments.map((assignment) => {
                  const due = new Date(assignment.due_at);
                  const overdue = due.getTime() < Date.now();
                  return (
                    <li key={assignment.id}>
                      <Link
                        to={`/learn/assignments/${assignment.id}`}
                        className="group flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-brand-400/25 hover:bg-white/[0.04]"
                      >
                        <span
                          className={`mt-0.5 flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-[9px] font-semibold uppercase leading-none ${
                            overdue ? 'bg-rose-400/10 text-rose-300' : 'bg-white/5 text-slate-400'
                          }`}
                        >
                          <span>{due.toLocaleDateString('en-US', { month: 'short' })}</span>
                          <span className="text-[11px] text-slate-200">{due.getDate()}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-slate-200 transition group-hover:text-white">
                            {assignment.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500">{assignment.course_title}</span>
                          <span className={`mt-1 flex items-center gap-1 text-[10px] ${overdue ? 'text-rose-300' : 'text-slate-500'}`}>
                            <IconClock size={10} /> {overdue ? 'Overdue' : 'Due'} {formatDateTime(assignment.due_at)}
                          </span>
                        </span>
                        <IconArrowRight size={13} className="mt-1 shrink-0 text-slate-600 group-hover:text-brand-300" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className={`p-5 ${unreadMessages > 0 ? 'border-brand-400/25 bg-brand-400/[0.035]' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
                  <IconChatBubble size={19} />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold">Instructor chat</h2>
                  <p className="mt-0.5 text-xs leading-5 text-slate-400">
                    {unreadMessages > 0
                      ? `You have ${unreadMessages} unread ${unreadMessages === 1 ? 'reply' : 'replies'}.`
                      : 'Ask a question or share a document with your instructor.'}
                  </p>
                </div>
              </div>
              {unreadMessages > 0 && <Badge tone="brand">{unreadMessages}</Badge>}
            </div>
            <Button as={Link} to="/student/chat" size="sm" variant={unreadMessages > 0 ? 'primary' : 'secondary'} className="mt-4 w-full">
              Open chat <IconArrowRight size={14} />
            </Button>
          </Card>

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
                  <AnimatedNumber value={stats?.quizzes?.passed ?? 0} />
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
