import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import api, { getErrorMessage } from '../../lib/api';
import { IconRefresh, IconTerminal } from '../icons';

/**
 * Browser terminal for Real VPS labs.
 *
 * Unlike LabTerminal (command/response over the CyberITA WebSocket), this is
 * a raw interactive shell: the CyberITA server mints a 120-second ticket
 * from the VPS gateway, the browser opens a WebSocket straight to the
 * gateway with that ticket, and keystrokes/output stream as-is. The SSH key
 * never leaves the gateway host.
 */
export default function VpsTerminal({ sessionId, className = '' }) {
  const [state, setState] = useState('connecting'); // connecting | ready | error | ended
  const [errorText, setErrorText] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [serverAddr, setServerAddr] = useState('');

  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const socketRef = useRef(null);
  const stateRef = useRef('connecting');
  stateRef.current = state;

  // Fit the grid to the box the terminal actually has. FitAddon accounts
  // for padding on the .xterm element itself, and the width guard shaves
  // a column if sub-pixel or font rounding still leaves the grid a hair
  // wider than its box (which clips text at the right edge).
  const fitSafely = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    const box = containerRef.current;
    if (!fit || !term || !box || box.clientWidth === 0) return;
    try {
      fit.fit();
      let guard = 0;
      while (
        term.element
        && term.element.offsetWidth > box.clientWidth
        && term.cols > 20
        && guard < 4
      ) {
        term.resize(term.cols - 1, term.rows);
        guard += 1;
      }
    } catch { /* container hidden */ }
  }, []);

  // Create the xterm instance once.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.25,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Menlo', monospace",
      theme: {
        background: '#0a0e14',
        foreground: '#e6edf3',
        cursor: '#22d3ee',
        cursorAccent: '#0a0e14',
        selectionBackground: 'rgba(34,211,238,0.25)',
        black: '#0a0e14',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#484f58',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
      scrollback: 10000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;
    requestAnimationFrame(fitSafely);
    // Webfonts change the cell width when they arrive; refit so the
    // column count matches the real glyph metrics.
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => fitSafely()).catch(() => {});
    }

    const dataDisposable = term.onData((data) => {
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && stateRef.current === 'ready') {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });
    const resizeDisposable = term.onResize(({ rows, cols }) => {
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows, cols }));
      }
    });

    const onWindowResize = () => fitSafely();
    window.addEventListener('resize', onWindowResize);

    // Refit whenever the box itself changes size (panel layout settling,
    // the Server details toggle, another column appearing), not only
    // when the whole window resizes.
    let rafId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fitSafely);
    });
    observer.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      observer.disconnect();
      cancelAnimationFrame(rafId);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      try { socketRef.current?.close(); } catch { /* already closed */ }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // (Re)connect whenever the attempt counter changes.
  useEffect(() => {
    let cancelled = false;
    const term = termRef.current;
    if (!term) return undefined;

    setState('connecting');
    setErrorText('');
    term.options.disableStdin = true;
    if (attempt > 0) term.reset();
    term.writeln('\x1b[90mConnecting to your lab server...\x1b[0m');

    (async () => {
      let ticketData;
      try {
        const { data } = await api.post(`/labs/sessions/${sessionId}/vps-ticket`);
        ticketData = data;
      } catch (error) {
        if (cancelled) return;
        const message = getErrorMessage(error, 'Could not get a terminal ticket.');
        setErrorText(message);
        setState('error');
        term.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
        return;
      }
      if (cancelled) return;
      if (ticketData.serverIp) {
        setServerAddr(`${ticketData.sshUser || 'student'}@${ticketData.serverIp}`);
      }

      const wsBase = String(ticketData.wsUrl || '').replace(/\/$/, '');
      const ws = new WebSocket(`${wsBase}/api/lab-terminal?ticket=${encodeURIComponent(ticketData.ticket)}`);
      socketRef.current = ws;

      ws.onopen = () => {
        fitSafely();
        ws.send(JSON.stringify({ type: 'connect', rows: term.rows || 24, cols: term.cols || 80 }));
      };
      ws.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'data') {
          term.write(String(message.data || ''));
        } else if (message.type === 'notice') {
          term.writeln(`\r\n\x1b[33m${String(message.message || '')}\x1b[0m`);
        } else if (message.type === 'ready') {
          setState('ready');
          term.options.disableStdin = false;
          term.focus();
        } else if (message.type === 'error') {
          setErrorText(message.message || 'The terminal connection failed.');
          setState('error');
          term.writeln(`\r\n\x1b[31m${message.message || 'The terminal connection failed.'}\x1b[0m`);
        } else if (message.type === 'ended') {
          setState('ended');
          term.options.disableStdin = true;
          term.writeln('\r\n\x1b[90mSession ended.\x1b[0m');
        }
      };
      ws.onerror = () => {
        if (stateRef.current === 'connecting') {
          setErrorText('Could not reach the terminal gateway.');
          setState('error');
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        if (stateRef.current === 'ready') {
          setState('ended');
          term.options.disableStdin = true;
        } else if (stateRef.current === 'connecting') {
          setState((current) => (current === 'ready' ? current : 'error'));
          setErrorText((current) => current || 'The terminal connection closed before it was ready.');
        }
      };
    })();

    return () => {
      cancelled = true;
      try { socketRef.current?.close(); } catch { /* already closed */ }
      socketRef.current = null;
    };
  }, [sessionId, attempt]);

  const reconnect = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const statusLabel =
    state === 'ready'
      ? 'Connected'
      : state === 'connecting'
        ? 'Connecting'
        : state === 'ended'
          ? 'Ended'
          : 'Connection failed';

  return (
    <div className={`vps-term-scroll flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-[#0a0e14] ${className}`}>
      <style>{`
        .vps-term-scroll .xterm { padding: 10px 14px; }
        .vps-term-scroll .xterm-viewport::-webkit-scrollbar { width: 8px; }
        .vps-term-scroll .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
        .vps-term-scroll .xterm-viewport::-webkit-scrollbar-thumb { background: #26303d; border-radius: 8px; }
        .vps-term-scroll .xterm-viewport::-webkit-scrollbar-thumb:hover { background: #33415580; }
      `}</style>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <IconTerminal size={14} className="text-cyan-300" />
          Server terminal
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              state === 'ready'
                ? 'bg-emerald-400/10 text-emerald-300'
                : state === 'error'
                  ? 'bg-rose-400/10 text-rose-300'
                  : 'bg-slate-400/10 text-slate-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${state === 'ready' ? 'bg-emerald-400' : state === 'error' ? 'bg-rose-400' : 'bg-slate-400'} ${state === 'connecting' ? 'animate-pulse' : ''}`} />
            {statusLabel}
          </span>
        </span>
        <span className="flex items-center gap-2.5">
          {serverAddr ? (
            <span className="hidden font-mono text-[11px] text-slate-400 sm:block">{serverAddr}</span>
          ) : null}
          {(state === 'error' || state === 'ended') && (
            <button
              type="button"
              onClick={reconnect}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <IconRefresh size={13} /> Reconnect
            </button>
          )}
        </span>
      </div>
      {state === 'error' && errorText ? (
        <p className="border-b border-white/10 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200">{errorText}</p>
      ) : null}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}
