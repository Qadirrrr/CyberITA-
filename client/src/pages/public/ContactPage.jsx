import { useState } from 'react';
import api, { getErrorMessage, getFieldErrors } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Card, Input, Select, Textarea } from '../../components/ui';
import { IconClock, IconMail, IconMessage, IconSend, IconShield, IconTerminal } from '../../components/icons';

const faqs = [
  {
    q: 'Do I need my own Linux environment?',
    a: 'No. Every lab runs in a sandboxed browser terminal. You only need a modern browser — nothing to install.',
  },
  {
    q: 'How are certificates verified?',
    a: 'Each certificate has a unique serial number. Anyone can confirm it on our public verification page.',
  },
  {
    q: 'Can my lab report be published?',
    a: 'Yes. Submit it for instructor review after completing the lab. Approved reports are published under your name.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Creating an account is free, and several courses are free to complete. Paid courses unlock additional labs and reviews.',
  },
];

export default function ContactPage() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setErrors({});
    try {
      await api.post('/contact', form);
      setSent(true);
      setForm({ name: '', email: '', subject: '', message: '' });
      toast.success('Message sent — we typically reply within one business day.');
    } catch (err) {
      setErrors(getFieldErrors(err));
      setError(getErrorMessage(err, 'Could not send your message.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-60" />
        <div className="container-page relative py-12 lg:py-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">Contact</p>
          <h1 className="max-w-2xl text-balance font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Questions about the labs, courses or certificates?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Send a message and a real person will reply. Include the course or lab name if your question is specific —
            it helps us answer faster.
          </p>
        </div>
      </section>

      <section className="container-page py-10 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
          <Card className="p-6 sm:p-8">
            <h2 className="font-display text-xl font-semibold">Send us a message</h2>
            <p className="mt-1 text-sm text-slate-500">We usually respond within one business day.</p>

            {sent && (
              <Alert tone="success" title="Message received" className="mt-5">
                Thanks for reaching out. We'll reply to the email address you provided.
              </Alert>
            )}
            {error && (
              <Alert tone="error" className="mt-5">
                {error}
              </Alert>
            )}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Your name" required value={form.name} onChange={update('name')} error={errors.name} placeholder="Alex Rivera" />
                <Input
                  label="Email address"
                  type="email"
                  required
                  value={form.email}
                  onChange={update('email')}
                  error={errors.email}
                  placeholder="alex@example.com"
                />
              </div>
              <Select label="Topic" value={form.subject} onChange={update('subject')} error={errors.subject} required>
                <option value="">Select a topic…</option>
                <option>Course &amp; learning path guidance</option>
                <option>Lab environment issue</option>
                <option>Certificate verification</option>
                <option>Instructor / partnership enquiry</option>
                <option>Billing or account</option>
                <option>Something else</option>
              </Select>
              <Textarea
                label="Message"
                required
                rows={6}
                value={form.message}
                onChange={update('message')}
                error={errors.message}
                placeholder="Tell us what you need help with…"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] leading-5 text-slate-500">
                  By sending this message you agree to be contacted about your enquiry. We never share your details.
                </p>
                <Button type="submit" loading={submitting}>
                  Send message <IconSend size={16} />
                </Button>
              </div>
            </form>
          </Card>

          <div className="space-y-4">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">Other ways to reach us</h2>
              <ul className="mt-4 space-y-4 text-sm">
                <li className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                    <IconMail size={16} />
                  </span>
                  <div>
                    <p className="font-medium text-white">Email</p>
                    <a href="mailto:hello@cyberita.plus" className="text-slate-400 transition hover:text-brand-300">
                      hello@cyberita.plus
                    </a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                    <IconClock size={16} />
                  </span>
                  <div>
                    <p className="font-medium text-white">Support hours</p>
                    <p className="text-slate-400">Monday–Friday, 09:00–18:00 (UTC+2)</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                    <IconTerminal size={16} />
                  </span>
                  <div>
                    <p className="font-medium text-white">In-product help</p>
                    <p className="text-slate-400">Every lab has hints, and instructors answer in report reviews.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                    <IconShield size={16} />
                  </span>
                  <div>
                    <p className="font-medium text-white">Security concerns</p>
                    <p className="text-slate-400">Report anything suspicious to security@cyberita.plus.</p>
                  </div>
                </li>
              </ul>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <IconMessage size={14} /> Common questions
              </div>
              <div className="mt-3 divide-y divide-white/5">
                {faqs.map((faq) => (
                  <details key={faq.q} className="group py-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-200">
                      {faq.q}
                      <span className="text-slate-500 transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-2 text-xs leading-6 text-slate-400">{faq.a}</p>
                  </details>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
