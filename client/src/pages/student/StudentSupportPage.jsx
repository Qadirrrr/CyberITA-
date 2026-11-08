import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, Card, Input, Select, Textarea } from '../../components/ui';
import {
  IconArrowRight,
  IconBookOpen,
  IconChatBubble,
  IconCheckCircle,
  IconClock,
  IconFlag,
  IconHeadphones,
  IconMail,
  IconShield,
  IconTerminal,
} from '../../components/icons';
import {
  MODERATION_REPORT_KIND,
  MODERATION_SEVERITY,
  reportKindMeta,
  reportStatusMeta,
  severityMeta,
} from '../../lib/moderation';
import { formatDateTime } from '../../lib/format';

const topics = [
  'Account & access',
  'Course content',
  'Lab environment',
  'Lab assignment issue',
  'Certificate problem',
  'Technical bug',
  'Billing & enrollment',
  'Other',
];

const faqs = [
  {
    question: 'How do I contact my instructor?',
    answer:
      'Open Chat from the student sidebar. Pick the instructor attached to your course, write your question and attach a screenshot, PDF or document if it helps explain the issue.',
  },
  {
    question: 'My lab terminal will not start. What should I do?',
    answer:
      'Labs run in a real Docker container on the server. If the terminal will not start, send us a support request with the lab name, time and any error text you saw — the administrator can check the Docker engine.',
  },
  {
    question: 'Can I resubmit a lab assignment?',
    answer:
      'Yes. If your instructor requests changes, complete the lab again and resubmit the updated evidence for review.',
  },
  {
    question: 'Where is my certificate?',
    answer:
      'Certificates are issued automatically when every lesson in a course is completed. Open Certificates in the sidebar to copy the verification link or serial.',
  },
  {
    question: 'I forgot my password.',
    answer:
      'If you are still signed in, change it from Settings → Change password. If you are locked out, send a support request from this page using the email address on your account.',
  },
];

