/**
 * Practical lab generator for CyberITA+.
 *
 * Turns a title + short brief into a complete, runnable lab: description,
 * objectives, starter files and guided steps. Every step is verified against
 * real command output inside the CyberITA+ lab container.
 *
 * Design rules (these keep generated labs error-free):
 *   - Commands only use tools that exist in the `cyberita/lab-runtime` image
 *     (and in plain `ubuntu:22.04` where possible): coreutils, procps,
 *     iproute2, nmap, ping, file, grep, awk, sha256sum, python3.
 *   - Work that needs fixture data writes its own files through
 *     `initialFiles` instead of assuming a network or an external service.
 *   - Verification prefers command output over exact command matching, so a
 *     learner can solve a step with an equivalent command.
 */

const POINTS_PER_STEP = 10;

function step(title, instruction, { command, pattern, hint = '', points = POINTS_PER_STEP, optional = false } = {}) {
  return {
    title,
    instruction,
    hint: hint || null,
    verification: command ? 'command' : 'output',
    expectedCommand: command || null,
    expectedOutputPattern: pattern || null,
    points,
    isOptional: Boolean(optional),
  };
}

/** A short, realistic nginx access log used by the log-analysis labs. */
const SAMPLE_ACCESS_LOG = [
  '10.10.14.7 - - [12/Mar/2026:09:14:02 +0000] "GET / HTTP/1.1" 200 612 "-" "Mozilla/5.0"',
  '10.10.14.7 - - [12/Mar/2026:09:14:04 +0000] "GET /courses HTTP/1.1" 200 18422 "-" "Mozilla/5.0"',
  '10.10.14.9 - - [12/Mar/2026:09:15:11 +0000] "GET /admin HTTP/1.1" 403 289 "-" "curl/8.5.0"',
  '172.16.4.21 - - [12/Mar/2026:09:16:38 +0000] "POST /login HTTP/1.1" 401 61 "-" "python-requests/2.31"',
  '172.16.4.21 - - [12/Mar/2026:09:16:39 +0000] "POST /login HTTP/1.1" 401 61 "-" "python-requests/2.31"',
  '172.16.4.21 - - [12/Mar/2026:09:16:40 +0000] "POST /login HTTP/1.1" 401 61 "-" "python-requests/2.31"',
  '172.16.4.21 - - [12/Mar/2026:09:16:41 +0000] "POST /login HTTP/1.1" 200 1203 "-" "python-requests/2.31"',
  '203.0.113.44 - - [12/Mar/2026:09:17:02 +0000] "GET /search?q=1%27+OR+%271%27%3D%271 HTTP/1.1" 500 402 "-" "sqlmap/1.8.2"',
  '203.0.113.44 - - [12/Mar/2026:09:17:07 +0000] "GET /search?q=UNION+SELECT+NULL-- HTTP/1.1" 500 402 "-" "sqlmap/1.8.2"',
  '198.51.100.18 - - [12/Mar/2026:09:18:20 +0000] "GET /api/users HTTP/1.1" 200 9341 "-" "Mozilla/5.0"',
  '198.51.100.18 - - [12/Mar/2026:09:18:22 +0000] "GET /api/users/4 HTTP/1.1" 200 421 "-" "Mozilla/5.0"',
  '10.10.14.7 - - [12/Mar/2026:09:19:01 +0000] "GET /courses/linux-basics HTTP/1.1" 200 24110 "-" "Mozilla/5.0"',
].join('\n');

/** Fixture files created before the learner's first command. */
const ACCESS_LOG_FILES = { 'practice/access.log': `${SAMPLE_ACCESS_LOG}\n` };

