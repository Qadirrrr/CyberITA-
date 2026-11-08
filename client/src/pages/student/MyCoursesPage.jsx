import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, ProgressBar, Skeleton, Tabs } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconBookOpen,
  IconCheckCircle,
  IconClock,
  IconPlay,
  IconTerminal,
} from '../../components/icons';
import { formatDate } from '../../lib/format';

export default function MyCoursesPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('active');

  useEffect(() => {
    api
      .get('/my-courses')
      .then((res) => setEnrollments(res.data.enrollments))
      .catch((err) => setError(getErrorMessage(err, 'Unable to load your courses.')))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(
    () => ({
      active: enrollments.filter((item) => item.status === 'active').length,
      completed: enrollments.filter((item) => item.status === 'completed').length,
      all: enrollments.length,
    }),
    [enrollments]
  );

  const visible = enrollments.filter((item) => (tab === 'all' ? true : item.status === tab));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">
            <IconBookOpen size={13} /> Learning
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">My Courses</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Pick up where you left off, or revisit a completed course.</p>
        </div>
        <Button as={Link} to="/courses" variant="secondary" size="sm">
          Browse catalog <IconArrowRight size={15} />
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Tabs
        value={tab}
        onChange={setTab}
        className="max-w-md"
        tabs={[
          { id: 'active', label: 'In progress', count: counts.active },
          { id: 'completed', label: 'Completed', count: counts.completed },
          { id: 'all', label: 'All', count: counts.all },
        ]}
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={IconBookOpen}
          title={tab === 'completed' ? 'No completed courses yet' : 'Nothing here yet'}
          message={
            tab === 'completed'
              ? 'Finish every lesson in a course to earn your certificate and see it here.'
              : 'Enroll in a course to start building your practical skills.'
          }
          action={
            <Button as={Link} to="/courses">
              Explore courses
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((enrollment) => {
            const progress = Math.round(Number(enrollment.progress_percent));
            return (
              <Card key={enrollment.id} className="flex flex-col overflow-hidden">
                <div className="flex gap-4 p-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 dark:bg-brand-400/10">
                    {enrollment.cover_image ? (
                      <img src={enrollment.cover_image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <IconBookOpen size={26} className="text-brand-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="slate">{enrollment.category}</Badge>
                      {enrollment.status === 'completed' ? (
                        <Badge tone="emerald">
                          <IconCheckCircle size={11} /> Completed
                        </Badge>
                      ) : (
                        <Badge tone="brand">In progress</Badge>
                      )}
                    </div>
                    <Link
                      to={`/learn/${enrollment.slug}`}
                      className="mt-1 block truncate font-display text-base font-semibold text-white transition hover:text-brand-200"
                    >
                      {enrollment.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {enrollment.instructor_name || 'CyberITA+ Faculty'} · {enrollment.lesson_count} lessons
                    </p>
                  </div>
                </div>

                <div className="px-4">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      {enrollment.completed_lessons}/{enrollment.lesson_count} lessons
                    </span>
                    <span className="font-semibold text-brand-300">{progress}%</span>
                  </div>
                  <ProgressBar value={progress} size="sm" className="mt-1.5" tone={progress >= 100 ? 'emerald' : 'brand'} />
                  <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                    <IconClock size={12} />
                    {enrollment.next_lesson_title
                      ? `Next: ${enrollment.next_lesson_title}`
                      : `Completed ${formatDate(enrollment.completed_at)}`}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 p-4">
                  <Button as={Link} to={`/learn/${enrollment.slug}`} size="sm">
                    <IconPlay size={14} /> {progress > 0 ? 'Continue' : 'Start course'}
                  </Button>
                  {enrollment.has_certificate > 0 && (
                    <Button as={Link} to="/student/certificates" variant="secondary" size="sm">
                      <IconAward size={14} /> Certificate
                    </Button>
                  )}
                  <Button as={Link} to={`/courses/${enrollment.slug}`} variant="ghost" size="sm" className="ml-auto">
                    Course details
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
            <IconTerminal size={19} />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Want to practise outside a course?</p>
            <p className="text-xs text-slate-500">Standalone labs are available in the practical labs catalog.</p>
          </div>
        </div>
        <Button as={Link} to="/student/labs" variant="secondary" size="sm">
          Open labs <IconArrowRight size={14} />
        </Button>
      </Card>
    </div>
  );
}
