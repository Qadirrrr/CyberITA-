/**
 * Intelligent Quiz Generation Service for CyberITA+
 * Automatically generates domain-specific MCQs and Subjective Scenario questions
 * based on topic/title, difficulty, and requested question counts.
 */

// Knowledge bank of specialized cybersecurity and IT domains
const DOMAIN_BANKS = {
  web_security: {
    match: ['web', 'xss', 'sql', 'sqli', 'injection', 'csrf', 'ssrf', 'owasp', 'jwt', 'auth', 'cookie', 'api', 'cors', 'session'],
    mcqTemplates: [
      {
        question: 'Which defense mechanism provides the most robust protection against SQL Injection attacks?',
        options: [
          'Using parameterized queries / prepared statements with bounded variables',
          'Relying solely on client-side regex input sanitation',
          'Escaping only single quote characters in URL query strings',
          'Restricting database queries to GET requests only',
        ],
        correctOption: 0,
        explanation: 'Parameterized queries ensure the database treats user input strictly as data rather than executable SQL commands.',
      },
      {
        question: 'What is the primary mechanism through which Stored (Persistent) Cross-Site Scripting (XSS) occurs?',
        options: [
          'Malicious payload is permanently saved in the database and executed whenever victims load the page',
          'Payload reflects off server error messages within a single immediate request',
          'Attacker modifies client-side JavaScript execution via DOM manipulation only',
          'Attacker intercepts and decrypts TLS traffic using a forged CA certificate',
        ],
        correctOption: 0,
        explanation: 'Stored XSS stores the malicious script directly in backend storage (e.g. comments, profiles), rendering it to all viewers.',
      },
      {
        question: 'Which HTTP response header is specifically designed to mitigate Clickjacking attacks?',
        options: [
          'X-Frame-Options: DENY or Content-Security-Policy with frame-ancestors',
          'Access-Control-Allow-Origin: *',
          'Strict-Transport-Security: max-age=31536000',
          'Cache-Control: no-store',
        ],
        correctOption: 0,
        explanation: 'X-Frame-Options and CSP frame-ancestors prevent malicious parent pages from framing the web application inside an invisible iframe.',
      },
      {
        question: 'What security risk occurs when Cross-Origin Resource Sharing (CORS) is configured with "Access-Control-Allow-Origin: *" and credentials enabled?',
        options: [
          'Browsers block the configuration, but improper origin reflection can leak authenticated session data to untrusted origins',
          'The server automatically shuts down all WebSocket connections',
          'It forces all incoming HTTP requests to downgrade to plain HTTP',
          'It causes database connection pools to immediately exhaust',
        ],
        correctOption: 0,
        explanation: 'Reflecting arbitrary origins with credentials allows malicious third-party origins to execute authenticated cross-origin reads.',
      },
      {
        question: 'In modern JSON Web Token (JWT) implementations, which vulnerability allows signature bypass if unverified?',
        options: [
          'Accepting tokens signed with the "none" algorithm or failing to strictly enforce symmetric vs asymmetric key algorithms',
          'Using SHA-256 for password hashing instead of bcrypt',
          'Setting expiration timestamps within a 15-minute window',
          'Encoding payloads in standard Base64URL format',
        ],
        correctOption: 0,
        explanation: 'If a backend accepts alg: "none" or confuses RSA public keys as HMAC secrets, attackers can forge arbitrary valid tokens.',
      },
      {
        question: 'What distinguishes Server-Side Request Forgery (SSRF) from Cross-Site Request Forgery (CSRF)?',
        options: [
          'SSRF causes the backend server to make unauthorized requests to internal network services, while CSRF forces a user browser to make requests',
          'SSRF only impacts static HTML pages without databases',
          'CSRF is executed on internal network routers without browser participation',
          'SSRF requires physical access to the target host server',
        ],
        correctOption: 0,
        explanation: 'SSRF targets backend server network calls (e.g. cloud metadata services), whereas CSRF exploits browser session trust.',
      },
    ],
    subjectiveTemplates: [
      {
        question: '[Subjective Scenario] An e-commerce platform discovers that unauthorized orders are being placed using legitimate customer accounts without password changes. Logs show requests arriving with valid session cookies from external IPs. How should the security team evaluate this root cause and architect a permanent defense?',
        options: [
          'Assess for Cross-Site Request Forgery (CSRF) or session hijacking via XSS; enforce SameSite=Strict cookies, Anti-CSRF synchronizer tokens, and rotate sessions on privilege changes',
          'Re-index the database tables and increase memory allocation for the web server processes',
          'Disable TLS 1.3 and revert to TLS 1.1 to simplify perimeter packet inspection',
          'Assume customer credentials were brute-forced and lengthen the minimum password length to 30 characters without code changes',
        ],
        correctOption: 0,
        explanation: 'Unauthorized actions with valid session cookies indicate CSRF or session fixation/hijacking. Mitigation requires SameSite cookies, per-request anti-CSRF tokens, strict origin verification, and re-authentication on critical actions.',
      },
      {
        question: '[Subjective Scenario] During a vulnerability assessment, you identify that an API endpoint accepts arbitrary user-supplied URLs to generate PDF report previews. The server runs inside an AWS VPC. Analyze the architectural risk and select the most comprehensive defense strategy.',
        options: [
          'Severe SSRF risk targeting AWS IMDSv1 metadata (169.254.169.254); require IMDSv2 with token hops, place the renderer in an isolated egress-restricted subnet, and validate URLs against a strict domain whitelist',
          'Low risk because PDF files cannot execute SQL queries on the database',
          'Fix by simply renaming the API endpoint and obscuring the parameter name with base64 encoding',
          'Block only the word "localhost" in the input string while allowing all private IP ranges',
        ],
        correctOption: 0,
        explanation: 'SSRF in cloud environments can expose IAM credentials via instance metadata. A resilient solution combines network egress filtering, IMDSv2 enforcement, and strict URL scheme/hostname allowlisting.',
      },
    ],
  },

  network_security: {
    match: ['network', 'firewall', 'snort', 'packet', 'wireshark', 'tcp', 'ip', 'udp', 'port', 'dns', 'vpn', 'router', 'ids', 'ips'],
    mcqTemplates: [
      {
        question: 'During a TCP three-way handshake, what flags are exchanged in sequence between client and server?',
        options: [
          'SYN -> SYN-ACK -> ACK',
          'ACK -> SYN -> ACK-SYN',
          'FIN -> ACK -> FIN-ACK',
          'RST -> SYN -> ACK',
        ],
        correctOption: 0,
        explanation: 'The TCP handshake begins with the client sending SYN, the server responding with SYN-ACK, and the client confirming with ACK.',
      },
      {
        question: 'Which protocol operates at the Transport Layer (Layer 4) and provides connectionless, low-latency transmission without guaranteed delivery?',
        options: [
          'UDP (User Datagram Protocol)',
          'TCP (Transmission Control Protocol)',
          'ICMP (Internet Control Message Protocol)',
          'BGP (Border Gateway Protocol)',
        ],
        correctOption: 0,
        explanation: 'UDP provides minimal connectionless datagram delivery without handshakes, retransmissions, or flow control overhead.',
      },
      {
        question: 'In Wireshark packet analysis, which display filter expression filters for DNS traffic specifically from or to IP 192.168.1.50?',
        options: [
          'dns && ip.addr == 192.168.1.50',
          'tcp.port == 53 || arp.ip == 192.168.1.50',
          'ip.dest == 192.168.1.50 -> port 80',
          'filter: host 192.168.1.50 and icmp',
        ],
        correctOption: 0,
        explanation: '"dns && ip.addr == 192.168.1.50" matches DNS protocol frames involving the specified host as either source or destination.',
      },
      {
        question: 'What is the primary difference between a Network Intrusion Detection System (NIDS) and a Network Intrusion Prevention System (NIPS)?',
        options: [
          'NIDS passively monitors and alerts on copied traffic, whereas NIPS sits inline to actively drop or terminate malicious packets',
          'NIDS encrypts network packets while NIPS inspects cleartext application payloads',
          'NIPS operates only on physical cables while NIDS operates only in wireless networks',
          'NIDS automatically patches vulnerable host servers on detection',
        ],
        correctOption: 0,
        explanation: 'NIDS detects and alerts passively (often via TAP/SPAN port), whereas NIPS sits inline in the traffic path to block threats in real time.',
      },
      {
        question: 'What security risk does DNS Amplification exploit in Distributed Denial of Service (DDoS) attacks?',
        options: [
          'Spoofed source IP requests sent to open recursive resolvers yielding much larger response payloads directed at the victim',
          'Exhaustion of local DHCP pool addresses on internal switches',
          'Injecting forged TLS certificates into router firmware caches',
          'Modifying authoritative DNS zone files on the registrar portal',
        ],
        correctOption: 0,
        explanation: 'DNS Amplification exploits UDP statelessness to send small spoofed requests that generate massive responses targeting the spoofed victim IP.',
      },
    ],
    subjectiveTemplates: [
      {
        question: '[Subjective Scenario] An enterprise perimeter firewall is alerting on repeated high-volume outbound beaconing connections occurring every 60 seconds over HTTPS to an uncategorized external domain. Analyze the threat profile and outline the proper containment and eradication steps.',
        options: [
          'Profile as Command-and-Control (C2) beaconing; isolate the affected endpoint from the local VLAN immediately, capture memory for volatility analysis, inspect proxy SSL logs, and block the C2 domain/IP at the perimeter',
          'Reboot the perimeter router and clear the local DNS cache to flush the active connection table',
          'Whitelist the external domain in the firewall to eliminate false positive alert noise',
          'Notify the user by email asking if they installed an unauthorized application and take no network action',
        ],
        correctOption: 0,
        explanation: 'Periodic beaconing over port 443 is a hallmark of C2 communication. Rapid endpoint isolation prevents lateral movement or data exfiltration while digital forensics investigates the initial compromise vector.',
      },
      {
        question: '[Subjective Scenario] You are tasked with designing a zero-trust network segmentation model for internal enterprise subnets hosting sensitive customer databases. How should network access control and service discovery be structured?',
        options: [
          'Implement micro-segmentation with least-privilege stateful firewall rules, mutual TLS (mTLS) authentication between services, and continuous identity-based verification rather than flat subnet trust',
          'Place all web servers, application tiers, and database engines on a single flat VLAN with standard subnet masks',
          'Rely exclusively on perimeter border firewalls and allow all internal inter-VLAN traffic without access controls',
          'Disable packet filtering on internal switches to maximize throughput between database and application clusters',
        ],
        correctOption: 0,
        explanation: 'Zero Trust eliminates implicit trust within network perimeters. Micro-segmentation, mTLS, and explicit authorization per service connection prevent lateral movement if a single node is compromised.',
      },
    ],
  },

  linux_system: {
    match: ['linux', 'bash', 'shell', 'ubuntu', 'centos', 'debian', 'permissions', 'chmod', 'chown', 'sudo', 'systemd', 'cron', 'ssh'],
    mcqTemplates: [
      {
        question: 'In Linux octal permissions, what permissions does "chmod 750 /var/www" assign to owner, group, and others?',
        options: [
          'Owner: Read/Write/Execute (rwx); Group: Read/Execute (r-x); Others: No permissions (---)',
          'Owner: Read/Write (rw-); Group: Read (r--); Others: Read/Write/Execute (rwx)',
          'Owner: Execute only (--x); Group: Write only (-w-); Others: Read only (r--)',
          'Owner: Read/Write/Execute (rwx); Group: Read/Write (rw-); Others: Read (r--)',
        ],
        correctOption: 0,
        explanation: '7 = 4+2+1 (rwx), 5 = 4+0+1 (r-x), 0 = 0+0+0 (---).',
      },
      {
        question: 'What is the security significance of the SUID (Set User ID) bit on an executable binary owned by root (e.g. -rwsr-xr-x)?',
        options: [
          'The binary executes with the privileges of the file owner (root) regardless of who launches it',
          'The binary can only be run once per system reboot',
          'The binary is encrypted and requires a root password to decrypt before each run',
          'The binary is automatically deleted if an unprivileged user executes it',
        ],
        correctOption: 0,
        explanation: 'SUID allows unprivileged users to run a program with the owner privileges (e.g., passwd changing passwords). If vulnerable, it is a key privilege escalation vector.',
      },
      {
        question: 'Which configuration file controls allowed sudo privileges for users and groups on Linux systems?',
        options: [
          '/etc/sudoers (edited via visudo)',
          '/etc/shadow',
          '/etc/fstab',
          '/etc/resolv.conf',
        ],
        correctOption: 0,
        explanation: '/etc/sudoers defines rules for sudo commands. "visudo" performs syntax checking to avoid fatal locking errors.',
      },
      {
        question: 'What command displays active TCP and UDP listening ports and associated process names on modern Linux distributions?',
        options: [
          'ss -tulpn',
          'ps -aux --network',
          'cat /proc/cpuinfo',
          'iptables -L -n -v',
        ],
        correctOption: 0,
        explanation: '"ss -tulpn" displays TCP (-t), UDP (-u), listening (-l), numeric addresses (-n), and process names (-p).',
      },
      {
        question: 'In OpenSSH server configuration (/etc/ssh/sshd_config), which setting prevents automated root credential brute-forcing over SSH?',
        options: [
          'PermitRootLogin no (combined with PasswordAuthentication no)',
          'AllowUsers root:all',
          'X11Forwarding yes',
          'MaxAuthTries 100',
        ],
        correctOption: 0,
        explanation: 'Disabling root login and password authentication mandates key-based access through unprivileged accounts with sudo escalation.',
      },
    ],
    subjectiveTemplates: [
      {
        question: '[Subjective Scenario] A Linux production server is showing abnormal CPU spikes. Inspecting cron directories reveals an unfamiliar entry in /etc/cron.d/ running a hidden bash script from /tmp every 15 minutes. Analyze the compromise and describe the proper incident remediation workflow.',
        options: [
          'Identify the persistence mechanism (cron job); capture running process memory, terminate the malicious PID, inspect /var/log/auth.log for the initial login vector, audit authorized_keys, and rebuild from clean verified baseline',
          'Simply delete the file in /tmp and leave the server online without auditing logs or active network connections',
          'Change the root password and restart the cron daemon without checking for backdoors or webshells',
          'Uninstall the cron package permanently to stop all scheduled tasks on the server',
        ],
        correctOption: 0,
        explanation: 'A cron job running from /tmp is typical malware persistence. Deleting the script alone fails to address the underlying root exploit, backdoors, or memory-resident processes.',
      },
    ],
  },

  containers_devops: {
    match: ['docker', 'container', 'kubernetes', 'k8s', 'image', 'dockerfile', 'compose', 'devops', 'ci/cd', 'volume'],
    mcqTemplates: [
      {
        question: 'What is the primary security risk of running Docker containers with the "--privileged" flag in production?',
        options: [
          'It grants the container root-equivalent capabilities, allowing device access and potential container escape to the host kernel',
          'It forces the container to use 100% of host CPU cores regardless of workload',
          'It deletes the host root filesystem upon container termination',
          'It disables network encryption on all outward TLS connections',
        ],
        correctOption: 0,
        explanation: '--privileged disables AppArmor/Seccomp confinement and gives the container direct access to all host devices.',
      },
      {
        question: 'In a Dockerfile, which instruction should be used to avoid running application processes as the default root user?',
        options: [
          'USER <username_or_uid>',
          'RUN chmod 777 /app',
          'ENV ROOT=false',
          'ENTRYPOINT ["su", "admin"]',
        ],
        correctOption: 0,
        explanation: 'Specifying USER switches the execution context to an unprivileged account, adhering to the principle of least privilege.',
      },
      {
        question: 'What is the purpose of Docker multi-stage builds in continuous integration workflows?',
        options: [
          'To separate build-time dependencies (compilers, SDKs) from the final minimal production image, reducing attack surface and image size',
          'To run multiple Linux distributions simultaneously within a single container layer',
          'To automatically replicate containers across three cloud regions',
          'To encrypt image layers on the local disk using AES-256',
        ],
        correctOption: 0,
        explanation: 'Multi-stage builds leave compilers and build tools behind in early stages, resulting in lightweight, secure production images.',
      },
      {
        question: 'How do Docker bridge networks provide isolation between distinct containerized applications?',
        options: [
          'Each user-defined bridge provides DNS resolution and restricts container-to-container communication to only those joined to the same bridge',
          'Bridge networks convert all internal traffic into SSH tunnels',
          'Bridge networks prevent containers from writing to local disk volumes',
          'They replace the host Linux kernel network stack with userland sockets only',
        ],
        correctOption: 0,
        explanation: 'User-defined bridge networks isolate container communication so containers on different custom bridges cannot talk to each other without explicit links.',
      },
    ],
    subjectiveTemplates: [
      {
        question: '[Subjective Scenario] A security audit discovers that an application container has the host Docker socket (/var/run/docker.sock) mounted as a volume. Analyze the severity of this configuration and recommend the architectural remediation.',
        options: [
          'Critical vulnerability allowing complete host takeover; mounting docker.sock grants the container root control over the Docker daemon. Remove the mount and use dedicated API gateways or orchestration APIs with RBAC',
          'Low risk because Docker daemon requires password authentication on every socket call',
          'Acceptable configuration required for all containers that read application log files',
          'Remediate by simply renaming docker.sock to docker.internal on the host',
        ],
        correctOption: 0,
        explanation: 'Access to /var/run/docker.sock equals root on the host, as any process can instruct the daemon to launch a container with host root mounted. It must never be mounted in untrusted containers.',
      },
    ],
  },

  databases_sql: {
    match: ['database', 'postgres', 'postgresql', 'mysql', 'sql', 'query', 'nosql', 'mongo', 'index', 'transaction', 'acid'],
    mcqTemplates: [
      {
        question: 'What do the ACID properties represent in relational database management systems?',
        options: [
          'Atomicity, Consistency, Isolation, Durability',
          'Authentication, Cryptography, Integrity, Decryption',
          'Access, Concurrency, Indexing, Distribution',
          'Availability, Confidentiality, Identity, Detection',
        ],
        correctOption: 0,
        explanation: 'ACID ensures reliable transaction processing: Atomicity (all or nothing), Consistency (valid state), Isolation (concurrent safety), Durability (persisted).',
      },
      {
        question: 'In PostgreSQL, which transaction isolation level prevents dirty reads, non-repeatable reads, and phantom reads?',
        options: [
          'Serializable',
          'Read Committed',
          'Read Uncommitted',
          'Repeatable Read (handles phantom reads in Postgres, but Serializable guarantees full transaction sequence)',
        ],
        correctOption: 0,
        explanation: 'Serializable is the highest isolation level, guaranteeing that concurrent transactions produce the same result as if executed serially.',
      },
      {
        question: 'What is the primary benefit of creating a B-Tree index on a frequently filtered column (e.g. users.email)?',
        options: [
          'Reduces query search complexity from sequential O(N) scan to logarithmic O(log N) lookups',
          'Automatically encrypts the column data on disk',
          'Prevents duplicate values from ever being inserted into the column',
          'Converts string columns to integers for compression',
        ],
        correctOption: 0,
        explanation: 'B-Tree indexes allow the database engine to perform balanced binary-style searches without scanning every row in the table.',
      },
    ],
    subjectiveTemplates: [
      {
        question: '[Subjective Scenario] A PostgreSQL database experiences sudden write transaction deadlocks during peak usage hours when multiple concurrent services update inventory balances. Analyze the root cause and provide an architectural database solution.',
        options: [
          'Deadlocks occur when transactions acquire row locks in conflicting orders; resolve by standardizing the order of table/row locks across all services, minimizing transaction duration, and using SELECT ... FOR UPDATE with explicit lock ordering',
          'Disable foreign key constraints and drop all indexes to speed up write latency',
          'Switch the database storage engine to plain CSV files without transactions',
          'Increase the PostgreSQL connection limit from 100 to 10,000 without tuning shared memory',
        ],
        correctOption: 0,
        explanation: 'Deadlocks happen when Transaction A waits for a resource held by B while B waits for one held by A. Enforcing a uniform lock acquisition sequence across application code eliminates circular lock dependencies.',
      },
    ],
  },
};