const BLUEPRINTS = {
  linux_basics: {
    match: ['linux', 'command', 'shell', 'bash', 'terminal', 'basics', 'filesystem', 'file', 'essential', 'cli', 'ubuntu'],
    label: 'Linux command line',
    summary: 'Explore a real Linux shell: identity, filesystem, files and system health.',
    scenario:
      'You have been dropped into a fresh Linux server. Before you can secure a host you must be able to describe it: who you are, where you are, what is installed and how healthy the machine looks.',
    objectives: [
      'Navigate the Linux filesystem and inspect files, including hidden ones',
      'Identify the current user, kernel and operating system release',
      'Create and read files in your workspace',
      'Read disk and memory utilisation from the command line',
    ],
    files: {},
    steps: [
      step('Who am I?', 'Print the effective username of your shell session.\n\n```bash\nwhoami\n```', {
        command: 'whoami',
        hint: 'The prompt already shows your name. Now prove it from the shell.',
      }),
      step('Where am I?', 'Print the absolute path of your current working directory.\n\n```bash\npwd\n```', {
        command: 'pwd',
      }),
      step('See everything, including hidden files', 'List the directory contents in long format, including dotfiles.\n\n```bash\nls -la\n```', {
        command: 'ls -la',
        hint: '`-l` is long format, `-a` shows hidden files such as `.bashrc`.',
      }),
      step('Identify the operating system', 'Read the operating system release information.\n\n```bash\ncat /etc/os-release\n```', {
        pattern: 'PRETTY_NAME=',
        hint: 'Look for the `PRETTY_NAME` field.',
      }),
      step('Check the running kernel', 'Print the kernel release version.\n\n```bash\nuname -r\n```', {
        pattern: '^\\d+\\.\\d+',
      }),
      step('Create your practice workspace', 'Create a directory called `practice` inside your home directory (safe to run twice).\n\n```bash\nmkdir -p ~/practice\n```', {
        command: 'mkdir -p ~/practice',
      }),
      step('Write a file', 'Write the text `CyberITA+ practice` into `~/practice/notes.txt`.\n\n```bash\necho "CyberITA+ practice" > ~/practice/notes.txt\n```', {
        command: 'echo "CyberITA+ practice" > ~/practice/notes.txt',
        hint: '`>` redirects standard output into a file, replacing its contents.',
      }),
      step('Read it back', 'Display the contents of the file you just wrote.\n\n```bash\ncat ~/practice/notes.txt\n```', {
        pattern: 'CyberITA\\+ practice',
      }),
      step('Check disk space', 'Show human-readable disk usage for all mounted filesystems.\n\n```bash\ndf -h\n```', {
        pattern: 'Filesystem',
      }),
      step('Check memory', 'Show memory usage in mebibytes.\n\n```bash\nfree -m\n```', {
        pattern: 'Mem:',
      }),
    ],
  },

  permissions: {
    match: ['permission', 'chmod', 'chown', 'umask', 'access control', 'least privilege', 'ownership', 'hardening', 'sudo'],
    label: 'Linux permissions',
    summary: 'Practise reading and changing POSIX permissions on real files.',
    scenario:
      'A colleague stored a credential file with world-readable permissions. Your job is to reproduce the problem, understand the permission bits and fix it using the principle of least privilege.',
    objectives: [
      'Read octal and symbolic permission bits',
      'Restrict a file so only the owner can read and write it',
      'Verify directory permissions and explain their effect',
      'Relate permissions to the principle of least privilege',
    ],
    files: {},
    steps: [
      step('Prepare the workspace', 'Create the practice directory and an empty report file.\n\n```bash\nmkdir -p ~/practice && touch ~/practice/report.txt\n```', {
        command: 'mkdir -p ~/practice && touch ~/practice/report.txt',
        hint: '`&&` runs the second command only when the first succeeds.',
      }),
      step('Inspect the default mode', 'Show the symbolic permissions of the file.\n\n```bash\nls -l ~/practice/report.txt\n```', {
        pattern: '-rw-',
      }),
      step('Make it private', 'Remove all group and other permissions, so only the owner can read and write.\n\n```bash\nchmod 600 ~/practice/report.txt\n```', {
        command: 'chmod 600 ~/practice/report.txt',
      }),
      step('Verify the octal mode', 'Print the numeric (octal) mode of the file.\n\n```bash\nstat -c "%a" ~/practice/report.txt\n```', {
        pattern: '^\\s*600\\s*$',
        hint: '6 = read + write for the owner, 0 = nothing for group and others.',
      }),
      step('Verify the symbolic mode', 'Print the symbolic mode of the file.\n\n```bash\nstat -c "%A" ~/practice/report.txt\n```', {
        pattern: '-rw-------',
      }),
      step('Restrict the directory', 'Set the practice directory to `750` (owner rwx, group r-x, others nothing).\n\n```bash\nchmod 750 ~/practice\n```', {
        command: 'chmod 750 ~/practice',
      }),
      step('Confirm the directory mode', 'Print the symbolic mode of the directory.\n\n```bash\nstat -c "%A" ~/practice\n```', {
        pattern: 'drwxr-x---',
      }),
      step('Show your identity and groups', 'Display your user ID, group ID and group memberships.\n\n```bash\nid\n```', {
        pattern: 'uid=',
      }),
      step('Inspect the file type', 'Ask `file` what kind of content the file holds.\n\n```bash\nfile ~/practice/report.txt\n```', {
        pattern: 'empty',
      }),
    ],
  },

  processes: {
    match: ['process', 'ps', 'cpu', 'memory', 'load', 'service', 'systemd', 'performance', 'troubleshoot'],
    label: 'Process and system inspection',
    summary: 'Inspect running processes, CPU load and memory pressure on a live host.',
    scenario:
      'Users report that a server feels slow. You cannot reboot it. Use the standard process and system tools to collect evidence before changing anything.',
    objectives: [
      'List running processes and identify the busiest ones',
      'Read load average, CPU count and memory availability',
      'Explain what the process tree tells you about a container',
      'Collect evidence without restarting services',
    ],
    files: {},
    steps: [
      step('List every process', 'Show all running processes in the classic BSD format.\n\n```bash\nps aux\n```', {
        pattern: 'PID',
      }),
      step('Sort processes by memory', 'Show the five processes using the most memory.\n\n```bash\nps -eo pid,comm,%mem,%cpu --sort=-%mem | head -n 5\n```', {
        pattern: 'PID\\s+COMMAND',
        hint: '`--sort=-%mem` sorts descending by memory percentage.',
      }),
      step('Identify PID 1', 'Show which process has PID 1 in this container.\n\n```bash\nps -p 1 -o pid,comm\n```', {
        pattern: '\\b1\\b',
      }),
      step('Read the load average', 'Display system uptime and load averages.\n\n```bash\nuptime\n```', {
        pattern: 'load average',
      }),
      step('Check available memory', 'Show memory usage in mebibytes.\n\n```bash\nfree -m\n```', {
        pattern: 'Mem:',
      }),
      step('Count CPU cores', 'Print the number of processing units available to this container.\n\n```bash\nnproc\n```', {
        pattern: '^\\s*\\d+\\s*$',
      }),
      step('Read /proc/loadavg directly', 'Read the kernel load-average file.\n\n```bash\ncat /proc/loadavg\n```', {
        pattern: '\\d+\\.\\d+',
      }),
      step('Find your shell process', 'Search the process list for the running `bash` process.\n\n```bash\npgrep -a bash\n```', {
        pattern: 'bash',
        hint: 'If no bash process is listed, run the command again. It executes inside a fresh shell each time.',
      }),
      step('Check disk pressure', 'Show filesystem usage.\n\n```bash\ndf -h\n```', {
        pattern: 'Filesystem',
      }),
    ],
  },

  networking: {
    match: ['network', 'network security', 'firewall', 'port', 'tcp', 'udp', 'nmap', 'scan', 'interface', 'dns', 'ping'],
    label: 'Network inspection',
    summary: 'Inspect interfaces, listening ports and reachability from inside a lab container.',
    scenario:
      'You are auditing a host with no documentation. Map its interfaces and listening services, then verify local reachability before you touch any firewall rule.',
    objectives: [
      'List network interfaces and assigned addresses',
      'Enumerate listening TCP and UDP ports',
      'Verify loopback reachability with ping and nmap',
      'Read the resolver configuration',
    ],
    files: {},
    steps: [
      step('List network interfaces', 'Show every network interface with its addresses.\n\n```bash\nip addr\n```', {
        pattern: 'inet ',
      }),
      step('Confirm the hostname', 'Print the hostname of this lab container.\n\n```bash\nhostname\n```', {
        command: 'hostname',
      }),
      step('List listening sockets', 'Show listening TCP and UDP sockets with the owning process.\n\n```bash\nss -tulpn\n```', {
        pattern: 'Netid',
        hint: 'This container runs few services, so the list may be short. That is the finding.',
      }),
      step('Test loopback reachability', 'Send two ICMP echo requests to the loopback address.\n\n```bash\nping -c 2 127.0.0.1\n```', {
        pattern: '2 packets transmitted, 2 received',
      }),
      step('Scan the loopback interface', 'Scan the two most common web ports on loopback with nmap.\n\n```bash\nnmap -p 22,80 127.0.0.1\n```', {
        pattern: 'Nmap scan report',
      }),
      step('Resolve a hostname', 'Resolve `localhost` using the system name service switch.\n\n```bash\ngetent hosts localhost\n```', {
        pattern: '127\\.0\\.0\\.1',
      }),
      step('Read the resolver configuration', 'Show the configured DNS resolvers.\n\n```bash\ncat /etc/resolv.conf\n```', {
        pattern: 'nameserver',
      }),
      step('Read the routing table', 'Display the kernel routing table.\n\n```bash\nip route\n```', {
        pattern: 'default|linkdown|/',
      }),
    ],
  },

  log_analysis: {
    match: ['log', 'logs', 'siem', 'audit', 'forensic', 'forensics', 'incident', 'detection', 'grep', 'analysis', 'access log', 'monitoring'],
    label: 'Log analysis',
    summary: 'Hunt for brute-force attempts and injection probes inside a real access log.',
    scenario:
      'A web server produced the access log in `~/practice/access.log`. Security wants to know whether authentication was attacked and whether an exploit was attempted, without guessing.',
    objectives: [
      'Measure the size of a log file',
      'Filter log lines by status code and pattern',
      'Rank source addresses by request volume',
      'Identify automated attack tooling from the user agent',
    ],
    files: ACCESS_LOG_FILES,
    steps: [
      step('Measure the log', 'Count the lines in the access log.\n\n```bash\nwc -l ~/practice/access.log\n```', {
        pattern: '\\d+\\s+\\/home\\/student\\/practice\\/access\\.log',
        hint: 'The file is already in your workspace. No download needed.',
      }),
      step('Read the first entries', 'Show the first three log lines.\n\n```bash\nhead -n 3 ~/practice/access.log\n```', {
        pattern: 'GET / HTTP/1\\.1',
      }),
      step('Find denied requests', 'Show requests that returned HTTP 403.\n\n```bash\ngrep " 403 " ~/practice/access.log\n```', {
        pattern: 'GET /admin HTTP/1\\.1\\" 403',
      }),
      step('Count failed logins', 'Count the 401 responses that came from the `/login` endpoint.\n\n```bash\ngrep " 401 " ~/practice/access.log | grep "POST /login" | wc -l\n```', {
        pattern: '^\\s*\\d+\\s*$',
      }),
      step('Rank source addresses', 'Show the three source IP addresses with the most requests.\n\n```bash\nawk \'{print $1}\' ~/practice/access.log | sort | uniq -c | sort -rn | head -n 3\n```', {
        pattern: '\\d+\\s+\\d+\\.\\d+\\.\\d+\\.\\d+',
        hint: '`awk` prints the first column (the client IP), then `sort | uniq -c` counts each one.',
      }),
      step('Spot the attack tooling', 'Find requests whose user agent identifies an automated SQL injection tool.\n\n```bash\ngrep -i "sqlmap" ~/practice/access.log\n```', {
        pattern: 'sqlmap',
      }),
      step('Count server errors', 'Count the HTTP 500 responses.\n\n```bash\ngrep -c " 500 " ~/practice/access.log\n```', {
        pattern: '^\\s*\\d+\\s*$',
      }),
      step('Inspect recent activity', 'Show the last five log entries.\n\n```bash\ntail -n 5 ~/practice/access.log\n```', {
        pattern: 'HTTP/1\\.1',
      }),
    ],
  },

  file_crypto: {
    match: ['hash', 'hashing', 'crypto', 'cryptography', 'integrity', 'checksum', 'sha256', 'md5', 'encode', 'encoding', 'base64', 'evidence', 'file'],
    label: 'Hashing and file integrity',
    summary: 'Use hashing and file inspection to prove integrity of on-disk evidence.',
    scenario:
      'Before analysing a file you must prove it has not changed. Hash the evidence, record the digest and identify what the file actually is.',
    objectives: [
      'Compute SHA-256 and MD5 digests',
      'Explain why a cryptographic hash proves integrity',
      'Identify file types from their content, not their extension',
      'Encode and decode data safely',
    ],
    files: {},
    steps: [
      step('Hash a known string', 'Compute the SHA-256 digest of the string `cyberita`.\n\n```bash\necho "cyberita" | sha256sum\n```', {
        pattern: '[a-f0-9]{64}',
      }),
      step('Hash a system file', 'Compute the SHA-256 digest of `/etc/os-release`.\n\n```bash\nsha256sum /etc/os-release\n```', {
        pattern: '[a-f0-9]{64}\\s+/etc/os-release',
      }),
      step('Compare with MD5', 'Compute the MD5 digest of `/etc/hostname`.\n\n```bash\nmd5sum /etc/hostname\n```', {
        pattern: '[a-f0-9]{32}',
        hint: 'MD5 is fast but not collision resistant. Never use it for passwords.',
      }),
      step('Identify the real file type', 'Ask `file` what `/bin/bash` actually is.\n\n```bash\nfile /bin/bash\n```', {
        pattern: 'ELF 64-bit',
      }),
      step('Count records in a system file', 'Count the lines in `/etc/passwd`.\n\n```bash\nwc -l /etc/passwd\n```', {
        pattern: '\\d+\\s+/etc/passwd',
      }),
      step('Inspect the file size in bytes', 'Print the size of `/etc/passwd` in bytes.\n\n```bash\nstat -c "%s" /etc/passwd\n```', {
        pattern: '^\\s*\\d+\\s*$',
      }),
      step('Encode a value', 'Base64-encode the hostname file.\n\n```bash\nbase64 /etc/hostname\n```', {
        pattern: '^[A-Za-z0-9+/=]+\\s*$',
      }),
      step('Search for an account', 'Show the `root` entry from `/etc/passwd`.\n\n```bash\ngrep "^root:" /etc/passwd\n```', {
        pattern: '^root:x:0:0:',
      }),
    ],
  },

  container_basics: {
    match: ['docker', 'container', 'container security', 'kubernetes', 'isolation', 'namespace', 'cgroup', 'devops', 'infrastructure'],
    label: 'Container isolation',
    summary: 'Inspect what a container really is: namespaces, cgroups and its own filesystem.',
    scenario:
      'Containers are ordinary Linux processes with extra isolation. Prove it from inside: identify PID 1, read the cgroup tree and see which kernel features isolate you from the host.',
    objectives: [
      'Identify the container init process',
      'Read cgroup and namespace information',
      'Explain why container isolation is not a security boundary by default',
      'Inspect the container filesystem and mounts',
    ],
    files: {},
    steps: [
      step('Identify the container init process', 'Show the command name of process 1.\n\n```bash\ncat /proc/1/comm\n```', {
        pattern: 'sleep|init|tini',
      }),
      step('List PID 1 details', 'Show the full command line of process 1.\n\n```bash\nps -p 1 -o pid,args\n```', {
        pattern: 'sleep|init',
      }),
      step('Read the cgroup tree', 'Show the cgroup hierarchy this process belongs to.\n\n```bash\ncat /proc/1/cgroup\n```', {
        pattern: '0::|docker|cgroup',
      }),
      step('Count namespaces', 'List the namespace links for the current shell.\n\n```bash\nls -l /proc/self/ns\n```', {
        pattern: 'mnt|pid|net',
      }),
      step('Show kernel identity', 'Print the kernel name and release.\n\n```bash\nuname -sr\n```', {
        pattern: 'Linux \\d+\\.\\d+',
      }),
      step('Inspect the mount table', 'Show mounts that reveal the container filesystem.\n\n```bash\ngrep -E "overlay|shm|tmpfs" /proc/mounts | head -n 5\n```', {
        pattern: 'overlay|shm|tmpfs',
      }),
      step('Confirm root filesystem usage', 'Show disk usage of `/`.\n\n```bash\ndf -h /\n```', {
        pattern: 'Filesystem',
      }),
      step('Check swap availability', 'Show memory and swap in mebibytes.\n\n```bash\nfree -m\n```', {
        pattern: 'Swap:',
      }),
    ],
  },

  practice_sandbox: {
    match: ['practice', 'sandbox', 'warm up', 'warm-up', 'refresher', 'fundamentals', 'basics'],
    label: 'Practice sandbox',
    summary: 'A safe, disposable Linux sandbox: warm up, explore and experiment freely.',
    scenario:
      'This sandbox is yours. It is a disposable Linux container with common security tooling installed, so you can experiment without breaking anything. Run the guided warm-up, then keep exploring on your own. Nothing here is graded.',
    objectives: [
      'Warm up on the commands every security analyst uses daily',
      'Collect system, process and network evidence',
      'Practise writing and hashing files',
      'Experiment freely in a real, disposable container',
    ],
    files: {},
    steps: [
      step('Confirm your identity', 'Print the user you are running as.\n\n```bash\nwhoami\n```', { command: 'whoami' }),
      step('Show your privileges', 'Print your UID, GID and groups.\n\n```bash\nid\n```', { pattern: 'uid=' }),
      step('Inspect the operating system', 'Show the OS release name.\n\n```bash\ncat /etc/os-release\n```', { pattern: 'PRETTY_NAME=' }),
      step('List the workspace', 'List your home directory in long format.\n\n```bash\nls -la ~\n```', { command: 'ls -la ~' }),
      step('Create a sandbox folder', 'Create `~/practice` and change into it.\n\n```bash\nmkdir -p ~/practice && cd ~/practice\n```', {
        command: 'mkdir -p ~/practice && cd ~/practice',
      }),
      step('Prove where you are', 'Print the current directory after the last step.\n\n```bash\npwd\n```', { command: 'pwd' }),
      step('Create and hash a file', 'Write `sandbox evidence` into `evidence.txt` and hash it.\n\n```bash\necho "sandbox evidence" > evidence.txt && sha256sum evidence.txt\n```', {
        pattern: '[a-f0-9]{64}\\s+evidence\\.txt',
      }),
      step('Inspect running processes', 'Show the running processes.\n\n```bash\nps aux\n```', { pattern: 'PID' }),
      step('Inspect network sockets', 'List listening sockets.\n\n```bash\nss -tulpn\n```', { pattern: 'Netid' }),
      step('Check system resources', 'Show disk and memory usage.\n\n```bash\ndf -h && free -m\n```', {
        pattern: 'Filesystem[\\s\\S]*Mem:',
      }),
    ],
  },
};

