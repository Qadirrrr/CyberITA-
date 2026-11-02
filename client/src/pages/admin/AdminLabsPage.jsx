import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
  StatCard,
  Tabs,
} from '../../components/ui';
import {
  IconCheckCircle,
  IconClock,
  IconCpu,
  IconExternalLink,
  IconLayers,
  IconPlay,
  IconRefresh,
  IconSearch,
  IconStop,
  IconTerminal,
  IconTrash,
  IconXCircle,
} from '../../components/icons';
import { formatDateTime, timeAgo } from '../../lib/format';
import LabServerAdminPanel from '../../components/admin/LabServerAdminPanel';
import LabSubmissionsRecordPanel from '../../components/admin/LabSubmissionsRecordPanel';
import DockerContainerMonitorPanel from '../../components/admin/DockerContainerMonitorPanel';

const statusTone = {
  running: 'emerald',
  provisioning: 'amber',
  stopped: 'slate',
  error: 'rose',
};

export default function AdminLabsPage() {
  const toast = useToast();
  const [health, setHealth] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useState(urlTab || 'containers');

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', nextTab);
        return next;
      },
      { replace: true }
    );
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [healthRes, sessionsRes] = await Promise.all([
        api.get('/admin/health'),
        api.get('/admin/lab-sessions', {
          params: { page, limit: 15, status: statusFilter, search: search.trim() || undefined },
        }),
      ]);
      setHealth(healthRes.data);
      setSessions(sessionsRes.data.sessions || []);
      setTotal(sessionsRes.data.total || 0);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch lab monitoring data.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 15000);
    return () => clearInterval(interval);
  }, [page, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleStopSession = async (session) => {
    if (!window.confirm(`Force-stop session #${session.id} for ${session.user_email}?`)) return;
    setActionBusy(session.id);
    try {
      await api.post(`/admin/lab-sessions/${session.id}/stop`);
      toast.success(`Session #${session.id} stopped successfully.`);
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not stop session.'));
    } finally {
      setActionBusy(null);
    }
  };

  const handleTriggerCleanup = async () => {
    setCleaning(true);
    try {
      const { data } = await api.post('/admin/lab-sessions/cleanup');
      toast.success(`Cleanup finished: ${data.result.stopped} session(s) stopped.`);
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Cleanup failed.'));
    } finally {
      setCleaning(false);
    }
  };

  const dockerAvailable = health?.infrastructure?.docker?.available;

  const handleVerifyRuntime = async () => {
    setVerifying(true);
    try {
      const { data } = await api.post('/admin/labs/runtime/verify');
      setVerifyResult(data);
      if (data.ok) toast.success('Lab runtime verification passed.');
      else toast.error('Lab runtime verification found problems. Review the checks below.');
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not run the runtime verification.'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Lab Infrastructure & Sessions</h1>
          <p className="mt-1 text-xs text-slate-400">
            Monitor real-time isolated container sessions, Docker daemon status, and resource usage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'sessions' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTriggerCleanup}
                loading={cleaning}
                title="Clean up all expired or orphaned sessions"
              >
                <IconRefresh size={14} /> Cleanup Expired
              </Button>
              <Button variant="ghost" size="sm" onClick={() => loadData(false)}>
                <IconRefresh size={14} /> Refresh
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'containers', label: 'Live Docker Containers' },
          { id: 'sessions', label: 'Sessions & health' },
          { id: 'servers', label: 'Servers & assignment' },
          { id: 'submissions', label: 'Submission record' },
        ]}
        value={tab}
        onChange={handleTabChange}
      />

      {tab === 'containers' && <DockerContainerMonitorPanel />}
      {tab === 'servers' && <LabServerAdminPanel />}
      {tab === 'submissions' && <LabSubmissionsRecordPanel />}

      {tab === 'sessions' && (
        <>
      {/* Infrastructure Health Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Docker Daemon</span>
            <Badge tone={dockerAvailable ? 'emerald' : 'amber'}>
              {dockerAvailable ? 'Online' : 'Unavailable'}
            </Badge>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-200">
            {dockerAvailable ? 'Docker Engine Ready' : 'Engine Offline'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 truncate">
            {health?.infrastructure?.docker?.reason || `Provider: ${health?.infrastructure?.configuredProvider || 'docker'}`}
          </p>
        </Card>

        <StatCard
          label="Running Labs"
          value={health?.infrastructure?.sessionStats?.running ?? 0}
          tone="emerald"
          icon={IconPlay}
          hint="Active containers"
        />

        <StatCard
          label="Total Sessions"
          value={health?.infrastructure?.sessionStats?.total ?? 0}
          tone="brand"
          icon={IconTerminal}
          hint={`${health?.infrastructure?.sessionStats?.stopped ?? 0} completed`}
        />

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Memory (Node RSS)</span>
            <span className="text-xs text-slate-500">
              {health?.system?.platform ? `${health.system.platform} (${health.system.cpuCount} CPUs)` : 'System'}
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold text-slate-200">
            {health?.memory?.processRssBytes
              ? `${Math.round(health.memory.processRssBytes / 1024 / 1024)} MB`
              : 'N/A'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Database Latency: {health?.database?.latencyMs ?? 0}ms
          </p>
        </Card>
      </div>

      {!dockerAvailable && (
        <Alert tone="amber" title="Real Lab Infrastructure Notice">
          Docker is not currently active on this host, so labs cannot start. Start Docker Desktop (or the Docker daemon) and labs will run again automatically without restarting the app.
        </Alert>
      )}

      {/* Runtime readiness: live end-to-end verification of the real lab stack */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white">Runtime readiness</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Provisions a real throwaway container, runs a command as UID 1000 and cleans it up — proving labs work end to end.
            </p>
          </div>
          <Button size="sm" onClick={handleVerifyRuntime} loading={verifying}>
            <IconCpu size={14} /> Run readiness check
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Engine',
              value: dockerAvailable ? health?.infrastructure?.docker?.reason || 'Online' : 'Unavailable',
            },
            { label: 'Default image', value: health?.infrastructure?.limits?.image || '—' },
            { label: 'Session TTL', value: `${health?.infrastructure?.limits?.sessionTtlMinutes ?? '—'} min` },
            {
              label: 'Per-session limits',
              value: `${health?.infrastructure?.limits?.memoryMb ?? '—'} MB · ${health?.infrastructure?.limits?.cpus ?? '—'} CPU · ${health?.infrastructure?.limits?.pidsLimit ?? '—'} PIDs`,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
              <p className="mt-1 truncate text-sm text-slate-200" title={String(item.value)}>{item.value}</p>
            </div>
          ))}
        </div>

        {verifyResult && (
          <div className="mt-4 space-y-2">
            {(verifyResult?.checks || []).map((check) => (
              <div
                key={check.id}
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 ${
                  check.ok ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : 'border-rose-400/20 bg-rose-400/[0.05]'
                }`}
              >
                {check.ok ? (
                  <IconCheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                ) : (
                  <IconXCircle size={16} className="mt-0.5 shrink-0 text-rose-300" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-200">
                    {check.label}
                    {typeof check.ms === 'number' && (
                      <span className="ml-2 text-[10px] font-normal text-slate-500">{check.ms}ms</span>
                    )}
                  </p>
                  {check.detail && <p className="mt-0.5 text-[11px] text-slate-400">{check.detail}</p>}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-slate-600">
              Checked {new Date(verifyResult.at).toLocaleString()} ·{' '}
              {verifyResult.ok ? 'all checks passed' : 'action required'}
            </p>
          </div>
        )}
      </Card>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Filter status:</span>
            {['all', 'running', 'provisioning', 'stopped', 'error'].map((st) => (
              <Button
                key={st}
                type="button"
                size="sm"
                variant={statusFilter === st ? 'primary' : 'ghost'}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
              >
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search user, lab or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
            <Button type="submit" size="sm" variant="secondary">
              <IconSearch size={14} />
            </Button>
          </div>
        </form>
      </Card>

      {/* Sessions Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No sessions found"
              message="No lab sessions match the selected filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/5 bg-white/[0.02] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Session ID</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Lab Title</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      #{session.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{session.user_name || 'Anonymous'}</div>
                      <div className="text-[10px] text-slate-500">{session.user_email}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate" title={session.lab_title}>
                      <span className="font-medium text-slate-200">{session.lab_title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-slate-400">{session.provider}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[session.status] || 'slate'}>
                        {session.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDateTime(session.started_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {session.completed_steps} steps · {session.screenshot_count} shots
                    </td>
                    <td className="px-4 py-3 text-right">
                      {session.status === 'running' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStopSession(session)}
                          loading={actionBusy === session.id}
                          className="text-rose-400 hover:text-rose-300"
                          title="Force stop container and session"
                        >
                          <IconStop size={13} /> Stop
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 15 && (
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs text-slate-400">
            <span>
              Showing {sessions.length} of {total} sessions
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page * 15 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
        </>
      )}
    </div>
  );
}
