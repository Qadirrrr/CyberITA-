import { useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Card, Input, Select, Textarea } from '../../components/ui';
import { IconBell, IconSend, IconUsers } from '../../components/icons';
import { validateBroadcastForm } from '../../lib/validation';

const audience = [
  { value: 'all', label: 'Everyone' },
  { value: 'student', label: 'Students only' },
  { value: 'instructor', label: 'Instructors only' },
  { value: 'admin', label: 'Admins only' },
];

export default function BroadcastPage() {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', body: '', link: '', role: 'all' });
  const [sending, setSending] = useState(false);
  const [delivered, setDelivered] = useState(null);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = validateBroadcastForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSending(true);
    setDelivered(null);
    setError('');
    try {
      const { data } = await api.post('/notifications/broadcast', {
        title: form.title,
        body: form.body,
        link: form.link.trim() || null,
        role: form.role,
      });
      setDelivered(data.delivered);
      toast.success(`Announcement delivered to ${data.delivered} user${data.delivered === 1 ? '' : 's'}.`);
      setForm({ title: '', body: '', link: '', role: form.role });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send the announcement.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Broadcast announcement</h1>
        <p className="mt-1 text-sm text-slate-400">Send an in-app notification to a whole role, or everyone on the platform.</p>
      </div>

      {error && <Alert tone="error" title="Delivery failed">{error}</Alert>}
      {delivered != null && (
        <Alert tone="success" title="Announcement sent">
          Delivered to {delivered} active user{delivered === 1 ? '' : 's'}. It appears instantly in their notification bell.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-6">
          <form onSubmit={submit} noValidate className="space-y-4">
            <Input
              label="Title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Enter broadcast title"
              required
              maxLength={200}
              error={errors.title}
            />
            <Textarea
              label="Message"
              rows={6}
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="Enter broadcast message"
              maxLength={2000}
              hint={`${form.body.length}/2000 characters`}
              error={errors.body}
            />
            <Input
              label="Link (optional)"
              value={form.link}
              onChange={(event) => setForm((current) => ({ ...current, link: event.target.value }))}
              placeholder="Enter link"
              hint="An in-app path like /student/labs or a full URL."
              maxLength={300}
              error={errors.link}
            />
            <Select label="Audience" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
              {audience.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                <IconUsers size={11} className="mr-1 inline" />
                Only active accounts receive announcements.
              </p>
              <Button type="submit" loading={sending}>
                <IconSend size={14} /> Send announcement
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
              <IconBell size={12} /> Notification preview
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-night-950/60 p-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                  <IconBell size={13} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{form.title || 'Your announcement title'}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">
                    {form.body || 'The message body appears here. Keep it concise so learners can act on it quickly.'}
                  </p>
                  <p className="mt-1.5 text-[10px] text-brand-300">{form.link || 'No link attached'}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">just now</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Guidelines</h2>
            <ul className="mt-2 space-y-2 text-[11px] leading-5 text-slate-400">
              <li>• Use announcements for platform news, new labs or maintenance windows.</li>
              <li>• Avoid duplicating course-specific updates. Post those from the course tools.</li>
              <li>• Include a link so recipients land on the relevant page.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
