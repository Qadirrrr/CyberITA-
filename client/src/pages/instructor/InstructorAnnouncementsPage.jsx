import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconBell,
  IconSend,
  IconUsers,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';

const LINK_OPTIONS = [
  { value: '', label: 'No link' },
  { value: '/student/lab-assignments', label: 'Lab assignments' },
  { value: '/student/courses', label: 'My courses' },
  { value: '/student/chat', label: 'Chat with instructor' },
  { value: '/student/calendar', label: 'Calendar' },
];

export default function InstructorAnnouncementsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ courseId: '', title: '', body: '', link: '' });

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [announcementsResponse, coursesResponse] = await Promise.all([
        api.get('/instructor/announcements'),
        api.get('/courses', { params: { all: true, limit: 60 } }),
      ]);
      setAnnouncements(announcementsResponse.data.announcements || []);
      const list = coursesResponse.data.courses || [];
      setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load announcements.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const audience = useMemo(() => {
    if (form.courseId) {
      const course = courses.find((item) => String(item.id) === String(form.courseId));
      return course ? `Learners enrolled in ${course.title}` : 'Selected course learners';
    }
    return `Learners across all ${courses.length} of your course${courses.length === 1 ? '' : 's'}`;
  }, [courses, form.courseId]);

  const sendAnnouncement = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Add a title and message before sending.');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post('/instructor/announcements', {
        title: form.title,
        body: form.body,
        courseId: form.courseId ? Number(form.courseId) : null,
        link: form.link || null,
      });
      toast.success(`Announcement delivered to ${data.delivered} learner${data.delivered === 1 ? '' : 's'}.`);
      setForm({ courseId: '', title: '', body: '', link: '' });
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send the announcement.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Announcements</h1>
          <p className="mt-1 text-sm text-slate-400">
            Send a short update to every learner in your courses. It lands in their in-app notifications instantly.
          </p>
        </div>
        <Badge tone="brand">{announcements.length} sent</Badge>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
              <IconSend size={16} />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold">New announcement</h2>
              <p className="text-[11px] text-slate-500">{audience}</p>
            </div>
          </div>

          {courses.length === 0 ? (
            <div className="mt-4">
              <Alert tone="warning" title="No courses yet">
                You need at least one course with enrolled learners before you can send announcements.{' '}
                <Link to="/instructor/courses/new" className="text-brand-300 underline">
                  Create a course
                </Link>
                .
              </Alert>
            </div>
          ) : (
            <form onSubmit={sendAnnouncement} className="mt-4 space-y-4">
              <Select
                label="Audience"
                value={form.courseId}
                onChange={(event) => setForm((current) => ({ ...current, courseId: event.target.value }))}
              >
                <option value="">All my courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
              <Input
                label="Title"
                maxLength={200}
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="e.g. New lab session this Thursday"
                required
              />
              <Textarea
                label="Message"
                rows={6}
                maxLength={5000}
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                placeholder="Share schedule changes, deadlines, or revision guidance…"
                required
              />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Select
                  label="Attach a link (optional)"
                  value={form.link}
                  onChange={(event) => setForm((current) => ({ ...current, link: event.target.value }))}
                  className="min-w-[220px] flex-1"
                >
                  {LINK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" loading={sending}>
                  <IconSend size={14} /> Send announcement
                </Button>
              </div>
              <p className="text-[10px] leading-4 text-slate-600">
                Learners receive this as an in-app notification with your title as the headline. Delivery counts are recorded
                for your records.
              </p>
            </form>
          )}
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="font-display text-base font-semibold">Sent history</h2>
            <p className="text-[11px] text-slate-500">Your last 100 announcements.</p>
          </div>
          {loading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={IconBell}
                title="Nothing sent yet"
                message="Announcements you send will be listed here with delivery counts."
              />
            </div>
          ) : (
            <ul className="max-h-[640px] divide-y divide-white/5 overflow-y-auto">
              {announcements.map((announcement) => (
                <li key={announcement.id} className="px-5 py-3.5">
                  <p className="text-sm font-medium text-slate-100">{announcement.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{announcement.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <IconUsers size={11} /> {announcement.recipient_count} recipients
                    </span>
                    <span>·</span>
                    <span>{announcement.course_title || 'All courses'}</span>
                    <span>·</span>
                    <span>{formatDateTime(announcement.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
