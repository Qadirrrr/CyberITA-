import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth, dashboardPath } from '../../context/AuthContext';
import CourseCard from '../../components/CourseCard';
import { Badge, Button, Card, SectionHeading, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconBookOpen,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconFileText,
  IconLayers,
  IconShield,
  IconTerminal,
  IconUsers,
  IconZap,
} from '../../components/icons';
import { formatDate } from '../../lib/format';

const features = [
  {
    icon: IconTerminal,
    title: 'Browser-based Linux labs',
    body: 'Work inside a real isolated Linux container with full root access — install packages and run any tool you need.',
  },
  {
    icon: IconFileText,
    title: 'Verified practical reports',
    body: 'Each lab generates a structured report from your real commands and screenshots, reviewed by an instructor.',
  },
  {
    icon: IconAward,
    title: 'Certificates that verify',
    body: 'Finish a course and receive a serial-numbered certificate with a public verification page for employers.',
  },
  {
    icon: IconZap,
    title: 'Feedback that lands',
    body: 'Lab assignments are reviewed by instructors with focused, actionable feedback on your practical work.',
  },
];

const steps = [
  { title: 'Pick your track', body: 'Start with a course or follow a structured learning path from fundamentals to job-ready skills.' },
  { title: 'Learn by doing', body: 'Read concise lessons, then prove it in a live browser terminal with automatic step verification.' },
  { title: 'Document & publish', body: 'Generate a practical report from your verified work. Approved reports can be published to the blog.' },
  { title: 'Earn recognition', body: 'Complete every lesson to unlock a verifiable certificate and share it with employers.' },
];

