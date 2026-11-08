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
  IconCheckCircle,
  IconClock,
  IconExternalLink,
  IconPlay,
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
  const [error, setError] = useState('');

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
  // Every lab — including open-to-all practice labs — needs a running Docker
  // provider, so availability is required for all of them.
  const infrastructureReady = !labStatus || Boolean(labStatus.available);
  const offlineReason = 'This lab cannot start right now. Please try again later.';

  return (
    <div className="space-y-5">
      <Link to="/student/labs" className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300">
        <IconArrowLeft size={13} /> Back to lab catalog
      </Link>

      <Card className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{DIFFICULTIES[lab.difficulty]?.label || lab.difficulty}</Badge>
              <Badge tone="slate">
                <IconClock size={11} /> {lab.estimated_minutes} min
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
              {running && <Badge tone="emerald">Session running</Badge>}
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">{lab.title}</h1>
            {lab.summary && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">{lab.summary}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
              {data.course ? (
                <Link to={`/courses/${data.course.slug}`} className="inline-flex items-center gap-1 hover:text-brand-300">
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
            <p className="max-w-[220px] text-xs leading-5 text-slate-500">
              {isReal
                ? `Read the task brief, complete it in the terminal and upload at least ${minEvidence} screenshot${minEvidence === 1 ? '' : 's'} for instructor review.`
                : isPractice
                  ? 'Runs in a real isolated Linux container. Not graded — start as many sessions as you like.'
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
          <h2 className="font-display text-lg font-semibold">About this lab</h2>
          <div className="mt-3">
            <Markdown>{lab.description || 'No additional description provided for this lab.'}</Markdown>
          </div>
        </Card>

        <div className="space-y-5">
          {myProgress && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold">Your progress</h2>
                {myProgress.completed ? (
                  <Badge tone="emerald"><IconCheckCircle size={11} /> Completed</Badge>
                ) : (
                  <span className="font-mono text-xs font-semibold text-slate-400">{myProgress.percent}%</span>
                )}
              </div>
              <div className="mt-3">
                <ProgressBar
                  value={myProgress.completed ? 100 : myProgress.percent}
                  tone={myProgress.completed ? 'emerald' : 'brand'}
                  size="sm"
                />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                {isReal
                  ? `${myProgress.evidenceCount} of ${myProgress.minEvidence} screenshot${myProgress.minEvidence === 1 ? '' : 's'} attached${myProgress.approved ? ' · approved by your instructor' : ''}.`
                  : myProgress.requiredSteps > 0
                    ? `${myProgress.completedSteps} of ${myProgress.requiredSteps} required steps verified.`
                    : myProgress.started
                      ? 'Session started.'
                      : 'Start the lab to begin tracking progress.'}
              </p>
              {Number(lab.time_limit_minutes) > 0 && (
                <p className="mt-2 border-t border-white/5 pt-2 text-[11px] leading-5 text-slate-500">
                  You get {lab.time_limit_minutes} minutes once you start. The session ends automatically at zero, and you can finish early when your required work is complete.
                </p>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">{isReal ? 'Your task' : "What you'll do"}</h2>
            {isReal ? (
              <div className="mt-3 max-h-96 overflow-y-auto pr-1">
                <Markdown>{lab.task_brief || lab.description || 'Your instructor is preparing the task brief.'}</Markdown>
                <p className="mt-3 border-t border-white/5 pt-3 text-[11px] leading-5 text-slate-500">
                  There are no steps or hints. Complete the task yourself and upload at least {minEvidence} screenshot
                  {minEvidence === 1 ? '' : 's'} as evidence.
                </p>
              </div>
            ) : (
              <>
                <ol className="mt-3 space-y-2.5">
                  {steps.map((step, index) => (
                    <li key={step.id} className="flex gap-2.5 text-xs leading-5 text-slate-400">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 font-mono text-[10px] text-slate-400">
                        {index + 1}
                      </span>
                      <span className={step.is_optional ? 'text-slate-500' : ''}>
                        {step.title}
                        {step.is_optional && <span className="ml-1 text-[10px] uppercase tracking-wider text-slate-600">optional</span>}
                      </span>
                    </li>
                  ))}
                  {steps.length === 0 && <li className="text-xs text-slate-500">Steps are being prepared.</li>}
                </ol>
                <p className="mt-3 border-t border-white/5 pt-3 text-[11px] leading-5 text-slate-500">
                  Steps marked <span className="text-brand-300">verified</span> complete automatically when you run the right command.
                </p>
              </>
            )}
          </Card>

          {sessions.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-base font-semibold">Recent sessions</h2>
              <ul className="mt-2 divide-y divide-white/5">
                {sessions.slice(0, 5).map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-2 py-2 text-[11px]">
                    <Link to={`/labs/session/${session.id}`} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-brand-300">
                      {formatDateTime(session.started_at)}
                    </Link>
                    <span className="flex items-center gap-1.5">
                      {session.status === 'running' && <IconCheckCircle size={11} className="text-emerald-400" />}
                      <span className={session.status === 'running' ? 'text-emerald-300' : 'text-slate-500'}>{session.status}</span>
                    </span>
                  </li>
                ))}
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
