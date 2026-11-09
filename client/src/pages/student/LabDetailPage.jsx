import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import { Alert, Badge, Button, Card, ProgressBar, Skeleton } from '../../components/ui';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconExternalLink,
  IconPlay,
  IconSend,
  IconTerminal,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';
import { formatDateTime, timeAgo } from '../../lib/format';

export default function LabDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [labStatus, setLabStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const res = await api.get(`/labs/${id}`);
      setData(res.data);
    } catch (_) {}
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/labs/${id}`),
      api.get('/labs/status').catch(() => ({ data: { available: false, reason: 'Status check failed' } })),
    ])
      .then(([res, statusRes]) => {
        if (!cancelled) {
          setData(res.data);
          setLabStatus(statusRes.data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Unable to load this lab.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const start = async () => {
    setStarting(true);
    try {
      const { data: session } = await api.post(`/labs/${id}/sessions`, {}, { timeout: 300000 });
      const sessionUrl = `/labs/session/${session.session.id}`;
      const newWin = window.open(sessionUrl, '_blank');
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        navigate(sessionUrl);
      } else {
        toast.success(
          data?.lab?.lab_mode === 'real'
            ? 'Real lab opened in a new tab. Read the task brief and collect your evidence.'
            : data?.lab?.is_practice
              ? 'Practice lab container opened in a new tab.'
              : 'Guided lab started in a new tab.'
        );
        try {
          const res = await api.get(`/labs/${id}`);
          setData(res.data);
        } catch (_) {}
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not start the lab session.'));
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error || !data?.lab) {
    return (
      <div>
        <Alert tone="error" title="Lab unavailable">
          {error || 'This lab could not be found.'}
        </Alert>
        <Button as={Link} to="/student/labs" variant="secondary" className="mt-4">
          Back to labs
        </Button>
      </div>
    );
  }

  const { lab, steps, sessions = [], mySession, myProgress, stepCounts } = data;
  const running = mySession?.status === 'running';
  const tone = DIFFICULTIES[lab.difficulty]?.tone || 'brand';
  const isPractice = Boolean(lab.is_practice);
  const isReal = lab.lab_mode === 'real';
  const minEvidence = Math.max(1, Number(lab.min_evidence) || 1);
  // Every lab - including open-to-all practice labs - needs a running Docker
  // provider, so availability is required for all of them.
  const infrastructureReady = !labStatus || Boolean(labStatus.available);
  const offlineReason = 'This lab cannot start right now. Please try again later.';
  const requiredSteps = stepCounts?.required ?? 0;

  // Saved-work submission: an ended session can be sent for instructor review
  // straight from this page. Real labs may be submitted with partial evidence
  // (the instructor sees the counts); guided labs must finish all required
  // steps. The server applies the same rules, so this only drives the UI.
  const sessionSubmitState = (session) => {
    if (isPractice) return null;
    if (session.submission_status === 'approved') return 'approved';
    if (session.submission_status === 'submitted') return 'submitted';
    if (session.status === 'running' || session.status === 'error') return null;
    const eligible = isReal
      ? true
      : (session.completed_steps || 0) >= requiredSteps;
    if (!eligible) return 'ineligible';
    return session.submission_status === 'changes_requested' ? 'changes' : 'eligible';
  };

  const submitSession = async (session) => {
    const missingShots = isReal ? Math.max(0, minEvidence - (session.screenshot_count || 0)) : 0;
    const message = isReal
      ? `Submit this saved lab with ${session.screenshot_count || 0} screenshot evidence file${session.screenshot_count === 1 ? '' : 's'} for instructor review?${missingShots > 0 ? ` That is ${missingShots} short of the required ${minEvidence}, so your instructor will see a partial submission.` : ''}`
      : 'Submit this saved, completed lab for instructor review? Your verified steps and screenshots will be sent as evidence.';
    if (!window.confirm(message)) return;
    setSubmittingId(session.id);
    try {
      const form = new FormData();
      form.append('note', isReal ? 'Submitted from the lab page with screenshot evidence.' : 'Submitted from the lab page.');
      await api.post(`/labs/sessions/${session.id}/submit`, form);
      toast.success('Lab submitted for instructor review.');
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit this lab.'));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <Link to="/student/labs" className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-300">
        <IconArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" /> Back to lab catalog
      </Link>

      <Card className="relative overflow-hidden p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-cyan-400 to-accent-500" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{DIFFICULTIES[lab.difficulty]?.label || lab.difficulty}</Badge>
              <Badge tone="slate">
                <IconClock size={11} /> {lab.estimated_minutes} min est.
              </Badge>
              {Number(lab.time_limit_minutes) > 0 && (
                <Badge tone="brand">
                  <IconClock size={11} /> {lab.time_limit_minutes} min limit
                </Badge>
              )}
              <Badge tone={isReal ? 'rose' : 'sky'}>{isReal ? 'Real lab' : 'Guided practice'}</Badge>
              {isReal ? (
                <Badge tone="slate"><IconCamera size={11} /> {minEvidence}+ screenshots</Badge>
              ) : (
                <Badge tone="slate">{stepCounts?.total ?? steps.length} steps</Badge>
              )}
              {isPractice && <Badge tone="emerald">Open to all</Badge>}
              {!isPractice && lab.due_at && <Badge tone={new Date(lab.due_at) < new Date() ? 'rose' : 'amber'}><IconClock size={11} /> Due {formatDateTime(lab.due_at)}</Badge>}
              {running && <Badge tone="emerald" dot="animate-pulse">Session running</Badge>}
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">{lab.title}</h1>
            {lab.summary && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">{lab.summary}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              {data.course ? (
                <Link to={`/courses/${data.course.slug}`} className="inline-flex items-center gap-1 font-medium hover:text-brand-600 dark:hover:text-brand-300">
                  <IconExternalLink size={11} /> {data.course.title}
                </Link>
              ) : (
                <span>
                  {isReal
                    ? 'Real assessment · question-only'
                    : lab.is_practice
                      ? 'Guided practice · open to every learner'
                      : 'Guided lab'}
                </span>
              )}
              <span>{sessions.length} session{sessions.length === 1 ? '' : 's'} started</span>
              {mySession?.last_activity_at && <span>Last activity {timeAgo(mySession.last_activity_at)}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            {running ? (
              <>
                <Button as="a" href={`/labs/session/${mySession.id}`} target="_blank" rel="noopener noreferrer">
                  <IconPlay size={15} /> Resume session
                </Button>
                <Button onClick={start} loading={starting} variant="ghost" size="sm">
                  Start a fresh session
                </Button>
              </>
            ) : (
              <Button
                onClick={start}
                loading={starting}
                size="lg"
                disabled={!infrastructureReady}
                title={!infrastructureReady ? offlineReason : isReal ? 'Open the real lab' : isPractice ? 'Open the practice lab' : 'Launch guided lab'}
              >
                <IconTerminal size={17} />
                {isReal ? 'Start real lab' : isPractice ? 'Start practice lab' : 'Start guided lab'}
              </Button>
            )}
            <p className="max-w-[240px] text-xs leading-5 text-slate-500 dark:text-slate-400 lg:text-right">
              {isReal
                ? `Read the task brief, complete it in the terminal and upload at least ${minEvidence} screenshot${minEvidence === 1 ? '' : 's'} for instructor review.`
                : isPractice
                  ? 'Runs in a real isolated Linux container. Not graded. Start as many sessions as you like.'
                  : 'Finish the required steps, then submit this lab assignment for instructor review.'}
            </p>
          </div>
        </div>
      </Card>

      {labStatus && !labStatus.available && (
        <Alert tone="amber" title="This lab is temporarily unavailable">
          Labs run in real containers, so they cannot start while the Docker provider is offline. Please try again
          later or ask your instructor.
          {labStatus.reason && (
            <p className="mt-2 break-words font-mono text-[11px] leading-5 opacity-80">{labStatus.reason}</p>
          )}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">About this lab</h2>
          <div className="mt-3">
            <Markdown>{lab.description || 'No additional description provided for this lab.'}</Markdown>
          </div>
        </Card>

        <div className="space-y-5">
          {myProgress && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">Your progress</h2>
                {myProgress.completed ? (
                  <Badge tone="emerald"><IconCheckCircle size={11} /> Completed</Badge>
                ) : (
                  <span className="font-display text-lg font-bold tabular-nums text-slate-900 dark:text-white">{myProgress.percent}%</span>
                )}
              </div>
              <div className="mt-3">
                <ProgressBar
                  value={myProgress.completed ? 100 : myProgress.percent}
                  tone={myProgress.completed ? 'emerald' : 'brand'}
                  size="sm"
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {isReal
                  ? `${myProgress.evidenceCount} of ${myProgress.minEvidence} screenshot${myProgress.minEvidence === 1 ? '' : 's'} attached${myProgress.approved ? ' · approved by your instructor' : ''}.`
                  : myProgress.requiredSteps > 0
                    ? `${myProgress.completedSteps} of ${myProgress.requiredSteps} required steps verified.`
                    : myProgress.started
                      ? 'Session started.'
                      : 'Start the lab to begin tracking progress.'}
              </p>
              {Number(lab.time_limit_minutes) > 0 && (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-white/5 dark:text-slate-400">
                  You get {lab.time_limit_minutes} minutes once you start. The session ends automatically at zero, and you can finish early when your required work is complete.
                </p>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">{isReal ? 'Your task' : "What you'll do"}</h2>
            {isReal ? (
              <div className="mt-3 max-h-96 overflow-y-auto pr-1">
                <Markdown>{lab.task_brief || lab.description || 'Your instructor is preparing the task brief.'}</Markdown>
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-white/5 dark:text-slate-400">
                  There are no steps or hints. Complete the task yourself and upload at least {minEvidence} screenshot
                  {minEvidence === 1 ? '' : 's'} as evidence.
                </p>
              </div>
            ) : (
              <>
                <ol className="mt-3 space-y-2.5">
                  {steps.map((step, index) => (
                    <li key={step.id} className="flex gap-2.5 text-sm leading-5 text-slate-600 dark:text-slate-300">
                      {step.my_completed ? (
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white dark:bg-emerald-400 dark:text-night-950"
                          title="You completed this step"
                        >
                          <IconCheck size={11} strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10">
                          {index + 1}
                        </span>
                      )}
                      <span className={step.is_optional && !step.my_completed ? 'text-slate-500 dark:text-slate-400' : ''}>
                        <span className={step.my_completed ? 'font-medium text-slate-800 dark:text-slate-100' : ''}>
                          {step.title}
                        </span>
                        {step.my_completed && (
                          <span className="ml-1.5 rounded bg-emerald-50 px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                            Done
                          </span>
                        )}
                        {step.is_optional && <span className="ml-1.5 rounded bg-slate-100 px-1 py-px text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">optional</span>}
                      </span>
                    </li>
                  ))}
                  {steps.length === 0 && <li className="text-sm text-slate-500">Steps are being prepared.</li>}
                </ol>
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-white/5 dark:text-slate-400">
                  Steps marked <span className="font-medium text-brand-600 dark:text-brand-300">verified</span> complete automatically when you run the right command.
                  {myProgress?.started && (
                    <> Steps with a <span className="font-medium text-emerald-600 dark:text-emerald-300">green tick</span> are the ones you completed in your best session so far.</>
                  )}
                </p>
              </>
            )}
          </Card>

          {sessions.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">Your saved work</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Ended labs stay saved here with their steps and screenshots.
                {!isPractice && ' Submit any completed one for instructor review.'}
              </p>
              <ul className="mt-1 divide-y divide-slate-100 dark:divide-white/5">
                {sessions.slice(0, 5).map((session) => {
                  const state = sessionSubmitState(session);
                  const missingShots = minEvidence - (session.screenshot_count || 0);
                  return (
                    <li key={session.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/labs/session/${session.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-slate-600 transition hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-300">
                          {formatDateTime(session.started_at)}
                        </Link>
                        {session.status === 'running' ? (
                          <Badge tone="emerald" dot="animate-pulse">Running</Badge>
                        ) : (
                          <Badge tone="slate">
                            {session.ended_reason === 'completed'
                              ? 'Completed'
                              : session.ended_reason === 'expired'
                                ? 'Time expired'
                                : session.ended_reason === 'submitted'
                                  ? 'Submitted'
                                  : 'Ended'}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {isReal
                          ? `${session.screenshot_count || 0} of ${minEvidence} required screenshot${minEvidence === 1 ? '' : 's'} attached`
                          : `${session.completed_steps || 0} of ${requiredSteps} required steps · ${session.screenshot_count || 0} screenshot${session.screenshot_count === 1 ? '' : 's'}`}
                      </p>
                      {state === 'submitted' && (
                        <Badge tone="amber" className="mt-2">
                          <IconClock size={11} /> Pending instructor review
                        </Badge>
                      )}
                      {state === 'approved' && (
                        <Badge tone="emerald" className="mt-2">
                          <IconCheckCircle size={11} /> Approved by instructor
                        </Badge>
                      )}
                      {(state === 'eligible' || state === 'changes') && (
                        <div className="mt-2.5">
                          {state === 'changes' && (
                            <p className="mb-1.5 text-[11px] font-medium leading-4 text-rose-600 dark:text-rose-300">
                              Your instructor requested changes. Review the feedback, fix the work and resubmit.
                            </p>
                          )}
                          <Button size="sm" onClick={() => submitSession(session)} loading={submittingId === session.id}>
                            <IconSend size={13} /> {state === 'changes' ? 'Resubmit lab' : 'Submit for review'}
                          </Button>
                        </div>
                      )}
                      {state === 'ineligible' && (
                        <p className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                          {isReal
                            ? `Add ${missingShots} more screenshot${missingShots === 1 ? '' : 's'} inside the session to submit this lab.`
                            : 'Finish all required steps in a session to submit it for review.'}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button as={Link} to="/student/labs" variant="ghost" size="sm">
          Browse more labs <IconArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
}
