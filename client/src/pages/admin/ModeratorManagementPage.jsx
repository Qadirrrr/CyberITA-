import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
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
  Textarea,
} from '../../components/ui';
import {
  IconAlert,
  IconCheckCircle,
  IconEdit,
  IconFlag,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconShield,
  IconTrash,
  IconUsers,
} from '../../components/icons';
import AssignmentPicker from '../../components/moderation/AssignmentPicker';
import {
  MODERATOR_STATUS,
  MODERATOR_TIERS,
  assignmentsFromApi,
  describeAssignment,
  tierMeta,
} from '../../lib/moderation';
import { formatDate } from '../../lib/format';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  password: '',
  tier: 'subject_moderator',
  displayName: '',
  notes: '',
  assignments: [],
};

const TIER_TABS = [
  { id: 'all', label: 'All moderators' },
  { id: 'senior_moderator', label: 'Senior' },
  { id: 'subject_moderator', label: 'Subject / Course' },
];

export default function ModeratorManagementPage() {
  const toast = useToast();

  const [moderators, setModerators] = useState([]);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metaLoading, setMetaLoading] = useState(true);

  const [tier, setTier] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createErrors, setCreateErrors] = useState({});
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ tier: 'subject_moderator', displayName: '', notes: '', status: 'active' });
  const [savingEdit, setSavingEdit] = useState(false);

  const [assigning, setAssigning] = useState(null);
  const [assignmentDraft, setAssignmentDraft] = useState([]);
  const [savingAssignments, setSavingAssignments] = useState(false);

  const [removing, setRemoving] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const { data } = await api.get('/moderators/meta');
      setMeta(data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load courses and instructors.'));
    } finally {
      setMetaLoading(false);
    }
  }, [toast]);

  const loadRoster = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { data } = await api.get('/moderators', {
          params: {
            status: status === 'all' ? undefined : status,
            search: search || undefined,
          },
        });
        setModerators(data.moderators || []);
        setStats(data.stats || null);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not load moderators.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [status, search, toast]
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const openCreate = () => {
    setCreateForm(EMPTY_FORM);
    setCreateErrors({});
    setCreateOpen(true);
  };

  const createModerator = async (event) => {
    event.preventDefault();
    const errors = {};
    if (createForm.fullName.trim().length < 2) errors.fullName = 'Enter the moderator name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) errors.email = 'Enter a valid email address.';
    if (createForm.password.length < 8) errors.password = 'Use at least 8 characters.';
    setCreateErrors(errors);
    if (Object.keys(errors).length) return;

    setCreating(true);
    try {
      await api.post('/moderators', {
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password,
        tier: createForm.tier,
        displayName: createForm.displayName.trim(),
        notes: createForm.notes.trim(),
        assignments: createForm.assignments,
      });
      toast.success(
        createForm.tier === 'senior_moderator' ? 'Senior moderator created.' : 'Subject moderator created.'
      );
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      await Promise.all([loadRoster(true), loadMeta()]);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create the moderator.'));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (moderator) => {
    setEditing(moderator);
    setEditForm({
      tier: moderator.tier,
      displayName: moderator.display_name || '',
      notes: moderator.notes || '',
      status: moderator.status,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      await api.put(`/moderators/${editing.id}`, {
        tier: editForm.tier,
        displayName: editForm.displayName.trim(),
        notes: editForm.notes.trim(),
        status: editForm.status,
      });
      toast.success('Moderator updated.');
      setEditing(null);
      await loadRoster(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the moderator.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const openAssignments = (moderator) => {
    setAssigning(moderator);
    setAssignmentDraft(assignmentsFromApi(moderator.assignments || []));
  };

  const saveAssignments = async () => {
    if (!assigning) return;
    setSavingAssignments(true);
    try {
      await api.put(`/moderators/${assigning.id}/assignments`, { assignments: assignmentDraft });
      toast.success('Assignments saved. The moderator has been notified.');
      setAssigning(null);
      await loadRoster(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the assignments.'));
    } finally {
      setSavingAssignments(false);
    }
  };

  const removeModerator = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await api.delete(`/moderators/${removing.id}`);
      toast.success('Moderator removed. The account was deactivated and its records kept.');
      setRemoving(null);
      await loadRoster(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not remove the moderator.'));
    } finally {
      setDeleting(false);
    }
  };

  const tierCounts = useMemo(() => {
    const counts = { senior_moderator: 0, subject_moderator: 0 };
    moderators.forEach((moderator) => {
      if (counts[moderator.tier] !== undefined) counts[moderator.tier] += 1;
    });
    return counts;
  }, [moderators]);

  const visibleModerators = useMemo(
    () => (tier === 'all' ? moderators : moderators.filter((moderator) => moderator.tier === tier)),
    [moderators, tier]
  );

  const tabs = TIER_TABS.map((tab) => ({
    ...tab,
    count: tab.id === 'all' ? moderators.length : tierCounts[tab.id],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300">
              <IconShield size={18} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold">Moderator management</h1>
              <p className="text-xs text-slate-400">
                Admin → Senior Moderator → Subject/Course Moderator → Instructors
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to="/admin" size="sm" variant="ghost">
            <IconShield size={14} /> Admin overview
          </Button>
          <Button size="sm" variant="secondary" onClick={() => Promise.all([loadRoster(), loadMeta()])}>
            <IconRefresh size={14} /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <IconPlus size={14} /> New moderator
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconUsers}
          label="Active moderators"
          value={stats?.moderators ?? 0}
          hint={`${stats?.senior_moderators ?? 0} senior · ${stats?.subject_moderators ?? 0} subject`}
          onClick={() => document.getElementById('moderator-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatCard
          icon={IconFlag}
          label="Open reports"
          value={stats?.open_reports ?? 0}
          hint="Awaiting moderator action"
          tone="amber"
          onClick={() => document.getElementById('moderator-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatCard
          icon={IconAlert}
          label="Escalated"
          value={stats?.escalated_reports ?? 0}
          hint="With senior moderators"
          tone="accent"
          onClick={() => document.getElementById('moderator-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatCard
          icon={IconCheckCircle}
          label="Resolved"
          value={stats?.resolved_reports ?? 0}
          hint="Closed complaints"
          tone="emerald"
          onClick={() => document.getElementById('moderator-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      </div>

      <Card id="moderator-list" className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 dark:border-white/10 dark:bg-night-900/60">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTier(tab.id)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  tier === tab.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
                <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-300">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'active', 'suspended'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`chip capitalize text-[11px] ${status === item ? 'chip-active' : ''}`}
              >
                {item === 'all' ? 'All status' : MODERATOR_STATUS[item]?.label || item}
              </button>
            ))}
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchInput.trim());
              }}
            >
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search name or email…"
                className="h-9 min-w-[190px] text-xs"
                aria-label="Search moderators"
              />
              <Button type="submit" size="sm" variant="secondary">
                <IconSearch size={14} />
              </Button>
            </form>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : visibleModerators.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={IconShield}
              title={search || tier !== 'all' || status !== 'all' ? 'No moderators match' : 'No moderators yet'}
              message={
                search || tier !== 'all' || status !== 'all'
                  ? 'Adjust the tier, status or search filters.'
                  : 'Create a senior moderator first, then add subject/course moderators and assign their scope.'
              }
              action={
                <Button onClick={openCreate}>
                  <IconPlus size={14} /> New moderator
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Moderator</th>
                  <th className="px-3 py-2.5 font-medium">Tier</th>
                  <th className="px-3 py-2.5 font-medium">Scope</th>
                  <th className="px-3 py-2.5 font-medium">Open reports</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="px-5 py-2.5 text-right font-medium">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibleModerators.map((moderator) => {
                  const tierInfo = tierMeta(moderator.tier);
                  const statusInfo = MODERATOR_STATUS[moderator.status] || { label: moderator.status, tone: 'slate' };
                  const counts = moderator.assignment_counts || {};
                  return (
                    <tr key={moderator.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={moderator.avatar_url} name={moderator.display_name || moderator.user_name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-200">
                              {moderator.display_name || moderator.user_name}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">{moderator.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={tierInfo.tone}>{tierInfo.label}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1 text-[10px] text-slate-400">
                          {moderator.tier === 'senior_moderator' ? (
                            <span>{counts.subject_moderators || 0} subject moderators</span>
                          ) : (
                            <>
                              <span>{counts.courses || 0} courses</span>
                              <span>·</span>
                              <span>{counts.instructors || 0} instructors</span>
                              <span>·</span>
                              <span>{counts.subjects || 0} subjects</span>
                            </>
                          )}
                        </div>
                        {(moderator.assignments || []).length > 0 && (
                          <p className="mt-0.5 max-w-[240px] truncate text-[10px] text-slate-600">
                            {moderator.assignments.slice(0, 3).map(describeAssignment).join(', ')}
                            {moderator.assignments.length > 3 ? '…' : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={Number(moderator.open_reports) > 0 ? 'amber' : 'slate'}>
                          {moderator.open_reports ?? 0}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{formatDate(moderator.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => openAssignments(moderator)}>
                            Assignments
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(moderator)}>
                            <IconEdit size={13} /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(moderator)}>
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
      </Card>

      <p className="text-[11px] text-slate-500">
        Moderators never receive admin access. They cannot reach platform settings, lab servers, Docker
        containers, API keys or user role management.
      </p>

      {/* ---------- create ---------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create moderator"
        description="Provision a scoped moderation account. The password is set by you."
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createModerator} loading={creating}>
              <IconPlus size={14} /> Create moderator
            </Button>
          </>
        }
      >
        <form onSubmit={createModerator} noValidate className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              value={createForm.fullName}
              onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))}
              error={createErrors.fullName}
              autoComplete="name"
              placeholder="Enter full name"
            />
            <Input
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
              error={createErrors.email}
              autoComplete="email"
              placeholder="Enter email"
            />
            <Input
              label="Temporary password"
              type="password"
              value={createForm.password}
              onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              error={createErrors.password}
              autoComplete="new-password"
              hint="At least 8 characters. Share it securely."
            />
            <Select
              label="Tier"
              value={createForm.tier}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  tier: event.target.value,
                  // Senior moderators supervise moderators, never courses.
                  assignments: [],
                }))
              }
              hint={MODERATOR_TIERS[createForm.tier]?.description}
            >
              {Object.entries(MODERATOR_TIERS).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Input
              label="Display name (optional)"
              value={createForm.displayName}
              onChange={(event) => setCreateForm((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="Enter display name"
            />
          </div>

          <Textarea
            label="Internal notes (optional)"
            rows={2}
            value={createForm.notes}
            onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Enter internal notes"
          />

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Assignments</h3>
              <Badge tone={createForm.assignments.length ? 'brand' : 'slate'}>
                {createForm.assignments.length} selected
              </Badge>
            </div>
            {metaLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <AssignmentPicker
                tier={createForm.tier}
                meta={meta}
                value={createForm.assignments}
                onChange={(assignments) => setCreateForm((current) => ({ ...current, assignments }))}
              />
            )}
          </div>
        </form>
      </Modal>

      {/* ---------- edit ---------- */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit moderator"
        description={editing?.email}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={savingEdit}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Tier"
            value={editForm.tier}
            onChange={(event) => setEditForm((current) => ({ ...current, tier: event.target.value }))}
            hint="Changing the tier keeps the account and its history."
          >
            {Object.entries(MODERATOR_TIERS).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </Select>
          <Input
            label="Display name"
            value={editForm.displayName}
            onChange={(event) => setEditForm((current) => ({ ...current, displayName: event.target.value }))}
          />
          <Select
            label="Account status"
            value={editForm.status}
            onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
          >
            {Object.entries(MODERATOR_STATUS).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </Select>
          <Textarea
            label="Internal notes"
            rows={3}
            value={editForm.notes}
            onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>
      </Modal>

      {/* ---------- assignments ---------- */}
      <Modal
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        title="Assignments"
        description={
          assigning
            ? `${assigning.display_name || assigning.user_name} · ${tierMeta(assigning.tier).label}`
            : undefined
        }
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button onClick={saveAssignments} loading={savingAssignments}>
              Save assignments
            </Button>
          </>
        }
      >
        {assigning && (
          <AssignmentPicker
            tier={assigning.tier}
            meta={meta}
            value={assignmentDraft}
            onChange={setAssignmentDraft}
          />
        )}
      </Modal>

      {/* ---------- remove ---------- */}
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove moderator"
        description="The account is deactivated and loses moderation access. Existing reports and history are preserved."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={removeModerator} loading={deleting}>
              <IconTrash size={14} /> Remove
            </Button>
          </>
        }
      >
        {removing && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
            <p className="font-medium">{removing.display_name || removing.user_name}</p>
            <p className="mt-1 text-xs">
              {removing.email} · {tierMeta(removing.tier).label}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
