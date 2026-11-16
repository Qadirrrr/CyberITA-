import { useCallback, useEffect, useRef, useState } from 'react';
import RFB from '@novnc/novnc';
import api, { getErrorMessage } from '../../lib/api';
import { IconMonitor, IconRefresh } from '../icons';

/**
 * Browser graphical desktop for Real VPS labs (noVNC).
 *
 * The lab server's desktop (XFCE + TigerVNC) is installed at first boot.
 * This component asks the CyberITA server for a desktop ticket: while the
 * desktop is still installing the API answers with a status and this view
 * polls; once ready it receives a 5-minute gateway ticket plus the
 * session's VNC password and opens the RFB session straight to the
 * gateway's /api/lab-desktop WebSocket. The gateway bridges through an
 * SSH tunnel to TigerVNC inside the lab server, so no VNC port is ever
 * exposed publicly and the SSH key never leaves the gateway host.
 */
export default function VpsDesktop({ sessionId, className = '' }) {
  // checking | installing | connecting | connected | disconnected | error | unavailable
  const [phase, setPhase] = useState('checking');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  const screenRef = useRef(null);
  const rfbRef = useRef(null);
  const pollRef = useRef(null);

  const disconnectRfb = useCallback(() => {
    try { rfbRef.current?.disconnect(); } catch { /* already closed */ }
    rfbRef.current = null;
  }, []);

  const connect = useCallback(async (isPollRetry = false) => {
    if (!isPollRetry) {
      setPhase('checking');
      setMessage('');
      disconnectRfb();
    }
    let ticketData;
    try {
      const { data } = await api.post(`/labs/sessions/${sessionId}/vps-desktop-ticket`);
      ticketData = data;
    } catch (error) {
      setPhase('error');
      setMessage(getErrorMessage(error, 'Could not get a desktop ticket.'));
      return;
    }

    const status = ticketData.desktopStatus;
    if (status === 'installing') {
      setPhase('installing');
      pollRef.current = setTimeout(() => connect(true), 15000);
      return;
    }
    if (status !== 'ready') {
      setPhase('unavailable');
      setMessage(
        status === 'failed'
          ? 'The desktop installation did not finish on this server. The terminal still works, and your instructor can check the server.'
          : status === 'unsupported'
            ? 'This lab server image does not support the graphical desktop. The terminal still works.'
            : 'The graphical desktop is not available on this lab server. The terminal still works.'
      );
      return;
    }

    setPhase('connecting');
    const wsBase = String(ticketData.wsUrl || '').replace(/\/$/, '');
    try {
      const rfb = new RFB(screenRef.current, `${wsBase}/api/lab-desktop?ticket=${encodeURIComponent(ticketData.ticket)}`, {
        credentials: { password: ticketData.vncPassword || '' },
        wsProtocols: ['binary'],
      });
      rfb.scaleViewport = true;
      rfb.background = '#000000';
      rfb.addEventListener('connect', () => setPhase('connected'));
      rfb.addEventListener('disconnect', (event) => {
        if (event?.detail?.clean === false) {
          setMessage('The connection dropped unexpectedly. The server may have stopped, or the network interrupted the session.');
        }
        setPhase((prev) => (prev === 'error' ? prev : 'disconnected'));
      });
      rfb.addEventListener('securityfailure', () => {
        setPhase('error');
        setMessage('The desktop refused the connection during security negotiation. Try reconnecting.');
      });
      rfbRef.current = rfb;
    } catch {
      setPhase('error');
      setMessage('The desktop viewer failed to start in this browser.');
    }
  }, [sessionId, disconnectRfb]);

  useEffect(() => {
    connect();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      disconnectRfb();
    };
    // Reconnect only when the student explicitly asks (attempt) or the
    // session changes; connect identity changes every render otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, attempt]);

  const busy = phase === 'checking' || phase === 'installing' || phase === 'connecting';

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-[#0a0e14] ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-300">
          <IconMonitor size={14} className="shrink-0 text-cyan-300" />
          <span className="truncate">Graphical desktop</span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              phase === 'connected'
                ? 'bg-emerald-400/10 text-emerald-300'
                : busy
                  ? 'bg-slate-400/10 text-slate-300'
                  : 'bg-rose-400/10 text-rose-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${phase === 'connected' ? 'bg-emerald-400' : busy ? 'bg-slate-400' : 'bg-rose-400'} ${busy ? 'animate-pulse' : ''}`} />
            {phase === 'connected'
              ? 'Connected'
              : phase === 'installing'
                ? 'Installing'
                : busy
                  ? 'Connecting'
                  : phase === 'unavailable'
                    ? 'Unavailable'
                    : phase === 'error'
                      ? 'Failed'
                      : 'Disconnected'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { try { rfbRef.current?.sendCtrlAltDel(); } catch { /* not connected */ } }}
            disabled={phase !== 'connected'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="Send Ctrl+Alt+Del to the desktop"
          >
            Ctrl+Alt+Del
          </button>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10"
          >
            <IconRefresh size={13} /> Reconnect
          </button>
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={screenRef} className="absolute inset-0" />
        {phase !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
            {busy ? (
              <>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <p className="max-w-md text-sm leading-6 text-slate-300">
                  {phase === 'installing'
                    ? 'The graphical desktop is being installed on your server. This takes a few minutes on a new server and this view connects by itself when it is ready. The terminal works in the meantime.'
                    : 'Connecting to your desktop...'}
                </p>
              </>
            ) : (
              <>
                <p className="max-w-md text-sm leading-6 text-red-300">
                  {message || 'The desktop session ended. This can happen if the server stopped or the session was idle for 30 minutes.'}
                </p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-500"
                >
                  <IconRefresh size={14} /> Try again
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
