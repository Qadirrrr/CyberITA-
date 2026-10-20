import { defaultFs, normalizePath, getNode, getParent, listDir, deepClone } from './virtualFs.js';

/**
 * Simulated Linux shell for interactive labs.
 * Supports a practical subset of coreutils/procps/net tools with
 * deterministic, lab-friendly output. State (filesystem + cwd) is
 * JSON-serializable and persisted per lab session.
 */
export class MockShell {
  constructor({ fsState, cwd = '/home/student', welcome = '', hostname = 'cyberita-lab', user = 'student' } = {}) {
    this.fs = fsState && Object.keys(fsState).length > 0 ? deepClone(fsState) : defaultFs();
    this.cwd = cwd;
    this.hostname = hostname;
    this.user = user;
    this.history = [];
    this.welcome = welcome;
  }

  banner() {
    return [
      this.welcome,
      `Type "help" to list the available simulated commands.`,
      '',
    ].filter(Boolean).join('\n');
  }

  /** Executes a single command line. Never throws. */
  execute(commandLine) {
    const raw = String(commandLine ?? '').trim();
    const events = [];
    if (!raw) return { output: '', exitCode: 0, cwd: this.cwd, fsState: this.fs, events };

    this.history.push(raw);
    if (this.history.length > 200) this.history = this.history.slice(-200);

    if (raw === 'clear') {
      return { output: '', exitCode: 0, cwd: this.cwd, fsState: this.fs, events: [{ type: 'clear' }] };
    }

    let output = '';
    let exitCode = 0;
    try {
      const { cmd, args, redirection } = parseLine(raw);
      const handler = this.resolve(cmd);
      if (!handler) {
        output = `bash: ${cmd}: command not found`;
        exitCode = 127;
      } else {
        const result = handler.call(this, args, raw);
        if (result && typeof result === 'object' && 'output' in result) {
          output = result.output ?? '';
          exitCode = result.exitCode ?? 0;
          if (result.events) events.push(...result.events);
        } else {
          output = result == null ? '' : String(result);
        }
      }
      if (redirection) {
        output = this.applyRedirection(redirection, output) ? '' : output;
        exitCode = redirection.ok ? 0 : exitCode;
        if (!redirection.ok) output = redirection.error || 'bash: permission denied';
      }
    } catch (error) {
      output = `bash: internal error: ${error.message}`;
      exitCode = 1;
    }

    return { output, exitCode, cwd: this.cwd, fsState: this.fs, events };
  }

  resolve(cmd) {
    const map = {
      help: this.cmdHelp, pwd: this.cmdPwd, cd: this.cmdCd, ls: this.cmdLs, dir: this.cmdLs,
      cat: this.cmdCat, less: this.cmdCat, head: this.cmdHead, tail: this.cmdTail,
      echo: this.cmdEcho, touch: this.cmdTouch, mkdir: this.cmdMkdir, rmdir: this.cmdRm,
      rm: this.cmdRm, cp: this.cmdCp, mv: this.cmdMv, grep: this.cmdGrep, wc: this.cmdWc,
      whoami: this.cmdWhoami, id: this.cmdId, uname: this.cmdUname, hostname: this.cmdHostname,
      date: this.cmdDate, history: this.cmdHistory, clear: this.cmdClear, env: this.cmdEnv,
      ps: this.cmdPs, top: this.cmdTop, df: this.cmdDf, free: this.cmdFree, uptime: this.cmdUptime,
      ifconfig: this.cmdIfconfig, ip: this.cmdIp, ping: this.cmdPing, traceroute: this.cmdTraceroute,
      netstat: this.cmdNetstat, ss: this.cmdNetstat, curl: this.cmdCurl, wget: this.cmdCurl,
      nmap: this.cmdNmap, apt: this.cmdApt, 'apt-get': this.cmdApt, systemctl: this.cmdSystemctl,
      service: this.cmdSystemctl, sudo: this.cmdSudo, file: this.cmdFile, which: this.cmdWhich,
      man: this.cmdMan, find: this.cmdFind, chmod: this.cmdChmod, exit: this.cmdExit,
      true: () => '', 'lsb_release': this.cmdLsbRelease,
    };
    return map[cmd];
  }

