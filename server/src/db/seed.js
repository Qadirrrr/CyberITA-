import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { query, withTransaction, pool } from '../config/db.js';
import { runMigrations, ensureDatabase } from './migrate.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { hashPassword } from '../services/authService.js';
import { certificateSerial, slugify } from '../utils/helpers.js';
import { defaultFs } from '../labs/mock/virtualFs.js';

const PASSWORD = env.seed.password;

function studentFs(add = null) {
  const fs = defaultFs();
  if (add) add(fs);
  return fs;
}

function fileNode(content, mode = '-rw-r--r--') {
  return { type: 'file', content, mode };
}

async function createUser(client, { email, name, role, headline, bio }) {
  const hash = await hashPassword(PASSWORD);
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, full_name, role, headline, bio)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [email.toLowerCase(), hash, name, role, headline ?? null, bio ?? null]
  );
  return rows[0].id;
}

async function createCourse(client, { instructorId, title, slug, summary, description, category, level, durationHours, price = 0, tags, cover, status = 'published' }) {
  const { rows } = await client.query(
    `INSERT INTO courses (slug, title, summary, description, category, level, duration_hours, price,
       cover_image, status, tags, instructor_id, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, slug`,
    [slug, title, summary, description, category, level, durationHours, price, cover, status, tags, instructorId,
     status === 'published' ? new Date() : null]
  );
  return rows[0];
}

async function createModule(client, courseId, title, position, description = null) {
  const { rows } = await client.query(
    `INSERT INTO modules (course_id, title, description, position) VALUES ($1, $2, $3, $4) RETURNING id`,
    [courseId, title, description, position]
  );
  return rows[0].id;
}

