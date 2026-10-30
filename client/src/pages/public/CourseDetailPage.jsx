import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  Tabs,
} from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconBookOpen,
  IconCheckCircle,
  IconChevronDown,
  IconClock,
  IconFileText,
  IconLayers,
  IconLock,
  IconPlay,
  IconTerminal,
  IconUsers,
  IconZap,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';
import { formatMinutes } from '../../lib/format';

function ModuleList({ modules, enrolled, slug }) {
  const [open, setOpen] = useState(() => new Set(modules.slice(0, 1).map((module) => module.id)));

  const toggle = (id) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (modules.length === 0) {
    return <Alert tone="info">The curriculum is being finalised and will be published shortly.</Alert>;
  }

  return (
    <div className="space-y-3">
      {modules.map((module, moduleIndex) => {
        const isOpen = open.has(module.id);
        return (
          <Card key={module.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(module.id)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 font-display text-xs font-semibold text-brand-300">
                {String(moduleIndex + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{module.title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                  {module.description ? ` · ${module.description}` : ''}
                </span>
              </span>
              <IconChevronDown size={17} className={`shrink-0 text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <ul className="divide-y divide-white/5 border-t border-white/5">
                {(module?.lessons || []).map((lesson) => {
                  const accessible = enrolled || lesson.is_free_preview;
                  return (
                    <li key={lesson.id}>
                      <Link
                        to={accessible ? `/learn/${slug}?lesson=${lesson.id}` : '#'}
                        onClick={(event) => !accessible && event.preventDefault()}
                        className={`flex items-center gap-3 px-5 py-3 text-sm transition ${
                          accessible ? 'text-slate-300 hover:bg-white/[0.03] hover:text-white' : 'cursor-default text-slate-500'
                        }`}
                      >
                        {accessible ? (
                          <IconPlay size={14} className="shrink-0 text-brand-400" />
                        ) : (
                          <IconLock size={14} className="shrink-0 text-slate-600" />
                        )}
                        <span className="flex-1">{lesson.title}</span>
                        {lesson.is_free_preview && !enrolled && <Badge tone="emerald">Preview</Badge>}
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <IconClock size={12} /> {lesson.duration_minutes} min
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default function CourseDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [tab, setTab] = useState('overview');

  const load = () => {
    setLoading(true);
    api
      .get(`/courses/${slug}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Course not found.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [slug]);

  const course = data?.course;
  const modules = data?.modules || [];
  const enrollment = data?.enrollment;
  const lessons = useMemo(() => modules.reduce((sum, module) => sum + module.lessons.length, 0), [modules]);
  const minutes = course?.total_minutes || Number(course?.duration_hours || 0) * 60;
  const level = DIFFICULTIES[course?.level] || DIFFICULTIES.beginner;
  const price = Number(course?.price || 0);

  const onEnroll = async () => {
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setEnrolling(true);
    try {
      await api.post(`/courses/${course.id}/enroll`);
      toast.success(`You're enrolled in ${course.title}.`);
      load();
    } catch (err) {
      const message = getErrorMessage(err);
      if (err.response?.status === 409) {
        toast.info('You are already enrolled. Opening the course.');
        navigate(`/learn/${course.slug}`);
        return;
      }
      toast.error(message);
    } finally {
      setEnrolling(false);
    }
  };

  const openCurriculum = () => {
    setTab('curriculum');
    window.requestAnimationFrame(() => {
      document.getElementById('course-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (loading) {
    return (
      <div className="container-page py-10">
        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-64 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="container-page py-20">
        <Alert tone="error" title="Course unavailable">
          {error || 'This course could not be found.'}
        </Alert>
        <Button as={Link} to="/courses" variant="secondary" className="mt-4">
          Back to catalog
        </Button>
      </div>
    );
  }

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-60" />
        <div className="container-page relative grid gap-10 py-10 lg:grid-cols-[1.55fr_1fr] lg:py-14">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{course.category}</Badge>
              <Badge tone={level.tone === 'emerald' ? 'emerald' : level.tone === 'amber' ? 'amber' : 'rose'}>{level.label}</Badge>
              {course.status !== 'published' && <Badge tone="amber">{course.status}</Badge>}
            </div>
            <h1 className="mt-4 text-balance font-display text-3xl font-semibold leading-tight sm:text-4xl">{course.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">{course.summary}</p>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <IconLayers size={15} className="text-brand-400" /> {lessons} lessons
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconClock size={15} className="text-brand-400" /> {formatMinutes(minutes)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconUsers size={15} className="text-brand-400" /> {course.enrolled_count} learners
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconTerminal size={15} className="text-brand-400" /> {data.labs.length} labs
              </span>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <Avatar name={course.instructor_name || 'CyberITA+'} src={course.instructor_avatar} />
              <div>
                <p className="text-sm font-semibold text-white">{course.instructor_name || 'CyberITA+ Faculty'}</p>
                <p className="text-xs text-slate-500">{course.instructor_headline || 'Instructor'}</p>
              </div>
            </div>

            {(modules.length > 0 || course.tags?.length > 0) && (
              <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Inside this course
                  </p>
                  {modules.length > 0 && (
                    <button
                      type="button"
                      onClick={openCurriculum}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-300 transition hover:text-brand-200"
                    >
                      View curriculum <IconArrowRight size={13} />
                    </button>
                  )}
                </div>

                {modules.length > 0 && (
                  <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {modules.slice(0, 4).map((module, index) => (
                      <div key={module.id} className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 font-display text-[11px] font-semibold text-brand-300">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-200">{module.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {modules.length > 4 && (
                  <button
                    type="button"
                    onClick={openCurriculum}
                    className="mt-3 text-xs text-slate-500 transition hover:text-brand-300"
                  >
                    +{modules.length - 4} more modules in the full curriculum
                  </button>
                )}

                {modules.length < 3 && course.tags?.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Skills</span>
                    {course.tags.slice(0, 6).map((tag) => (
                      <Badge key={tag} tone="slate">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card className="overflow-hidden">
              <div className="relative h-36 bg-gradient-to-br from-brand-500/25 via-night-800 to-accent-500/20">
                {course.cover_image && (
                  <img src={course.cover_image} alt="" className="h-full w-full object-cover opacity-80" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-night-850 via-night-850/20 to-transparent" />
                <div className="absolute bottom-4 left-5 flex items-center gap-2">
                  <span className="rounded-lg bg-night-950/80 px-2.5 py-1 text-xs font-medium text-brand-200 backdrop-blur">
                    {price > 0 ? `$${price}` : 'Free'} access
                  </span>
                  {enrollment?.status === 'completed' && (
                    <Badge tone="emerald">
                      <IconCheckCircle size={12} /> Completed
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-4 p-5">
                {enrollment ? (
                  <>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Your progress</span>
                        <span className="font-semibold text-brand-300">{Math.round(Number(enrollment.progress_percent))}%</span>
                      </div>
                      <ProgressBar value={Number(enrollment.progress_percent)} />
                    </div>
                    <Button as={Link} to={`/learn/${course.slug}`} size="lg" className="w-full">
                      <IconPlay size={16} /> Continue learning
                    </Button>
                    {data.certificate && (
                      <Button as={Link} to="/student/certificates" variant="secondary" className="w-full">
                        <IconAward size={16} /> View certificate
                      </Button>
                    )}
                  </>
                ) : (
                  <Button onClick={onEnroll} loading={enrolling} size="lg" className="w-full">
                    Enroll now <IconArrowRight size={16} />
                  </Button>
                )}
                <p className="text-center text-[11px] text-slate-500">
                  {user ? 'Instant access · learn at your own pace' : 'Sign in to enroll · free account'}
                </p>

                <div className="space-y-2.5 border-t border-white/10 pt-4 text-sm">
                  {[
                    [IconBookOpen, `${lessons} focused lessons`],
                    [IconTerminal, `${data.labs.length} browser-based labs`],
                    [IconFileText, 'Auto-generated practical report'],
                    [IconAward, 'Certificate on completion'],
                    [IconZap, 'Instant quiz grading'],
                  ].map(([IconComponent, label]) => (
                    <div key={label} className="flex items-center gap-2.5 text-slate-300">
                      <IconComponent size={15} className="shrink-0 text-brand-400" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section id="course-tabs" className="container-page scroll-mt-24 py-10 lg:py-14">
        <Tabs
          value={tab}
          onChange={setTab}
          className="max-w-2xl"
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'curriculum', label: 'Curriculum', count: lessons },
            { id: 'labs', label: 'Labs', count: data.labs.length },
            ...(data.quizzes.length ? [{ id: 'quizzes', label: 'Quizzes', count: data.quizzes.length }] : []),
          ]}
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.55fr_1fr]">
          <div>
            {tab === 'overview' && (
              <div className="space-y-8">
                <Card className="p-6">
                  <h2 className="text-lg font-semibold">About this course</h2>
                  <Markdown className="mt-4">{course.description || course.summary}</Markdown>
                  {course.tags?.length > 0 && (
                    <div className="mt-6 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                      {(course?.tags || []).map((tag) => (
                        <Badge key={tag} tone="slate">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-6">
                  <h2 className="text-lg font-semibold">What you'll cover</h2>
                  <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                    {modules.map((module) => (
                      <li key={module.id} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <IconCheckCircle size={15} className="mt-0.5 shrink-0 text-brand-400" />
                        {module.title}
                      </li>
                    ))}
                  </ul>
                </Card>

                {course.instructor_bio && (
                  <Card className="p-6">
                    <h2 className="text-lg font-semibold">Your instructor</h2>
                    <div className="mt-4 flex items-start gap-4">
                      <Avatar name={course.instructor_name} src={course.instructor_avatar} size="lg" />
                      <div>
                        <p className="font-semibold text-white">{course.instructor_name}</p>
                        <p className="text-xs text-brand-300">{course.instructor_headline || 'CyberITA+ Instructor'}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{course.instructor_bio}</p>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {tab === 'curriculum' && <ModuleList modules={modules} enrolled={Boolean(enrollment)} slug={course.slug} />}

            {tab === 'labs' && (
              <div className="space-y-3">
                {data.labs.length === 0 ? (
                  <Alert tone="info">No standalone labs are attached to this course yet.</Alert>
                ) : (
                  (data?.labs || []).map((lab) => (
                    <Card key={lab.id} className="flex flex-wrap items-center gap-4 p-5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
                        <IconTerminal size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{lab.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {DIFFICULTIES[lab.difficulty]?.label || lab.difficulty} · {lab.estimated_minutes} min
                        </p>
                      </div>
                      <Button as={Link} to={enrollment ? `/labs/${lab.id}` : '/login'} variant="secondary" size="sm">
                        {enrollment ? 'Open lab' : 'Sign in'} <IconArrowRight size={14} />
                      </Button>
                    </Card>
                  ))
                )}
              </div>
            )}

            {tab === 'quizzes' && (
              <div className="space-y-3">
                {(data?.quizzes || []).map((quiz) => (
                  <Card key={quiz.id} className="flex flex-wrap items-center gap-4 p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-400/10 text-accent-300">
                      <IconZap size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{quiz.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {quiz.question_count} questions · pass at {Math.round(Number(quiz.pass_score))}%
                      </p>
                    </div>
                    <Button as={Link} to={enrollment ? `/learn/quizzes/${quiz.id}` : '/login'} variant="secondary" size="sm">
                      {enrollment ? 'Start quiz' : 'Sign in'} <IconArrowRight size={14} />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <Card className="p-5 text-center">
              <p className="text-xs uppercase tracking-wider text-slate-500">Course level</p>
              <p className="mt-1 font-display text-lg font-semibold text-white">{level.label}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {course.level === 'beginner'
                  ? 'No prior experience required. Start from the fundamentals.'
                  : course.level === 'intermediate'
                    ? 'Builds on core Linux and networking basics.'
                    : 'For practitioners ready to go deeper into production scenarios.'}
              </p>
            </Card>
            {data.quizzes.length > 0 && (
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assessments</p>
                <ul className="mt-3 space-y-2">
                  {(data?.quizzes || []).map((quiz) => (
                    <li key={quiz.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-300">{quiz.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {quiz.question_count} Q · {Math.round(Number(quiz.pass_score))}% to pass
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Need guidance?</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Not sure if this course fits your goals? Ask us and we'll point you to the right learning path.
              </p>
              <Button as={Link} to="/contact" variant="outline" size="sm" className="mt-3 w-full">
                Contact the team
              </Button>
            </Card>
          </aside>
        </div>
      </section>
    </div>
  );
}
