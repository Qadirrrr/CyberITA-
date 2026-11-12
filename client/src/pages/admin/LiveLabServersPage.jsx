import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, EmptyState, Skeleton } from '../../components/ui';
import { IconCheck, IconClock, IconCopy, IconRefresh, IconServer, IconStop } from '../../components/icons';
import { useConfirm } from '../../components/ConfirmDialog';
import { formatDateTime } from '../../lib/format';

function formatCountdown(totalSeconds) {
  if (totalSeconds == null) return null;
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function LiveLabServersPage() {
  const toast = useToast();
  const [confirmNode, askConfirm] = useConfirm();
  const [servers, setServers] = useState([]);
  const [counts, setCounts] = useState({ total: 0, running: 0, provisioning: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [terminatingId, setTerminatingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/admin/live-lab-servers');
      setServers(data.servers || []);
      setCounts(data.counts || { total: 0, running: 0, provisioning: 0 });
      setError('');
    } catch (err) {
      if (!silent) setError(getErrorMessage(err, 'Could not load live lab servers.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the list fresh on its own; the countdowns tick every second.
  useEffect(() => {
    const id = setInterval(() => load({ silent: true }), 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const copyIp = async (server) => {
    try {
      await navigator.clipboard.writeText(server.publicIp);
      setCopiedId(server.sessionId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error('Could not copy the IP address.');
    }
  };

  const terminate = async (server) => {
    const ok = await askConfirm({
      title: 'Terminate this lab server?',
      message: `${server.studentName || server.studentEmail} is working on "${server.labTitle}". The cloud server will be destroyed right away and their session will end. Screenshots they already uploaded stay saved.`,
      confirmLabel: 'Terminate server',
      danger: true,
    });
    if (!ok) return;
    setTerminatingId(server.sessionId);
    try {
      await api.post(`/admin/lab-sessions/${server.sessionId}/stop`);
      toast.success('Lab server terminated.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not terminate the lab server.'));
    } finally {
      setTerminatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {confirmNode}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Live Lab Servers</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real cloud servers running right now for VPS labs. This page refreshes itself every 15 seconds.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => load()} loading={loading} className="gap-1.5">
          <IconRefresh size={13} /> Refresh
        </Button>
      </div>

      {!loading && !error && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 dark:border-white/10 dark:bg-night-900/40 dark:text-slate-300">
            <IconServer size={12} /> {counts.total} live server{counts.total === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {counts.running} running
          </span>
          {counts.provisioning > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
              <IconClock size={12} /> {counts.provisioning} provisioning
            </span>
          )}
        </div>
      )}

      {error && <Alert tone="error" title="Could not load live lab servers">{error}</Alert>}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : servers.length === 0 ? (
        error ? null : (
          <EmptyState
            icon={IconServer}
            title="No live lab servers"
            message="No student is running a VPS lab right now. Servers appear here as soon as a student starts one, and leave the list when the lab ends."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-night-950/90">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-white/10 dark:bg-night-900/60">
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Student</th>
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lab</th>
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Profile</th>
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Public IP</th>
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Instance</th>
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Started</th>
                  <th className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Time left</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => {
                  const remaining = server.expiresAt
                    ? Math.max(0, Math.round((new Date(server.expiresAt).getTime() - now) / 1000))
                    : null;
                  return (
                    <tr key={server.sessionId} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{server.studentName || 'Student'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{server.studentEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{server.labTitle}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-white/10 dark:text-slate-300">{server.profile}</span>
                      </td>
                      <td className="px-4 py-3">
                        {server.publicIp ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-[13px] text-slate-700 dark:text-slate-200">{server.publicIp}</span>
                            <button
                              type="button"
                              onClick={() => copyIp(server)}
                              className="rounded p-0.5 text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
                              title="Copy IP address"
                              aria-label="Copy IP address"
                            >
                              {copiedId === server.sessionId ? <IconCheck size={12} className="text-emerald-500" /> : <IconCopy size={12} />}
                            </button>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Assigning...</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {server.serverName ? <p className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">{server.serverName}</p> : null}
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{server.instanceId || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        {server.status === 'running' ? (
                          <Badge tone="emerald" dot>Running</Badge>
                        ) : (
                          <Badge tone="amber" dot="animate-pulse">Provisioning</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {server.startedAt ? formatDateTime(server.startedAt) : formatDateTime(server.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {server.status === 'provisioning' ? (
                          <span className="text-xs text-slate-400">Starts when ready</span>
                        ) : remaining != null ? (
                          <span className={`font-mono text-[13px] font-semibold tabular-nums ${remaining <= 60 ? 'text-rose-500' : remaining <= 300 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>
                            {formatCountdown(remaining)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">No limit</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => terminate(server)}
                          loading={terminatingId === server.sessionId}
                          className="gap-1"
                        >
                          <IconStop size={11} /> Terminate
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
