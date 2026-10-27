import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Pagination,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  cx,
} from '../../components/ui';
import {
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconFileText,
  IconGraduationCap,
  IconSearch,
  IconTarget,
  IconUser,
  IconUsers,
  IconZap,
} from '../../components/icons';
import { activityToneClasses, describeActivity } from '../../lib/activity';
import { formatDateTime, timeAgo } from '../../lib/format';

const REPORT_TONE = { draft: 'slate', submitted: 'amber', approved: 'emerald', rejected: 'rose', published: 'brand' };
const SUBMISSION_TONE = { submitted: 'amber', graded: 'emerald', returned: 'rose', draft: 'slate' };

const pct = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : 0;
};

const initialsOrName = (student) => student?.full_name || student?.email || 'Learner';

function SummaryTile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold text-white">{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, courseId]);

  useEffect(() => {
    api
      .get('/courses', { params: { all: true, limit: 60 } })
      .then((res) => setCourses(res.data.courses || []))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/instructor/students', {
        params: {
          search: debounced || undefined,
          courseId: courseId || undefined,
          page,
          limit: 20,
        },
      })
      .then((res) => {
        if (cancelled) return;
        setStudents(res.data.students || []);
        setTotal(res.data.total || 0);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your learners.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, courseId, page]);

  const totals = useMemo(() => {
    const pending = students.reduce(
      (sum, student) => sum + Number(student.reports_pending || 0) + Number(student.submissions_pending || 0),
      0
    );
    const progressValues = students
      .map((student) => Number(student.avg_progress))
      .filter((value) => Number.isFinite(value));
    const avgProgress = progressValues.length
      ? Math.round((progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) * 10) / 10
      : 0;
    return { pending, avgProgress };
  }, [students]);

  const openStudent = async (student) => {
    setSelected(student);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/instructor/students/${student.id}`);
      setDetail(data);
    } catch (err) {
      setDetailError(getErrorMessage(err, 'Could not load this learner.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const courseLabel = useMemo(
    () => (courses.length === 1 ? '1 assigned course' : `${courses.length} assigned courses`),
    [courses.length]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">My students</h1>
          <p className="mt-1 text-sm text-slate-400">
            Progress, quiz scores and practical work for learners enrolled in your courses.
          </p>
        </div>
        <Badge tone="brand">
          <IconUsers size={12} /> {total} {total === 1 ? 'learner' : 'learners'}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={IconGraduationCap} label="Learners shown" value={total} hint={courseLabel} tone="brand" />
        <StatCard
          icon={IconTarget}
          label="Average progress"
          value={`${totals.avgProgress}%`}
          hint="Across the courses in view"
          tone="emerald"
        />
        <StatCard
          icon={IconFileText}
          label="Reviews waiting"
          value={totals.pending}
          hint="Reports and assignments on this page"
          tone="amber"
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
          <div className="relative">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email…"
              className="input pl-9"
              aria-label="Search learners"
            />
          </div>
          <Select
            aria-label="Filter by course"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            <option value="">All my courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={IconUser}
          title="No learners found"
          message={
            debounced || courseId
              ? 'Try a different search term or course filter.'
              : 'Learners appear here once they enrol in one of your courses.'
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Learner</th>
                    <th className="px-3 py-2.5 font-medium">Courses</th>
                    <th className="px-3 py-2.5 font-medium">Progress</th>
                    <th className="px-3 py-2.5 font-medium">Quiz average</th>
                    <th className="px-3 py-2.5 font-medium">Pending review</th>
                    <th className="px-3 py-2.5 font-medium">Last activity</th>
                    <th className="px-5 py-2.5 text-right font-medium">Analytics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {students.map((student) => {
                    const pending =
                      Number(student.reports_pending || 0) + Number(student.submissions_pending || 0);
                    return (
                      <tr key={student.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar src={student.avatar_url} name={initialsOrName(student)} size="sm" />
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-sm text-slate-200">
                                {student.full_name}
                                {!student.is_active && <Badge tone="rose">disabled</Badge>}
                              </p>
                              <p className="truncate text-[10px] text-slate-500">{student.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-slate-300">
                          {Number(student.course_count || 0)}
                          {Number(student.completed_courses || 0) > 0 && (
                            <span className="ml-1 text-[10px] text-emerald-300">
                              ({Number(student.completed_courses)} done)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="w-28">
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span>{pct(student.avg_progress)}%</span>
                            </div>
                            <ProgressBar value={pct(student.avg_progress)} size="sm" className="mt-1" />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-slate-300">
                          {Number(student.quiz_attempts || 0) === 0 ? (
                            <span className="text-slate-600">No attempts</span>
                          ) : (
                            <span className="font-mono text-emerald-300">{pct(student.avg_quiz_percent)}%</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {pending > 0 ? (
                            <Badge tone="amber">{pending} to review</Badge>
                          ) : (
                            <span className="text-[11px] text-slate-600">Clear</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[11px] text-slate-500">
                          {student.last_activity_at ? (
                            <span title={formatDateTime(student.last_activity_at)}>
                              {timeAgo(student.last_activity_at)}
                            </span>
                          ) : (
                            'No activity'
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button size="sm" variant="secondary" onClick={() => openStudent(student)}>
                            View <IconArrowRight size={12} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination page={page} limit={20} total={total} onPageChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setDetail(null);
          setDetailError('');
        }}
        title={selected ? initialsOrName(selected) : 'Learner analytics'}
        description={selected?.email}
        size="xl"
      >
        {detailLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detailError ? (
          <p className="text-sm text-rose-300">{detailError}</p>
        ) : detail ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar src={detail.student.avatar_url} name={initialsOrName(detail.student)} size="lg" />
              <div className="min-w-0">
                <p className="text-sm text-slate-200">{detail.student.headline || 'Learner'}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Joined {formatDateTime(detail.student.created_at)}
                  {detail.summary.lastActivityAt ? ` · last active ${timeAgo(detail.summary.lastActivityAt)}` : ''}
                </p>
                {detail.student.bio && (
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{detail.student.bio}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryTile
                label="Courses"
                value={detail.summary.courseCount}
                hint={`${detail.summary.completedCourses} completed`}
              />
              <SummaryTile
                label="Completion rate"
                value={`${pct(detail.summary.completionRate)}%`}
                hint={`Avg progress ${pct(detail.summary.avgProgress)}%`}
              />
              <SummaryTile
                label="Quiz average"
                value={`${pct(detail.summary.avgQuizPercent)}%`}
                hint={`${detail.quizzes.length} quizzes`}
              />
              <SummaryTile
                label="Assignment average"
                value={detail.summary.gradedSubmissions ? pct(detail.summary.avgGrade) : 'N/A'}
                hint={`${detail.summary.gradedSubmissions} graded`}
              />
              <SummaryTile
                label="Practical reports"
                value={detail.summary.reportsTotal}
                hint={`${detail.summary.reportsPending} awaiting review`}
              />
              <SummaryTile
                label="Pending submissions"
                value={detail.summary.pendingSubmissions}
                hint="Assignments to grade"
              />
              <SummaryTile
                label="Lab sessions"
                value={detail.summary.labSessions}
                hint="In your courses"
              />
              <SummaryTile label="Active days" value={detail.summary.activeDays30} hint="Last 30 days" />
            </div>

            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <IconGraduationCap size={13} /> Course progress
              </h3>
              {detail.enrollments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No enrollments in your courses.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.enrollments.map((enrollment) => (
                    <li key={enrollment.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          to={`/instructor/courses/${enrollment.course_id}`}
                          className="truncate text-xs text-slate-200 hover:text-brand-300"
                        >
                          {enrollment.title}
                        </Link>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>
                            {enrollment.lessons_completed}/{enrollment.lesson_count} lessons
                          </span>
                          <Badge tone={enrollment.status === 'completed' ? 'emerald' : 'slate'}>
                            {enrollment.status}
                          </Badge>
                          <span className="font-mono text-slate-400">{pct(enrollment.progress_percent)}%</span>
                        </div>
                      </div>
                      <ProgressBar
                        value={pct(enrollment.progress_percent)}
                        size="sm"
                        className="mt-1.5"
                        tone={enrollment.status === 'completed' ? 'emerald' : 'brand'}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <IconZap size={13} /> Quiz performance
              </h3>
              {detail.quizzes.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No quizzes in your courses yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10">
                  {detail.quizzes.map((quiz) => (
                    <li key={quiz.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-200">{quiz.title}</p>
                        <p className="text-[10px] text-slate-500">{quiz.course_title}</p>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-slate-500">
                          {quiz.attempt_count} {Number(quiz.attempt_count) === 1 ? 'attempt' : 'attempts'}
                        </span>
                        {quiz.best_percent != null ? (
                          <Badge tone={quiz.has_passed ? 'emerald' : 'amber'}>
                            best {pct(quiz.best_percent)}%
                          </Badge>
                        ) : (
                          <Badge tone="slate">not attempted</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <IconCheckCircle size={13} /> Assignments
              </h3>
              {detail.assignments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No assignments in your courses yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10">
                  {detail.assignments.map((assignment) => (
                    <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-200">{assignment.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {assignment.course_title}
                          {assignment.due_at ? ` · due ${formatDateTime(assignment.due_at)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        {assignment.grade != null ? (
                          <span className="font-mono text-emerald-300">
                            {pct(assignment.grade)}
                            {assignment.points ? ` / ${pct(assignment.points)}` : ''}
                          </span>
                        ) : (
                          <Badge tone={SUBMISSION_TONE[assignment.submission_status] || 'slate'}>
                            {assignment.submission_status || 'not submitted'}
                          </Badge>
                        )}
                        <Button
                          as={Link}
                          to={`/instructor/submissions?assignment=${assignment.id}`}
                          size="sm"
                          variant="ghost"
                        >
                          Open
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <IconFileText size={13} /> Practical reports
              </h3>
              {detail.reports.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No practical reports submitted yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10">
                  {detail.reports.map((report) => (
                    <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-200">{report.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {report.lab_title}
                          {report.course_title ? ` · ${report.course_title}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        {report.score != null && (
                          <span className="font-mono text-emerald-300">
                            {pct(report.score)}
                            {report.max_score != null ? ` / ${pct(report.max_score)}` : ''}
                          </span>
                        )}
                        <Badge tone={REPORT_TONE[report.status] || 'slate'}>{report.status}</Badge>
                        <Button as={Link} to={`/instructor/reports/${report.id}`} size="sm" variant="ghost">
                          Review
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <IconClock size={13} /> Recent activity
              </h3>
              {detail.history.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No activity recorded in your courses.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5">
                  {detail.history.slice(0, 12).map((event) => {
                    const { title, tone } = describeActivity(event);
                    return (
                      <li key={event.id} className="flex items-center gap-2 py-1.5 text-[11px]">
                        <span
                          className={cx('h-1.5 w-1.5 rounded-full', activityToneClasses(tone).split(' ')[0])}
                        />
                        <span className="flex-1 text-slate-300">{title}</span>
                        <span className="text-[10px] text-slate-600">{formatDateTime(event.created_at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
