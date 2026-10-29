import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  ProgressBar,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconArrowLeft,
  IconBookOpen,
  IconCheckCircle,
  IconEdit,
  IconFileText,
  IconPlus,
  IconTerminal,
  IconTrash,
  IconUsers,
  IconZap,
} from '../../components/icons';
import { CATEGORIES, DIFFICULTIES, SUBCATEGORY_SUGGESTIONS } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/format';

const tabs = [
  { id: 'details', label: 'Details' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'quizzes', label: 'Quizzes' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'labs', label: 'Labs' },
  { id: 'students', label: 'Students' },
];

const emptyDetails = {
  title: '',
  summary: '',
  description: '',
  category: 'Linux',
  subcategory: '',
  level: 'beginner',
  durationHours: 0,
  price: 0,
  coverImage: '',
  tags: '',
  status: 'draft',
  instructorId: '',
};

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyQuestion() {
  return { question: '', type: 'mcq', options: ['', ''], correctOption: 0, explanation: '', points: 1 };
}

export default function CourseEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [details, setDetails] = useState(emptyDetails);
  const [data, setData] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [tab, setTab] = useState('details');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAdmin) {
      api.get('/users', { params: { role: 'instructor', limit: 100 } })
        .then((res) => setInstructors(res.data.users || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  const [moduleModal, setModuleModal] = useState(null);
  const [lessonModal, setLessonModal] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [quizModal, setQuizModal] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState(null);
  const [labModal, setLabModal] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);

  const load = async ({ silent = false } = {}) => {
    if (isNew) return;
    if (!silent) setLoading(true);
    try {
      const { data: response } = await api.get(`/courses/${id}/manage`);
      setData(response);
      const course = response.course;
      setDetails({
        title: course.title || '',
        summary: course.summary || '',
        description: course.description || '',
        category: course.category || 'Linux',
        subcategory: course.subcategory || '',
        level: course.level || 'beginner',
        durationHours: course.duration_hours ?? 0,
        price: course.price ?? 0,
        coverImage: course.cover_image || '',
        tags: Array.isArray(course.tags) ? course.tags.join(', ') : '',
        status: course.status || 'draft',
        instructorId: course.instructor_id || '',
      });
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this course.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lessons = useMemo(
    () => (data?.modules || []).flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))),
    [data]
  );

  const updateDetail = (field) => (event) => setDetails((current) => ({ ...current, [field]: event.target.value }));

  const saveDetails = async (event) => {
    event?.preventDefault();
    if (!details.title.trim()) {
      toast.error('Give the course a title.');
      return;
    }
    setSaving(true);
    const payload = {
      title: details.title.trim(),
      summary: details.summary.trim(),
      description: details.description,
      category: details.category,
      subcategory: details.subcategory.trim() || 'General',
      level: details.level,
      durationHours: Number(details.durationHours) || 0,
      price: Number(details.price) || 0,
      coverImage: details.coverImage.trim() || null,
      tags: details.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      status: details.status,
    };
    if (isAdmin && details.instructorId) {
      payload.instructorId = Number(details.instructorId);
    }
    try {
      if (isNew) {
        const { data: response } = await api.post('/courses', payload);
        toast.success('Course created. Add your curriculum next.');
        navigate(`/instructor/courses/${response.course.id}`, { replace: true });
      } else {
        await api.put(`/courses/${id}`, payload);
        toast.success('Course details saved.');
        await load({ silent: true });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the course.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const next = data.course.status === 'published' ? 'draft' : 'published';
    setSaving(true);
    try {
      await api.put(`/courses/${id}`, { status: next });
      toast.success(next === 'published' ? 'Course published.' : 'Course unpublished.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the course status.'));
    } finally {
      setSaving(false);
    }
  };

  // ---------- modules & lessons ----------

  const saveModule = async (event) => {
    event.preventDefault();
    setModalSaving(true);
    try {
      if (moduleModal.id) {
        await api.put(`/courses/modules/${moduleModal.id}`, {
          title: moduleModal.title,
          description: moduleModal.description || null,
        });
      } else {
        await api.post(`/courses/${id}/modules`, {
          title: moduleModal.title,
          description: moduleModal.description || null,
        });
      }
      toast.success(moduleModal.id ? 'Module updated.' : 'Module added.');
      setModuleModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the module.'));
    } finally {
      setModalSaving(false);
    }
  };

  const deleteModule = async (module) => {
    if (!window.confirm(`Delete module "${module.title}"? Lessons inside will be removed too.`)) return;
    try {
      await api.delete(`/courses/modules/${module.id}`);
      toast.success('Module deleted.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the module.'));
    }
  };

  const openLesson = async (lesson, moduleId) => {
    if (!lesson) {
      setLessonModal({
        moduleId: moduleId ?? data.modules[0]?.id ?? '',
        title: '',
        content: '',
        videoUrl: '',
        durationMinutes: 10,
        lessonType: 'reading',
        isFreePreview: false,
      });
      return;
    }
    setLessonModal({ ...lesson, moduleId: lesson.module_id ?? moduleId ?? '', videoUrl: lesson.video_url || '', isFreePreview: Boolean(lesson.is_free_preview) });
    setLessonLoading(true);
    try {
      const { data: response } = await api.get(`/courses/lessons/${lesson.id}`);
      setLessonModal({
        id: lesson.id,
        moduleId: response.lesson.module_id ?? moduleId ?? '',
        title: response.lesson.title,
        content: response.lesson.content || '',
        videoUrl: response.lesson.video_url || '',
        durationMinutes: response.lesson.duration_minutes ?? 10,
        lessonType: response.lesson.lesson_type || 'reading',
        isFreePreview: Boolean(response.lesson.is_free_preview),
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load the lesson.'));
      setLessonModal(null);
    } finally {
      setLessonLoading(false);
    }
  };

  const saveLesson = async (event) => {
    event.preventDefault();
    setModalSaving(true);
    const payload = {
      moduleId: lessonModal.moduleId ? Number(lessonModal.moduleId) : null,
      title: lessonModal.title,
      content: lessonModal.content,
      videoUrl: lessonModal.videoUrl || null,
      durationMinutes: Number(lessonModal.durationMinutes) || 0,
      lessonType: lessonModal.lessonType,
      isFreePreview: Boolean(lessonModal.isFreePreview),
    };
    try {
      if (lessonModal.id) await api.put(`/courses/lessons/${lessonModal.id}`, payload);
      else await api.post(`/courses/${id}/lessons`, payload);
      toast.success(lessonModal.id ? 'Lesson updated.' : 'Lesson added.');
      setLessonModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the lesson.'));
    } finally {
      setModalSaving(false);
    }
  };

  const deleteLesson = async (lesson) => {
    if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
    try {
      await api.delete(`/courses/lessons/${lesson.id}`);
      toast.success('Lesson deleted.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the lesson.'));
    }
  };

  // ---------- quizzes ----------

  const openQuiz = async (quiz) => {
    if (!quiz) {
      setQuizModal({
        title: '',
        description: '',
        passScore: 60,
        lessonId: '',
        questions: [emptyQuestion()],
      });
      return;
    }
    setQuizLoading(true);
    try {
      const { data: response } = await api.get(`/quizzes/${quiz.id}`);
      setQuizModal({
        id: quiz.id,
        title: response.quiz.title,
        description: response.quiz.description || '',
        passScore: response.quiz.passScore,
        lessonId: response.quiz.lessonId || '',
        questions: response.questions.map((question) => ({
          question: question.question,
          type: question.type,
          options: Array.isArray(question.options) ? question.options : ['', ''],
          correctOption: question.correctOption ?? 0,
          explanation: question.explanation || '',
          points: question.points,
        })),
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load the quiz.'));
    } finally {
      setQuizLoading(false);
    }
  };

  const updateQuestion = (index, field, value) => {
    setQuizModal((current) => ({
      ...current,
      questions: current.questions.map((question, itemIndex) => (itemIndex === index ? { ...question, [field]: value } : question)),
    }));
  };

  const updateOption = (questionIndex, optionIndex, value) => {
    setQuizModal((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex
          ? { ...question, options: question.options.map((option, position) => (position === optionIndex ? value : option)) }
          : question
      ),
    }));
  };

  const addOption = (questionIndex) => {
    setQuizModal((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex && question.options.length < 6 ? { ...question, options: [...question.options, ''] } : question
      ),
    }));
  };

  const removeOption = (questionIndex, optionIndex) => {
    setQuizModal((current) => ({
      ...current,
      questions: current.questions.map((question, index) => {
        if (index !== questionIndex || question.options.length <= 2) return question;
        const options = question.options.filter((_, position) => position !== optionIndex);
        return {
          ...question,
          options,
          correctOption: Math.min(question.correctOption, options.length - 1),
        };
      }),
    }));
  };

  const saveQuiz = async (event) => {
    event.preventDefault();
    const invalid = quizModal.questions.some(
      (question) => !question.question.trim() || question.options.some((option) => !option.trim())
    );
    if (invalid) {
      toast.error('Every question needs text and non-empty options.');
      return;
    }
    setModalSaving(true);
    const payload = {
      title: quizModal.title,
      description: quizModal.description,
      passScore: Number(quizModal.passScore) || 0,
      lessonId: quizModal.lessonId ? Number(quizModal.lessonId) : null,
      questions: quizModal.questions.map((question, index) => ({
        question: question.question,
        type: question.type,
        options: question.options,
        correctOption: question.correctOption,
        explanation: question.explanation || null,
        points: Number(question.points) || 1,
        position: index,
      })),
    };
    try {
      if (quizModal.id) await api.put(`/quizzes/${quizModal.id}`, payload);
      else await api.post(`/quizzes/courses/${id}`, payload);
      toast.success(quizModal.id ? 'Quiz updated.' : 'Quiz created.');
      setQuizModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the quiz.'));
    } finally {
      setModalSaving(false);
    }
  };

  const deleteQuiz = async (quiz) => {
    if (!window.confirm(`Delete quiz "${quiz.title}" and all attempts?`)) return;
    try {
      await api.delete(`/quizzes/${quiz.id}`);
      toast.success('Quiz deleted.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the quiz.'));
    }
  };

  // ---------- assignments ----------

  const openAssignment = (assignment) =>
    setAssignmentModal(
      assignment
        ? {
            id: assignment.id,
            title: assignment.title,
            description: assignment.description || '',
            dueAt: toLocalInput(assignment.due_at),
            points: assignment.points,
            isPublished: Boolean(assignment.is_published),
            lessonId: assignment.lesson_id || '',
          }
        : { title: '', description: '', dueAt: '', points: 100, isPublished: true, lessonId: '' }
    );

  const saveAssignment = async (event) => {
    event.preventDefault();
    setModalSaving(true);
    const payload = {
      title: assignmentModal.title,
      description: assignmentModal.description,
      dueAt: assignmentModal.dueAt ? new Date(assignmentModal.dueAt).toISOString() : null,
      points: Number(assignmentModal.points) || 1,
      isPublished: Boolean(assignmentModal.isPublished),
      lessonId: assignmentModal.lessonId ? Number(assignmentModal.lessonId) : null,
    };
    try {
      if (assignmentModal.id) await api.put(`/assignments/${assignmentModal.id}`, payload);
      else await api.post(`/assignments/courses/${id}`, payload);
      toast.success(assignmentModal.id ? 'Assignment updated.' : 'Assignment created.');
      setAssignmentModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the assignment.'));
    } finally {
      setModalSaving(false);
    }
  };

  const deleteAssignment = async (assignment) => {
    if (!window.confirm(`Delete assignment "${assignment.title}"?`)) return;
    try {
      await api.delete(`/assignments/${assignment.id}`);
      toast.success('Assignment deleted.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the assignment.'));
    }
  };

  // ---------- labs ----------

  const saveLab = async (event) => {
    event.preventDefault();
    setModalSaving(true);
    try {
      const { data: response } = await api.post('/labs', {
        title: labModal.title,
        summary: labModal.summary,
        description: labModal.description,
        difficulty: labModal.difficulty,
        estimatedMinutes: Number(labModal.estimatedMinutes) || 30,
        courseId: Number(id),
        lessonId: labModal.lessonId ? Number(labModal.lessonId) : null,
        status: labModal.status,
      });
      toast.success('Lab created. Add its steps next.');
      navigate(`/instructor/labs/${response.lab.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create the lab.'));
    } finally {
      setModalSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!isNew && (error || !data)) {
    return (
      <div>
        <Alert tone="error" title="Course unavailable">
          {error || 'This course could not be found.'}
        </Alert>
        <Button as={Link} to="/instructor/courses" variant="secondary" className="mt-4">
          Back to courses
        </Button>
      </div>
    );
  }

  const course = data?.course;
  const counts = {
    curriculum: lessons.length,
    quizzes: data?.quizzes?.length || 0,
    assignments: data?.assignments?.length || 0,
    labs: data?.labs?.length || 0,
    students: data?.enrollments?.length || 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/instructor/courses" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-300">
            <IconArrowLeft size={13} /> All courses
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold">
            {isNew ? 'New course' : course?.title}
            {!isNew && <Badge tone={course?.status === 'published' ? 'emerald' : 'amber'}>{course?.status}</Badge>}
          </h1>
          {!isNew && (
            <p className="mt-1 text-xs text-slate-500">
              {course.enrolled_count ?? 0} learners · created {formatDate(course.created_at)}
            </p>
          )}
        </div>
        {!isNew && (
          <div className="flex flex-wrap gap-2">
            <Button as={Link} to={`/courses/${course.slug}`} size="sm" variant="ghost">
              View public page
            </Button>
            <Button size="sm" variant={course.status === 'published' ? 'secondary' : 'primary'} onClick={togglePublish} loading={saving}>
              {course.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
          </div>
        )}
      </div>

      {!isNew && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-night-900/60 p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                tab === item.id ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {counts[item.id] != null && <span className="ml-1.5 text-[10px] text-slate-500">{counts[item.id]}</span>}
            </button>
          ))}
        </div>
      )}

      {(isNew || tab === 'details') && (
        <Card className="p-6">
          <form onSubmit={saveDetails} className="space-y-4">
            <Input label="Title" value={details.title} onChange={updateDetail('title')} required placeholder="e.g. Linux Fundamentals for Security Analysts" />
            <Textarea label="Summary" rows={2} value={details.summary} onChange={updateDetail('summary')} placeholder="One sentence shown on catalog cards." />
            <Textarea label="Description (markdown)" rows={7} value={details.description} onChange={updateDetail('description')} placeholder="What the course covers, who it's for, prerequisites…" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="course-category" className="label">Category</label>
                <input id="course-category" list="course-categories" className="input mt-1.5" value={details.category} onChange={updateDetail('category')} />
                <datalist id="course-categories">
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="course-subcategory" className="label">Subcategory</label>
                <input
                  id="course-subcategory"
                  list="course-subcategories"
                  className="input mt-1.5"
                  value={details.subcategory}
                  onChange={updateDetail('subcategory')}
                  placeholder="e.g. React, Express, Linux Administration"
                />
                <datalist id="course-subcategories">
                  {(SUBCATEGORY_SUGGESTIONS[details.category] || []).map((subcategory) => (
                    <option key={subcategory} value={subcategory} />
                  ))}
                </datalist>
              </div>
              <Select label="Level" value={details.level} onChange={updateDetail('level')}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </Select>
              <Input label="Duration (hours)" type="number" min="0" step="0.5" value={details.durationHours} onChange={updateDetail('durationHours')} />
              <Input label="Price (USD)" type="number" min="0" step="1" value={details.price} onChange={updateDetail('price')} hint="Use 0 for free courses." />
            </div>
            <Input label="Cover image URL" value={details.coverImage} onChange={updateDetail('coverImage')} placeholder="https://… or /images/courses/…" />
            <Input label="Tags" value={details.tags} onChange={updateDetail('tags')} placeholder="linux, hardening, cli" hint="Comma separated, up to 12." />
            <Select label="Status" value={details.status} onChange={updateDetail('status')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
            {isAdmin && (
              <Select
                label="Assigned Instructor (Admin Control)"
                value={details.instructorId || ''}
                onChange={updateDetail('instructorId')}
                hint="Assign or reassign teaching and evaluation authority for this course to an instructor."
              >
                <option value="">Default (Current Staff / Self)</option>
                {instructors.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.full_name} ({inst.email})
                  </option>
                ))}
              </Select>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {isNew ? 'Create course' : 'Save details'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!isNew && tab === 'curriculum' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Structure lessons into modules. Labs, quizzes and assignments attach to individual lessons.</p>
            <Button size="sm" variant="secondary" onClick={() => setModuleModal({ title: '', description: '' })}>
              <IconPlus size={13} /> Add module
            </Button>
          </div>

          {(data.modules || []).length === 0 ? (
            <EmptyState
              icon={IconBookOpen}
              title="No modules yet"
              message="Add a module, then populate it with lessons."
              action={
                <Button size="sm" onClick={() => setModuleModal({ title: '', description: '' })}>
                  <IconPlus size={13} /> Add module
                </Button>
              }
            />
          ) : (
            data.modules.map((module, moduleIndex) => (
              <Card key={module.id} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="font-mono text-[11px] text-brand-300">M{moduleIndex + 1}</span>
                      {module.title}
                    </p>
                    {module.description && <p className="mt-0.5 text-[11px] text-slate-500">{module.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setModuleModal(module)}>
                      <IconEdit size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteModule(module)}>
                      <IconTrash size={13} className="text-slate-500" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openLesson(null, module.id)}>
                      <IconPlus size={13} /> Lesson
                    </Button>
                  </div>
                </div>
                <ul className="divide-y divide-white/5">
                  {module.lessons.map((lesson, lessonIndex) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                      <span className="font-mono text-[10px] text-slate-600">{moduleIndex + 1}.{lessonIndex + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-200">{lesson.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {lesson.lesson_type} · {lesson.duration_minutes} min
                          {lesson.is_free_preview ? ' · free preview' : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openLesson(lesson, module.id)} disabled={lessonLoading}>
                        <IconEdit size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteLesson(lesson)}>
                        <IconTrash size={13} className="text-slate-500" />
                      </Button>
                    </li>
                  ))}
                  {module.lessons.length === 0 && (
                    <li className="px-5 py-3 text-xs text-slate-600">No lessons in this module yet.</li>
                  )}
                </ul>
              </Card>
            ))
          )}
        </div>
      )}

      {!isNew && tab === 'quizzes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Quizzes can be attached to a lesson and gate progress.</p>
            <Button size="sm" variant="secondary" onClick={() => openQuiz(null)}>
              <IconPlus size={13} /> New quiz
            </Button>
          </div>
          {(data.quizzes || []).length === 0 ? (
            <EmptyState icon={IconZap} title="No quizzes" message="Add a quiz to check understanding after a lesson." />
          ) : (
            <div className="space-y-2">
              {data.quizzes.map((quiz) => (
                <Card key={quiz.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-400/10 text-accent-300">
                    <IconZap size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">{quiz.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {quiz.question_count} questions · pass {Math.round(Number(quiz.pass_score))}%
                      {quiz.lesson_id ? ` · lesson #${quiz.lesson_id}` : ' · course-wide'}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openQuiz(quiz)} disabled={quizLoading}>
                    <IconEdit size={13} /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteQuiz(quiz)}>
                    <IconTrash size={13} className="text-slate-500" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!isNew && tab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Written work graded by instructors. Submissions appear in submission review.</p>
            <Button size="sm" variant="secondary" onClick={() => openAssignment(null)}>
              <IconPlus size={13} /> New assignment
            </Button>
          </div>
          {(data.assignments || []).length === 0 ? (
            <EmptyState icon={IconFileText} title="No assignments" message="Add a practical written assignment." />
          ) : (
            <div className="space-y-2">
              {data.assignments.map((assignment) => (
                <Card key={assignment.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                    <IconFileText size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                      {assignment.title}
                      <Badge tone={assignment.is_published ? 'emerald' : 'slate'}>{assignment.is_published ? 'published' : 'hidden'}</Badge>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {assignment.points} points · {assignment.submission_count} submissions
                      {assignment.due_at ? ` · due ${formatDateTime(assignment.due_at)}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openAssignment(assignment)}>
                    <IconEdit size={13} /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteAssignment(assignment)}>
                    <IconTrash size={13} className="text-slate-500" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!isNew && tab === 'labs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Hands-on labs with a real Linux terminal and auto-verified steps.</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setLabModal({ title: '', summary: '', description: '', difficulty: 'beginner', estimatedMinutes: 30, lessonId: '', status: 'draft' })
              }
            >
              <IconPlus size={13} /> New lab
            </Button>
          </div>
          {(data.labs || []).length === 0 ? (
            <EmptyState icon={IconTerminal} title="No labs" message="Create a lab and add guided, auto-verified steps." />
          ) : (
            <div className="space-y-2">
              {data.labs.map((lab) => (
                <Card key={lab.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                    <IconTerminal size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                      {lab.title}
                      <Badge tone={lab.status === 'published' ? 'emerald' : 'amber'}>{lab.status}</Badge>
                    </p>
                    <p className="text-[11px] text-slate-500">{lab.step_count} steps · {DIFFICULTIES[lab.difficulty]?.label || lab.difficulty} · {lab.estimated_minutes} min</p>
                  </div>
                  <Button as={Link} to={`/instructor/labs/${lab.id}`} size="sm" variant="secondary">
                    Edit lab
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!isNew && tab === 'students' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <IconUsers size={16} className="text-brand-300" /> Enrolled learners
            </h2>
            <span className="text-xs text-slate-500">{data.enrollments.length} total</span>
          </div>
          {data.enrollments.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No enrollments yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Learner</th>
                    <th className="px-3 py-2.5 font-medium">Progress</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium text-right">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.enrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td className="px-5 py-3">
                        <p className="text-sm text-slate-200">{enrollment.full_name}</p>
                        <p className="text-[10px] text-slate-500">{enrollment.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={Number(enrollment.progress_percent)} size="sm" className="w-24" tone={enrollment.status === 'completed' ? 'emerald' : 'brand'} />
                          <span className="font-mono text-[10px] text-slate-400">{Math.round(Number(enrollment.progress_percent))}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={enrollment.status === 'completed' ? 'emerald' : enrollment.status === 'dropped' ? 'slate' : 'brand'}>
                          {enrollment.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-[11px] text-slate-500">
                        {enrollment.completed_at ? formatDate(enrollment.completed_at) : formatDate(enrollment.enrolled_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ---------- module modal ---------- */}
      <Modal
        open={Boolean(moduleModal)}
        onClose={() => setModuleModal(null)}
        title={moduleModal?.id ? 'Edit module' : 'Add module'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModuleModal(null)}>Cancel</Button>
            <Button onClick={saveModule} loading={modalSaving}>{moduleModal?.id ? 'Save module' : 'Add module'}</Button>
          </>
        }
      >
        {moduleModal && (
          <form onSubmit={saveModule} className="space-y-4">
            <Input label="Module title" value={moduleModal.title} onChange={(event) => setModuleModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Description" rows={2} value={moduleModal.description || ''} onChange={(event) => setModuleModal((current) => ({ ...current, description: event.target.value }))} />
          </form>
        )}
      </Modal>

      {/* ---------- lesson modal ---------- */}
      <Modal
        open={Boolean(lessonModal)}
        onClose={() => setLessonModal(null)}
        title={lessonModal?.id ? 'Edit lesson' : 'Add lesson'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLessonModal(null)}>Cancel</Button>
            <Button onClick={saveLesson} loading={modalSaving}>{lessonModal?.id ? 'Save lesson' : 'Add lesson'}</Button>
          </>
        }
      >
        {lessonModal && (
          <form onSubmit={saveLesson} className="space-y-4">
            <Input label="Lesson title" value={lessonModal.title} onChange={(event) => setLessonModal((current) => ({ ...current, title: event.target.value }))} required />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Module" value={lessonModal.moduleId} onChange={(event) => setLessonModal((current) => ({ ...current, moduleId: event.target.value }))}>
                <option value="">Unassigned</option>
                {(data?.modules || []).map((module) => (
                  <option key={module.id} value={module.id}>{module.title}</option>
                ))}
              </Select>
              <Select label="Type" value={lessonModal.lessonType} onChange={(event) => setLessonModal((current) => ({ ...current, lessonType: event.target.value }))}>
                <option value="reading">Reading</option>
                <option value="video">Video</option>
                <option value="lab">Lab</option>
              </Select>
              <Input label="Duration (min)" type="number" min="0" value={lessonModal.durationMinutes} onChange={(event) => setLessonModal((current) => ({ ...current, durationMinutes: event.target.value }))} />
            </div>
            <Input label="Video URL (optional)" value={lessonModal.videoUrl} onChange={(event) => setLessonModal((current) => ({ ...current, videoUrl: event.target.value }))} />
            <Textarea label="Content (markdown)" rows={10} value={lessonModal.content} onChange={(event) => setLessonModal((current) => ({ ...current, content: event.target.value }))} className="font-mono text-[12px]" />
            <Checkbox label="Free preview (visible without enrollment)" checked={lessonModal.isFreePreview} onChange={(event) => setLessonModal((current) => ({ ...current, isFreePreview: event.target.checked }))} />
          </form>
        )}
      </Modal>

      {/* ---------- quiz modal ---------- */}
      <Modal
        open={Boolean(quizModal)}
        onClose={() => setQuizModal(null)}
        title={quizModal?.id ? 'Edit quiz' : 'New quiz'}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuizModal(null)}>Cancel</Button>
            <Button onClick={saveQuiz} loading={modalSaving}>{quizModal?.id ? 'Save quiz' : 'Create quiz'}</Button>
          </>
        }
      >
        {quizLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : quizModal ? (
          <form onSubmit={saveQuiz} className="space-y-5">
            <Input label="Quiz title" value={quizModal.title} onChange={(event) => setQuizModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Description" rows={2} value={quizModal.description} onChange={(event) => setQuizModal((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Pass score (%)" type="number" min="0" max="100" value={quizModal.passScore} onChange={(event) => setQuizModal((current) => ({ ...current, passScore: event.target.value }))} />
              <Select label="Attach to lesson" value={quizModal.lessonId} onChange={(event) => setQuizModal((current) => ({ ...current, lessonId: event.target.value }))}>
                <option value="">Course-wide</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle}, {lesson.title}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-3">
              {quizModal.questions.map((question, questionIndex) => (
                <div key={questionIndex} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Question {questionIndex + 1}</p>
                    {quizModal.questions.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setQuizModal((current) => ({ ...current, questions: current.questions.filter((_, index) => index !== questionIndex) }))}
                      >
                        <IconTrash size={13} />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    className="mt-2"
                    value={question.question}
                    onChange={(event) => updateQuestion(questionIndex, 'question', event.target.value)}
                    placeholder="Question text"
                  />
                  <div className="mt-3 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${questionIndex}`}
                          checked={question.correctOption === optionIndex}
                          onChange={() => updateQuestion(questionIndex, 'correctOption', optionIndex)}
                          className="h-3.5 w-3.5 accent-brand-400"
                          aria-label={`Mark option ${optionIndex + 1} correct`}
                        />
                        <Input
                          value={option}
                          onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                          className="h-9 text-[13px]"
                        />
                        {question.options.length > 2 && (
                          <Button size="sm" variant="ghost" onClick={() => removeOption(questionIndex, optionIndex)}>
                            <IconTrash size={12} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <Button size="sm" variant="ghost" onClick={() => addOption(questionIndex)} disabled={question.options.length >= 6}>
                      <IconPlus size={12} /> Option
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Points</span>
                      <input
                        type="number"
                        min="1"
                        value={question.points}
                        onChange={(event) => updateQuestion(questionIndex, 'points', event.target.value)}
                        className="input h-8 w-16 text-center text-xs"
                      />
                    </div>
                  </div>
                  <Input
                    value={question.explanation}
                    onChange={(event) => updateQuestion(questionIndex, 'explanation', event.target.value)}
                    placeholder="Explanation shown after submission (optional)"
                    className="mt-2 h-9 text-xs"
                  />
                </div>
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQuizModal((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }))}
            >
              <IconPlus size={13} /> Add question
            </Button>
          </form>
        ) : null}
      </Modal>

      {/* ---------- assignment modal ---------- */}
      <Modal
        open={Boolean(assignmentModal)}
        onClose={() => setAssignmentModal(null)}
        title={assignmentModal?.id ? 'Edit assignment' : 'New assignment'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignmentModal(null)}>Cancel</Button>
            <Button onClick={saveAssignment} loading={modalSaving}>{assignmentModal?.id ? 'Save assignment' : 'Create assignment'}</Button>
          </>
        }
      >
        {assignmentModal && (
          <form onSubmit={saveAssignment} className="space-y-4">
            <Input label="Title" value={assignmentModal.title} onChange={(event) => setAssignmentModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Description (markdown)" rows={6} value={assignmentModal.description} onChange={(event) => setAssignmentModal((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Due date" type="datetime-local" value={assignmentModal.dueAt} onChange={(event) => setAssignmentModal((current) => ({ ...current, dueAt: event.target.value }))} />
              <Input label="Points" type="number" min="1" value={assignmentModal.points} onChange={(event) => setAssignmentModal((current) => ({ ...current, points: event.target.value }))} />
              <Select label="Attach to lesson" value={assignmentModal.lessonId} onChange={(event) => setAssignmentModal((current) => ({ ...current, lessonId: event.target.value }))}>
                <option value="">Course-wide</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle}, {lesson.title}</option>
                ))}
              </Select>
              <div className="flex items-end pb-2">
                <Checkbox label="Visible to learners" checked={assignmentModal.isPublished} onChange={(event) => setAssignmentModal((current) => ({ ...current, isPublished: event.target.checked }))} />
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------- lab modal ---------- */}
      <Modal
        open={Boolean(labModal)}
        onClose={() => setLabModal(null)}
        title="New lab"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLabModal(null)}>Cancel</Button>
            <Button onClick={saveLab} loading={modalSaving}>Create lab</Button>
          </>
        }
      >
        {labModal && (
          <form onSubmit={saveLab} className="space-y-4">
            <Input label="Lab title" value={labModal.title} onChange={(event) => setLabModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Summary" rows={2} value={labModal.summary} onChange={(event) => setLabModal((current) => ({ ...current, summary: event.target.value }))} />
            <Textarea label="Description (markdown)" rows={4} value={labModal.description} onChange={(event) => setLabModal((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Difficulty" value={labModal.difficulty} onChange={(event) => setLabModal((current) => ({ ...current, difficulty: event.target.value }))}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </Select>
              <Input label="Minutes" type="number" min="5" value={labModal.estimatedMinutes} onChange={(event) => setLabModal((current) => ({ ...current, estimatedMinutes: event.target.value }))} />
              <Select label="Status" value={labModal.status} onChange={(event) => setLabModal((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </div>
            <Select label="Attach to lesson" value={labModal.lessonId} onChange={(event) => setLabModal((current) => ({ ...current, lessonId: event.target.value }))}>
              <option value="">Course-wide</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle}, {lesson.title}</option>
              ))}
            </Select>
            <p className="text-[11px] leading-5 text-slate-500">After creating the lab you'll be taken to the step editor to add commands and verification rules.</p>
          </form>
        )}
      </Modal>
    </div>
  );
}
