import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, ProgressBar, Skeleton, Tabs } from '../../components/ui';
import {
  IconArrowRight,
  IconBookOpen,
  IconCheckCircle,
  IconClock,
  IconPlay,
  IconSearch,
  IconTerminal,
} from '../../components/icons';
import { formatMinutes } from '../../lib/format';

const typeTone = { reading: 'slate', video: 'accent', lab: 'brand' };

export default function StudentLessonsPage() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get('/me/lessons')
      .then(({ data }) => {
        if (active) setLessons(data.lessons || []);
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load your lessons.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(
    () => ({
      all: lessons.length,
      completed: lessons.filter((lesson) => lesson.progress_status === 'completed').length,
      in_progress: lessons.filter((lesson) => lesson.progress_status === 'in_progress').length,
      not_started: lessons.filter((lesson) => !lesson.progress_status).length,
    }),
    [lessons]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lessons.filter((lesson) => {
      if (tab === 'completed' && lesson.progress_status !== 'completed') return false;
      if (tab === 'in_progress' && lesson.progress_status !== 'in_progress') return false;
      if (tab === 'not_started' && lesson.progress_status) return false;
      if (!term) return true;
      return `${lesson.title} ${lesson.course_title} ${lesson.module_title || ''}`.toLowerCase().includes(term);
    });
  }, [lessons, tab, search]);

  const courses = useMemo(() => {
    const map = new Map();
    for (const lesson of filtered) {
      if (!map.has(lesson.course_id)) {
        map.set(lesson.course_id, {
          id: lesson.course_id,
          title: lesson.course_title,
          slug: lesson.course_slug,
          cover_image: lesson.cover_image,
          lessons: [],
        });
      }
      map.get(lesson.course_id).lessons.push(lesson);
    }
    return [...map.values()];
  }, [filtered]);

  const overall = counts.all ? Math.round((counts.completed / counts.all) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">My lessons</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every lesson from your enrolled courses in one place. Jump back in without searching.
          </p>
        </div>
        <Button as={Link} to="/student/courses" variant="secondary" size="sm">
          Browse my courses <IconArrowRight size={15} />
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!loading && lessons.length > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
                <IconBookOpen size={19} />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Overall lesson progress</p>
                <p className="text-xs text-slate-500">
                  {counts.completed} of {counts.all} lessons completed · {counts.in_progress} in progress
                </p>
              </div>
            </div>
            <div className="flex min-w-[200px] flex-1 items-center gap-3 sm:max-w-xs">
              <ProgressBar value={overall} tone={overall >= 100 ? 'emerald' : 'brand'} />
              <span className="w-10 shrink-0 text-right text-sm font-semibold text-brand-300">{overall}%</span>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'All lessons', count: counts.all },
            { id: 'in_progress', label: 'In progress', count: counts.in_progress },
            { id: 'not_started', label: 'Not started', count: counts.not_started },
            { id: 'completed', label: 'Completed', count: counts.completed },
          ]}
        />
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search lessons or modules…"
            className="input pl-9"
            aria-label="Search lessons"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-52 w-full" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={IconBookOpen}
          title={lessons.length === 0 ? 'No lessons available yet' : 'No lessons match this filter'}
          message={
            lessons.length === 0
              ? 'Enroll in a course and its lessons will appear here automatically.'
              : 'Try a different status filter or clear your search.'
          }
          action={
            lessons.length === 0 ? (
              <Button as={Link} to="/courses">
                Explore courses
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-5">
          {courses.map((course) => {
            const completed = course.lessons.filter((lesson) => lesson.progress_status === 'completed').length;
            const percent = course.lessons.length ? Math.round((completed / course.lessons.length) * 100) : 0;
            return (
              <Card key={course.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-white/[0.02] px-5 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50 dark:bg-brand-400/10">
                    {course.cover_image ? (
                      <img src={course.cover_image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <IconBookOpen size={18} className="text-brand-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/learn/${course.slug}`}
                      className="truncate font-display text-sm font-semibold text-white transition hover:text-brand-200"
                    >
                      {course.title}
                    </Link>
                    <p className="text-[11px] text-slate-500">
                      {course.lessons.length} shown · {completed} completed
                    </p>
                  </div>
                  <div className="flex w-40 items-center gap-2">
                    <ProgressBar value={percent} size="sm" tone={percent >= 100 ? 'emerald' : 'brand'} />
                    <span className="w-8 text-right text-[11px] font-medium text-slate-400">{percent}%</span>
                  </div>
                </div>

                <ul className="divide-y divide-white/5">
                  {(course?.lessons || []).map((lesson) => {
                    const done = lesson.progress_status === 'completed';
                    return (
                      <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.025]">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            done ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-400'
                          }`}
                        >
                          {done ? <IconCheckCircle size={16} /> : lesson.lesson_type === 'lab' ? <IconTerminal size={15} /> : <IconPlay size={14} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm ${done ? 'text-slate-400' : 'font-medium text-slate-100'}`}>
                            {lesson.title}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                            <span>{lesson.module_title || 'Course lesson'}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <IconClock size={10} /> {formatMinutes(lesson.duration_minutes)}
                            </span>
                            <Badge tone={typeTone[lesson.lesson_type] || 'slate'} className="!px-2 !py-0.5 !text-[10px] capitalize">
                              {lesson.lesson_type}
                            </Badge>
                          </p>
                        </div>
                        <Button
                          as={Link}
                          to={`/learn/${lesson.course_slug}?lesson=${lesson.id}`}
                          size="sm"
                          variant={done ? 'ghost' : 'secondary'}
                        >
                          {done ? 'Review' : lesson.progress_status ? 'Continue' : 'Start'} <IconArrowRight size={13} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
