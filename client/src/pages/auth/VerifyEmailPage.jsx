import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Input } from '../../components/ui';
import api, { getErrorMessage } from '../../lib/api';
import { emailError } from '../../lib/validation';
import { IconArrowRight, IconCheckCircle, IconMail } from '../../components/icons';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';

  const [status, setStatus] = useState(token && emailParam ? 'verifying' : 'manual');
  const [email, setEmail] = useState(emailParam);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [resendState, setResendState] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const ranRef = useRef(false);

  const verify = useCallback(async (rawToken, rawEmail) => {
    setStatus('verifying');
    setError('');
    try {
      await api.post('/auth/verify-email', { token: rawToken, email: rawEmail });
      setStatus('verified');
    } catch (err) {
      setError(getErrorMessage(err, 'Verification failed. Please request a new link.'));
      setStatus('failed');
    }
  }, []);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (token && emailParam) verify(token, emailParam);
  }, [token, emailParam, verify]);

  const resend = async (targetEmail) => {
    const nextError = emailError(targetEmail);
    setFieldError(nextError);
    if (nextError) return;
    setResendLoading(true);
    setResendState('');
    try {
      const { data } = await api.post('/auth/resend-verification', { email: targetEmail.trim() });
      setResendState('sent');
      if (data?.devVerificationLink) {
        window.location.assign(data.devVerificationLink);
      }
    } catch (err) {
      setResendState(getErrorMessage(err, 'Could not resend the email. Please try again.'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirm your address to finish setting up your CyberITA+ account."
      footer={
        <>
          Already verified?{' '}
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Sign in
          </Link>
        </>
      }
    >
      {status === 'verifying' && (
        <Alert tone="info" className="mb-5">
          Verifying your email address…
        </Alert>
      )}

      {status === 'verified' && (
        <Alert tone="success" title="Email verified" className="mb-5">
          Your email address is confirmed. You can sign in now.
        </Alert>
      )}

      {(status === 'failed' || status === 'manual') && (
        <>
          <Alert tone="error" className="mb-5">
            {error || 'This verification link is invalid or has expired. Request a new one below.'}
          </Alert>

          <div className="space-y-4">
            <div className="relative">
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldError('');
                }}
                error={fieldError}
                placeholder="Enter your email"
                className="pr-10"
              />
              <IconMail size={16} className="pointer-events-none absolute right-3.5 top-[38px] text-slate-500" />
            </div>
            <Button type="button" loading={resendLoading} onClick={() => resend(email)} size="lg" className="w-full">
              Resend verification email
            </Button>
            {resendState === 'sent' && (
              <Alert tone="success">
                If an account exists for that address, a new verification email is on its way.
              </Alert>
            )}
            {resendState && resendState !== 'sent' && <Alert tone="error">{resendState}</Alert>}
          </div>
        </>
      )}

      {status === 'verified' && (
        <Button as={Link} to="/login" size="lg" className="w-full">
          <IconCheckCircle size={17} /> Continue to sign in <IconArrowRight size={17} />
        </Button>
      )}
    </AuthShell>
  );
}
