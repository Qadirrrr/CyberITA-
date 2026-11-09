import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import LabTerminal from '../../components/lab/LabTerminal';
import LabTimer from '../../components/lab/LabTimer';
import { Alert, Badge, Button, ProgressBar } from '../../components/ui';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconCopy,
  IconFileText,
  IconFlag,
  IconPlay,
  IconRefresh,
  IconSend,
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
  const [openHints, setOpenHints] = useState(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const isRealLab = data?.lab?.lab_mode === 'real';

  const fileRef = useRef(null);
  const pendingStep = useRef(null);
  const replaceTarget = useRef(null);
  const timeUpRef = useRef(false);
  const stepRefs = useRef({});
  const scrolledStepRef = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const { data: response } = await api.get(`/labs/sessions/${sessionId}`);
        setData(response);
        setError('');
        // The steps are shown as one scrolling list, so the "current" step
        // is always the first one still incomplete — completing a step
        // automatically moves the highlight (and the scroll) to the next.
        setActiveStepId(() => {
          const next =
            response.steps.find((step) => !step.completed && !step.is_optional) ||
            response.steps.find((step) => !step.completed) ||
            response.steps[response.steps.length - 1];
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

  // Keep the current step in view inside the scrolling steps list.
  useEffect(() => {
    if (!activeStepId || scrolledStepRef.current === activeStepId) return;
    const el = stepRefs.current[activeStepId];
    if (!el) return;
    scrolledStepRef.current = activeStepId;
    const timer = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => clearTimeout(timer);
  }, [activeStepId, data]);

  const toggleHint = (stepId) => {
    setOpenHints((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const scrollToStep = (stepId) => {
    scrolledStepRef.current = stepId;
    stepRefs.current[stepId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeIndex = useMemo(() => {
    if (!data?.steps) return -1;
    return data.steps.findIndex((step) => step.id === activeStepId);
  }, [data?.steps, activeStepId]);

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
      } else if (isRealLab) {
        toast.success('Screenshot uploaded as lab evidence.');
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
          ? 'End this practice session? Its container will be destroyed and you can start a fresh one any time.'
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

  const finishLab = async () => {
    if (!window.confirm('All required work is complete. End this lab session now?')) return;
    setStopping(true);
    try {
      await api.post(`/labs/sessions/${sessionId}/stop`, { reason: 'completed' });
      toast.success('Lab completed. Your session has ended.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not end the lab session.'));
    } finally {
      setStopping(false);
    }
  };

  const handleTimeUp = useCallback(async () => {
    if (timeUpRef.current) return;
    timeUpRef.current = true;
    try {
      await api.post(`/labs/sessions/${sessionId}/stop`, { reason: 'expired' });
    } catch {
      // The server may have ended the session already; reload below reflects it.
    }
    toast.info('Lab time is over. Your session has ended.');
    await load({ silent: true });
  }, [sessionId, load, toast]);

  const restart = async () => {
    setStarting(true);
    timeUpRef.current = false;
    try {
      const { data: response } = await api.post(`/labs/${data.session.lab_id}/sessions`, {}, { timeout: 300000 });
      toast.success(
        response.reused
          ? 'Resumed an existing session.'
          : isPractice
            ? 'Fresh practice lab container started.'
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

  const submitLabAssignment = async () => {
    if (!data?.progress?.allRequiredCompleted || isPractice || data.submission?.status === 'approved') return;
    const message = isRealLab
      ? `Submit this lab with ${data.screenshots.length} screenshot evidence file${data.screenshots.length === 1 ? '' : 's'} for instructor review?`
      : 'Submit this completed lab assignment for instructor review?';
    if (!window.confirm(message)) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('note', isRealLab
        ? 'Submitted from the real lab session with screenshot evidence.'
        : 'Submitted from the completed lab session.');
      await api.post(`/labs/sessions/${sessionId}/submit`, form);
      toast.success('Lab assignment submitted for instructor review.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit this lab assignment.'));
    } finally {
      setSubmitting(false);
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
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-100 text-slate-600 dark:bg-[#06080d] dark:text-slate-300">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-500 border-t-transparent mb-3" />
        <p className="font-mono text-sm text-slate-500 dark:text-slate-400">Preparing your lab workstation…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-100 p-6 text-center text-slate-700 dark:bg-[#06080d] dark:text-slate-300">
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
  // Open-to-all labs stay ungraded, but they now run in real containers. Only
  // sessions created by the legacy simulated provider are container-less.
  const isContainerless = Boolean(session.containerless);
  const isPractice = Boolean(data.lab?.is_practice || isContainerless);
  const running = session.status === 'running';
  const reportStatus = report ? REPORT_STATUS[report.status] : null;
  const completedCount = steps.filter((step) => step.completed).length;

  const student = data.student || (session.student_name ? {
    id: session.student_id,
    name: session.student_name,
    shell_user: session.shell_user,
    hostname: session.hostname,
  } : null);

  const timeUsedLabel = (() => {
    if (running || !session.started_at || !session.ended_at) return null;
    const seconds = Math.max(0, Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000));
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, '0')}s` : `${rest}s`;
  })();

  const endSummary = isRealLab
    ? `${data.screenshots.length} screenshot${data.screenshots.length === 1 ? '' : 's'} attached`
    : steps.length > 0
      ? `${completedCount} of ${steps.length} steps completed · ${Math.round(progress.percent)}% progress`
      : `${Math.round(progress.percent)}% progress`;

  return (
    <div className="flex min-h-screen w-full flex-col overflow-y-auto bg-slate-100 text-slate-900 font-sans lg:h-screen lg:overflow-hidden dark:bg-[#06080d] dark:text-slate-100">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFileSelected}
      />

      <header className="z-30 flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-1.5 dark:border-white/10 dark:bg-night-950">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={handleExit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-400/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
            title="Exit workstation"
            aria-label="Exit workstation"
          >
            <IconArrowLeft size={15} />
          </button>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-xs font-bold text-white shadow-sm shadow-brand-500/20">
            C+
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white" title={data.lab?.title || 'Hands-on Lab'}>
                {data.lab?.title || 'Hands-on Lab'}
              </h1>
              <Badge tone={running ? 'emerald' : 'slate'} dot={running ? 'animate-pulse' : true}>
                {running ? 'Live session' : session.ended_reason === 'completed' ? 'Completed' : session.ended_reason === 'expired' ? 'Time expired' : 'Ended'}
              </Badge>
            </div>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {isContainerless
                ? 'Legacy simulated terminal'
                : session.lab_server_name
                  ? `${session.lab_server_name} · isolated Linux container`
                  : 'Isolated Linux container'}
            </p>
          </div>
        </div>

        {/* Countdown — large and always in front, next to the lab title */}
        <div className="hidden shrink-0 lg:block">
          <LabTimer
            size="lg"
            expiresAt={session.expires_at}
            remainingSeconds={session.remaining_seconds}
            running={running}
            limitMinutes={Number(data.lab?.time_limit_minutes) || 0}
            endedReason={session.ended_reason}
            onExpire={handleTimeUp}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isPractice && (isRealLab || progress.allRequiredCompleted) && (
            <div className="flex items-center gap-2">
              {isRealLab && (
                <Badge tone={progress.allRequiredCompleted ? 'emerald' : 'slate'}>
                  <IconCamera size={11} /> {data.screenshots.length}/{Math.max(1, progress.minEvidence || data.lab?.min_evidence || 1)} evidence
                </Badge>
              )}
              {data.submission?.status === 'approved' ? (
                <Badge tone="emerald"><IconCheckCircle size={12} /> Approved</Badge>
              ) : data.submission?.status === 'submitted' ? (
                <Badge tone="amber"><IconClock size={12} /> Pending review</Badge>
              ) : (
                <Button
                  size="xs"
                  onClick={submitLabAssignment}
                  loading={submitting}
                  disabled={!progress.allRequiredCompleted}
                  title={!progress.allRequiredCompleted ? 'Attach the required screenshots first' : undefined}
                  className="gap-1 bg-brand-600 hover:bg-brand-500 text-white shadow-sm shadow-brand-500/20"
                >
                  <IconSend size={12} /> Submit lab
                </Button>
              )}
              {!isRealLab && (report ? (
                <Button as={Link} to={`/student/reports/${report.id}`} target="_blank" size="xs" variant="secondary" className="gap-1">
                  <IconFileText size={12} /> Report
                </Button>
              ) : (
                <Button size="xs" onClick={generateReport} loading={generating} variant="ghost" className="gap-1">
                  <IconZap size={12} /> Get report
                </Button>
              ))}
            </div>
          )}

          <Button variant="ghost" size="xs" onClick={() => load({ silent: true })} title="Sync session state">
            <IconRefresh size={13} />
          </Button>

          {running ? (
            progress.allRequiredCompleted ? (
              <Button
                size="xs"
                onClick={finishLab}
                loading={stopping}
                className="gap-1 rounded-xl border-0 bg-emerald-600 px-3 text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-500"
                title="All required work is complete — end this lab now"
              >
                <IconFlag size={13} /> Finish
              </Button>
            ) : (
              <Button variant="danger" size="xs" onClick={stopSession} loading={stopping} className="gap-1 rounded-xl px-3">
                <IconXCircle size={13} /> Stop
              </Button>
            )
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

      <div className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-night-900/70 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="lg:hidden">
            <LabTimer
              expiresAt={session.expires_at}
              remainingSeconds={session.remaining_seconds}
              running={running}
              limitMinutes={Number(data.lab?.time_limit_minutes) || 0}
              endedReason={session.ended_reason}
            />
          </span>
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            {Number(data.lab?.time_limit_minutes) > 0
              ? `Lab time limit: ${data.lab.time_limit_minutes} min`
              : 'Session safety limit'}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Progress</span>
          {!isRealLab && steps.length > 0 && (
            <span className="hidden text-[11px] text-slate-500 md:inline">
              {completedCount} of {steps.length} steps
            </span>
          )}
          {isRealLab && (
            <span className="hidden text-[11px] text-slate-500 md:inline">
              {data.screenshots.length} screenshot{data.screenshots.length === 1 ? '' : 's'} attached
            </span>
          )}
          <div className="w-24 sm:w-40">
            <ProgressBar
              value={progress.percent}
              tone={progress.allRequiredCompleted ? 'emerald' : 'brand'}
              size="sm"
            />
          </div>
          <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {Math.round(progress.percent)}%
          </span>
          {progress.allRequiredCompleted && running && (
            <Badge tone="emerald">
              <IconCheckCircle size={11} /> Complete
            </Badge>
          )}
        </div>
      </div>

      {!running && session.ended_reason === 'completed' && (
        <div className="shrink-0 px-3 pt-3 sm:px-4">
          <Alert tone="success" title="Lab completed — nice work">
            You finished this session with {endSummary}
            {timeUsedLabel ? <> in <span className="font-semibold">{timeUsedLabel}</span></> : ''}. Your progress is
            saved — you can review it any time from the lab page.
          </Alert>
        </div>
      )}

      {!running && session.ended_reason === 'expired' && (
        <div className="shrink-0 px-3 pt-3 sm:px-4">
          <Alert tone="warning" title="Lab time is over">
            This session ended automatically when the lab timer reached zero. You had achieved {endSummary}
            {timeUsedLabel ? <> in <span className="font-semibold">{timeUsedLabel}</span></> : ''} — that progress is
            saved. Start a new session to continue practising.
          </Alert>
        </div>
      )}

      {!running && (session.ended_reason === 'stopped' || session.ended_reason === 'submitted') && (
        <div className="shrink-0 px-3 pt-3 sm:px-4">
          <Alert tone="info" title={session.ended_reason === 'submitted' ? 'Lab submitted' : 'Session ended'}>
            You ended this session with {endSummary}
            {timeUsedLabel ? <> in <span className="font-semibold">{timeUsedLabel}</span></> : ''}. Your progress is
            saved — restart any time to keep going.
          </Alert>
        </div>
      )}

      {/* Body: Instructions on LEFT, Terminal on RIGHT */}
      <main className="flex-1 min-h-0 grid grid-cols-1 gap-3 p-3 lg:grid-cols-[440px_1fr] xl:grid-cols-[480px_1fr] 2xl:grid-cols-[540px_1fr] lg:overflow-hidden content-start lg:content-stretch">
        {/* Left Column: Interactive Lab Instructions & Step Workflow */}
        <div className="flex h-[60vh] min-h-[420px] lg:h-full lg:min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-night-950/90 dark:shadow-2xl dark:backdrop-blur">
          {/* Header Stepper and Progress (guided labs only) */}
          {!isRealLab && (
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
            </div>

            {/* Overall Progress Bar */}
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Overall Progress</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">{Math.round(progress.percent)}%</span>
              </div>
              <ProgressBar
                value={progress.percent}
                tone={progress.allRequiredCompleted ? 'emerald' : 'brand'}
                size="sm"
              />
            </div>
          </div>
          )}

          {/* Target Environment Badge Strip */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 dark:border-white/5 dark:bg-night-950/60 dark:text-slate-400">
            {isContainerless ? (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <IconTerminal size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">Legacy simulated terminal</span>
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

          {/* Steps: one scrolling list, step after step */}
          <div className="flex-1 min-h-0 space-y-3.5 overflow-y-auto p-4 select-text">
            {isRealLab ? (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-night-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300">
                        Real lab
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Question-only assessment</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-white/5 dark:text-slate-300">
                      <IconCamera size={11} /> {data.screenshots.length}/{Math.max(1, progress.minEvidence || data.lab?.min_evidence || 1)} evidence
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-base font-semibold leading-snug text-slate-900 dark:text-white">
                    Task brief
                  </h3>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-night-900/30">
                  {data.lab?.task_brief ? (
                    <div className="markdown max-w-none text-sm leading-6 text-slate-700 dark:text-slate-300">
                      <Markdown>{data.lab.task_brief}</Markdown>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Your instructor has not added a task brief yet. Ask them to publish the question before you start.
                    </p>
                  )}
                </div>

                {data.lab?.submission_requirements && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-night-900/30">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Evidence requirements</p>
                    <div className="markdown max-w-none text-sm leading-6 text-slate-700 dark:text-slate-300">
                      <Markdown>{data.lab.submission_requirements}</Markdown>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-night-900/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <IconCamera size={11} /> Screenshot evidence ({data.screenshots.length})
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => openUpload(null)} loading={uploading} className="gap-1.5">
                      <IconCamera size={13} /> Add screenshot
                    </Button>
                  </div>
                  {data.screenshots.length === 0 ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      Attach at least {Math.max(1, progress.minEvidence || data.lab?.min_evidence || 1)} screenshot
                      {Math.max(1, progress.minEvidence || data.lab?.min_evidence || 1) === 1 ? '' : 's'} proving your work.
                      You cannot submit the lab until the required evidence is attached.
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {data.screenshots.map((shot) => (
                        <div key={shot.id} className="group relative overflow-hidden rounded-lg border border-white/10 bg-night-950">
                          <a href={shot.file_path} target="_blank" rel="noreferrer" title="Preview screenshot">
                            <img src={shot.file_path} alt={shot.original_name || 'Lab evidence'} className="h-20 w-full object-cover transition group-hover:scale-105" />
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
                            onClick={() => openUpload(null, shot.id)}
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
                    onClick={() => openUpload(null)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white py-2.5 text-xs text-slate-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 dark:border-white/15 dark:bg-white/[0.02] dark:text-slate-400 dark:hover:border-brand-400/50 dark:hover:bg-brand-400/[0.06] dark:hover:text-brand-300"
                    title="Press Ctrl+V anywhere in this lab to paste a screenshot, or click to browse"
                  >
                    <IconClipboard size={12} /> Paste screenshot (Ctrl+V) or click to browse
                  </button>
                </div>

                {data.submission ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-night-900/30">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Submission</p>
                    <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
                      {data.submission.status === 'approved'
                        ? 'Approved by your instructor.'
                        : data.submission.status === 'changes_requested'
                          ? `Changes requested: ${data.submission.instructor_feedback || 'See your instructor feedback.'}`
                          : 'Submitted and waiting for instructor review.'}
                    </p>
                  </div>
                ) : (
                  <Button
                    onClick={submitLabAssignment}
                    loading={submitting}
                    disabled={!progress.allRequiredCompleted}
                    className="w-full gap-1.5"
                  >
                    <IconSend size={13} /> Submit lab for review
                  </Button>
                )}

                {!progress.allRequiredCompleted && !data.submission && (
                  <p className="text-center text-[11px] leading-5 text-slate-500">
                    Attach {Math.max(0, (progress.minEvidence || data.lab?.min_evidence || 1) - data.screenshots.length)} more
                    screenshot{Math.max(0, (progress.minEvidence || data.lab?.min_evidence || 1) - data.screenshots.length) === 1 ? '' : 's'} to unlock submission.
                  </p>
                )}
              </div>
            ) : steps.length ? (
              <div className="space-y-3.5">
                {steps.map((step, index) => {
                  const parts = splitInstruction(step.instruction);
                  const shots = data.screenshots.filter((shot) => shot.step_id === step.id);
                  const isCurrent = step.id === activeStepId && !step.completed;
                  const hintOpen = openHints.has(step.id);
                  const hasNextStep = index < steps.length - 1;
                  return (
                    <section
                      key={step.id}
                      ref={(el) => {
                        stepRefs.current[step.id] = el;
                      }}
                      className={`scroll-mt-2 rounded-xl border p-3.5 transition-colors duration-300 ${
                        step.completed
                          ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-400/40 dark:bg-emerald-400/[0.07]'
                          : isCurrent
                            ? 'border-cyan-300 bg-white shadow-sm ring-1 ring-cyan-200 dark:border-brand-400/60 dark:bg-night-900/30 dark:ring-brand-400/25'
                            : 'border-slate-200 bg-white dark:border-white/10 dark:bg-night-900/30'
                      }`}
                    >
                      {/* Step header: number/check, title, status */}
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            step.completed
                              ? 'bg-emerald-500 text-white dark:bg-emerald-400 dark:text-night-950'
                              : isCurrent
                                ? 'bg-cyan-600 text-white dark:bg-brand-400 dark:text-night-950'
                                : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                          }`}
                        >
                          {step.completed ? <IconCheck size={12} strokeWidth={3} /> : index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Step {index + 1}
                            </span>
                            {step.is_optional ? (
                              <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                Optional
                              </span>
                            ) : (
                              !isPractice && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">{step.points} points</span>
                              )
                            )}
                            {isCurrent && (
                              <span className="rounded-full bg-cyan-600 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-white dark:bg-brand-400 dark:text-night-950">
                                Current
                              </span>
                            )}
                          </div>
                          <h3 className="mt-0.5 font-display text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
                            {step.title}
                          </h3>
                        </div>
                        {step.completed ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                            <IconCheckCircle size={11} /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-white/5 dark:text-slate-300">
                            {step.verification === 'manual' ? 'Manual confirmation' : 'Checks your terminal output'}
                          </span>
                        )}
                      </div>

                      {/* Instructions and commands */}
                      <div className="mt-3">
                        {parts.text ? (
                          <div className="markdown max-w-none text-sm leading-6 text-slate-700 dark:text-slate-300">
                            <Markdown>{parts.text}</Markdown>
                          </div>
                        ) : null}
                        {!parts.text && parts.commands.length === 0 && (
                          <p className="text-sm text-slate-500">No instructions for this step.</p>
                        )}
                        {parts.commands.map((command) => (
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

                      {/* Hint drawer */}
                      {step.hint && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[0.04]">
                          <button
                            type="button"
                            onClick={() => toggleHint(step.id)}
                            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-medium text-amber-800 transition hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-400/[0.06]"
                          >
                            <span className="flex items-center gap-2">
                              <IconChevronDown size={13} className={`transition-transform duration-200 ${hintOpen ? 'rotate-180' : ''}`} />
                              <span>Need a hint?</span>
                            </span>
                            <span className="text-xs uppercase tracking-wider opacity-75">{hintOpen ? 'Hide' : 'Show'}</span>
                          </button>
                          {hintOpen && (
                            <div className="border-t border-amber-200 p-3 text-sm leading-6 text-amber-950 dark:border-amber-400/15 dark:text-amber-100/90">
                              <Markdown>{step.hint}</Markdown>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Verified command */}
                      {step.completed && step.command_used && (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-400/30 dark:bg-emerald-400/[0.05]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                              <IconCheckCircle size={12} /> Verified command
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCmd(step.command_used)}
                              className="inline-flex items-center gap-1 text-xs text-emerald-700 transition hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-white"
                            >
                              <IconCopy size={11} /> {copiedCmd ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <div className="mt-1.5 break-words rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 font-mono text-sm text-emerald-300">
                            # {step.command_used}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {!step.completed && step.verification === 'manual' && (
                          <Button size="sm" variant="primary" onClick={() => markComplete(step)} className="gap-1.5">
                            <IconCheckCircle size={13} /> Mark Step Complete
                          </Button>
                        )}
                        {step.completed && hasNextStep && (
                          <Button size="sm" variant="ghost" onClick={() => scrollToStep(steps[index + 1].id)} className="gap-1.5">
                            Next Step <IconArrowRight size={13} />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openUpload(step.id)} loading={uploading} className="gap-1.5">
                          <IconCamera size={13} /> Add Screenshot
                        </Button>
                      </div>

                      {/* Step evidence */}
                      <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-night-950/40">
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <IconCamera size={11} /> Step evidence ({shots.length})
                        </p>
                        {shots.length === 0 ? (
                          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                            {isPractice
                              ? 'Screenshots stay with this session as your own notes. Practice labs are not graded.'
                              : 'Terminal screenshots attached here are automatically included in your lab report.'}
                          </p>
                        ) : (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {shots.map((shot) => (
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
                                  onClick={() => openUpload(step.id, shot.id)}
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
                          onClick={() => openUpload(step.id)}
                          onPaste={(event) => {
                            const imageItem = Array.from(event.clipboardData?.items || []).find(
                              (item) => item.kind === 'file' && /^image\//.test(item.type || '')
                            );
                            if (!imageItem) return;
                            event.preventDefault();
                            const file = imageItem.getAsFile();
                            if (file) uploadScreenshot(file, { stepId: step.id });
                          }}
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white py-2.5 text-xs text-slate-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 dark:border-white/15 dark:bg-white/[0.02] dark:text-slate-400 dark:hover:border-brand-400/50 dark:hover:bg-brand-400/[0.06] dark:hover:text-brand-300"
                          title="Press Ctrl+V anywhere in this lab to paste a screenshot, or click to browse"
                        >
                          <IconClipboard size={12} /> Paste screenshot (Ctrl+V) or click to browse
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">This lab has no steps configured yet.</p>
            )}
          </div>

          {/* Footer Report Bar (guided labs only) */}
          {!isRealLab && report && !isPractice && (
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-night-950/70">
              <Link to={`/student/reports/${report.id}`} target="_blank" className="flex items-center justify-between gap-2 text-xs transition hover:text-brand-600 dark:hover:text-brand-300">
                <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                  <IconFileText size={13} className="text-brand-500 dark:text-brand-400" /> {report.title}
                </span>
                {reportStatus && <Badge tone={reportStatus.tone}>{reportStatus.label}</Badge>}
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Lab Terminal */}
        <div className="flex h-[70vh] min-h-[420px] lg:h-full lg:min-h-0 min-w-0 flex-col">
          <LabTerminal
            sessionId={Number(session.id)}
            status={session.status}
            initialHistory={session.history || []}
            welcome={data.lab?.terminal_welcome || ''}
            student={student}
            practice={isContainerless}
            className="h-full w-full"
            onProgress={handleProgress}
          />
        </div>
      </main>
    </div>
  );
}
