/**
 * ============================================================
 * Practice terminal · virtual POSIX filesystem
 * ============================================================
 * Practice labs never start a container. Their terminal is an in-process
 * shell backed by this JSON-serialisable filesystem, persisted per session
 * in `lab_sessions.fs_state`.
 *
 * The tree intentionally mirrors a small Ubuntu 22.04 host so that the
 * commands taught in the course labs (filesystem, permissions, processes,
 * networking, hashing, log analysis) behave exactly as learners expect.
 */

const ELF = '\u007fELF\u0002\u0001\u0001\u0003';

export const dir = (children = {}, mode = 'rwxr-xr-x', owner = 'root') => ({
  type: 'dir',
  children,
  mode,
  owner,
});

export const file = (content = '', mode = 'rw-r--r--', owner = 'root') => ({
  type: 'file',
  content,
  mode,
  owner,
});

export const link = (target = '') => ({ type: 'link', target, mode: 'rwxrwxrwx', owner: 'root' });

const OS_RELEASE = [
  'PRETTY_NAME="Ubuntu 22.04.4 LTS"',
  'NAME="Ubuntu"',
  'VERSION_ID="22.04"',
  'VERSION="22.04.4 LTS (Jammy Jellyfish)"',
  'VERSION_CODENAME=jammy',
  'ID=ubuntu',
  'ID_LIKE=debian',
  'HOME_URL="https://www.ubuntu.com/"',
  'SUPPORT_URL="https://help.ubuntu.com/"',
  'UBUNTU_CODENAME=jammy',
  '',
].join('\n');

const PASSWD = [
  'root:x:0:0:root:/root:/bin/bash',
  'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
  'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
  'student:x:1000:1000:Student User:/home/student:/bin/bash',
  'sshd:x:110:65534::/run/sshd:/usr/sbin/nologin',
  '',
].join('\n');

const GROUP = [
  'root:x:0:',
  'sudo:x:27:student',
  'www-data:x:33:',
  'student:x:1000:',
  'labusers:x:1001:student',
  '',
].join('\n');

const MOUNTS = [
  'overlay / overlay rw,relatime,lowerdir=/var/lib/docker/overlay2/l/4f9a,upperdir=/var/lib/docker/overlay2/9c1d/diff,workdir=/var/lib/docker/overlay2/9c1d/work 0 0',
  'proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0',
  'tmpfs /dev/shm tmpfs rw,nosuid,nodev,size=65536k 0 0',
  'tmpfs /run tmpfs rw,nosuid,nodev,size=16384k 0 0',
  'devpts /dev/pts devpts rw,nosuid,noexec,relatime,gid=5,mode=620 0 0',
  'sysfs /sys sysfs ro,nosuid,nodev,noexec,relatime 0 0',
  'cgroup2 /sys/fs/cgroup cgroup2 ro,nosuid,nodev,noexec,relatime 0 0',
  '',
].join('\n');

const SYSLOG = [
  'Oct 20 09:00:01 cyberitalab systemd[1]: Starting Daily apt upgrade and clean activities...',
  'Oct 20 09:00:02 cyberitalab systemd[1]: Started OpenBSD Secure Shell server.',
  'Oct 20 09:00:03 cyberitalab sshd[342]: Server listening on 0.0.0.0 port 22.',
  'Oct 20 09:01:11 cyberitalab nginx[731]: nginx: worker process is ready.',
  'Oct 20 10:12:40 cyberitalab sshd[1021]: Accepted publickey for student from 10.10.14.7 port 51244 ssh2',
  '',
].join('\n');

const AUTH_LOG = [
  'Oct 20 09:59:01 cyberitalab CRON[998]: pam_unix(cron:session): session opened for user root',
  'Oct 20 10:12:40 cyberitalab sshd[1021]: Accepted publickey for student from 10.10.14.7 port 51244 ssh2',
  'Oct 20 10:12:41 cyberitalab sshd[1021]: pam_unix(sshd:session): session opened for user student(uid=1000)',
  '',
].join('\n');

const NGINX_INDEX = [
  '<!DOCTYPE html>',
  '<html>',
  '<head><title>CyberITA+ Lab Node</title></head>',
  '<body><h1>It works!</h1><p>This practice host is simulated in the browser.</p></body>',
  '</html>',
  '',
].join('\n');

const HOME = '/home/student';

