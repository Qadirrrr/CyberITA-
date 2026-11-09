import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth, dashboardPath } from '../../context/AuthContext';
import CourseCard from '../../components/CourseCard';
import Reveal from '../../components/Reveal';
import { Badge, Button, Card, SectionHeading, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconCloud,
  IconCode,
  IconCpu,
  IconFileText,
  IconGlobe,
  IconLayers,
  IconLock,
  IconNetwork,
  IconRefresh,
  IconServer,
  IconShield,
  IconTarget,
  IconTerminal,
  IconUsers,
  IconZap,
} from '../../components/icons';
import { formatDate } from '../../lib/format';

const categoryShowcase = [
  { name: 'Cybersecurity', icon: IconShield, hint: 'CEH · CISSP · Penetration Testing · SIEM' },
  { name: 'Networking', icon: IconNetwork, hint: 'CCNA · CCNP · HCIA-Datacom · HCIP-Datacom' },
  { name: 'DevOps', icon: IconRefresh, hint: 'Docker · Kubernetes · Terraform · CI/CD' },
  { name: 'Linux', icon: IconTerminal, hint: 'RHCSA · RHCE · Kali Linux · OpenShift' },
  { name: 'System Administration', icon: IconServer, hint: 'Windows Server · Active Directory · PowerShell' },
  { name: 'Cloud Computing', icon: IconCloud, hint: 'AWS · Microsoft Azure · Google Cloud' },
  { name: 'Digital Marketing', icon: IconTarget, hint: 'SEO · Social Media · Google Ads' },
  { name: 'Programming', icon: IconCode, hint: 'Python · Java · Front-end · Back-end' },
  { name: 'Designing', icon: IconLayers, hint: 'Graphics Designing · Video Editing' },
];

const platformPillars = [
  {
    icon: IconGlobe,
    title: 'Browser terminal',
    body: 'xterm.js streams a real Linux PTY over WebSocket — no installs, no local VMs.',
  },
  {
    icon: IconServer,
    title: 'Application server',
    body: 'Node.js + Express API with PostgreSQL, role-based access and session control.',
  },
  {
    icon: IconCpu,
    title: 'Scheduler & capacity',
    body: 'New sessions are balanced atomically across healthy lab servers with live CPU, RAM and heartbeat checks.',
  },
  {
    icon: IconTerminal,
    title: 'Remote lab agents',
    body: 'Authenticated agents on AWS EC2 run isolated Docker containers, ten concurrent sessions per server.',
  },
];

const techStack = ['React', 'Node.js', 'PostgreSQL', 'Docker', 'WebSocket', 'AES-256'];