async function createLesson(client, { courseId, moduleId, title, content, type = 'reading', minutes = 12, position = 0, free = false, videoUrl = null }) {
  const { rows } = await client.query(
    `INSERT INTO lessons (course_id, module_id, title, content, video_url, duration_minutes,
       lesson_type, position, is_free_preview)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [courseId, moduleId, title, content, videoUrl, minutes, type, position, free]
  );
  return rows[0].id;
}

async function createQuiz(client, { courseId, lessonId, title, description = '', passScore = 60, questions }) {
  const { rows } = await client.query(
    `INSERT INTO quizzes (course_id, lesson_id, title, description, pass_score)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [courseId, lessonId ?? null, title, description, passScore]
  );
  const quizId = rows[0].id;
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    await client.query(
      `INSERT INTO quiz_questions (quiz_id, position, question, type, options, correct_option, explanation, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [quizId, i, q.question, q.type || 'mcq', JSON.stringify(q.options), q.correct, q.explanation ?? null, q.points ?? 1]
    );
  }
  return quizId;
}

async function createAssignment(client, { courseId, lessonId, title, description, points = 100, dueInDays = null }) {
  const due = dueInDays ? new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000) : null;
  const { rows } = await client.query(
    `INSERT INTO assignments (course_id, lesson_id, title, description, due_at, points, is_published)
     VALUES ($1,$2,$3,$4,$5,$6, TRUE) RETURNING id`,
    [courseId, lessonId ?? null, title, description, due, points]
  );
  return rows[0].id;
}

async function createLab(client, { createdBy, courseId, lessonId, title, slug, summary, description, difficulty, minutes, welcome, files = null, cwd = '/home/student', status = 'published' }) {
  const { rows } = await client.query(
    `INSERT INTO labs (slug, course_id, lesson_id, title, summary, description, difficulty,
       estimated_minutes, terminal_welcome, initial_files, initial_cwd, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [slug, courseId ?? null, lessonId ?? null, title, summary, description, difficulty,
     minutes, welcome, JSON.stringify(files ?? studentFs()), cwd, status, createdBy]
  );
  const labId = rows[0].id;
  return labId;
}

async function createSteps(client, labId, steps) {
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    await client.query(
      `INSERT INTO lab_steps (lab_id, position, title, instruction, hint, verification,
         expected_command, expected_output_pattern, points, is_optional)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [labId, i, step.title, step.instruction, step.hint ?? null, step.verification || 'command',
       step.command ?? null, step.pattern ?? null, step.points ?? 10, step.optional ?? false]
    );
  }
}

async function seed() {
  await ensureDatabase(env.db.name);
  await runMigrations({ silent: true });

  const { rows: existing } = await query('SELECT COUNT(*)::int AS n FROM users');
  if (existing[0].n > 0 && !process.env.FORCE_SEED) {
    logger.info('Database already contains users — skipping seed (set FORCE_SEED=1 to re-run).');
    return;
  }

  const started = Date.now();

  await withTransaction(async (client) => {
    // ---------- users ----------
    const adminId = await createUser(client, {
      email: 'admin@cyberita.plus', name: 'Dana Whitmore', role: 'admin',
      headline: 'Platform Administrator',
      bio: 'Responsible for the CyberITA+ learning platform, its instructors and curriculum quality.',
    });
    const instructorLinux = await createUser(client, {
      email: 'sarah.chen@cyberita.plus', name: 'Sarah Chen', role: 'instructor',
      headline: 'Senior Linux & DevOps Engineer',
      bio: '12 years of production Linux experience. Author of the CyberITA+ Linux and automation tracks.',
    });
    const instructorNet = await createUser(client, {
      email: 'marcus.reid@cyberita.plus', name: 'Marcus Reid', role: 'instructor',
      headline: 'Network & Security Consultant',
      bio: 'CCNP/Security+ trainer focused on practical troubleshooting and defensive security.',
    });
    const studentAlex = await createUser(client, {
      email: 'alex.rivera@cyberita.plus', name: 'Alex Rivera', role: 'student',
      headline: 'Junior Systems Administrator',
      bio: 'Career switcher building hands-on IT skills with practical labs.',
    });
    const studentPriya = await createUser(client, {
      email: 'priya.sharma@cyberita.plus', name: 'Priya Sharma', role: 'student',
      headline: 'IT Support Specialist',
      bio: 'Learning networking and security to move into an infrastructure role.',
    });
    const studentTom = await createUser(client, {
      email: 'tom.becker@cyberita.plus', name: 'Tom Becker', role: 'student',
      headline: 'Help Desk Technician',
      bio: 'Day-to-day support engineer expanding into Linux and cloud.',
    });

    // ---------- courses ----------
    const linuxCourse = await createCourse(client, {
      instructorId: instructorLinux,
      title: 'Linux Fundamentals for IT Professionals',
      slug: 'linux-fundamentals-it-professionals',
      summary: 'Master the Linux command line, filesystem, permissions and services through browser-based practical labs.',
      description: `## Why this course

Linux runs the modern data center. In this course you move from your first terminal session to confidently administering a Linux host.

### What you will learn
- Navigate and manipulate the filesystem with confidence
- Understand users, groups and permissions
- Manage services, packages and processes
- Troubleshoot a live system with standard diagnostic tools

### Requirements
- No prior Linux experience needed
- A browser — every lab runs in a simulated sandbox

### Who it's for
Help desk staff, junior sysadmins and anyone moving into IT operations.

Every module includes a **hands-on lab** running in your browser.`,
      category: 'Linux', level: 'beginner', durationHours: 14, price: 49,
      tags: ['linux', 'bash', 'sysadmin', 'beginner'],
      cover: '/images/courses/linux.svg',
    });

    const netCourse = await createCourse(client, {
      instructorId: instructorNet,
      title: 'Networking Essentials: TCP/IP & Troubleshooting',
      slug: 'networking-essentials-tcp-ip-troubleshooting',
      summary: 'Learn addressing, routing, DNS and step-by-step network troubleshooting with practical labs.',
      description: `## Build a rock-solid networking foundation

From the OSI model to real troubleshooting workflows, this course teaches you to diagnose connectivity problems the way professionals do.

### Highlights
- IPv4 addressing, subnets and gateways
- DNS, DHCP and the packet journey
- Diagnostic tools: ping, traceroute, netstat/ss, nmap
- Structured troubleshooting methodology

### Requirements
- Basic computer literacy
- No networking background required

### Who it's for
Support engineers, field technicians and aspiring network admins.`,
      category: 'Networking', level: 'beginner', durationHours: 12, price: 59,
      tags: ['networking', 'tcp-ip', 'dns', 'troubleshooting'],
      cover: '/images/courses/networking.svg',
    });

    const secCourse = await createCourse(client, {
      instructorId: instructorNet,
      title: 'Cybersecurity Foundations',
      slug: 'cybersecurity-foundations',
      summary: 'Confidentiality, integrity, availability — plus hardening, threats and defensive operations you can practice.',
      description: `## Think like a defender

Understand the CIA triad, common attack vectors and how to harden a system. You will practice on guided labs covering permissions, services and secure configuration.

### What you will learn
- Core security principles and threat models
- Least privilege, permissions and secure defaults
- Service hardening and patch awareness
- Reading logs and spotting suspicious activity

### Requirements
- Comfort with the command line is helpful
- Linux Fundamentals is recommended but not required`,
      category: 'Cybersecurity', level: 'beginner', durationHours: 10, price: 69,
      tags: ['security', 'cia', 'hardening', 'defensive'],
      cover: '/images/courses/security.svg',
    });

    const cloudCourse = await createCourse(client, {
      instructorId: instructorLinux,
      title: 'Cloud Infrastructure Foundations',
      slug: 'cloud-infrastructure-foundations',
      summary: 'Compute, storage and networking in the cloud — provider-agnostic concepts with real architecture patterns.',
      description: `## Cloud concepts that transfer everywhere

Virtual machines, object storage, VPCs, IAM and scaling. The course is provider-neutral so the knowledge applies to AWS, Azure, GCP and bare-metal providers alike.

### What you will learn
- Compute, storage and networking as cloud primitives
- Identity, access and the shared responsibility model
- Designing for cost, availability and scale
- A first look at infrastructure as code

### Requirements
- Networking Essentials or equivalent knowledge
- Basic Linux skills recommended`,
      category: 'Cloud', level: 'intermediate', durationHours: 11, price: 79,
      tags: ['cloud', 'aws', 'iaas', 'architecture'],
      cover: '/images/courses/cloud.svg',
    });

    const winCourse = await createCourse(client, {
      instructorId: instructorLinux,
      title: 'Windows Server Administration',
      slug: 'windows-server-administration',
      summary: 'Active Directory, GPO, storage and role services for modern Windows environments.',
      description: `## Run Windows Server with confidence

Domains, users, group policy, storage and monitoring — the core skills for a Windows administrator.

### What you will learn
- Deploying and joining Active Directory domains
- Managing users, groups and organizational units
- Group Policy design and troubleshooting
- Storage, roles and basic monitoring

### Requirements
- Basic Windows client experience
- No server administration experience needed`,
      category: 'Windows', level: 'intermediate', durationHours: 13, price: 64,
      status: 'draft',
      tags: ['windows', 'active-directory', 'gpo'],
      cover: '/images/courses/windows.svg',
    });

    const pythonCourse = await createCourse(client, {
      instructorId: instructorLinux,
      title: 'Python for IT Automation',
      slug: 'python-for-it-automation',
      summary: 'Automate repetitive IT tasks: files, APIs, logs and infrastructure scripting with Python.',
      description: `## Stop repeating yourself

Write scripts that manage files, call APIs, parse logs and talk to network devices. No prior programming experience required.

### What you will learn
- Python basics: variables, loops, functions and files
- Reading and parsing logs and CSV/JSON data
- Calling REST APIs and handling errors
- Automating routine admin tasks end to end

### Requirements
- A computer and a browser
- No programming experience required`,
      category: 'Automation', level: 'beginner', durationHours: 9, price: 39,
      tags: ['python', 'automation', 'scripting'],
      cover: '/images/courses/python.svg',
    });

    // ---------- linux course content ----------
    const lm1 = await createModule(client, linuxCourse.id, 'Getting Started with the Shell', 0, 'Orientation to the terminal and the Linux filesystem.');
    const lm2 = await createModule(client, linuxCourse.id, 'Users, Groups & Permissions', 1, 'Identity, ownership and access control.');
    const lm3 = await createModule(client, linuxCourse.id, 'Services & Troubleshooting', 2, 'Keep systems running and diagnose issues.');

    const ls1 = await createLesson(client, {
      courseId: linuxCourse.id, moduleId: lm1, position: 0, minutes: 10, free: true, type: 'video',
      title: 'Course Introduction & Lab Tour',
      videoUrl: 'https://videos.cyberita.plus/intro.mp4',
      content: `## Welcome to Linux Fundamentals

In this lesson you meet your instructor and take a tour of the CyberITA+ lab environment.

**By the end of this course you will be able to:**
- Move around the filesystem without thinking
- Manage permissions safely
- Diagnose what a Linux host is doing

> Tip: every module has a practical lab — learning happens in the terminal.`,
    });
    const ls2 = await createLesson(client, {
      courseId: linuxCourse.id, moduleId: lm1, position: 1, minutes: 18,
      title: 'Navigating the Filesystem',
      content: `## The filesystem hierarchy

Linux organizes everything under one root directory (\`/\`).

| Path | Purpose |
|------|---------|
| \`/home\` | User home directories |
| \`/etc\` | System configuration |
| \`/var\` | Logs and changing data |
| \`/tmp\` | Temporary files |

### Essential commands
\`\`\`bash
pwd            # where am I?
ls -la         # list everything, long format
cd /etc        # change directory
cat /etc/os-release   # read a file
\`\`\`

Practice these in the **File System Navigation lab**.`,
    });
    const ls3 = await createLesson(client, {
      courseId: linuxCourse.id, moduleId: lm1, position: 2, minutes: 15, type: 'lab',
      title: 'Lab: File System Navigation',
      content: `## Hands-on lab

Apply everything from this module in a live terminal:

1. Confirm your location with \`pwd\`
2. Inspect the directory with \`ls -l\`
3. Create \`practice/\` and a notes file
4. Read \`welcome.txt\`

Complete every step to unlock report generation.`,
    });
    const ls4 = await createLesson(client, {
      courseId: linuxCourse.id, moduleId: lm2, position: 3, minutes: 20,
      title: 'Users, Groups and the /etc/passwd File',
      content: `## Identity on Linux

Every process runs as a user. Key files:

\`\`\`bash
cat /etc/passwd    # users and their shells
id                 # your identity right now
groups             # group membership
\`\`\`

\`uid\` 0 is root — treat it with respect.`,
    });
    const ls5 = await createLesson(client, {
      courseId: linuxCourse.id, moduleId: lm2, position: 4, minutes: 22, type: 'lab',
      title: 'Lab: Permissions in Practice',
      content: `## Hands-on lab

Create and protect a deployment script:

- Inspect permissions with \`ls -l\`
- Make a script executable with \`chmod\`
- Verify identity with \`id\` and \`whoami\``,
    });
    const ls6 = await createLesson(client, {
      courseId: linuxCourse.id, moduleId: lm3, position: 5, minutes: 18,
      title: 'Processes, Services and Logs',
      content: `## What is the system doing?

\`\`\`bash
ps aux           # running processes
df -h            # disk usage
free -m          # memory usage
systemctl status nginx
tail -f /var/log/syslog
\`\`\`

These four commands answer most "what is wrong?" questions.`,
    });
    const ls7 = await createLesson(client, {
      courseId: linuxCourse.id, moduleId: lm3, position: 6, minutes: 25,
      title: 'Troubleshooting Methodology',
      content: `## A repeatable method

1. **Define** the symptom precisely
2. **Collect** data (logs, metrics, config)
3. **Form** a hypothesis
4. **Test** one change at a time
5. **Document** the fix

Write down what you change — future you will be grateful.`,
    });

    await createQuiz(client, {
      courseId: linuxCourse.id, lessonId: ls2, title: 'Filesystem Fundamentals Check',
      description: 'Verify your understanding of the filesystem module.', passScore: 70,
      questions: [
        { question: 'Which command prints the current working directory?', options: ['pwd', 'ls', 'cd', 'whoami'], correct: 0, explanation: 'pwd = print working directory.' },
        { question: 'Which directory holds system configuration files?', options: ['/var', '/tmp', '/etc', '/home'], correct: 2, explanation: '/etc stores configuration.' },
        { question: 'What does `ls -la` do?', options: ['Lists all files including hidden, in long format', 'Deletes all files', 'Logs out of the shell', 'Lists only directories'], correct: 0, explanation: '-a includes dotfiles, -l uses long listing.' },
        { question: 'Which file lists every user account on the system?', options: ['/etc/hosts', '/etc/passwd', '/etc/shadow', '~/.bashrc'], correct: 1, explanation: '/etc/passwd contains user account records.' },
      ],
    });

    await createQuiz(client, {
      courseId: linuxCourse.id, title: 'Permissions Quiz', passScore: 70,
      questions: [
        { question: 'What does chmod 750 grant the owner?', options: ['Read/write/execute', 'Read only', 'Nothing', 'Execute only'], correct: 0, explanation: '7 = rwx for the owner.' },
        { question: 'Which command shows your effective identity?', options: ['id', 'ls', 'df', 'cat'], correct: 0, explanation: 'id prints uid/gid/groups.' },
        { question: 'Who is uid 0?', options: ['student', 'root', 'nobody', 'daemon'], correct: 1, explanation: 'uid 0 is the root superuser.' },
      ],
    });

    const linuxAssignment = await createAssignment(client, {
      courseId: linuxCourse.id, lessonId: ls7, points: 100, dueInDays: 14,
      title: 'Linux Troubleshooting Case Study',
      description: `A web service is unreachable on a Linux host.

Write a structured report (500+ words) covering:
1. The commands you would run to collect data (with examples)
2. How you would interpret the output
3. The order of your checks and why
4. The final fix you would apply

Submit your case study as Markdown.`,
    });

    // ---------- networking course content ----------
    const nm1 = await createModule(client, netCourse.id, 'How Networks Communicate', 0);
    const nm2 = await createModule(client, netCourse.id, 'Diagnosing Network Problems', 1);

    const ns1 = await createLesson(client, {
      courseId: netCourse.id, moduleId: nm1, position: 0, minutes: 16, free: true,
      title: 'The OSI Model, Practically',
      content: `## Seven layers, three that matter daily

You do not need to memorize all seven layers to troubleshoot — but you must know where to look:

- **Layer 3 (Network)** — addressing, routing: \`ping\`, \`ip addr\`
- **Layer 4 (Transport)** — ports: \`ss -tuln\`
- **Application** — DNS and HTTP: \`curl\`, \`dig\`

Work bottom-up when the evidence is unclear.`,
    });
    const ns2 = await createLesson(client, {
      courseId: netCourse.id, moduleId: nm1, position: 1, minutes: 20,
      title: 'IP Addressing & Subnetting',
      content: `## Speaking in CIDR

\`\`\`
192.168.10.0/24  → 256 addresses, usable .1 - .254
10.0.0.0/8       → private, 16.7M addresses
\`\`\`

**Rule of thumb:** /24 = one office subnet; /32 = a single host.`,
    });
    const ns3 = await createLesson(client, {
      courseId: netCourse.id, moduleId: nm2, position: 2, minutes: 30, type: 'lab',
      title: 'Lab: Network Troubleshooting Toolkit',
      content: `## Hands-on lab

Use the terminal to:

1. Verify connectivity with \`ping\`
2. Inspect interfaces with \`ifconfig\`
3. List listening ports with \`ss -tuln\`
4. Run a service scan with \`nmap\`

Each command mirrors real-world diagnostics.`,
    });

    await createQuiz(client, {
      courseId: netCourse.id, lessonId: ns1, title: 'Networking Basics Check', passScore: 60,
      questions: [
        { question: 'Which layer handles IP addressing?', options: ['Layer 2 — Data Link', 'Layer 3 — Network', 'Layer 4 — Transport', 'Layer 7 — Application'], correct: 1, explanation: 'IP is a Layer 3 protocol.' },
        { question: 'What does `ss -tuln` show?', options: ['Disk usage', 'Listening sockets with numeric ports', 'Routing table', 'User sessions'], correct: 1, explanation: 'ss lists sockets; -tuln = tcp/udp listening, numeric.' },
        { question: 'Which address range is private?', options: ['8.8.8.0/24', '192.168.0.0/16', '1.1.1.0/24', '93.184.0.0/16'], correct: 1, explanation: '192.168.0.0/16 (and 10/8, 172.16/12) are RFC1918 private ranges.' },
        { question: 'Default HTTP port?', options: ['21', '22', '80', '443'], correct: 2, explanation: 'HTTP = 80, HTTPS = 443.' },
      ],
    });

    // ---------- security course content ----------
    const sm1 = await createModule(client, secCourse.id, 'Security Fundamentals', 0);
    const ss1 = await createLesson(client, {
      courseId: secCourse.id, moduleId: sm1, position: 0, minutes: 15, free: true,
      title: 'The CIA Triad in Practice',
      content: `## Confidentiality · Integrity · Availability

Every security control you will ever evaluate serves one of these goals.

- **Confidentiality** — encryption, access control
- **Integrity** — hashing, versioning, least privilege
- **Availability** — redundancy, backups, patching

When a control fails, ask: *which pillar fell?*`,
    });
    const ss2 = await createLesson(client, {
      courseId: secCourse.id, moduleId: sm1, position: 1, minutes: 20,
      title: 'Hardening a Linux Host',
      content: `## Baseline hardening checklist

1. Remove or disable unused services
2. Enforce key-based SSH, disable root login
3. Apply least-privilege permissions
4. Configure log forwarding and monitoring
5. Patch on a defined schedule

\`\`\`bash
ss -tuln           # what is exposed?
systemctl list-units --type=service --state=running
\`\`\``,
    });

    await createQuiz(client, {
      courseId: secCourse.id, title: 'Security Fundamentals Check', passScore: 60,
      questions: [
        { question: 'Backup restoration primarily protects…', options: ['Confidentiality', 'Integrity', 'Availability', 'Non-repudiation'], correct: 2, explanation: 'Backups keep services available.' },
        { question: 'Least privilege means…', options: ['Everyone gets admin', 'Users get only the access they need', 'Disable all firewalls', 'Share one account'], correct: 1, explanation: 'Minimum necessary access.' },
        { question: 'Which tool shows listening ports?', options: ['ss -tuln', 'df -h', 'chmod', 'uname -a'], correct: 0, explanation: 'ss shows sockets.' },
      ],
    });

    // ---------- cloud lessons ----------
    const cm1 = await createModule(client, cloudCourse.id, 'Cloud Concepts', 0);
    await createLesson(client, {
      courseId: cloudCourse.id, moduleId: cm1, position: 0, minutes: 18, free: true,
      title: 'IaaS, PaaS, SaaS — and when to use each',
      content: `## The shared responsibility model

- **IaaS** — you manage OS and up (VMs)
- **PaaS** — you manage code and data only
- **SaaS** — you manage configuration and users

Choose the lowest layer of management you actually need.`,
    });
    await createLesson(client, {
      courseId: cloudCourse.id, moduleId: cm1, position: 1, minutes: 22,
      title: 'Regions, Zones and VPCs',
      content: `## Placement decisions

- **Region** — geographic location of resources
- **Zone** — isolated data center inside a region
- **VPC** — your private network in the cloud

Design for failure: spread critical workloads across zones.`,
    });

    // ---------- python lessons ----------
    const pm1 = await createModule(client, pythonCourse.id, 'Automation Basics', 0);
    await createLesson(client, {
      courseId: pythonCourse.id, moduleId: pm1, position: 0, minutes: 15, free: true,
      title: 'Why Python for IT?',
      content: `## The IT glue language

Python reads like pseudocode, runs everywhere, and has libraries for everything:

\`\`\`python
import shutil
shutil.copy('backup.conf', '/backups/backup.conf')
print('Backup copied.')
\`\`\``,
    });

    // ---------- labs ----------
    const linuxLab = await createLab(client, {
      createdBy: instructorLinux, courseId: linuxCourse.id, lessonId: ls3,
      slug: 'linux-fs-navigation',
      title: 'Linux File System Navigation',
      summary: 'Navigate, inspect and create files and directories in a simulated Linux shell.',
      description: `Practice the core navigation commands in a safe, simulated environment. Every command is verified automatically.`,
      difficulty: 'beginner', minutes: 25,
      welcome: 'CyberITA+ Linux lab — navigate the filesystem to complete the steps on the left.',
    });
    await createSteps(client, linuxLab, [
      { title: 'Confirm your location', instruction: 'Print the current working directory to see where the shell starts you out.', command: 'pwd', points: 10 },
      { title: 'List the directory contents', instruction: 'List all files (including hidden ones) in long format.', command: 'ls -la', points: 15 },
      { title: 'Read the welcome file', instruction: 'Display the contents of `welcome.txt` in your home directory.', command: 'cat welcome.txt', points: 15 },
      { title: 'Create a practice directory', instruction: 'Create a new directory named `practice`.', command: 'mkdir practice', points: 15 },
      { title: 'Create a notes file', instruction: 'Create an empty file called `notes.txt` in the current directory.', command: 'touch notes.txt', points: 15 },
      { title: 'Inspect /etc/os-release', instruction: 'Read the OS release file to identify the distribution.', command: 'cat /etc/os-release', points: 15 },
      { title: 'Confirm your identity', instruction: 'Print the current username.', command: 'whoami', points: 15 },
      { title: 'Review your work', instruction: 'Run `ls -la` again and confirm `practice` and `notes.txt` exist. Tick this manual step when done.', verification: 'manual', points: 0, optional: true },
    ]);

    const permLab = await createLab(client, {
      createdBy: instructorLinux, courseId: linuxCourse.id, lessonId: ls5,
      slug: 'linux-permissions-lab',
      title: 'Users, Groups & Permissions',
      summary: 'Inspect ownership, apply chmod and verify identity on a simulated host.',
      description: `Work with a pre-staged deployment script and apply the principle of least privilege.`,
      difficulty: 'beginner', minutes: 30,
      welcome: 'Permissions lab — a deploy.sh script is waiting in your home directory.',
      files: studentFs((fs) => {
        fs['/'].children.home.children.student.children['deploy.sh'] = fileNode(
          '#!/bin/bash\necho "Deploying application..."\n', '-rw-r--r--'
        );
      }),
    });
    await createSteps(client, permLab, [
      { title: 'Identify yourself', instruction: 'Print your current username.', command: 'whoami', points: 10 },
      { title: 'Show your identity details', instruction: 'Display uid, gid and group membership.', command: 'id', points: 15 },
      { title: 'Inspect current permissions', instruction: 'List all files in long format to see the permission bits of `deploy.sh`.', command: 'ls -la', points: 15 },
      { title: 'Make the script executable for owner', instruction: 'Give the owner execute permission on `deploy.sh` using octal mode 750.', command: 'chmod 750 deploy.sh', points: 25 },
      { title: 'Verify the change', instruction: 'List the file again and confirm the mode now shows `rwxr-x---`.', command: 'ls -la deploy.sh', points: 20 },
      { title: 'Document your reasoning', instruction: 'In your own words (tick when done): why should a deploy script never be world-writable?', verification: 'manual', points: 15, optional: true },
    ]);

    const netLab = await createLab(client, {
      createdBy: instructorNet, courseId: netCourse.id, lessonId: ns3,
      slug: 'network-troubleshooting-basics',
      title: 'Network Troubleshooting Toolkit',
      summary: 'Run the core diagnostic commands every network troubleshooter relies on.',
      description: `Verify connectivity, inspect interfaces and ports, and run a quick service scan — all in the browser.`,
      difficulty: 'intermediate', minutes: 30,
      welcome: 'Network lab — use the diagnostic toolkit to find out how this host is connected.',
    });
    await createSteps(client, netLab, [
      { title: 'Check basic connectivity', instruction: 'Ping google.com three times using the count option.', command: 'ping -c 3 google.com', points: 20 },
      { title: 'Inspect network interfaces', instruction: 'Display interface configuration (addresses, masks, counters).', command: 'ifconfig', points: 20 },
      { title: 'Check the routing table', instruction: 'Show the IP routing table with the `ip` command.', command: 'ip route', points: 20 },
      { title: 'List listening ports', instruction: 'Show listening TCP/UDP sockets with numeric ports.', command: 'ss -tuln', points: 20 },
      { title: 'Scan local services', instruction: 'Run a basic service scan against localhost.', command: 'nmap localhost', points: 20 },
      { title: 'Summarize your findings', instruction: 'Tick when you can name the gateway IP and the listening web port.', verification: 'manual', points: 0, optional: true },
    ]);

    // ---------- learning paths ----------
    const pathOps = await client.query(
      `INSERT INTO learning_paths (slug, title, description, level, cover_image, status)
       VALUES ('it-operations-career-track', 'IT Operations Career Track',
         'A structured route from fundamentals to operating production systems: Linux, networking and troubleshooting.',
         'beginner', '/images/paths/operations.svg', 'published') RETURNING id`
    );
    const pathSec = await client.query(
      `INSERT INTO learning_paths (slug, title, description, level, cover_image, status)
       VALUES ('cybersecurity-analyst-track', 'Cybersecurity Analyst Track',
         'Build the defensive security base every analyst needs: core principles, hardening and network visibility.',
         'intermediate', '/images/paths/security.svg', 'published') RETURNING id`
    );
    await client.query(
      `INSERT INTO learning_path_courses (path_id, course_id, position) VALUES ($1,$2,0),($1,$3,1),($1,$4,2)`,
      [pathOps.rows[0].id, linuxCourse.id, netCourse.id, pythonCourse.id]
    );
    await client.query(
      `INSERT INTO learning_path_courses (path_id, course_id, position) VALUES ($1,$2,0),($1,$3,1)`,
      [pathSec.rows[0].id, secCourse.id, netCourse.id]
    );

    // ---------- enrollments & progress ----------
    await client.query(
      `INSERT INTO enrollments (user_id, course_id, status, progress_percent, enrolled_at, completed_at)
       VALUES ($1, $2, 'active', 0, now() - INTERVAL '10 days', NULL),
              ($1, $3, 'active', 0, now() - INTERVAL '6 days', NULL),
              ($4, $2, 'active', 0, now() - INTERVAL '9 days', NULL),
              ($4, $5, 'active', 0, now() - INTERVAL '3 days', NULL),
              ($6, $2, 'active', 0, now() - INTERVAL '2 days', NULL)`,
      [studentAlex, linuxCourse.id, netCourse.id, studentPriya, secCourse.id, studentTom]
    );

    // Alex completes two lessons of the Linux course
    for (const lessonId of [ls1, ls2]) {
      await client.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, course_id, status, time_spent_seconds, completed_at)
         VALUES ($1, $2, $3, 'completed', 600, now() - INTERVAL '1 day')
         ON CONFLICT (user_id, lesson_id) DO NOTHING`,
        [studentAlex, lessonId, linuxCourse.id]
      );
    }
    const { rows: lessonTotal } = await client.query(
      `SELECT COUNT(*)::int AS n FROM lessons WHERE course_id = $1`, [linuxCourse.id]
    );
    const alexPercent = Math.round((2 / lessonTotal[0].n) * 100);
    await client.query(`UPDATE enrollments SET progress_percent = $1 WHERE user_id = $2 AND course_id = $3`, [alexPercent, studentAlex, linuxCourse.id]);

    // ---------- completed lab session + report (Priya) ----------
    const { rows: labStepRows } = await client.query(
      `SELECT * FROM lab_steps WHERE lab_id = $1 ORDER BY position`, [linuxLab]
    );
    const { rows: sessionRows } = await client.query(
      `INSERT INTO lab_sessions (lab_id, user_id, provider, instance_id, status, history, fs_state, cwd, started_at, last_activity_at, ended_at, expires_at)
       VALUES ($1, $2, 'mock', 'mock-seeded0001', 'stopped',
         $3, $4, '/home/student', now() - INTERVAL '3 days', now() - INTERVAL '3 days', now() - INTERVAL '3 days', now() + INTERVAL '30 days')
       RETURNING id`,
      [linuxLab, studentPriya, JSON.stringify([
        { role: 'user', text: 'pwd', at: new Date(Date.now() - 3 * 864e5).toISOString() },
        { role: 'output', text: '/home/student', exitCode: 0, at: new Date(Date.now() - 3 * 864e5).toISOString() },
        { role: 'user', text: 'ls -la', at: new Date(Date.now() - 3 * 864e5).toISOString() },
        { role: 'output', text: 'total 12\ndrwxr-xr-x 4 student student 4096 Oct 20 10:00 .\n-rw-r--r-- 1 student student  120 Oct 20 10:00 welcome.txt', exitCode: 0, at: new Date(Date.now() - 3 * 864e5).toISOString() },
      ]), JSON.stringify(studentFs())]
    );
    const seededSessionId = sessionRows[0].id;
    for (const step of labStepRows) {
      if (step.verification === 'manual') continue;
      await client.query(
        `INSERT INTO lab_step_progress (session_id, step_id, command_used, output_excerpt, completed_at)
         VALUES ($1, $2, $3, $4, now() - INTERVAL '3 days') ON CONFLICT DO NOTHING`,
        [seededSessionId, step.id, step.expected_command, `simulated output for: ${step.expected_command}`]
      );
    }
    const { rows: reportRow } = await client.query(
      `INSERT INTO reports (session_id, lab_id, user_id, title, summary, content, sections, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', now() - INTERVAL '2 days', now() - INTERVAL '2 days')
       RETURNING id`,
      [seededSessionId, linuxLab, studentPriya,
       'Practical Report: Linux File System Navigation',
       'Hands-on report covering the verified steps of the Linux File System Navigation lab.',
       `# Practical Report: Linux File System Navigation

**Lab:** Linux File System Navigation
**Course:** Linux Fundamentals for IT Professionals
**Prepared by:** Priya Sharma
**Date:** 2026-10-18

---

## 1. Confirm your location

\`\`\`bash
pwd
\`\`\`

**Output:**
\`\`\`
/home/student
\`\`\`

**Result:** Completed and verified.

---

## 2. List the directory contents

\`\`\`bash
ls -la
\`\`\`

**Result:** Completed and verified.
`,
       JSON.stringify(labStepRows.filter((s) => s.verification !== 'manual').map((s) => ({
         stepId: s.id, title: s.title, instruction: s.instruction,
         command: s.expected_command, output: `simulated output for: ${s.expected_command}`,
         result: 'Completed and verified.', screenshots: [], notes: '',
       })))]
    );
    await client.query(
      `INSERT INTO activity_events (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'lab.started', 'lab', $2, '{"seeded": true}'),
              ($1, 'lab.completed', 'lab', $2, '{"seeded": true}'),
              ($1, 'report.submitted', 'report', $3, '{"seeded": true}')`,
      [studentPriya, linuxLab, reportRow[0].id]
    );

    // Alex completes the Linux course fully → certificate
    for (const lessonId of [ls3, ls4, ls5, ls6, ls7]) {
      await client.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, course_id, status, time_spent_seconds, completed_at)
         VALUES ($1, $2, $3, 'completed', 900, now() - INTERVAL '12 hours')
         ON CONFLICT (user_id, lesson_id) DO NOTHING`,
        [studentAlex, lessonId, linuxCourse.id]
      );
    }
    await client.query(
      `UPDATE enrollments SET progress_percent = 100, status = 'completed', completed_at = now() - INTERVAL '12 hours'
       WHERE user_id = $1 AND course_id = $2`,
      [studentAlex, linuxCourse.id]
    );
    await client.query(
      `INSERT INTO certificates (serial, user_id, course_id, final_progress, issued_at)
       VALUES ($1, $2, $3, 100, now() - INTERVAL '12 hours') ON CONFLICT DO NOTHING`,
      [certificateSerial(), studentAlex, linuxCourse.id]
    );
    await client.query(
      `INSERT INTO activity_events (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'course.completed', 'course', $2, '{"seeded": true}'),
              ($1, 'account.registered', NULL, NULL, '{"seeded": true}'),
              ($3, 'account.registered', NULL, NULL, '{"seeded": true}'),
              ($4, 'account.registered', NULL, NULL, '{"seeded": true}'),
              ($5, 'account.registered', NULL, NULL, '{"seeded": true}'),
              ($6, 'account.registered', NULL, NULL, '{"seeded": true}'),
              ($7, 'account.registered', NULL, NULL, '{"seeded": true}')`,
      [studentAlex, linuxCourse.id, studentPriya, studentTom, adminId, instructorLinux, instructorNet]
    );

    // ---------- assignment submission (Tom) ----------
    await client.query(
      `INSERT INTO assignment_submissions (assignment_id, user_id, content, status, submitted_at)
       VALUES ($1, $2, $3, 'submitted', now() - INTERVAL '1 day')`,
      [linuxAssignment, studentTom,
       `# Troubleshooting case study

1. **Collect data:** \`ss -tuln\`, \`systemctl status\`, \`journalctl -u app\`, \`df -h\`, \`free -m\`
2. **Interpret:** no listening port → service down; high memory → OOM; full disk → logs cannot rotate
3. **Order:** verify process → verify port → verify logs → verify resources
4. **Fix:** restart the unit, patch the config drift, add monitoring for disk usage.`]
    );
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, 'submission', 'New assignment submission', 'Tom Becker submitted "Linux Troubleshooting Case Study".', '/instructor/submissions')`,
      [instructorLinux]
    );

    // ---------- blog posts ----------
    const post1 = await client.query(
      `INSERT INTO posts (slug, title, excerpt, content, author_id, status, tags, published_at)
       VALUES ('five-linux-commands-every-admin-needs',
         '5 Linux Commands Every Administrator Needs Daily',
         'pwd, ls, grep, systemctl and journalctl — the everyday commands that solve 80% of Linux questions.',
         $1, $2, 'published', ARRAY['linux','sysadmin','productivity'], now() - INTERVAL '9 days') RETURNING id`,
      [`# 5 Linux Commands Every Administrator Needs Daily

