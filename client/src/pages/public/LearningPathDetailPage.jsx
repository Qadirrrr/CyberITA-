import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, Skeleton } from '../../components/ui';
import { IconArrowLeft, IconArrowRight, IconBookOpen, IconClock, IconLayers } from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';
import { formatMinutes } from '../../lib/format';

export default function LearningPathDetailPage() {
  const { slug } = useParams();
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get(`/learning-paths/${slug}`)
      .then((res) => setPath(res.data.path))
      .catch((err) => setError(getErrorMessage(err, 'Learning path not found.')))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="container-page py-12">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="mt-4 h-5 w-2/3" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  }

  if (error || !path) {
    return (
      <div className="container-page py-20">
        <Alert tone="error" title="Path unavailable">
          {error || 'This learning path could not be found.'}
        </Alert>
        <Button as={Link} to="/learning-paths" variant="secondary" className="mt-4">
          Back to learning paths
        </Button>
      </div>
    );
  }

  const totalMinutes = (path.courses || []).reduce((sum, course) => sum + Number(course.duration_hours || 0) * 60, 0);
  const totalLessons = (path.courses || []).reduce((sum, course) => sum + Number(course.lesson_count || 0), 0);
  const level = DIFFICULTIES[path.level] || DIFFICULTIES.beginner;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-70" />
        <div className="container-page relative py-10 lg:py-14">
          <Link to="/learning-paths" className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300">
            <IconArrowLeft size={13} /> All learning paths
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="brand" className="capitalize">
              {level.label}
            </Badge>
            <Badge tone="slate">
              <IconLayers size={12} /> {path.courses?.length || 0} courses
            </Badge>
            <Badge tone="slate">
              <IconClock size={12} /> {formatMinutes(totalMinutes)}
            </Badge>
            <Badge tone="slate">
              <IconBookOpen size={12} /> {totalLessons} lessons
            </Badge>
          </div>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-3xl font-semibold sm:text-4xl">{path.title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">{path.description}</p>
        </div>
      </section>

      <section className="container-page py-10 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="font-display text-xl font-semibold">Your route</h2>
            <p className="mt-1 text-sm text-slate-500">Complete the courses in order for the smoothest progression.</p>
            <ol className="mt-6 space-y-4">
              {(path.courses || []).map((course, index) => {
                const courseLevel = DIFFICULTIES[course.level] || DIFFICULTIES.beginner;
                return (
                  <li key={course.id} className="relative pl-12">
                    <span className="absolute left-0 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-brand-400/30 bg-night-900 font-display text-xs font-semibold text-brand-300">
                      {index + 1}
                    </span>
                    {index < path.courses.length - 1 && (
                      <span className="absolute left-[15px] top-14 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-brand-400/30 to-white/5" />
                    )}
                    <Card className="card-hover p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="slate">{course.category}</Badge>
                            <Badge tone={courseLevel.tone === 'emerald' ? 'emerald' : courseLevel.tone === 'amber' ? 'amber' : 'rose'}>
                              {courseLevel.label}
                            </Badge>
                          </div>
                          <h3 className="mt-2 font-display text-lg font-semibold text-white">{course.title}</h3>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{course.summary}</p>
                        </div>
                        <Button as={Link} to={`/courses/${course.slug}`} variant="secondary" size="sm" className="shrink-0">
                          View course <IconArrowRight size={14} />
                        </Button>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/5 pt-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <IconBookOpen size={13} /> {course.lesson_count} lessons
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <IconClock size={13} /> {course.duration_hours}h
                        </span>
                        <span>{course.instructor_name || 'CyberITA+ Faculty'}</span>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">What you'll walk away with</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                {[
                  'A documented portfolio of completed labs',
                  'Instructor-reviewed practical reports',
                  'Verifiable certificates for each course',
                  'Confidence running real commands in Linux',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button as={Link} to={path.courses?.[0] ? `/courses/${path.courses[0].slug}` : '/courses'} className="mt-6 w-full">
                Start with course 1 <IconArrowRight size={16} />
              </Button>
            </Card>
            <Card className="border-brand-400/20 bg-brand-400/[0.04] p-6">
              <h3 className="text-sm font-semibold text-white">Prefer flexibility?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                You can take any course in this path individually — the order is a recommendation, not a requirement.
              </p>
              <Button as={Link} to="/courses" variant="outline" size="sm" className="mt-4 w-full">
                Browse all courses
              </Button>
            </Card>
          </aside>
        </div>
      </section>
    </div>
  );
}
