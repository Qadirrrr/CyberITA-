import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconArrowRight,
  IconBookOpen,
  IconCheckCircle,
  IconClipboard,
  IconEye,
  IconPlus,
  IconTerminal,
  IconZap,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';

const initialForm = {
  title: '',
  details: '',
  courseId: '',
  lessonId: '',
  difficulty: 'intermediate',
  publish: true,
  includeLab: true,
  labStepCount: 8,
  labPractice: false,
  includeQuiz: true,
  quizMcqCount: 5,
  quizSubjectiveCount: 2,
  includeAssignment: true,
  assignmentPoints: 100,
  dueInDays: 7,
};

function lessonLabel(lesson) {
  return lesson.moduleTitle ? `${lesson.moduleTitle} · ${lesson.title}` : lesson.title;
}

export default function ContentStudioPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [lessonMap, setLessonMap] = useState({});
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/courses', { params: { all: true, limit: 60 } })
      .then(({ data }) => {
        if (cancelled) return;
        const list = data.courses || [];
        setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Could not load your courses.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingCourses(false);
      });
    return () => {
      cancelled = true;
    };
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
      /* lesson attachment stays optional */
    }
  };

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const setValue = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const lessons = form.courseId ? lessonMap[form.courseId] || [] : [];
  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.id) === String(form.courseId)) || null,
    [courses, form.courseId]
  );

  const needsCourse = form.includeQuiz || form.includeAssignment;
  const totalItems = [form.includeLab, form.includeQuiz, form.includeAssignment].filter(Boolean).length;

  const generate = async (event) => {
    event?.preventDefault?.();
    if (!form.title.trim()) {
      toast.error('Add a title for the module.');
      return;
    }
    if (!form.includeLab && !form.includeQuiz && !form.includeAssignment) {
      toast.error('Select at least one item to generate.');
      return;
    }
    if (needsCourse && !form.courseId) {
      toast.error('Quizzes and assignments must belong to a course.');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const { data } = await api.post(
        '/content/generate',
        {
          title: form.title.trim(),
          details: form.details.trim(),
          courseId: form.courseId ? Number(form.courseId) : null,
          lessonId: form.lessonId ? Number(form.lessonId) : null,
          difficulty: form.difficulty,
          publish: Boolean(form.publish),
          includeLab: Boolean(form.includeLab),
          labStepCount: Math.max(3, Number(form.labStepCount) || 8),
          labPractice: Boolean(form.includeLab && form.labPractice),
          includeQuiz: Boolean(form.includeQuiz),
          quizMcqCount: Math.max(1, Number(form.quizMcqCount) || 5),
          quizSubjectiveCount: Math.max(0, Number(form.quizSubjectiveCount) || 0),
          includeAssignment: Boolean(form.includeAssignment),
          assignmentPoints: Math.max(10, Number(form.assignmentPoints) || 100),
          dueInDays: Math.max(1, Number(form.dueInDays) || 7),
        },
        { timeout: 120000 }
      );
      setResult(data);
      toast.success(
        form.publish
          ? 'Module generated and published. Learners can now open it.'
          : 'Module generated as a draft. Review the artefacts before publishing.'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate the module.'));
    } finally {
      setGenerating(false);
    }
  };

  const resetAll = () => {
    setForm(initialForm);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Content Studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Describe a topic once and generate a complete practical module: a real Docker lab with verified steps, a
            graded quiz and a written assignment brief.
          </p>
        </div>
        <Badge tone="brand">
          <IconZap size={12} /> Blueprint generator
        </Badge>
      </div>

      {loadError && <Alert tone="error" title="Courses unavailable">{loadError}</Alert>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6">
          <form onSubmit={generate} className="space-y-5">
            <div className="space-y-4">
              <Input
                label="Topic / module title"
                placeholder="e.g. Linux permissions hardening"
                value={form.title}
                onChange={update('title')}
                required
              />
              <Textarea
                label="Details and scope"
                rows={4}
                value={form.details}
                onChange={update('details')}
                placeholder="What should learners practise? Mention tools, scenario and the outcome you expect. The generator uses these keywords to pick the right command blueprint."
                hint="Optional, but the more specific the brief, the more relevant the generated steps, questions and rubric."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={needsCourse ? 'Course' : 'Course (optional)'}
                value={form.courseId}
                onChange={(event) => {
                  const courseId = event.target.value;
                  setValue('courseId', courseId);
                  setValue('lessonId', '');
                  ensureLessons(courseId);
                }}
                required={needsCourse}
              >
                <option value="">{needsCourse ? 'Select a course' : 'Standalone practice material'}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
              <Select
                label="Attach to lesson (optional)"
                value={form.lessonId}
                onChange={update('lessonId')}
                disabled={!form.courseId}
              >
                <option value="">Course-wide</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lessonLabel(lesson)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Difficulty" value={form.difficulty} onChange={update('difficulty')}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </Select>
              <div className="flex items-end pb-2">
                <Checkbox
                  label={form.publish ? 'Publish immediately' : 'Save as draft'}
                  checked={form.publish}
                  onChange={update('publish')}
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">What to generate</p>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-400/20 bg-brand-400/10 text-brand-300">
                    <IconTerminal size={16} />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <Checkbox
                        label="Practical lab (real Docker container)"
                        checked={form.includeLab}
                        onChange={update('includeLab')}
                      />
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        A runnable lab with an intro, objectives and verified steps. Commands only use tools that exist in
                        the lab image.
                      </p>
                    </div>
                    {form.includeLab && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="Steps"
                          type="number"
                          min="3"
                          max="12"
                          value={form.labStepCount}
                          onChange={update('labStepCount')}
                        />
                        <div className="flex items-end pb-2">
                          <Checkbox
                            label="Practice lab (open to all, not graded)"
                            checked={form.labPractice}
                            onChange={update('labPractice')}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-300">
                    <IconZap size={16} />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <Checkbox label="Quiz (auto-graded)" checked={form.includeQuiz} onChange={update('includeQuiz')} />
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        Multiple-choice questions with explanations plus subjective scenario questions for manual review.
                      </p>
                    </div>
                    {form.includeQuiz && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="MCQs"
                          type="number"
                          min="1"
                          max="30"
                          value={form.quizMcqCount}
                          onChange={update('quizMcqCount')}
                        />
                        <Input
                          label="Subjective questions"
                          type="number"
                          min="0"
                          max="20"
                          value={form.quizSubjectiveCount}
                          onChange={update('quizSubjectiveCount')}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-sky-300">
                    <IconClipboard size={16} />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <Checkbox
                        label="Assignment brief (graded)"
                        checked={form.includeAssignment}
                        onChange={update('includeAssignment')}
                      />
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        Scenario, task list, deliverables, evidence requirements and a weighted rubric.
                      </p>
                    </div>
                    {form.includeAssignment && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="Points"
                          type="number"
                          min="10"
                          max="500"
                          value={form.assignmentPoints}
                          onChange={update('assignmentPoints')}
                        />
                        <Input
                          label="Due in days"
                          type="number"
                          min="1"
                          max="120"
                          value={form.dueInDays}
                          onChange={update('dueInDays')}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-4">
              <Button type="button" variant="ghost" onClick={resetAll} disabled={generating}>
                Reset
              </Button>
              <Button type="submit" loading={generating} disabled={totalItems === 0}>
                <IconZap size={14} /> Generate {totalItems === 1 ? 'module item' : `${totalItems} items`}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Generation summary</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Course</dt>
                <dd className="truncate text-right text-slate-300">{selectedCourse?.title || 'Not attached'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Lab</dt>
                <dd className="text-right text-slate-300">
                  {form.includeLab
                    ? `${form.labStepCount} steps${form.labPractice ? ' · practice' : ''}`
                    : 'Skipped'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Quiz</dt>
                <dd className="text-right text-slate-300">
                  {form.includeQuiz ? `${form.quizMcqCount} MCQ + ${form.quizSubjectiveCount} written` : 'Skipped'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Assignment</dt>
                <dd className="text-right text-slate-300">
                  {form.includeAssignment ? `${form.assignmentPoints} pts · due in ${form.dueInDays}d` : 'Skipped'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Visibility</dt>
                <dd className="text-right text-slate-300">{form.publish ? 'Published' : 'Draft'}</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-white/5 pt-3 text-[11px] leading-5 text-slate-500">
              Generation is deterministic: the same brief always produces the same structure, so your course stays
              consistent. Every lab step is verified against real command output inside the container.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">This session</h2>
            {result ? (
              <div className="mt-3 space-y-2">
                {result.lab ? (
                  <Link
                    to={`/instructor/labs/${result.lab.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs transition hover:border-brand-400/30 hover:text-brand-200"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <IconTerminal size={13} className="shrink-0 text-brand-300" />
                      <span className="truncate">Lab: {result.lab.title}</span>
                    </span>
                    <IconArrowRight size={13} className="shrink-0" />
                  </Link>
                ) : null}
                {result.quiz ? (
                  <Link
                    to="/instructor/quizzes"
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs transition hover:border-amber-400/30 hover:text-amber-200"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <IconZap size={13} className="shrink-0 text-amber-300" />
                      <span className="truncate">Quiz: {result.quiz.title}</span>
                    </span>
                    <IconArrowRight size={13} className="shrink-0" />
                  </Link>
                ) : null}
                {result.assignment ? (
                  <Link
                    to="/instructor/assignments"
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs transition hover:border-sky-400/30 hover:text-sky-200"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <IconClipboard size={13} className="shrink-0 text-sky-300" />
                      <span className="truncate">Assignment: {result.assignment.title}</span>
                    </span>
                    <IconArrowRight size={13} className="shrink-0" />
                  </Link>
                ) : null}
                {result.lab ? (
                  <Button as={Link} to={`/labs/${result.lab.id}`} size="sm" variant="secondary" className="w-full">
                    <IconEye size={13} /> Preview generated lab
                  </Button>
                ) : null}
                <p className="flex items-center gap-1.5 pt-1 text-[11px] text-emerald-300">
                  <IconCheckCircle size={12} /> Saved and ready to review.
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <EmptyState
                  icon={IconBookOpen}
                  title="Nothing generated yet"
                  message="Fill in a topic and generate. Your new lab, quiz and assignment will appear here with direct links."
                  className="border-0 bg-transparent p-0"
                />
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Prefer one at a time?</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Labs, quizzes and assignments can also be generated separately, or written manually.
            </p>
            <div className="mt-3 space-y-2">
              <Button as={Link} to="/instructor/labs" size="sm" variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <IconTerminal size={13} /> Lab builder
                </span>
                <IconArrowRight size={13} />
              </Button>
              <Button as={Link} to="/instructor/quizzes" size="sm" variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <IconZap size={13} /> Quizzes
                </span>
                <IconArrowRight size={13} />
              </Button>
              <Button as={Link} to="/instructor/assignments" size="sm" variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <IconClipboard size={13} /> Assignments
                </span>
                <IconArrowRight size={13} />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {loadingCourses && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
