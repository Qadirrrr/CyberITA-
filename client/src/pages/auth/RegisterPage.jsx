import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Checkbox, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage, getFieldErrors } from '../../lib/api';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateRegisterForm } from '../../lib/validation';
import { IconArrowRight, IconEye, IconEyeOff, IconMail, IconUser } from '../../components/icons';
export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError('');
    const nextErrors = validateRegisterForm({ ...form, accepted });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.accepted) setError(nextErrors.accepted);
      return;
    }
    setLoading(true);
    try {
      const data = await register({ fullName: form.fullName, email: form.email, password: form.password });
      toast.success('Account created! Check your inbox to verify your email before signing in.');
      navigate('/login', {
        replace: true,
        state: {
          registered: true,
          email: form.email,
          verificationSent: Boolean(data?.emailVerificationSent),
          devVerificationLink: data?.devVerificationLink || '',
        },
      });
    } catch (err) {
      setErrors(getFieldErrors(err));
      setError(getErrorMessage(err, 'Unable to create your account.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      compact
      wide
      title="Create your account"
      subtitle="Start with guided labs and verified progress."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Sign in
          </Link>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-2.5 sm:space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Input
              label="Full name"
              required
              showRequired={submitted && !form.fullName.trim()}
              autoComplete="name"
              value={form.fullName}
              onChange={update('fullName')}
              error={errors.fullName}
              placeholder="Enter your name"
              className="pr-10"
            />
            <IconUser size={16} className="pointer-events-none absolute right-3.5 top-[38px] text-slate-500" />
          </div>
          <div className="relative">
            <Input
              label="Email address"
              type="email"
              required
              showRequired={submitted && !form.email.trim()}
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
              placeholder="Enter your email"
              className="pr-10"
            />
            <IconMail size={16} className="pointer-events-none absolute right-3.5 top-[38px] text-slate-500" />
          </div>
        </div>
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            showRequired={submitted && !form.password}
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
            hint="At least 8 characters, with a letter and a number."
            placeholder="Enter your password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
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
        <Input
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          required
          showRequired={submitted && !form.confirm}
          autoComplete="new-password"
          value={form.confirm}
          onChange={update('confirm')}
          error={errors.confirm}
          placeholder="Confirm your password"
        />
        <div>
          <Checkbox
            label="I agree to the Terms of Service and lab activity recording."
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="text-xs leading-5"
          />
          {errors.accepted && <p className="mt-1.5 text-xs text-rose-400">{errors.accepted}</p>}
        </div>
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Create account <IconArrowRight size={17} />
        </Button>
      </form>
    </AuthShell>
  );
}
