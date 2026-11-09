import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import api, { getAccessToken } from '../../lib/api';
import { IconCheck, IconCopy, IconRefresh, IconTerminal } from '../icons';
import { IconButton } from '../ui';

function promptFor(identity, cwd) {
  const short = cwd.startsWith('/home/student') ? cwd.replace('/home/student', '~') : cwd;
  return `${identity.shellUser}@${identity.hostname}:${short || '/'}$ `;
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
    hostname: student?.hostname || 'cyberitalab',
  };
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
  const [mode, setMode] = useState('connecting');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cwd, setCwd] = useState('/home/student');

  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const socketRef = useRef(null);
  const modeRef = useRef('connecting');
  const busyRef = useRef(false);
  const identityRef = useRef(identity);
  const cwdRef = useRef(cwd);
  const historyRef = useRef([]);
  const historyIndex = useRef(-1);
  const inputBufferRef = useRef('');
  const cursorRef = useRef(0);
  const killRef = useRef('');
  const stashRef = useRef('');
  const searchRef = useRef(null);
  const receivedChunkRef = useRef(false);
  const welcomeRef = useRef(welcome);
  const studentRef = useRef(student);
  const attachedRef = useRef(false);
  const copiedTimer = useRef(null);
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);

  useEffect(() => { identityRef.current = identity; }, [identity]);
  useEffect(() => { cwdRef.current = cwd; }, [cwd]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { welcomeRef.current = welcome; }, [welcome]);

  useEffect(() => {
    if (student) setIdentity(normalizeIdentity(student));
  }, [student]);

  const setConnectionMode = (next) => {
    modeRef.current = next;
    setMode(next);
  };

  // Initialize xterm
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
      convertEol: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const writePrompt = () => {
      term.write(promptFor(identityRef.current, cwdRef.current));
    };

    // ---- readline-style line editor (real terminal shortcuts) ----
    const renderLine = () => {
      const t = termRef.current;
      if (!t) return;
      const buf = inputBufferRef.current;
      const cur = cursorRef.current;
      t.write('\r\x1b[K' + promptFor(identityRef.current, cwdRef.current) + buf);
      if (cur < buf.length) t.write(`\x1b[${buf.length - cur}D`);
    };

    const wordLeftPos = (buf, cur) => {
      let i = cur;
      while (i > 0 && buf[i - 1] === ' ') i -= 1;
      while (i > 0 && buf[i - 1] !== ' ') i -= 1;
      return i;
    };
    const wordRightPos = (buf, cur) => {
      let i = cur;
      while (i < buf.length && buf[i] !== ' ') i += 1;
      while (i < buf.length && buf[i] === ' ') i += 1;
      return i;
    };

    const insertText = (text) => {
      const clean = [...text].filter((c) => c >= ' ' && c !== '\x7f').join('');
      if (!clean) return;
      const buf = inputBufferRef.current;
      const cur = cursorRef.current;
      inputBufferRef.current = buf.slice(0, cur) + clean + buf.slice(cur);
      cursorRef.current = cur + clean.length;
      historyIndex.current = -1;
      renderLine();
    };

    const deleteBeforeCursor = () => {
      const buf = inputBufferRef.current;
      const cur = cursorRef.current;
      if (cur <= 0) return;
      inputBufferRef.current = buf.slice(0, cur - 1) + buf.slice(cur);
      cursorRef.current = cur - 1;
      renderLine();
    };

    const deleteAtCursor = () => {
      const buf = inputBufferRef.current;
      const cur = cursorRef.current;
      if (cur >= buf.length) return;
      inputBufferRef.current = buf.slice(0, cur) + buf.slice(cur + 1);
      renderLine();
    };

    const historyMove = (dir) => {
      const hist = historyRef.current;
      if (hist.length === 0) return;
      if (dir > 0) {
        if (historyIndex.current === -1) stashRef.current = inputBufferRef.current;
        historyIndex.current = Math.min(hist.length - 1, historyIndex.current + 1);
        inputBufferRef.current = hist[historyIndex.current] || '';
      } else {
        historyIndex.current = Math.max(-1, historyIndex.current - 1);
        inputBufferRef.current = historyIndex.current === -1 ? stashRef.current : (hist[historyIndex.current] || '');
      }
      cursorRef.current = inputBufferRef.current.length;
      renderLine();
    };

    // Ctrl+R reverse incremental history search
    const renderSearch = () => {
      const t = termRef.current;
      const s = searchRef.current;
      if (!t || !s) return;
      t.write(`\r\x1b[K(reverse-i-search)\`${s.query}': ${s.match || ''}`);
    };
    const runSearch = (fromIndex) => {
      const s = searchRef.current;
      if (!s) return;
      s.match = '';
      s.matchIndex = -1;
      const hist = historyRef.current;
      for (let i = Math.max(0, fromIndex); i < hist.length; i += 1) {
        if (hist[i].includes(s.query)) { s.match = hist[i]; s.matchIndex = i; break; }
      }
      renderSearch();
    };
    const startSearch = () => {
      searchRef.current = { query: '', saved: inputBufferRef.current, match: '', matchIndex: -1 };
      renderSearch();
    };
    const exitSearch = (useMatch) => {
      const s = searchRef.current;
      searchRef.current = null;
      if (s && useMatch && s.match) inputBufferRef.current = s.match;
      cursorRef.current = inputBufferRef.current.length;
      renderLine();
    };
    const cancelSearch = () => {
      const s = searchRef.current;
      searchRef.current = null;
      if (s) inputBufferRef.current = s.saved;
      cursorRef.current = inputBufferRef.current.length;
      renderLine();
    };

    const handleSearchKey = (ch) => {
      const s = searchRef.current;
      const t = termRef.current;
      if (!s || !t) return;
      if (ch === '\r' || ch === '\n') {
        // Enter: accept the match and run it, like bash
        const cmd = s.match || s.saved;
        searchRef.current = null;
        inputBufferRef.current = '';
        cursorRef.current = 0;
        historyIndex.current = -1;
        t.write('\r\n');
        if (cmd.trim()) submitCommand(cmd);
        else t.write(promptFor(identityRef.current, cwdRef.current));
      } else if (ch === '\x12') {
        runSearch(s.matchIndex + 1); // Ctrl+R again: next older match
      } else if (ch === '\x7f' || ch === '\b') {
        s.query = s.query.slice(0, -1);
        if (s.query) runSearch(0); else { s.match = ''; s.matchIndex = -1; renderSearch(); }
      } else if (ch === '\x1b' || ch === '\x05') {
        exitSearch(true); // Esc / Ctrl+E: keep the match, back to editing
      } else if (ch === '\x07') {
        cancelSearch(); // Ctrl+G: restore the original line
      } else if (ch === '\x03') {
        inputBufferRef.current = '';
        cursorRef.current = 0;
        searchRef.current = null;
        t.write('^C\r\n' + promptFor(identityRef.current, cwdRef.current));
      } else if (ch >= ' ') {
        s.query += ch;
        runSearch(0);
      }
    };

    // custom key handling for copy/paste + clear
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if (searchRef.current) return true;
      if (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard?.writeText(sel).catch(() => {});
          return false;
        }
        return true;
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard?.writeText(sel).catch(() => {});
          return false;
        }
      }
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        navigator.clipboard?.readText().then((t) => {
          if (t) processInput(t);
        }).catch(() => {});
        return false;
      }
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        term.clear();
        const buf = inputBufferRef.current;
        term.write(promptFor(identityRef.current, cwdRef.current) + buf);
        if (cursorRef.current < buf.length) term.write(`\x1b[${buf.length - cursorRef.current}D`);
        return false;
      }
      return true;
    });

    const processInput = (data) => {
      if (busyRef.current) return;
      const t = termRef.current;
      if (!t) return;
      let i = 0;
      while (i < data.length) {
        const ch = data[i];

        if (searchRef.current) {
          if (ch === '\x1b' && data[i + 1] === '[') {
            // swallow CSI keys while searching (arrows etc.)
            let j = i + 2;
            while (j < data.length && !(data[j] >= '@' && data[j] <= '~')) j += 1;
            i = j + 1;
            continue;
          }
          handleSearchKey(ch);
          i += 1;
          continue;
        }

        if (ch === '\x1b') {
          const next = data[i + 1];
          if (next === '[') {
            // CSI sequence: consume until a final byte (@ through ~)
            let j = i + 2;
            while (j < data.length && !(data[j] >= '@' && data[j] <= '~')) j += 1;
            if (j >= data.length) break;
            const final = data[j];
            const params = data.slice(i + 2, j);
            const buf = inputBufferRef.current;
            const cur = cursorRef.current;
            if (final === 'A') historyMove(1);
            else if (final === 'B') historyMove(-1);
            else if (final === 'C') {
              if (params === '1;5' || params === '5') cursorRef.current = wordRightPos(buf, cur);
              else cursorRef.current = Math.min(buf.length, cur + 1);
              renderLine();
            } else if (final === 'D') {
              if (params === '1;5' || params === '5') cursorRef.current = wordLeftPos(buf, cur);
              else cursorRef.current = Math.max(0, cur - 1);
              renderLine();
            } else if (final === 'H') { cursorRef.current = 0; renderLine(); }
            else if (final === 'F') { cursorRef.current = buf.length; renderLine(); }
            else if (final === '~') {
              if (params === '1' || params === '7') { cursorRef.current = 0; renderLine(); }
              else if (params === '4' || params === '8') { cursorRef.current = buf.length; renderLine(); }
              else if (params === '3') deleteAtCursor();
            }
            i = j + 1;
            continue;
          }
          if (next === 'O') {
            // SS3 (application cursor keys)
            const final = data[i + 2];
            const buf = inputBufferRef.current;
            const cur = cursorRef.current;
            if (final === 'A') historyMove(1);
            else if (final === 'B') historyMove(-1);
            else if (final === 'C') { cursorRef.current = Math.min(buf.length, cur + 1); renderLine(); }
            else if (final === 'D') { cursorRef.current = Math.max(0, cur - 1); renderLine(); }
            else if (final === 'H') { cursorRef.current = 0; renderLine(); }
            else if (final === 'F') { cursorRef.current = buf.length; renderLine(); }
            i += 3;
            continue;
          }
          if (next === 'b') { cursorRef.current = wordLeftPos(inputBufferRef.current, cursorRef.current); renderLine(); i += 2; continue; }
          if (next === 'f') { cursorRef.current = wordRightPos(inputBufferRef.current, cursorRef.current); renderLine(); i += 2; continue; }
          if (next === '\x7f') {
            const buf = inputBufferRef.current;
            const cur = cursorRef.current;
            const start = wordLeftPos(buf, cur);
            if (start < cur) {
              killRef.current = buf.slice(start, cur);
              inputBufferRef.current = buf.slice(0, start) + buf.slice(cur);
              cursorRef.current = start;
              renderLine();
            }
            i += 2;
            continue;
          }
          i += 1; // lone Esc: ignore
          continue;
        }

        if (ch === '\r' || ch === '\n') {
          const cmd = inputBufferRef.current;
          inputBufferRef.current = '';
          cursorRef.current = 0;
          historyIndex.current = -1;
          stashRef.current = '';
          t.write('\r\n');
          if (cmd.trim()) submitCommand(cmd);
          else t.write(promptFor(identityRef.current, cwdRef.current));
          i += 1;
          continue;
        }

        const buf = inputBufferRef.current;
        const cur = cursorRef.current;
        switch (ch) {
          case '\x7f':
          case '\b':
            deleteBeforeCursor();
            break;
          case '\x01': // Ctrl+A: start of line
            cursorRef.current = 0;
            renderLine();
            break;
          case '\x05': // Ctrl+E: end of line
            cursorRef.current = buf.length;
            renderLine();
            break;
          case '\x15': { // Ctrl+U: kill everything before the cursor
            if (cur > 0) {
              killRef.current = buf.slice(0, cur);
              inputBufferRef.current = buf.slice(cur);
              cursorRef.current = 0;
              renderLine();
            }
            break;
          }
          case '\x0b': // Ctrl+K: kill everything after the cursor
            if (cur < buf.length) {
              killRef.current = buf.slice(cur);
              inputBufferRef.current = buf.slice(0, cur);
              renderLine();
            }
            break;
          case '\x17': { // Ctrl+W: delete the word before the cursor
            const start = wordLeftPos(buf, cur);
            if (start < cur) {
              killRef.current = buf.slice(start, cur);
              inputBufferRef.current = buf.slice(0, start) + buf.slice(cur);
              cursorRef.current = start;
              renderLine();
            }
            break;
          }
          case '\x19': // Ctrl+Y: yank the last killed text
            if (killRef.current) insertText(killRef.current);
            break;
          case '\x03': // Ctrl+C: cancel the current line
            inputBufferRef.current = '';
            cursorRef.current = 0;
            historyIndex.current = -1;
            t.write('^C\r\n' + promptFor(identityRef.current, cwdRef.current));
            break;
          case '\x04': // Ctrl+D: delete char at cursor (EOF on a real shell)
            deleteAtCursor();
            break;
          case '\x12': // Ctrl+R: reverse history search
            startSearch();
            break;
          case '\x0c': // Ctrl+L fallback (normally handled by the key handler)
            t.clear();
            renderLine();
            break;
          default:
            if (ch >= ' ') insertText(ch);
            break;
        }
        i += 1;
      }
    };

    const submitCommand = (cmd) => {
      const term = termRef.current;
      if (!term) return;
      historyRef.current = [cmd, ...historyRef.current.filter((x) => x !== cmd)].slice(0, 100);
      historyIndex.current = -1;
      inputBufferRef.current = '';
      cursorRef.current = 0;
      stashRef.current = '';

      if (cmd.trim() === 'clear' || cmd.trim() === 'cls') {
        term.clear();
        term.write(promptFor(identityRef.current, cwdRef.current));
        return;
      }

      busyRef.current = true;
      setBusy(true);
      receivedChunkRef.current = false;

      const socket = socketRef.current;
      if (modeRef.current === 'ws' && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'lab.exec', sessionId, command: cmd }));
        return;
      }

      // REST fallback
      runFallback(cmd);
    };

    const runFallback = async (cmd) => {
      const term = termRef.current;
      try {
        const { data } = await api.post(`/labs/sessions/${sessionId}/exec`, { command: cmd });
        if (term) {
          if (!receivedChunkRef.current && data.output) term.write(data.output);
          if (data.cwd) {
            setCwd(data.cwd);
            cwdRef.current = data.cwd;
          }
          if (data.clear) term.clear();
          term.write('\r\n' + promptFor(identityRef.current, cwdRef.current));
        }
        if (data.completedSteps?.length || data.completion) onProgressRef.current?.(data);
      } catch (error) {
        const message = error?.response?.data?.error?.message || error?.message || 'Command failed.';
        if (term) term.write('\r\n' + message + '\r\n' + promptFor(identityRef.current, cwdRef.current));
      } finally {
        busyRef.current = false;
        setBusy(false);
        receivedChunkRef.current = false;
      }
    };

    // expose helpers via ref for WS handlers
    termRef.current.__submitCommand = submitCommand;
    termRef.current.__runFallback = runFallback;
    termRef.current.__processInput = processInput;
    termRef.current.__writePrompt = writePrompt;

    term.onData((data) => {
      if (busyRef.current) return;
      processInput(data);
    });

    // initial prompt
    term.write(promptFor(identityRef.current, cwdRef.current));

    const onResize = () => { try { fit.fit(); } catch { /* ignore */ } };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      try { term.dispose(); } catch { /* ignore */ }
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // WebSocket connection (same as before, but writes to xterm)
  useEffect(() => {
    if (status !== 'running') {
      setConnectionMode('offline');
      const t = termRef.current;
      if (t) t.write('\r\n[session not running]\r\n');
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
      if (!attachedRef.current && !disposed) setConnectionMode('rest');
    }, 4000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'lab.attach', sessionId }));
    });

    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      const term = termRef.current;
      if (message.type === 'lab.attached') {
        attachedRef.current = true;
        window.clearTimeout(fallbackTimer);
        setConnectionMode('ws');
        const newCwd = message.cwd || '/home/student';
        setCwd(newCwd);
        cwdRef.current = newCwd;
        if (message.student) {
          const id = normalizeIdentity(message.student);
          setIdentity(id);
          identityRef.current = id;
        }
        if (term) {
          term.clear();
          const idn = identityRef.current;
          const banner = `Signed in as ${idn.name || idn.shellUser}${idn.id ? ` (student #${idn.id})` : ''}\n${practice ? 'In-browser practice shell. Type help for commands.' : 'Private Linux container with root access. Type help for commands.'}`;
          if (banner) term.writeln(banner);
          if (message.welcome) term.writeln(practice ? message.welcome.replace(/This is a real Linux container/gi, 'This is an in-browser practice shell') : message.welcome);
          for (const entry of message.history || []) {
            if (entry.role === 'user') {
              term.write(promptFor(identityRef.current, entry.cwd || cwdRef.current) + (entry.text || '') + '\r\n');
            } else if (entry.role === 'output' && entry.text) {
              term.write(entry.text.endsWith('\n') ? entry.text : entry.text + '\r\n');
            }
          }
          term.write(promptFor(identityRef.current, cwdRef.current));
        }
        onServerState?.(message);
      } else if (message.type === 'lab.output.chunk') {
        receivedChunkRef.current = true;
        if (term && message.chunk) term.write(message.chunk);
      } else if (message.type === 'lab.output') {
        if (term) {
          if (!receivedChunkRef.current && message.output) {
            term.write(message.output.endsWith('\n') ? message.output : message.output + '\r\n');
          }
          receivedChunkRef.current = false;
          if (message.cwd) {
            setCwd(message.cwd);
            cwdRef.current = message.cwd;
          }
          if (message.clear) term.clear();
          term.write('\r\n' + promptFor(identityRef.current, cwdRef.current));
        }
        busyRef.current = false;
        setBusy(false);
        if (message.completedSteps?.length || message.completion) {
          // progress handled via separate lab.progress; noop here
        }
      } else if (message.type === 'lab.progress') {
        onProgressRef.current?.(message);
      } else if (message.type === 'error') {
        busyRef.current = false;
        setBusy(false);
        receivedChunkRef.current = false;
        if (term) term.write('\r\n' + (message.message || 'Command failed.') + '\r\n' + promptFor(identityRef.current, cwdRef.current));
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
      busyRef.current = false;
      setBusy(false);
      if (!disposed && modeRef.current === 'ws') setConnectionMode('rest');
    });

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      try { socket.close(); } catch { /* ignore */ }
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, status]);

  // copy helpers
  const copyAll = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    term.selectAll();
    const text = term.getSelection();
    term.clearSelection();
    try {
      if (text) await navigator.clipboard?.writeText(text);
    } catch { /* ignore */ }
    setCopied(true);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1400);
  }, []);

  const clearTerminal = useCallback(() => {
    const term = termRef.current;
    if (term) {
      term.clear();
      const buf = inputBufferRef.current;
      term.write(promptFor(identityRef.current, cwdRef.current) + buf);
      if (cursorRef.current < buf.length) term.write(`\x1b[${buf.length - cursorRef.current}D`);
    }
  }, []);

  // focus on mount
  useEffect(() => {
    const t = setTimeout(() => termRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`terminal-window terminal-surface flex flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-[#0a0e14] text-zinc-100 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] ${className}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 bg-[#161b22] px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]" />
        </span>
        <span className="ml-2 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-zinc-400">
          <IconTerminal size={12} className="text-zinc-500" />
          <span className="truncate">{identity.shellUser}@{identity.hostname}: {cwd.startsWith('/home/student') ? cwd.replace('/home/student', '~') : cwd}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {copied && (
            <span className="mr-1 flex items-center gap-1 font-mono text-[10px] text-emerald-400">
              <IconCheck size={11} /> copied
            </span>
          )}
          <IconButton label="Copy all terminal output" onClick={copyAll} className="h-7 w-7 text-zinc-400 hover:text-zinc-100">
            <IconCopy size={13} />
          </IconButton>
          <IconButton label="Clear terminal" onClick={clearTerminal} className="h-7 w-7 text-zinc-400 hover:text-zinc-100">
            <IconRefresh size={13} />
          </IconButton>
        </div>
      </div>

      <div
        ref={containerRef}
        className="terminal-body flex-1 min-h-0 bg-[#0a0e14]"
        style={{ padding: '8px 4px' }}
      />
    </div>
  );
}