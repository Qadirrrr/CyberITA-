import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Checkbox, Input } from '../../components/ui';
import { dashboardPath, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../lib/api';
import { IconArrowRight, IconEye, IconEyeOff, IconLock, IconMail } from '../../components/icons';

const demoAccounts = [
  { role: 'Student', email: 'alex.rivera@cyberita.plus' },
  { role: 'Instructor', email: 'sarah.chen@cyberita.plus' },
  { role: 'Admin', email: 'admin@cyberita.plus' },
];

export default function LoginPage() {
  const { login, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from;
  const target = from || (user ? dashboardPath(user.role) : '/student');

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const account = await login(form);
      toast.success(`Welcome back, ${account.full_name.split(' ')[0]}.`);
      navigate(target, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in. Check your details and try again.'));
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
      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative">
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="you@example.com"
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
        <div className="flex items-center justify-between">
          <Checkbox label="Keep me signed in" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <Link to="/contact" className="text-xs text-slate-500 underline-offset-4 hover:text-brand-300 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Sign in <IconArrowRight size={17} />
        </Button>
      </form>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <IconLock size={12} className="text-brand-400" /> Demo access
          </div>
          <span className="text-[10px] text-slate-600">Passw0rd!</span>
        </div>
        <div className="mt-2.5 grid gap-1.5 sm:grid-cols-3">
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => setForm({ email: account.email, password: 'Passw0rd!' })}
              className="group rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-brand-400/30 hover:bg-brand-400/[0.06]"
            >
              <span className="block text-[11px] font-semibold text-slate-200 group-hover:text-brand-200">
                {account.role}
              </span>
              <span className="block truncate text-[10px] text-slate-500">{account.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
