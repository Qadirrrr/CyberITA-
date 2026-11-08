import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage, getFieldErrors } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar, Badge, Button, Card, Input, Textarea } from '../../components/ui';
import { IconLock, IconLogOut, IconSave, IconUser } from '../../components/icons';
import { ROLES } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/format';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateChangePassword, validateProfileForm } from '../../lib/validation';

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: user?.full_name || '',
    headline: user?.headline || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatar_url || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [changing, setChanging] = useState(false);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextErrors = validateProfileForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const { data } = await api.put('/users/me', {
        fullName: form.fullName.trim(),
        headline: form.headline.trim() || null,
        bio: form.bio.trim() || null,
        avatarUrl: form.avatarUrl.trim() || null,
      });
      setUser((current) => ({ ...current, ...data.user }));
      toast.success('Profile updated.');
    } catch (err) {
      setErrors(getFieldErrors(err));
      toast.error(getErrorMessage(err, 'Could not update your profile.'));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    const nextErrors = validateChangePassword(passwords);
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setChanging(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      toast.success('Password changed. Please sign in again.');
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setPasswordErrors(getFieldErrors(err));
      toast.error(getErrorMessage(err, 'Could not change your password.'));
    } finally {
      setChanging(false);
    }
  };

  const previewName = form.fullName || user?.full_name || '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Profile & settings</h1>
        <p className="mt-1 text-sm text-slate-400">Keep your public learner profile up to date and secure your account.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <IconUser size={17} className="text-brand-300" /> Public profile
          </h2>
          <p className="mt-1 text-xs text-slate-500">Your name, headline and bio appear on published lab reports and the community blog.</p>

          <form onSubmit={saveProfile} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="fullName" className="label">
                Full name
              </label>
              <Input id="fullName" value={form.fullName} onChange={update('fullName')} className="mt-1.5" error={errors.fullName} />
            </div>
            <div>
              <label htmlFor="headline" className="label">
                Headline
              </label>
              <Input
                id="headline"
                value={form.headline}
                onChange={update('headline')}
                className="mt-1.5"
                placeholder="Enter your headline"
                error={errors.headline}
                maxLength={160}
              />
              <p className="mt-1 text-[10px] text-slate-600">{form.headline.length}/160</p>
            </div>
            <div>
              <label htmlFor="bio" className="label">
                Bio
              </label>
              <Textarea
                id="bio"
                rows={4}
                value={form.bio}
                onChange={update('bio')}
                className="mt-1.5"
                placeholder="Enter your bio"
                error={errors.bio}
                maxLength={2000}
              />
            </div>
            <div>
              <label htmlFor="avatarUrl" className="label">
                Avatar image URL
              </label>
              <Input
                id="avatarUrl"
                value={form.avatarUrl}
                onChange={update('avatarUrl')}
                className="mt-1.5"
                placeholder="Enter image URL"
                error={errors.avatarUrl}
              />
              <p className="mt-1 text-[10px] text-slate-600">Must be a public https image URL.</p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                <IconSave size={14} /> Save changes
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar src={form.avatarUrl || user?.avatar_url} name={previewName} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold">{previewName || 'Your name'}</p>
                <p className="truncate text-xs text-slate-500">{form.headline || 'Add a headline'}</p>
                <Badge tone="brand" className="mt-1.5">
                  {ROLES[user?.role] || user?.role}
                </Badge>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Email</dt>
                <dd className="truncate text-slate-300">{user?.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Member since</dt>
                <dd className="text-slate-300">{user?.created_at ? formatDate(user.created_at) : 'N/A'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Last sign-in</dt>
                <dd className="text-slate-300">{user?.last_login_at ? formatDateTime(user.last_login_at) : 'N/A'}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <IconLock size={15} className="text-amber-300" /> Change password
            </h2>
            <form onSubmit={changePassword} noValidate className="mt-4 space-y-3">
              <div>
                <label htmlFor="currentPassword" className="label">
                  Current password
                </label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))}
                  className="mt-1.5"
                  error={passwordErrors.currentPassword}
                />
              </div>
              <div>
                <label htmlFor="newPassword" className="label">
                  New password
                </label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.newPassword}
                  onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))}
                  className="mt-1.5"
                  error={passwordErrors.newPassword}
                  hint="At least 8 characters, with a letter and a number."
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="label">
                  Confirm new password
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))}
                  className="mt-1.5"
                  error={passwordErrors.confirm}
                />
              </div>
              <p className="text-[10px] leading-4 text-slate-500">All other sessions will be signed out after the change.</p>
              <Button type="submit" variant="secondary" loading={changing} className="w-full">
                Update password
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <IconLogOut size={15} className="text-slate-400" /> Session
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Sign out of this browser. Your progress is saved automatically.</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              Sign out
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
