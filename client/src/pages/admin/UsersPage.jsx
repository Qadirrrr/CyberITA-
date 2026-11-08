import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  Pagination,
  Select,
  Skeleton,
} from '../../components/ui';
import { IconCheckCircle, IconCopy, IconEdit, IconPlus, IconSearch, IconShield, IconUsers } from '../../components/icons';
import { ROLES, STANDARD_ROLES } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/format';
import { emailError, nameError, passwordError } from '../../lib/validation';

const roleTone = { admin: 'rose', instructor: 'accent', student: 'brand' };

const EMPTY_CREATE_FORM = { fullName: '', email: '', role: 'instructor', password: '', headline: '' };

function CredentialRow({ label, value, onCopy }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-night-900/60 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="truncate font-mono text-xs text-slate-200">{value}</p>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={() => onCopy(value)} className="shrink-0">
        <IconCopy size={13} /> Copy
      </Button>
    </div>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createErrors, setCreateErrors] = useState({});
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateErrors({});
    setCreatedCredentials(null);
    setCreating(true);
  };

  const closeCreate = () => {
    setCreating(false);
    setCreatedCredentials(null);
    setCreateErrors({});
  };

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    openCreate();
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, role, status]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users', {
        params: {
          role: role === 'all' ? undefined : role,
          status: status === 'all' ? undefined : status,
          search: debounced || undefined,
          page,
          limit: 20,
        },
      });
      setUsers(data.users || []);
      setTotal(data.total || 0);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, role, status, page]);

  const saveUser = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const nextName = nameError(editing?.full_name, { label: 'Name' });
    if (nextName) nextErrors.fullName = nextName;
    if (editing?.password) {
      const nextPassword = passwordError(editing.password, { label: 'Password' });
      if (nextPassword) nextErrors.password = nextPassword;
    }
    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const payload = {
        fullName: editing.full_name,
        role: editing.role,
        isActive: Boolean(editing.is_active),
      };
      if (editing.password) payload.password = editing.password;
      await api.patch(`/users/${editing.id}`, payload);
      toast.success('User updated.');
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the user.'));
    } finally {
      setSaving(false);
    }
  };

  const isSelf = editing?.id === currentUser?.id;

  const createUser = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const nextName = nameError(createForm.fullName, { label: 'Full name' });
    if (nextName) nextErrors.fullName = nextName;
    const nextEmail = emailError(createForm.email);
    if (nextEmail) nextErrors.email = nextEmail;
    if (createForm.password) {
      const nextPassword = passwordError(createForm.password, { label: 'Password' });
      if (nextPassword) nextErrors.password = nextPassword;
    }
    if (createForm.headline.trim().length > 160) nextErrors.headline = 'Headline must be at most 160 characters.';
    setCreateErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const payload = {
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim().toLowerCase(),
        role: createForm.role,
        headline: createForm.headline.trim() || undefined,
      };
      if (createForm.password) payload.password = createForm.password;
      const { data } = await api.post('/users', payload);
      setCreatedCredentials({
        fullName: data.user.full_name,
        email: data.user.email,
        role: data.user.role,
        temporaryPassword: data.temporaryPassword,
      });
      toast.success(`${ROLES[data.user.role]} account created.`);
      setPage(1);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create the account.'));
    } finally {
      setSaving(false);
    }
  };

  const copyValue = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard.');
    } catch {
      toast.error('Could not copy. Select the value manually.');
    }
  };

  const hasFilters = Boolean(debounced) || role !== 'all' || status !== 'all';
  const clearFilters = () => {
    setSearch('');
    setRole('all');
    setStatus('all');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">User management</h1>
          <p className="mt-1 text-sm text-slate-400">Roles, account status and access across the platform.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">
            <IconUsers size={12} /> {total} accounts
          </Badge>
          <Button size="sm" onClick={openCreate}>
            <IconPlus size={14} /> Create account
          </Button>
        </div>
      </div>

      <Card className="space-y-3 p-4">
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email…" className="input pl-9" aria-label="Search users" />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-1.5">
            {['all', 'student', 'instructor', 'admin'].map((item) => (
              <button key={item} type="button" onClick={() => setRole(item)} className={`chip capitalize ${role === item ? 'chip-active' : ''}`}>
                {item === 'all' ? 'All roles' : ROLES[item]}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {['all', 'active', 'disabled'].map((item) => (
              <button key={item} type="button" onClick={() => setStatus(item)} className={`chip capitalize ${status === item ? 'chip-active' : ''}`}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={IconShield}
          title={hasFilters ? 'No users match' : 'No accounts yet'}
          message={
            hasFilters
              ? 'Adjust the role, status or search filters.'
              : 'Create the first admin, instructor or student account to get started.'
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
            ) : (
              <Button onClick={openCreate}>
                <IconPlus size={14} /> Create account
              </Button>
            )
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Account</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 font-medium">Courses</th>
                    <th className="px-3 py-2.5 font-medium">Labs</th>
                    <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                    <th className="px-3 py-2.5 font-medium">Joined</th>
                    <th className="px-5 py-2.5 text-right font-medium">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm text-slate-200">
                              {user.full_name}
                              {user.id === currentUser?.id && <Badge tone="slate">you</Badge>}
                              {!user.is_active && <Badge tone="rose">disabled</Badge>}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><Badge tone={roleTone[user.role]}>{ROLES[user.role]}</Badge></td>
                      <td className="px-3 py-3 text-[11px] text-slate-300">{user.enrolled_courses}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-300">{user.lab_sessions}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{user.last_login_at ? formatDate(user.last_login_at) : 'N/A'}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{formatDate(user.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => { setEditErrors({}); setEditing({ ...user, password: '' }); }}>
                          <IconEdit size={13} /> Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination page={page} limit={20} total={total} onPageChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit user"
        description={editing?.email}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveUser} loading={saving}>Save changes</Button>
          </>
        }
      >
        {editing && (
          <form onSubmit={saveUser} noValidate className="space-y-4">
            <Input label="Full name" value={editing.full_name} onChange={(event) => setEditing((current) => ({ ...current, full_name: event.target.value }))} required error={editErrors.fullName} />
            <Select
              label="Role"
              value={editing.role}
              onChange={(event) => setEditing((current) => ({ ...current, role: event.target.value }))}
              disabled={isSelf || !STANDARD_ROLES.includes(editing.role)}
              hint={
                isSelf
                  ? 'You cannot change your own role.'
                  : !STANDARD_ROLES.includes(editing.role)
                    ? 'Moderator roles are managed from Moderator Management.'
                    : 'Instructors manage courses and labs. Admins manage users and messages.'
              }
            >
              {!STANDARD_ROLES.includes(editing.role) && (
                <option value={editing.role}>{ROLES[editing.role] || editing.role}</option>
              )}
              {Object.entries(ROLES)
                .filter(([key]) => STANDARD_ROLES.includes(key))
                .map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
            </Select>
            <div>
              <Checkbox
                label="Account is active"
                checked={Boolean(editing.is_active)}
                onChange={(event) => setEditing((current) => ({ ...current, is_active: event.target.checked }))}
                disabled={isSelf}
              />
              {isSelf && <p className="mt-1 text-[10px] text-slate-600">You cannot disable your own account.</p>}
            </div>
            <Input
              label="Reset password (optional)"
              type="password"
              autoComplete="new-password"
              value={editing.password}
              onChange={(event) => setEditing((current) => ({ ...current, password: event.target.value }))}
              hint="Leave blank to keep the current password. New passwords need 8+ characters, a letter and a number."
              error={editErrors.password}
            />
            {editing.last_login_at && (
              <p className="text-[10px] text-slate-500">Last sign-in {formatDateTime(editing.last_login_at)}</p>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={creating}
        onClose={closeCreate}
        title={createdCredentials ? 'Account created' : 'Create account'}
        description={createdCredentials ? 'Share these sign-in details securely.' : 'Provision an admin, instructor or student account.'}
        footer={
          createdCredentials ? (
            <Button onClick={closeCreate}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeCreate}>Cancel</Button>
              <Button onClick={createUser} loading={saving}>Create account</Button>
            </>
          )
        }
      >
        {createdCredentials ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                <IconCheckCircle size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-100">{createdCredentials.fullName} can now sign in.</p>
                <p className="mt-0.5 text-[11px] text-emerald-200/70">
                  {ROLES[createdCredentials.role]} access is active immediately.
                </p>
              </div>
            </div>
            <CredentialRow label="Email" value={createdCredentials.email} onCopy={copyValue} />
            {createdCredentials.temporaryPassword ? (
              <>
                <CredentialRow label="Temporary password" value={createdCredentials.temporaryPassword} onCopy={copyValue} />
                <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200">
                  Copy this password now. It will not be shown again.
                </p>
              </>
            ) : (
              <p className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-slate-400">
                The password you entered is ready to share securely.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={createUser} noValidate className="space-y-4">
            <Input
              label="Full name"
              autoFocus
              value={createForm.fullName}
              onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))}
              error={createErrors.fullName}
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={createForm.email}
              onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
              error={createErrors.email}
            />
            <Select
              label="Role"
              value={createForm.role}
              onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))}
              hint="Admins manage accounts, messages and platform settings. Instructors manage courses and labs."
            >
              <option value="instructor">Instructor</option>
              <option value="admin">Admin</option>
              <option value="student">Student</option>
            </Select>
            <Input
              label="Temporary password (optional)"
              type="password"
              autoComplete="new-password"
              value={createForm.password}
              onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              hint="Leave blank to generate a secure password. Passwords need 8+ characters, a letter and a number."
              error={createErrors.password}
            />
            <Input
              label="Headline (optional)"
              value={createForm.headline}
              onChange={(event) => setCreateForm((current) => ({ ...current, headline: event.target.value }))}
              hint="A short role or specialty shown on their profile."
              error={createErrors.headline}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