  // ---------- coreutils ----------

  cmdHelp() {
    const lines = [
      'CyberITA+ simulated shell — available commands:',
      '  Filesystem : pwd cd ls cat head tail touch mkdir rm cp mv find grep wc file chmod',
      '  Text       : echo grep wc head tail',
      '  System     : whoami id uname hostname date history env ps top df free uptime lsb_release',
      '  Network    : ifconfig ip ping traceroute netstat ss curl wget nmap',
      '  Packages   : apt / apt-get   Services: systemctl service   Elevated: sudo',
      '  Misc       : man which clear exit',
      'All commands are simulated locally — no real system is modified.',
    ];
    return lines.join('\n');
  }

  cmdPwd() { return this.cwd; }

  cmdCd(args) {
    const target = args.find((a) => !a.startsWith('-')) || '~';
    const resolved = normalizePath(target, this.cwd);
    const node = getNode(this.fs, resolved);
    if (!node) return { output: `bash: cd: ${target}: No such file or directory`, exitCode: 1 };
    if (node.type !== 'dir') return { output: `bash: cd: ${target}: Not a directory`, exitCode: 1 };
    this.cwd = resolved;
    return '';
  }

  cmdLs(args) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const showAll = flags.includes('a');
    const long = flags.includes('l');
    const targets = args.filter((a) => !a.startsWith('-'));
    const target = targets[0] || '.';
    const resolved = normalizePath(target, this.cwd);
    const node = getNode(this.fs, resolved);
    if (!node) return { output: `ls: cannot access '${target}': No such file or directory`, exitCode: 2 };
    if (node.type === 'file') return target;

