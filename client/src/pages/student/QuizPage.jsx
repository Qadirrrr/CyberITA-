import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import { Alert, Badge, Button, Card, ProgressBar, Skeleton } from '../../components/ui';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconRefresh,
  IconXCircle,
  IconZap,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';

const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function QuizPage() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get(`/quizzes/${id}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Unable to load this quiz.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const quiz = data?.quiz;
  const questions = data?.questions || [];
  const answeredCount = Object.keys(answers).length;

  const bestAttempt = useMemo(() => {
    if (!data?.attempts?.length) return null;
    return data.attempts.reduce((best, attempt) => (attempt.score > (best?.score ?? -1) ? attempt : best), null);
  }, [data]);

  const select = (questionId, option) => setAnswers((current) => ({ ...current, [questionId]: option }));

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = questions
        .filter((question) => answers[question.id] != null)
        .map((question) => ({ questionId: question.id, option: answers[question.id] }));
      const { data: response } = await api.post(`/quizzes/${id}/attempts`, { answers: payload });
      setResult(response);
      toast[response.passed ? 'success' : 'info'](
        response.passed
          ? `Quiz passed — ${response.score}/${response.maxPoints}.`
          : `Attempt saved — ${response.score}/${response.maxPoints}. Review the explanations below.`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit your answers.'));
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setAnswers({});
    setResult(null);
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div>
        <Alert tone="error" title="Quiz unavailable">
          {error || 'This quiz could not be found.'}
        </Alert>
        <Button as={Link} to="/student/courses" variant="secondary" className="mt-4">
          Back to my courses
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to={quiz.courseSlug ? `/learn/${quiz.courseSlug}` : '/student/courses'}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300"
        >
          <IconArrowLeft size={13} /> Back to course
        </Link>
        <Badge tone="accent">
          <IconZap size={12} /> Quiz
        </Badge>
      </div>

      <Card className="p-6">
        <h1 className="font-display text-2xl font-semibold">{quiz.title}</h1>
        {quiz.description && <p className="mt-2 text-sm leading-6 text-slate-400">{quiz.description}</p>}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>{questions.length} questions</span>
          <span>Pass at {Math.round(Number(quiz.passScore))}%</span>
          {bestAttempt && (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <IconClock size={12} /> Best: {bestAttempt.score}/{bestAttempt.max_points}
              {bestAttempt.passed ? ' · passed' : ''}
            </span>
          )}
        </div>
      </Card>

      {result ? (
        <div className="space-y-5">
          <Card className={`overflow-hidden border-2 ${result.passed ? 'border-emerald-400/30' : 'border-amber-400/30'}`}>
            <div className={`flex flex-wrap items-center gap-5 p-6 ${result.passed ? 'bg-emerald-400/[0.06]' : 'bg-amber-400/[0.06]'}`}>
              <div className="relative flex h-24 w-24 items-center justify-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke={result.passed ? '#34d399' : '#fbbf24'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(result.percent / 100) * 276.5} 276.5`}
                  />
                </svg>
                <div className="text-center">
                  <p className="font-display text-2xl font-semibold text-white">{Math.round(result.percent)}%</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">score</p>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-display text-xl font-semibold ${result.passed ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {result.passed ? 'Passed — well done.' : 'Not passed yet.'}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  You scored {result.score} of {result.maxPoints} points. Pass mark is {Math.round(Number(result.passScore))}%.
                  {result.passed ? ' Review the explanations to lock it in.' : ' Review the feedback and try again.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={retake} variant="secondary" size="sm">
                    <IconRefresh size={14} /> Retake quiz
                  </Button>
                  <Button as={Link} to={quiz.courseSlug ? `/learn/${quiz.courseSlug}` : '/student/courses'} size="sm">
                    Back to course <IconArrowRight size={14} />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            {result.detail.map((question, index) => (
              <Card key={question.questionId} className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      question.correct ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
                    }`}
                  >
                    {question.correct ? <IconCheckCircle size={16} /> : <IconXCircle size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-6 text-white">
                      {index + 1}. {question.question}
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {question.options.map((option, optionIndex) => {
                        const chosen = question.chosen === optionIndex;
                        const correct = question.correctOption === optionIndex;
                        return (
                          <div
                            key={optionIndex}
                            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                              correct
                                ? 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200'
                                : chosen
                                  ? 'border-rose-400/30 bg-rose-400/[0.07] text-rose-200'
                                  : 'border-white/5 bg-white/[0.02] text-slate-400'
                            }`}
                          >
                            <span className="font-mono text-[11px] text-slate-500">{letters[optionIndex]}</span>
                            <span className="flex-1">{option}</span>
                            {correct && <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Correct</span>}
                            {chosen && !correct && <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">Your answer</span>}
                          </div>
                        );
                      })}
                    </div>
                    {question.explanation && (
                      <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs leading-6 text-slate-400">
                        <span className="font-semibold text-slate-300">Why: </span>
                        {question.explanation}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-500">{question.points} pts</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {questions.map((question, index) => (
              <Card key={question.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 font-display text-xs font-semibold text-slate-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-6 text-white">{question.question}</p>
                      <span className="shrink-0 text-[11px] text-slate-500">{question.points} pts</span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {question.options.map((option, optionIndex) => {
                        const selected = answers[question.id] === optionIndex;
                        return (
                          <button
                            key={optionIndex}
                            type="button"
                            onClick={() => select(question.id, optionIndex)}
                            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                              selected
                                ? 'border-brand-400/50 bg-brand-400/10 text-white'
                                : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                                selected ? 'border-brand-400 bg-brand-400 text-night-950' : 'border-slate-600 text-slate-500'
                              }`}
                            >
                              {letters[optionIndex]}
                            </span>
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 p-4 shadow-2xl">
            <div className="min-w-[140px] flex-1">
              <p className="text-xs text-slate-400">
                {answeredCount}/{questions.length} answered
              </p>
              <ProgressBar value={(answeredCount / Math.max(1, questions.length)) * 100} size="sm" className="mt-1.5" />
            </div>
            <div className="flex items-center gap-2">
              {answeredCount < questions.length && (
                <span className="hidden text-[11px] text-amber-300/80 sm:block">Unanswered questions score zero</span>
              )}
              <Button onClick={submit} loading={submitting} size="sm" disabled={questions.length === 0}>
                Submit answers <IconChevronRight size={15} />
              </Button>
            </div>
          </Card>
        </>
      )}

      {data.attempts.length > 0 && (
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold">Previous attempts</h2>
          <ul className="mt-3 divide-y divide-white/5">
            {data.attempts.map((attempt) => (
              <li key={attempt.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <span className="text-slate-400">{formatDateTime(attempt.created_at)}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-slate-300">
                    {attempt.score}/{attempt.max_points}
                  </span>
                  <Badge tone={attempt.passed ? 'emerald' : 'slate'}>{attempt.passed ? 'Passed' : 'Not passed'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
