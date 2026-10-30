import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Pagination,
  Skeleton,
  StatCard,
} from '../../components/ui';
import {
  IconAward,
  IconBookOpen,
  IconEdit,
  IconGraduationCap,
  IconLayers,
  IconRefresh,
  IconSearch,
} from '../../components/icons';
import { formatDate } from '../../lib/format';
import DonutChart from '../../components/DonutChart';

const statusTone = { published: 'emerald', draft: 'amber', archived: 'slate' };

function DonutLegend({ segments, total }) {
  const safeTotal = Number(total) || segments.reduce((s, seg) => s + Number(seg.value || 0), 0);
  return (
    <dl className="w-full min-w-0 space-y-2">
      {segments.map((seg) => {
        const value = Number(seg.value || 0);
        const share = safeTotal > 0 ? Math.round((value / safeTotal) * 100) : 0;
        return (
          <div key={seg.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="flex min-w-0 items-center gap-2 text-slate-400">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="truncate">{seg.label}</span>
            </dt>
            <dd className="shrink-0 tabular-nums text-slate-200">
              <span className="font-medium">{value}</span>
              <span className="ml-1 text-slate-600">{share}%</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function AdminCoursesPage() {
  const toast = useToast();

  const [catalog, setCatalog] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [courses, setCourses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [changingStatus, setChangingStatus] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, categoryFilter]);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const { data } = await api.get('/admin/catalog');
      setCatalog(data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load catalog stats.'));
    } finally {
      setCatalogLoading(false);
    }
  };

  const loadCourses = async () => {
    setListLoading(true);
    try {
      const { data } = await api.get('/admin/courses', {
        params: {
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          category: categoryFilter || undefined,
        },
      });
      setCourses(data.courses || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load courses.'));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { loadCatalog(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCourses(); }, [page, debouncedSearch, statusFilter, categoryFilter]);

  const handleStatusChange = async (course, newStatus) => {
    if (!window.confirm(`Change "${course.title}" to "${newStatus}"?`)) return;
    setChangingStatus(course.id);
    try {
      await api.post(`/admin/courses/${course.id}/status`, { status: newStatus });
      toast.success(`Course marked as ${newStatus}.`);
      loadCourses();
      loadCatalog();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update course status.'));
    } finally {
      setChangingStatus(null);
    }
  };

  const stats = catalog?.stats;
  const enrollmentSegments = [
    { label: 'Active', value: stats?.active_enrollments ?? 0, color: '#38bdf8' },
    { label: 'Completed', value: stats?.completed_enrollments ?? 0, color: '#34d399' },
    {
      label: 'Other',
      value: Math.max(0, (stats?.enrollments ?? 0) - (stats?.active_enrollments ?? 0) - (stats?.completed_enrollments ?? 0)),
      color: '#334155',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Courses & Enrollment</h1>
          <p className="mt-1 text-sm text-slate-400">
            Platform-wide course oversight, categories, learning paths and certificates.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { loadCatalog(); loadCourses(); }}>
            <IconRefresh size={14} /> Refresh
          </Button>
          <Button as={Link} to="/instructor/courses/new" size="sm">
            <IconBookOpen size={14} /> New Course
          </Button>
        </div>
      </div>

      {catalogLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={IconBookOpen} label="Total Courses" value={stats?.courses ?? 0}
            hint={`${stats?.published_courses ?? 0} published · ${stats?.draft_courses ?? 0} drafts`} />
          <StatCard icon={IconGraduationCap} label="Enrollments" value={stats?.enrollments ?? 0}
            hint={`${stats?.completed_enrollments ?? 0} completed`} tone="emerald" />
          <StatCard icon={IconAward} label="Certificates" value={stats?.certificates ?? 0}
            hint={`${stats?.certificates_30d ?? 0} in last 30 days`} tone="amber" />
          <StatCard icon={IconLayers} label="Learning Paths" value={stats?.learning_paths ?? 0}
            hint={`${stats?.published_paths ?? 0} published`} tone="accent" />
        </div>
      )}

      {!catalogLoading && catalog && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Enrollment Breakdown</h2>
            <p className="text-[11px] text-slate-500">Active vs. completed</p>
            <div className="mt-4 flex items-center gap-4">
              <DonutChart segments={enrollmentSegments} total={stats?.enrollments ?? 0} label="total" size={120} thickness={12} />
              <DonutLegend segments={enrollmentSegments} total={stats?.enrollments ?? 0} />
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="font-display text-base font-semibold">Categories</h2>
            <p className="text-[11px] text-slate-500">Click a category to filter courses below</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(catalog.categories || []).slice(0, 6).map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => setCategoryFilter(categoryFilter === cat.category ? '' : cat.category)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
                    categoryFilter === cat.category
                      ? 'border-brand-400/40 bg-brand-400/10 text-brand-200'
                      : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate font-medium">{cat.category}</span>
                  <div className="ml-2 shrink-0 text-right">
                    <span className="font-semibold text-slate-200">{cat.course_count}</span>
                    <span className="ml-1 text-slate-500">courses</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!catalogLoading && catalog?.paths?.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Learning Paths</h2>
              <p className="text-[11px] text-slate-500">Curated course sequences</p>
            </div>
            <Badge tone="accent">{catalog.paths.length} paths</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(catalog?.paths || []).map((lp) => (
              <div key={lp.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200 truncate">{lp.title}</p>
                  <Badge tone={lp.status === 'published' ? 'emerald' : 'slate'}>{lp.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{lp.course_count} courses</span>
                  <span>·</span>
                  <span>{lp.learner_count} learners</span>
                  {lp.level && <><span>·</span><span className="capitalize">{lp.level}</span></>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!catalogLoading && catalog?.recentCertificates?.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Recent Certificates</h2>
              <p className="text-[11px] text-slate-500">Latest course completions</p>
            </div>
            <Badge tone="amber">{stats?.certificates ?? 0} total</Badge>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(catalog?.recentCertificates || []).map((cert) => (
                  <tr key={cert.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-200">{cert.student_name}</p>
                      <p className="text-[10px] text-slate-500">{cert.student_email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">{cert.course_title}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone="emerald">{Math.round(Number(cert.final_progress ?? 100))}%</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{formatDate(cert.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">All Courses</h2>
            <p className="text-[11px] text-slate-500">{total} courses total</p>
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <div className="relative">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses, instructors…"
              className="input pl-9"
              aria-label="Search courses"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['all', 'published', 'draft', 'archived'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`chip capitalize ${statusFilter === s ? 'chip-active' : ''}`}
              >
                {s === 'all' ? 'All statuses' : s}
              </button>
            ))}
            {categoryFilter && (
              <button type="button" onClick={() => setCategoryFilter('')} className="chip chip-active">
                {categoryFilter} ×
              </button>
            )}
          </div>
        </div>

        {listLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState icon={IconBookOpen} title="No courses found" message="Try adjusting your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Course</th>
                    <th className="px-3 py-2.5 font-medium">Instructor</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Category</th>
                    <th className="px-3 py-2.5 font-medium">Enrolled</th>
                    <th className="px-3 py-2.5 font-medium">Completed</th>
                    <th className="px-3 py-2.5 font-medium">Avg. Progress</th>
                    <th className="px-3 py-2.5 font-medium">Certs</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {courses.map((course) => (
                    <tr key={course.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <p className="max-w-[200px] truncate text-sm font-medium text-slate-200">{course.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {course.module_count}m · {course.lesson_count}l · {course.lab_count} labs
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {course.instructor_name ? (
                          <div>
                            <p className="text-xs text-slate-300">{course.instructor_name}</p>
                            <p className="text-[10px] text-slate-500">{course.instructor_email}</p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-600">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={statusTone[course.status] ?? 'slate'}>{course.status}</Badge>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-400">{course.category || '—'}</td>
                      <td className="px-3 py-3 text-[11px] tabular-nums text-slate-300">{course.enrolled_count}</td>
                      <td className="px-3 py-3 text-[11px] tabular-nums text-slate-300">{course.completed_count}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-brand-400"
                              style={{ width: `${Math.min(100, Number(course.avg_progress))}%` }}
                            />
                          </div>
                          <span className="text-[11px] tabular-nums text-slate-400">
                            {Math.round(Number(course.avg_progress))}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] tabular-nums text-slate-400">{course.certificate_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button as={Link} to={`/instructor/courses/${course.id}`} size="sm" variant="ghost">
                            <IconEdit size={13} />
                          </Button>
                          {course.status !== 'published' && (
                            <Button
                              size="sm" variant="ghost"
                              className="text-emerald-400 hover:text-emerald-300"
                              onClick={() => handleStatusChange(course, 'published')}
                              loading={changingStatus === course.id}
                            >
                              Publish
                            </Button>
                          )}
                          {course.status === 'published' && (
                            <Button
                              size="sm" variant="ghost"
                              className="text-amber-400 hover:text-amber-300"
                              onClick={() => handleStatusChange(course, 'draft')}
                              loading={changingStatus === course.id}
                            >
                              Unpublish
                            </Button>
                          )}
                          {course.status !== 'archived' && (
                            <Button
                              size="sm" variant="ghost"
                              className="text-slate-500 hover:text-slate-300"
                              onClick={() => handleStatusChange(course, 'archived')}
                              loading={changingStatus === course.id}
                            >
                              Archive
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Pagination page={page} limit={20} total={total} onPageChange={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
