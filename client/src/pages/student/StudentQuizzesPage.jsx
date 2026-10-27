import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Skeleton, Tabs } from '../../components/ui';
import {
  IconArrowRight,
  IconBookOpen,
  IconCheckCircle,
  IconClock,
  IconSearch,
  IconRefresh,
  IconZap,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';
import { useNotifications } from '../../context/NotificationContext';

export default function StudentQuizzesPage() {
  const { markCategoryRead } = useNotifications() || {};
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    markCategoryRead?.('quiz');
  }, [markCategoryRead]);

  useEffect(() => {
    let active = true;
    api
      .get('/me/quizzes')
      .then(({ data }) => {
        if (active) setQuizzes(data.quizzes || []);
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load your quizzes.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(
    () => ({
      all: quizzes.length,
      passed: quizzes.filter((quiz) => quiz.has_passed).length,
      not_attempted: quizzes.filter((quiz) => Number(quiz.attempt_count) === 0).length,
      needs_work: quizzes.filter((quiz) => Number(quiz.attempt_count) > 0 && !quiz.has_passed).length,
    }),
    [quizzes]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quizzes.filter((quiz) => {
      if (tab === 'passed' && !quiz.has_passed) return false;
      if (tab === 'not_attempted' && Number(quiz.attempt_count) > 0) return false;
      if (tab === 'needs_work' && !(Number(quiz.attempt_count) > 0 && !quiz.has_passed)) return false;
      if (!term) return true;
      return `${quiz.title} ${quiz.course_title} ${quiz.description || ''}`.toLowerCase().includes(term);
    });
  }, [quizzes, tab, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Quizzes</h1>
          <p className="mt-1 text-sm text-slate-400">
            Check your understanding after each topic. Every attempt is saved so you can track improvement.
          </p>
        </div>
        <Badge tone="accent">
          <IconZap size={12} /> {counts.passed}/{counts.all} passed
        </Badge>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!loading && quizzes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
              <IconZap size={18} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{counts.all}</p>
              <p className="text-[11px] text-slate-500">Quizzes available</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <IconCheckCircle size={18} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{counts.passed}</p>
              <p className="text-[11px] text-slate-500">Passed</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
              <IconRefresh size={18} />
            </span>
            <div>
              <p className="text-lg font-semibold text-white">{counts.needs_work}</p>
              <p className="text-[11px] text-slate-500">Ready to retake</p>
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'All quizzes', count: counts.all },
            { id: 'not_attempted', label: 'Not attempted', count: counts.not_attempted },
            { id: 'needs_work', label: 'Retake', count: counts.needs_work },
            { id: 'passed', label: 'Passed', count: counts.passed },
          ]}
        />
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search quizzes…"
            className="input pl-9"
            aria-label="Search quizzes"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconZap}
          title={quizzes.length === 0 ? 'No quizzes available yet' : 'No quizzes match this filter'}
          message={
            quizzes.length === 0
              ? 'Quizzes appear here as soon as your instructors publish them for your courses.'
              : 'Try another filter or clear the search.'
          }
          action={
            quizzes.length === 0 ? (
              <Button as={Link} to="/student/courses" variant="secondary">
                View my courses <IconArrowRight size={14} />
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((quiz) => {
            const attempted = Number(quiz.attempt_count) > 0;
            return (
              <Card key={quiz.id} className="flex flex-col p-5 transition hover:border-brand-400/25">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      quiz.has_passed ? 'bg-emerald-400/10 text-emerald-300' : 'bg-accent-400/10 text-accent-300'
                    }`}
                  >
                    {quiz.has_passed ? <IconCheckCircle size={19} /> : <IconZap size={19} />}
                  </span>
                  <Badge tone={quiz.has_passed ? 'emerald' : attempted ? 'amber' : 'slate'}>
                    {quiz.has_passed ? 'Passed' : attempted ? 'Retake' : 'Not attempted'}
                  </Badge>
                </div>

                <h2 className="mt-3 font-display text-base font-semibold leading-snug text-white">{quiz.title}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <IconBookOpen size={11} /> {quiz.course_title}
                </p>
                {quiz.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{quiz.description}</p>}

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
                    <p className="text-slate-500">Questions</p>
                    <p className="mt-0.5 font-medium text-slate-200">{quiz.question_count}</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
                    <p className="text-slate-500">Pass mark</p>
                    <p className="mt-0.5 font-medium text-slate-200">{Math.round(Number(quiz.pass_score))}%</p>
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  {attempted ? (
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <IconClock size={11} /> Best {quiz.best_score}/{quiz.best_max_points}
                      {quiz.last_attempt_at ? ` · ${formatDateTime(quiz.last_attempt_at)}` : ''}
                    </p>
                  ) : (
                    <p className="mb-2 text-[11px] text-slate-500">
                      {quiz.total_points} points · unlimited attempts
                    </p>
                  )}
                  <Button as={Link} to={`/learn/quizzes/${quiz.id}`} size="sm" variant={quiz.has_passed ? 'secondary' : 'primary'} className="w-full">
                    {quiz.has_passed ? 'Retake quiz' : attempted ? 'Try again' : 'Start quiz'} <IconArrowRight size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
