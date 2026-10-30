import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import LabTerminal from '../../components/lab/LabTerminal';
import { Alert, Badge, Button } from '../../components/ui';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconCheckCircle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconCopy,
  IconFileText,
  IconPlay,
  IconRefresh,
  IconServer,
  IconShield,
  IconTerminal,
  IconTrash,
  IconXCircle,
  IconZap,
} from '../../components/icons';
import { REPORT_STATUS } from '../../lib/constants';

function splitInstruction(instruction) {
  const source = String(instruction || '');
  const commands = [];
  const text = source
    .replace(/```(?:bash|sh|shell|zsh|console)?[ \t]*\r?\n([\s\S]*?)```/gi, (_, body) => {
      const command = String(body || '').trim();
      if (command) commands.push(command);
      return '';
    })
    .trim();
  return { text, commands };
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
  const [copiedCmd, setCopiedCmd] = useState(false);

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

  const activeStep = useMemo(
    () => data?.steps?.find((step) => step.id === activeStepId) || null,
    [data, activeStepId]
  );

  const stepScreenshots = useMemo(() => {
    if (!data || !activeStep) return [];
    return data.screenshots.filter((shot) => shot.step_id === activeStep.id);
  }, [data, activeStep]);

  const activeIndex = useMemo(() => {
    if (!data?.steps) return -1;
    return data.steps.findIndex((step) => step.id === activeStepId);
  }, [data?.steps, activeStepId]);

  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < (data?.steps?.length || 0) - 1;

  const goToPrev = () => {
    if (hasPrev) {
      setActiveStepId(data.steps[activeIndex - 1].id);
      setShowHint(false);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      setActiveStepId(data.steps[activeIndex + 1].id);
      setShowHint(false);
    }
  };

  const handleCopyCmd = (cmd) => {
    if (!cmd) return;
    navigator.clipboard?.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleProgress = () => {
    load({ silent: true });
  };

  const openUpload = (stepId, replaceId = null) => {
    pendingStep.current = stepId;
    replaceTarget.current = replaceId;
    fileRef.current?.click();
  };

  // Uploads a screenshot (from the file picker or the clipboard) as step evidence.
  // `source: 'paste'` shows a single paste-specific confirmation instead of the
  // generic upload message.
  const uploadScreenshot = async (file, { stepId = null, replaceId = null, source = 'file' } = {}) => {
    if (!file) return false;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type || '')) {
      toast.error('Screenshots must be a PNG, JPEG, WEBP or GIF image.');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Screenshots must be 5 MB or smaller.');
      return false;
    }
    const form = new FormData();
    form.append('file', file, file.name || 'screenshot.png');
    if (stepId) form.append('stepId', stepId);
    setUploading(true);
    try {
      await api.post(`/labs/sessions/${sessionId}/screenshots`, form);
      if (replaceId) {
        await api.delete(`/labs/screenshots/${replaceId}`);
        toast.success('Screenshot replaced.');
      } else if (source === 'paste') {
        toast.success(
          stepId
            ? 'Screenshot pasted and attached to the current step.'
            : 'Screenshot pasted and attached to your lab evidence.'
        );
      } else {
        toast.success('Screenshot uploaded and attached to your report evidence.');
      }
      await load({ silent: true });
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, replaceId ? 'Could not replace that screenshot.' : 'Could not upload that screenshot.'));
      return false;
    } finally {
      replaceTarget.current = null;
      setUploading(false);
    }
  };

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await uploadScreenshot(file, { stepId: pendingStep.current, replaceId: replaceTarget.current });
  };

  // Paste a screenshot (PrintScreen / snipping tool / copied image) straight
  // into the active step's evidence with Ctrl+V anywhere in this lab section.
  useEffect(() => {
    if (loading || !data || error) return undefined;
    const handlePaste = async (event) => {
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;
      const images = [];
      for (const item of items) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile?.();
        if (file && /^image\//.test(file.type || '')) images.push(file);
      }
      if (images.length === 0) return;
      event.preventDefault();
      if (uploading) {
        toast.error('A screenshot is still uploading — try pasting again in a moment.');
        return;
      }
      const stepId = activeStepId ?? null;
      for (const file of images) {
        // eslint-disable-next-line no-await-in-loop
        await uploadScreenshot(file, { stepId, source: 'paste' });
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data, error, activeStepId, uploading, sessionId]);

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
    if (
      !window.confirm(
        isPractice
          ? 'End this practice session? Your simulated filesystem will be discarded and you can start a fresh one any time.'
          : 'Stop this lab session? You can start a new one later, but this terminal will close.'
      )
    )
      return;
    setStopping(true);
    try {
      await api.post(`/labs/sessions/${sessionId}/stop`);
      toast.info(isPractice ? 'Practice session ended.' : 'Lab session stopped.');
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
      toast.success(
        response.reused
          ? 'Resumed an existing session.'
          : isPractice
            ? 'Fresh practice terminal started.'
            : 'New lab session started.'
      );
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
      window.open(`/student/reports/${response.report.id}`, '_blank');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate the report.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleExit = () => {
    if (window.opener) {
      window.close();
    } else if (data?.session?.lab_id) {
      navigate(`/labs/${data.session.lab_id}`);
    } else {
      navigate('/student/labs');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-100 text-slate-600 dark:bg-[#06080d] dark:text-slate-300">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent mb-3" />
        <p className="font-mono text-sm text-slate-500 dark:text-slate-400">Preparing your lab workstation…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-100 p-6 text-center text-slate-700 dark:bg-[#06080d] dark:text-slate-300">
        <div className="w-full max-w-md">
          <Alert tone="error" title="Session unavailable">
            {error || 'This lab session could not be found or has expired.'}
          </Alert>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button as={Link} to="/student/labs" variant="secondary">
              Back to labs
            </Button>
            <Button variant="ghost" onClick={() => load()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { session, steps, progress, report } = data;
  const isPractice = Boolean(data.lab?.is_practice || session.containerless);
  const running = session.status === 'running';
  const reportStatus = report ? REPORT_STATUS[report.status] : null;
  const completedCount = steps.filter((step) => step.completed).length;

  const student = data.student || (session.student_name ? {
    id: session.student_id,
    name: session.student_name,
    shell_user: session.shell_user,
    hostname: session.hostname,
  } : null);

  const instructionParts = splitInstruction(activeStep?.instruction);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 font-sans select-none dark:bg-[#06080d] dark:text-slate-100">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFileSelected}
      />

      <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-night-950">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={handleExit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
            title="Exit workstation"
          >
            <IconArrowLeft size={15} />
          </button>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-sky-500 text-xs font-bold text-white shadow-sm shadow-brand-500/20">
            C+
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white" title={data.lab?.title || 'Hands-on Lab'}>
                {data.lab?.title || 'Hands-on Lab'}
              </h1>
              <Badge tone={running ? 'emerald' : 'slate'} dot={running ? 'animate-pulse' : true}>
                {running ? 'Online' : session.status}
              </Badge>
            </div>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {isPractice
                ? 'Simulated in-browser terminal'
                : session.lab_server_name
                  ? `${session.lab_server_name} · isolated Linux container`
                  : 'Isolated Linux container'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {progress.allRequiredCompleted && !isPractice && (
            report ? (
              <Button as={Link} to={`/student/reports/${report.id}`} target="_blank" size="xs" variant="secondary" className="gap-1">
                <IconFileText size={12} /> View Report
              </Button>
            ) : (
              <Button size="xs" onClick={generateReport} loading={generating} className="gap-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-500/20">
                <IconZap size={12} /> Get Report
              </Button>
            )
          )}

          <Button variant="ghost" size="xs" onClick={() => load({ silent: true })} title="Sync session state">
            <IconRefresh size={13} />
          </Button>

          {running ? (
            <Button variant="danger" size="xs" onClick={stopSession} loading={stopping} className="gap-1 rounded-xl px-3">
              <IconXCircle size={13} /> Stop
            </Button>
          ) : (
            <Button size="xs" onClick={restart} loading={starting} className="gap-1 rounded-xl px-3">
              <IconPlay size={13} /> Restart
            </Button>
          )}

          <button
            type="button"
            onClick={handleExit}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Body: Instructions on LEFT, Terminal on RIGHT */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[440px_1fr] xl:grid-cols-[480px_1fr] 2xl:grid-cols-[540px_1fr] gap-3 p-3 overflow-hidden">
        {/* Left Column: Interactive Lab Instructions & Step Workflow */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-night-950/90 dark:shadow-2xl dark:backdrop-blur">
          {/* Header Stepper and Progress */}
          <div className="flex shrink-0 flex-col border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-night-900/80">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm dark:border-brand-400/30 dark:bg-brand-400/10 dark:text-brand-300">
                  <IconClipboard size={15} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Lab Guide & Steps</h2>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    Step {activeIndex >= 0 ? activeIndex + 1 : 1} of {steps.length} · <span className="font-medium text-emerald-700 dark:text-emerald-400">{completedCount} completed</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
                  title="Previous step"
                >
                  <IconChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={!hasNext}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
                  title="Next step"
                >
                  <IconChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Overall Progress</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">{Math.round(progress.percent)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Target Environment Badge Strip */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 dark:border-white/5 dark:bg-night-950/60 dark:text-slate-400">
            {isPractice ? (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <IconTerminal size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">Simulated practice terminal</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <IconShield size={11} /> In-browser
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <IconServer size={12} className="shrink-0 text-cyan-700 dark:text-brand-400" />
                  <span className="truncate">Ubuntu 22.04 LTS (x86_64)</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <IconShield size={11} /> Root Privileges
                </span>
              </>
            )}
          </div>

          {/* Horizontal Step Navigation Ribbon */}
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-night-950/70">
            {steps.map((step, index) => {
              const active = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  type="button"
                  title={step.title}
                  onClick={() => {
                    setActiveStepId(step.id);
                    setShowHint(false);
                  }}
                  className={`group flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    active
                      ? 'border-cyan-300 bg-cyan-50 font-semibold text-slate-900 shadow-sm dark:border-brand-400/60 dark:bg-brand-400/15 dark:text-white dark:shadow-brand-400/10'
                      : step.completed
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/15'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      step.completed
                        ? 'bg-emerald-500 text-white dark:bg-emerald-400 dark:text-night-950'
                        : active
                          ? 'bg-cyan-600 text-white dark:bg-brand-400 dark:text-night-950'
                          : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400 dark:group-hover:text-slate-200'
                    }`}
                  >
                    {step.completed ? <IconCheck size={10} strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="truncate text-xs">{step.title}</span>
                </button>
              );
            })}
          </div>

          {/* Active Step Details Scrollable View */}
          <div className="flex-1 min-h-0 space-y-3.5 overflow-y-auto p-4 select-text">
            {activeStep ? (
              <div className="space-y-3.5">
                {/* Step Title & Points Card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-night-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-cyan-800 dark:border-brand-400/25 dark:bg-brand-400/10 dark:text-brand-300">
                        Step {activeIndex >= 0 ? activeIndex + 1 : 1}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {activeStep.is_optional ? 'Optional' : isPractice ? 'Practice step' : `${activeStep.points} points`}
                      </span>
                    </div>
                    {activeStep.completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                        <IconCheckCircle size={11} /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-white/5 dark:text-slate-300">
                        {activeStep.verification === 'manual' ? 'Manual confirmation' : 'Checks your terminal output'}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-display text-base font-semibold leading-snug text-slate-900 dark:text-white">
                    {activeStep.title}
                  </h3>
                </div>

                {/* Instruction Content */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-night-900/30">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Instructions</p>
                  {instructionParts.text ? (
                    <div className="markdown max-w-none text-sm leading-6 text-slate-700 dark:text-slate-300">
                      <Markdown>{instructionParts.text}</Markdown>
                    </div>
                  ) : null}
                  {!instructionParts.text && instructionParts.commands.length === 0 && (
                    <p className="text-sm text-slate-500">No instructions for this step.</p>
                  )}
                  {(instructionParts?.commands || []).map((command) => (
                    <div key={command} className="terminal-surface mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Command to run</span>
                        <button
                          type="button"
                          onClick={() => handleCopyCmd(command)}
                          className="inline-flex items-center gap-1 text-xs text-emerald-300 transition hover:text-white"
                        >
                          <IconCopy size={12} /> {copiedCmd ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-sm leading-6 text-emerald-300">
                        {command}
                      </pre>
                    </div>
                  ))}
                </div>

                {/* Hint Drawer */}
                {activeStep.hint && (
                  <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[0.04]">
                    <button
                      type="button"
                      onClick={() => setShowHint((current) => !current)}
                      className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-medium text-amber-800 transition hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-400/[0.06]"
                    >
                      <span className="flex items-center gap-2">
                        <IconChevronDown size={13} className={`transition-transform duration-200 ${showHint ? 'rotate-180' : ''}`} />
                        <span>Need a hint?</span>
                      </span>
                      <span className="text-xs uppercase tracking-wider opacity-75">{showHint ? 'Hide' : 'Show'}</span>
                    </button>
                    {showHint && (
                      <div className="border-t border-amber-200 p-3 text-sm leading-6 text-amber-950 dark:border-amber-400/15 dark:text-amber-100/90">
                        <Markdown>{activeStep.hint}</Markdown>
                      </div>
                    )}
                  </div>
                )}

                {/* Verified Command Box */}
                {activeStep.completed && activeStep.command_used && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-400/30 dark:bg-emerald-400/[0.05]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                        <IconCheckCircle size={12} /> Verified command
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCmd(activeStep.command_used)}
                        className="inline-flex items-center gap-1 text-xs text-emerald-700 transition hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-white"
                      >
                        <IconCopy size={11} /> {copiedCmd ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="mt-1.5 break-words rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 font-mono text-sm text-emerald-300">
                      # {activeStep.command_used}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {!activeStep.completed && activeStep.verification === 'manual' && (
                    <Button size="sm" variant="primary" onClick={() => markComplete(activeStep)} className="gap-1.5">
                      <IconCheckCircle size={13} /> Mark Step Complete
                    </Button>
                  )}
                  {activeStep.completed && hasNext && (
                    <Button size="sm" variant="primary" onClick={goToNext} className="gap-1.5">
                      Next Step <IconArrowRight size={13} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openUpload(activeStep.id)} loading={uploading} className="gap-1.5">
                    <IconCamera size={13} /> Add Screenshot
                  </Button>
                </div>

                {/* Step Evidence */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-night-900/30">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <IconCamera size={11} /> Step evidence ({stepScreenshots.length})
                  </p>
                  {stepScreenshots.length === 0 ? (
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {isPractice
                        ? 'Screenshots stay with this session as your own notes. Practice labs are not graded.'
                        : 'Terminal screenshots attached here are automatically included in your lab report.'}
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {stepScreenshots.map((shot) => (
                        <div key={shot.id} className="group relative overflow-hidden rounded-lg border border-white/10 bg-night-950">
                          <a href={shot.file_path} target="_blank" rel="noreferrer" title="Preview screenshot">
                            <img src={shot.file_path} alt={shot.original_name || 'Lab screenshot'} className="h-20 w-full object-cover transition group-hover:scale-105" />
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
                            className="absolute inset-x-1 bottom-1 rounded-md bg-night-950/90 py-1 text-[10px] text-slate-300 opacity-0 transition hover:text-brand-300 group-hover:opacity-100"
                          >
                            <IconRefresh size={10} className="mr-1 inline" /> Replace
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openUpload(activeStep.id)}
                    onPaste={(event) => {
                      const imageItem = Array.from(event.clipboardData?.items || []).find(
                        (item) => item.kind === 'file' && /^image\//.test(item.type || '')
                      );
                      if (!imageItem) return;
                      event.preventDefault();
                      const file = imageItem.getAsFile();
                      if (file) uploadScreenshot(file, { stepId: activeStep.id });
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white py-2.5 text-xs text-slate-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 dark:border-white/15 dark:bg-white/[0.02] dark:text-slate-400 dark:hover:border-brand-400/50 dark:hover:bg-brand-400/[0.06] dark:hover:text-brand-300"
                    title="Press Ctrl+V anywhere in this lab to paste a screenshot, or click to browse"
                  >
                    <IconClipboard size={12} /> Paste screenshot (Ctrl+V) or click to browse
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">This lab has no steps configured yet.</p>
            )}
          </div>

          {/* Footer Report Bar */}
          {report && !isPractice && (
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-night-950/70">
              <Link to={`/student/reports/${report.id}`} target="_blank" className="flex items-center justify-between gap-2 text-xs transition hover:text-brand-300">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <IconFileText size={13} className="text-brand-400" /> {report.title}
                </span>
                {reportStatus && <Badge tone={reportStatus.tone}>{reportStatus.label}</Badge>}
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Lab Terminal */}
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <LabTerminal
            sessionId={Number(session.id)}
            status={session.status}
            initialHistory={session.history || []}
            welcome={data.lab?.terminal_welcome || ''}
            student={student}
            practice={isPractice}
            className="h-full w-full"
            onProgress={handleProgress}
          />
        </div>
      </main>
    </div>
  );
}
