import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import LabTerminal from '../../components/lab/LabTerminal';
import LabSubmitCard from '../../components/lab/LabSubmitCard';
import { Alert, Badge, Button, Card, ProgressBar, Skeleton } from '../../components/ui';
import {
  IconArrowLeft,
  IconCamera,
  IconCheckCircle,
  IconChevronDown,
  IconClock,
  IconFileText,
  IconPlay,
  IconRefresh,
  IconTerminal,
  IconTrash,
  IconUpload,
  IconXCircle,
  IconZap,
} from '../../components/icons';
import { REPORT_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

function minutesLeft(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.round(diff / 60000));
}

export default function LabSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStepId, setActiveStepId] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(null);
  const fileRef = useRef(null);
  const pendingStep = useRef(null);
  const replaceTarget = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const { data: response } = await api.get(`/labs/sessions/${sessionId}`);
        setData(response);
        setError('');
        setActiveStepId((current) => {
          if (current && response.steps.some((step) => step.id === current)) return current;
          const next = response.steps.find((step) => !step.completed && !step.is_optional) || response.steps[0];
          return next?.id ?? null;
        });
      } catch (err) {
        setError(getErrorMessage(err, 'Unable to load this lab session.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setRemaining(minutesLeft(data?.session?.expires_at));
    const timer = window.setInterval(() => setRemaining(minutesLeft(data?.session?.expires_at)), 30000);
    return () => window.clearInterval(timer);
  }, [data?.session?.expires_at]);

  const activeStep = useMemo(
    () => data?.steps?.find((step) => step.id === activeStepId) || null,
    [data, activeStepId]
  );

  const stepScreenshots = useMemo(() => {
    if (!data || !activeStep) return [];
    return data.screenshots.filter((shot) => shot.step_id === activeStep.id);
  }, [data, activeStep]);

  const handleProgress = () => {
    load({ silent: true });
  };

  const openUpload = (stepId, replaceId = null) => {
    pendingStep.current = stepId;
    replaceTarget.current = replaceId;
    fileRef.current?.click();
  };

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Screenshots must be 5 MB or smaller.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    if (pendingStep.current) form.append('stepId', pendingStep.current);
    const replacing = replaceTarget.current;
    setUploading(true);
    try {
      await api.post(`/labs/sessions/${sessionId}/screenshots`, form);
      if (replacing) {
        await api.delete(`/labs/screenshots/${replacing}`);
        toast.success('Screenshot replaced.');
      } else {
        toast.success('Screenshot uploaded and attached to your report evidence.');
      }
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, replacing ? 'Could not replace that screenshot.' : 'Could not upload that screenshot.'));
    } finally {
      replaceTarget.current = null;
      setUploading(false);
    }
  };

  const deleteScreenshot = async (screenshotId) => {
    if (!window.confirm('Remove this screenshot from your evidence?')) return;
    try {
      await api.delete(`/labs/screenshots/${screenshotId}`);
      setData((current) => ({ ...current, screenshots: current.screenshots.filter((shot) => shot.id !== screenshotId) }));
      toast.success('Screenshot removed.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not remove that screenshot.'));
    }
  };

  const markComplete = async (step) => {
    try {
      await api.post(`/labs/sessions/${sessionId}/steps/${step.id}/complete`, { note: 'Confirmed in session UI' });
      toast.success('Step marked complete.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not complete that step.'));
    }
  };

  const stopSession = async () => {
    if (!window.confirm('Stop this lab session? You can start a new one later, but this terminal will close.')) return;
    setStopping(true);
    try {
      await api.post(`/labs/sessions/${sessionId}/stop`);
      toast.info('Lab session stopped.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not stop the session.'));
    } finally {
      setStopping(false);
    }
  };

  const restart = async () => {
    setStarting(true);
    try {
      const { data: response } = await api.post(`/labs/${data.session.lab_id}/sessions`, {}, { timeout: 300000 });
      toast.success(response.reused ? 'Resumed an existing session.' : 'New lab session started.');
      navigate(`/labs/session/${response.session.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not start a new session.'));
    } finally {
      setStarting(false);
    }
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      const { data: response } = await api.post(`/reports/sessions/${sessionId}/generate`);
      toast.success('Report draft generated from your verified steps.');
      navigate(`/student/reports/${response.report.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate the report.'));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Alert tone="error" title="Session unavailable">
          {error || 'This lab session could not be found.'}
        </Alert>
        <Button as={Link} to="/student/labs" variant="secondary" className="mt-4">
          Back to labs
        </Button>
      </div>
    );
  }

  const { session, steps, progress, report, submission } = data;
  const running = session.status === 'running';
  const reportStatus = report ? REPORT_STATUS[report.status] : null;
  const completedCount = steps.filter((step) => step.completed).length;

  const submitLab = async ({ note, file }) => {
    setSubmitting(true);
    try {
      const form = new FormData();
      if (note) form.append('note', note);
      if (file) form.append('file', file);
      const { data: response } = await api.post(`/labs/sessions/${sessionId}/submit`, form);
      setData((current) => ({ ...current, submission: response.submission }));
      toast.success('Lab submitted to your instructor.');
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit this lab.'));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFileSelected} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/labs/${session.lab_id}`}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300"
          >
            <IconArrowLeft size={13} /> Back to lab
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-xl font-semibold sm:text-2xl">
            {data.lab?.title || 'Lab session'}
            <Badge tone={running ? 'emerald' : 'slate'}>
              <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {running ? 'Running' : session.status}
            </Badge>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="font-mono">session #{session.id}</span>
            <span>{data.screenshots.length} screenshots</span>
            {running && remaining !== null && (
              <span className={`inline-flex items-center gap-1 ${remaining < 5 ? 'text-amber-300' : ''}`}>
                <IconClock size={11} /> {remaining} min left
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => load({ silent: true })}>
            <IconRefresh size={13} /> Refresh
          </Button>
          {running ? (
            <Button variant="danger" size="sm" onClick={stopSession} loading={stopping}>
              <IconXCircle size={14} /> Stop session
            </Button>
          ) : (
            <Button size="sm" onClick={restart} loading={starting}>
              <IconPlay size={14} /> Start new session
            </Button>
          )}
        </div>
      </div>

      {progress.allRequiredCompleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
              <IconCheckCircle size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-200">All required steps verified.</p>
              <p className="text-[11px] text-emerald-200/60">Upload the finished lab below, or generate a full report if your course asks for one.</p>
            </div>
          </div>
          {report ? (
            <Button as={Link} to={`/student/reports/${report.id}`} size="sm" variant="secondary">
              <IconFileText size={14} /> Open report
              {reportStatus && <span className="text-[10px] text-slate-400">· {reportStatus.label}</span>}
            </Button>
          ) : (
            <Button size="sm" onClick={generateReport} loading={generating}>
              <IconZap size={14} /> Generate report
            </Button>
          )}
        </div>
      )}

      <LabSubmitCard
        submission={submission}
        requirements={data.lab?.submission_requirements || ''}
        allRequiredCompleted={progress.allRequiredCompleted}
        progressPercent={progress.percent}
        serverName={session.lab_server_name}
        onSubmit={submitLab}
        submitting={submitting}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <LabTerminal
            sessionId={Number(session.id)}
            status={session.status}
            initialHistory={session.history || []}
            welcome={data.lab?.terminal_welcome || ''}
            student={data.student || (session.student_name ? {
              id: session.student_id,
              name: session.student_name,
              shell_user: session.shell_user,
              hostname: session.hostname,
            } : null)}
            onProgress={handleProgress}
          />
          <p className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-500">
            <IconTerminal size={11} />
            Run the commands from the steps in your isolated Linux container. Verified commands tick off automatically.
            {steps.some((step) => step.verification === 'manual') && ' Manual steps need confirmation in the panel.'}
          </p>
        </div>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Lab checklist</span>
              <span className="font-mono text-slate-500">
                {completedCount}/{steps.length}
              </span>
            </div>
            <ProgressBar value={progress.percent} size="sm" tone={progress.allRequiredCompleted ? 'emerald' : 'brand'} className="mt-2" />
            <p className="mt-1.5 text-[10px] text-slate-500">
              {progress.completedRequired} of {progress.requiredTotal} required steps complete
              {steps.length > progress.requiredTotal ? ` · ${steps.length - progress.requiredTotal} optional` : ''}
            </p>
          </div>

          <ol className="max-h-[220px] overflow-y-auto border-b border-white/10 p-2">
            {steps.map((step, index) => {
              const active = step.id === activeStepId;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStepId(step.id);
                      setShowHint(false);
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                      active ? 'bg-brand-400/10' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                        step.completed
                          ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                          : active
                            ? 'border-brand-400/60 text-brand-300'
                            : 'border-white/15 text-slate-500'
                      }`}
                    >
                      {step.completed ? <IconCheckCircle size={12} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs ${active ? 'text-white' : step.completed ? 'text-slate-400' : 'text-slate-300'}`}>
                        {step.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-600">
                        {step.is_optional ? 'Optional' : `${step.points} pts`}
                        {step.verification === 'manual' ? ' - confirm in panel' : ' - auto-verified'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="flex-1 overflow-y-auto p-4">
            {activeStep ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-sm font-semibold leading-5 text-white">{activeStep.title}</h2>
                    {activeStep.completed && <Badge tone="emerald">Verified</Badge>}
                  </div>
                  <div className="mt-2 text-xs">
                    <Markdown>{activeStep.instruction}</Markdown>
                  </div>
                </div>

                {activeStep.hint && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowHint((current) => !current)}
                      className="flex items-center gap-1 text-[11px] font-medium text-brand-300 transition hover:text-brand-200"
                    >
                      <IconChevronDown size={12} className={`transition ${showHint ? 'rotate-180' : ''}`} /> {showHint ? 'Hide hint' : 'Need a hint?'}
                    </button>
                    {showHint && (
                      <div className="mt-2 rounded-lg border border-brand-400/20 bg-brand-400/5 p-2.5 text-[11px] leading-5 text-slate-300">
                        {activeStep.hint}
                      </div>
                    )}
                  </div>
                )}

                {activeStep.completed && activeStep.command_used && (
                  <div className="rounded-lg border border-white/5 bg-night-950/60 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Verified command</p>
                    <code className="mt-1 block break-words font-mono text-[11px] text-emerald-300">{activeStep.command_used}</code>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {!activeStep.completed && activeStep.verification === 'manual' && (
                    <Button size="sm" variant="secondary" onClick={() => markComplete(activeStep)}>
                      <IconCheckCircle size={13} /> Mark complete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openUpload(activeStep.id)} loading={uploading}>
                    <IconUpload size={13} /> Add screenshot
                  </Button>
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    <IconCamera size={11} /> Evidence for this step ({stepScreenshots.length})
                  </p>
                  {stepScreenshots.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-slate-600">
                      Attach terminal output screenshots, they are included in your report automatically.
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {stepScreenshots.map((shot) => (
                        <div key={shot.id} className="group relative overflow-hidden rounded-lg border border-white/10">
                          <a href={shot.file_path} target="_blank" rel="noreferrer" title="Preview screenshot">
                            <img src={shot.file_path} alt={shot.original_name || 'Lab screenshot'} className="h-20 w-full object-cover" />
                          </a>
                          <button
                            type="button"
                            onClick={() => deleteScreenshot(shot.id)}
                            className="absolute right-1 top-1 rounded-md bg-night-950/80 p-1 text-slate-400 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                            aria-label="Delete screenshot"
                          >
                            <IconTrash size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openUpload(activeStep.id, shot.id)}
                            className="absolute inset-x-1 bottom-1 rounded-md bg-night-950/85 py-1 text-[10px] text-slate-300 opacity-0 transition hover:text-brand-300 group-hover:opacity-100"
                          >
                            <IconRefresh size={10} className="mr-1 inline" /> Replace
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">This lab has no steps configured yet.</p>
            )}
          </div>

          {report && (
            <div className="border-t border-white/10 bg-night-950/40 p-3">
              <Link to={`/student/reports/${report.id}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <IconFileText size={13} /> {report.title}
                </span>
                {reportStatus && <Badge tone={reportStatus.tone}>{reportStatus.label}</Badge>}
              </Link>
            </div>
          )}
        </Card>
      </div>

      <p className="text-center text-[10px] text-slate-600">
        Session started {formatDateTime(session.started_at)}
        {session.expires_at ? ` · expires ${formatDateTime(session.expires_at)}` : ''}
      </p>
    </div>
  );
}