/**
 * Detect domain category based on title text keywords
 */
function detectDomain(title) {
  const normalized = (title || '').toLowerCase();
  for (const [key, domain] of Object.entries(DOMAIN_BANKS)) {
    if (domain.match.some((keyword) => normalized.includes(keyword))) {
      return { key, bank: domain };
    }
  }
  return { key: 'general_cyber', bank: DOMAIN_BANKS.web_security };
}

/**
 * Fallback generator for custom or unlisted topics
 */
function createCustomQuestions(title, mcqCount, subjectiveCount, difficulty) {
  const cleanTitle = (title || 'Cybersecurity & Computing Concepts').trim();

  const customMcqs = [
    {
      question: `What is the primary objective of studying and implementing ${cleanTitle}?`,
      options: [
        `To establish verifiable security controls, operational efficiency, and standardized best practices in ${cleanTitle}`,
        `To bypass corporate access policies and eliminate all forms of authentication logging`,
        `To deprecate legacy network infrastructure without testing dependencies`,
        `To restrict software deployment solely to unmonitored local developer machines`,
      ],
      correctOption: 0,
      explanation: `Implementing ${cleanTitle} establishes systematic defense-in-depth, measurable controls, and industry-standard operational reliability.`,
    },
    {
      question: `Which fundamental principle is most critical when designing systems related to ${cleanTitle}?`,
      options: [
        'Principle of Least Privilege and Defense-in-Depth',
        'Security through Obscurity as the sole protective layer',
        'Granting full administrative access to all network endpoints',
        'Disabling audit logs to conserve storage bandwidth',
      ],
      correctOption: 0,
      explanation: 'Least privilege ensures users and automated processes are granted only the minimum permissions necessary to perform their functions.',
    },
    {
      question: `In a production environment focusing on ${cleanTitle}, how should configuration changes be managed?`,
      options: [
        'Through version-controlled automation, peer-reviewed pull requests, and automated validation tests',
        'By directly editing production configuration files via SSH during business hours',
        'By disabling error reporting and ignoring runtime exception logs',
        'By sharing a single administrative root credential across all team members',
      ],
      correctOption: 0,
      explanation: 'Infrastructure as Code (IaC) and version control provide repeatability, auditability, and rapid rollback capability.',
    },
    {
      question: `What is the most effective approach for monitoring anomalous activity within ${cleanTitle}?`,
      options: [
        'Centralized log aggregation with real-time alerting, baseline telemetry, and behavioral analysis',
        'Manual inspection of local text files once per quarter',
        'Relying solely on user complaints to detect unauthorized system access',
        'Deleting event logs daily to maximize available disk throughput',
      ],
      correctOption: 0,
      explanation: 'Continuous telemetry and SIEM aggregation detect threat indicators before substantial compromise occurs.',
    },
    {
      question: `When validating input and communication channels in ${cleanTitle}, what security standard must be maintained?`,
      options: [
        'Strict server-side validation against an allowlist, accompanied by cryptographic encryption in transit',
        'Accepting all raw input and relying only on front-end form validation',
        'Transmitting sensitive tokens in cleartext URL query parameters',
        'Disabling TLS certificate checks to avoid latency',
      ],
      correctOption: 0,
      explanation: 'Client-side checks can be bypassed trivially; server-side allowlisting and strong encryption are non-negotiable.',
    },
    {
      question: `Which threat model component assesses the likelihood and business impact of potential exploits in ${cleanTitle}?`,
      options: [
        'Risk assessment combining vulnerability severity, exploitability, and asset criticality',
        'Random sample surveys among end users',
        'Assuming all software vulnerabilities carry zero financial impact',
        'Measuring only the physical weight of server racks',
      ],
      correctOption: 0,
      explanation: 'Risk prioritization allocates security resources to vulnerabilities with the highest potential business and operational impact.',
    },
    {
      question: `How should cryptographic keys and sensitive credentials be managed when working with ${cleanTitle}?`,
      options: [
        'Stored securely in an encrypted secrets manager or hardware security module (HSM) with access auditing',
        'Hardcoded directly into source code repositories and commit messages',
        'Saved as cleartext environment variables in public documentation',
        'Shared across public messaging channels for developer convenience',
      ],
      correctOption: 0,
      explanation: 'Secrets management tools prevent credential leakage and support automated rotation without source code changes.',
    },
    {
      question: `In the event of a security incident involving ${cleanTitle}, what is the first priority of the response team?`,
      options: [
        'Identification, containment to prevent lateral spread, and preservation of forensic evidence',
        'Immediate deletion of all server disks to eliminate malware signatures',
        'Issuing public blame statements before investigating root cause telemetry',
        'Continuing standard business operations without notifying stakeholders',
      ],
      correctOption: 0,
      explanation: 'Containment limits damage while evidence preservation ensures forensically sound root cause determination.',
    },
  ];

  const customSubjectives = [
    {
      question: `[Subjective Scenario] An organization deploying systems centered on "${cleanTitle}" detects unexpected privilege escalation attempts originating from an internal service account. Analyze the operational threat and outline the prioritized incident response and architectural remediation.`,
      options: [
        `Isolate the compromised service account immediately; review audit logs for lateral movement, revoke active authentication tokens, enforce strict role-based access control (RBAC), and re-baseline privileges under the Principle of Least Privilege`,
        `Reboot the host machine and ignore the alert if the server remains responsive to ping requests`,
        `Grant the service account full domain administrator privileges to verify if permissions were missing`,
        `Delete the security monitoring daemon to prevent further alerts from triggering`,
      ],
      correctOption: 0,
      explanation: `Service account escalation represents a high-severity threat. Rapid revocation, token invalidation, lateral audit, and strict least-privilege scoping neutralize the threat while preserving operational forensic data.`,
    },
    {
      question: `[Subjective Scenario] You are asked to review an enterprise architecture proposal for "${cleanTitle}". The team recommends relying on default vendor configurations to accelerate delivery timelines. Evaluate the technical and compliance risks and provide an authoritative security recommendation.`,
      options: [
        `Reject unhardened defaults; default accounts and open ports are primary exploitation targets. Mandate automated CIS benchmark hardening, disable unnecessary services, change all default credentials, and require security review before production release`,
        `Approve the proposal without changes because vendor default settings are universally optimized for zero-day protection`,
        `Require the engineering team to remove all firewall rules to eliminate configuration complexity`,
        `Postpone all security considerations until after a production data breach occurs`,
      ],
      correctOption: 0,
      explanation: `Default configurations frequently contain well-known default passwords, permissive ports, and debugging interfaces that attackers exploit first. CIS benchmarks provide verifiable hardening standards.`,
    },
    {
      question: `[Subjective Scenario] Following an audit of "${cleanTitle}" infrastructure, auditors flag a lack of disaster recovery testing and insufficient data redundancy. As a senior technical architect, how should you formulate a resilient continuity plan?`,
      options: [
        `Implement automated off-site immutable backups, establish measurable RTO (Recovery Time Objective) and RPO (Recovery Point Objective) targets, and conduct scheduled disaster recovery drill simulations`,
        `Rely on local disk snapshots stored on the primary database server without external replication`,
        `Assume cloud infrastructure never experiences outages and eliminate disaster recovery planning`,
        `Store manual database dumps on public cloud storage buckets without encryption or access controls`,
      ],
      correctOption: 0,
      explanation: `Business continuity requires tested recovery procedures, immutable offsite backups to combat ransomware, and verified adherence to Recovery Time (RTO) and Recovery Point (RPO) metrics.`,
    },
  ];

  return { customMcqs, customSubjectives };
}

