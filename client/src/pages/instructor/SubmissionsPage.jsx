import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import { IconClipboard, IconFileText, IconUser } from '../../components/icons';
import { SUBMISSION_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

export default function SubmissionsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [error, setError] = useState('');
  const [grading, setGrading] = useState(null);
  const [gradeForm, setGradeForm] = useState({ grade: 0, feedback: '', status: 'graded' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/courses', { params: { all: true, limit: 60 } })
      .then((res) => {
        if (cancelled) return;
        const list = (res.data.courses || []).filter((course) => user?.role === 'admin' || course.instructor_id === user?.id);
        setCourses(list);
        if (list[0]) setCourseId(String(list[0].id));
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your courses.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingCourses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!courseId) {
      setAssignments([]);
      setAssignmentId('');
      return;
    }
    let cancelled = false;
    setLoadingAssignments(true);
    api
      .get(`/assignments/courses/${courseId}`)
      .then((res) => {
        if (cancelled) return;
        const list = res.data.assignments || [];
        setAssignments(list);
        setAssignmentId(list[0] ? String(list[0].id) : '');
        if (!list[0]) {
          setSubmissions([]);
          setAssignment(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load assignments.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const loadSubmissions = async (id) => {
    if (!id) return;
    setLoadingSubmissions(true);
    try {
      const { data } = await api.get(`/assignments/${id}/submissions`);
      setAssignment(data.assignment);
      setSubmissions(data.submissions || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load submissions.'));
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    loadSubmissions(assignmentId);
  }, [assignmentId]);

  const openGrade = (submission) => {
    setGrading(submission);
    setGradeForm({
      grade: submission.grade ?? 0,
      feedback: submission.feedback || '',
      status: 'graded',
    });
  };

  const saveGrade = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post(`/assignments/submissions/${grading.id}/grade`, {
        grade: Number(gradeForm.grade) || 0,
        feedback: gradeForm.feedback,
        status: gradeForm.status,
      });
      toast.success(gradeForm.status === 'graded' ? 'Submission graded.' : 'Submission returned to the learner.');
      setGrading(null);
      await loadSubmissions(assignmentId);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the grade.'));
    } finally {
      setSaving(false);
    }
  };

  const pending = useMemo(() => submissions.filter((submission) => submission.status === 'submitted').length, [submissions]);
  const selectedCourse = courses.find((course) => String(course.id) === courseId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Assignment submissions</h1>
          <p className="mt-1 text-sm text-slate-400">Review written work, assign points and send feedback.</p>
        </div>
        {!loadingSubmissions && assignmentId && (
          <Badge tone={pending ? 'amber' : 'emerald'}>
            <IconClipboard size={12} /> {pending} awaiting grade
          </Badge>
        )}
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="course-select" className="label">Course</label>
          <Select id="course-select" value={courseId} onChange={(event) => setCourseId(event.target.value)} disabled={loadingCourses}>
            {courses.length === 0 && <option value="">No courses</option>}
            {courses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="assignment-select" className="label">Assignment</label>
          <Select id="assignment-select" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} disabled={!assignments.length || loadingAssignments}>
            {assignments.length === 0 && <option value="">No assignments</option>}
            {assignments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.submission_count} submission{item.submission_count === 1 ? '' : 's'})
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {assignment && (
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <IconFileText size={15} className="text-amber-300" /> {assignment.title}
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                {assignment.points} points
                {assignment.due_at ? ` · due ${formatDateTime(assignment.due_at)}` : ' · no due date'}
                {assignment.lesson_id ? ` · lesson #${assignment.lesson_id}` : ' · course-wide'}
              </p>
            </div>
            <Button as={Link} to={`/instructor/courses/${selectedCourse?.id}`} size="sm" variant="ghost">
              Open course editor
            </Button>
          </div>
        </Card>
      )}

      {loadingSubmissions ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : !assignmentId ? (
        <EmptyState
          icon={IconClipboard}
          title="Nothing to grade here"
          message={selectedCourse ? 'This course has no assignments yet. Add one from the course editor.' : 'Create a course first.'}
        />
      ) : submissions.length === 0 ? (
        <EmptyState icon={IconUser} title="No submissions yet" message="Learners haven't submitted this assignment." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Learner</th>
                  <th className="px-3 py-2.5 font-medium">Submitted</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Grade</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {submissions.map((submission) => {
                  const status = SUBMISSION_STATUS[submission.status] || SUBMISSION_STATUS.submitted;
                  return (
                    <tr key={submission.id}>
                      <td className="px-5 py-3">
                        <p className="text-sm text-slate-200">{submission.full_name}</p>
                        <p className="text-[10px] text-slate-500">{submission.email}</p>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-400">{formatDateTime(submission.submitted_at)}</td>
                      <td className="px-3 py-3"><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td className="px-3 py-3 text-[11px] text-slate-300">
                        {submission.grade != null ? `${submission.grade}/${assignment?.points ?? '—'}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant={submission.status === 'submitted' ? 'primary' : 'secondary'} onClick={() => openGrade(submission)}>
                          {submission.status === 'submitted' ? 'Grade' : 'Review'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(grading)}
        onClose={() => setGrading(null)}
        title="Grade submission"
        description={grading ? `${grading.full_name} · ${assignment?.title}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGrading(null)}>Cancel</Button>
            <Button onClick={saveGrade} loading={saving}>Save grade</Button>
          </>
        }
      >
        {grading && (
          <form onSubmit={saveGrade} className="space-y-4">
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-night-950/60 p-3 font-mono text-[12px] leading-6 text-slate-300">
              {grading.content || '(No written content)'}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={`Grade (out of ${assignment?.points ?? 100})`}
                type="number"
                min="0"
                max={assignment?.points ?? 100}
                value={gradeForm.grade}
                onChange={(event) => setGradeForm((current) => ({ ...current, grade: event.target.value }))}
                required
              />
              <Select label="Outcome" value={gradeForm.status} onChange={(event) => setGradeForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="graded">Accept & grade</option>
                <option value="returned">Return for changes</option>
              </Select>
            </div>
            <Textarea
              label="Feedback"
              rows={4}
              value={gradeForm.feedback}
              onChange={(event) => setGradeForm((current) => ({ ...current, feedback: event.target.value }))}
              placeholder="Explain the grade and what to improve."
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
