/**
 * Simulated POSIX filesystem used by the mock lab terminal.
 * State is persisted as JSON inside lab_sessions.fs_state.
 */

const dir = (children = {}) => ({ type: 'dir', children });
const file = (content = '', mode = 'rw-r--r--') => ({ type: 'file', content, mode });

export const defaultFs = () => ({
  '/': dir({
    home: dir({
      student: dir({
        'welcome.txt': file('Welcome to your CyberITA+ lab environment.\nComplete the steps in the left panel.\n'),
        notes: dir({}),
        scripts: dir({}),
      }),
    }),
    etc: dir({
      hostname: file('cyberita-lab\n'),
      hosts: file('127.0.0.1 localhost\n::1 localhost\n'),
      'os-release': file('NAME="CyberITA Linux"\nVERSION="1.0 (Mock)"\nID=cyberita\n'),
      passwd: file('root:x:0:0:root:/root:/bin/bash\nstudent:x:1000:1000:Student User:/home/student:/bin/bash\n'),
    }),
    var: dir({ log: dir({ 'syslog': file('Oct 20 09:00:01 cyberita-lab systemd[1]: Started Session.\n') }) }),
    tmp: dir(),
    usr: dir({ bin: dir(), local: dir({ bin: dir() }) }),
    opt: dir(),
    root: dir({}),
  }),
});

export function normalizePath(path, cwd = '/home/student') {
  if (!path || path === '.') return cwd;
  let raw = String(path);
  let base = cwd;
  if (raw.startsWith('~')) {
    raw = `/home/student${raw.slice(1)}`;
  } else if (!raw.startsWith('/')) {
    base = cwd.endsWith('/') ? cwd : `${cwd}/`;
  } else {
    base = '';
  }
  const combined = `${base}${raw}`;
  const parts = [];
  for (const segment of combined.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join('/')}` || '/';
}

export function getNode(fs, path) {
  const normalized = normalizePath(path, '/');
  if (normalized === '/') return fs['/'];
  const parts = normalized.split('/').filter(Boolean);
  let node = fs['/'];
  for (const part of parts) {
    if (!node || node.type !== 'dir' || !node.children[part]) return null;
    node = node.children[part];
  }
  return node;
}

export function getParent(fs, path) {
  const normalized = normalizePath(path, '/');
  const parts = normalized.split('/').filter(Boolean);
  const name = parts.pop();
  const parentPath = `/${parts.join('/')}`;
  return { parent: getNode(fs, parentPath || '/'), name, parentPath };
}

export function ensurePath(fs, path, cwd) {
  const resolved = normalizePath(path, cwd);
  const node = getNode(fs, resolved);
  return { resolved, node, isDir: node?.type === 'dir' };
}

export function listDir(node) {
  if (!node || node.type !== 'dir') return [];
  return Object.entries(node.children)
    .map(([name, child]) => ({ name, type: child.type, size: child.type === 'file' ? child.content.length : 4096, mode: child.mode || 'drwxr-xr-x' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
