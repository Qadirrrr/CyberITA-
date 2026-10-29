import { useCallback, useEffect, useRef, useState } from 'react';
import api, { getAccessToken } from '../../lib/api';
import { IconCheckCircle, IconCopy, IconRefresh, IconShield, IconTerminal } from '../icons';
import { IconButton } from '../ui';

function historyToLines(history = []) {
  const lines = [];
  for (const entry of history) {
    if (entry.role === 'user') lines.push({ type: 'command', text: entry.text });
    else if (entry.role === 'output' && entry.text) lines.push({ type: 'output', text: entry.text, exitCode: entry.exitCode });
  }
  return lines;
}

function promptLabel(cwd = '/home/student') {
  const short = cwd.startsWith('/home/student') ? cwd.replace('/home/student', '~') : cwd;
  return short || '/';
}

function normalizeIdentity(student) {
  const name = student?.name || student?.displayName || student?.full_name || '';
  const id = student?.id != null && student.id !== '' ? String(student.id) : '';
  const shellUser =
    student?.shell_user ||
    student?.shellUser ||
    (name ? String(name).toLowerCase().trim().split(' ')[0].replace(/[^a-z0-9_-]/g, '').slice(0, 24) : '') ||
    (id ? `student-${id}` : 'student');

  return {
    id,
    name,
    shellUser: shellUser || 'student',
    hostname: student?.hostname || 'cyberita-lab',
  };
}

function identityBanner(identity, practice = false) {
  const displayName = identity.name || identity.shellUser || 'Student';
  const id = identity.id ? ` (student #${identity.id})` : '';
  if (practice) {
    return `Signed in as ${displayName}${id} \u2014 in-browser practice shell (no container). Type help for commands.`;
  }
  return `Signed in as ${displayName}${id} \u2014 full root access in your private container. Type help for commands.`;
}

function practiceWelcome(text = '') {
  // Labs authored before the container-less practice mode may still carry a
  // "real Linux container" welcome message; keep the copy accurate.
  return String(text).replace(/This is a real Linux container/gi, 'This is an in-browser practice shell');
}

