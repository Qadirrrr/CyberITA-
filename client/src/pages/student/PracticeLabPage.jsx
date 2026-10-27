import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import { Alert, Badge, Button, Card, ProgressBar, Skeleton } from '../../components/ui';
import {
  IconArrowLeft,
  IconCheckCircle,
  IconChevronDown,
  IconCopy,
  IconPlay,
  IconRefresh,
  IconTerminal,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';

function historyToLines(history = []) {
  const lines = [];
  for (const entry of history) {
    if (entry.role === 'user') lines.push({ type: 'command', text: entry.text });
    else if (entry.role === 'output' && entry.text) {
      lines.push({ type: 'output', text: entry.text, exitCode: entry.exitCode });
    }
  }
  return lines;
}

function promptLabel(cwd = '/home/student') {
  const short = cwd.startsWith('/home/student') ? cwd.replace('/home/student', '~') : cwd;
  return short || '/';
}

export default function PracticeLabPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);

  const shellUser = useMemo(() => {
    if (user?.full_name) {
      const clean = user.full_name.toLowerCase().trim().split(' ')[0].replace(/[^a-z0-9_-]/g, '').slice(0, 24);
      if (clean) return clean;
    }
    return user?.id ? `student-${user.id}` : 'student';
  }, [user]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('/home/student');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeStepId, setActiveStepId] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const applyOverview = useCallback((response, { replaceLines = true } = {}) => {
    setData(response);
    setCwd(response.session?.cwd || '/home/student');
    if (replaceLines) setLines(historyToLines(response.session?.history || []));
    setActiveStepId((current) => {
      if (current && response.steps.some((step) => step.id === current)) return current;
      return response.steps.find((step) => !step.completed)?.id ?? response.steps[0]?.id ?? null;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await api.get(`/labs/${id}/practice`);
      applyOverview(response);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load practice mode for this lab.'));
    } finally {
      setLoading(false);
    }
  }, [id, applyOverview]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const activeStep = useMemo(
    () => data?.steps?.find((step) => step.id === activeStepId) || null,
    [data, activeStepId]
  );

  const runCommand = async (raw) => {
    const command = String(raw ?? '').trim();
    if (!command || busy) return;
    setBusy(true);
    setLines((current) => [...current, { type: 'command', text: command }]);
    setInput('');
    setHistory((current) => [command, ...current.filter((item) => item !== command)].slice(0, 100));
    setHistoryIndex(-1);
    try {
      const { data: response } = await api.post(`/labs/${id}/practice/exec`, { command });
      if (response.clear) setLines([]);
      else if (response.output) {
        setLines((current) => [...current, { type: 'output', text: response.output, exitCode: response.exitCode }]);
      }
      setCwd(response.cwd || '/home/student');
      applyOverview(response, { replaceLines: false });
      if (response.completedSteps?.length) {
        toast.success(`Practice step completed: ${response.completedSteps.map((step) => step.title).join(', ')}`);
      }
    } catch (err) {
      setLines((current) => [...current, { type: 'error', text: getErrorMessage(err, 'The simulated command failed.') }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const markStep = async (step) => {
    try {
      const { data: response } = await api.post(`/labs/${id}/practice/steps/${step.id}/complete`);
      applyOverview(response, { replaceLines: false });
      toast.success('Marked as practised.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not mark that step.'));
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset the simulated terminal and all practice progress for this lab?')) return;
    setResetting(true);
    try {
      const { data: response } = await api.post(`/labs/${id}/practice/reset`);
      applyOverview(response);
      toast.info('Practice environment reset.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not reset practice mode.'));
    } finally {
      setResetting(false);
    }
  };

  const copyCommand = async (command) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success('Command copied.');
    } catch {
      toast.error('Clipboard is not available in this browser.');
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(input);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      const next = Math.min(history.length - 1, historyIndex + 1);
      setHistoryIndex(next);
      setInput(history[next] || '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.max(-1, historyIndex - 1);
      setHistoryIndex(next);
      setInput(next === -1 ? '' : history[next] || '');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Alert tone="error" title="Practice unavailable">
          {error || 'This lab could not be found.'}
        </Alert>
        <Button as={Link} to="/student/labs" variant="secondary" className="mt-4">
          Back to labs
        </Button>
      </div>
    );
  }

  const { progress, steps, session, notice } = data;
  const completed = steps.filter((step) => step.completed).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/labs/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300">
            <IconArrowLeft size={13} /> Back to lab
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-xl font-semibold sm:text-2xl">
            Practice: {data.lab?.title || 'Lab'}
            <Badge tone="amber">Simulated</Badge>
          </h1>
          <p className="mt-1 text-[11px] text-slate-500">
            Practise the commands safely before starting the real hands-on lab.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset} loading={resetting}>
            <IconRefresh size={13} /> Reset practice
          </Button>
          <Button as={Link} to={`/labs/${id}`} size="sm" variant="secondary">
            <IconTerminal size={13} /> Real lab
          </Button>
        </div>
      </div>

      <Alert tone="warning" title="Simulation only">
        {notice || 'Commands run in a local simulator, not on a real server.'} Screenshots are not required in practice mode.
      </Alert>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="flex h-full min-h-[440px] flex-col overflow-hidden rounded-2xl border border-amber-400/25 bg-night-950 shadow-2xl">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-night-900/80 px-3 py-2.5">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              </span>
              <span className="ml-1.5 flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                <IconTerminal size={12} /> student@practice-simulator
              </span>
              <span className="ml-auto rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                Simulated output, no real server
              </span>
            </div>

            <div
              ref={scrollRef}
              onClick={() => inputRef.current?.focus()}
              className="flex-1 cursor-text overflow-y-auto bg-[#07080c] px-4 py-3 font-mono text-[12.5px] leading-6"
            >
              <div className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1.5 text-[10px] text-amber-200/80">
                PRACTICE SIMULATION: filesystem and command output below are generated locally. Nothing executes on CyberITA+ servers.
              </div>
              {lines.length === 0 && (
                <p className="text-slate-600">
                  Choose an example command on the right or type your own. Try <span className="text-slate-400">help</span>.
                </p>
              )}
              {lines.map((line, index) => {
                if (line.type === 'command') {
                  return (
                    <div key={index} className="break-words">
                      <span className="text-amber-400">{shellUser}@practice</span>
                      <span className="text-slate-600">:</span>
                      <span className="text-sky-300">{promptLabel(cwd)}</span>
                      <span className="text-slate-500">$ </span>
                      <span className="text-slate-100">{line.text}</span>
                    </div>
                  );
                }
                if (line.type === 'error') {
                  return (
                    <pre key={index} className="whitespace-pre-wrap break-words text-rose-400">
                      {line.text}
                    </pre>
                  );
                }
                return (
                  <div key={index}>
                    <span className="text-[9px] uppercase tracking-wider text-amber-400/60">simulated output</span>
                    <pre className={`whitespace-pre-wrap break-words ${line.exitCode && line.exitCode !== 0 ? 'text-rose-200/80' : 'text-slate-300'}`}>
                      {line.text}
                    </pre>
                  </div>
                );
              })}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  runCommand(input);
                }}
                className="mt-0.5 flex items-center gap-0"
              >
                <label htmlFor="practice-terminal-input" className="shrink-0 select-none">
                  <span className="text-amber-400">{shellUser}@practice</span>
                  <span className="text-slate-600">:</span>
                  <span className="text-sky-300">{promptLabel(cwd)}</span>
                  <span className="text-slate-500">$&nbsp;</span>
                </label>
                <input
                  id="practice-terminal-input"
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onKeyDown}
                  className="min-w-0 flex-1 border-none bg-transparent font-mono text-[12.5px] leading-6 text-slate-100 caret-amber-300 outline-none"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  disabled={busy}
                  placeholder={busy ? 'simulating...' : ''}
                  aria-label="Simulated practice command"
                  autoFocus
                />
              </form>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-night-900/60 px-3 py-1.5 text-[10px] text-slate-600">
              <span className="font-mono">practice session #{session.id}</span>
              <span>Started {formatDateTime(session.started_at)}</span>
            </div>
          </div>
        </div>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Practice checklist</span>
              <span className="font-mono text-slate-500">{completed}/{steps.length}</span>
            </div>
            <ProgressBar value={progress.percent} size="sm" tone={progress.allRequiredCompleted ? 'emerald' : 'brand'} className="mt-2" />
            <p className="mt-1.5 text-[10px] text-slate-500">
              {progress.completedRequired} of {progress.requiredTotal} required steps practised
            </p>
          </div>

          <ol className="max-h-[190px] overflow-y-auto border-b border-white/10 p-2">
            {steps.map((step, index) => {
              const active = step.id === activeStepId;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveStepId(step.id);
                      setShowExplanation(false);
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
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{step.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="flex-1 overflow-y-auto p-4">
            {activeStep ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold leading-5 text-white">{activeStep.title}</h2>
                  {activeStep.completed && <Badge tone="emerald">Practised</Badge>}
                </div>
                <div className="text-xs">
                  <Markdown>{activeStep.instruction}</Markdown>
                </div>

                {activeStep.practice_command ? (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-amber-300/80">Example command</p>
                    <pre className="mt-1.5 overflow-x-auto rounded-lg bg-night-950/70 px-2.5 py-2 font-mono text-[11px] text-amber-200">
                      $ {activeStep.practice_command}
                    </pre>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => runCommand(activeStep.practice_command)} loading={busy}>
                        <IconPlay size={12} /> Run example
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setInput(activeStep.practice_command)}>
                        Insert
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copyCommand(activeStep.practice_command)}>
                        <IconCopy size={12} /> Copy
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11px] text-slate-500">
                    No example command was configured for this step yet.
                  </p>
                )}

                {activeStep.practice_output && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Expected output (simulated)</p>
                    <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/5 bg-night-950/70 px-2.5 py-2 font-mono text-[11px] leading-5 text-slate-400">
                      {activeStep.practice_output}
                    </pre>
                  </div>
                )}

                {(activeStep.practice_explanation || activeStep.hint) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowExplanation((current) => !current)}
                      className="flex items-center gap-1 text-[11px] font-medium text-brand-300 transition hover:text-brand-200"
                    >
                      <IconChevronDown size={12} className={`transition ${showExplanation ? 'rotate-180' : ''}`} /> Explanation
                    </button>
                    {showExplanation && (
                      <div className="mt-2 rounded-lg border border-brand-400/20 bg-brand-400/5 p-2.5 text-[11px] leading-5 text-slate-300">
                        {activeStep.practice_explanation || activeStep.hint}
                      </div>
                    )}
                  </div>
                )}

                {!activeStep.completed && (
                  <Button size="sm" variant="secondary" onClick={() => markStep(activeStep)}>
                    <IconCheckCircle size={13} /> Mark as practised
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">This lab has no steps configured yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