/** Seeded tree used for a brand-new practice session. */
export const defaultFs = () => ({
  '/': dir({
    home: dir({
      student: dir(
        {
          'welcome.txt': file(
            'Welcome to your CyberITA+ practice terminal.\nThis shell is simulated in-process — nothing leaves the browser session.\nType "help" for the command reference.\n',
            'rw-r--r--',
            'student'
          ),
          notes: dir({}, 'rwxr-xr-x', 'student'),
          scripts: dir({}, 'rwxr-xr-x', 'student'),
          '.bashrc': file(
            '# ~/.bashrc — CyberITA+ practice profile\nexport PS1="\\u@\\h:\\w# "\nalias ll="ls -alF"\nalias la="ls -A"\n',
            'rw-r--r--',
            'student'
          ),
          '.profile': file('# ~/.profile\nexport PATH="$HOME/.local/bin:$PATH"\n', 'rw-r--r--', 'student'),
        },
        'rwxr-x---',
        'student'
      ),
    }),
    etc: dir({
      hostname: file('cyberitalab\n'),
      hosts: file('127.0.0.1\tlocalhost\n127.0.1.1\tcyberitalab\n::1\tlocalhost ip6-localhost ip6-loopback\n'),
      'resolv.conf': file('nameserver 10.0.15.1\nnameserver 1.1.1.1\nsearch cyberita.local\n'),
      'os-release': file(OS_RELEASE),
      issue: file('Ubuntu 22.04.4 LTS \\n \\l\n'),
      motd: file('Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-cyberita x86_64)\n'),
      passwd: file(PASSWD),
      group: file(GROUP),
      shadow: file('root:*:19000:0:99999:7:::\nstudent:$6$practice$simulated:19000:0:99999:7:::\n'),
      shell: file('/bin/sh\n'),
      hosts_allow: file('sshd: 10.0.15.0/24\n'),
      'nsswitch.conf': file('passwd: files\ngroup: files\nhosts: files dns\n'),
      apt: dir({
        'sources.list': file('deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse\n'),
        'apt.conf.d': dir({}),
        'sources.list.d': dir({}),
      }),
      ssh: dir({
        ssh_config: file('Host *\n  SendEnv LANG LC_*\n  HashKnownHosts yes\n'),
      }),
      nginx: dir({
        'nginx.conf': file('user www-data;\nworker_processes auto;\nevents { worker_connections 768; }\nhttp { include /etc/nginx/sites-enabled/*; }\n'),
        'sites-enabled': dir({ default: file('server { listen 80 default_server; root /var/www/html; }\n') }),
      }),
    }),
    bin: dir({
      bash: file(ELF, 'rwxr-xr-x'),
      sh: file(ELF, 'rwxr-xr-x'),
      ls: file(ELF, 'rwxr-xr-x'),
      cat: file(ELF, 'rwxr-xr-x'),
      grep: file(ELF, 'rwxr-xr-x'),
      awk: file(ELF, 'rwxr-xr-x'),
      sed: file(ELF, 'rwxr-xr-x'),
      ping: file(ELF, 'rwxr-xr-x'),
      ss: file(ELF, 'rwxr-xr-x'),
      ps: file(ELF, 'rwxr-xr-x'),
    }),
    sbin: dir({
      ifconfig: file(ELF, 'rwxr-xr-x'),
      init: file(ELF, 'rwxr-xr-x'),
    }),
    usr: dir({
      bin: dir({
        python3: file(ELF, 'rwxr-xr-x'),
        nmap: file(ELF, 'rwxr-xr-x'),
        curl: file(ELF, 'rwxr-xr-x'),
        sudo: file(ELF, 'rwxr-sr-x'),
        systemctl: file(ELF, 'rwxr-xr-x'),
      }),
      sbin: dir({}),
      local: dir({ bin: dir({}) }),
      share: dir({ man: dir({}) }),
    }),
    var: dir({
      log: dir({
        syslog: file(SYSLOG),
        'auth.log': file(AUTH_LOG),
        nginx: dir({
          'access.log': file('127.0.0.1 - - [20/Oct/2026:09:00:02 +0000] "GET / HTTP/1.1" 200 612 "-" "curl/8.5.0"\n'),
          'error.log': file(''),
        }),
        'dpkg.log': file('2026-10-20 08:59:41 install base-files:amd64 <none> 12ubuntu4.4\n'),
      }),
      www: dir({ html: dir({ 'index.nginx-debian.html': file(NGINX_INDEX) }) }),
      tmp: dir({}),
      lib: dir({}),
      cache: dir({ apt: dir({ archives: dir({}) }) }),
    }),
    tmp: dir({}, 'rwxrwxrwx'),
    root: dir({}, 'rwx------'),
    opt: dir({}),
    srv: dir({}),
    mnt: dir({}),
    media: dir({}),
    run: dir({}),
    dev: dir({ null: file('', 'rw-rw-rw-'), random: file('', 'rw-rw-rw-') }),
    proc: dir({
      loadavg: file('0.08 0.12 0.10 1/92 1024\n'),
      uptime: file('4512.32 38900.11\n'),
      version: file('Linux version 5.15.0-cyberita (build@cyberita) #1 SMP PREEMPT_DYNAMIC x86_64\n'),
      cpuinfo: file(
        [
          'processor\t: 0',
          'vendor_id\t: GenuineIntel',
          'model name\t: Intel(R) Xeon(R) CPU @ 2.20GHz',
          'cpu MHz\t\t: 2199.998',
          '',
          'processor\t: 1',
          'vendor_id\t: GenuineIntel',
          'model name\t: Intel(R) Xeon(R) CPU @ 2.20GHz',
          'cpu MHz\t\t: 2199.998',
          '',
        ].join('\n')
      ),
      meminfo: file('MemTotal:        4014080 kB\nMemFree:         1889480 kB\nMemAvailable:    2539520 kB\nSwapTotal:       2097148 kB\nSwapFree:        2097148 kB\n'),
      mounts: file(MOUNTS),
      1: dir({
        comm: file('sleep\n'),
        cmdline: file('sleep infinity\n'),
        cgroup: file('0::/docker/9c1d4f9a8b7e6d5c4b3a291807f6e5d4c3b2a1908f7e6d5c4b3a2918\n'),
        status: file('Name:\tsleep\nState:\tS (sleeping)\nPid:\t1\nPPid:\t0\nUid:\t0\t0\t0\t0\nGid:\t0\t0\t0\t0\n'),
      }),
      self: dir({
        comm: file('bash\n'),
        cgroup: file('0::/docker/9c1d4f9a8b7e6d5c4b3a291807f6e5d4c3b2a1908f7e6d5c4b3a2918\n'),
        mounts: file(MOUNTS),
        ns: dir({
          cgroup: link('cgroup:[4026531835]'),
          ipc: link('ipc:[4026532293]'),
          mnt: link('mnt:[4026532290]'),
          net: link('net:[4026532296]'),
          pid: link('pid:[4026532292]'),
          user: link('user:[4026531837]'),
          uts: link('uts:[4026532291]'),
        }),
      }),
    }),
    sys: dir({ fs: dir({ cgroup: dir({}) }) }),
    boot: dir({}),
    lib: dir({ x86_64: dir({}) }),
    lib64: link('lib'),
  }),
});