const DOMAIN_ORDER = [
  'log_analysis',
  'container_basics',
  'file_crypto',
  'networking',
  'permissions',
  'processes',
  'linux_basics',
  'practice_sandbox',
];

function detectDomain(text) {
  const normalized = String(text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const key of DOMAIN_ORDER) {
    const blueprint = BLUEPRINTS[key];
    const score = blueprint.match.reduce(
      (total, keyword) => (normalized.includes(keyword) ? total + keyword.length : total),
      0
    );
    if (score > bestScore) {
      best = { key, blueprint };
      bestScore = score;
    }
  }
  return best || { key: 'linux_basics', blueprint: BLUEPRINTS.linux_basics };
}

function clean(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

/**
 * Generate a complete lab from a title and a short brief.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.details]  Free-text brief: scope, scenario, tools.
 * @param {'beginner'|'intermediate'|'advanced'} [options.difficulty]
 * @param {number} [options.stepCount]
 * @param {boolean} [options.isPractice]
 */
export function generateLab({
  title,
  details = '',
  difficulty = 'beginner',
  stepCount = 8,
  isPractice = false,
  labMode = 'practice',
  minEvidence = 1,
} = {}) {
  const cleanTitle = clean(title, 'Practice lab');
  const cleanDetails = clean(details);
  const { key, blueprint } = detectDomain(`${cleanTitle} ${cleanDetails}`);
  const mode = labMode === 'real' ? 'real' : 'practice';
  const isReal = mode === 'real';
  const evidenceTarget = Math.max(1, Math.min(20, Number(minEvidence) || 1));

  const requested = Math.max(3, Math.min(12, Number(stepCount) || 8));
  const available = blueprint.steps.slice(0, Math.min(requested, blueprint.steps.length));
  // Real labs are unguided: they deliberately contain no steps or hints.
  const steps = isReal ? [] : available.map((item, index) => ({ ...item, position: index }));

  const difficultyLabel = difficulty === 'advanced' ? 'advanced' : difficulty === 'intermediate' ? 'intermediate' : 'beginner';
  const baseSteps = isReal ? requested : steps.length;
  const estimate = Math.min(180, Math.max(20, baseSteps * (difficultyLabel === 'advanced' ? 9 : difficultyLabel === 'intermediate' ? 7 : 5)));

  const detailsBlock = cleanDetails ? `\n## Brief\n${cleanDetails}\n` : '';

  const description = [
    `## Scenario`,
    blueprint.scenario,
    detailsBlock.trim() ? detailsBlock.trim() : '',
    `## What you will practise`,
    ...blueprint.objectives.map((objective) => `- ${objective}`),
    '',
    `## Environment`,
    'Your session runs in a real, disposable Linux container. You are root **inside** the container so you can install packages and use professional tooling, but the container has no host access, no Docker socket and is limited in CPU, memory and processes. The environment is destroyed when the session expires.',
    '',
    isReal ? `## How this lab works` : `## How steps work`,
    isReal
      ? 'This is a real, question-only assessment. Read the task brief, complete the work yourself and upload screenshot evidence for your instructor. There are no step-by-step instructions, hints or automatic verification.'
      : 'Each step is verified automatically. Press **Enter** after running a command; when the expected output appears the step ticks off. Hints are available on every step.',
    isPractice
      ? '\n## Practice mode\nThis lab is not graded and no report is required. Start as many sessions as you like.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const objectives = blueprint.objectives.map((objective) => `- ${objective}`).join('\n');

  const taskBrief = isReal
    ? [
        `## Your task`,
        cleanDetails || blueprint.scenario,
        '',
        `## Scenario`,
        blueprint.scenario,
        '',
        `## Requirements`,
        ...blueprint.objectives.map((objective) => `- ${objective}`),
        '',
        `## Evidence to submit`,
        `- At least ${evidenceTarget} screenshot${evidenceTarget === 1 ? '' : 's'} proving the completed work`,
        '- A short note explaining what you did and what you found',
      ].join('\n')
    : '';

  const submissionRequirements = isReal
    ? [
        `- At least ${evidenceTarget} screenshot${evidenceTarget === 1 ? '' : 's'} of the terminal or tool output proving the work`,
        '- A short explanation of the commands or approach you used',
        '- The hash of any file you created, if the task asks for one',
      ].join('\n')
    : isPractice
      ? ''
      : [
          '- A screenshot of the terminal proving each verified step',
          '- A short explanation of what each command changed and why',
          '- The hash of any file you created, if the lab asks for one',
        ].join('\n');

  return {
    title: cleanTitle,
    summary: blueprint.summary,
    description,
    objectives,
    submissionRequirements,
    taskBrief,
    difficulty: difficultyLabel,
    estimatedMinutes: estimate,
    terminalWelcome: isReal
      ? `Welcome to "${cleanTitle}". This is a real, unguided assessment. Read the task brief and complete the work.`
      : isPractice
        ? `Welcome to "${cleanTitle}". This is a real practice lab container. Install packages and explore freely. Run \`help\` for a quick reference.`
        : `Welcome to "${cleanTitle}". This is a real Linux container. Run \`help\` or explore freely.`,
    initialCwd: '/home/student',
    initialFiles: blueprint.files,
    isPractice: Boolean(isPractice),
    labMode: mode,
    minEvidence: evidenceTarget,
    domain: key,
    steps,
    counts: {
      steps: steps.length,
      totalPoints: steps.reduce((sum, item) => sum + item.points, 0),
    },
  };
}

export const LAB_BLUEPRINT_KEYS = Object.keys(BLUEPRINTS);
export default { generateLab };
