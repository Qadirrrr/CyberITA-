import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconCheckCircle,
  IconClipboard,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyAssignment(courseId = '') {
  return {
    title: '',
    description: '',
    courseId,
    lessonId: '',
    dueAt: '',
    points: 100,
    isPublished: true,
  };
}

function lessonLabel(lesson) {
  return lesson.moduleTitle ? `${lesson.moduleTitle} · ${lesson.title}` : lesson.title;
}

export default function InstructorAssignmentsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lessonMap, setLessonMap] = useState({});

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [assignmentsResponse, coursesResponse] = await Promise.all([
        api.get('/instructor/assignments'),
        api.get('/courses', { params: { all: true, limit: 60 } }),
      ]);
      setAssignments(assignmentsResponse.data.assignments || []);
      const list = coursesResponse.data.courses || [];
      setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load assignments.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const ensureLessons = async (courseId) => {
    if (!courseId || lessonMap[courseId]) return;
    const course = courses.find((item) => String(item.id) === String(courseId));
    if (!course?.slug) return;
    try {
      const { data } = await api.get(`/courses/${course.slug}`);
      const lessons = (data.modules || []).flatMap((module) =>
        (module.lessons || []).map((lesson) => ({ ...lesson, moduleTitle: module.title }))
      );
      setLessonMap((current) => ({ ...current, [courseId]: lessons }));
    } catch {
      /* optional lesson attachment */
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();
    return assignments.filter((assignment) => {
      if (courseFilter !== 'all' && String(assignment.course_id) !== String(courseFilter)) return false;
      if (statusFilter === 'draft' && assignment.is_published) return false;
      if (statusFilter === 'published' && !assignment.is_published) return false;
      if (statusFilter === 'grading' && Number(assignment.pending_count) === 0) return false;
      if (statusFilter === 'overdue' && (!assignment.due_at || new Date(assignment.due_at).getTime() >= now)) return false;
      if (!term) return true;
      return `${assignment.title} ${assignment.description || ''} ${assignment.course_title || ''}`
        .toLowerCase()
        .includes(term);
    });
  }, [assignments, search, courseFilter, statusFilter]);

  const totals = useMemo(
    () => ({
      total: assignments.length,
      pending: assignments.reduce((sum, item) => sum + Number(item.pending_count || 0), 0),
      submissions: assignments.reduce((sum, item) => sum + Number(item.submission_count || 0), 0),
      graded: assignments.reduce((sum, item) => sum + Number(item.graded_count || 0), 0),
    }),
    [assignments]
  );

  const openCreate = () => {
    const courseId = courseFilter !== 'all' ? courseFilter : courses[0]?.id || '';
    setModal(emptyAssignment(courseId));
    ensureLessons(courseId);
  };

  const openEdit = (assignment) => {
    setModal({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description || '',
      courseId: assignment.course_id,
      lessonId: assignment.lesson_id || '',
      dueAt: toLocalInput(assignment.due_at),
      points: assignment.points,
      isPublished: Boolean(assignment.is_published),
    });
    ensureLessons(assignment.course_id);
  };

  const saveAssignment = async (event) => {
    event.preventDefault();
    if (!modal.courseId) {
      toast.error('Choose the course this assignment belongs to.');
      return;
    }
    setSaving(true);
    const payload = {
      title: modal.title,
      description: modal.description,
      lessonId: modal.lessonId ? Number(modal.lessonId) : null,
      dueAt: modal.dueAt ? new Date(modal.dueAt).toISOString() : null,
      points: Number(modal.points) || 100,
      isPublished: modal.isPublished,
    };
    try {
      if (modal.id) await api.put(`/assignments/${modal.id}`, payload);
      else await api.post(`/assignments/courses/${modal.courseId}`, payload);
      toast.success(modal.id ? 'Assignment updated.' : 'Assignment created and shared with learners.');
      setModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the assignment.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async (assignment) => {
    if (!window.confirm(`Delete assignment "${assignment.title}" and all submissions?`)) return;
    try {
      await api.delete(`/assignments/${assignment.id}`);
      toast.success('Assignment deleted.');
      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the assignment.'));
    }
  };

  const lessons = modal?.courseId ? lessonMap[modal.courseId] || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Assignments</h1>
          <p className="mt-1 text-sm text-slate-400">
            Create briefs, set due dates, and jump straight into submission review.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} disabled={courses.length === 0}>
          <IconPlus size={14} /> New assignment
        </Button>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Assignments</p>
          <p className="mt-1 font-display text-2xl font-semibold">{totals.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Awaiting grading</p>
          <p className="mt-1 font-display text-2xl font-semibold text-amber-300">{totals.pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Submissions</p>
          <p className="mt-1 font-display text-2xl font-semibold">{totals.submissions}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Graded</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-300">{totals.graded}</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assignments…"
            className="input pl-9"
            aria-label="Search assignments"
          />
        </div>
        <Select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} aria-label="Filter by course">
          <option value="all">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </Select>
        <div className="flex gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'grading', label: 'To grade' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'draft', label: 'Drafts' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`chip ${statusFilter === item.id ? 'chip-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={IconClipboard}
          title="Create a course first"
          message="Assignments live inside a course. Create a course, then add your first brief."
          action={
            <Button as={Link} to="/instructor/courses/new" size="sm">
              <IconPlus size={13} /> New course
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={IconClipboard}
          title={assignments.length === 0 ? 'No assignments yet' : 'No assignments match your filters'}
          message="Publish a brief with a due date and points, then grade learner submissions from one queue."
          action={
            <Button size="sm" onClick={openCreate}>
              <IconPlus size={13} /> New assignment
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((assignment) => {
            const overdue =
              assignment.due_at && new Date(assignment.due_at).getTime() < Date.now() && Number(assignment.pending_count) > 0;
            return (
              <Card key={assignment.id} className="p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                    <IconClipboard size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-white">{assignment.title}</h2>
                      <Badge tone={assignment.is_published ? 'emerald' : 'amber'}>
                        {assignment.is_published ? 'published' : 'draft'}
                      </Badge>
                      {Number(assignment.pending_count) > 0 && (
                        <Badge tone={overdue ? 'rose' : 'brand'}>{assignment.pending_count} to grade</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {assignment.course_title}
                      {assignment.lesson_title ? ` · ${assignment.lesson_title}` : ' · Course-wide'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {assignment.points} points · {assignment.submission_count} of {assignment.learner_count} learners submitted ·{' '}
                      {assignment.graded_count} graded
                      {assignment.due_at ? ` · due ${formatDateTime(assignment.due_at)}` : ' · no due date'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button as={Link} to={`/instructor/submissions?assignment=${assignment.id}`} size="sm" variant="ghost">
                      <IconCheckCircle size={13} /> Grade
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(assignment)}>
                      <IconEdit size={13} /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteAssignment(assignment)}>
                      <IconTrash size={13} className="text-rose-300" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit assignment' : 'New assignment'}
        description="Learners see published assignments on their dashboard and course page."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button onClick={saveAssignment} loading={saving}>
              {modal?.id ? 'Save assignment' : 'Create assignment'}
            </Button>
          </>
        }
      >
        {modal && (
          <form onSubmit={saveAssignment} className="space-y-4">
            <Input
              label="Title"
              value={modal.title}
              onChange={(event) => setModal((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. Audit a Linux host with auditd"
              required
            />
            <Textarea
              label="Brief (markdown supported)"
              rows={6}
              value={modal.description}
              onChange={(event) => setModal((current) => ({ ...current, description: event.target.value }))}
              placeholder="Explain the task, deliverables and marking criteria…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Course"
                value={modal.courseId}
                disabled={Boolean(modal.id)}
                onChange={(event) => {
                  const courseId = event.target.value;
                  setModal((current) => ({ ...current, courseId, lessonId: '' }));
                  ensureLessons(courseId);
                }}
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
              <Select
                label="Attach to lesson"
                value={modal.lessonId}
                onChange={(event) => setModal((current) => ({ ...current, lessonId: event.target.value }))}
              >
                <option value="">Course-wide</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lessonLabel(lesson)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Due date"
                type="datetime-local"
                value={modal.dueAt}
                onChange={(event) => setModal((current) => ({ ...current, dueAt: event.target.value }))}
              />
              <Input
                label="Points"
                type="number"
                min="1"
                value={modal.points}
                onChange={(event) => setModal((current) => ({ ...current, points: event.target.value }))}
              />
              <div className="flex items-end pb-2">
                <Checkbox
                  label="Visible to learners"
                  checked={modal.isPublished}
                  onChange={(event) => setModal((current) => ({ ...current, isPublished: event.target.checked }))}
                />
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
