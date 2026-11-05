import { useCallback, useEffect, useRef, useState } from 'react';
import api, { getAccessToken, getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  StatCard,
} from '../ui';
import {
  IconCheckCircle,
  IconClock,
  IconCopy,
  IconCpu,
  IconEye,
  IconFileText,
  IconLayers,
  IconPlay,
  IconRefresh,
  IconSearch,
  IconServer,
  IconShield,
  IconStop,
  IconTerminal,
  IconTrash,
  IconUsers,
  IconXCircle,
  IconZap,
} from '../icons';
import { formatDateTime } from '../../lib/format';

const statusTone = {
  running: 'emerald',
  provisioning: 'amber',
  stopped: 'slate',
  error: 'rose',
};

export default function DockerContainerMonitorPanel() {
  const toast = useToast();
  const [containers, setContainers] = useState([]);
  const [counts, setCounts] = useState({
    total: 0,
    running: 0,
    stopped: 0,
    error: 0,
    avgCpu: '0.00%',
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Live WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef(null);

  // Action states
  const [actionBusy, setActionBusy] = useState({});
  const [inspectModal, setInspectModal] = useState({ open: false, data: null, loading: false, tab: 'overview' });
  const [logsModal, setLogsModal] = useState({ open: false, sessionId: null, containerId: '', logs: '', tail: 250, loading: false });
  const [resetModal, setResetModal] = useState({ open: false, container: null, busy: false });
  const [removeModal, setRemoveModal] = useState({ open: false, container: null, busy: false });
  const [copiedId, setCopiedId] = useState(null);

  // Load data via REST API
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/admin/docker/containers', {
        params: {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: search.trim() || undefined,
          page,
          limit: 30,
        },
      });
      setContainers(data.containers || []);
      setCounts(data.counts || {});
      setTotal(data.total || 0);
    } catch (err) {
      if (!silent) toast.error(getErrorMessage(err, 'Failed to fetch Docker containers.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, search, page, toast]);

  // Initial fetch and poll fallback
  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket Live Updates Connection
  useEffect(() => {
    let socket;
    let disposed = false;
    let fallbackTimer = null;

    const connectWebSocket = () => {
      try {
        const token = getAccessToken();
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        socket = new WebSocket(
          `${protocol}://${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`
        );
        socketRef.current = socket;

        socket.addEventListener('open', () => {
          if (disposed) return;
          setWsConnected(true);
          socket.send(JSON.stringify({ type: 'admin.containers.subscribe' }));
        });

        socket.addEventListener('message', (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'admin.containers.snapshot' || msg.type === 'admin.containers.update') {
              const payload = msg.data || {};
              // Only overwrite if not currently searching/filtering to prevent search jitter
              if (!search.trim() && statusFilter === 'all' && page === 1) {
                setContainers(payload.containers || []);
                setCounts(payload.counts || {});
                setTotal(payload.total || 0);
              } else if (payload.counts) {
                setCounts(payload.counts);
              }
            }
          } catch {
            // ignore malformed frame
          }
        });

        socket.addEventListener('close', () => {
          if (disposed) return;
          setWsConnected(false);
          // Retry after 5s
          fallbackTimer = setTimeout(connectWebSocket, 5000);
        });

        socket.addEventListener('error', () => {
          setWsConnected(false);
        });
      } catch {
        setWsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      disposed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (socket) {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'admin.containers.unsubscribe' }));
          }
          socket.close();
        } catch {
          // ignore
        }
      }
    };
  }, [search, statusFilter, page]);

  // Copy container ID to clipboard
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success('Container ID copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Inspect container
  const handleInspect = async (container) => {
    setInspectModal({ open: true, data: null, loading: true, tab: 'overview' });
    try {
      const { data } = await api.get(`/admin/docker/containers/${container.sessionId}`);
      setInspectModal((prev) => ({ ...prev, data, loading: false }));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to inspect container.'));
      setInspectModal((prev) => ({ ...prev, open: false, loading: false }));
    }
  };

  // View logs
  const handleViewLogs = async (container, tail = 250) => {
    setLogsModal({
      open: true,
      sessionId: container.sessionId,
      containerId: container.containerId,
      logs: 'Loading logs...',
      tail,
      loading: true,
    });
    try {
      const { data } = await api.get(`/admin/docker/containers/${container.sessionId}/logs`, {
        params: { tail },
      });
      setLogsModal((prev) => ({
        ...prev,
        logs: data.logs,
        loading: false,
      }));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch container logs.'));
      setLogsModal((prev) => ({ ...prev, logs: 'Failed to load logs.', loading: false }));
    }
  };

  // Container Lifecycle Actions
  const executeAction = async (action, sessionId, successMessage) => {
    setActionBusy((prev) => ({ ...prev, [sessionId]: action }));
    try {
      await api.post(`/admin/docker/containers/${sessionId}/${action}`);
      toast.success(successMessage);
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to ${action} container.`));
    } finally {
      setActionBusy((prev) => ({ ...prev, [sessionId]: null }));
    }
  };

  const handleStart = (container) => {
    executeAction('start', container.sessionId, `Container started for ${container.studentName}.`);
  };

  const handleStop = (container) => {
    if (!window.confirm(`Stop container for ${container.studentName} (${container.shortId})?`)) return;
    executeAction('stop', container.sessionId, `Container stopped.`);
  };

  const handleRestart = (container) => {
    executeAction('restart', container.sessionId, `Container restarted for ${container.studentName}.`);
  };

  const handleConfirmReset = async () => {
    if (!resetModal.container) return;
    setResetModal((prev) => ({ ...prev, busy: true }));
    try {
      await api.post(`/admin/docker/containers/${resetModal.container.sessionId}/reset`);
      toast.success(`Container reset clean for ${resetModal.container.studentName}. Progress preserved.`);
      setResetModal({ open: false, container: null, busy: false });
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reset container.'));
      setResetModal((prev) => ({ ...prev, busy: false }));
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeModal.container) return;
    setRemoveModal((prev) => ({ ...prev, busy: true }));
    try {
      await api.post(`/admin/docker/containers/${removeModal.container.sessionId}/remove`);
      toast.success(`Container removed. Progress and submissions are preserved.`);
      setRemoveModal({ open: false, container: null, busy: false });
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove container.'));
      setRemoveModal((prev) => ({ ...prev, busy: false }));
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Live Monitoring Header & Status Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-xl font-bold text-white">Live Docker Container Monitoring</h2>
            <Badge tone={wsConnected ? 'emerald' : 'amber'} className="flex items-center gap-1.5 px-2 py-0.5">
              <span className={`inline-block h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[10px] uppercase font-bold tracking-wider">
                {wsConnected ? 'Live WebSocket' : 'Polling'}
              </span>
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Real-time isolation and resource metrics across Ubuntu lab servers. Students only access their own container.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => loadData(false)}>
            <IconRefresh size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Running Containers"
          value={counts.running ?? 0}
          tone="emerald"
          icon={IconPlay}
          hint="Live student sessions"
          onClick={() => {
            setStatusFilter('running');
            setPage(1);
          }}
        />
        <StatCard
          label="Total Managed Containers"
          value={counts.total ?? 0}
          tone="brand"
          icon={IconLayers}
          hint={`${counts.stopped ?? 0} stopped / preserved`}
          onClick={() => {
            setStatusFilter('all');
            setPage(1);
          }}
        />
        <Card
          className="p-4 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-white/20"
          onClick={() => document.getElementById('container-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Average Active CPU</span>
            <IconCpu size={16} className="text-amber-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-slate-200">
            {counts.avgCpu || '0.00%'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Across {counts.running ?? 0} running container(s)
          </p>
        </Card>
        <Card
          className="p-4 cursor-pointer transition-all hover:border-slate-300 dark:hover:border-white/20"
          onClick={() => document.getElementById('container-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Host Engine</span>
            <Badge tone="emerald">Native Engine</Badge>
          </div>
          <p className="mt-2 text-base font-semibold text-slate-200">
            Ubuntu Docker Daemon
          </p>
          <p className="mt-1 text-[11px] text-slate-500 truncate">
            No Docker Desktop / Portainer required
          </p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card id="container-list" className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Filter status:</span>
            {['all', 'running', 'stopped', 'error'].map((st) => (
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

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <Input
              placeholder="Search student, lab, or container ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-xs w-64"
            />
            <Button type="submit" size="sm" variant="secondary">
              <IconSearch size={14} />
            </Button>
            {search && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setSearchInput('');
                  setPage(1);
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </div>
      </Card>

      {/* Live Containers Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : containers.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No containers found"
              message="No student Docker containers match the selected filters."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/5 bg-white/[0.02] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Lab Title</th>
                  <th className="px-4 py-3 font-medium">Container ID</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">CPU</th>
                  <th className="px-4 py-3 font-medium">RAM Usage</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Server</th>
                  <th className="px-4 py-3 font-medium">Terminal</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {containers.map((c) => {
                  const isBusy = Boolean(actionBusy[c.sessionId]);
                  return (
                    <tr key={c.sessionId} className="hover:bg-white/[0.02] transition">
                      {/* Student */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={c.studentName} size="xs" />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-200 truncate">{c.studentName}</div>
                            <div className="text-[10px] text-slate-500 truncate">{c.studentEmail}</div>
                          </div>
                        </div>
                      </td>

                      {/* Lab Title */}
                      <td className="px-4 py-3 max-w-[180px] truncate" title={c.labTitle}>
                        <div className="font-medium text-slate-200 truncate">{c.labTitle}</div>
                        <div className="text-[10px] text-slate-500">
                          {c.progress.completed}/{c.progress.total} steps · {c.screenshotCount} shots
                        </div>
                      </td>

                      {/* Container ID */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                          <span title={c.containerId} className="cursor-help">
                            {c.shortId || '—'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyId(c.containerId)}
                            className="text-slate-500 hover:text-slate-300 transition"
                            title="Copy full container ID"
                          >
                            <IconCopy size={12} className={copiedId === c.containerId ? 'text-emerald-400' : ''} />
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge tone={statusTone[c.status] || 'slate'}>
                          {c.status}
                        </Badge>
                      </td>

                      {/* CPU */}
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {c.status === 'running' ? (
                          <span className="text-amber-300 font-semibold">{c.cpuUsage}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* RAM Usage */}
                      <td className="px-4 py-3 text-[11px] font-mono">
                        {c.status === 'running' ? (
                          <div>
                            <span className="text-slate-200 font-medium">{c.ramUsage}</span>
                            {c.ramPerc !== '—' && (
                              <span className="ml-1 text-[10px] text-slate-500">({c.ramPerc})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Session Duration */}
                      <td className="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <IconClock size={12} className="text-slate-500" />
                          <span>{c.sessionDuration}</span>
                        </div>
                      </td>

                      {/* Server Information */}
                      <td className="px-4 py-3 text-[11px] max-w-[130px] truncate" title={c.server.name}>
                        <div className="text-slate-300 truncate font-medium">{c.server.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">{c.server.location}</div>
                      </td>

                      {/* Terminal Connection Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              c.terminalConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                            }`}
                          />
                          <span
                            className={`text-[11px] font-medium ${
                              c.terminalConnected ? 'text-emerald-300' : 'text-slate-500'
                            }`}
                          >
                            {c.terminalConnected ? 'Connected' : 'Idle'}
                          </span>
                        </div>
                      </td>

                      {/* Admin Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleInspect(c)}
                            title="Inspect container details and timeline"
                          >
                            <IconEye size={12} />
                          </Button>

                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleViewLogs(c)}
                            title="View live stdout/stderr logs"
                          >
                            <IconTerminal size={12} />
                          </Button>

                          {c.status === 'running' ? (
                            <>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => handleRestart(c)}
                                disabled={isBusy}
                                title="Restart container"
                              >
                                <IconRefresh size={12} className={actionBusy[c.sessionId] === 'restart' ? 'animate-spin' : ''} />
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => handleStop(c)}
                                disabled={isBusy}
                                className="text-rose-400 hover:text-rose-300"
                                title="Stop container"
                              >
                                <IconStop size={12} />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => handleStart(c)}
                              disabled={isBusy}
                              className="text-emerald-400 hover:text-emerald-300"
                              title="Start container"
                            >
                              <IconPlay size={12} />
                            </Button>
                          )}

                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setResetModal({ open: true, container: c, busy: false })}
                            disabled={isBusy}
                            className="text-amber-400 hover:text-amber-300"
                            title="Reset container environment cleanly (preserves student progress)"
                          >
                            <IconRefresh size={12} />
                          </Button>

                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setRemoveModal({ open: true, container: c, busy: false })}
                            disabled={isBusy}
                            className="text-slate-400 hover:text-rose-400"
                            title="Remove container (preserves submissions & progress in DB)"
                          >
                            <IconTrash size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 30 && (
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs text-slate-400">
            <span>
              Showing {containers.length} of {total} containers
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
                disabled={page * 30 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Inspect Container Modal */}
      {inspectModal.open && (
        <Modal
          open={inspectModal.open}
          onClose={() => setInspectModal((prev) => ({ ...prev, open: false }))}
          title={`Container Details — ${inspectModal.data?.session?.containerId?.slice(0, 16) || 'Loading...'}`}
          size="lg"
        >
          {inspectModal.loading || !inspectModal.data ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Tab selector */}
              <div className="flex border-b border-white/10 gap-4 text-xs">
                {['overview', 'docker', 'events'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInspectModal((prev) => ({ ...prev, tab: t }))}
                    className={`pb-2 capitalize font-medium transition border-b-2 ${
                      inspectModal.tab === t
                        ? 'border-brand-400 text-white'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t === 'docker' ? 'Docker Inspect' : t === 'events' ? 'Lifecycle Events' : 'Overview'}
                  </button>
                ))}
              </div>

              {/* Overview Tab */}
              {inspectModal.tab === 'overview' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] text-slate-500 uppercase">Student</span>
                      <p className="font-medium text-slate-200 mt-0.5">{inspectModal.data.student.name}</p>
                      <p className="text-[10px] text-slate-500">{inspectModal.data.student.email}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] text-slate-500 uppercase">Lab Title</span>
                      <p className="font-medium text-slate-200 mt-0.5">{inspectModal.data.lab.title}</p>
                      <p className="text-[10px] text-slate-500">Image: {inspectModal.data.lab.image}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] text-slate-500 uppercase">Server</span>
                      <p className="font-medium text-slate-200 mt-0.5">{inspectModal.data.server.name}</p>
                      <p className="text-[10px] text-slate-500">{inspectModal.data.server.location}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] text-slate-500 uppercase">Status</span>
                      <div className="mt-1">
                        <Badge tone={statusTone[inspectModal.data.session.status] || 'slate'}>
                          {inspectModal.data.session.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] text-slate-500 uppercase">Duration</span>
                      <p className="font-medium text-slate-200 mt-0.5">{inspectModal.data.session.duration}</p>
                      <p className="text-[10px] text-slate-500">Started: {formatDateTime(inspectModal.data.session.startedAt)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] text-slate-500 uppercase">IP Address</span>
                      <p className="font-mono text-slate-200 mt-0.5">{inspectModal.data.docker?.ipAddress || 'isolated'}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-slate-300">
                    <div className="text-slate-500 mb-1">// Container Full Name & Path</div>
                    <div>Container: <span className="text-emerald-400">{inspectModal.data.session.containerId}</span></div>
                    <div>Working Directory: <span className="text-brand-300">{inspectModal.data.session.cwd}</span></div>
                  </div>
                </div>
              )}

              {/* Docker Inspect Tab */}
              {inspectModal.tab === 'docker' && (
                <div className="space-y-2">
                  <pre className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] text-emerald-400">
                    {inspectModal.data.docker
                      ? JSON.stringify(inspectModal.data.docker, null, 2)
                      : '// Container inspection unavailable or container stopped.'}
                  </pre>
                </div>
              )}

              {/* Lifecycle Events Tab */}
              {inspectModal.tab === 'events' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(inspectModal.data.lifecycleEvents || []).length === 0 ? (
                    <p className="text-slate-500 italic p-4 text-center">No lifecycle events recorded for this container.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(inspectModal.data.lifecycleEvents || []).map((ev) => (
                        <div key={ev.id} className="flex items-start justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                          <div>
                            <span className="font-semibold text-brand-300 uppercase tracking-wide text-[10px]">
                              {ev.event}
                            </span>
                            <div className="text-slate-400 text-[11px] mt-0.5">
                              {typeof ev.details === 'object' ? JSON.stringify(ev.details) : String(ev.details)}
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap ml-3">
                            {formatDateTime(ev.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Logs Modal */}
      {logsModal.open && (
        <Modal
          open={logsModal.open}
          onClose={() => setLogsModal((prev) => ({ ...prev, open: false }))}
          title={`Container Logs — ${logsModal.containerId?.slice(0, 16)}`}
          size="xl"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Stdout and Stderr output from container</span>
              <div className="flex items-center gap-2">
                <Select
                  value={logsModal.tail}
                  onChange={(e) => handleViewLogs({ sessionId: logsModal.sessionId, containerId: logsModal.containerId }, Number(e.target.value))}
                  className="text-xs py-1 px-2"
                >
                  <option value={100}>Tail 100</option>
                  <option value={250}>Tail 250</option>
                  <option value={500}>Tail 500</option>
                  <option value={1000}>Tail 1000</option>
                </Select>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => handleViewLogs({ sessionId: logsModal.sessionId, containerId: logsModal.containerId }, logsModal.tail)}
                  loading={logsModal.loading}
                >
                  <IconRefresh size={12} /> Refresh Logs
                </Button>
              </div>
            </div>

            <pre className="max-h-[500px] overflow-auto rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap">
              {logsModal.logs}
            </pre>
          </div>
        </Modal>
      )}

      {/* Reset Confirmation Modal */}
      {resetModal.open && (
        <Modal
          open={resetModal.open}
          onClose={() => setResetModal({ open: false, container: null, busy: false })}
          title="Reset Container Environment"
        >
          <div className="space-y-4 text-xs">
            <Alert tone="amber" title="Reset Student Container">
              This will safely recreate a fresh Docker container for{' '}
              <strong>{resetModal.container?.studentName}</strong> while completely preserving their
              submissions, screenshots, step progress, and grades in the database.
            </Alert>
            <p className="text-slate-300">
              Are you sure you want to clean and rebuild container{' '}
              <span className="font-mono text-emerald-400">{resetModal.container?.shortId}</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setResetModal({ open: false, container: null, busy: false })}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmReset} loading={resetModal.busy}>
                Confirm Reset
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Remove Confirmation Modal */}
      {removeModal.open && (
        <Modal
          open={removeModal.open}
          onClose={() => setRemoveModal({ open: false, container: null, busy: false })}
          title="Remove Container"
        >
          <div className="space-y-4 text-xs">
            <Alert tone="rose" title="Remove Docker Container">
              This will stop and force-remove the Docker container for{' '}
              <strong>{removeModal.container?.studentName}</strong>. The session will be marked as completed/stopped,
              and all student screenshots, submissions, and database records will remain preserved.
            </Alert>
            <p className="text-slate-300">
              Confirm removal of container{' '}
              <span className="font-mono text-rose-400">{removeModal.container?.shortId}</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setRemoveModal({ open: false, container: null, busy: false })}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleConfirmRemove} loading={removeModal.busy}>
                Remove Container
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

