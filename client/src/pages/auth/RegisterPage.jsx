import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Checkbox, Input } from '../../components/ui';
import { dashboardPath, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage, getFieldErrors } from '../../lib/api';
import { IconArrowRight, IconEye, IconEyeOff, IconMail } from '../../components/icons';

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
      title="Create your free account"
      subtitle="Start with any course, run your first lab, and keep a verified record of your progress."
      quote={{
        title: 'Your first verified command is minutes away.',
        body: 'No installation, no setup. Open a sandboxed terminal, follow the steps and watch your progress get verified as you work.',
      }}
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

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Full name"
          required
          autoComplete="name"
          value={form.fullName}
          onChange={update('fullName')}
          error={errors.fullName}
          placeholder="Alex Rivera"
        />
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
          />
          <IconMail size={16} className="pointer-events-none absolute right-3.5 top-[38px] text-slate-500" />
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
            hint="At least 8 characters, including a letter and a number."
            placeholder="••••••••"
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
          label="I agree to the terms of service and understand my lab activity is recorded for verification."
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Create account <IconArrowRight size={17} />
        </Button>
        <p className="text-center text-[11px] leading-5 text-slate-600">
          Free to start. No credit card required.
        </p>
      </form>
    </AuthShell>
  );
}
