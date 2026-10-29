import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Input } from '../../components/ui';
import api, { getErrorMessage, getFieldErrors } from '../../lib/api';
import { validateResetPasswordForm } from '../../lib/validation';
import { IconArrowRight, IconEye, IconEyeOff, IconLock } from '../../components/icons';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});

  const setField = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateResetPasswordForm({ ...form, token });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { email, token, password: form.password });
      navigate('/login', { state: { passwordReset: true, email } });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reset the password. Please request a new link.'));
      setErrors(getFieldErrors(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Your new password must be at least 8 characters and include a letter and a number."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Back to sign in
          </Link>
        </>
      }
    >
      {!token || !email ? (
        <Alert tone="error" title="Link incomplete" className="mb-5">
          This reset link is missing its token or email.{' '}
          <Link to="/forgot-password" className="font-medium text-brand-300 underline">
            Request a new link
          </Link>
          .
        </Alert>
      ) : (
        <>
          {error && (
            <Alert tone="error" className="mb-5">
              {error}
            </Alert>
          )}
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="relative">
              <Input
                label="New password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={form.password}
                onChange={setField('password')}
                error={errors.password}
                placeholder="At least 8 characters"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-[38px] text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <IconEyeOff size={17} /> : <IconEye size={17} />}
              </button>
            </div>

            <Input
              label="Confirm new password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={setField('confirm')}
              error={errors.confirm}
              placeholder="Repeat the new password"
            />

            <Button type="submit" loading={loading} size="lg" className="w-full">
              <IconLock size={16} /> Save new password <IconArrowRight size={17} />
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
