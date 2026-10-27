import { useState } from 'react';
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
  IconHeadphones,
  IconMail,
  IconTerminal,
} from '../../components/icons';

const topics = [
  'Account & access',
  'Course content',
  'Lab environment',
  'Quiz or assignment issue',
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
      'First open the lab again and use the practice mode if it is available. If the container still fails, send us a support request with the lab name, time and any error text you saw.',
  },
  {
    question: 'Can I resubmit an assignment?',
    answer:
      'Yes. You can revise and resubmit until your instructor grades the assignment. A resubmission resets the previous grade while the new version is reviewed.',
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
            Get help with your account, labs, quizzes, assignments or certificates. We usually reply within one working day.
          </p>
        </div>
        <Badge tone="emerald">
          <IconCheckCircle size={12} /> Student support online
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          to="/student/chat"
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-night-850/70 p-4 transition hover:border-brand-400/30"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300">
            <IconChatBubble size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-100">Chat with an instructor</span>
            <span className="block text-[11px] text-slate-500">Ask a course-specific question</span>
          </span>
          <IconArrowRight size={15} className="text-slate-600 group-hover:text-brand-300" />
        </Link>
        <Link
          to="/student/courses"
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-night-850/70 p-4 transition hover:border-brand-400/30"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-400/10 text-accent-300">
            <IconBookOpen size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-100">Course help</span>
            <span className="block text-[11px] text-slate-500">Review lessons and resources</span>
          </span>
          <IconArrowRight size={15} className="text-slate-600 group-hover:text-brand-300" />
        </Link>
        <Link
          to="/student/labs"
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-night-850/70 p-4 transition hover:border-brand-400/30"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
            <IconTerminal size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-100">Lab troubleshooting</span>
            <span className="block text-[11px] text-slate-500">Restart or reset a lab session</span>
          </span>
          <IconArrowRight size={15} className="text-slate-600 group-hover:text-brand-300" />
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
                placeholder="Full name"
              />
              <Input
                label="Email address"
                type="email"
                value={form.email}
                onChange={update('email')}
                error={errors.email}
                autoComplete="email"
                placeholder="you@example.com"
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
              placeholder="Describe the issue, include the course or lab name, and tell us what you already tried…"
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
    </div>
  );
}