export default function StudentSupportPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    name: user?.full_name || '',
    email: user?.email || '',
    subject: topics[0],
    message: '',
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // ---------- moderation complaint channel ----------
  const [courses, setCourses] = useState([]);
  const [complaint, setComplaint] = useState({
    courseId: '',
    kind: 'complaint',
    severity: 'normal',
    title: '',
    body: '',
  });
  const [complaintErrors, setComplaintErrors] = useState({});
  const [complaintSending, setComplaintSending] = useState(false);
  const [complaintSent, setComplaintSent] = useState(false);
  const [myReports, setMyReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get('/my-courses')
      .then(({ data }) => {
        if (active) setCourses(data.enrollments || []);
      })
      .catch(() => {
        /* course list is optional for a general complaint */
      });
    return () => {
      active = false;
    };
  }, []);

  const loadMyReports = () => {
    setReportsLoading(true);
    api
      .get('/moderation/my-reports')
      .then(({ data }) => setMyReports(data.reports || []))
      .catch(() => setMyReports([]))
      .finally(() => setReportsLoading(false));
  };

  useEffect(() => {
    loadMyReports();
  }, []);

  const updateComplaint = (field) => (event) =>
    setComplaint((current) => ({ ...current, [field]: event.target.value }));

  const submitComplaint = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (complaint.title.trim().length < 3) nextErrors.title = 'Give the complaint a short title.';
    if (complaint.body.trim().length < 10) nextErrors.body = 'Describe the issue in at least 10 characters.';
    setComplaintErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setComplaintSending(true);
    try {
      await api.post('/moderation/reports', {
        title: complaint.title.trim(),
        body: complaint.body.trim(),
        kind: complaint.kind,
        severity: complaint.severity,
        courseId: complaint.courseId ? Number(complaint.courseId) : undefined,
      });
      setComplaintSent(true);
      setComplaint((current) => ({ ...current, title: '', body: '' }));
      toast.success('Complaint submitted. Your subject moderator has been notified.');
      loadMyReports();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit the complaint.'));
    } finally {
      setComplaintSending(false);
    }
  };

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (!form.subject) nextErrors.subject = 'Choose a topic.';
    if (form.message.trim().length < 10) nextErrors.message = 'Please describe your issue in at least 10 characters.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSending(true);
    setError('');
    try {
      await api.post('/contact', {
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject,
        message: form.message.trim(),
      });
      setSent(true);
      setForm((current) => ({ ...current, message: '' }));
      toast.success('Support request sent. Our team will reply by email.');
    } catch (err) {
      const message = getErrorMessage(err, 'Could not send your support request.');
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Support centre</h1>
          <p className="mt-1 text-sm text-slate-400">
            Get help with your account, labs, lab assignments, reports or certificates. We usually reply within one working day.
          </p>
        </div>
        <Badge tone="emerald">
          <IconCheckCircle size={12} /> Student support online
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          to="/student/chat"
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500/40 hover:shadow-md dark:border-white/10 dark:bg-night-850/70 dark:hover:border-brand-400/30"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300">
            <IconChatBubble size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Chat with an instructor</span>
            <span className="block text-[11px] text-slate-500">Ask a course-specific question</span>
          </span>
          <IconArrowRight size={15} className="text-slate-400 group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-300" />
        </Link>
        <Link
          to="/student/courses"
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-accent-500/40 hover:shadow-md dark:border-white/10 dark:bg-night-850/70 dark:hover:border-brand-400/30"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-accent-400/10 dark:text-accent-300">
            <IconBookOpen size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Course help</span>
            <span className="block text-[11px] text-slate-500">Review lessons and resources</span>
          </span>
          <IconArrowRight size={15} className="text-slate-400 group-hover:text-purple-600 dark:text-slate-600 dark:group-hover:text-brand-300" />
        </Link>
        <Link
          to="/student/labs"
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-500/40 hover:shadow-md dark:border-white/10 dark:bg-night-850/70 dark:hover:border-brand-400/30"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
            <IconTerminal size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Lab troubleshooting</span>
            <span className="block text-[11px] text-slate-500">Restart or reset a lab session</span>
          </span>
          <IconArrowRight size={15} className="text-slate-400 group-hover:text-amber-600 dark:text-slate-600 dark:group-hover:text-brand-300" />
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <IconHeadphones size={18} className="text-brand-300" />
            <h2 className="font-display text-lg font-semibold">Send a support request</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Include the course or lab name and what you expected to happen. Screenshots can be shared from Chat.
          </p>

          {sent && (
            <Alert tone="success" title="Request received" className="mt-4">
              Your message has been logged. We will reply to {form.email} with next steps.
            </Alert>
          )}
          {error && <Alert tone="error" className="mt-4">{error}</Alert>}

          <form onSubmit={submit} noValidate className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Your name"
                value={form.name}
                onChange={update('name')}
                error={errors.name}
                autoComplete="name"
                placeholder="Enter your name"
              />
              <Input
                label="Email address"
                type="email"
                value={form.email}
                onChange={update('email')}
                error={errors.email}
                autoComplete="email"
                placeholder="Enter your email"
              />
            </div>
            <Select label="Topic" value={form.subject} onChange={update('subject')} error={errors.subject}>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </Select>
            <Textarea
              label="How can we help?"
              rows={6}
              value={form.message}
              onChange={update('message')}
              error={errors.message}
              placeholder="Describe your issue"
              maxLength={5000}
              hint={`${form.message.length}/5000 characters`}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <IconClock size={11} /> Typical reply time: under 24 hours
              </p>
              <Button type="submit" loading={sending}>
                <IconMail size={15} /> Send request
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">Quick answers</h2>
          <p className="mt-1 text-xs text-slate-500">Common questions from students.</p>
          <div className="mt-4 divide-y divide-white/5">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-200 marker:hidden">
                  {faq.question}
                  <span className="text-slate-500 transition group-open:rotate-45">
                    <span className="block text-lg leading-none">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-xs leading-6 text-slate-400">{faq.answer}</p>
              </details>
            ))}
          </div>
        </Card>
      </div>

      {/* ---------- moderation complaint channel ---------- */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <IconShield size={18} className="text-brand-300" />
            <h2 className="font-display text-lg font-semibold">Raise a complaint to a moderator</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Complaints go to the Subject/Course Moderator responsible for the course. If none is assigned,
            the admin team receives it. You can track the status below.
          </p>

          {complaintSent && (
            <Alert tone="success" title="Complaint received" className="mt-4">
              Your moderator has been notified. You will see status updates in “My moderation reports”.
            </Alert>
          )}

          <form onSubmit={submitComplaint} noValidate className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Course" value={complaint.courseId} onChange={updateComplaint('courseId')}>
                <option value="">General / not course-specific</option>
                {courses.map((enrollment) => (
                  <option key={enrollment.id} value={enrollment.course_id}>
                    {enrollment.title}
                  </option>
                ))}
              </Select>
              <Select label="Type" value={complaint.kind} onChange={updateComplaint('kind')}>
                {Object.entries(MODERATION_REPORT_KIND)
                  .filter(([key]) => key === 'complaint' || key === 'content_quality')
                  .map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label}
                    </option>
                  ))}
              </Select>
              <Select label="Severity" value={complaint.severity} onChange={updateComplaint('severity')}>
                {Object.entries(MODERATION_SEVERITY).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Title"
                value={complaint.title}
                onChange={updateComplaint('title')}
                error={complaintErrors.title}
                placeholder="Enter issue title"
              />
            </div>
            <Textarea
              label="What happened?"
              rows={5}
              value={complaint.body}
              onChange={updateComplaint('body')}
              error={complaintErrors.body}
              placeholder="Describe what happened"
              maxLength={10000}
              hint={`${complaint.body.length}/10000 characters`}
            />
            <div className="flex justify-end">
              <Button type="submit" loading={complaintSending}>
                <IconFlag size={15} /> Submit complaint
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">My moderation reports</h2>
          <p className="mt-1 text-xs text-slate-500">Complaints you raised and their current status.</p>

          {reportsLoading ? (
            <div className="mt-4 space-y-2">
              <div className="h-14 animate-pulse rounded-lg bg-white/5" />
              <div className="h-14 animate-pulse rounded-lg bg-white/5" />
            </div>
          ) : myReports.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-white/10">
              You have not raised any moderation complaints yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/5">
              {myReports.map((report) => (
                <li key={report.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{report.title}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">
                        {report.course_title || 'General'} · {formatDateTime(report.created_at)}
                        {report.moderator_name ? ` · ${report.moderator_name}` : ''}
                      </p>
                    </div>
                    <Badge tone={reportStatusMeta(report.status).tone}>
                      {reportStatusMeta(report.status).label}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={reportKindMeta(report.kind).tone}>{reportKindMeta(report.kind).label}</Badge>
                    <Badge tone={severityMeta(report.severity).tone}>{severityMeta(report.severity).label}</Badge>
                  </div>
                  {report.resolution && (
                    <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-200">
                      {report.resolution}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
