import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Avatar, Badge, Button, Card, EmptyState, Modal, Pagination, ProgressBar, Skeleton } from '../../components/ui';
import { IconArrowRight, IconSearch, IconUser, IconUsers } from '../../components/icons';
import { activityToneClasses, describeActivity } from '../../lib/activity';
import { formatDate, formatDateTime } from '../../lib/format';

export default function StudentsPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/users', { params: { role: 'student', search: debounced || undefined, page, limit: 20 } })
      .then((res) => {
        if (cancelled) return;
        setUsers(res.data.users || []);
        setTotal(res.data.total || 0);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load students.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, page]);

  const openStudent = async (user) => {
    setSelected(user);
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/users/${user.id}`);
      setDetail(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the learner profile.'));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Learners</h1>
          <p className="mt-1 text-sm text-slate-400">Everyone enrolled across the platform, with progress and activity.</p>
        </div>
        <Badge tone="brand">
          <IconUsers size={12} /> {total} students
        </Badge>
      </div>

      <Card className="p-4">
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email…" className="input pl-9" aria-label="Search students" />
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
        <EmptyState icon={IconUser} title="No learners found" message={debounced ? 'Try a different search term.' : 'No students have signed up yet.'} />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Learner</th>
                    <th className="px-3 py-2.5 font-medium">Courses</th>
                    <th className="px-3 py-2.5 font-medium">Lab sessions</th>
                    <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                    <th className="px-3 py-2.5 font-medium">Joined</th>
                    <th className="px-5 py-2.5 text-right font-medium">Profile</th>
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
                              {!user.is_active && <Badge tone="rose">disabled</Badge>}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-300">{user.enrolled_courses}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-300">{user.lab_sessions}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{user.last_login_at ? formatDate(user.last_login_at) : '—'}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-500">{formatDate(user.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openStudent(user)}>
                          View <IconArrowRight size={12} />
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
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.full_name || 'Learner profile'}
        description={selected?.email}
        size="lg"
      >
        {detailLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar src={detail.user.avatar_url} name={detail.user.full_name} size="lg" />
              <div>
                <p className="text-sm text-slate-200">{detail.user.headline || 'No headline'}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {detail.user.enrolled_courses} courses · {detail.user.lab_sessions} lab sessions
                </p>
                {detail.user.bio && <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">{detail.user.bio}</p>}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Enrollments</h3>
              {detail.enrollments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No enrollments.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.enrollments.map((enrollment) => (
                    <li key={enrollment.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`/courses/${enrollment.slug}`} className="truncate text-xs text-slate-200 hover:text-brand-300">
                          {enrollment.title}
                        </Link>
                        <span className="font-mono text-[10px] text-slate-400">{Math.round(Number(enrollment.progress_percent))}%</span>
                      </div>
                      <ProgressBar value={Number(enrollment.progress_percent)} size="sm" className="mt-1.5" tone={enrollment.status === 'completed' ? 'emerald' : 'brand'} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent activity</h3>
              {detail.history.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No activity recorded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/5">
                  {detail.history.slice(0, 10).map((event) => {
                    const { title, tone } = describeActivity(event);
                    return (
                      <li key={event.id} className="flex items-center gap-2 py-1.5 text-[11px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${activityToneClasses(tone).split(' ')[0]}`} />
                        <span className="flex-1 text-slate-300">{title}</span>
                        <span className="text-[10px] text-slate-600">{formatDateTime(event.created_at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