const trustBadges = [
  { icon: IconShield, label: 'AES-256 encrypted', detail: 'Credentials encrypted at rest' },
  { icon: IconLock, label: 'Isolated sandboxes', detail: 'One container per learner' },
  { icon: IconAward, label: 'Verifiable certificates', detail: 'Public serial-number lookup' },
  { icon: IconServer, label: 'Monitored servers', detail: 'Live CPU, RAM & heartbeat' },
  { icon: IconUsers, label: 'Role-based access', detail: 'Student · Instructor · Admin' },
  { icon: IconCheckCircle, label: 'Auto-verified labs', detail: 'Every command checked live' },
];

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
      <section className="relative bg-white dark:bg-night-950">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 relative grid items-center gap-14 pt-8 pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-12 lg:pb-24">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700 shadow-sm dark:border-brand-400/30 dark:bg-brand-400/10 dark:text-brand-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              Enterprise Practical IT &amp; Cybersecurity Labs
            </div>
            <h1 className="mt-5 text-balance font-display text-4xl font-bold leading-[1.05] text-slate-900 dark:text-white sm:text-5xl xl:text-6xl">
              Learn IT by doing it{' '}
              <span className="mt-1 block text-brand-600 dark:text-brand-400">
                in a real terminal.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-400">
              CyberITA+ pairs focused lessons with sandboxed Linux labs, automatic command verification and
              instructor-reviewed practical reports, so you graduate with proof of skill, not just a completion badge.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <Button
                  as={Link}
                  to={dashboardPath(user.role)}
                  size="lg"
                  className="shadow-lg shadow-brand-500/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-500/30"
                >
                  Continue learning <IconArrowRight size={17} />
                </Button>
              ) : (
                <Button
                  as={Link}
                  to="/register"
                  size="lg"
                  className="shadow-lg shadow-brand-500/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-500/30"
                >
                  Start learning free <IconArrowRight size={17} />
                </Button>
              )}
              <Button
                as={Link}
                to="/courses"
                variant="secondary"
                size="lg"
                className="backdrop-blur transition hover:-translate-y-0.5"
              >
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

            <div className="mt-8 grid max-w-md grid-cols-3 gap-3 border-t border-slate-200 pt-6 dark:border-white/5">
              {[
                ['10', 'labs per server'],
                ['100%', 'browser-based'],
                ['AES-256', 'agent security'],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-fade-up [animation-delay:140ms]">
            <div className="relative mx-auto max-w-lg">
              {/* Floating status chips */}
              <div className="absolute -left-4 top-16 z-20 hidden animate-float sm:block">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-white/90 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-lg backdrop-blur dark:bg-night-900/90 dark:text-emerald-300">
                  <IconCheckCircle size={14} /> Auto-verified
                </div>
              </div>
              <div className="absolute -right-5 top-40 z-20 hidden animate-float-slow sm:block">
                <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-white/90 px-3 py-2 text-xs font-semibold text-brand-700 shadow-lg backdrop-blur dark:bg-night-900/90 dark:text-brand-300">
                  <IconCpu size={14} /> 10 / server
                </div>
              </div>
              <div className="absolute -bottom-5 left-8 z-20 hidden animate-float sm:block [animation-delay:-2s]">
                <div className="flex items-center gap-2 rounded-xl border border-accent-500/30 bg-white/90 px-3 py-2 text-xs font-semibold text-accent-600 shadow-lg backdrop-blur dark:bg-night-900/90 dark:text-accent-300">
                  <IconLock size={14} /> AES-256
                </div>
              </div>

              <div className="terminal-glow relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 text-slate-100">
                <div className="relative flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-2 font-mono text-xs text-slate-400">student@cyberitalab: ~</span>
                  <Badge tone="emerald" dot="animate-pulse" className="ml-auto !bg-emerald-500/20 !text-emerald-300 !border-emerald-500/30">
                    Live
                  </Badge>
                </div>
                <div className="relative space-y-2.5 p-5 font-mono text-[12.5px] leading-6">
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
                <div className="relative grid grid-cols-3 divide-x divide-white/5 border-t border-white/10 bg-night-900/50 text-center">
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

      <section className="relative border-b border-brand-700 bg-brand-600 dark:border-brand-800 dark:bg-brand-700">
        {/* Top wave divider — irregular shape transition from previous section */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -translate-y-[99%]">
          <svg
            viewBox="0 0 1440 72"
            preserveAspectRatio="none"
            className="block h-14 w-full text-brand-600 dark:text-brand-700"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M0,40 C120,8 240,72 360,36 C480,4 600,68 720,34 C840,6 960,70 1080,32 C1200,4 1320,66 1440,30 L1440,72 L0,72 Z" />
          </svg>
        </div>        <div className="container-page py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
            <div className="max-w-xs shrink-0">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-100">
                <IconShield size={14} className="text-white" /> Trusted by design
              </p>
              <p className="mt-1.5 text-sm leading-6 text-brand-50">
                Security, isolation and verifiable evidence are built into every lab session.
              </p>
            </div>
            <div className="trust-marquee flex-1">
              <ul className="trust-track">
                {[...trustBadges, ...trustBadges].map(({ icon: IconComponent, label, detail }, index) => (
                  <li
                    key={`${label}-${index}`}
                    className="flex w-48 shrink-0 flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm transition hover:border-brand-300 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/30"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
                      <IconComponent size={17} />
                    </span>
                    <span>
                      <span className="block text-[11px] font-semibold leading-4 text-slate-800 dark:text-slate-200">{label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-slate-500">{detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
        <Reveal className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const IconComponent = feature.icon;
            return (
              <Card key={feature.title} className="group p-6 transition hover:border-slate-300 hover:shadow-md dark:hover:border-brand-400/25">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-slate-200 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-white/5">
                  <IconComponent size={21} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{feature.body}</p>
              </Card>
            );
          })}
        </Reveal>
      </section>

      <section className="border-b border-slate-200/80 bg-white dark:border-white/5 dark:bg-transparent">
        <div className="container-page py-16 lg:py-20">
          <SectionHeading
            eyebrow="Course categories"
            title="Find the track that fits your goal"
            description="From security operations to cloud engineering, every category is backed by practical labs and instructor review."
            action={
              <Button as={Link} to="/courses" variant="secondary" size="sm">
                Browse all courses <IconArrowRight size={15} />
              </Button>
            }
          />
          <Reveal className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryShowcase.map(({ name, icon: IconComponent, hint }) => (
              <Link
                key={name}
                to={`/courses?category=${encodeURIComponent(name)}`}
                className="card card-hover group flex items-center gap-4 p-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-slate-200 transition group-hover:bg-brand-100 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-white/5">
                  <IconComponent size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-900 dark:text-white">{name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                </span>
                <IconArrowRight
                  size={16}
                  className="ml-auto shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600 dark:group-hover:text-brand-300"
                />
              </Link>
            ))}
          </Reveal>
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
          <Reveal className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          </Reveal>
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
                    {index < steps.length - 1 && <span className="mt-2 h-full w-px bg-brand-400/25" />}
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
            <Card className="border-brand-400/20 bg-brand-50/60 p-6 dark:bg-brand-400/5">
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

      <section className="container-page py-16 lg:py-20">
        <Reveal className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="Inside the platform"
              title="Built like real training infrastructure"
              description="CyberITA+ is not a video library with a quiz bolted on. Lessons, labs and certificates run on a purpose-built platform with isolated containers and reviewed evidence."
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {platformPillars.map(({ icon: IconComponent, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-night-900/50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
                    <IconComponent size={17} />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">
                    Lab session flow
                  </p>
                  <h3 className="mt-1 font-display text-xl font-semibold text-slate-900 dark:text-white">
                    From click to container
                  </h3>
                </div>
                <Badge tone="emerald" dot="animate-pulse">
                  Live
                </Badge>
              </div>

              <ol className="mt-6 space-y-3">
                {[
                  ['Student starts a lab', 'Capacity is reserved atomically on the healthiest server.'],
                  ['Agent provisions a container', 'Isolated Docker sandbox with a dedicated PTY and filesystem.'],
                  ['Commands are verified', 'Every step is checked against the expected outcome in real time.'],
                  ['Evidence becomes a report', 'Output and screenshots are reviewed, then certificates are issued.'],
                ].map(([title, body], index) => (
                  <li key={title} className="relative flex gap-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-400/30 bg-brand-400/10 font-display text-xs font-semibold text-brand-700 dark:text-brand-300">
                      {index + 1}
                    </span>
                    <div className="pb-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-400">{body}</p>
                    </div>
                    {index < 3 && (
                      <span className="absolute left-4 top-8 h-[calc(100%-1rem)] w-px bg-brand-400/25" />
                    )}
                  </li>
                ))}
              </ol>

              <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-5 dark:border-white/5">
                {techStack.map((tech) => (
                  <span key={tech} className="chip chip-static">
                    {tech}
                  </span>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-500">
                <IconLock size={12} /> Agent traffic is authenticated and encrypted end to end.
              </p>
            </div>
          </Card>
        </Reveal>
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
          <Reveal className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          </Reveal>
        </div>
      </section>

      <section className="container-page py-16 lg:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-brand-400/20 bg-slate-50 px-6 py-12 text-center sm:px-12 lg:py-16 dark:bg-night-900">
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
