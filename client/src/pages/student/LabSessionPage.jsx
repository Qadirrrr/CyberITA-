import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import LabTerminal from '../../components/lab/LabTerminal';
import { Alert, Badge, Button, Meta } from '../../components/ui';
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
  IconClock,
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
  const [remaining, setRemaining] = useState(null);
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
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#06080d] text-slate-300">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent mb-3" />
        <p className="font-mono text-xs text-slate-400">Preparing your lab workstation…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#06080d] p-6 text-center text-slate-300">
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

  const studentDisplay = (() => {
    if (!student) return 'student@cyberita-lab';
    const shell = student.shell_user || student.shellUser || (student.name ? String(student.name).toLowerCase().split(' ')[0].replace(/[^a-z0-9_-]/g, '') : 'student');
    const host = student.hostname || 'cyberita-lab';
    return `${shell}@${host}`;
  })();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#06080d] text-slate-100 font-sans select-none">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Top Workstation Navigation Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-night-950/95 px-4 backdrop-blur z-30">
        {/* Left: Branding & Lab Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleExit}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
            title="Exit workstation"
          >
            <IconArrowLeft size={14} />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-600 to-sky-500 text-xs font-bold text-white shadow-md shadow-brand-500/20">
              C+
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-sm font-semibold text-white max-w-[200px] sm:max-w-xs md:max-w-sm lg:max-w-md">
                  {data.lab?.title || 'Hands-on Lab'}
                </h1>
                <Badge tone={running ? 'emerald' : 'slate'} dot={running ? 'animate-pulse' : true}>
                  {running ? 'Online' : session.status}
                </Badge>
                {isPractice && <Meta>Practice · no container</Meta>}
              </div>
              <p className="hidden text-[10px] text-slate-500 truncate sm:block">
                Session #{session.id} ·{' '}
                {isPractice
                  ? 'Practice terminal · simulated · no container'
                  : session.lab_server_name
                    ? `${session.lab_server_name} · isolated Linux container`
                    : 'Isolated Linux container'}
              </p>
            </div>
          </div>
        </div>

        {/* Center: Live Timer & Progress */}
        <div className="hidden lg:flex items-center gap-4 shrink-0">
          {running && isPractice && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-mono text-emerald-300">
              <IconZap size={12} />
              <span>Practice · unlimited</span>
            </div>
          )}
          {running && !isPractice && remaining !== null && (
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono transition-all ${
                remaining < 10
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-300 animate-pulse'
                  : 'border-white/10 bg-white/[0.04] text-slate-300'
              }`}
            >
              <IconClock size={12} className={remaining < 10 ? 'text-amber-400' : 'text-slate-400'} />
              <span>{remaining}m remaining</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[11px] text-slate-400">
              Step <span className="font-medium text-white">{activeIndex >= 0 ? activeIndex + 1 : 1}</span> of {steps.length}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 via-sky-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-semibold text-emerald-400">{Math.round(progress.percent)}%</span>
          </div>
        </div>

        {/* Right: Identity Chip, Refresh, Stop & Exit */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-300">
            <IconTerminal size={12} />
            <span className="truncate max-w-[170px]">{studentDisplay}</span>
          </div>

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
            <Button variant="danger" size="xs" onClick={stopSession} loading={stopping} className="gap-1">
              <IconXCircle size={13} /> Stop
            </Button>
          ) : (
            <Button size="xs" onClick={restart} loading={starting} className="gap-1">
              <IconPlay size={13} /> Restart
            </Button>
          )}

          <button
            type="button"
            onClick={handleExit}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Body: Instructions on LEFT, Terminal on RIGHT */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[440px_1fr] xl:grid-cols-[480px_1fr] 2xl:grid-cols-[540px_1fr] gap-3 p-3 overflow-hidden">
        {/* Left Column: Interactive Lab Instructions & Step Workflow */}
        <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-night-950/90 shadow-2xl backdrop-blur overflow-hidden">
          {/* Header Stepper and Progress */}
          <div className="flex shrink-0 flex-col border-b border-white/10 bg-night-900/80 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand-400/30 bg-brand-400/10 text-brand-300 shadow-sm shadow-brand-500/10">
                  <IconClipboard size={15} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-white">Lab Guide & Steps</h2>
                  <p className="truncate text-[11px] text-slate-400">
                    Step {activeIndex >= 0 ? activeIndex + 1 : 1} of {steps.length} · <span className="font-medium text-emerald-400">{completedCount} completed</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={!hasPrev}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  title="Previous step"
                >
                  <IconChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={!hasNext}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  title="Next step"
                >
                  <IconChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="font-medium uppercase tracking-wider text-slate-400">Overall Progress</span>
                <span className="font-mono font-semibold text-emerald-300">{Math.round(progress.percent)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 via-sky-400 to-emerald-400 transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Target Environment Badge Strip */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 bg-night-950/60 px-4 py-2 text-[10.5px] text-slate-400">
            {isPractice ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <IconTerminal size={12} className="text-emerald-400" />
                  <span>Practice terminal · simulated · no container</span>
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <IconShield size={11} /> Sandboxed in-browser session
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <IconServer size={12} className="text-brand-400" />
                  <span>Ubuntu 22.04 LTS (x86_64)</span>
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <IconShield size={11} /> Root Privileges
                </span>
              </>
            )}
          </div>

          {/* Horizontal Step Navigation Ribbon */}
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/10 bg-night-950/70 p-2.5">
            {steps.map((step, index) => {
              const active = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setActiveStepId(step.id);
                    setShowHint(false);
                  }}
                  className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    active
                      ? 'border-brand-400/60 bg-brand-400/15 font-medium text-white shadow-sm shadow-brand-400/10'
                      : step.completed
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      step.completed
                        ? 'bg-emerald-400 text-night-950'
                        : active
                          ? 'bg-brand-400 text-night-950'
                          : 'bg-white/10 text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    {step.completed ? <IconCheck size={10} strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="max-w-[110px] truncate text-[11px]">{step.title}</span>
                </button>
              );
            })}
          </div>

          {/* Active Step Details Scrollable View */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 select-text">
            {activeStep ? (
              <div className="space-y-3.5">
                {/* Step Title & Points Card */}
                <div className="rounded-xl border border-white/10 bg-night-900/40 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-brand-400/25 bg-brand-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-brand-300">
                        Step {activeIndex >= 0 ? activeIndex + 1 : 1}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {activeStep.is_optional ? 'Optional' : isPractice ? 'Practice step' : `${activeStep.points} points`}
                      </span>
                    </div>
                    {activeStep.completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        <IconCheckCircle size={11} /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                        {activeStep.verification === 'manual' ? 'Manual Confirmation' : 'Auto Terminal Verification'}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-display text-sm font-semibold leading-snug text-white">
                    {activeStep.title}
                  </h3>
                </div>

                {/* Instruction Content */}
                <div className="rounded-xl border border-white/10 bg-night-900/30 p-3.5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Instructions</p>
                  <div className="prose prose-invert max-w-none text-xs leading-6 text-slate-300">
                    <Markdown>{activeStep.instruction}</Markdown>
                  </div>
                </div>

                {/* Hint Drawer */}
                {activeStep.hint && (
                  <div className="overflow-hidden rounded-xl border border-amber-400/25 bg-amber-400/[0.04]">
                    <button
                      type="button"
                      onClick={() => setShowHint((current) => !current)}
                      className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-amber-300 transition hover:bg-amber-400/[0.06]"
                    >
                      <span className="flex items-center gap-2">
                        <IconChevronDown size={13} className={`transition-transform duration-200 ${showHint ? 'rotate-180' : ''}`} />
                        <span>Need a Hint or Help?</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wider opacity-75">{showHint ? 'Hide' : 'Show'}</span>
                    </button>
                    {showHint && (
                      <div className="border-t border-amber-400/15 p-3 text-xs leading-5 text-amber-100/90">
                        <Markdown>{activeStep.hint}</Markdown>
                      </div>
                    )}
                  </div>
                )}

                {/* Verified Command Box */}
                {activeStep.completed && activeStep.command_used && (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                        <IconCheckCircle size={12} /> Verified Command
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCmd(activeStep.command_used)}
                        className="inline-flex items-center gap-1 text-[10px] text-emerald-300 transition hover:text-white"
                      >
                        <IconCopy size={11} /> {copiedCmd ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="mt-1.5 rounded-lg border border-emerald-500/20 bg-night-950/80 px-2.5 py-2 font-mono text-[11.5px] text-emerald-300 break-words">
                      $ {activeStep.command_used}
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
                    <Button size="sm" variant="secondary" onClick={goToNext} className="gap-1.5">
                      Next Step <IconArrowRight size={13} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openUpload(activeStep.id)} loading={uploading} className="gap-1.5 text-slate-300 hover:text-white">
                    <IconCamera size={13} /> Add Screenshot
                  </Button>
                </div>

                {/* Step Evidence */}
                <div className="rounded-xl border border-white/10 bg-night-900/30 p-3.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <IconCamera size={11} /> Step Evidence ({stepScreenshots.length})
                  </p>
                  {stepScreenshots.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      {isPractice
                        ? 'Screenshots are kept with this session as your own evidence. Practice labs have no graded report.'
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
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] py-2 text-[11px] text-slate-400 transition hover:border-brand-400/50 hover:bg-brand-400/[0.06] hover:text-brand-300"
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
            <div className="shrink-0 border-t border-white/10 bg-night-950/70 p-3">
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