    let entries = listDir(node);
    if (!showAll) entries = entries.filter((e) => !e.name.startsWith('.'));
    if (entries.length === 0) return '';
    if (long) {
      const total = entries.reduce((sum, e) => sum + Math.ceil(e.size / 1024) * 4, 0);
      const rows = entries.map((e) =>
        `${e.type === 'dir' ? 'drwxr-xr-x' : (e.mode || '-rw-r--r--')}  1 ${e.type === 'dir' ? 'root' : 'student'} ${e.type === 'dir' ? 'root' : 'student'} ${String(e.size).padStart(6)} Oct 20 10:00 ${e.name}${e.type === 'dir' ? '/' : ''}`
      );
      return [`total ${total}`, ...rows].join('\n');
    }
    return entries.map((e) => `${e.name}${e.type === 'dir' ? '/' : ''}`).join('  ');
  }

  cmdCat(args) {
    if (args.length === 0) return { output: 'cat: missing operand', exitCode: 1 };
    const parts = [];
    let code = 0;
    for (const target of args) {
      const node = getNode(this.fs, normalizePath(target, this.cwd));
      if (!node) { parts.push(`cat: ${target}: No such file or directory`); code = 1; continue; }
      if (node.type === 'dir') { parts.push(`cat: ${target}: Is a directory`); code = 1; continue; }
      parts.push(node.content.replace(/\n$/, ''));
    }
    return { output: parts.join('\n'), exitCode: code };
  }

  cmdHead(args) { return this.sliceFile(args, 'head'); }
  cmdTail(args) { return this.sliceFile(args, 'tail'); }

  sliceFile(args, mode) {
    let count = 10;
    const rest = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '-n' || args[i] === '-c') {
        count = Number(args[i + 1]) || 10;
        i += 1;
      } else if (/^-\d+$/.test(args[i])) count = Number(args[i].slice(1));
      else rest.push(args[i]);
    }
    const target = rest[0];
    if (!target) return { output: `${mode}: missing file operand`, exitCode: 1 };
    const node = getNode(this.fs, normalizePath(target, this.cwd));
    if (!node || node.type !== 'file') return { output: `${mode}: cannot open '${target}' for reading: No such file or directory`, exitCode: 1 };
    const lines = node.content.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
    const selected = mode === 'head' ? lines.slice(0, count) : lines.slice(-count);
    return selected.join('\n');
  }

  cmdEcho(args) { return args.join(' '); }

  cmdTouch(args) {
    if (args.length === 0) return { output: 'touch: missing file operand', exitCode: 1 };
    for (const target of args) {
      const resolved = normalizePath(target, this.cwd);
      const existing = getNode(this.fs, resolved);
      if (existing) continue;
      const { parent, name, parentPath } = getParent(this.fs, resolved);
      if (!parent || parent.type !== 'dir') return { output: `touch: cannot touch '${target}': No such file or directory`, exitCode: 1 };
      parent.children[name] = { type: 'file', content: '', mode: 'rw-r--r--', path: parentPath };
    }
    return '';
  }

  cmdMkdir(args) {
    const recursive = args.includes('-p');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) return { output: 'mkdir: missing operand', exitCode: 1 };
    for (const target of targets) {
      const resolved = normalizePath(target, this.cwd);
      const existing = getNode(this.fs, resolved);
      if (existing) {
        if (recursive) continue;
        return { output: `mkdir: cannot create directory '${target}': File exists`, exitCode: 1 };
      }
      if (recursive) {
        const parts = resolved.split('/').filter(Boolean);
        let current = this.fs['/'];
        for (const part of parts) {
          if (!current.children[part]) current.children[part] = { type: 'dir', children: {} };
          current = current.children[part];
          if (current.type !== 'dir') return { output: `mkdir: cannot create directory '${target}': Not a directory`, exitCode: 1 };
        }
      } else {
        const { parent, name } = getParent(this.fs, resolved);
        if (!parent || parent.type !== 'dir') return { output: `mkdir: cannot create directory '${target}': No such file or directory`, exitCode: 1 };
        parent.children[name] = { type: 'dir', children: {} };
      }
    }
    return '';
  }

  cmdRm(args) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const recursive = flags.includes('r') || flags.includes('R');
    const force = flags.includes('f');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) return { output: 'rm: missing operand', exitCode: 1 };
    for (const target of targets) {
      const resolved = normalizePath(target, this.cwd);
      if (resolved === '/') return { output: 'rm: it is dangerous to operate recursively on \'/\'', exitCode: 1 };
      const node = getNode(this.fs, resolved);
      if (!node) {
        if (force) continue;
        return { output: `rm: cannot remove '${target}': No such file or directory`, exitCode: 1 };
      }
      if (node.type === 'dir' && !recursive) return { output: `rm: cannot remove '${target}': Is a directory`, exitCode: 1 };
      const { parent, name } = getParent(this.fs, resolved);
      if (parent?.children) delete parent.children[name];
    }
    return '';
  }

  cmdCp(args) { return this.copyMove(args, false); }
  cmdMv(args) { return this.copyMove(args, true); }

  copyMove(args, isMove) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length < 2) return { output: `${isMove ? 'mv' : 'cp'}: missing destination file operand`, exitCode: 1 };
    const dest = targets.pop();
    const destPath = normalizePath(dest, this.cwd);
    const destNode = getNode(this.fs, destPath);
    const destIsDir = destNode?.type === 'dir';
    for (const src of targets) {
      const srcPath = normalizePath(src, this.cwd);
      const srcNode = getNode(this.fs, srcPath);
      if (!srcNode) return { output: `${isMove ? 'mv' : 'cp'}: cannot stat '${src}': No such file or directory`, exitCode: 1 };
      let finalDest = destPath;
      if (destIsDir) {
        const base = srcPath.split('/').filter(Boolean).pop();
        finalDest = `${destPath === '/' ? '' : destPath}/${base}`;
      }
      const { parent, name } = getParent(this.fs, finalDest);
      if (!parent || parent.type !== 'dir') return { output: `${isMove ? 'mv' : 'cp'}: cannot create '${dest}': No such file or directory`, exitCode: 1 };
      parent.children[name] = deepClone(srcNode);
      if (isMove) {
        const { parent: srcParent, name: srcName } = getParent(this.fs, srcPath);
        if (srcParent?.children) delete srcParent.children[srcName];
      }
    }
    return '';
  }

  cmdGrep(args) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const rest = args.filter((a) => !a.startsWith('-'));
    const pattern = rest.shift();
    if (!pattern) return { output: 'Usage: grep [options] PATTERN [FILE]...', exitCode: 2 };
    const insensitive = flags.includes('i');
    const lineNumbered = flags.includes('n');
    const matches = [];
    const matchLine = (line, source) => {
      const hit = insensitive ? line.toLowerCase().includes(pattern.toLowerCase()) : line.includes(pattern);
      if (hit) matches.push(lineNumbered ? `${source}:${matches.length + 1}:${line}` : (rest.length > 1 ? `${source}:${line}` : line));
    };
    if (rest.length === 0) {
      // stdin simulation: not supported
      return { output: 'grep: no input file provided (simulated shell)', exitCode: 2 };
    }
    for (const target of rest) {
      const node = getNode(this.fs, normalizePath(target, this.cwd));
      if (!node) return { output: `grep: ${target}: No such file or directory`, exitCode: 2 };
      if (node.type === 'dir') continue;
      node.content.split('\n').forEach((line) => matchLine(line, target));
    }
    return { output: matches.join('\n'), exitCode: matches.length > 0 ? 0 : 1 };
  }

  cmdWc(args) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) return { output: 'wc: missing operand', exitCode: 1 };
    const lines = targets.map((target) => {
      const node = getNode(this.fs, normalizePath(target, this.cwd));
      if (!node || node.type !== 'file') return `wc: ${target}: No such file or directory`;
      const text = node.content;
      const wc = text.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === '')).length || (text ? 1 : 0);
      const words = text.split(/\s+/).filter(Boolean).length;
      return `${String(wc).padStart(4)} ${String(words).padStart(4)} ${String(text.length).padStart(5)} ${target}`;
    });
    return lines.join('\n');
  }

  cmdFile(args) {
    return args.map((target) => {
      const node = getNode(this.fs, normalizePath(target, this.cwd));
      if (!node) return `${target}: cannot open (No such file or directory)`;
      if (node.type === 'dir') return `${target}: directory`;
      if (node.content.startsWith('#!')) return `${target}: Bourne-Again shell script, ASCII text executable`;
      if (node.content.trim().startsWith('{') || node.content.trim().startsWith('[')) return `${target}: JSON data`;
      if (node.content.includes('\n') || node.content.length > 0) return `${target}: ASCII text`;
      return `${target}: empty`;
    }).join('\n');
  }

  cmdChmod() { return { output: 'chmod: permissions updated (simulated)', exitCode: 0 }; }

  cmdFind(args) {
    const start = args.find((a) => !a.startsWith('-')) || '.';
    const nameIdx = args.indexOf('-name');
    const pattern = nameIdx >= 0 ? args[nameIdx + 1] : null;
    const base = normalizePath(start, this.cwd);
    const results = [];
    const walk = (node, path) => {
      if (!node) return;
      if (node.type === 'dir') {
        if (!pattern || matchGlob(pattern, path.split('/').pop() || '/')) results.push(path);
        for (const [name, child] of Object.entries(node.children)) {
          walk(child, path === '/' ? `/${name}` : `${path}/${name}`);
        }
      } else if (!pattern || matchGlob(pattern, path.split('/').pop())) {
        results.push(path);
      }
    };
    walk(getNode(this.fs, base), base);
    return results.join('\n');
  }

  // ---------- identity / system ----------

  cmdWhoami() { return this.user; }
  cmdId() { return `uid=1000(${this.user}) gid=1000(${this.user}) groups=1000(${this.user}),27(sudo),1001(labusers)`; }
  cmdHostname() { return this.hostname; }
  cmdUname(args) {
    if (args.includes('-a')) return `Linux ${this.hostname} 6.8.0-cyberita #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux (simulated)`;
    return 'Linux';
  }
  cmdDate() { return new Date().toString(); }
  cmdHistory() { return this.history.map((line, i) => `${String(i + 1).padStart(4)}  ${line}`).join('\n'); }
  cmdEnv() {
    return [
      `USER=${this.user}`, `HOME=/home/student`, `SHELL=/bin/bash`, `PWD=${this.cwd}`,
      `LANG=en_US.UTF-8`, `TERM=xterm-256color`, `HOSTNAME=${this.hostname}`,
    ].join('\n');
  }
  cmdWhich(args) {
    const known = ['ls', 'cat', 'grep', 'ping', 'nmap', 'apt', 'curl', 'python3', 'sudo', 'systemctl'];
    return args.map((a) => (known.includes(a) ? `/usr/bin/${a}` : '')).filter(Boolean).join('\n');
  }
  cmdMan(args) {
    if (!args[0]) return 'What manual page do you want?';
    return `${args[0].toUpperCase()}(1) — simulated manual page.\nSee the lab instructions for the expected usage of this command.`;
  }
  cmdLsbRelease() {
    return 'Distributor ID:\tCyberITA\nDescription:\tCyberITA Linux 1.0 (Mock Lab)\nRelease:\t1.0\nCodename:\tcyberita';
  }

  // ---------- processes / resources ----------

  cmdPs() {
    const rows = [
      'USER         PID %CPU MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
      'root           1  0.0  0.2  16844  9216 ?        Ss   09:00   0:02 /sbin/init',
      'root         342  0.0  0.1  12488  6144 ?        Ss   09:00   0:00 /usr/sbin/sshd -D',
      'www-data     731  0.3  1.4 149210 58210 ?        S    09:01   0:11 nginx: master process /usr/sbin/nginx',
      'student     1024  0.0  0.0  10852  4224 pts/0    Ss   10:12   0:00 -bash',
      'student     1107  0.0  0.0   9024  3120 pts/0    R+   10:15   0:00 ps aux',
    ];
    return rows.join('\n');
  }
  cmdTop() {
    return [
      `top - ${new Date().toLocaleTimeString()} up 1:15,  1 user,  load average: 0.08, 0.12, 0.10`,
      'Tasks:  92 total,   1 running,  91 sleeping',
      '%Cpu(s):  2.4 us,  0.8 sy,  0.0 ni, 96.5 id',
      'MiB Mem :   3921.0 total,   1845.2 free,   1102.4 used,    973.4 buff/cache',
      '',
      '  PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND',
      '  731 www-data  20   0  149210  58210   1.7   1.5   0:11.42 nginx',
      '  342 root      20   0   12488   6144   0.0   0.2   0:00.31 sshd',
      ' 1107 student   20   0    9024   3120   0.0   0.1   0:00.02 top',
    ].join('\n');
  }
  cmdDf() {
    return [
      'Filesystem      Size  Used Avail Use% Mounted on',
      'overlay          40G  5.2G   33G  14% /',
      'tmpfs            64M     0   64M   0% /dev',
      'tmpfs           3.9G     0  3.9G   0% /dev/shm',
      '/dev/sda1       100G   42G   53G  45% /data',
    ].join('\n');
  }
  cmdFree() {
    return [
      '               total        used        free      shared  buff/cache   available',
      'Mem:            3921        1102        1845          12         973        2480',
      'Swap:           2047           0        2047',
    ].join('\n');
  }
  cmdUptime() {
    return ` ${new Date().toLocaleTimeString()} up 1:15,  1 user,  load average: 0.08, 0.12, 0.10`;
  }

  // ---------- network ----------

  cmdIfconfig() {
    return [
      'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
      '        inet 10.0.15.42  netmask 255.255.255.0  broadcast 10.0.15.255',
      '        inet6 fe80::20c:29ff:fe4f:9a71  prefixlen 64  scopeid 0x20<link>',
      '        ether 00:0c:29:4f:9a:71  (Ethernet)',
      '        RX packets 15240  bytes 18429102 (18.4 MB)',
      '        TX packets 8421  bytes 1240921 (1.2 MB)',
      '',
      'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
      '        inet 127.0.0.1  netmask 255.0.0.0',
    ].join('\n');
  }
  cmdIp(args) {
    if (args[0] === 'addr' || args[0] === 'a') return this.cmdIfconfig();
    if (args[0] === 'route' || args[0] === 'r') {
      return ['default via 10.0.15.1 dev eth0 proto static', '10.0.15.0/24 dev eth0 proto kernel scope link src 10.0.15.42'].join('\n');
    }
    return { output: 'Usage: ip addr|route', exitCode: 1 };
  }
  cmdPing(args) {
    const target = args.find((a) => !a.startsWith('-')) || 'localhost';
    const countIdx = args.indexOf('-c');
    const count = countIdx >= 0 ? Math.min(Number(args[countIdx + 1]) || 3, 10) : 3;
    const ip = fakeIpFor(target);
    const lines = [`PING ${target} (${ip}) 56(84) bytes of data.`];
    for (let i = 1; i <= count; i += 1) {
      lines.push(`64 bytes from ${target} (${ip}): icmp_seq=${i} ttl=64 time=${(0.4 + i * 0.13).toFixed(3)} ms`);
    }
    lines.push('', `--- ${target} ping statistics ---`);
    lines.push(`${count} packets transmitted, ${count} received, 0% packet loss`);
    return lines.join('\n');
  }
  cmdTraceroute(args) {
    const target = args.find((a) => !a.startsWith('-')) || 'example.com';
    const hops = [' 1  gateway (10.0.15.1)  0.543 ms', ' 2  10.20.0.1  2.110 ms', ` 3  ${target} (${fakeIpFor(target)})  8.442 ms`];
    return [`traceroute to ${target}, 30 hops max`, ...hops].join('\n');
  }
  cmdNetstat(args) {
    const listening = [
      'Active Internet connections (only servers)',
      'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name',
      'tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      342/sshd',
      'tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      731/nginx',
      'tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN      731/nginx',
      'tcp6       0      0 :::5432                 :::*                    LISTEN      612/postgres',
      'udp        0      0 0.0.0.0:68              0.0.0.0:*                           512/dhclient',
    ];
    return listening.join('\n');
  }
  cmdCurl(args) {
    const target = args.find((a) => !a.startsWith('-')) || 'http://localhost';
    if (target.includes('404')) return { output: 'curl: (22) The requested URL returned error: 404', exitCode: 22 };
    return `<!DOCTYPE html>
<html><head><title>Service Online</title></head>
<body><h1>OK</h1><p>Simulated response from ${target}</p></body></html>`;
  }
  cmdNmap(args) {
    const target = args.find((a) => !a.startsWith('-') && !/^\d+$/.test(a)) || args[0] || 'localhost';
    const lines = [
      'Starting Nmap 7.94 ( https://nmap.org ) at ' + new Date().toUTCString(),
      'Nmap scan report for ' + target + ` (${fakeIpFor(target)})`,
      'Host is up (0.00042s latency).',
      'Not shown: 996 closed tcp ports',
      'PORT     STATE SERVICE',
      '22/tcp   open  ssh',
      '80/tcp   open  http',
      '443/tcp  open  https',
      '3306/tcp open  mysql',
      '',
      'Nmap done: 1 IP address (1 host up) scanned in 2.31 seconds',
    ];
    return lines.join('\n');
  }

  // ---------- packages / services / sudo ----------

  cmdApt(args) {
    const sub = args[0] || '';
    if (sub === 'update') {
      return [
        'Hit:1 http://archive.cyberita.local/ubuntu InRelease',
        'Reading package lists... Done',
        'All packages are up to date.',
      ].join('\n');
    }
    if (sub === 'install' || sub === 'upgrade') {
      const pkgs = args.slice(1).filter((a) => !a.startsWith('-'));
      if (pkgs.length === 0) return { output: 'E: Operands must specify packages', exitCode: 100 };
      return [
        'Reading package lists... Done',
        'Building dependency tree... Done',
        `The following NEW packages will be installed:\n  ${pkgs.join(' ')}`,
        '0 upgraded, ' + pkgs.length + ' newly installed, 0 to remove and 0 not upgraded.',
        'Need to get 1,204 kB of archives.',
        `Get:1 http://archive.cyberita.local ${pkgs[0]} [1,204 kB]`,
        'Selecting previously unselected package.',
        `Unpacking ${pkgs.join(' ')} ...`,
        `Setting up ${pkgs.join(' ')} ...`,
        'Processing triggers for man-db ...',
      ].join('\n');
    }
    if (sub === 'list' || sub === 'search') return 'Listing... Done\nsimulated-package 1.0 amd64';
    return { output: `E: Invalid operation: ${sub || '(none)'}`, exitCode: 100 };
  }

  cmdSystemctl(args) {
    const action = args[0];
    const unit = args[1] || 'service';
    if (!action) return { output: 'UNIT                     LOAD   ACTIVE SUB     DESCRIPTION', exitCode: 0 };
    if (action === 'status' || action === 'is-active') {
      const active = !unit.includes('fail');
      return [
        `● ${unit}.service - Simulated service`,
        `   Loaded: loaded (/lib/systemd/system/${unit}.service; enabled; vendor preset: enabled)`,
        `   Active: ${active ? 'active (running) since Mon 2026-10-20 09:00:11 UTC; 1h ago' : 'inactive (dead)'}`,
        '  Process: 812 ExecStart=/usr/bin/simulated (code=exited, status=0/SUCCESS)',
        ' Main PID: 813 (simulated)',
      ].join('\n');
    }
    if (action === 'start' || action === 'stop' || action === 'restart' || action === 'enable' || action === 'disable') {
      return `${action === 'enable' || action === 'disable' ? '' : action === 'stop' ? 'Removed symlink' : ''}${action} ${unit} (simulated) — done.`;
    }
    return { output: `Unknown command verb ${action}.`, exitCode: 1 };
  }

  cmdSudo(args) {
    if (args.length === 0) return { output: 'usage: sudo [-u user] command', exitCode: 1 };
    const [maybeUser, ...rest] = args;
    let inner = args;
    if ((maybeUser === '-u') && rest.length >= 2) inner = rest.slice(1);
    else if (maybeUser.startsWith('-')) inner = args.slice(1);
    else if (rest.length > 0) inner = rest;
    const command = inner.join(' ');
    if (!command) return { output: 'usage: sudo command', exitCode: 1 };
    return {
      output: `[sudo] password for ${this.user}:\nsudo: password accepted (simulation) — running as root\n${command}`,
      exitCode: 0,
      events: [{ type: 'sudo', command }],
    };
  }

  cmdExit() {
    return { output: 'exit (simulated session continues)', exitCode: 0, events: [{ type: 'exit' }] };
  }

  // ---------- redirection ----------

  applyRedirection(redirection, content) {
    const node = getNode(this.fs, redirection.path);
    if (node && node.type === 'dir') {
      redirection.ok = false;
      redirection.error = `bash: ${redirection.raw}: Is a directory`;
      return false;
    }
    const { parent, name } = getParent(this.fs, redirection.path);
    if (!parent || parent.type !== 'dir') {
      redirection.ok = false;
      redirection.error = `bash: ${redirection.raw}: No such file or directory`;
      return false;
    }
    if (redirection.append && parent.children[name]) {
      parent.children[name].content += content + (content.endsWith('\n') || content === '' ? '' : '\n');
    } else {
      parent.children[name] = { type: 'file', content: content + (content.endsWith('\n') || content === '' ? '' : '\n'), mode: 'rw-r--r--' };
    }
    redirection.ok = true;
    return true;
  }

  snapshot() {
    return { fsState: deepClone(this.fs), cwd: this.cwd, history: [...this.history] };
  }
}

function fakeIpFor(target) {
  if (target === 'localhost' || target === '127.0.0.1') return '127.0.0.1';
  let hash = 0;
  for (const ch of String(target)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `93.184.${(hash >> 8) % 256}.${(hash & 255) || 1}`;
}

function matchGlob(pattern, value) {
  const regex = new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return regex.test(value);
}

/** Parses a command line into command, argv and redirection target. */
export function parseLine(line) {
  let rest = line;
  let redirection = null;
  const redirectMatch = rest.match(/\s(>>?)\s*(\S+)\s*$/);
  if (redirectMatch) {
    redirection = { operator: redirectMatch[1], path: normalizePath(redirectMatch[2], '/home/student'), raw: redirectMatch[2], append: redirectMatch[1] === '>>', ok: false };
    rest = rest.slice(0, redirectMatch.index);
  }
  const tokens = tokenize(rest);
  const cmd = tokens[0];
  const args = tokens.slice(1);
  return { cmd, args, redirection };
}

function tokenize(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

export default MockShell;
