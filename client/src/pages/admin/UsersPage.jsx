import { useEffect, useState } from 'react';
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
import { IconEdit, IconSearch, IconShield, IconUsers } from '../../components/icons';
import { ROLES } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/format';

const roleTone = { admin: 'rose', instructor: 'accent', student: 'brand' };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">User management</h1>
          <p className="mt-1 text-sm text-slate-400">Roles, account status and access across the platform.</p>
        </div>
        <Badge tone="brand">
          <IconUsers size={12} /> {total} accounts
        </Badge>
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
        <EmptyState icon={IconShield} title="No users match" message="Adjust the role, status or search filters." />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
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
                      <td className="px-3 py-3 text-[11px] text-slate-500">{user.last_login_at ? formatDate(user.last_login_at) : '—'}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{formatDate(user.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => setEditing({ ...user, password: '' })}>
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
          <form onSubmit={saveUser} className="space-y-4">
            <Input label="Full name" value={editing.full_name} onChange={(event) => setEditing((current) => ({ ...current, full_name: event.target.value }))} required />
            <Select
              label="Role"
              value={editing.role}
              onChange={(event) => setEditing((current) => ({ ...current, role: event.target.value }))}
              disabled={isSelf}
              hint={isSelf ? 'You cannot change your own role.' : 'Instructors manage courses and labs. Admins manage users and messages.'}
            >
              {Object.entries(ROLES).map(([key, label]) => (
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
              hint="Minimum 8 characters with at least one number. Leave blank to keep the current password."
            />
            {editing.last_login_at && (
              <p className="text-[10px] text-slate-500">Last sign-in {formatDateTime(editing.last_login_at)}</p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