Administration is mostly observation. These five commands answer most day-to-day questions.

## 1. pwd — where am I?
\`\`\`bash
pwd
\`\`\`
Sounds trivial until you have six terminal tabs open.

## 2. ls — what is here?
\`\`\`bash
ls -la
\`\`\`

## 3. grep — find the line that matters
\`\`\`bash
grep ERROR /var/log/syslog | tail -20
\`\`\`

## 4. systemctl — what state is the service in?
\`\`\`bash
systemctl status nginx
\`\`\`

## 5. journalctl — what happened over time?
\`\`\`bash
journalctl -u nginx --since "1 hour ago"
\`\`\`

> Learn these deeply in the **Linux Fundamentals** course — every one of them appears in the labs.`, instructorLinux]
    );
    await client.query(
      `INSERT INTO posts (slug, title, excerpt, content, author_id, status, tags, published_at)
       VALUES ('structured-network-troubleshooting',
         'A Structured Approach to Network Troubleshooting',
         'Stop guessing. A repeatable method for diagnosing connectivity problems from cable to application.',
         $1, $2, 'published', ARRAY['networking','troubleshooting'], now() - INTERVAL '5 days')`,
      [`# A Structured Approach to Network Troubleshooting

Random fixes teach you nothing. Use a method.

## 1. Define the symptom
"One user cannot reach the app" and "the whole site is down" are different problems.

## 2. Start at the bottom of the stack
- Link lights / \`ip link\`
- Addressing / \`ip addr\`
- Gateway / \`ip route\`
- Name resolution / \`dig\`
- Port / \`ss -tuln\`
- Application / \`curl -v\`

## 3. Change one thing at a time
Every change is a hypothesis test.

## 4. Document
Write down commands and outputs as you go — your future report (or ticket) writes itself.

> Practice each layer in the **Network Troubleshooting Toolkit** lab.`, instructorNet]
    );
    await client.query(
      `INSERT INTO posts (slug, title, excerpt, content, author_id, status, tags, published_at)
       VALUES ('least-privilege-explained',
         'Least Privilege, Explained with Real Examples',
         'The single most effective security control — and how to apply it to users, services and scripts.',
         $1, $2, 'published', ARRAY['security','permissions'], now() - INTERVAL '2 days')`,
      [`# Least Privilege, Explained with Real Examples

Least privilege says: **grant the minimum access needed to do the job — nothing more.**

## Why it matters
If an account is compromised, the blast radius equals its permissions.

## Practical examples
| Scenario | Too much | Just right |
|----------|----------|------------|
| Deploy script | \`chmod 777\` | \`chmod 750\` |
| App service | runs as root | dedicated \`svc-app\` user |
| CI token | admin of everything | write access to one repo |

## How to check
\`\`\`bash
id
ls -l /path/to/secret
ss -tuln
\`\`\`

> Apply the pattern in the **Users, Groups & Permissions** lab.`, instructorNet]
    );

    // ---------- notifications & contact ----------
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES
        ($1, 'system', 'Welcome to CyberITA+', 'Explore your dashboard, enroll in a course and start your first lab.', '/'),
        ($2, 'review', 'Report submitted for review', 'Priya Sharma submitted "Practical Report: Linux File System Navigation".', '/instructor/reports'),
        ($3, 'certificate', 'Course completed — certificate issued!', 'Congratulations on completing Linux Fundamentals!', '/student/certificates'),
        ($4, 'enrollment', 'Welcome to Linux Fundamentals for IT Professionals', 'Your enrollment is confirmed.', '/learn/linux-fundamentals-it-professionals')`,
      [studentTom, instructorLinux, studentAlex, studentPriya]
    );

    await client.query(
      `INSERT INTO contact_messages (name, email, subject, message, status, created_at)
       VALUES ('Jorge Alvarez', 'jorge@company.example', 'Corporate training inquiry',
         'We are interested in enrolling our 12-person infrastructure team into the Linux and Networking tracks. Do you offer team pricing?',
         'new', now() - INTERVAL '2 days')`
    );

    // ---------- a graded quiz attempt ----------
    await client.query(
      `INSERT INTO quiz_attempts (quiz_id, user_id, score, max_points, passed, answers, created_at)
       SELECT q.id, $1, 4, 4, TRUE, '[]'::jsonb, now() - INTERVAL '1 day'
       FROM quizzes q WHERE q.title = 'Filesystem Fundamentals Check' LIMIT 1`,
      [studentAlex]
    );
  });

  logger.info(`Seed completed in ${((Date.now() - started) / 1000).toFixed(1)}s`, { password: PASSWORD });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  seed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error('Seed failed', { error: error.message, stack: error.stack });
      await pool.end();
      process.exit(1);
    });
}

export { seed };