export default function LabTerminal({
  sessionId,
  status,
  initialHistory = [],
  welcome = '',
  student,
  practice = false,
  className = 'h-[560px] sm:h-[600px] xl:h-[640px]',
  onProgress,
  onServerState,
}) {
  const [identity, setIdentity] = useState(() => normalizeIdentity(student));
  const welcomeText = practice ? practiceWelcome(welcome) : welcome;

  useEffect(() => {
    if (student) {
      setIdentity(normalizeIdentity(student));
    }
  }, [student]);

  const [lines, setLines] = useState(() => {
    const initial = [];
    const banner = identityBanner(normalizeIdentity(student), practice);
    if (banner) initial.push({ type: 'system', text: banner });
    if (welcomeText) initial.push({ type: 'system', text: welcomeText });
    return [...initial, ...historyToLines(initialHistory)];
  });
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('/home/student');
  const [mode, setMode] = useState('connecting');
  const [busy, setBusy] = useState(false);
  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndex = useRef(-1);
  const attachedRef = useRef(false);
  const modeRef = useRef('connecting');

  const setConnectionMode = (next) => {
    modeRef.current = next;
    setMode(next);
  };

  const bottomRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    scrollToBottom();
    const frame = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [lines, busy, cwd, scrollToBottom]);

  useEffect(() => {
    if (status !== 'running') {
      setConnectionMode('offline');
      return undefined;
    }

    let disposed = false;
    setConnectionMode('connecting');
    const token = getAccessToken();
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let socket;

    try {
      socket = new WebSocket(`${protocol}://${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      socketRef.current = socket;
    } catch {
      setConnectionMode('rest');
      return undefined;
    }

    const fallbackTimer = window.setTimeout(() => {
      if (!attachedRef.current && !disposed) {
        setConnectionMode('rest');
      }
    }, 4000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'lab.attach', sessionId }));
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'lab.attached') {
        attachedRef.current = true;
        window.clearTimeout(fallbackTimer);
        setConnectionMode('ws');
        setCwd(message.cwd || '/home/student');
        if (message.student) setIdentity(normalizeIdentity(message.student));
        setLines(() => {
          const next = [];
          const banner = identityBanner(normalizeIdentity(message.student || student), practice);
          if (banner) next.push({ type: 'system', text: banner });
          if (message.welcome) next.push({ type: 'system', text: practice ? practiceWelcome(message.welcome) : message.welcome });
          return [...next, ...historyToLines(message.history || [])];
        });
        onServerState?.(message);
      } else if (message.type === 'lab.output') {
        setBusy(false);
        if (message.cwd) setCwd(message.cwd);
        if (message.clear) {
          setLines([]);
        } else if (message.output) {
          setLines((current) => [...current, { type: 'output', text: message.output, exitCode: message.exitCode }]);
        }
      } else if (message.type === 'lab.progress') {
        onProgress?.(message);
      } else if (message.type === 'error') {
        setBusy(false);
        setLines((current) => [...current, { type: 'error', text: message.message || 'Command failed.' }]);
      } else if (message.type === 'auth.error') {
        setConnectionMode('rest');
        socket.close();
      }
    });

    socket.addEventListener('error', () => {
      if (!attachedRef.current) setConnectionMode('rest');
    });

    socket.addEventListener('close', () => {
      window.clearTimeout(fallbackTimer);
      setBusy(false);
      if (!disposed && modeRef.current === 'ws') setConnectionMode('rest');
    });

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, status]);

  const runFallback = useCallback(
    async (command) => {
      try {
        const { data } = await api.post(`/labs/sessions/${sessionId}/exec`, { command });
        if (data.cwd) setCwd(data.cwd);
        if (data.clear) {
          setLines([]);
        } else if (data.output) {
          setLines((current) => [...current, { type: 'output', text: data.output, exitCode: data.exitCode }]);
        }
        if (data.completedSteps?.length || data.completion) onProgress?.(data);
      } catch (error) {
        const message = error?.response?.data?.error?.message || error?.message || 'Command failed.';
        setLines((current) => [...current, { type: 'error', text: message }]);
      } finally {
        setBusy(false);
      }
    },
    [sessionId, onProgress]
  );

  const runCommand = (raw) => {
    const command = raw.trim();
    if (!command || busy || status !== 'running') return;
    setLines((current) => [...current, { type: 'command', text: command }]);
    setInput('');
    historyRef.current = [command, ...historyRef.current.filter((item) => item !== command)].slice(0, 100);
    historyIndex.current = -1;

    if (command === 'clear' || command === 'cls') {
      setLines([]);
      return;
    }

    const socket = socketRef.current;
    if (modeRef.current === 'ws' && socket && socket.readyState === WebSocket.OPEN) {
      setBusy(true);
      socket.send(JSON.stringify({ type: 'lab.exec', sessionId, command }));
      return;
    }

    setBusy(true);
    runFallback(command);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(input);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!historyRef.current.length) return;
      historyIndex.current = Math.min(historyRef.current.length - 1, historyIndex.current + 1);
      setInput(historyRef.current[historyIndex.current] || '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex.current = Math.max(-1, historyIndex.current - 1);
      setInput(historyIndex.current === -1 ? '' : historyRef.current[historyIndex.current] || '');
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      setLines([]);
    }
  };

  const modeBadge =
    mode === 'ws'
      ? { label: 'WebSocket live', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' }
      : mode === 'rest'
        ? { label: 'HTTP fallback', className: 'border-amber-400/30 bg-amber-400/10 text-amber-300' }
        : mode === 'offline'
          ? { label: 'Offline', className: 'border-rose-400/30 bg-rose-400/10 text-rose-300' }
          : { label: 'Connecting…', className: 'border-white/10 bg-white/5 text-slate-400' };

  const copyOutput = async () => {
    const text = lines
      .map((line) => (line.type === 'command' ? `# ${line.text}` : line.text))
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setLines((current) => [...current, { type: 'system', text: 'Terminal output copied to clipboard.' }]);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-night-950 shadow-2xl ${className}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-night-900/80 px-3 py-2.5">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="ml-1.5 flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
          <IconTerminal size={12} /> {identity.shellUser}@{identity.hostname}
        </span>
        {practice && (
          <span className="hidden items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 sm:flex">
            <IconShield size={10} /> No container
          </span>
        )}
        <span className={`ml-auto hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:flex ${modeBadge.className}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {modeBadge.label}
        </span>
        <IconButton label="Copy terminal output" onClick={copyOutput} className="h-8 w-8">
          <IconCopy size={14} />
        </IconButton>
        <IconButton
          label="Clear terminal"
          onClick={() => setLines([])}
          className="h-8 w-8"
        >
          <IconRefresh size={14} />
        </IconButton>
      </div>

      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 min-h-0 cursor-text overflow-y-auto bg-[#05070d] px-4 py-3 font-mono text-[12.5px] leading-6 select-text"
      >
        {lines.length === 0 && (
          <p className="text-slate-600">
            Type <span className="text-slate-400">help</span> to see {practice ? 'the practice command reference' : 'available commands'}.
          </p>
        )}
        {lines.map((line, index) => {
          if (line.type === 'command') {
            return (
              <div key={index} className="break-words">
                <span className="text-emerald-400">{identity.shellUser}@{identity.hostname}</span>
                <span className="text-slate-600">:</span>
                <span className="text-sky-300">{promptLabel(cwd)}</span>
                <span className="text-slate-500"># </span>
                <span className="text-slate-100">{line.text}</span>
              </div>
            );
          }
          if (line.type === 'system') {
            return (
              <div key={index} className="flex items-start gap-1.5 whitespace-pre-wrap break-words text-brand-300/80">
                <IconCheckCircle size={12} className="mt-1.5 shrink-0" />
                {line.text}
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
            <pre
              key={index}
              className={`whitespace-pre-wrap break-words ${line.exitCode && line.exitCode !== 0 ? 'text-rose-200/80' : 'text-slate-300'}`}
            >
              {line.text}
            </pre>
          );
        })}

        {status === 'running' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              runCommand(input);
            }}
            className="mt-0.5 flex items-center gap-0"
          >
            <label htmlFor="terminal-input" className="shrink-0 select-none">
              <span className="text-emerald-400">{identity.shellUser}@{identity.hostname}</span>
              <span className="text-slate-600">:</span>
              <span className="text-sky-300">{promptLabel(cwd)}</span>
              <span className="text-slate-500">#&nbsp;</span>
            </label>
            <input
              id="terminal-input"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 border-none bg-transparent font-mono text-[12.5px] leading-6 text-slate-100 caret-brand-300 outline-none"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              disabled={busy}
              placeholder={busy ? 'running…' : ''}
              aria-label="Terminal command"
              autoFocus
            />
          </form>
        ) : (
          <p className="mt-2 text-rose-300/80">
            This {practice ? 'practice session' : 'session'} is no longer running. Start a new session to continue.
          </p>
        )}
        <div ref={bottomRef} className="h-0.5 shrink-0" />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-night-900/60 px-3 py-1.5 text-[10px] text-slate-600">
        <span className="font-mono">
          {identity.name ? `${identity.name}${identity.id ? ` · student #${identity.id}` : ''} · ` : ''}
          {practice ? 'practice shell · ' : ''}session #{sessionId}
        </span>
        <span className="hidden sm:block">
          <span className="kbd">↑</span> history · <span className="kbd">Ctrl</span>+<span className="kbd">L</span> clear
          {practice ? ' · simulated in-browser' : ''}
        </span>
      </div>
    </div>
  );
}