export default function HomePage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [paths, setPaths] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/courses', { params: { limit: 3, sort: 'popular' } }),
      api.get('/learning-paths'),
      api.get('/posts', { params: { limit: 3 } }),
    ])
      .then(([courseRes, pathRes, postRes]) => {
        if (!active) return;
        const courses = Array.isArray(courseRes.data?.courses) ? courseRes.data.courses : [];
        const paths = Array.isArray(pathRes.data?.paths) ? pathRes.data.paths : [];
        const posts = Array.isArray(postRes.data?.posts) ? postRes.data.posts : [];
        setCourses(courses);
        setPaths(paths.slice(0, 2));
        setPosts(posts);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-slate-200 bg-white dark:border-white/5 dark:bg-transparent">
        <div className="pointer-events-none absolute inset-0 hidden dark:block bg-hero-glow" />
        <div className="pointer-events-none absolute inset-0 hidden dark:block bg-grid-fade opacity-60" />
        <div className="container-page relative grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm dark:border-brand-400/25 dark:bg-brand-400/10 dark:text-brand-200">
              <IconShield size={14} className="text-brand-600 dark:text-brand-400" /> Enterprise Practical IT & Cybersecurity Labs
            </div>
            <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-[1.08] text-slate-900 dark:text-white sm:text-5xl xl:text-6xl">
              Learn IT by doing it
              <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-accent-600 bg-clip-text text-transparent dark:from-brand-300 dark:via-brand-400 dark:to-accent-400">
                {' '}
                in a real terminal.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-400">
              CyberITA+ pairs focused lessons with sandboxed Linux labs, automatic command verification and
              instructor-reviewed practical reports, so you graduate with proof of skill, not just a completion badge.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <Button as={Link} to={dashboardPath(user.role)} size="lg">
                  Continue learning <IconArrowRight size={17} />
                </Button>
              ) : (
                <Button as={Link} to="/register" size="lg">
                  Start learning free <IconArrowRight size={17} />
                </Button>
              )}
              <Button as={Link} to="/courses" variant="secondary" size="lg">
                Browse courses
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              {['No credit card required', 'Browser-based labs', 'Verified certificates'].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <IconCheckCircle size={15} className="text-brand-600 dark:text-brand-400" /> {item}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-fade-up [animation-delay:120ms]">
            <div className="relative mx-auto max-w-lg">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-500/15 via-transparent to-accent-500/15 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
                <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/90 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-2 font-mono text-xs text-slate-400">student@cyberita-lab: ~</span>
                  <Badge tone="emerald" dot="animate-pulse" className="ml-auto !bg-emerald-500/20 !text-emerald-300 !border-emerald-500/30">
                    Live
                  </Badge>
                </div>
                <div className="space-y-2.5 p-5 font-mono text-[12.5px] leading-6">
                  <p className="text-slate-500"># Lab 02 · Users, groups and permissions</p>
                  <p>
                    <span className="text-emerald-400">student@lab</span>
                    <span className="text-slate-500">:</span>
                    <span className="text-sky-300">~</span>
                    <span className="text-slate-400">$ </span>
                    <span className="text-slate-100">sudo useradd -m analyst</span>
                  </p>
                  <p className="text-slate-400">[sudo] password for student: ********</p>
                  <p className="flex items-center gap-2 text-emerald-300">
                    <IconCheck size={13} /> Step verified: user account created
                  </p>
                  <p>
                    <span className="text-emerald-400">student@lab</span>
                    <span className="text-slate-500">:</span>
                    <span className="text-sky-300">~</span>
                    <span className="text-slate-400">$ </span>
                    <span className="text-slate-100">id analyst</span>
                  </p>
                  <p className="text-slate-300">uid=1001(analyst) gid=1001(analyst) groups=1001(analyst)</p>
                  <p>
                    <span className="text-emerald-400">student@lab</span>
                    <span className="text-slate-500">:</span>
                    <span className="text-sky-300">~</span>
                    <span className="text-slate-400">$ </span>
                    <span className="inline-block h-4 w-2 animate-blink bg-brand-300 align-middle" />
                  </p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/10 bg-night-900/50 text-center">
                  {[
                    ['2 / 4', 'steps verified'],
                    ['50%', 'progress'],
                    ['12 min', 'elapsed'],
                  ].map(([value, label]) => (
                    <div key={label} className="px-3 py-3">
                      <p className="font-display text-sm font-semibold text-white">{value}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200/80 bg-slate-50/70 dark:border-white/5 dark:bg-night-900/30">
        <div className="container-page grid grid-cols-2 gap-6 py-8 sm:grid-cols-4">
          {[
            [IconBookOpen, 'Structured courses', 'From Linux basics to cloud operations'],
            [IconTerminal, 'Real terminal labs', 'Verified command by command'],
            [IconFileText, 'Practical reports', 'Instructor-reviewed documentation'],
            [IconAward, 'Verifiable certificates', 'Serial numbers you can share'],
          ].map(([IconComponent, title, body]) => (
            <div key={title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-400/10 dark:text-brand-300">
                <IconComponent size={19} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-400">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-16 lg:py-20">
        <SectionHeading
          eyebrow="Why CyberITA+"
          title="Skills you can demonstrate, not just describe"
          description="Every part of the platform is built around evidence of practical ability, the thing employers actually ask for."
          action={
            <Button as={Link} to="/about" variant="ghost" size="sm">
              Our approach <IconArrowRight size={15} />
            </Button>
          }
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const IconComponent = feature.icon;
            return (
              <Card key={feature.title} className="group p-6 transition hover:border-slate-300 hover:shadow-md dark:hover:border-brand-400/25">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-slate-200 dark:bg-gradient-to-br dark:from-brand-400/20 dark:to-accent-500/10 dark:text-brand-300 dark:ring-white/5">
                  <IconComponent size={21} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{feature.body}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-slate-50/70 dark:border-white/5 dark:bg-night-900/30">
        <div className="container-page py-16 lg:py-20">
          <SectionHeading
            eyebrow="Popular right now"
            title="Start with a course learners love"
            description="Practical, focused and continuously updated. Every course includes labs you can run immediately."
            action={
              <Button as={Link} to="/courses" variant="secondary" size="sm">
                All courses <IconArrowRight size={15} />
              </Button>
            }
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} className="overflow-hidden">
                    <Skeleton className="h-44 rounded-none" />
                    <div className="space-y-3 p-5">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </Card>
                ))
              : courses.map((course) => <CourseCard key={course.id} course={course} />)}
          </div>
        </div>
      </section>

      <section className="container-page py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHeading
              eyebrow="How it works"
              title="From first command to verified certificate"
              description="A clear, repeatable loop designed to build confidence and a portfolio of real work."
            />
            <div className="mt-8 space-y-6">
              {steps.map((step, index) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-400/30 bg-brand-400/10 font-display text-sm font-semibold text-brand-700 dark:text-brand-300">
                      {index + 1}
                    </span>
                    {index < steps.length - 1 && <span className="mt-2 h-full w-px bg-gradient-to-b from-brand-400/30 to-transparent" />}
                  </div>
                  <div className="pb-2">
                    <h3 className="text-base font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <SectionHeading eyebrow="Learning paths" title="Follow a guided route" />
            {paths.map((path) => (
              <Link key={path.id} to={`/learning-paths/${path.slug}`} className="card card-hover block p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">{path.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{path.description}</p>
                  </div>
                  <IconArrowRight size={18} className="shrink-0 text-brand-400" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <Badge tone="brand" className="capitalize">
                    {path.level}
                  </Badge>
                  <span className="inline-flex items-center gap-1.5">
                    <IconLayers size={14} /> {path.courses?.length || 0} courses
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <IconClock size={14} /> {path.courses?.reduce((sum, course) => sum + Number(course.duration_hours || 0), 0)} hours
                  </span>
                </div>
                {Array.isArray(path.courses) && path.courses.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                    {path.courses.slice(0, 3).map((course) => (
                      <span key={course.id} className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-slate-400">
                        {course.title}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
            {!loading && paths.length === 0 && (
              <Card className="p-6 text-sm text-slate-400">Learning paths are being prepared. Browse individual courses in the meantime.</Card>
            )}
            <Card className="border-brand-400/20 bg-gradient-to-br from-brand-400/[0.07] to-transparent p-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                <IconShield size={15} /> Career-ready evidence
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Graduate reports are published as technical articles, a public portfolio that shows exactly how you work.
              </p>
              <Button as={Link} to="/blog" variant="outline" size="sm" className="mt-4">
                Read learner reports <IconArrowRight size={14} />
              </Button>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-night-900/30">
        <div className="container-page py-16 lg:py-20">
          <SectionHeading
            eyebrow="From the blog"
            title="Practical write-ups from the lab"
            description="Approved student reports, instructor guides and walkthroughs, all grounded in real executed commands."
            action={
              <Button as={Link} to="/blog" variant="ghost" size="sm">
                All articles <IconArrowRight size={15} />
              </Button>
            }
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} to={`/blog/${post.slug}`} className="card card-hover group flex flex-col p-6">
                <div className="flex flex-wrap gap-2">
                  {(post.tags || []).slice(0, 2).map((tag) => (
                    <Badge key={tag} tone="slate">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <h3 className="mt-3 line-clamp-2 font-display text-lg font-semibold leading-snug text-white group-hover:text-brand-200">
                  {post.title}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-400">{post.excerpt}</p>
                <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <IconUsers size={13} /> {post.author_name || 'CyberITA+'}
                  </span>
                  <span>{formatDate(post.published_at)}</span>
                </div>
              </Link>
            ))}
            {!loading && posts.length === 0 && (
              <Card className="p-6 text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
                No published articles yet. Approved lab reports will appear here.
              </Card>
            )}
          </div>
        </div>
      </section>

      <section className="container-page py-16 lg:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-brand-400/20 bg-gradient-to-br from-brand-500/[0.12] via-night-900 to-accent-500/[0.12] px-6 py-12 text-center sm:px-12 lg:py-16">
          <div className="pointer-events-none absolute inset-0 bg-noise opacity-40" />
          <div className="relative mx-auto max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700 shadow-sm dark:border-brand-400/30 dark:bg-brand-400/10 dark:text-brand-300">
              <IconAward size={14} /> Industry-Standard Skill Verification
            </div>
            <h2 className="text-balance font-display text-3xl font-semibold sm:text-4xl">
              Build the skills. Show the evidence. Get certified.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              Join learners who document real terminal work, earn instructor-reviewed reports and carry verifiable
              certificates into interviews.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button as={Link} to={user ? dashboardPath(user.role) : '/register'} size="lg">
                {user ? 'Go to dashboard' : 'Create your free account'} <IconArrowRight size={17} />
              </Button>
              <Button as={Link} to="/contact" variant="secondary" size="lg">
                Talk to us
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
