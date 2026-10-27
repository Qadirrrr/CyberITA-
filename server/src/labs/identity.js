/**
 * Per-student identity for a lab container.
 *
 * Every lab session runs as a unique-looking root account (UID 0) so the
 * learner sees their own name in the shell prompt, `whoami`, `$USER` and the
 * terminal UI, while still having full permission to install packages and
 * change anything inside their disposable container.
 *
 * The name is only used inside the container; it is sanitised so it is always
 * safe to place in /etc/passwd, a hostname and a shell prompt.
 */

const RESERVED = new Set([
  'root',
  'student',
  'daemon',
  'bin',
  'sys',
  'sync',
  'games',
  'man',
  'lp',
  'mail',
  'news',
  'uucp',
  'proxy',
  'www-data',
  'backup',
  'list',
  'irc',
  'nobody',
  'systemd',
  'sshd',
]);

const HOSTNAME = 'cyberita-lab';

function printable(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[:\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {{ id?: number|string, full_name?: string, email?: string }} user
 * @returns {{ studentId: string, displayName: string, shellUser: string, hostname: string, prompt: string }}
 */
export function studentIdentity(user = {}) {
  const id = user?.id != null ? String(user.id) : '';
  const fullName = printable(user?.full_name || user?.fullName || user?.name);
  const displayName = fullName || (id ? `Student ${id}` : 'Student');

  // First ASCII word of the name, e.g. "Saif Khan" -> "saif".
  let slug =
    fullName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')[0] || '';

  slug = slug.replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  if (/^[0-9]/.test(slug)) slug = `u${slug}`;
  if (!slug && user?.email) {
    const emailPrefix = String(user.email).split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    if (emailPrefix) slug = /^[0-9]/.test(emailPrefix) ? `u${emailPrefix}` : emailPrefix;
  }
  if (!slug || RESERVED.has(slug)) slug = id ? `student-${id}` : 'student';

  return {
    studentId: id,
    displayName,
    shellUser: slug,
    hostname: HOSTNAME,
    prompt: `${slug}@${HOSTNAME}`,
  };
}

export default studentIdentity;
