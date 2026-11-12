import { useEffect, useRef, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import useClickOutside from '../../hooks/useClickOutside';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconCheckCircle,
  IconChevronDown,
  IconCloud,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconServer,
  IconTrash,
  IconXCircle,
} from '../../components/icons';
import { useConfirm } from '../ConfirmDialog';

const EMPTY_FORM = {
  name: '',
  dockerHost: '',
  serverType: 'local',
  agentUrl: '',
  agentSecret: '',
  location: '',
  description: '',
  maxSessions: 0,
  status: 'active',
};

const STATUS_TONE = { active: 'emerald', maintenance: 'amber', disabled: 'slate' };

/**
 * Admin-managed lab servers + lab assignment.
 *
 * A server is a Docker host (blank = the API host's daemon). Each lab gets one
 * server; every student still receives a separate isolated container there.
 */
export default function LabServerAdminPanel() {
  const [confirmNode, askConfirm] = useConfirm();
  const toast = useToast();
  const [servers, setServers] = useState([]);
  const [defaultHost, setDefaultHost] = useState(null);
  const [image, setImage] = useState('');
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingLabs, setLoadingLabs] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', server? }
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [openActionId, setOpenActionId] = useState(null);
  const actionRef = useRef(null);
  useClickOutside(actionRef, () => setOpenActionId(null), openActionId !== null);

  const [openUsageId, setOpenUsageId] = useState(null);
  const usageRef = useRef(null);
  useClickOutside(usageRef, () => setOpenUsageId(null), openUsageId !== null);
  const [verifyResults, setVerifyResults] = useState({});
  const [assigningId, setAssigningId] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');

  const loadServers = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/admin/lab-servers');
      setServers(data.servers || []);
      setDefaultHost(data.defaultHost || null);
      setImage(data.image || '');
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load lab servers.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadLabs = async (silent = false) => {
    if (!silent) setLoadingLabs(true);
    try {
      const { data } = await api.get('/admin/labs');
      setLabs(data.labs || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load the lab list.'));
    } finally {
      if (!silent) setLoadingLabs(false);
    }
  };

  useEffect(() => {
    loadServers();
    loadLabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ mode: 'create' });
  };

  const openEdit = (server) => {
    setForm({
      name: server.name || '',
      dockerHost: server.docker_host || '',
      serverType: server.server_type || 'local',
      agentUrl: server.agent_url || '',
      agentSecret: '',
      location: server.location || '',
      description: server.description || '',
      maxSessions: server.max_sessions ?? 0,
      status: server.status || 'active',
    });
    setModal({ mode: 'edit', server });
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        dockerHost: form.dockerHost.trim() || null,
        serverType: form.serverType,
        agentUrl: form.agentUrl.trim() || null,
        location: form.location.trim(),
        description: form.description.trim(),
        maxSessions: Number(form.maxSessions) || 0,
        status: form.status,
      };
      if (form.agentSecret.trim()) payload.agentSecret = form.agentSecret.trim();
      if (modal.mode === 'create') {
        await api.post('/admin/lab-servers', payload);
        toast.success('Lab server added.');
      } else {
        await api.put(`/admin/lab-servers/${modal.server.id}`, payload);
        toast.success('Lab server updated.');
      }
      setModal(null);
      await Promise.all([loadServers(true), loadLabs(true)]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the lab server.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (server) => {
    if (!(await askConfirm({ title: 'Delete lab server?', message: `Delete the lab server "${server.name}"? Labs assigned to it will fall back to the default host.`, confirmLabel: 'Delete server', danger: true }))) return;
    setDeletingId(server.id);
    try {
      await api.delete(`/admin/lab-servers/${server.id}`);
      toast.success('Lab server deleted.');
      await Promise.all([loadServers(true), loadLabs(true)]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the lab server.'));
    } finally {
      setDeletingId(null);
    }
  };

  const verify = async (server) => {
    setVerifyingId(server.id);
    try {
      const { data } = await api.post(`/admin/lab-servers/${server.id}/verify`);
      setVerifyResults((current) => ({ ...current, [server.id]: data }));
      if (data.ok) toast.success(`"${server.name}" is ready.`);
      else toast.error(`"${server.name}" failed verification.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not verify the lab server.'));
    } finally {
      setVerifyingId(null);
    }
  };

  const assign = async (lab, value) => {
    setAssigningId(lab.id);
    const labServerId = value ? Number(value) : null;
    try {
      const { data } = await api.put(`/admin/labs/${lab.id}/server`, { labServerId });
      setLabs((current) =>
        current.map((item) =>
          item.id === lab.id
            ? { ...item, lab_server_id: data.lab.lab_server_id, lab_server_name: data.lab.lab_server_name }
            : item
        )
      );
      await loadServers(true);
      toast.success(
        data.lab.lab_server_id
          ? `"${lab.title}" now runs on ${data.lab.lab_server_name}.`
          : `"${lab.title}" uses the default lab host.`
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not assign the lab server.'));
    } finally {
      setAssigningId(null);
    }
  };

  const activeServers = servers.filter((server) => server.status === 'active');
  const filteredLabs = labs.filter(
    (lab) =>
      !assignSearch.trim() ||
      `${lab.title} ${lab.course_title || ''}`.toLowerCase().includes(assignSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      {confirmNode}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <IconServer size={16} className="text-brand-300" /> Lab hosts
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Docker hosts that run student containers. Leave the host empty to use the API server's own daemon
              {defaultHost ? ` (${defaultHost})` : ''}.
            </p>
            {image && (
              <p className="mt-1 text-[11px] text-slate-500">
                Lab image: <span className="font-mono text-slate-400">{image}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => Promise.all([loadServers(), loadLabs()])}>
              <IconRefresh size={14} /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <IconPlus size={14} /> Add server
            </Button>
          </div>
        </div>

        {error && (
          <Alert tone="error" className="mt-4" title="Could not load servers">
            {error}
          </Alert>
        )}

        <div className="mt-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : servers.length === 0 ? (
            <EmptyState
              icon={IconCloud}
              title="No lab servers yet"
              message="Add the Docker host(s) that should run labs. Without one, labs run on the API host's default daemon."
              action={
                <Button size="sm" onClick={openCreate}>
                  <IconPlus size={14} /> Add your first server
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-xs">
                <thead className="border-b border-white/5 text-slate-400">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Server</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Type / host</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Status</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Load</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Labs</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {servers.map((server) => {
                    const result = verifyResults[server.id];
                    return (
                      <tr key={server.id} className="align-top transition hover:bg-white/[0.02]">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-200">{server.name}</div>
                          {server.location && <div className="text-[10px] text-slate-500">{server.location}</div>}
                          {server.description && (
                            <div className="mt-1 max-w-[280px] text-[10px] text-slate-500">{server.description}</div>
                          )}
                          {result && (
                            <div className="mt-2 space-y-1">
                              {(result?.checks || []).map((check) => (
                                <div key={check.id} className="flex items-start gap-1.5 text-[10px]">
                                  {check.ok ? (
                                    <IconCheckCircle size={11} className="mt-0.5 shrink-0 text-emerald-300" />
                                  ) : (
                                    <IconXCircle size={11} className="mt-0.5 shrink-0 text-rose-300" />
                                  )}
                                  <span className={check.ok ? 'text-slate-400' : 'text-rose-300'}>
                                    {check.label}
                                    {check.detail ? `: ${check.detail}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-[11px] text-slate-400">
                            {server.server_type === 'remote-agent'
                              ? `Agent: ${server.agent_url || '-'}`
                              : (server.docker_host || 'Local daemon (default)')}
                          </span>
                          {server.server_type === 'remote-agent' && (
                            <div className="mt-1.5">
                              <div
                                className="relative inline-block"
                                ref={openUsageId === server.id ? usageRef : null}
                              >
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setOpenUsageId(openUsageId === server.id ? null : server.id)}
                                >
                                  <IconCpu size={12} /> Usage
                                </Button>
                                {openUsageId === server.id && (
                                  <div className="absolute left-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-night-900/95 p-3 text-[11px] shadow-xl backdrop-blur">
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                      Live metrics
                                    </p>
                                    <div className="space-y-1.5 text-slate-300">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-400">Heartbeat</span>
                                        <span className="font-mono text-slate-200">
                                          {server.last_heartbeat_at
                                            ? new Date(server.last_heartbeat_at).toLocaleTimeString()
                                            : 'none'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-400">CPU</span>
                                        <span className="font-mono text-slate-200">{server.cpu_percent ?? 0}%</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-400">RAM</span>
                                        <span className="font-mono text-slate-200">
                                          {server.memory_used_mb ?? 0} / {server.memory_total_mb ?? 0} MB
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-400">Disk</span>
                                        <span className="font-mono text-slate-200">
                                          {server.disk_used_gb ?? 0} / {server.disk_total_gb ?? 0} GB
                                        </span>
                                      </div>
                                      {server.docker_available === false && (
                                        <div className="pt-1 text-rose-300">Docker daemon is down</div>
                                      )}
                                      {server.last_error && (
                                        <div className="pt-1 text-rose-300">{server.last_error}</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={STATUS_TONE[server.status] || 'slate'}>{server.status}</Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-400">
                          {server.running_sessions} running
                          {Number(server.max_sessions) > 0 ? ` / ${server.max_sessions} max` : ' · unlimited'}
                        </td>
                        <td className="px-3 py-3 text-slate-400">{server.assigned_labs}</td>
                        <td className="px-3 py-3">
                          <div
                            className="relative inline-block text-right"
                            ref={openActionId === server.id ? actionRef : null}
                          >
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setOpenActionId(openActionId === server.id ? null : server.id)}
                            >
                              Actions <IconChevronDown size={12} className={`transition ${openActionId === server.id ? 'rotate-180' : ''}`} />
                            </Button>
                            {openActionId === server.id && (
                              <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-night-900/95 p-1 shadow-xl backdrop-blur">
                                <button
                                  type="button"
                                  disabled={verifyingId === server.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
                                  onClick={() => {
                                    verify(server);
                                    setOpenActionId(null);
                                  }}
                                >
                                  <IconCpuCheck /> {verifyingId === server.id ? 'Verifying…' : 'Verify'}
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-white/5"
                                  onClick={() => {
                                    openEdit(server);
                                    setOpenActionId(null);
                                  }}
                                >
                                  <IconEdit size={13} /> Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === server.id}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
                                  onClick={() => {
                                    remove(server);
                                    setOpenActionId(null);
                                  }}
                                >
                                  <IconTrash size={13} /> {deletingId === server.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white">Lab → server assignment</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Every student session for a lab starts on its assigned server in a separate container. Changes apply to new
              sessions only.
            </p>
          </div>
          <Input
            placeholder="Search labs..."
            value={assignSearch}
            onChange={(event) => setAssignSearch(event.target.value)}
            className="w-full text-xs sm:w-56"
          />
        </div>

        <div className="mt-4">
          {loadingLabs ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredLabs.length === 0 ? (
            <EmptyState icon={IconServer} title="No labs found" message="Create a lab first, then assign it a server." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-white/5 text-slate-400">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Lab</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Course</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Steps</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Sessions</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">Assigned server</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {filteredLabs.map((lab) => (
                    <tr key={lab.id} className="transition hover:bg-white/[0.02]">
                      <td className="max-w-[260px] px-3 py-2.5">
                        <div className="truncate font-medium text-slate-200" title={lab.title}>
                          {lab.title}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {lab.status} · <span className="font-mono">{lab.slug}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{lab.course_title || 'Standalone'}</td>
                      <td className="px-3 py-2.5 text-slate-400">{lab.step_count}</td>
                      <td className="px-3 py-2.5 text-slate-400">{lab.session_count}</td>
                      <td className="px-3 py-2.5">
                        <Select
                          className="min-w-[190px] text-xs"
                          value={lab.lab_server_id ? String(lab.lab_server_id) : ''}
                          disabled={assigningId === lab.id}
                          onChange={(event) => assign(lab, event.target.value)}
                        >
                          <option value="">Default lab host</option>
                          {servers.map((server) => (
                            <option key={server.id} value={String(server.id)}>
                              {server.name}
                              {server.status !== 'active' ? ` (${server.status})` : ''}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {activeServers.length === 0 && servers.length > 0 && (
          <p className="mt-3 text-[11px] text-amber-300">
            No server is currently active. New sessions on labs assigned to a paused server will be refused until an
            administrator re-enables it.
          </p>
        )}
      </Card>

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.mode === 'edit' ? 'Edit lab server' : 'Add lab server'}
        description="A Docker host that runs student lab containers."
      >
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Enter lab name"
            required
            maxLength={120}
          />
          <Select
            label="Server type"
            value={form.serverType}
            onChange={(event) => setForm((current) => ({ ...current, serverType: event.target.value }))}
          >
            <option value="local">Local Docker host (DOCKER_HOST)</option>
            <option value="remote-agent">Remote Lab Agent</option>
          </Select>
          {form.serverType === 'remote-agent' ? (
            <>
              <Input
                label="Agent URL"
                value={form.agentUrl}
                onChange={(event) => setForm((current) => ({ ...current, agentUrl: event.target.value }))}
                placeholder="Enter agent URL"
                hint="Private URL of the Lab Agent. Only the Main Server should reach it."
                required
                maxLength={500}
              />
              <Input
                label={modal?.mode === 'edit' ? 'Agent secret (leave blank to keep)' : 'Agent secret'}
                type="password"
                value={form.agentSecret}
                onChange={(event) => setForm((current) => ({ ...current, agentSecret: event.target.value }))}
                placeholder="Enter agent secret"
                maxLength={200}
              />
            </>
          ) : (
            <Input
              label="Docker host"
              value={form.dockerHost}
              onChange={(event) => setForm((current) => ({ ...current, dockerHost: event.target.value }))}
              placeholder="Enter Docker host"
              hint="Must be reachable from the API server. The Docker CLI uses this as DOCKER_HOST."
              maxLength={500}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Location"
              value={form.location}
              onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
              placeholder="Enter location"
              maxLength={160}
            />
            <Input
              label="Max concurrent sessions"
              type="number"
              min={0}
              value={form.maxSessions}
              onChange={(event) => setForm((current) => ({ ...current, maxSessions: event.target.value }))}
              hint="0 means unlimited."
            />
          </div>
          <Select
            label="Status"
            value={form.status}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="active">Active: accepts new sessions</option>
            <option value="maintenance">Maintenance: refuse new sessions</option>
            <option value="disabled">Disabled: refuse new sessions</option>
          </Select>
          <Textarea
            label="Description"
            rows={2}
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            maxLength={4000}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving} disabled={!form.name.trim()}>
              {modal?.mode === 'edit' ? 'Save changes' : 'Add server'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** Small inline icon wrapper (server check) so the page keeps a tidy toolbar. */
function IconCpuCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 17.5l1.8 1.8 3.4-3.6" />
    </svg>
  );
}
