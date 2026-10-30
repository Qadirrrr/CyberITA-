import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Skeleton,
} from '../../components/ui';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBookOpen,
  IconCheck,
  IconCheckCircle,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFileText,
  IconLayers,
  IconPlay,
  IconTerminal,
  IconZap,
} from '../../components/icons';
import { DIFFICULTIES, ENROLLMENT_STATUS } from '../../lib/constants';

export default function LearnPage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [courseData, setCourseData] = useState(null);
  const [progress, setProgress] = useState([]);
  const [lessonData, setLessonData] = useState(null);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [error, setError] = useState('');
  const [lessonError, setLessonError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [certificate, setCertificate] = useState(null);
  const [enrolling, setEnrolling] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const startedAt = useRef(Date.now());

  const course = courseData?.course;
  const modules = courseData?.modules || [];
  const enrollment = courseData?.enrollment;
  const canPreview = user?.role === 'instructor' || user?.role === 'admin';
  const queryLesson = searchParams.get('lesson');

  const allLessons = useMemo(
    () => modules.flatMap((module) => (module?.lessons || []).map((lesson) => ({ ...lesson, moduleTitle: module.title }))),
    [modules]
  );

  const progressByLesson = useMemo(() => {
    const map = new Map();
    for (const item of progress) map.set(item.lesson_id ?? item.id, item);
    return map;
  }, [progress]);

  const activeLessonId = Number(queryLesson) || allLessons[0]?.id || null;
  const lesson = lessonData?.lesson;
  const lessonIndex = allLessons.findIndex((item) => item.id === lesson?.id);
  const prevLesson = lessonIndex > 0 ? allLessons[lessonIndex - 1] : null;
  const nextLesson = lessonIndex >= 0 && lessonIndex < allLessons.length - 1 ? allLessons[lessonIndex + 1] : null;
  const currentProgress = lesson ? progressByLesson.get(lesson.id) : null;
  const isCompleted = currentProgress?.status === 'completed';

  useEffect(() => {
    let active = true;
    setLoadingCourse(true);
    setError('');
    api
      .get(`/courses/${slug}`)
      .then((res) => {
        if (!active) return;
        setCourseData(res.data);
        if (res.data.enrollment) {
          return api.get(`/courses/${res.data.course.id}/progress`).then((progressRes) => {
            if (active) setProgress(progressRes.data.lessons);
          });
        }
        return null;
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load this course.')))
      .finally(() => active && setLoadingCourse(false));
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!courseData || !allLessons.length) return;
    if (!queryLesson) {
      const nextIncomplete = allLessons.find((item) => progressByLesson.get(item.id)?.status !== 'completed');
      const target = nextIncomplete || allLessons[0];
      setSearchParams({ lesson: String(target.id) }, { replace: true });
    }
  }, [courseData, allLessons, queryLesson, progressByLesson, setSearchParams]);

  useEffect(() => {
    if ((!enrollment && !canPreview) || !activeLessonId) return undefined;
    let active = true;
    setLoadingLesson(true);
    setLessonError('');
    setLessonData(null);
    startedAt.current = Date.now();
    api
      .get(`/courses/lessons/${activeLessonId}`)
      .then((res) => {
        if (!active) return;
        setLessonData(res.data);
        setProgress(res.data.progress);
      })
      .catch((err) => active && setLessonError(getErrorMessage(err, 'Unable to open this lesson.')))
      .finally(() => active && setLoadingLesson(false));
    return () => {
      active = false;
    };
  }, [activeLessonId, enrollment, canPreview]);

  const enroll = async () => {
    setEnrolling(true);
    try {
      await api.post(`/courses/${course.id}/enroll`);
      toast.success('Enrollment confirmed. Your first lesson is ready.');
      const res = await api.get(`/courses/${slug}`);
      setCourseData(res.data);
      const progressRes = await api.get(`/courses/${res.data.course.id}/progress`);
      setProgress(progressRes.data.lessons);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setEnrolling(false);
    }
  };

  const openLesson = (id) => {
    setSearchParams({ lesson: String(id) });
    setOutlineOpen(false);
  };

  const markComplete = async () => {
    if (!lesson || !enrollment) return;
    setCompleting(true);
    try {
      const seconds = Math.min(Math.round((Date.now() - startedAt.current) / 1000), 36000);
      const { data } = await api.post(`/lessons/${lesson.id}/progress`, { completed: true, timeSpentSeconds: seconds });
      setProgress((current) => {
        const next = current.filter((item) => item.id !== lesson.id);
        return [...next, { lesson_id: lesson.id, status: 'completed', completed_at: new Date().toISOString() }];
      });
      setCourseData((current) =>
        current?.enrollment
          ? { ...current, enrollment: { ...current.enrollment, progress_percent: data.percent } }
          : current
      );
      if (data.certificate) {
        setCertificate(data.certificate);
        toast.success('Course complete. Your certificate has been issued!');
      } else {
        toast.success('Lesson marked as complete.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save your progress.'));
    } finally {
      setCompleting(false);
    }
  };

  const progressPercent = Math.round(Number(courseData?.enrollment?.progress_percent || 0));
  const completedCount = progress.filter((item) => item.status === 'completed').length;

  if (loadingCourse) {
    return (
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-[520px]" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div>
        <Alert tone="error" title="Course unavailable">
          {error || 'This course could not be found.'}
        </Alert>
        <Button as={Link} to="/student/courses" variant="secondary" className="mt-4">
          <IconArrowLeft size={15} /> My courses
        </Button>
      </div>
    );
  }

  if (!enrollment && user?.role !== 'instructor') {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-400/10 text-brand-300">
          <IconBookOpen size={26} />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold">{course.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Enroll to unlock {allLessons.length} lessons, {courseData.labs?.length || 0} labs and your certificate.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={enroll} loading={enrolling}>
            Enroll now <IconArrowRight size={16} />
          </Button>
          <Button as={Link} to={`/courses/${course.slug}`} variant="secondary">
            Course details
          </Button>
        </div>
      </Card>
    );
  }

  const level = DIFFICULTIES[course.level] || DIFFICULTIES.beginner;
  const status = enrollment
    ? ENROLLMENT_STATUS[enrollment.status] || ENROLLMENT_STATUS.active
    : { label: 'Preview', tone: 'slate' };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link to="/student/courses" className="transition hover:text-brand-300">
            My courses
          </Link>
          <IconChevronRight size={12} />
          <Link to={`/courses/${course.slug}`} className="max-w-[220px] truncate transition hover:text-brand-300">
            {course.title}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={enrollment?.status === 'completed' ? 'emerald' : 'brand'}>{status.label}</Badge>
          <Badge tone="slate">{level.label}</Badge>
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setOutlineOpen((value) => !value)}>
            <IconLayers size={14} /> Outline
          </Button>
        </div>
      </div>

      {certificate && (
        <Alert tone="success" title="Course complete: certificate issued">
          Your certificate serial is <span className="font-mono text-white">{certificate.serial}</span>.{' '}
          <Link to="/student/certificates" className="font-medium text-emerald-200 underline underline-offset-4">
            View and share it
          </Link>
          .
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className={`${outlineOpen ? 'block' : 'hidden'} lg:block`}>
          <Card className="overflow-hidden lg:sticky lg:top-24">
            <div className="border-b border-white/10 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Course progress</p>
              <p className="mt-1 line-clamp-2 font-display text-sm font-semibold text-white">{course.title}</p>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  {completedCount}/{allLessons.length} lessons
                </span>
                <span className="font-semibold text-brand-300">{progressPercent}%</span>
              </div>
              <ProgressBar value={progressPercent} size="sm" className="mt-1.5" tone={progressPercent >= 100 ? 'emerald' : 'brand'} />
            </div>

            <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-2">
              {modules.map((module) => (
                <div key={module.id} className="mb-2">
                  <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{module.title}</p>
                  <ul className="space-y-0.5">
                    {(module?.lessons || []).map((item) => {
                      const itemProgress = progressByLesson.get(item.id);
                      const done = itemProgress?.status === 'completed';
                      const isCurrent = item.id === activeLessonId;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => openLesson(item.id)}
                            className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                              isCurrent
                                ? 'bg-brand-400/10 text-brand-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.15)]'
                                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                            }`}
                          >
                            <span className="mt-0.5 shrink-0">
                              {done ? (
                                <IconCheckCircle size={15} className="text-emerald-400" />
                              ) : isCurrent ? (
                                <IconPlay size={14} className="text-brand-300" />
                              ) : (
                                <span className="block h-3.5 w-3.5 rounded-full border border-slate-600" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block leading-5">{item.title}</span>
                              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-600">
                                <IconClock size={10} /> {item.duration_minutes} min
                                {item.lesson_type === 'lab' && (
                                  <>
                                    <span>·</span>
                                    <IconTerminal size={10} /> lab
                                  </>
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 p-3">
              <Button as={Link} to="/student/labs" variant="ghost" size="sm" className="w-full justify-start">
                <IconTerminal size={15} /> Practical labs
              </Button>
            </div>
          </Card>
        </aside>

        <div className="min-w-0">
          {loadingLesson ? (
            <Card className="space-y-4 p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-40 w-full" />
            </Card>
          ) : lessonError ? (
            <Alert tone="error" title="Lesson unavailable">
              {lessonError}
            </Alert>
          ) : lesson ? (
            <div className="space-y-5">
              <Card className="overflow-hidden">
                <div className="border-b border-white/10 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="slate">{lessonData.modules.find((m) => m.id === lesson.module_id)?.title || 'Lesson'}</Badge>
                    <Badge tone="brand" className="capitalize">
                      {lesson.lesson_type}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <IconClock size={12} /> {lesson.duration_minutes} min
                    </span>
                    {isCompleted && (
                      <Badge tone="emerald">
                        <IconCheck size={11} /> Completed
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-3 font-display text-2xl font-semibold leading-tight sm:text-3xl">{lesson.title}</h1>
                </div>

                <div className="p-5 sm:p-6">
                  {lesson.video_url && (
                    <div className="mb-6 aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
                      <iframe
                        src={lesson.video_url}
                        title={lesson.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="h-full w-full"
                      />
                    </div>
                  )}
                  {lesson.content ? (
                    <Markdown>{lesson.content}</Markdown>
                  ) : (
                    <p className="text-sm text-slate-500">This lesson has no written content yet. Continue to the next lesson.</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-night-900/40 p-4 sm:px-6">
                  <div className="flex gap-2">
                    {prevLesson ? (
                      <Button variant="secondary" size="sm" onClick={() => openLesson(prevLesson.id)}>
                        <IconChevronLeft size={15} /> Previous
                      </Button>
                    ) : (
                      <span />
                    )}
                    {nextLesson && (
                      <Button variant="ghost" size="sm" onClick={() => openLesson(nextLesson.id)}>
                        Next <IconChevronRight size={15} />
                      </Button>
                    )}
                  </div>
                  {enrollment && (
                    <Button
                      onClick={markComplete}
                      loading={completing}
                      disabled={isCompleted}
                      variant={isCompleted ? 'secondary' : 'primary'}
                      size="sm"
                    >
                      <IconCheckCircle size={15} /> {isCompleted ? 'Lesson completed' : 'Mark as complete'}
                    </Button>
                  )}
                </div>
              </Card>

              {(lessonData.labs.length > 0 || lessonData.quizzes.length > 0 || lessonData.assignments.length > 0) && (
                <Card className="p-5">
                  <div className="flex items-center gap-2">
                    <IconZap size={17} className="text-brand-400" />
                    <h2 className="font-display text-base font-semibold">Practise this lesson</h2>
                  </div>
                  <div className="mt-4 space-y-2.5">
                    {(lessonData?.labs || []).map((lab) => (
                      <div key={lab.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                          <IconTerminal size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{lab.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {DIFFICULTIES[lab.difficulty]?.label || lab.difficulty} · {lab.estimated_minutes} min · verified steps
                          </p>
                        </div>
                        <Button as={Link} to={`/labs/${lab.id}`} size="sm" variant="secondary">
                          Open lab <IconArrowRight size={14} />
                        </Button>
                      </div>
                    ))}
                    {(lessonData?.quizzes || []).map((quiz) => (
                      <div key={quiz.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-400/10 text-accent-300">
                          <IconZap size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{quiz.title}</p>
                          <p className="text-[11px] text-slate-500">
                            Pass at {Math.round(Number(quiz.pass_score))}%
                            {quiz.best_score != null ? ` · best ${quiz.best_score}` : ''}
                            {quiz.has_passed ? ' · passed' : ''}
                          </p>
                        </div>
                        <Button as={Link} to={`/learn/quizzes/${quiz.id}`} size="sm" variant="secondary">
                          {quiz.has_passed ? 'Retake' : 'Start'} <IconArrowRight size={14} />
                        </Button>
                      </div>
                    ))}
                    {(lessonData?.assignments || []).map((assignment) => (
                      <div key={assignment.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                          <IconFileText size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{assignment.title}</p>
                          <p className="text-[11px] capitalize text-slate-500">
                            {assignment.points} points
                            {assignment.submission_status ? ` · ${assignment.submission_status}` : ' · not submitted'}
                            {assignment.grade != null ? ` · ${assignment.grade} pts` : ''}
                          </p>
                        </div>
                        <Button as={Link} to={`/learn/assignments/${assignment.id}`} size="sm" variant="secondary">
                          Open <IconArrowRight size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {lessonData.labs.length > 0 && (
                <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-sm font-semibold text-white">Document your lab work</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Complete a lab, then generate a practical report for instructor review.
                    </p>
                  </div>
                  <Button as={Link} to="/student/reports" variant="secondary" size="sm">
                    <IconFileText size={14} /> My reports
                  </Button>
                </Card>
              )}

              {nextLesson && (
                <div className="flex justify-end">
                  <Button onClick={() => openLesson(nextLesson.id)} variant="ghost">
                    Next: {nextLesson.title} <IconArrowRight size={15} />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={IconBookOpen}
              title="Select a lesson"
              message="Choose a lesson from the outline to begin."
              action={<Button onClick={() => allLessons[0] && openLesson(allLessons[0].id)}>Start first lesson</Button>}
            />
          )}
        </div>
      </div>
    </div>
  );
}