/**
 * Generate a complete, ready-to-use quiz structure.
 *
 * @param {Object} options
 * @param {string} options.title - The topic or title of the quiz
 * @param {number} [options.mcqCount=5] - Number of MCQs to generate
 * @param {number} [options.subjectiveCount=2] - Number of subjective/scenario questions to generate
 * @param {string} [options.difficulty='intermediate'] - 'beginner' | 'intermediate' | 'advanced'
 * @returns {Object} Complete quiz object with questions array
 */
export function generateQuiz({
  title,
  mcqCount = 5,
  subjectiveCount = 2,
  difficulty = 'intermediate',
}) {
  const cleanTitle = (title || 'Cybersecurity Assessment').trim();
  const numMcq = Math.max(1, Math.min(30, Number(mcqCount) || 5));
  const numSubj = Math.max(0, Math.min(20, Number(subjectiveCount) || 0));

  const { bank } = detectDomain(cleanTitle);
  const { customMcqs, customSubjectives } = createCustomQuestions(cleanTitle, numMcq, numSubj, difficulty);

  // Combine domain-specific templates with custom-tailored questions
  const availableMcqs = [...(bank.mcqTemplates || []), ...customMcqs];
  const availableSubjs = [...(bank.subjectiveTemplates || []), ...customSubjectives];

  // Pick or cycle requested count of MCQs
  const selectedMcqs = [];
  for (let i = 0; i < numMcq; i += 1) {
    const template = availableMcqs[i % availableMcqs.length];
    selectedMcqs.push({
      question: template.question,
      type: 'mcq',
      options: [...template.options],
      correctOption: template.correctOption,
      explanation: template.explanation,
      points: 1,
      position: i,
    });
  }

  // Pick or cycle requested count of Subjective/Scenario questions
  const selectedSubjs = [];
  for (let i = 0; i < numSubj; i += 1) {
    const template = availableSubjs[i % availableSubjs.length];
    selectedSubjs.push({
      question: template.question,
      type: 'mcq',
      options: [...template.options],
      correctOption: template.correctOption,
      explanation: template.explanation,
      points: difficulty === 'advanced' ? 3 : 2,
      position: numMcq + i,
    });
  }

  const allQuestions = [...selectedMcqs, ...selectedSubjs];

  const passScore = difficulty === 'advanced' ? 75 : difficulty === 'beginner' ? 60 : 65;

  return {
    title: cleanTitle,
    description: `Automated assessment evaluating core theoretical concepts (${numMcq} MCQs) and scenario-based analytical judgment (${numSubj} Subjective Cases) in ${cleanTitle}.`,
    passScore,
    difficulty,
    counts: {
      mcq: numMcq,
      subjective: numSubj,
      totalQuestions: allQuestions.length,
      totalPoints: allQuestions.reduce((sum, q) => sum + q.points, 0),
    },
    questions: allQuestions,
  };
}