export function normalizePath(path, cwd = HOME) {
  if (!path || path === '.') return cwd;
  let raw = String(path);
  let base = cwd;
  if (raw === '~' || raw.startsWith('~/')) {
    raw = `${HOME}${raw.slice(1)}`;
    base = '';
  } else if (!raw.startsWith('/')) {
    base = cwd.endsWith('/') ? cwd : `${cwd}/`;
  } else {
    base = '';
  }
  // A trailing slash is harmless; drop it before resolving.
  raw = raw.replace(/\/+$/, '') || '/';
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
  return { parent: getNode(fs, parentPath || '/'), name, parentPath: parentPath || '/' };
}

export function ensureDir(fs, path) {
  const normalized = normalizePath(path, '/');
  const parts = normalized.split('/').filter(Boolean);
  let current = fs['/'];
  for (const part of parts) {
    if (!current.children[part]) current.children[part] = dir({});
    current = current.children[part];
    if (current.type !== 'dir') return false;
  }
  return true;
}

/** Writes `content` to `path`, creating parent directories as needed. */
export function writeFile(fs, path, content, { mode = 'rw-r--r--', owner = 'student' } = {}) {
  const normalized = normalizePath(path, '/');
  const { parent, name } = getParent(fs, normalized);
  if (!parent || parent.type !== 'dir') return false;
  const existing = parent.children[name];
  if (existing?.type === 'dir') return false;
  if (existing?.type === 'file') {
    existing.content = content;
    return true;
  }
  parent.children[name] = file(content, mode, owner);
  return true;
}

/**
 * Merges a lab's `initial_files` map into the tree. Keys may be absolute
 * (`/home/student/practice/access.log`) or relative to the home directory
 * (`practice/access.log`), matching the Docker provider's behaviour.
 */
export function mergeInitialFiles(fs, initialFiles = {}, cwd = HOME) {
  if (!initialFiles || typeof initialFiles !== 'object') return fs;
  for (const [key, value] of Object.entries(initialFiles)) {
    if (typeof value !== 'string') continue;
    const raw = String(key);
    const target = raw.startsWith('/') ? raw : `${cwd.replace(/\/+$/, '')}/${raw}`;
    const normalized = normalizePath(target, cwd);
    if (normalized !== HOME && !normalized.startsWith(`${HOME}/`)) continue;
    const parentPath = normalized.split('/').slice(0, -1).join('/') || '/';
    if (!ensureDir(fs, parentPath)) continue;
    writeFile(fs, normalized, value);
  }
  return fs;
}

export function listDir(node) {
  if (!node || node.type !== 'dir') return [];
  return Object.entries(node.children)
    .map(([name, child]) => ({
      name,
      type: child.type,
      size: child.type === 'file' ? Buffer.byteLength(child.content, 'utf8') : child.type === 'link' ? 0 : 4096,
      mode: child.mode || (child.type === 'dir' ? 'rwxr-xr-x' : 'rw-r--r--'),
      owner: child.owner || 'root',
      target: child.target || null,
    }))
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'dir' ? -1 : b.type === 'dir' ? 1 : 0;
    });
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export default { defaultFs, normalizePath, getNode, getParent, ensureDir, writeFile, mergeInitialFiles, listDir, deepClone };
