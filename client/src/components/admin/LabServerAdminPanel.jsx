import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
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
  IconCloud,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconServer,
  IconTrash,
  IconXCircle,
} from '../../components/icons';

const EMPTY_FORM = {
  name: '',
  dockerHost: '',
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
        location: form.location.trim(),
        description: form.description.trim(),
        maxSessions: Number(form.maxSessions) || 0,
        status: form.status,
      };
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
    if (!window.confirm(`Delete the lab server "${server.name}"? Labs assigned to it will fall back to the default host.`)) return;
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
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
              <IconServer size={16} className="text-brand-300" /> Lab servers
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
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/5 text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Server</th>
                    <th className="px-3 py-2.5 font-medium">Docker host</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Load</th>
                    <th className="px-3 py-2.5 font-medium">Labs</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
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
                              {result.checks.map((check) => (
                                <div key={check.id} className="flex items-start gap-1.5 text-[10px]">
                                  {check.ok ? (
                                    <IconCheckCircle size={11} className="mt-0.5 shrink-0 text-emerald-300" />
                                  ) : (
                                    <IconXCircle size={11} className="mt-0.5 shrink-0 text-rose-300" />
                                  )}
                                  <span className={check.ok ? 'text-slate-400' : 'text-rose-300'}>
                                    {check.label}
                                    {check.detail ? ` — ${check.detail}` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-[11px] text-slate-400">
                            {server.docker_host || 'Local daemon (default)'}
                          </span>
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
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => verify(server)}
                              loading={verifyingId === server.id}
                              title="Test this Docker host and lab image"
                            >
                              <IconCpuCheck />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(server)} title="Edit server">
                              <IconEdit size={13} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-400 hover:text-rose-300"
                              onClick={() => remove(server)}
                              loading={deletingId === server.id}
                              title="Delete server"
                            >
                              <IconTrash size={13} />
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
            className="w-56 text-xs"
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
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/5 text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Lab</th>
                    <th className="px-3 py-2.5 font-medium">Course</th>
                    <th className="px-3 py-2.5 font-medium">Steps</th>
                    <th className="px-3 py-2.5 font-medium">Sessions</th>
                    <th className="px-3 py-2.5 font-medium">Assigned server</th>
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
            placeholder="e.g. Lab node 1"
            required
            maxLength={120}
          />
          <Input
            label="Docker host"
            value={form.dockerHost}
            onChange={(event) => setForm((current) => ({ ...current, dockerHost: event.target.value }))}
            placeholder="ssh://lab@10.0.0.5 or tcp://10.0.0.5:2376 — leave empty for local"
            hint="Must be reachable from the API server. The Docker CLI uses this as DOCKER_HOST."
            maxLength={500}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Location"
              value={form.location}
              onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
              placeholder="e.g. Campus lab B"
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
            <option value="active">Active — accepts new sessions</option>
            <option value="maintenance">Maintenance — refuse new sessions</option>
            <option value="disabled">Disabled — refuse new sessions</option>
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
