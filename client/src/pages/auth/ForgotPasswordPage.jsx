import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Input } from '../../components/ui';
import api, { getErrorMessage, getFieldErrors } from '../../lib/api';
import { emailError } from '../../lib/validation';
import { IconArrowRight, IconMail } from '../../components/icons';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});

  const onSubmit = async (event) => {
    event.preventDefault();
    const nextEmail = emailError(email);
    setErrors(nextEmail ? { email: nextEmail } : {});
    if (nextEmail) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
      setDevLink(data?.devResetLink || '');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the password reset. Please try again.'));
      setErrors(getFieldErrors(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email you a secure link to choose a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Back to sign in
          </Link>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}

      {sent ? (
        <>
          <Alert tone="success" title="Check your inbox" className="mb-5">
            If an account exists for <span className="font-medium text-slate-200">{email.trim()}</span>, a reset link is
            on its way. It expires in one hour.
          </Alert>
          {devLink && (
            <Alert tone="info" title="Development mode" className="mb-5">
              SMTP is not configured, so the link is shown here instead of being emailed:{' '}
              <a href={devLink} className="break-all font-medium text-brand-300 underline">
                {devLink}
              </a>
            </Alert>
          )}
          <Button as={Link} to="/login" size="lg" className="w-full">
            Back to sign in <IconArrowRight size={17} />
          </Button>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="relative">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
              placeholder="you@example.com"
              className="pr-10"
            />
            <IconMail size={16} className="pointer-events-none absolute right-3.5 top-[38px] text-slate-500" />
          </div>
          <Button type="submit" loading={loading} size="lg" className="w-full">
            Send reset link <IconArrowRight size={17} />
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
