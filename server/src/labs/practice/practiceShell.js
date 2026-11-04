import crypto from 'node:crypto';
import {
  defaultFs,
  normalizePath,
  getNode,
  getParent,
  listDir,
  deepClone,
  ensureDir,
  writeFile,
} from './virtualFs.js';

const HOME = '/home/student';
const DEFAULT_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

/* ------------------------------------------------------------------ */
/* permission helpers                                                  */
/* ------------------------------------------------------------------ */

function toOctal(mode) {
  const value = String(mode || '');
  if (/^[0-7]{3,4}$/.test(value)) return value.slice(-3);
  let octal = '';
  for (let index = 0; index < 3; index += 1) {
    const trio = value.slice(index * 3, index * 3 + 3).padEnd(3, '-');
    octal += String((trio[0] === 'r' ? 4 : 0) + (trio[1] === 'w' ? 2 : 0) + (trio[2] !== '-' && trio[2] ? 1 : 0));
  }
  return octal;
}

function fromOctal(octal) {
  return String(octal)
    .slice(-3)
    .padStart(3, '0')
    .split('')
    .map((digit) => {
      const value = Number(digit) || 0;
      return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`;
    })
    .join('');
}

function typeChar(node) {
  if (!node) return '-';
  if (node.type === 'dir') return 'd';
  if (node.type === 'link') return 'l';
  return '-';
}

function nodeMode(node) {
  if (node?.mode) return node.mode;
  return node?.type === 'dir' ? 'rwxr-xr-x' : 'rw-r--r--';
}

function symbolicMode(node) {
  return `${typeChar(node)}${nodeMode(node)}`;
}

function nodeSize(node) {
  if (!node) return 0;
  if (node.type === 'file') return Buffer.byteLength(node.content || '', 'utf8');
  if (node.type === 'dir') return 4096;
  return 0;
}

/* ------------------------------------------------------------------ */
/* command line parsing                                                */
/* ------------------------------------------------------------------ */

/**
 * Tokenises a shell line, keeping quotes out of the values and preserving
 * the operators we support (`&&`, `||`, `;`, `|`, `>`, `>>`).
 */
function lex(line) {
  const tokens = [];
  let current = '';
  let quote = null;
  let started = false;
  let index = 0;

  const push = () => {
    if (started) tokens.push({ type: 'word', value: current });
    current = '';
    started = false;
  };

  while (index < line.length) {
    const char = line[index];

    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"' && index + 1 < line.length) {
        current += line[index + 1];
        index += 1;
      } else current += char;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      index += 1;
      continue;
    }

    if (char === '\\' && index + 1 < line.length) {
      current += line[index + 1];
      started = true;
      index += 2;
      continue;
    }

    if (/\s/.test(char)) {
      push();
      index += 1;
      continue;
    }

    if (char === '|' && line[index + 1] === '|') {
      push();
      tokens.push({ type: 'op', value: '||' });
      index += 2;
      continue;
    }
    if (char === '&' && line[index + 1] === '&') {
      push();
      tokens.push({ type: 'op', value: '&&' });
      index += 2;
      continue;
    }
    if (char === '|') {
      push();
      tokens.push({ type: 'op', value: '|' });
      index += 1;
      continue;
    }
    if (char === ';') {
      push();
      tokens.push({ type: 'op', value: ';' });
      index += 1;
      continue;
    }
    if (char === '>' && line[index + 1] === '>') {
      push();
      tokens.push({ type: 'op', value: '>>' });
      index += 2;
      continue;
    }
    if (char === '>') {
      push();
      tokens.push({ type: 'op', value: '>' });
      index += 1;
      continue;
    }

    current += char;
    started = true;
    index += 1;
  }

  push();
  return tokens;
}

/** Groups tokens into commands (&& / || / ;) and pipelines. */
function parseLine(line) {
  const tokens = lex(line);
  const commands = [];
  let command = { op: ';', stages: [] };
  let stage = { argv: [], redirect: null };
  let pendingRedirect = null;

  const flushStage = () => {
    if (stage.argv.length === 0 && !stage.redirect) return;
    command.stages.push(stage);
    stage = { argv: [], redirect: null };
  };

  const flushCommand = () => {
    flushStage();
    if (command.stages.length > 0) commands.push(command);
    command = { op: ';', stages: [] };
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'word') {
      if (pendingRedirect) {
        stage.redirect = { operator: pendingRedirect, target: token.value };
        pendingRedirect = null;
      } else {
        stage.argv.push(token.value);
      }
      continue;
    }

    if (token.value === '>' || token.value === '>>') {
      pendingRedirect = token.value;
      continue;
    }

    if (token.value === '|') {
      if (pendingRedirect) {
        stage.redirect = { operator: pendingRedirect, target: '' };
        pendingRedirect = null;
      }
      flushStage();
      continue;
    }

    if (token.value === '&&' || token.value === '||' || token.value === ';') {
      flushCommand();
      command.op = token.value;
    }
  }

  if (pendingRedirect) stage.redirect = { operator: pendingRedirect, target: '' };
  flushCommand();

  return commands;
}

/* ------------------------------------------------------------------ */
/* shell                                                               */
/* ------------------------------------------------------------------ */

export class PracticeShell {
  constructor({ fsState, cwd = HOME, welcome = '', hostname = 'cyberita-lab', user = 'student' } = {}) {
    const state = fsState && typeof fsState === 'object' ? fsState : {};
    // Keep the `{ '/': node }` wrapper: the helpers in virtualFs.js resolve
    // paths from fs['/'] exactly like the serialised session state.
    this.fs = state['/'] ? deepClone(state) : defaultFs();
    this.fsMeta = {
      shellUser: state.shellUser || user,
      hostname: state.hostname || hostname,
      studentName: state.studentName || '',
      studentId: state.studentId || '',
    };
    this.cwd = this.fsMeta.shellUser && !cwd ? HOME : cwd || HOME;
    this.hostname = this.fsMeta.hostname;
    this.user = this.fsMeta.shellUser || user;
    this.history = [];
    this.welcome = welcome;
  }

  banner() {
    return [
      this.welcome,
      'CyberITA+ practice terminal — a simulated Ubuntu shell that runs in-process.',
      'Type "help" for the command reference, "exit" to leave the practice prompt.',
      '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** JSON-serialisable state persisted in lab_sessions.fs_state. */
  snapshot() {
    // PostgreSQL JSONB refuses `\u0000` escapes, so strip NUL bytes from
    // anything a learner could have written into a file.
    return stripNul({
      ...this.fsMeta,
      ...this.fs,
      shellUser: this.user,
      hostname: this.hostname,
    });
  }

  /** Executes a command line. Never throws. */
  execute(commandLine, { onOutput } = {}) {
    const raw = String(commandLine ?? '').trim();
    const events = [];
    if (!raw) return { output: '', exitCode: 0, cwd: this.cwd, fsState: this.snapshot(), events };

    this.history.push(raw);
    if (this.history.length > 200) this.history = this.history.slice(-200);

    const result = this.runLine(raw);
    events.push(...(result.events || []));
    const output = result.output || '';
    if (typeof onOutput === 'function' && output) {
      try { onOutput(output); } catch { /* ignore */ }
    }
    return { output, exitCode: result.exitCode, cwd: this.cwd, fsState: this.snapshot(), events };
  }

  /** Runs a line for `sudo`, sharing the same state but not the history. */
  runLine(raw) {
    const commands = parseLine(raw);
    if (commands.length === 0) return { output: '', exitCode: 0, events: [] };

    const outputs = [];
    const events = [];
    let previousCode = 0;
    let skip = false;

    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      if (index > 0) {
        if (command.op === '&&' && previousCode !== 0) skip = true;
        else if (command.op === '||' && previousCode === 0) skip = true;
        else skip = false;
      }
      if (skip) continue;

      const result = this.runPipeline(command.stages);
      previousCode = result.exitCode;
      events.push(...(result.events || []));
      if (!result.redirected && result.output !== '') outputs.push(result.output);
      if (result.clear) events.push({ type: 'clear' });
    }

    return { output: outputs.join('\n'), exitCode: previousCode, events };
  }

  runPipeline(stages) {
    let stdin = null;
    let last = { output: '', exitCode: 0, events: [] };

    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      const isLast = index === stages.length - 1;
      const result = this.runStage(stage, stdin);
      last = result;

      if (isLast && stage.redirect) {
        const redirect = this.applyRedirect(stage.redirect, result.output);
        return {
          output: redirect.ok ? '' : redirect.error,
          exitCode: redirect.ok ? result.exitCode : 1,
          events: result.events,
          redirected: redirect.ok,
        };
      }

      stdin = result.output;
    }

    return { ...last, redirected: false };
  }

  runStage(stage, stdin) {
    // Bash expands a leading unquoted `~` before the command sees it, so
    // `wc -l ~/file` prints the expanded path. Mirror that here.
    const expanded = stage.argv.map((arg) =>
      arg === '~' ? HOME : arg.startsWith('~/') ? `${HOME}${arg.slice(1)}` : arg
    );
    const [cmd, ...args] = expanded;
    if (!cmd) return { output: '', exitCode: 0, events: [] };

    const handler = this.resolve(cmd);
    if (!handler) {
      return { output: `bash: ${cmd}: command not found`, exitCode: 127, events: [] };
    }

    try {
      const result = handler.call(this, args, { stdin, raw: expanded.join(' ') });
      if (result && typeof result === 'object' && 'output' in result) {
        return {
          output: result.output == null ? '' : String(result.output),
          exitCode: Number.isFinite(result.exitCode) ? result.exitCode : 0,
          events: result.events || [],
          clear: Boolean(result.clear),
        };
      }
      return { output: result == null ? '' : String(result), exitCode: 0, events: [] };
    } catch (error) {
      return { output: `bash: ${cmd}: ${error.message}`, exitCode: 1, events: [] };
    }
  }

  applyRedirect(redirection, content) {
    if (!redirection.target) return { ok: false, error: 'bash: syntax error near unexpected token `newline\'' };
    const resolved = normalizePath(redirection.target, this.cwd);
    const existing = getNode(this.fs, resolved);
    if (existing?.type === 'dir') {
      return { ok: false, error: `bash: ${redirection.target}: Is a directory` };
    }
    const { parent, name } = getParent(this.fs, resolved);
    if (!parent || parent.type !== 'dir') {
      return { ok: false, error: `bash: ${redirection.target}: No such file or directory` };
    }
    if (existing?.type === 'link') {
      return { ok: false, error: `bash: ${redirection.target}: Too many levels of symbolic links` };
    }

    const text = content == null ? '' : String(content);
    const payload = text === '' || text.endsWith('\n') ? text : `${text}\n`;

    if (redirection.operator === '>>' && existing?.type === 'file') {
      existing.content += payload;
    } else {
      const node = existing?.type === 'file' ? existing : { type: 'file', mode: 'rw-r--r--', owner: this.user };
      node.content = payload;
      parent.children[name] = node;
    }
    return { ok: true };
  }

  /* ---------------------------------------------------------------- */
  /* command table                                                     */
  /* ---------------------------------------------------------------- */

  resolve(cmd) {
    const map = {
      help: this.cmdHelp,
      '?': this.cmdHelp,
      pwd: this.cmdPwd,
      cd: this.cmdCd,
      ls: this.cmdLs,
      dir: this.cmdLs,
      cat: this.cmdCat,
      less: this.cmdCat,
      more: this.cmdCat,
      head: this.cmdHead,
      tail: this.cmdTail,
      echo: this.cmdEcho,
      printf: this.cmdEcho,
      touch: this.cmdTouch,
      mkdir: this.cmdMkdir,
      rmdir: this.cmdRm,
      rm: this.cmdRm,
      cp: this.cmdCp,
      mv: this.cmdMv,
      grep: this.cmdGrep,
      egrep: this.cmdGrep,
      wc: this.cmdWc,
      file: this.cmdFile,
      chmod: this.cmdChmod,
      chown: this.cmdChown,
      find: this.cmdFind,
      tree: this.cmdTree,
      stat: this.cmdStat,
      sha256sum: this.cmdSha256,
      sha1sum: this.cmdSha1,
      md5sum: this.cmdMd5,
      base64: this.cmdBase64,
      awk: this.cmdAwk,
      gawk: this.cmdAwk,
      sort: this.cmdSort,
      uniq: this.cmdUniq,
      cut: this.cmdCut,
      tr: this.cmdTr,
      sed: this.cmdSed,
      whoami: this.cmdWhoami,
      id: this.cmdId,
      groups: this.cmdGroups,
      hostname: this.cmdHostname,
      uname: this.cmdUname,
      date: this.cmdDate,
      history: this.cmdHistory,
      env: this.cmdEnv,
      printenv: this.cmdEnv,
      ps: this.cmdPs,
      pgrep: this.cmdPgrep,
      pkill: this.cmdKill,
      kill: this.cmdKill,
      top: this.cmdTop,
      df: this.cmdDf,
      du: this.cmdDu,
      free: this.cmdFree,
      uptime: this.cmdUptime,
      nproc: this.cmdNproc,
      ifconfig: this.cmdIfconfig,
      ip: this.cmdIp,
      ping: this.cmdPing,
      traceroute: this.cmdTraceroute,
      netstat: this.cmdNetstat,
      ss: this.cmdSs,
      curl: this.cmdCurl,
      wget: this.cmdCurl,
      nmap: this.cmdNmap,
      getent: this.cmdGetent,
      apt: this.cmdApt,
      'apt-get': this.cmdApt,
      systemctl: this.cmdSystemctl,
      service: this.cmdSystemctl,
      sudo: this.cmdSudo,
      sleep: this.cmdSleep,
      which: this.cmdWhich,
      command: this.cmdWhich,
      man: this.cmdMan,
      lsb_release: this.cmdLsbRelease,
      clear: this.cmdClear,
      cls: this.cmdClear,
      exit: this.cmdExit,
      logout: this.cmdExit,
      true: () => '',
      false: () => ({ output: '', exitCode: 1 }),
    };
    return map[cmd];
  }

  /* ---------------------------------------------------------------- */
  /* filesystem                                                        */
  /* ---------------------------------------------------------------- */

  cmdHelp() {
    return [
      'CyberITA+ practice shell — supported commands',
      '',
      '  Files      pwd  cd  ls  cat  head  tail  touch  mkdir  rm  cp  mv  find  tree',
      '  Inspect    stat  file  wc  du  df  tree  which  man',
      '  Text       echo  grep  awk  sort  uniq  cut  tr  sed',
      '  Integrity  sha256sum  sha1sum  md5sum  base64',
      '  System     whoami  id  groups  uname  hostname  date  uptime  nproc  ps  pgrep  top  free  env  history',
      '  Network    ip  ifconfig  ping  traceroute  ss  netstat  curl  wget  nmap  getent',
      '  Services   apt  apt-get  systemctl  service  sudo',
      '  Session    clear  exit',
      '',
      'Pipelines (|), redirection (> and >>), and && / ; chaining are supported.',
      'Everything runs in a private, in-process filesystem — no container and no network traffic.',
    ].join('\n');
  }

  cmdPwd() {
    return this.cwd;
  }

  cmdCd(args) {
    const target = args.find((arg) => !arg.startsWith('-')) || '~';
    const resolved = normalizePath(target, this.cwd);
    const node = getNode(this.fs, resolved);
    if (!node) return { output: `bash: cd: ${target}: No such file or directory`, exitCode: 1 };
    if (node.type !== 'dir') return { output: `bash: cd: ${target}: Not a directory`, exitCode: 1 };
    this.cwd = resolved;
    return '';
  }

  cmdLs(args) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const showAll = flags.includes('a') || flags.includes('A');
    const long = flags.includes('l');
    const human = flags.includes('h');
    const targets = args.filter((arg) => !arg.startsWith('-'));
    const list = targets.length > 0 ? targets : ['.'];
    const blocks = [];

    for (const target of list) {
      const resolved = normalizePath(target, this.cwd);
      const node = getNode(this.fs, resolved);
      if (!node) {
        blocks.push(`ls: cannot access '${target}': No such file or directory`);
        continue;
      }

      if (node.type !== 'dir') {
        blocks.push(long ? this.formatLong(node, target, '') : target);
        continue;
      }

      let entries = listDir(node);
      if (!showAll) entries = entries.filter((entry) => !entry.name.startsWith('.'));
      if (showAll) {
        entries = [
          { name: '.', type: 'dir', size: 4096, mode: nodeMode(node), owner: node.owner || 'root' },
          { name: '..', type: 'dir', size: 4096, mode: 'rwxr-xr-x', owner: 'root' },
          ...entries,
        ];
      }

      const showHeader = list.length > 1;
      if (entries.length === 0) {
        blocks.push(showHeader ? `${target}:` : '');
        continue;
      }

      if (long) {
        const rows = entries.map((entry) => {
          const child = entry.name === '.' || entry.name === '..' ? null : node.children[entry.name];
          return this.formatLong(child || entry, entry.name, '', { entry, human });
        });
        blocks.push(`${showHeader ? `${target}:\n` : ''}total ${Math.max(4, entries.length * 4)}\n${rows.join('\n')}`);
      } else {
        const row = entries.map((entry) => `${entry.name}${entry.type === 'dir' ? '/' : ''}`).join('  ');
        blocks.push(showHeader ? `${target}:\n${row}` : row);
      }
    }

    return { output: blocks.filter((block) => block !== '').join('\n\n'), exitCode: blocks.some((b) => b.startsWith('ls:')) ? 2 : 0 };
  }

  formatLong(node, name, prefix, { entry = null, human = false } = {}) {
    if (entry) {
      const size = human ? humanSize(entry.size) : String(entry.size);
      const mode = entry.type === 'link' ? `l${entry.mode}` : `${entry.type === 'dir' ? 'd' : '-'}${entry.mode}`;
      const suffix = entry.type === 'dir' ? '/' : '';
      return `${mode} 1 ${entry.owner || 'root'} ${entry.owner || 'root'} ${size.padStart(6)} Oct 20 10:00 ${name}${suffix}`;
    }
    const size = human ? humanSize(nodeSize(node)) : String(nodeSize(node));
    return `${symbolicMode(node)} 1 ${node.owner || 'root'} ${node.owner || 'root'} ${size.padStart(6)} Oct 20 10:00 ${name}`;
  }

  cmdCat(args, { stdin } = {}) {
    if (args.length === 0) return { output: stdin ?? '', exitCode: 0 };
    const parts = [];
    let code = 0;
    for (const target of args) {
      const node = getNode(this.fs, normalizePath(target, this.cwd));
      if (!node) {
        parts.push(`cat: ${target}: No such file or directory`);
        code = 1;
        continue;
      }
      if (node.type === 'dir') {
        parts.push(`cat: ${target}: Is a directory`);
        code = 1;
        continue;
      }
      if (node.type === 'link') {
        parts.push(node.target || '');
        continue;
      }
      parts.push(node.content.replace(/\n$/, ''));
    }
    return { output: parts.join('\n'), exitCode: code };
  }

  cmdHead(args, { stdin } = {}) {
    return this.sliceFile(args, 'head', stdin);
  }

  cmdTail(args, { stdin } = {}) {
    return this.sliceFile(args, 'tail', stdin);
  }

  sliceFile(args, mode, stdin) {
    let count = 10;
    const rest = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-n' || args[index] === '-c') {
        count = Number(args[index + 1]) || 10;
        index += 1;
      } else if (/^-\d+$/.test(args[index])) {
        count = Number(args[index].slice(1));
      } else if (/^-n\d+$/.test(args[index])) {
        count = Number(args[index].slice(2));
      } else {
        rest.push(args[index]);
      }
    }

    let content;
    if (rest[0]) {
      const node = getNode(this.fs, normalizePath(rest[0], this.cwd));
      if (!node || node.type === 'dir') {
        return { output: `${mode}: cannot open '${rest[0]}' for reading: No such file or directory`, exitCode: 1 };
      }
      content = node.type === 'link' ? '' : node.content;
    } else if (stdin != null) {
      content = stdin;
    } else {
      return { output: `${mode}: missing file operand`, exitCode: 1 };
    }

    const lines = String(content).split('\n').filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
    const selected = mode === 'head' ? lines.slice(0, count) : lines.slice(-count);
    return selected.join('\n');
  }

  expandVariables(value) {
    const env = {
      USER: this.user,
      LOGNAME: this.user,
      HOME,
      PWD: this.cwd,
      HOSTNAME: this.hostname,
      SHELL: '/bin/bash',
      PATH: DEFAULT_PATH,
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
    };
    return String(value).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, braced, plain) => {
      const key = braced || plain;
      return Object.prototype.hasOwnProperty.call(env, key) ? env[key] : '';
    });
  }

  cmdEcho(args) {
    const values = [...args];
    let newline = true;
    if (values[0] === '-n') {
      newline = false;
      values.shift();
    }
    const text = this.expandVariables(values.join(' '));
    return newline ? text : { output: text, exitCode: 0 };
  }

  cmdTouch(args) {
    const targets = args.filter((arg) => !arg.startsWith('-'));
    if (targets.length === 0) return { output: 'touch: missing file operand', exitCode: 1 };
    for (const target of targets) {
      const resolved = normalizePath(target, this.cwd);
      const existing = getNode(this.fs, resolved);
      if (existing) continue;
      const { parent, name } = getParent(this.fs, resolved);
      if (!parent || parent.type !== 'dir') {
        return { output: `touch: cannot touch '${target}': No such file or directory`, exitCode: 1 };
      }
      parent.children[name] = { type: 'file', content: '', mode: 'rw-r--r--', owner: this.user };
    }
    return '';
  }

  cmdMkdir(args) {
    const recursive = args.some((arg) => arg.startsWith('-') && arg.includes('p'));
    const targets = args.filter((arg) => !arg.startsWith('-'));
    if (targets.length === 0) return { output: 'mkdir: missing operand', exitCode: 1 };
    for (const target of targets) {
      const resolved = normalizePath(target, this.cwd);
      const existing = getNode(this.fs, resolved);
      if (existing) {
        if (recursive) continue;
        return { output: `mkdir: cannot create directory '${target}': File exists`, exitCode: 1 };
      }
      if (recursive) {
        if (!ensureDir(this.fs, resolved)) {
          return { output: `mkdir: cannot create directory '${target}': Not a directory`, exitCode: 1 };
        }
      } else {
        const { parent, name } = getParent(this.fs, resolved);
        if (!parent || parent.type !== 'dir') {
          return { output: `mkdir: cannot create directory '${target}': No such file or directory`, exitCode: 1 };
        }
        parent.children[name] = { type: 'dir', children: {}, mode: 'rwxr-xr-x', owner: this.user };
      }
    }
    return '';
  }

  cmdRm(args) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const recursive = flags.includes('r') || flags.includes('R');
    const force = flags.includes('f');
    const targets = args.filter((arg) => !arg.startsWith('-'));
    if (targets.length === 0) return { output: 'rm: missing operand', exitCode: 1 };
    for (const target of targets) {
      const resolved = normalizePath(target, this.cwd);
      if (resolved === '/') {
        return { output: "rm: it is dangerous to operate recursively on '/'", exitCode: 1 };
      }
      const node = getNode(this.fs, resolved);
      if (!node) {
        if (force) continue;
        return { output: `rm: cannot remove '${target}': No such file or directory`, exitCode: 1 };
      }
      if (node.type === 'dir' && !recursive) {
        return { output: `rm: cannot remove '${target}': Is a directory`, exitCode: 1 };
      }
      const { parent, name } = getParent(this.fs, resolved);
      if (parent?.children) delete parent.children[name];
    }
    return '';
  }

  cmdCp(args) {
    return this.copyMove(args, false);
  }

  cmdMv(args) {
    return this.copyMove(args, true);
  }

  copyMove(args, isMove) {
    const targets = args.filter((arg) => !arg.startsWith('-'));
    if (targets.length < 2) return { output: `${isMove ? 'mv' : 'cp'}: missing destination file operand`, exitCode: 1 };
    const destination = targets.pop();
    const destinationPath = normalizePath(destination, this.cwd);
    const destinationNode = getNode(this.fs, destinationPath);
    const destinationIsDir = destinationNode?.type === 'dir';

    for (const source of targets) {
      const sourcePath = normalizePath(source, this.cwd);
      const sourceNode = getNode(this.fs, sourcePath);
      if (!sourceNode) return { output: `${isMove ? 'mv' : 'cp'}: cannot stat '${source}': No such file or directory`, exitCode: 1 };
      let finalDestination = destinationPath;
      if (destinationIsDir) {
        const base = sourcePath.split('/').filter(Boolean).pop();
        finalDestination = `${destinationPath === '/' ? '' : destinationPath}/${base}`;
      }
      const { parent, name } = getParent(this.fs, finalDestination);
      if (!parent || parent.type !== 'dir') {
        return { output: `${isMove ? 'mv' : 'cp'}: cannot create '${destination}': No such file or directory`, exitCode: 1 };
      }
      parent.children[name] = deepClone(sourceNode);
      if (isMove) {
        const { parent: sourceParent, name: sourceName } = getParent(this.fs, sourcePath);
        if (sourceParent?.children) delete sourceParent.children[sourceName];
      }
    }
    return '';
  }

  cmdGrep(args, { stdin } = {}) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const rest = args.filter((arg) => !arg.startsWith('-'));
    const pattern = rest.shift();
    if (pattern == null) return { output: 'Usage: grep [OPTION]... PATTERN [FILE]...', exitCode: 2 };

    const insensitive = flags.includes('i');
    const numbered = flags.includes('n');
    const countOnly = flags.includes('c');
    const invert = flags.includes('v');

    let regex;
    try {
      regex = new RegExp(pattern, insensitive ? 'i' : '');
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), insensitive ? 'i' : '');
    }

    let sources = [];
    if (rest.length === 0) {
      if (stdin == null) return { output: 'grep: missing input (this practice shell does not wait on stdin)', exitCode: 2 };
      sources = [{ name: null, content: stdin }];
    } else {
      for (const target of rest) {
        const node = getNode(this.fs, normalizePath(target, this.cwd));
        if (!node) return { output: `grep: ${target}: No such file or directory`, exitCode: 2 };
        if (node.type === 'dir') continue;
        sources.push({ name: target, content: node.type === 'link' ? '' : node.content });
      }
    }

    const prefixFiles = sources.length > 1;
    const parts = [];
    let matches = 0;

    for (const source of sources) {
      const lines = String(source.content).split('\n');
      let count = 0;
      lines.forEach((line, index) => {
        const hit = regex.test(line);
        if (hit === invert) return;
        count += 1;
        matches += 1;
        if (countOnly) return;
        const prefix = prefixFiles && source.name ? `${source.name}:` : '';
        parts.push(`${prefix}${numbered ? `${index + 1}:` : ''}${line}`);
      });
      if (countOnly) {
        parts.push(prefixFiles && source.name ? `${source.name}:${count}` : String(count));
      }
    }

    return { output: parts.join('\n'), exitCode: matches > 0 ? 0 : 1 };
  }

  readStream(args, stdin) {
    const targets = args.filter((arg) => !arg.startsWith('-'));
    if (targets.length === 0) {
      return { name: null, content: stdin == null ? '' : String(stdin) };
    }
    const chunks = [];
    for (const target of targets) {
      const node = getNode(this.fs, normalizePath(target, this.cwd));
      if (!node || node.type === 'dir') {
        return { error: `${target}: No such file or directory` };
      }
      chunks.push(node.type === 'link' ? '' : node.content);
    }
    return { name: targets[0], content: chunks.join('\n') };
  }

  cmdWc(args, { stdin } = {}) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const targets = args.filter((arg) => !arg.startsWith('-'));
    const countLines = flags.includes('l');
    const countWords = flags.includes('w');
    const countBytes = flags.includes('c') || flags.includes('m');
    const anyFlag = countLines || countWords || countBytes;

    const sources = [];
    if (targets.length === 0) {
      if (stdin == null) return { output: 'wc: missing operand', exitCode: 1 };
      sources.push({ name: null, content: String(stdin) });
    } else {
      for (const target of targets) {
        const node = getNode(this.fs, normalizePath(target, this.cwd));
        if (!node || node.type === 'dir') {
          return { output: `wc: ${target}: No such file or directory`, exitCode: 1 };
        }
        sources.push({ name: target, content: node.type === 'link' ? '' : node.content });
      }
    }

    const rows = sources.map((source) => {
      const text = String(source.content);
      const lines = text === '' ? 0 : text.split('\n').filter((line, index, arr) => !(index === arr.length - 1 && line === '')).length;
      const words = text.split(/\s+/).filter(Boolean).length;
      const bytes = Buffer.byteLength(text, 'utf8');
      const numbers = [];
      if (countLines || !anyFlag) numbers.push(lines);
      if (countWords) numbers.push(words);
      if (countBytes) numbers.push(bytes);
      const prefix = numbers.map((value) => String(value).padStart(6)).join(' ');
      return source.name ? `${prefix} ${source.name}` : prefix;
    });

    return rows.join('\n');
  }

  cmdFile(args) {
    if (args.length === 0) return { output: 'Usage: file [FILE]...', exitCode: 1 };
    return args
      .map((target) => {
        const node = getNode(this.fs, normalizePath(target, this.cwd));
        if (!node) return `${target}: cannot open (No such file or directory)`;
        if (node.type === 'dir') return `${target}: directory`;
        if (node.type === 'link') return `${target}: symbolic link to ${node.target}`;
        const content = node.content || '';
        if (content === '') return `${target}: empty`;
        if (content.includes('ELF')) return `${target}: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2`;
        if (content.startsWith('#!')) return `${target}: Bourne-Again shell script, ASCII text executable`;
        if (/^\s*[[{]/.test(content)) return `${target}: JSON data`;
        return `${target}: ASCII text`;
      })
      .join('\n');
  }

  cmdChmod(args) {
    const values = args.filter((arg) => !arg.startsWith('-'));
    if (values.length < 2) return { output: 'chmod: missing operand', exitCode: 1 };
    const spec = values.shift();
    const recursive = args.some((arg) => arg.startsWith('-') && arg.includes('R'));

    const nodes = [];
    const collect = (path) => {
      const node = getNode(this.fs, path);
      if (!node) return;
      nodes.push({ path, node });
      if (recursive && node.type === 'dir') {
        for (const [name, child] of Object.entries(node.children)) {
          collect(`${path === '/' ? '' : path}/${name}`);
          if (child.type === 'dir') collect(`${path === '/' ? '' : path}/${name}`);
        }
      }
    };

    for (const target of values) {
      const resolved = normalizePath(target, this.cwd);
      if (!getNode(this.fs, resolved)) return { output: `chmod: cannot access '${target}': No such file or directory`, exitCode: 1 };
      collect(resolved);
    }

    for (const { node } of nodes) {
      if (/^[0-7]{3,4}$/.test(spec)) {
        node.mode = fromOctal(spec);
        node.octal = String(spec).slice(-3);
        continue;
      }
      for (const clause of spec.split(',')) {
        const match = clause.match(/^([ugoa]*)([+\-=])([rwx]*)$/);
        if (!match) continue;
        const who = match[1] || 'a';
        const operator = match[2];
        const perms = match[3];
        let digits = toOctal(node.mode).split('').map(Number);
        const targets = [];
        if (who.includes('a')) targets.push(0, 1, 2);
        if (who.includes('u')) targets.push(0);
        if (who.includes('g')) targets.push(1);
        if (who.includes('o')) targets.push(2);
        for (const target of new Set(targets)) {
          const bits = (perms.includes('r') ? 4 : 0) + (perms.includes('w') ? 2 : 0) + (perms.includes('x') ? 1 : 0);
          if (operator === '+') digits[target] |= bits;
          else if (operator === '-') digits[target] &= ~bits;
          else digits[target] = bits;
        }
        node.mode = fromOctal(digits.join(''));
      }
    }
    return '';
  }

  cmdChown() {
    return { output: '', exitCode: 0 };
  }

  cmdFind(args) {
    const start = args.find((arg) => !arg.startsWith('-') && !['f', 'd', 'l'].includes(arg)) || '.';
    const nameIndex = args.indexOf('-name');
    const typeIndex = args.indexOf('-type');
    const namePattern = nameIndex >= 0 ? args[nameIndex + 1] : null;
    const wantedType = typeIndex >= 0 ? args[typeIndex + 1] : null;
    const base = normalizePath(start, this.cwd);
    const results = [];

    const walk = (node, path) => {
      if (!node) return;
      const name = path.split('/').filter(Boolean).pop() || '/';
      const typeMatches = !wantedType || (wantedType === 'f' ? node.type === 'file' : wantedType === 'd' ? node.type === 'dir' : node.type === 'link');
      if (typeMatches && (!namePattern || matchGlob(namePattern, name))) results.push(path);
      if (node.type === 'dir') {
        for (const [childName, child] of Object.entries(node.children)) {
          walk(child, path === '/' ? `/${childName}` : `${path}/${childName}`);
        }
      }
    };

    walk(getNode(this.fs, base), base);
    return results.join('\n');
  }

  cmdTree(args) {
    const target = args.find((arg) => !arg.startsWith('-')) || '.';
    const resolved = normalizePath(target, this.cwd);
    const node = getNode(this.fs, resolved);
    if (!node) return { output: `${target} [error opening dir]`, exitCode: 1 };

    const lines = [target];
    let directories = 0;
    let files = 0;

    const walk = (current, prefix) => {
      if (current.type !== 'dir') return;
      const entries = listDir(current).filter((entry) => !entry.name.startsWith('.'));
      entries.forEach((entry, index) => {
        const last = index === entries.length - 1;
        lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}`);
        if (entry.type === 'dir') {
          directories += 1;
          if (current.children[entry.name]) walk(current.children[entry.name], `${prefix}${last ? '    ' : '│   '}`);
        } else {
          files += 1;
        }
      });
    };

    walk(node, '');
    lines.push('', `${directories} director${directories === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`);
    return lines.join('\n');
  }

  cmdStat(args) {
    const formatIndex = args.indexOf('-c');
    const format = formatIndex >= 0 ? args[formatIndex + 1] : null;
    const targets = args.filter((arg, index) => !arg.startsWith('-') && !(formatIndex >= 0 && index === formatIndex + 1));
    if (targets.length === 0) return { output: 'stat: missing operand', exitCode: 1 };

    const blocks = [];
    let missing = false;
    for (const target of targets) {
      const resolved = normalizePath(target, this.cwd);
      const node = getNode(this.fs, resolved);
      if (!node) {
        missing = true;
        blocks.push(`stat: cannot statx '${target}': No such file or directory`);
        continue;
      }
      const size = nodeSize(node);
      const fields = {
        '%a': toOctal(nodeMode(node)),
        '%A': symbolicMode(node),
        '%n': target,
        '%N': `'${target}'`,
        '%s': String(size),
        '%b': String(Math.ceil(size / 512)),
        '%B': '512',
        '%F': node.type === 'dir' ? 'directory' : node.type === 'link' ? 'symbolic link' : size === 0 ? 'regular empty file' : 'regular file',
        '%U': node.owner || 'root',
        '%G': node.owner || 'root',
        '%u': '0',
        '%g': '0',
        '%y': '2026-10-20 10:00:00.000000000 +0000',
        '%Y': '1760954400',
      };
      if (format) {
        blocks.push(format.replace(/%[a-zA-Z%]/g, (token) => (token === '%%' ? '%' : fields[token] ?? token)));
        continue;
      }
      blocks.push([
        `  File: ${target}`,
        `  Size: ${size}\t\tBlocks: ${Math.ceil(size / 512)}\tIO Block: 4096   ${fields['%F']}`,
        `Device: 0,45\tInode: 1844674\tLinks: 1`,
        `Access: (${toOctal(nodeMode(node)).padStart(4, '0')}/${symbolicMode(node)})\tUid: (    0/    root)\tGid: (    0/    root)`,
        `Access: 2026-10-20 10:00:00.000000000 +0000`,
        `Modify: 2026-10-20 10:00:00.000000000 +0000`,
        `Change: 2026-10-20 10:00:00.000000000 +0000`,
      ].join('\n'));
    }

    return { output: blocks.join('\n'), exitCode: missing ? 1 : 0 };
  }

  hash(args, stdin, algorithm) {
    const targets = args.filter((arg) => !arg.startsWith('-'));
    const digest = (content) => crypto.createHash(algorithm).update(content, 'utf8').digest('hex');
    if (targets.length === 0) {
      if (stdin == null) return { output: `${algorithm}sum: missing file operand`, exitCode: 1 };
      return `${digest(String(stdin))}  -`;
    }
    return targets
      .map((target) => {
        const node = getNode(this.fs, normalizePath(target, this.cwd));
        if (!node || node.type === 'dir') return `${algorithm}sum: ${target}: No such file or directory`;
        return `${digest(node.type === 'link' ? '' : node.content || '')}  ${target}`;
      })
      .join('\n');
  }

  cmdSha256(args, { stdin } = {}) {
    return this.hash(args, stdin, 'sha256');
  }

  cmdSha1(args, { stdin } = {}) {
    return this.hash(args, stdin, 'sha1');
  }

  cmdMd5(args, { stdin } = {}) {
    return this.hash(args, stdin, 'md5');
  }

  cmdBase64(args, { stdin } = {}) {
    const decode = args.some((arg) => arg === '-d' || arg === '--decode');
    const targets = args.filter((arg) => !arg.startsWith('-'));
    let content;
    if (targets.length === 0) {
      if (stdin == null) return { output: 'base64: missing input', exitCode: 1 };
      content = String(stdin);
    } else {
      const node = getNode(this.fs, normalizePath(targets[0], this.cwd));
      if (!node || node.type === 'dir') return { output: `base64: ${targets[0]}: No such file or directory`, exitCode: 1 };
      content = node.type === 'link' ? '' : node.content || '';
    }
    try {
      return decode
        ? Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8')
        : Buffer.from(content, 'utf8').toString('base64');
    } catch {
      return { output: 'base64: invalid input', exitCode: 1 };
    }
  }

  /* ---------------------------------------------------------------- */
  /* text processing                                                   */
  /* ---------------------------------------------------------------- */

  cmdAwk(args, { stdin } = {}) {
    let separator = null;
    const rest = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-F' && args[index + 1]) {
        separator = args[index + 1];
        index += 1;
      } else if (args[index].startsWith('-F')) {
        separator = args[index].slice(2);
      } else {
        rest.push(args[index]);
      }
    }

    const program = rest.shift();
    if (!program) return { output: 'usage: awk [-F fs] program [file ...]', exitCode: 2 };

    let content;
    if (rest[0]) {
      const node = getNode(this.fs, normalizePath(rest[0], this.cwd));
      if (!node || node.type === 'dir') return { output: `awk: can't open file ${rest[0]}`, exitCode: 2 };
      content = node.type === 'link' ? '' : node.content || '';
    } else if (stdin != null) {
      content = String(stdin);
    } else {
      return { output: 'awk: no input', exitCode: 2 };
    }

    const fsPattern = separator ? new RegExp(separator) : /\s+/;
    const body = program.replace(/^\s*\{/, '').replace(/\}\s*$/, '').trim();
    const printMatch = body.match(/^print\s+(.*)$/s);
    if (!printMatch) return { output: '', exitCode: 0 };

    const expression = printMatch[1];
    const terms = splitTopLevel(expression, ',');

    const lines = String(content).split('\n').filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
    return lines
      .map((line, index) => {
        const fields = line.split(fsPattern);
        const values = terms.map((term) => {
          const trimmed = term.trim();
          if (trimmed === 'NF') return String(fields.length);
          if (trimmed === 'NR') return String(index + 1);
          if (trimmed === '$0') return line;
          const fieldMatch = trimmed.match(/^\$(\d+)$/);
          if (fieldMatch) return fields[Number(fieldMatch[1]) - 1] ?? '';
          const quoted = trimmed.match(/^"(.*)"$/) || trimmed.match(/^'(.*)'$/);
          if (quoted) return quoted[1];
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric) && trimmed !== '') return String(numeric);
          return trimmed;
        });
        return values.join(' ');
      })
      .join('\n');
  }

  cmdSort(args, { stdin } = {}) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const targets = args.filter((arg) => !arg.startsWith('-'));
    const stream = this.readStream(targets, stdin);
    if (stream.error) return { output: `sort: ${stream.error}`, exitCode: 2 };
    let lines = String(stream.content).split('\n').filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
    if (flags.includes('n')) {
      lines = lines.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    } else {
      lines = lines.sort((a, b) => a.localeCompare(b, 'en'));
    }
    if (flags.includes('r')) lines.reverse();
    if (flags.includes('u')) lines = [...new Set(lines)];
    return lines.join('\n');
  }

  cmdUniq(args, { stdin } = {}) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const targets = args.filter((arg) => !arg.startsWith('-'));
    const stream = this.readStream(targets, stdin);
    if (stream.error) return { output: `uniq: ${stream.error}`, exitCode: 2 };
    const lines = String(stream.content).split('\n').filter((line, index, arr) => !(index === arr.length - 1 && line === ''));

    const groups = [];
    for (const line of lines) {
      const last = groups[groups.length - 1];
      if (last && last.line === line) last.count += 1;
      else groups.push({ line, count: 1 });
    }
    const filtered = groups.filter((group) => {
      if (flags.includes('d')) return group.count > 1;
      if (flags.includes('u')) return group.count === 1;
      return true;
    });
    return filtered
      .map((group) => (flags.includes('c') ? `${String(group.count).padStart(7)} ${group.line}` : group.line))
      .join('\n');
  }

  cmdCut(args, { stdin } = {}) {
    let delimiter = '\t';
    let fields = [];
    const files = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-d') {
        delimiter = args[index + 1] || '\t';
        index += 1;
      } else if (args[index] === '-f') {
        fields = String(args[index + 1] || '').split(',').map(Number);
        index += 1;
      } else if (!args[index].startsWith('-')) {
        files.push(args[index]);
      }
    }
    const stream = this.readStream(files, stdin);
    if (stream.error) return `cut: ${stream.error}`;
    const lines = String(stream.content).split('\n').filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
    return lines
      .map((line) => line.split(delimiter).filter((_value, index) => fields.includes(index + 1)).join(delimiter))
      .join('\n');
  }

  cmdTr(args, { stdin } = {}) {
    const sets = args.filter((arg) => !arg.startsWith('-'));
    if (sets.length < 2) return { output: 'tr: missing operand', exitCode: 1 };
    if (stdin == null) return { output: 'tr: missing input', exitCode: 1 };
    const expand = (value) => {
      if (value.includes('-') && value.length === 3) {
        const [start, , end] = value;
        let result = '';
        for (let code = start.charCodeAt(0); code <= end.charCodeAt(0); code += 1) result += String.fromCharCode(code);
        return result;
      }
      return value;
    };
    const from = expand(sets[0]);
    const to = expand(sets[1]);
    let output = '';
    for (const char of String(stdin)) {
      const index = from.indexOf(char);
      output += index >= 0 ? to[index] ?? to[to.length - 1] ?? '' : char;
    }
    return output;
  }

  cmdSed(args, { stdin } = {}) {
    const expression = args.find((arg) => !arg.startsWith('-'));
    if (!expression) return { output: 'sed: no expression', exitCode: 1 };
    const match = expression.match(/^s(.)(.*?)\1(.*?)\1([gi]*)$/);
    if (!match) return { output: 'sed: only substitution expressions are supported', exitCode: 1 };
    const [, , pattern, replacement, flags] = match;
    const stream = this.readStream(args.filter((arg) => arg !== expression), stdin);
    if (stream.error) return `sed: ${stream.error}`;
    const regex = new RegExp(pattern, flags.includes('g') ? 'g' : '');
    return String(stream.content)
      .split('\n')
      .map((line) => line.replace(regex, replacement))
      .join('\n');
  }

  /* ---------------------------------------------------------------- */
  /* identity / system                                                 */
  /* ---------------------------------------------------------------- */

  cmdWhoami() {
    return this.user;
  }

  cmdId() {
    return `uid=0(${this.user}) gid=0(${this.user}) groups=0(${this.user}),27(sudo),1001(labusers)`;
  }

  cmdGroups() {
    return `${this.user} sudo labusers`;
  }

  cmdHostname() {
    return this.hostname;
  }

  cmdUname(args) {
    const flags = args.join(' ');
    if (flags.includes('a')) return `Linux ${this.hostname} 5.15.0-cyberita #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`;
    const parts = [];
    if (flags.includes('s')) parts.push('Linux');
    if (flags.includes('n')) parts.push(this.hostname);
    if (flags.includes('r')) parts.push('5.15.0-cyberita');
    if (flags.includes('v')) parts.push('#1 SMP PREEMPT_DYNAMIC');
    if (flags.includes('m')) parts.push('x86_64');
    return parts.length > 0 ? parts.join(' ') : 'Linux';
  }

  cmdDate() {
    return new Date().toString();
  }

  cmdHistory() {
    return this.history.map((line, index) => `${String(index + 1).padStart(4)}  ${line}`).join('\n');
  }

  cmdEnv() {
    return [
      `USER=${this.user}`,
      `LOGNAME=${this.user}`,
      'HOME=/home/student',
      'SHELL=/bin/bash',
      `PWD=${this.cwd}`,
      `PATH=${DEFAULT_PATH}`,
      'LANG=en_US.UTF-8',
      'TERM=xterm-256color',
      `HOSTNAME=${this.hostname}`,
      'EDITOR=nano',
    ].join('\n');
  }

  cmdWhich(args) {
    const known = ['ls', 'cat', 'grep', 'awk', 'sed', 'ping', 'nmap', 'apt', 'apt-get', 'curl', 'wget', 'python3', 'sudo', 'systemctl', 'ss', 'ps', 'stat', 'file', 'sha256sum', 'md5sum', 'base64', 'getent', 'nproc', 'pgrep', 'tree'];
    return args.map((command) => (known.includes(command) ? `/usr/bin/${command}` : '')).filter(Boolean).join('\n');
  }

  cmdMan(args) {
    if (!args[0]) return 'What manual page do you want?';
    return `${args[0].toUpperCase()}(1)\t\tUser Commands\t\t${args[0].toUpperCase()}(1)\n\nNAME\n    ${args[0]} — simulated manual page for the CyberITA+ practice terminal.\n\nDESCRIPTION\n    See the lab instructions for the expected usage. Run "help" for the full command list.`;
  }

  cmdLsbRelease() {
    return [
      'Distributor ID:\tUbuntu',
      'Description:\tUbuntu 22.04.4 LTS',
      'Release:\t22.04',
      'Codename:\tjammy',
    ].join('\n');
  }

  /* ---------------------------------------------------------------- */
  /* processes / resources                                             */
  /* ---------------------------------------------------------------- */

  processes() {
    return [
      { user: 'root', pid: 1, cpu: '0.0', mem: '0.1', vsz: 11264, rss: 4096, tty: '?', stat: 'Ss', start: '09:00', time: '0:02', comm: 'sleep', args: 'sleep infinity', command: 'sleep infinity' },
      { user: 'root', pid: 342, cpu: '0.0', mem: '0.1', vsz: 12488, rss: 6144, tty: '?', stat: 'Ss', start: '09:00', time: '0:00', comm: 'sshd', args: '/usr/sbin/sshd -D', command: '/usr/sbin/sshd -D' },
      { user: 'www-data', pid: 731, cpu: '0.3', mem: '1.4', vsz: 149210, rss: 58210, tty: '?', stat: 'S', start: '09:01', time: '0:11', comm: 'nginx', args: 'nginx: master process /usr/sbin/nginx', command: 'nginx: master process /usr/sbin/nginx' },
      { user: 'postgres', pid: 612, cpu: '0.1', mem: '0.8', vsz: 88412, rss: 32410, tty: '?', stat: 'S', start: '09:01', time: '0:04', comm: 'postgres', args: 'postgres: checkpointer', command: 'postgres: checkpointer' },
      { user: this.user, pid: 1024, cpu: '0.0', mem: '0.0', vsz: 10852, rss: 4224, tty: 'pts/0', stat: 'Ss', start: '10:12', time: '0:00', comm: 'bash', args: '-bash', command: '-bash' },
      { user: this.user, pid: 1107, cpu: '0.0', mem: '0.0', vsz: 9024, rss: 3120, tty: 'pts/0', stat: 'R+', start: '10:15', time: '0:00', comm: 'ps', args: 'ps aux', command: 'ps aux' },
    ];
  }

  psValue(process, field) {
    const map = {
      user: process.user,
      uid: process.user,
      pid: String(process.pid),
      '%cpu': process.cpu,
      '%mem': process.mem,
      vsz: String(process.vsz),
      rss: String(process.rss),
      tty: process.tty,
      stat: process.stat,
      start: process.start,
      time: process.time,
      comm: process.comm,
      args: process.args,
      cmd: process.command,
      command: process.command,
    };
    return map[field] ?? '';
  }

  cmdPs(args) {
    const headerFor = {
      user: 'USER', uid: 'UID', pid: 'PID', '%cpu': '%CPU', '%mem': '%MEM', vsz: 'VSZ', rss: 'RSS',
      tty: 'TTY', stat: 'STAT', start: 'START', time: 'TIME', comm: 'COMMAND', args: 'COMMAND', cmd: 'CMD', command: 'COMMAND',
    };

    let processes = this.processes();
    let fields = null;
    let pid = null;
    let sortField = null;

    if (args.includes('aux') || args.includes('ax') || args.includes('-aux')) {
      fields = ['user', 'pid', '%cpu', '%mem', 'vsz', 'rss', 'tty', 'stat', 'start', 'time', 'command'];
    } else {
      const pidIndex = args.indexOf('-p');
      if (pidIndex >= 0) pid = Number(args[pidIndex + 1]);
      const oIndex = args.indexOf('-o');
      if (oIndex >= 0) fields = String(args[oIndex + 1] || '').split(',').map((value) => value.trim().toLowerCase());
      else if (args[0] === '-eo' || args[0] === '-e') {
        const candidate = args[1] || 'pid,comm';
        if (!candidate.startsWith('-')) fields = candidate.split(',').map((value) => value.trim().toLowerCase());
      }
      const sortArg = args.find((arg) => arg.startsWith('--sort='));
      if (sortArg) sortField = sortArg.slice('--sort='.length);
    }

    if (!fields) fields = ['pid', 'tty', 'time', 'command'];
    if (pid != null) processes = processes.filter((process) => process.pid === pid);

    if (sortField) {
      const descending = sortField.startsWith('-');
      const field = sortField.replace(/^[+-]/, '');
      processes.sort((a, b) => {
        const left = Number(this.psValue(a, field)) || 0;
        const right = Number(this.psValue(b, field)) || 0;
        return descending ? right - left : left - right;
      });
    }

    const widths = fields.map((field) => Math.max(
      (headerFor[field] || field.toUpperCase()).length,
      ...processes.map((process) => String(this.psValue(process, field)).length)
    ));

    const header = fields.map((field, index) => (headerFor[field] || field.toUpperCase()).padEnd(widths[index])).join(' ').trimEnd();
    const rows = processes.map((process) => fields
      .map((field, index) => String(this.psValue(process, field)).padEnd(widths[index]))
      .join(' ')
      .trimEnd());

    return [header, ...rows].join('\n');
  }

  cmdPgrep(args) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const pattern = args.find((arg) => !arg.startsWith('-')) || '';
    let regex;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const matches = this.processes().filter((process) => regex.test(process.comm) || regex.test(process.args));
    if (flags.includes('a')) return matches.map((process) => `${process.pid} ${process.command}`).join('\n');
    return matches.map((process) => String(process.pid)).join('\n');
  }

  cmdKill(args) {
    const pids = args.filter((arg) => !arg.startsWith('-'));
    if (pids.length === 0) return { output: 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...', exitCode: 1 };
    return '';
  }

  cmdTop() {
    return [
      `top - ${new Date().toLocaleTimeString('en-US', { hour12: false })} up 1:15,  1 user,  load average: 0.08, 0.12, 0.10`,
      'Tasks:  92 total,   1 running,  91 sleeping,   0 stopped,   0 zombie',
      '%Cpu(s):  2.4 us,  0.8 sy,  0.0 ni, 96.5 id,  0.3 wa,  0.0 hi,  0.0 si,  0.0 st',
      'MiB Mem :   3921.0 total,   1845.2 free,   1102.4 used,    973.4 buff/cache',
      'MiB Swap:   2047.9 total,   2047.9 free,      0.0 used.   2480.1 avail Mem',
      '',
      '  PID USER      PR  NI    VIRT    RES  %CPU  %MEM     TIME+ COMMAND',
      '  731 www-data  20   0  149210  58210   1.7   1.5   0:11.42 nginx',
      '  612 postgres  20   0   88412  32410   0.4   0.8   0:04.11 postgres',
      '  342 root      20   0   12488   6144   0.0   0.2   0:00.31 sshd',
      ' 1107 student   20   0    9024   3120   0.0   0.1   0:00.02 top',
    ].join('\n');
  }

  cmdDf(args) {
    const target = args.find((arg) => !arg.startsWith('-'));
    const rows = [
      ['overlay', '40G', '5.2G', '33G', '14%', '/'],
      ['tmpfs', '64M', '0', '64M', '0%', '/dev'],
      ['tmpfs', '3.9G', '0', '3.9G', '0%', '/dev/shm'],
      ['/dev/sda1', '100G', '42G', '53G', '45%', '/data'],
    ];
    const filtered = target
      ? rows.filter((row) => row[5] === target || row[5].startsWith(`${target.replace(/\/$/, '')}/`))
      : rows;
    const header = 'Filesystem      Size  Used Avail Use% Mounted on';
    const body = (filtered.length > 0 ? filtered : rows.slice(0, 1)).map((row) =>
      `${row[0].padEnd(15)} ${row[1].padStart(4)} ${row[2].padStart(5)} ${row[3].padStart(5)} ${row[4].padStart(4)} ${row[5]}`
    );
    return [header, ...body].join('\n');
  }

  cmdDu(args) {
    const target = args.find((arg) => !arg.startsWith('-')) || '.';
    const node = getNode(this.fs, normalizePath(target, this.cwd));
    if (!node) return { output: `du: cannot access '${target}': No such file or directory`, exitCode: 1 };
    return `${Math.max(4, Math.ceil(nodeSize(node) / 1024))}\t${target}`;
  }

  cmdFree(args) {
    const human = args.some((arg) => arg.startsWith('-') && arg.includes('h'));
    if (human) {
      return [
        '               total        used        free      shared  buff/cache   available',
        'Mem:           3.8Gi       1.1Gi       1.8Gi        12Mi       973Mi       2.4Gi',
        'Swap:          2.0Gi          0B       2.0Gi',
      ].join('\n');
    }
    return [
      '               total        used        free      shared  buff/cache   available',
      'Mem:            3921        1102        1845          12         973        2480',
      'Swap:           2047           0        2047',
    ].join('\n');
  }

  cmdUptime() {
    return ` ${new Date().toLocaleTimeString('en-US', { hour12: false })} up 1:15,  1 user,  load average: 0.08, 0.12, 0.10`;
  }

  cmdNproc() {
    return '2';
  }

  /* ---------------------------------------------------------------- */
  /* networking                                                        */
  /* ---------------------------------------------------------------- */

  cmdIfconfig() {
    return [
      'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
      '        inet 10.0.15.42  netmask 255.255.255.0  broadcast 10.0.15.255',
      '        inet6 fe80::20c:29ff:fe4f:9a71  prefixlen 64  scopeid 0x20<link>',
      '        ether 00:0c:29:4f:9a:71  txqueuelen 1000  (Ethernet)',
      '        RX packets 15240  bytes 18429102 (18.4 MB)',
      '        TX packets 8421  bytes 1240921 (1.2 MB)',
      '',
      'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
      '        inet 127.0.0.1  netmask 255.0.0.0',
      '        inet6 ::1  prefixlen 128  scopeid 0x10<host>',
      '        loop  txqueuelen 1000  (Local Loopback)',
    ].join('\n');
  }

  cmdIp(args) {
    if (args[0] === 'addr' || args[0] === 'a') return this.cmdIfconfig();
    if (args[0] === 'route' || args[0] === 'r') {
      return [
        'default via 10.0.15.1 dev eth0 proto static',
        '10.0.15.0/24 dev eth0 proto kernel scope link src 10.0.15.42',
        '172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown',
      ].join('\n');
    }
    return { output: 'Usage: ip [ addr | route ]', exitCode: 1 };
  }

  cmdPing(args) {
    let count = 3;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-c') count = Math.min(Number(args[index + 1]) || 3, 10);
    }
    const target = args.find((arg, index) => !arg.startsWith('-') && args[index - 1] !== '-c') || 'localhost';
    const ip = fakeIpFor(target);
    const lines = [`PING ${target} (${ip}) 56(84) bytes of data.`];
    for (let index = 1; index <= count; index += 1) {
      lines.push(`64 bytes from ${target} (${ip}): icmp_seq=${index} ttl=64 time=${(0.4 + index * 0.13).toFixed(3)} ms`);
    }
    lines.push('', `--- ${target} ping statistics ---`);
    lines.push(`${count} packets transmitted, ${count} received, 0% packet loss, time ${count * 1001}ms`);
    lines.push('rtt min/avg/max/mdev = 0.412/0.551/0.712/0.113 ms');
    return lines.join('\n');
  }

  cmdTraceroute(args) {
    const target = args.find((arg) => !arg.startsWith('-')) || 'example.com';
    return [
      `traceroute to ${target} (${fakeIpFor(target)}), 30 hops max, 60 byte packets`,
      ' 1  gateway (10.0.15.1)  0.543 ms  0.498 ms  0.474 ms',
      ' 2  10.20.0.1  2.110 ms  2.064 ms  2.021 ms',
      ` 3  ${target} (${fakeIpFor(target)})  8.442 ms  8.391 ms  8.337 ms`,
    ].join('\n');
  }

  cmdNetstat() {
    return [
      'Active Internet connections (only servers)',
      'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name',
      'tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      342/sshd',
      'tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      731/nginx',
      'tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN      731/nginx',
      'tcp        0      0 127.0.0.1:5432          0.0.0.0:*               LISTEN      612/postgres',
      'udp        0      0 0.0.0.0:68              0.0.0.0:*                           512/dhclient',
    ].join('\n');
  }

  cmdSs() {
    return [
      'Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process',
      'udp   UNCONN 0      0          0.0.0.0:68         0.0.0.0:*     users:(("dhclient",pid=512,fd=6))',
      'tcp   LISTEN 0      128        0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=342,fd=3))',
      'tcp   LISTEN 0      511        0.0.0.0:80         0.0.0.0:*     users:(("nginx",pid=731,fd=6))',
      'tcp   LISTEN 0      511        0.0.0.0:443        0.0.0.0:*     users:(("nginx",pid=731,fd=7))',
      'tcp   LISTEN 0      244      127.0.0.1:5432       0.0.0.0:*     users:(("postgres",pid=612,fd=5))',
    ].join('\n');
  }

  cmdCurl(args) {
    const target = args.find((arg) => !arg.startsWith('-')) || 'http://localhost';
    if (String(target).includes('404')) return { output: 'curl: (22) The requested URL returned error: 404', exitCode: 22 };
    return [
      '<!DOCTYPE html>',
      '<html><head><title>Service Online</title></head>',
      `<body><h1>OK</h1><p>Simulated response from ${target}</p></body></html>`,
    ].join('\n');
  }

  cmdNmap(args) {
    let target = null;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '-p' || args[index] === '-sV' || args[index] === '-sS') {
        if (args[index] === '-p') index += 1;
        continue;
      }
      if (!args[index].startsWith('-')) {
        target = args[index];
      }
    }
    target = target || 'localhost';
    const ip = fakeIpFor(target);
    return [
      `Starting Nmap 7.94 ( https://nmap.org ) at ${new Date().toUTCString()}`,
      `Nmap scan report for ${target} (${ip})`,
      'Host is up (0.00042s latency).',
      'Not shown: 996 closed tcp ports (reset)',
      'PORT     STATE SERVICE',
      '22/tcp   open  ssh',
      '80/tcp   open  http',
      '443/tcp  open  https',
      '3306/tcp open  mysql',
      '',
      'Nmap done: 1 IP address (1 host up) scanned in 2.31 seconds',
    ].join('\n');
  }

  cmdGetent(args) {
    const database = args[0];
    const key = args[1];
    if (database === 'hosts') {
      if (!key) return { output: 'getent: missing key', exitCode: 2 };
      if (key === 'localhost') return '127.0.0.1       localhost';
      if (key === 'cyberita-lab' || key === this.hostname) return `127.0.1.1       ${this.hostname}`;
      return `${fakeIpFor(key)}      ${key}`;
    }
    if (database === 'passwd') {
      const node = getNode(this.fs, '/etc/passwd');
      const line = (node?.content || '').split('\n').find((entry) => entry.startsWith(`${key}:`));
      return line ? { output: line, exitCode: 0 } : { output: '', exitCode: 2 };
    }
    if (database === 'group') {
      return { output: 'root:x:0:', exitCode: 0 };
    }
    return { output: `getent: unknown database "${database}"`, exitCode: 2 };
  }

  /* ---------------------------------------------------------------- */
  /* packages / services / session                                     */
  /* ---------------------------------------------------------------- */

  cmdApt(args) {
    const sub = args[0] || '';
    if (sub === 'update') {
      return [
        'Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease',
        'Hit:2 http://archive.ubuntu.com/ubuntu jammy-updates InRelease',
        'Reading package lists... Done',
        'All packages are up to date.',
      ].join('\n');
    }
    if (sub === 'install' || sub === 'upgrade') {
      const packages = args.slice(1).filter((arg) => !arg.startsWith('-'));
      if (packages.length === 0) return { output: 'E: Operands must specify packages', exitCode: 100 };
      return [
        'Reading package lists... Done',
        'Building dependency tree... Done',
        `The following NEW packages will be installed:\n  ${packages.join(' ')}`,
        `0 upgraded, ${packages.length} newly installed, 0 to remove and 0 not upgraded.`,
        'Need to get 1,204 kB of archives.',
        `Get:1 http://archive.ubuntu.com/ubuntu jammy/main amd64 ${packages[0]} amd64 [1,204 kB]`,
        'Selecting previously unselected package.',
        `Unpacking ${packages.join(' ')} ...`,
        `Setting up ${packages.join(' ')} ...`,
        'Processing triggers for man-db ...',
      ].join('\n');
    }
    if (sub === 'list' || sub === 'search') return 'Listing... Done\nsimulated-package/jammy 1.0 amd64';
    return { output: `E: Invalid operation: ${sub || '(none)'}`, exitCode: 100 };
  }

  cmdSystemctl(args) {
    const action = args[0];
    const unit = args[1] || 'service';
    if (!action) return 'UNIT                     LOAD   ACTIVE SUB     DESCRIPTION\nssh.service              loaded active running OpenBSD Secure Shell server\nnginx.service            loaded active running A high performance web server';
    if (action === 'status' || action === 'is-active') {
      const active = !unit.includes('fail');
      return [
        `● ${unit}.service - Simulated service`,
        `     Loaded: loaded (/lib/systemd/system/${unit}.service; enabled; vendor preset: enabled)`,
        `     Active: ${active ? 'active (running) since Mon 2026-10-20 09:00:11 UTC; 1h 15min ago' : 'inactive (dead)'}`,
        '   Main PID: 813 (simulated)',
      ].join('\n');
    }
    if (['start', 'stop', 'restart', 'enable', 'disable'].includes(action)) {
      return `${action} ${unit}: done.`;
    }
    return { output: `Unknown command verb ${action}.`, exitCode: 1 };
  }

  cmdSudo(args) {
    if (args.length === 0) return { output: 'usage: sudo [-u user] command', exitCode: 1 };
    let inner = args;
    if (args[0] === '-u' && args.length >= 3) inner = args.slice(2);
    else if (args[0].startsWith('-')) inner = args.slice(1);
    const command = inner.join(' ');
    if (!command) return { output: 'usage: sudo command', exitCode: 1 };
    const result = this.runLine(command);
    return { output: result.output, exitCode: result.exitCode, events: result.events };
  }

  cmdSleep() {
    // Simulated instantly so a practice step never blocks the web worker.
    return '';
  }

  cmdClear() {
    return { output: '', exitCode: 0, clear: true, events: [{ type: 'clear' }] };
  }

  cmdExit() {
    return { output: '', exitCode: 0, events: [{ type: 'exit' }] };
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function humanSize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}M`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}K`;
  return String(value);
}

function fakeIpFor(target) {
  if (target === 'localhost' || target === '127.0.0.1') return '127.0.0.1';
  let hash = 0;
  for (const char of String(target)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `93.184.${(hash >>> 8) % 256}.${(hash & 255) || 1}`;
}

function matchGlob(pattern, value) {
  const regex = new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return regex.test(value);
}

/** Recursively removes NUL characters so the snapshot is valid JSONB. */
function stripNul(value) {
  if (typeof value === 'string') return value.replace(/\u0000/g, '');
  if (Array.isArray(value)) return value.map(stripNul);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = stripNul(child);
    return out;
  }
  return value;
}

function splitTopLevel(input, separator) {  const parts = [];
  let current = '';
  let quote = null;
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === separator) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

export default PracticeShell;
