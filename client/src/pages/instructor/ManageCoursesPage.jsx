import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import {
  IconBookOpen,
  IconEdit,
  IconEye,
  IconLayers,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';

const statusTone = { published: 'emerald', draft: 'amber', archived: 'slate' };
const statuses = ['all', 'published', 'draft', 'archived'];

export default function ManageCoursesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api
      .get('/courses', { params: { all: true, limit: 60 } })
      .then((res) => {
        const list = res.data.courses || [];
        setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      })
      .catch((err) => setError(getErrorMessage(err, 'Could not load courses.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return courses.filter((course) => {
      if (status !== 'all' && course.status !== status) return false;
      if (!term) return true;
      return `${course.title} ${course.category}`.toLowerCase().includes(term);
    });
  }, [courses, search, status]);

  const togglePublish = async (course) => {
    const next = course.status === 'published' ? 'draft' : 'published';
    setBusyId(course.id);
    try {
      await api.put(`/courses/${course.id}`, { status: next });
      setCourses((current) => current.map((item) => (item.id === course.id ? { ...item, status: next } : item)));
      toast.success(next === 'published' ? 'Course published.' : 'Course moved back to draft.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the course status.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (course) => {
    if (!window.confirm(`Delete "${course.title}"? Lessons, labs and enrollments will be removed.`)) return;
    setBusyId(course.id);
    try {
      await api.delete(`/courses/${course.id}`);
      setCourses((current) => current.filter((item) => item.id !== course.id));
      toast.success('Course deleted.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the course.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {user?.role === 'admin' ? 'All courses' : 'Assigned courses'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {user?.role === 'admin'
              ? 'Create, publish and maintain every course on the platform.'
              : 'Manage curriculum, lessons and hands-on lab exercises for courses assigned to you by the administrator.'}
          </p>
        </div>
        {user?.role === 'admin' && (
          <Button as={Link} to="/instructor/courses/new" size="sm">
            <IconPlus size={14} /> New course
          </Button>
        )}
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or category…"
            className="input pl-9"
            aria-label="Search courses"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={`chip capitalize ${status === item ? 'chip-active' : ''}`}
            >
              {item}
            </button>
          ))}
        </div>
      </Card>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconBookOpen}
          title={
            courses.length === 0
              ? user?.role === 'admin'
                ? 'No courses yet'
                : 'No assigned courses'
              : 'No courses match those filters'
          }
          message={
            courses.length === 0
              ? user?.role === 'admin'
                ? 'Create your first course and start adding modules, lessons and labs.'
                : 'You have not been assigned any courses yet. Once an administrator assigns courses to your account, you will see them here.'
              : 'Try a different status or search term.'
          }
          action={
            user?.role === 'admin' && (
              <Button as={Link} to="/instructor/courses/new" size="sm">
                <IconPlus size={13} /> New course
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((course) => (
            <Card key={course.id} className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-night-950">
                  {course.cover_image ? (
                    <img src={course.cover_image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <IconLayers size={22} className="text-slate-600" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/instructor/courses/${course.id}`} className="font-display text-base font-semibold text-white hover:text-brand-200">
                      {course.title}
                    </Link>
                    <Badge tone={statusTone[course.status]}>{course.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-400">{course.summary || 'No summary yet.'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span>{DIFFICULTIES[course.level]?.label || course.level}</span>
                    <span>·</span>
                    <span>{course.category}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <IconBookOpen size={11} /> {course.lesson_count ?? 0} lessons
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <IconUsers size={11} /> {course.enrolled_count ?? 0} learners
                    </span>
                    {course.instructor_name && (
                      <>
                        <span>·</span>
                        <span className="text-accent-300 font-medium">Instructor: {course.instructor_name}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button as={Link} to={`/courses/${course.slug}`} size="sm" variant="ghost">
                    <IconEye size={13} /> View
                  </Button>
                  <Button as={Link} to={`/instructor/courses/${course.id}`} size="sm" variant="secondary">
                    <IconEdit size={13} /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={course.status === 'published' ? 'ghost' : 'primary'}
                    loading={busyId === course.id}
                    onClick={() => togglePublish(course)}
                  >
                    {course.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(course)} aria-label="Delete course">
                    <IconTrash size={14} className="text-slate-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => navigate('/instructor/labs')}>
          Manage practical labs
        </Button>
      </div>
    </div>
  );
}
