import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '../../components/ui';
import {
  IconBarChart,
  IconCheckCircle,
  IconClock,
  IconRefresh,
  IconSearch,
  IconShield,
  IconUsers,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';

const actionTones = {
  admin: 'rose',
  auth: 'brand',
  course: 'emerald',
  lab: 'accent',
  report: 'amber',
};

function getActionTone(action = '') {
  const prefix = action.split('.')[0];
  return actionTones[prefix] || 'slate';
}

export default function AdminAuditLogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLogs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/admin/audit-logs', {
        params: {
          page,
          limit: 25,
          search: search.trim() || undefined,
          action: actionFilter.trim() || undefined,
        },
      });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load audit logs.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, actionFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadLogs();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Platform Audit & Security Logs</h1>
          <p className="mt-1 text-xs text-slate-400">
            Immutable log of user events, administrative actions, access attempts, and system events.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => loadLogs(false)}>
          <IconRefresh size={14} /> Refresh
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Quick category:</span>
            {[
              { label: 'All', value: '' },
              { label: 'Admin Actions', value: 'admin' },
              { label: 'Auth & Security', value: 'auth' },
              { label: 'Courses & Lessons', value: 'course' },
              { label: 'Labs', value: 'lab' },
              { label: 'Reports', value: 'report' },
            ].map((cat) => (
              <Button
                key={cat.label}
                type="button"
                size="sm"
                variant={actionFilter === cat.value ? 'primary' : 'ghost'}
                onClick={() => {
                  setActionFilter(cat.value);
                  setPage(1);
                }}
              >
                {cat.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search user email or event..."
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

      {/* Logs Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No audit events found"
              description="No activity matches the selected criteria."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/5 bg-white/[0.02] text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Target Entity</th>
                  <th className="px-4 py-3 font-medium">Metadata / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={getActionTone(log.action)}>
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {log.user_email ? (
                        <div>
                          <div className="font-medium text-slate-200">{log.user_name || 'User'}</div>
                          <div className="text-[10px] text-slate-500">{log.user_email} · <span className="capitalize">{log.user_role}</span></div>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-mono text-[11px]">System / Anonymous</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {log.entity_type ? (
                        <span>
                          <strong className="text-slate-300">{log.entity_type}</strong>
                          {log.entity_id ? ` #${log.entity_id}` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 25 && (
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs text-slate-400">
            <span>
              Showing {logs.length} of {total} events
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
                disabled={page * 25 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
