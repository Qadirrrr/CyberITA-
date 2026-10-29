import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import { Alert, Badge, Button, Card, Skeleton } from '../../components/ui';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconExternalLink,
  IconPlay,
  IconShield,
  IconTerminal,
  IconZap,
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
          data?.lab?.is_practice
            ? 'Practice terminal opened in a new tab.'
            : 'Real lab started in a new tab.'
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

  const { lab, steps, sessions = [], mySession, stepCounts } = data;
  const running = mySession?.status === 'running';
  const tone = DIFFICULTIES[lab.difficulty]?.tone || 'brand';
  const isPractice = Boolean(lab.is_practice);
  // Practice terminals are container-less, so they never depend on Docker.
  const infrastructureReady = isPractice || !labStatus || Boolean(labStatus.available);
  const offlineReason = labStatus?.reason || 'The Docker container runtime is not currently running on this server.';

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
              <Badge tone="slate">{stepCounts?.total ?? steps.length} steps</Badge>
              {isPractice ? (
                <>
                  <Badge tone="emerald">Practice · not graded</Badge>
                  <Badge tone="emerald">
                    <IconShield size={11} /> No container
                  </Badge>
                </>
              ) : (
                <Badge tone="sky">
                  <IconShield size={11} /> Real container
                </Badge>
              )}
              {running && <Badge tone="emerald">Session running</Badge>}
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">{lab.title}</h1>
            {lab.summary && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{lab.summary}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
              {data.course ? (
                <Link to={`/courses/${data.course.slug}`} className="inline-flex items-center gap-1 hover:text-brand-300">
                  <IconExternalLink size={11} /> {data.course.title}
                </Link>
              ) : (
                <span>{lab.is_practice ? 'Practice lab · open to every learner' : 'Independent lab'}</span>
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
                title={!infrastructureReady ? offlineReason : isPractice ? 'Open the practice terminal' : 'Launch hands-on lab'}
              >
                {isPractice ? <IconZap size={17} /> : <IconTerminal size={17} />}
                {isPractice ? 'Start practice terminal' : 'Start real lab'}
              </Button>
            )}
            <p className="max-w-[190px] text-[10px] leading-4 text-slate-500">
              {isPractice
                ? 'Runs entirely in your browser. No container, no setup, and you can start as many sessions as you like.'
                : 'Runs in an isolated Linux container with full terminal access. Sessions expire automatically.'}
            </p>
          </div>
        </div>
      </Card>

      {isPractice ? (
        <Alert tone="info" title="Container-less practice terminal">
          This practice lab runs in a simulated Ubuntu shell inside your browser — no Docker container is created, so it
          starts instantly and keeps working even when the lab infrastructure is offline. It is not graded, needs no
          practical report and is not tied to a course, so you can start as many sessions as you like.
        </Alert>
      ) : null}

      {!isPractice && labStatus && !labStatus.available && (
        <Alert tone="amber" title="Real Lab Infrastructure Offline">
          {offlineReason}{' '}
          Course practicals need a running Docker engine on the server — ask the administrator to start it, then reload
          this page. Practice terminals are unaffected.
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
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">What you'll do</h2>
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
