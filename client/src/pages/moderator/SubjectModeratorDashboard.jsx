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
  IconBookOpen,
  IconCheckCircle,
  IconFlag,
  IconRefresh,
  IconShield,
  IconTerminal,
  IconUsers,
} from '../../components/icons';
import {
  MODERATOR_STATUS,
  reportKindMeta,
  reportStatusMeta,
  severityMeta,
  tierMeta,
} from '../../lib/moderation';
import { formatDate, formatDateTime } from '../../lib/format';

export default function SubjectModeratorDashboard() {
  const toast = useToast();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  const [courseDetail, setCourseDetail] = useState(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [instructorDetail, setInstructorDetail] = useState(null);
  const [instructorLoading, setInstructorLoading] = useState(false);

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

  const openCourse = async (id) => {
    setCourseDetail({ id });
    setCourseLoading(true);
    try {
      const { data } = await api.get(`/moderation/courses/${id}`);
      setCourseDetail(data);
    } catch (err) {
      setCourseDetail(null);
      toast.error(getErrorMessage(err, 'Could not load this course.'));
    } finally {
      setCourseLoading(false);
    }
  };

  const openInstructor = async (id) => {
    setInstructorDetail({ id });
    setInstructorLoading(true);
    try {
      const { data } = await api.get(`/moderation/instructors/${id}`);
      setInstructorDetail(data);
    } catch (err) {
      setInstructorDetail(null);
      toast.error(getErrorMessage(err, 'Could not load this instructor.'));
    } finally {
      setInstructorLoading(false);
    }
  };

  const stats = workspace?.stats || {};
  const courses = workspace?.courses || [];
  const instructors = workspace?.instructors || [];
  const subjects = workspace?.subjects || [];
  const recentReports = workspace?.recentReports || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300">
              <IconShield size={18} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold">Subject moderator workspace</h1>
              <p className="text-xs text-slate-400">
                Monitor assigned instructors, review course and lab quality, and handle student complaints.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to="/moderator/reports" size="sm" variant="secondary">
            <IconFlag size={14} /> Reports &amp; complaints
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
            {subjects.map((subject) => (
              <Badge key={subject} tone="slate">
                {subject}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IconBookOpen} label="Assigned courses" value={stats.courses ?? courses.length} hint="In your scope" />
        <StatCard
          icon={IconUsers}
          label="Assigned instructors"
          value={stats.instructors ?? instructors.length}
          hint="Whose work you review"
          tone="accent"
        />
        <StatCard
          icon={IconFlag}
          label="Open reports"
          value={stats.open_reports ?? 0}
          hint="Open or in review"
          tone="amber"
        />
        <StatCard
          icon={IconCheckCircle}
          label="Resolved"
          value={stats.resolved_reports ?? 0}
          hint="Closed complaints"
          tone="emerald"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Assigned courses</h2>
              <p className="text-[11px] text-slate-500">Inspect content quality, labs and pending submissions.</p>
            </div>
            <Badge tone="slate">{courses.length}</Badge>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : courses.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={IconBookOpen}
                title="No courses assigned"
                message="An administrator can assign courses or subjects to your moderation scope."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Course</th>
                    <th className="px-3 py-2.5 font-medium">Instructor</th>
                    <th className="px-3 py-2.5 font-medium">Learners</th>
                    <th className="px-3 py-2.5 font-medium">Labs</th>
                    <th className="px-5 py-2.5 text-right font-medium">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {courses.map((course) => (
                    <tr key={course.id} className="hover:bg-white/[0.02]">
                      <td className="max-w-[220px] px-5 py-3">
                        <p className="truncate text-sm font-medium text-slate-200" title={course.title}>
                          {course.title}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {course.category || 'Uncategorised'} · {course.status}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-400">{course.instructor_name || '—'}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-300">{course.learners}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge tone="slate">{course.labs}</Badge>
                          {Number(course.submissions_pending) > 0 && (
                            <Badge tone="amber">{course.submissions_pending} pending</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openCourse(course.id)}>
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
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Assigned instructors</h2>
              <p className="text-[11px] text-slate-500">Monitor their courses and content quality.</p>
            </div>
            <Badge tone="slate">{instructors.length}</Badge>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : instructors.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={IconUsers}
                title="No instructors assigned"
                message="Assign instructors or courses to this moderator from Moderator Management."
              />
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {instructors.map((instructor) => (
                <li key={instructor.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar src={instructor.avatar_url} name={instructor.full_name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{instructor.full_name}</p>
                      <p className="truncate text-[10px] text-slate-500">{instructor.email}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={instructor.is_active ? 'emerald' : 'rose'}>
                      {instructor.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                    <Badge tone="slate">{instructor.course_count} courses</Badge>
                    <Button size="sm" variant="ghost" onClick={() => openInstructor(instructor.id)}>
                      View
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent complaints &amp; reports</h2>
            <p className="text-[11px] text-slate-500">The latest issues routed to your desk.</p>
          </div>
          <Link to="/moderator/reports" className="text-[11px] text-brand-600 hover:text-brand-500 dark:text-brand-300">
            Open reports
          </Link>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : recentReports.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={IconFlag}
              title="No reports yet"
              message="Student complaints and content-quality flags routed to you will appear here."
            />
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {recentReports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{report.title}</p>
                  <p className="text-[10px] text-slate-500">
                    {report.course_title || 'General'} · {formatDateTime(report.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={reportKindMeta(report.kind).tone}>{reportKindMeta(report.kind).label}</Badge>
                  <Badge tone={severityMeta(report.severity).tone}>{severityMeta(report.severity).label}</Badge>
                  <Badge tone={reportStatusMeta(report.status).tone}>{reportStatusMeta(report.status).label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">Your moderation boundary</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            You only see the courses, instructors and reports assigned to you. Admin settings, lab servers,
            Docker containers, API keys and role management are not available to moderators.
          </p>
        </div>
        <Button as={Link} to="/moderator/reports" size="sm" variant="secondary">
          <IconFlag size={14} /> Handle complaints
        </Button>
      </Card>

      {/* ---------- course detail ---------- */}
      <Modal
        open={Boolean(courseDetail)}
        onClose={() => setCourseDetail(null)}
        title="Course quality review"
        description={courseDetail?.course?.title}
        size="lg"
      >
        {courseLoading || !courseDetail?.course ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Instructor', courseDetail.course.instructor_name],
                ['Category', courseDetail.course.category],
                ['Status', courseDetail.course.status],
                ['Learners', courseDetail.course.learners],
                ['Modules', courseDetail.course.module_count],
                ['Lessons', courseDetail.course.lesson_count],
                ['Labs', `${courseDetail.course.published_labs}/${courseDetail.course.lab_count} published`],
                ['Last updated', courseDetail.course.updated_at ? formatDate(courseDetail.course.updated_at) : null],
              ]
                .filter(([, value]) => value !== null && value !== undefined && value !== '')
                .map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="truncate text-xs text-slate-800 dark:text-slate-200">{value}</p>
                  </div>
                ))}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Labs</p>
              {courseDetail.labs?.length ? (
                <ul className="mt-1 divide-y divide-white/5">
                  {courseDetail.labs.map((lab) => (
                    <li key={lab.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-200">
                          <IconTerminal size={12} className="shrink-0 text-slate-500" /> {lab.title}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {lab.step_count} steps · {lab.submission_count} submissions
                        </p>
                      </div>
                      <Badge tone={lab.status === 'published' ? 'emerald' : 'slate'}>{lab.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">This course has no labs yet.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- instructor detail ---------- */}
      <Modal
        open={Boolean(instructorDetail)}
        onClose={() => setInstructorDetail(null)}
        title="Instructor overview"
        description={instructorDetail?.instructor?.full_name}
        size="lg"
      >
        {instructorLoading || !instructorDetail?.instructor ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={instructorDetail.instructor.is_active ? 'emerald' : 'rose'}>
                {instructorDetail.instructor.is_active ? 'Active' : 'Disabled'}
              </Badge>
              <span className="text-[11px] text-slate-500">{instructorDetail.instructor.email}</span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Courses</p>
              {instructorDetail.courses?.length ? (
                <ul className="mt-1 divide-y divide-white/5">
                  {instructorDetail.courses.map((course) => (
                    <li key={course.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-200">{course.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {course.learners} learners · {course.labs} labs
                        </p>
                      </div>
                      <Badge tone={course.status === 'published' ? 'emerald' : 'slate'}>{course.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-500">This instructor has no courses yet.</p>
              )}
            </div>
            {instructorDetail.scopeSubjects?.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Subject scope: {instructorDetail.scopeSubjects.join(', ')}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
