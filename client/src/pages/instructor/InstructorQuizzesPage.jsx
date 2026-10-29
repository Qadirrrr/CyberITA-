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
import {
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
  IconZap,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';

function emptyQuestion() {
  return { question: '', type: 'mcq', options: ['', ''], correctOption: 0, explanation: '', points: 1 };
}

function emptyQuiz(courseId = '') {
  return {
    title: '',
    description: '',
    courseId,
    lessonId: '',
    passScore: 60,
    questions: [emptyQuestion()],
  };
}

function lessonLabel(lesson) {
  return lesson.moduleTitle ? `${lesson.moduleTitle} · ${lesson.title}` : lesson.title;
}

export default function InstructorQuizzesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [quizzes, setQuizzes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [lessonMap, setLessonMap] = useState({});
  const [attempts, setAttempts] = useState(null);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [autoGenModal, setAutoGenModal] = useState(false);
  const [autoGenForm, setAutoGenForm] = useState({
    title: '',
    details: '',
    courseId: '',
    lessonId: '',
    mcqCount: 5,
    subjectiveCount: 2,
    difficulty: 'intermediate',
  });
  const [generating, setGenerating] = useState(false);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [quizzesResponse, coursesResponse] = await Promise.all([
        api.get('/instructor/quizzes'),
        api.get('/courses', { params: { all: true, limit: 60 } }),
      ]);
      setQuizzes(quizzesResponse.data.quizzes || []);
      const list = coursesResponse.data.courses || [];
      setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load quizzes.'));
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
      /* lessons are optional, keep the quiz course-wide */
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quizzes.filter((quiz) => {
      if (courseFilter !== 'all' && String(quiz.course_id) !== String(courseFilter)) return false;
      if (!term) return true;
      return `${quiz.title} ${quiz.description || ''} ${quiz.course_title || ''} ${quiz.lesson_title || ''}`
        .toLowerCase()
        .includes(term);
    });
  }, [quizzes, search, courseFilter]);

  const totals = useMemo(() => {
    const attempted = quizzes.filter((quiz) => Number(quiz.attempt_count) > 0);
    return {
      quizzes: quizzes.length,
      attempts: quizzes.reduce((sum, quiz) => sum + Number(quiz.attempt_count || 0), 0),
      average:
        attempted.length === 0
          ? 0
          : Math.round(
              attempted.reduce((sum, quiz) => sum + Number(quiz.avg_percent || 0), 0) / attempted.length
            ),
    };
  }, [quizzes]);

  const openCreate = () => {
    const courseId = courseFilter !== 'all' ? courseFilter : courses[0]?.id || '';
    setModal(emptyQuiz(courseId));
    ensureLessons(courseId);
  };

  const openEdit = async (quiz) => {
    setLoadingQuiz(true);
    try {
      const { data } = await api.get(`/quizzes/${quiz.id}`);
      setModal({
        id: quiz.id,
        title: data.quiz.title,
        description: data.quiz.description || '',
        courseId: quiz.course_id,
        lessonId: data.quiz.lessonId || '',
        passScore: data.quiz.passScore,
        questions: (data.questions || []).map((question) => ({
          question: question.question,
          type: question.type,
          options: Array.isArray(question.options) && question.options.length ? question.options : ['', ''],
          correctOption: question.correctOption ?? 0,
          explanation: question.explanation || '',
          points: question.points,
        })),
      });
      ensureLessons(quiz.course_id);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load the quiz.'));
    } finally {
      setLoadingQuiz(false);
    }
  };

  const updateQuestion = (index, field, value) => {
    setModal((current) => ({
      ...current,
      questions: current.questions.map((question, itemIndex) =>
        itemIndex === index ? { ...question, [field]: value } : question
      ),
    }));
  };

  const updateOption = (questionIndex, optionIndex, value) => {
    setModal((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex
          ? {
              ...question,
              options: question.options.map((option, position) =>
                position === optionIndex ? value : option
              ),
            }
          : question
      ),
    }));
  };

  const addOption = (questionIndex) => {
    setModal((current) => ({
      ...current,
      questions: current.questions.map((question, index) =>
        index === questionIndex && question.options.length < 6
          ? { ...question, options: [...question.options, ''] }
          : question
      ),
    }));
  };

  const removeOption = (questionIndex, optionIndex) => {
    setModal((current) => ({
      ...current,
      questions: current.questions.map((question, index) => {
        if (index !== questionIndex || question.options.length <= 2) return question;
        const options = question.options.filter((_, position) => position !== optionIndex);
        return { ...question, options, correctOption: Math.min(question.correctOption, options.length - 1) };
      }),
    }));
  };

  const removeQuestion = (questionIndex) => {
    setModal((current) => ({
      ...current,
      questions: current.questions.filter((_, index) => index !== questionIndex),
    }));
  };

  const saveQuiz = async (event) => {
    event.preventDefault();
    if (!modal.courseId) {
      toast.error('Choose the course this quiz belongs to.');
      return;
    }
    const invalid = modal.questions.some(
      (question) => !question.question.trim() || question.options.some((option) => !option.trim())
    );
    if (invalid) {
      toast.error('Every question needs text and non-empty options.');
      return;
    }
    setSaving(true);
    const payload = {
      title: modal.title,
      description: modal.description,
      passScore: Number(modal.passScore) || 0,
      lessonId: modal.lessonId ? Number(modal.lessonId) : null,
      questions: modal.questions.map((question, index) => ({
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
      if (modal.id) await api.put(`/quizzes/${modal.id}`, payload);
      else await api.post(`/quizzes/courses/${modal.courseId}`, payload);
      toast.success(modal.id ? 'Quiz updated.' : 'Quiz created. Learners can now take it.');
      setModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the quiz.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteQuiz = async (quiz) => {
    if (!window.confirm(`Delete quiz "${quiz.title}" and all of its attempts?`)) return;
    try {
      await api.delete(`/quizzes/${quiz.id}`);
      toast.success('Quiz deleted.');
      setQuizzes((current) => current.filter((item) => item.id !== quiz.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the quiz.'));
    }
  };

  const openAttempts = async (quiz) => {
    setAttempts({ quiz, rows: [] });
    setAttemptsLoading(true);
    try {
      const { data } = await api.get(`/instructor/quizzes/${quiz.id}/attempts`);
      setAttempts({ quiz: data.quiz, rows: data.attempts || [] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load quiz attempts.'));
      setAttempts(null);
    } finally {
      setAttemptsLoading(false);
    }
  };

  const openAutoGenerate = () => {
    const defaultCourse = courseFilter !== 'all' ? courseFilter : courses[0]?.id || '';
    setAutoGenForm({
      title: '',
      details: '',
      courseId: defaultCourse ? String(defaultCourse) : '',
      lessonId: '',
      mcqCount: 5,
      subjectiveCount: 2,
      difficulty: 'intermediate',
    });
    if (defaultCourse) ensureLessons(defaultCourse);
    setAutoGenModal(true);
  };

  const handleAutoGenerate = async (autoSave = false) => {
    if (!autoGenForm.title.trim()) {
      toast.error('Please enter a title or topic for the quiz.');
      return;
    }
    if (!autoGenForm.courseId) {
      toast.error('Please choose a course for this quiz.');
      return;
    }
    setGenerating(true);
    try {
      const payload = {
        title: autoGenForm.title.trim(),
        details: (autoGenForm.details || '').trim(),
        courseId: Number(autoGenForm.courseId),
        lessonId: autoGenForm.lessonId ? Number(autoGenForm.lessonId) : null,
        mcqCount: Math.max(1, Number(autoGenForm.mcqCount) || 5),
        subjectiveCount: Math.max(0, Number(autoGenForm.subjectiveCount) || 0),
        difficulty: autoGenForm.difficulty || 'intermediate',
        autoSave,
      };

      const { data } = await api.post('/quizzes/generate', payload);

      if (autoSave && data.saved) {
        toast.success(
          `Quiz "${data.quiz.title}" automatically created & published (${payload.mcqCount} MCQs, ${payload.subjectiveCount} Subjective)!`
        );
        setAutoGenModal(false);
        await load({ silent: true });
      } else {
        // Load into editor modal for instructor review and fine-tuning
        const genQuiz = data.quiz;
        setModal({
          title: genQuiz.title,
          description: genQuiz.description || '',
          courseId: String(payload.courseId),
          lessonId: payload.lessonId ? String(payload.lessonId) : '',
          passScore: genQuiz.passScore || 65,
          questions: (genQuiz.questions || []).map((q) => ({
            question: q.question,
            type: q.type || 'mcq',
            options: Array.isArray(q.options) && q.options.length ? q.options : ['', '', '', ''],
            correctOption: q.correctOption ?? 0,
            explanation: q.explanation || '',
            points: Number(q.points) || 1,
          })),
        });
        ensureLessons(payload.courseId);
        setAutoGenModal(false);
        toast.success(
          `Quiz prepared with ${payload.mcqCount} MCQs and ${payload.subjectiveCount} Subjective questions. Review or save!`
        );
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to generate quiz automatically.'));
    } finally {
      setGenerating(false);
    }
  };

  const lessons = modal?.courseId ? lessonMap[modal.courseId] || [] : [];
  const autoGenLessons = autoGenForm.courseId ? lessonMap[autoGenForm.courseId] || [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Quizzes</h1>
          <p className="mt-1 text-sm text-slate-400">
            Build graded assessments and track how your learners perform on each attempt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={openAutoGenerate}
            disabled={courses.length === 0}
            className="border-brand-400/30 bg-brand-400/10 text-brand-300 hover:bg-brand-400/20"
          >
            <IconZap size={14} className="text-brand-300" /> Auto-generate quiz
          </Button>
          <Button size="sm" onClick={openCreate} disabled={courses.length === 0}>
            <IconPlus size={14} /> New quiz
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Quizzes</p>
          <p className="mt-1 font-display text-2xl font-semibold">{totals.quizzes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Attempts</p>
          <p className="mt-1 font-display text-2xl font-semibold">{totals.attempts}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Average score</p>
          <p className="mt-1 font-display text-2xl font-semibold">{totals.average}%</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search quizzes…"
            className="input pl-9"
            aria-label="Search quizzes"
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
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={IconZap}
          title="Create a course first"
          message="Quizzes are attached to a course. Create or publish a course, then add assessments here."
          action={
            <Button as={Link} to="/instructor/courses/new" size="sm">
              <IconPlus size={13} /> New course
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={IconZap}
          title={quizzes.length === 0 ? 'No quizzes yet' : 'No quizzes match your filters'}
          message="Create a quiz with multiple-choice questions, set a pass mark, and attach it to a lesson."
          action={
            <Button size="sm" onClick={openCreate}>
              <IconPlus size={13} /> New quiz
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((quiz) => (
            <Card key={quiz.id} className="p-4">
              <div className="flex flex-wrap items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
                  <IconZap size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">{quiz.title}</h2>
                    <Badge tone="brand">Pass {Number(quiz.pass_score)}%</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {quiz.course_title}
                    {quiz.lesson_title ? ` · ${quiz.lesson_title}` : ' · Course-wide'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {quiz.question_count} question{Number(quiz.question_count) === 1 ? '' : 's'} · {quiz.points_total} points ·{' '}
                    {quiz.attempt_count} attempt{Number(quiz.attempt_count) === 1 ? '' : 's'} ·{' '}
                    {quiz.learner_count} learner{Number(quiz.learner_count) === 1 ? '' : 's'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      Avg score {Number(quiz.avg_percent || 0)}%
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5">
                      Passed {quiz.pass_count} of {quiz.attempt_count}
                    </span>
                    <span className="text-slate-600">Created {formatDateTime(quiz.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openAttempts(quiz)}>
                    <IconUsers size={13} /> Attempts
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(quiz)} loading={loadingQuiz}>
                    <IconEdit size={13} /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteQuiz(quiz)}>
                    <IconTrash size={13} className="text-rose-300" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit quiz' : 'New quiz'}
        description="Questions are graded automatically. Learners see the explanation after submitting."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button onClick={saveQuiz} loading={saving}>
              {modal?.id ? 'Save quiz' : 'Create quiz'}
            </Button>
          </>
        }
      >
        {modal && (
          <form onSubmit={saveQuiz} className="space-y-4">
            <Input
              label="Quiz title"
              value={modal.title}
              onChange={(event) => setModal((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. Linux permissions checkpoint"
              required
            />
            <Textarea
              label="Description"
              rows={2}
              value={modal.description}
              onChange={(event) => setModal((current) => ({ ...current, description: event.target.value }))}
              placeholder="What this quiz covers…"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Pass score (%)"
                type="number"
                min="0"
                max="100"
                value={modal.passScore}
                onChange={(event) => setModal((current) => ({ ...current, passScore: event.target.value }))}
              />
              <div className="flex items-end pb-2">
                <p className="text-[11px] leading-4 text-slate-500">
                  Total: {modal.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0)} points across{' '}
                  {modal.questions.length} question{modal.questions.length === 1 ? '' : 's'}.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Questions</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!modal.title?.trim()) {
                    toast.error('Enter a quiz title first to generate questions.');
                    return;
                  }
                  setAutoGenForm({
                    title: modal.title,
                    courseId: modal.courseId || '',
                    lessonId: modal.lessonId || '',
                    mcqCount: 5,
                    subjectiveCount: 2,
                    difficulty: 'intermediate',
                  });
                  setAutoGenModal(true);
                }}
                className="text-brand-300 hover:text-brand-200"
              >
                <IconZap size={13} /> Auto-generate questions
              </Button>
            </div>

            <div className="space-y-3">
              {modal.questions.map((question, questionIndex) => (
                <div key={questionIndex} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Question {questionIndex + 1}
                    </p>
                    {modal.questions.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeQuestion(questionIndex)}>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => addOption(questionIndex)}
                      disabled={question.options.length >= 6}
                    >
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
              onClick={() =>
                setModal((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }))
              }
            >
              <IconPlus size={13} /> Add question
            </Button>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(attempts)}
        onClose={() => setAttempts(null)}
        title={attempts?.quiz?.title || 'Quiz attempts'}
        description="Most recent attempts by learners in your courses."
        size="lg"
      >
        {attemptsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : attempts?.rows?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-3 font-medium">Learner</th>
                  <th className="py-2 pr-3 font-medium">Score</th>
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {attempts.rows.map((row) => {
                  const percent = Number(row.max_points) > 0 ? Math.round((Number(row.score) / Number(row.max_points)) * 100) : 0;
                  return (
                    <tr key={row.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-slate-200">{row.full_name}</p>
                        <p className="text-[10px] text-slate-500">{row.email}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-300">
                        {Number(row.score)}/{Number(row.max_points)} ({percent}%)
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={row.passed ? 'emerald' : 'rose'}>{row.passed ? 'Passed' : 'Failed'}</Badge>
                      </td>
                      <td className="py-2.5 text-slate-500">{formatDateTime(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-400">No attempts yet.</p>
            <p className="mt-1 text-xs text-slate-500">Learners will appear here as soon as they submit this quiz.</p>
          </div>
        )}
      </Modal>

      {/* ── AUTO-GENERATE QUIZ MODAL ── */}
      <Modal
        open={autoGenModal}
        onClose={() => !generating && setAutoGenModal(false)}
        title="⚡ Auto-Generate Quiz"
        description="Just provide the topic/title and specify how many MCQs and Subjective questions you need. CyberITA+ will automatically generate and prepare the full quiz."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={generating}
              onClick={() => setAutoGenModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleAutoGenerate(false)}
              loading={generating}
              disabled={!autoGenForm.title.trim() || !autoGenForm.courseId}
            >
              Review in Builder
            </Button>
            <Button
              onClick={() => handleAutoGenerate(true)}
              loading={generating}
              disabled={!autoGenForm.title.trim() || !autoGenForm.courseId}
            >
              <IconZap size={14} /> Auto-Generate & Publish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Quiz Title or Topic"
            placeholder="e.g. SQL Injection & Prevention, Network Defense, Docker Security..."
            value={autoGenForm.title}
            onChange={(e) => setAutoGenForm((curr) => ({ ...curr, title: e.target.value }))}
            required
            autoFocus
          />

          <Textarea
            label="Topic details and scope (recommended)"
            rows={3}
            value={autoGenForm.details}
            onChange={(e) => setAutoGenForm((curr) => ({ ...curr, details: e.target.value }))}
            placeholder="What exactly should be assessed? Mention tools, scenarios and the depth you expect. Keywords pick the question blueprint."
            hint="Optional, but a specific brief produces questions that match your lesson instead of generic ones."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Assign to Course"
              value={autoGenForm.courseId}
              onChange={(e) => {
                const cid = e.target.value;
                setAutoGenForm((curr) => ({ ...curr, courseId: cid, lessonId: '' }));
                if (cid) ensureLessons(cid);
              }}
              required
            >
              <option value="">Select a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>

            <Select
              label="Attach to Lesson (Optional)"
              value={autoGenForm.lessonId}
              onChange={(e) => setAutoGenForm((curr) => ({ ...curr, lessonId: e.target.value }))}
            >
              <option value="">Course-wide Assessment</option>
              {autoGenLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lessonLabel(lesson)}
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.04] p-3.5">
            <p className="text-xs font-semibold text-brand-300">Question Distribution</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Set the exact number of objective multiple choice questions and in-depth subjective scenario questions.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium text-slate-300">
                  MCQs Count (Multiple Choice)
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={autoGenForm.mcqCount}
                  onChange={(e) =>
                    setAutoGenForm((curr) => ({
                      ...curr,
                      mcqCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                    }))
                  }
                  className="input mt-1 w-full"
                />
                <span className="text-[10px] text-slate-500">1 point each (auto-graded)</span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300">
                  Subjective / Scenario Questions
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={autoGenForm.subjectiveCount}
                  onChange={(e) =>
                    setAutoGenForm((curr) => ({
                      ...curr,
                      subjectiveCount: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="input mt-1 w-full"
                />
                <span className="text-[10px] text-slate-500">2-3 points each (in-depth scenario analysis)</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Difficulty Level"
              value={autoGenForm.difficulty}
              onChange={(e) => setAutoGenForm((curr) => ({ ...curr, difficulty: e.target.value }))}
            >
              <option value="beginner">Beginner (Foundational)</option>
              <option value="intermediate">Intermediate (Standard)</option>
              <option value="advanced">Advanced (Enterprise / Deep)</option>
            </Select>

            <div className="flex flex-col justify-end pb-1">
              <p className="text-[11px] text-slate-400">
                Total Questions: <span className="font-semibold text-white">{(Number(autoGenForm.mcqCount) || 0) + (Number(autoGenForm.subjectiveCount) || 0)}</span>
              </p>
              <p className="text-[10px] text-slate-500">
                {(Number(autoGenForm.mcqCount) || 0)} MCQs + {(Number(autoGenForm.subjectiveCount) || 0)} Subjective Cases
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
