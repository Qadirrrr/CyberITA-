import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Checkbox, Input } from '../../components/ui';
import { dashboardPath, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage, getFieldErrors } from '../../lib/api';
import { validateLoginForm } from '../../lib/validation';
import { IconArrowRight, IconEye, IconEyeOff, IconMail } from '../../components/icons';

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const registered = Boolean(location.state?.registered);
  const verificationSent = Boolean(location.state?.verificationSent);
  const devVerificationLink = location.state?.devVerificationLink || '';
  const passwordReset = Boolean(location.state?.passwordReset);
  const [form, setForm] = useState({ email: location.state?.email || '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [emailUnverified, setEmailUnverified] = useState(false);

  const from = location.state?.from;

  const onSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateLoginForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLoading(true);
    setError('');
    setEmailUnverified(false);
    try {
      const account = await login({ ...form, remember });
      toast.success(`Welcome back, ${account.full_name.split(' ')[0]}.`);
      navigate(from || dashboardPath(account.role), { replace: true });
    } catch (err) {
      setErrors(getFieldErrors(err));
      const message = getErrorMessage(err, 'Unable to sign in. Check your details and try again.');
      // Detect the email-not-verified case so we can show a targeted banner.
      if (message.toLowerCase().includes('verify your email')) {
        setEmailUnverified(true);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your labs, courses and reports."
      footer={
        <>
          New to CyberITA+?{' '}
          <Link to="/register" className="font-medium text-brand-300 hover:text-brand-200">
            Create a free account
          </Link>
        </>
      }
    >
      {passwordReset && (
        <Alert tone="success" title="Password updated" className="mb-5">
          Your password has been changed. Sign in with the new one.
        </Alert>
      )}

      {registered && (
        <Alert tone={verificationSent ? 'info' : 'success'} title="Account created" className="mb-5">
          Your account is ready.{' '}
          {verificationSent ? (
            <>
              We emailed you a verification link. Open it to verify your address.
            </>
          ) : (
            <>Sign in to continue.</>
          )}
        </Alert>
      )}

      {registered && devVerificationLink && (
        <Alert tone="info" title="Development mode" className="mb-5">
          SMTP is not configured, so the verification link is shown here instead of being emailed:{' '}
          <a href={devVerificationLink} className="break-all font-medium text-brand-300 underline">
            {devVerificationLink}
          </a>
        </Alert>
      )}

      {!registered && !passwordReset && location.state?.email && (
        <Alert tone="info" title="Email not verified yet" className="mb-5">
          Your email address has not been verified. Sign in and use the “Resend verification” button in the banner, or{' '}
          <Link to={`/verify-email?email=${encodeURIComponent(location.state.email)}`} className="font-medium text-brand-300 underline">
            request a new verification email
          </Link>
          .
        </Alert>
      )}

      {error && !emailUnverified && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}

      {emailUnverified && (
        <Alert tone="warning" title="Email not verified" className="mb-5">
          Please verify your email before signing in.{' '}
          We just re-sent a verification link to <strong>{form.email}</strong>. Check your inbox
          (and spam folder). Or{' '}
          <Link
            to={`/verify-email?email=${encodeURIComponent(form.email)}`}
            className="font-medium text-brand-300 underline"
          >
            click here to resend
          </Link>
          .
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="relative">
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            error={errors.email}
            placeholder="Enter your email"
            className="pr-10"
          />
          <IconMail size={16} className="pointer-events-none absolute right-3.5 top-[38px] text-slate-500" />
        </div>
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            error={errors.password}
            placeholder="Enter your password"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-[34px] rounded p-1 text-slate-500 transition hover:text-slate-300"
          >
            {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <Checkbox label="Keep me signed in" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <Link to="/forgot-password" className="text-xs text-slate-500 underline-offset-4 hover:text-brand-300 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Sign in <IconArrowRight size={17} />
        </Button>
      </form>
    </AuthShell>
  );
}
