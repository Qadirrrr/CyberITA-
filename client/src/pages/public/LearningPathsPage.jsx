import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import { IconArrowRight, IconBookOpen, IconClock, IconLayers, IconSparkles, IconTarget } from '../../components/icons';

export default function LearningPathsPage() {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/learning-paths')
      .then((res) => setPaths(res.data.paths))
      .catch((err) => setError(getErrorMessage(err, 'Unable to load learning paths.')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-70" />
        <div className="container-page relative py-12 lg:py-16">
          <Badge tone="accent" className="mb-4">
            <IconTarget size={13} /> Guided routes
          </Badge>
          <h1 className="max-w-2xl text-balance font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Learning paths that take you from curious to capable
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Curated sequences of courses that build on each other. Follow the order, complete the labs and finish with
            the practical evidence employers ask for.
          </p>
        </div>
      </section>

      <section className="container-page py-10 lg:py-14">
        {error && <p className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Card key={index} className="p-6">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
                <Skeleton className="mt-6 h-24 w-full" />
              </Card>
            ))}
          </div>
        ) : paths.length === 0 ? (
          <EmptyState
            icon={IconTarget}
            title="No learning paths yet"
            message="Paths are curated by our instructors. In the meantime, individual courses are available in the catalog."
            action={
              <Button as={Link} to="/courses">
                Browse courses
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {paths.map((path) => {
              const totalHours = path.courses?.reduce((sum, course) => sum + Number(course.duration_hours || 0), 0) || 0;
              return (
                <Card key={path.id} className="overflow-hidden">
                  <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.1fr] lg:p-8">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="brand" className="capitalize">
                          {path.level}
                        </Badge>
                        <Badge tone="slate">
                          {path.courses?.length || 0} courses
                        </Badge>
                        <Badge tone="slate">
                          <IconClock size={12} /> {totalHours} hours
                        </Badge>
                      </div>
                      <h2 className="mt-4 font-display text-2xl font-semibold">{path.title}</h2>
                      <p className="mt-3 text-sm leading-7 text-slate-400">{path.description}</p>
                      <Button as={Link} to={`/learning-paths/${path.slug}`} className="mt-6">
                        View path <IconArrowRight size={16} />
                      </Button>
                    </div>

                    <ol className="relative space-y-3 border-l border-white/10 pl-5">
                      {(path.courses || []).map((course, index) => (
                        <li key={course.id} className="relative">
                          <span className="absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full border border-brand-400/30 bg-night-900 text-[10px] font-semibold text-brand-300">
                            {index + 1}
                          </span>
                          <Link
                            to={`/courses/${course.slug}`}
                            className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition hover:border-brand-400/20 hover:bg-white/[0.04]"
                          >
                            <IconBookOpen size={16} className="shrink-0 text-brand-400" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-200 group-hover:text-white">
                                {course.title}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-slate-500">
                                {course.lesson_count} lessons · {course.duration_hours}h · {course.instructor_name || 'CyberITA+'}
                              </span>
                            </span>
                            <IconArrowRight size={14} className="shrink-0 text-slate-600 transition group-hover:text-brand-300" />
                          </Link>
                        </li>
                      ))}
                      {(!path.courses || path.courses.length === 0) && (
                        <li className="text-sm text-slate-500">Courses for this path are being finalised.</li>
                      )}
                    </ol>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="mt-10 border-brand-400/20 bg-gradient-to-br from-brand-400/[0.07] to-transparent p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-400/15 text-brand-300">
                <IconSparkles size={21} />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold">Not sure where to start?</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">
                  Tell us your goal (a helpdesk role, cloud operations, or security fundamentals) and we'll recommend a
                  route with the right labs and assessments.
                </p>
              </div>
            </div>
            <Button as={Link} to="/contact" variant="secondary">
              Get a recommendation
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
