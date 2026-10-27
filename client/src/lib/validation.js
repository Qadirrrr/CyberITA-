export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function passwordError(value, { required = true, label = 'Password' } = {}) {
  const password = String(value ?? '');
  if (!password) return required ? `${label} is required.` : '';
  if (password.length < PASSWORD_MIN_LENGTH) return `${label} must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `${label} must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password)) return `${label} must contain a letter.`;
  if (!/[0-9]/.test(password)) return `${label} must contain a number.`;
  return '';
}

export function emailError(value) {
  const email = String(value ?? '').trim();
  if (!email) return 'Email is required.';
  if (email.length > 255 || !EMAIL_RE.test(email)) return 'Enter a valid email address.';
  return '';
}

export function nameError(value, { label = 'Name', min = 2, max = 120 } = {}) {
  const name = String(value ?? '').trim();
  if (!name) return `${label} is required.`;
  if (name.length < min) return `${label} must be at least ${min} characters.`;
  if (name.length > max) return `${label} must be at most ${max} characters.`;
  return '';
}

export function httpUrlError(value, { required = false, label = 'URL' } = {}) {
  const url = String(value ?? '').trim();
  if (!url) return required ? `${label} is required.` : '';
  if (url.length > 500) return `${label} is too long.`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `${label} must start with http:// or https://.`;
    }
  } catch {
    return `Enter a valid ${label.toLowerCase()}.`;
  }
  return '';
}

export function validateLoginForm({ email, password }) {
  const errors = {};
  const nextEmail = emailError(email);
  if (nextEmail) errors.email = nextEmail;
  if (!String(password ?? '')) errors.password = 'Password is required.';
  return errors;
}

export function validateRegisterForm({ fullName, email, password, confirm, accepted }) {
  const errors = {};
  const nextName = nameError(fullName, { label: 'Name' });
  if (nextName) errors.fullName = nextName;
  const nextEmail = emailError(email);
  if (nextEmail) errors.email = nextEmail;
  const nextPassword = passwordError(password);
  if (nextPassword) errors.password = nextPassword;
  if (password !== confirm) errors.confirm = 'Passwords do not match.';
  if (!accepted) errors.accepted = 'Please accept the terms to create your account.';
  return errors;
}

export function validateContactForm({ name, email, subject, message }) {
  const errors = {};
  const nextName = nameError(name, { label: 'Name' });
  if (nextName) errors.name = nextName;
  const nextEmail = emailError(email);
  if (nextEmail) errors.email = nextEmail;
  const topic = String(subject ?? '').trim();
  if (!topic) errors.subject = 'Select a topic.';
  else if (topic.length < 3) errors.subject = 'Select a valid topic.';
  const body = String(message ?? '').trim();
  if (!body) errors.message = 'Message is required.';
  else if (body.length < 10) errors.message = 'Message must be at least 10 characters.';
  else if (body.length > 5000) errors.message = 'Message must be at most 5000 characters.';
  return errors;
}

export function validateProfileForm({ fullName, headline, bio, avatarUrl }) {
  const errors = {};
  const nextName = nameError(fullName, { label: 'Name' });
  if (nextName) errors.fullName = nextName;
  if (String(headline ?? '').length > 160) errors.headline = 'Headline must be at most 160 characters.';
  if (String(bio ?? '').length > 2000) errors.bio = 'Bio must be at most 2000 characters.';
  const nextAvatar = httpUrlError(avatarUrl, { label: 'Avatar URL' });
  if (nextAvatar) errors.avatarUrl = nextAvatar;
  return errors;
}

export function validateChangePassword({ currentPassword, newPassword, confirm }) {
  const errors = {};
  if (!String(currentPassword ?? '')) errors.currentPassword = 'Enter your current password.';
  const nextPassword = passwordError(newPassword, { label: 'New password' });
  if (nextPassword) errors.newPassword = nextPassword;
  else if (currentPassword && newPassword === currentPassword) {
    errors.newPassword = 'New password must be different from your current password.';
  }
  if (newPassword !== confirm) errors.confirm = 'Passwords do not match.';
  return errors;
}

export function validateBroadcastForm({ title, body, link }) {
  const errors = {};
  const heading = String(title ?? '').trim();
  if (!heading) errors.title = 'Title is required.';
  else if (heading.length < 3) errors.title = 'Title must be at least 3 characters.';
  const message = String(body ?? '').trim();
  if (message.length > 2000) errors.body = 'Message must be at most 2000 characters.';
  const nextLink = httpUrlError(link, { label: 'Link' });
  if (link && String(link).trim().startsWith('/')) {
    if (String(link).trim().length > 300) errors.link = 'Link is too long.';
  } else if (nextLink) {
    errors.link = nextLink;
  }
  return errors;
}
