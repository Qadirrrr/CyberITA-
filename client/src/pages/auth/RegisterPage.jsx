import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Checkbox, Input } from '../../components/ui';
import { dashboardPath, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage, getFieldErrors } from '../../lib/api';
import { IconArrowRight, IconEye, IconEyeOff, IconMail, IconUser } from '../../components/icons';

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setErrors({});
    if (form.password !== form.confirm) {
      setErrors({ confirm: 'Passwords do not match.' });
      return;
    }
    if (!accepted) {
      setError('Please accept the terms to create your account.');
      return;
    }
    setLoading(true);
    try {
      const account = await register({ fullName: form.fullName, email: form.email, password: form.password });
      toast.success('Account created — your workspace is ready.');
      navigate(dashboardPath(account.role), { replace: true });
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

      <form onSubmit={onSubmit} className="space-y-2.5 sm:space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Input
              label="Full name"
              required
              autoComplete="name"
              value={form.fullName}
              onChange={update('fullName')}
              error={errors.fullName}
              placeholder="Alex Rivera"
              className="pr-10"
            />
            <IconUser size={16} className="pointer-events-none absolute right-3.5 top-[38px] text-slate-500" />
          </div>
          <div className="relative">
            <Input
              label="Email address"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
              placeholder="you@example.com"
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
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
            hint="8+ characters with a letter and number."
            placeholder="••••••••"
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
          autoComplete="new-password"
          value={form.confirm}
          onChange={update('confirm')}
          error={errors.confirm}
          placeholder="••••••••"
        />
        <Checkbox
          label="I agree to the Terms of Service and lab activity recording."
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="text-xs leading-5"
        />
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Create account <IconArrowRight size={17} />
        </Button>
      </form>
    </AuthShell>
  );
}
