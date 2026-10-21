import { defaultFs } from '../labs/mock/virtualFs.js';

const fileNode = (content, mode = '-rw-r--r--') => ({ type: 'file', content, mode });

function labFs(setup = null) {
  const fs = defaultFs();
  if (setup) setup(fs);
  return fs;
}

const extraCourses = [
  {
    instructor: 'net',
    title: 'Ethical Hacking & Reconnaissance',
    slug: 'ethical-hacking-reconnaissance',
    summary: 'Learn legal reconnaissance, service discovery and target profiling with industry-standard tooling.',
    description: `## Reconnaissance is a process, not a guess

Before any exploitation comes scope, authorization and careful observation. This course teaches a repeatable reconnaissance workflow using tools you can run in the browser.

### What you will learn
- How to define scope and rules of engagement
- Host and service discovery with nmap
- Reading listening sockets and exposed services
- Documenting findings for a client or internal report

### Who it is for
Support engineers, junior analysts and anyone preparing for an ethical hacking certification.`,
    category: 'Cybersecurity',
    subcategory: 'Ethical Hacking',
    level: 'intermediate',
    durationHours: 12,
    price: 89,
    tags: ['ethical-hacking', 'reconnaissance', 'nmap', 'security'],
    cover: '/images/courses/security.svg',
    modules: [
      {
        title: 'Reconnaissance Foundations',
        description: 'Scope, authorization and the discovery workflow.',
        lessons: [
          {
            title: 'Rules of Engagement and Scope',
            minutes: 18,
            free: true,
            content: `## Authorization comes first

Reconnaissance is only ethical when it is authorized. A written scope defines the targets, time window and actions that are permitted.

### A practical scope checklist
- Who owns the target and who approved the test?
- Which IP ranges, domains and services are in scope?
- What is explicitly out of scope?
- Who is the emergency contact if something breaks?
- How will evidence be stored and shared?

If any answer is missing, stop and ask. A professional tester protects the client before proving a point.`,
          },
          {
            title: 'Lab: Service Discovery with Nmap',
            minutes: 30,
            type: 'lab',
            content: `## Profile before you probe

In this lab you inspect a simulated host from the inside out.

1. Confirm your identity and network context
2. Enumerate interfaces and routes
3. Discover open ports with nmap
4. Compare the scan with the host's listening sockets
5. Inspect the exposed web service

Record the service, port and purpose of every finding.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'Rules of Engagement and Scope',
      title: 'Reconnaissance Scope Check',
      passScore: 70,
      questions: [
        { question: 'What must exist before active reconnaissance begins?', options: ['A public IP address', 'Written authorization and scope', 'A vulnerability scanner license', 'A social media profile'], correct: 1, explanation: 'Authorization defines what is legal and safe to test.' },
        { question: 'What does nmap primarily discover?', options: ['File permissions', 'Open ports and services', 'DNS zone transfers only', 'User passwords'], correct: 1, explanation: 'Nmap maps hosts, ports and service banners.' },
        { question: 'Which command lists local listening sockets?', options: ['ss -tuln', 'pwd', 'chmod 750', 'tar -xzf'], correct: 0, explanation: 'ss -tuln shows TCP/UDP listeners with numeric ports.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: Service Discovery with Nmap',
      title: 'Service Discovery with Nmap',
      slug: 'ethical-hacking-service-discovery',
      summary: 'Profile a simulated host and identify exposed services before reporting.',
      description: 'Practice the discovery phase of an authorized assessment: identity, interfaces, open ports and service verification.',
      difficulty: 'intermediate',
      minutes: 30,
      welcome: 'Recon lab - establish context, then enumerate services on this host.',
      steps: [
        { title: 'Confirm the operator', instruction: 'Print the current username to confirm which account you are using.', command: 'whoami', points: 10 },
        { title: 'Inspect network interfaces', instruction: 'Display the host interfaces and IP addresses.', command: 'ip addr', points: 15 },
        { title: 'Discover open ports', instruction: 'Run a service-detection scan against localhost.', command: 'nmap -sV localhost', points: 20 },
        { title: 'Compare with local listeners', instruction: 'List the listening TCP/UDP sockets on the host.', command: 'ss -tuln', points: 20 },
        { title: 'Inspect the web service', instruction: 'Request the local web service and read the response.', command: 'curl http://localhost', points: 20 },
        { title: 'Document the findings', instruction: 'Tick when you can name the exposed ports and the service behind port 80.', verification: 'manual', points: 15, optional: true },
      ],
    },
  },
  {
    instructor: 'net',
    title: 'Web Application Penetration Testing',
    slug: 'web-application-penetration-testing',
    summary: 'Assess web services methodically: fingerprinting, exposed endpoints and evidence-driven reporting.',
    description: `## Test the service, not just the page

Web assessments combine careful observation with controlled requests. This course focuses on the first phase: understanding what the server exposes and how it responds.

### What you will learn
- Scoping a web application assessment
- Service and technology fingerprinting
- Reading HTTP responses and status codes
- Turning observations into clear evidence

### Who it is for
Analysts and testers who already understand HTTP basics and want a structured assessment workflow.`,
    category: 'Cybersecurity',
    subcategory: 'Penetration Testing',
    level: 'advanced',
    durationHours: 16,
    price: 129,
    tags: ['pentest', 'web-security', 'http', 'assessment'],
    cover: '/images/courses/security.svg',
    modules: [
      {
        title: 'Web Service Assessment',
        description: 'Fingerprint the service and validate what is exposed.',
        lessons: [
          {
            title: 'Scoping a Web Assessment',
            minutes: 20,
            free: true,
            content: `## Define the target surface

A web assessment starts with a clear inventory: hostnames, ports, protocols, authentication flows and third-party dependencies.

### Questions to answer first
- Which environments are in scope: production, staging or both?
- Are authenticated and unauthenticated paths both included?
- Which request rate is safe for the client?
- Where should evidence and credentials be stored?

Write the answers down. A clean scope prevents accidental damage and makes the final report easier to defend.`,
          },
          {
            title: 'Lab: HTTP Service Fingerprinting',
            minutes: 35,
            type: 'lab',
            content: `## Observe before you exploit

Use the simulated terminal to profile the local web service:

1. Scan the host for open ports
2. Request the root page and read the response
3. Check which ports are listening locally
4. Request a missing path and inspect the 404 behaviour
5. Identify the process serving the site

Your goal is evidence, not exploitation.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'Scoping a Web Assessment',
      title: 'Web Assessment Scope Check',
      passScore: 70,
      questions: [
        { question: 'What is the first step of a web assessment?', options: ['Run an exploit', 'Confirm scope and authorization', 'Delete server logs', 'Install a browser extension'], correct: 1, explanation: 'Scope and authorization set the boundaries of the engagement.' },
        { question: 'What does an HTTP 404 indicate?', options: ['The server is down', 'The requested resource was not found', 'Authentication succeeded', 'The TLS certificate expired'], correct: 1, explanation: '404 means the resource is not present at that path.' },
        { question: 'Which command lists local listening ports?', options: ['ss -tuln', 'cat /etc/passwd', 'find / -name "*.log"', 'history'], correct: 0, explanation: 'ss -tuln shows listening TCP/UDP sockets.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: HTTP Service Fingerprinting',
      title: 'HTTP Service Fingerprinting',
      slug: 'web-pentest-http-fingerprinting',
      summary: 'Profile a simulated web service and capture evidence from HTTP responses.',
      description: 'Scan, request, compare and document the exposed web service. Every observation should be reproducible.',
      difficulty: 'advanced',
      minutes: 35,
      welcome: 'Web assessment lab - fingerprint the local HTTP service and document the evidence.',
      steps: [
        { title: 'Scan the service', instruction: 'Run a service-detection scan against localhost.', command: 'nmap -sV localhost', points: 15 },
        { title: 'Request the home page', instruction: 'Fetch the local web root and read the response body.', command: 'curl http://localhost', points: 20 },
        { title: 'List listening ports', instruction: 'Confirm which ports are listening locally.', command: 'ss -tuln', points: 15 },
        { title: 'Probe a missing path', instruction: 'Request a path that does not exist and observe the 404 response.', command: 'curl http://localhost/404', points: 20 },
        { title: 'Identify the web process', instruction: 'Check the status of the nginx service.', command: 'systemctl status nginx', points: 15 },
        { title: 'Write the evidence note', instruction: 'Tick when you have recorded the open ports, web response and 404 behaviour.', verification: 'manual', points: 15, optional: true },
      ],
    },
  },
  {
    instructor: 'net',
    title: 'Security Operations & SIEM Analysis',
    slug: 'security-operations-siem-analysis',
    summary: 'Turn raw authentication and service logs into triage decisions with a repeatable analyst workflow.',
    description: `## Detection starts with evidence

A SIEM is only as useful as the questions you ask it. This course builds the log-reading habits that make alerts actionable.

### What you will learn
- The role of a SIEM in security operations
- Reading Linux authentication logs
- Separating failed and successful access events
- Building a short, defensible triage note

### Who it is for
SOC analysts, help desk engineers and administrators responsible for reviewing security events.`,
    category: 'Cybersecurity',
    subcategory: 'Security Operations',
    level: 'intermediate',
    durationHours: 11,
    price: 99,
    tags: ['siem', 'soc', 'logs', 'triage'],
    cover: '/images/courses/security.svg',
    modules: [
      {
        title: 'Log-Driven Detection',
        description: 'From raw events to an analyst decision.',
        lessons: [
          {
            title: 'What a SIEM Actually Does',
            minutes: 18,
            free: true,
            content: `## Collect, normalise, correlate, alert

A SIEM ingests logs from many sources, normalises their fields and applies detection rules. The analyst still has to validate the context.

### A practical triage loop
1. Read the alert and identify the source host
2. Confirm the time window and affected account
3. Correlate with authentication, process and network events
4. Decide: benign, suspicious or incident
5. Record the evidence and the next action

The goal is a decision that another analyst can review without guessing.`,
          },
          {
            title: 'Lab: Authentication Log Triage',
            minutes: 30,
            type: 'lab',
            content: `## Read the auth log like an analyst

A small authentication log is staged in /var/log/auth.log.

1. Confirm the log exists and inspect its size
2. Read the most recent entries
3. Find failed password attempts
4. Find successful logins
5. Count the total events

Identify the suspicious source address and decide whether escalation is warranted.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'What a SIEM Actually Does',
      title: 'SOC Triage Check',
      passScore: 70,
      questions: [
        { question: 'What is the main purpose of a SIEM?', options: ['Patch operating systems', 'Collect and correlate security events', 'Replace firewalls', 'Store user passwords'], correct: 1, explanation: 'A SIEM centralises and correlates event data for detection.' },
        { question: 'Which log entry indicates a successful SSH login?', options: ['Failed password', 'Accepted password', 'Connection closed', 'Invalid user'], correct: 1, explanation: 'Accepted password marks a successful authentication.' },
        { question: 'What should an analyst do after validating an alert?', options: ['Ignore it', 'Document evidence and next action', 'Delete the log', 'Disable the SIEM'], correct: 1, explanation: 'A clear record supports review, escalation and improvement.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: Authentication Log Triage',
      title: 'Authentication Log Triage',
      slug: 'soc-auth-log-triage',
      summary: 'Investigate failed and successful authentication events in a simulated Linux log.',
      description: 'Use standard command-line tools to inspect an authentication log and build a short triage summary.',
      difficulty: 'intermediate',
      minutes: 30,
      welcome: 'SOC lab - an authentication log is waiting in /var/log/auth.log.',
      files: labFs((fs) => {
        fs['/'].children.var.children.log.children['auth.log'] = fileNode(
          [
            'Oct 21 08:12:01 cyberita-lab sshd[1421]: Failed password for invalid user admin from 203.0.113.44 port 51234 ssh2',
            'Oct 21 08:12:04 cyberita-lab sshd[1421]: Failed password for root from 203.0.113.44 port 51236 ssh2',
            'Oct 21 08:13:22 cyberita-lab sshd[1430]: Failed password for student from 198.51.100.7 port 40222 ssh2',
            'Oct 21 08:14:05 cyberita-lab sshd[1434]: Accepted password for student from 198.51.100.7 port 40244 ssh2',
            'Oct 21 08:14:05 cyberita-lab sshd[1434]: pam_unix(sshd:session): session opened for user student',
            'Oct 21 08:16:40 cyberita-lab sshd[1442]: Failed password for invalid user test from 203.0.113.44 port 51402 ssh2',
            'Oct 21 08:17:12 cyberita-lab sshd[1442]: Connection closed by invalid user test 203.0.113.44 port 51402',
            'Oct 21 08:20:18 cyberita-lab systemd[1]: Started Session 12 of user student.',
          ].join('\n') + '\n'
        );
      }),
      steps: [
        { title: 'Inspect the log directory', instruction: 'List the files in /var/log in long format.', command: 'ls -la /var/log', points: 10 },
        { title: 'Read the latest events', instruction: 'Show the last five lines of the authentication log.', command: 'tail -n 5 /var/log/auth.log', points: 15 },
        { title: 'Find failed passwords', instruction: 'Search the auth log for failed password events.', command: 'grep "Failed password" /var/log/auth.log', points: 20 },
        { title: 'Find successful logins', instruction: 'Search the auth log for accepted password events.', command: 'grep "Accepted" /var/log/auth.log', points: 20 },
        { title: 'Count the events', instruction: 'Count the total number of lines in the auth log.', command: 'wc -l /var/log/auth.log', points: 15 },
        { title: 'Decide and document', instruction: 'Tick when you can identify the suspicious source IP and your recommended next action.', verification: 'manual', points: 20, optional: true },
      ],
    },
  },
  {
    instructor: 'net',
    title: 'CISSP Security Management Essentials',
    slug: 'cissp-security-management-essentials',
    summary: 'Connect security governance, risk and access control to the day-to-day operations of a real environment.',
    description: `## Security is a management problem too

Controls only work when they are governed, reviewed and measured. This course covers the management side of security without losing sight of the terminal.

### What you will learn
- Risk, policy and accountability
- Identity and access review
- Service baselines and least exposure
- Evidence collection for audits

### Who it is for
Aspiring security managers, team leads and administrators preparing for a governance-focused certification.`,
    category: 'Cybersecurity',
    subcategory: 'Governance & Compliance',
    level: 'advanced',
    durationHours: 18,
    price: 149,
    tags: ['cissp', 'governance', 'risk', 'compliance'],
    cover: '/images/courses/security.svg',
    modules: [
      {
        title: 'Security Governance in Practice',
        description: 'Policy, risk and evidence in an operational environment.',
        lessons: [
          {
            title: 'Risk, Policy and Accountability',
            minutes: 22,
            free: true,
            content: `## A control without an owner is a suggestion

Governance answers three questions: who decides, who operates and who reviews. Risk management turns those answers into priorities.

### A simple review model
- Identify the asset and its owner
- Describe the threat and the exposure
- Rate likelihood and impact
- Choose a treatment: accept, reduce, transfer or avoid
- Record the decision and the review date

Auditors do not need perfect systems. They need evidence that decisions are deliberate and repeatable.`,
          },
          {
            title: 'Lab: Access and Service Baseline Review',
            minutes: 30,
            type: 'lab',
            content: `## Baseline the host

A baseline review checks identity, account data, filesystem permissions and exposed services.

1. Confirm the current identity
2. Inspect account records
3. Review the configuration directory
4. List listening services
5. Verify the web service state

Use the evidence to write two sentences: what is expected, and what needs attention.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'Risk, Policy and Accountability',
      title: 'Governance Essentials Check',
      passScore: 70,
      questions: [
        { question: 'What does risk treatment include?', options: ['Only accepting risk', 'Accept, reduce, transfer or avoid', 'Deleting the asset', 'Ignoring the finding'], correct: 1, explanation: 'These are the four standard risk treatment options.' },
        { question: 'Who should own a security control?', options: ['Nobody', 'A named accountable owner', 'The SIEM vendor only', 'Every user equally'], correct: 1, explanation: 'A named owner makes review and accountability possible.' },
        { question: 'Which command reviews listening services?', options: ['ss -tuln', 'pwd', 'echo ok', 'chmod 777'], correct: 0, explanation: 'ss -tuln lists TCP/UDP listeners.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: Access and Service Baseline Review',
      title: 'Access and Service Baseline Review',
      slug: 'cissp-access-service-baseline',
      summary: 'Collect identity, permission and service evidence for a governance review.',
      description: 'Review the host baseline and decide which observations belong in an audit note.',
      difficulty: 'advanced',
      minutes: 30,
      welcome: 'Governance lab - collect baseline evidence from this host.',
      steps: [
        { title: 'Confirm your identity', instruction: 'Display the current user identity and group membership.', command: 'id', points: 10 },
        { title: 'Review account records', instruction: 'Read the local account database.', command: 'cat /etc/passwd', points: 15 },
        { title: 'Inspect configuration permissions', instruction: 'List the files in /etc in long format.', command: 'ls -la /etc', points: 15 },
        { title: 'List exposed services', instruction: 'Show listening TCP/UDP sockets.', command: 'ss -tuln', points: 20 },
        { title: 'Verify the web service', instruction: 'Check the nginx service status.', command: 'systemctl status nginx', points: 20 },
        { title: 'Write the baseline note', instruction: 'Tick when you have recorded one expected control and one item to review.', verification: 'manual', points: 20, optional: true },
      ],
    },
  },
  {
    instructor: 'net',
    title: 'Cisco CCNA Routing & Switching Essentials',
    slug: 'cisco-ccna-routing-switching-essentials',
    summary: 'Build practical routing and switching skills with interface, gateway and troubleshooting labs.',
    description: `## From cable to route

This course focuses on the commands and reasoning you use every day on a routed network.

### What you will learn
- Interface addressing and link state
- Reading a routing table
- Verifying gateways with ping and traceroute
- Checking services and listeners on a host

### Who it is for
Network support staff and CCNA candidates who want hands-on repetition.`,
    category: 'Networking',
    subcategory: 'Cisco & Routing',
    level: 'intermediate',
    durationHours: 20,
    price: 119,
    tags: ['ccna', 'routing', 'switching', 'networking'],
    cover: '/images/courses/networking.svg',
    modules: [
      {
        title: 'Routing and Switching Foundations',
        description: 'Interfaces, routes and verification.',
        lessons: [
          {
            title: 'Interfaces, Routes and Gateways',
            minutes: 24,
            free: true,
            content: `## Follow the packet

A host needs an address, a mask and a gateway. The routing table decides where non-local traffic goes.

### Commands worth repeating
- ip addr - show interface addresses
- ip route - show the routing table
- ping - test reachability
- traceroute - see the path

When a connection fails, verify the local interface first, then the route, then the remote service.`,
          },
          {
            title: 'Lab: Routing and Interface Verification',
            minutes: 30,
            type: 'lab',
            content: `## Verify the path

In this lab you inspect the host network configuration and test reachability.

1. Review interface addresses
2. Read the routing table
3. Ping the default gateway
4. Trace a path to an external host
5. List listening services

Every result should support or challenge your initial hypothesis.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'Interfaces, Routes and Gateways',
      title: 'CCNA Routing Check',
      passScore: 70,
      questions: [
        { question: 'Which command displays the routing table?', options: ['ip route', 'whoami', 'grep -r', 'chmod 750'], correct: 0, explanation: 'ip route prints the kernel routing table.' },
        { question: 'What does a default gateway provide?', options: ['A local DNS cache', 'A next hop for non-local traffic', 'A password vault', 'A backup disk'], correct: 1, explanation: 'The default route sends unknown destinations to the gateway.' },
        { question: 'Which tool shows the path packets take?', options: ['traceroute', 'touch', 'wc', 'df'], correct: 0, explanation: 'Traceroute reports the hops along the path.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: Routing and Interface Verification',
      title: 'Routing and Interface Verification',
      slug: 'ccna-routing-interface-verification',
      summary: 'Verify addressing, routes, gateway reachability and listening services on a simulated host.',
      description: 'Use the standard network toolkit to build a complete picture of a host connection.',
      difficulty: 'intermediate',
      minutes: 30,
      welcome: 'CCNA lab - verify the host network stack from interface to gateway.',
      steps: [
        { title: 'Review interface addresses', instruction: 'Display the interface configuration and IP addresses.', command: 'ip addr', points: 15 },
        { title: 'Read the routing table', instruction: 'Show the host routing table.', command: 'ip route', points: 15 },
        { title: 'Test the gateway', instruction: 'Ping the default gateway three times.', command: 'ping -c 3 10.0.15.1', points: 20 },
        { title: 'Trace the path', instruction: 'Trace the route to example.com.', command: 'traceroute example.com', points: 20 },
        { title: 'List listening services', instruction: 'Show listening TCP/UDP sockets.', command: 'ss -tuln', points: 15 },
        { title: 'Summarise the connection', instruction: 'Tick when you can state the host IP, gateway and one listening service.', verification: 'manual', points: 15, optional: true },
      ],
    },
  },
  {
    instructor: 'net',
    title: 'Network Security & Firewall Operations',
    slug: 'network-security-firewall-operations',
    summary: 'Reduce exposed attack surface with firewall policy review, service audits and evidence-based hardening.',
    description: `## Every open port is a decision

Network security is largely about knowing what is reachable and why. This course teaches a practical audit workflow.

### What you will learn
- Reading firewall policy intent
- Auditing listening services
- Comparing policy with reality
- Recording changes and exceptions

### Who it is for
Network administrators, support engineers and security analysts responsible for edge services.`,
    category: 'Networking',
    subcategory: 'Network Security',
    level: 'intermediate',
    durationHours: 10,
    price: 89,
    tags: ['firewall', 'network-security', 'hardening', 'audit'],
    cover: '/images/courses/networking.svg',
    modules: [
      {
        title: 'Perimeter Defense',
        description: 'Policy, exposure and verification.',
        lessons: [
          {
            title: 'Firewall Policy and Least Exposure',
            minutes: 20,
            free: true,
            content: `## Allow only what the service needs

A firewall policy is a statement of intent. The audit checks whether the host matches that intent.

### Audit sequence
1. Read the policy and list expected allowances
2. Inspect listening sockets on the host
3. Scan the host from the network perspective
4. Compare expected and observed exposure
5. Raise or document exceptions

The most common finding is not a missing firewall. It is a service that was opened for a project and never closed.`,
          },
          {
            title: 'Lab: Exposed Services Audit',
            minutes: 30,
            type: 'lab',
            content: `## Compare policy with reality

A simulated firewall policy is available at /etc/firewall.conf.

1. Read the policy
2. List the ALLOW and DENY rules
3. Inspect listening sockets
4. Scan the host for open ports
5. Identify any mismatch

Decide whether the observed exposure matches the policy.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'Firewall Policy and Least Exposure',
      title: 'Network Security Check',
      passScore: 70,
      questions: [
        { question: 'What is the goal of least exposure?', options: ['Open every port', 'Allow only required services', 'Disable logging', 'Share admin accounts'], correct: 1, explanation: 'Only the services that are required should be reachable.' },
        { question: 'Which command lists listening sockets?', options: ['ss -tuln', 'ls -la', 'cat /etc/passwd', 'pwd'], correct: 0, explanation: 'ss shows local TCP/UDP listeners.' },
        { question: 'What should you do when policy and observed exposure differ?', options: ['Ignore it', 'Document and remediate or approve an exception', 'Open more ports', 'Delete the firewall'], correct: 1, explanation: 'Differences need a deliberate decision and a record.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: Exposed Services Audit',
      title: 'Exposed Services Audit',
      slug: 'network-security-exposed-services-audit',
      summary: 'Compare a firewall policy with the services actually listening on a simulated host.',
      description: 'Read the policy, inspect listeners and scan the host to find exposure mismatches.',
      difficulty: 'intermediate',
      minutes: 30,
      welcome: 'Firewall lab - a policy file is staged at /etc/firewall.conf.',
      files: labFs((fs) => {
        fs['/'].children.etc.children['firewall.conf'] = fileNode(
          [
            '# CyberITA edge policy',
            'ALLOW 22/tcp from 10.0.15.0/24',
            'ALLOW 80/tcp from any',
            'ALLOW 443/tcp from any',
            'DENY 3306/tcp from any',
            'DENY 5432/tcp from any',
          ].join('\n') + '\n'
        );
      }),
      steps: [
        { title: 'Read the firewall policy', instruction: 'Display the policy file.', command: 'cat /etc/firewall.conf', points: 15 },
        { title: 'List allowed services', instruction: 'Show the ALLOW rules in the policy.', command: 'grep "ALLOW" /etc/firewall.conf', points: 15 },
        { title: 'List denied services', instruction: 'Show the DENY rules in the policy.', command: 'grep "DENY" /etc/firewall.conf', points: 15 },
        { title: 'Inspect listening sockets', instruction: 'List the host listening TCP/UDP sockets.', command: 'ss -tuln', points: 20 },
        { title: 'Scan the host', instruction: 'Run a service scan against localhost.', command: 'nmap -sV localhost', points: 20 },
        { title: 'Identify mismatches', instruction: 'Tick when you can name at least one port that needs review.', verification: 'manual', points: 15, optional: true },
      ],
    },
  },
  {
    instructor: 'linux',
    title: 'Bash Scripting & Log Automation',
    slug: 'bash-scripting-log-automation',
    summary: 'Automate repetitive log triage with redirection, grep, wc and safe file permissions.',
    description: `## Small scripts remove big toil

Bash is already on almost every Linux host. This course uses it to turn a manual log review into a repeatable workflow.

### What you will learn
- Redirection and file-based evidence
- Searching and counting log events
- Building a small triage report
- Applying safe permissions to generated files

### Who it is for
Linux administrators and support engineers who want practical automation without a full programming course.`,
    category: 'Linux',
    subcategory: 'Shell Scripting',
    level: 'intermediate',
    durationHours: 9,
    price: 59,
    tags: ['bash', 'scripting', 'logs', 'automation'],
    cover: '/images/courses/linux.svg',
    modules: [
      {
        title: 'Automation with Bash',
        description: 'From one-off commands to repeatable evidence.',
        lessons: [
          {
            title: 'Argument Handling and Redirection',
            minutes: 20,
            free: true,
            content: `## Make output useful

Redirection writes command output to a file so the next step can review it without rerunning the command.

### Building blocks
- command > file - write standard output to a file
- command >> file - append instead of overwrite
- grep pattern file - find matching lines
- wc -l file - count lines

Start with a command you already trust, then wrap it in a repeatable sequence.`,
          },
          {
            title: 'Lab: Log Triage Automation',
            minutes: 30,
            type: 'lab',
            content: `## Build a tiny triage artifact

An application log is staged at /var/log/app.log.

1. Count the log lines
2. Extract ERROR events
3. Write the errors to a report file
4. Count the report lines
5. Restrict the report permissions

The final file should be safe to share with a reviewer.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'Argument Handling and Redirection',
      title: 'Bash Automation Check',
      passScore: 70,
      questions: [
        { question: 'What does > do in a shell command?', options: ['Appends output', 'Writes output to a file, replacing it', 'Reads a file', 'Deletes a file'], correct: 1, explanation: '> redirects standard output and overwrites the target.' },
        { question: 'Which command counts lines in a file?', options: ['wc -l file', 'grep file', 'cat -n file', 'chmod 640 file'], correct: 0, explanation: 'wc -l counts newline-delimited lines.' },
        { question: 'Why restrict permissions on a report?', options: ['To make it faster', 'To limit who can read potentially sensitive data', 'To change the file type', 'To delete the file'], correct: 1, explanation: 'Least privilege applies to generated evidence too.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: Log Triage Automation',
      title: 'Log Triage Automation',
      slug: 'bash-log-triage-automation',
      summary: 'Extract application errors into a permission-controlled triage report.',
      description: 'Use redirection, grep and wc to turn a noisy log into a short evidence file.',
      difficulty: 'intermediate',
      minutes: 30,
      welcome: 'Bash lab - an application log is waiting in /var/log/app.log.',
      files: labFs((fs) => {
        fs['/'].children.var.children.log.children['app.log'] = fileNode(
          [
            '2026-10-21T08:00:01 INFO  api request completed status=200 path=/health',
            '2026-10-21T08:01:14 WARN  api slow request duration=1420ms path=/courses',
            '2026-10-21T08:02:33 ERROR api database connection timeout',
            '2026-10-21T08:03:02 INFO  api request completed status=200 path=/login',
            '2026-10-21T08:04:48 ERROR api failed to load course catalog',
            '2026-10-21T08:05:11 INFO  worker queue size=3',
            '2026-10-21T08:06:19 ERROR api report export failed',
            '2026-10-21T08:07:02 INFO  api request completed status=201 path=/reports',
          ].join('\n') + '\n'
        );
      }),
      steps: [
        { title: 'Count the log lines', instruction: 'Count the total lines in /var/log/app.log.', command: 'wc -l /var/log/app.log', points: 10 },
        { title: 'Extract error events', instruction: 'Show only the ERROR lines from the application log.', command: 'grep "ERROR" /var/log/app.log', points: 20 },
        { title: 'Write the triage report', instruction: 'Write the ERROR lines to errors.txt in the current directory.', command: 'grep "ERROR" /var/log/app.log > errors.txt', points: 20 },
        { title: 'Verify the report', instruction: 'Count the lines in errors.txt.', command: 'wc -l errors.txt', points: 15 },
        { title: 'Restrict report permissions', instruction: 'Set errors.txt to owner read/write and group read (640).', command: 'chmod 640 errors.txt', points: 20 },
        { title: 'Review the artifact', instruction: 'Tick when errors.txt contains only ERROR events and is safe to share.', verification: 'manual', points: 15, optional: true },
      ],
    },
  },
  {
    instructor: 'linux',
    title: 'AWS Cloud Practitioner Essentials',
    slug: 'aws-cloud-practitioner-essentials',
    summary: 'Understand AWS regions, availability zones and the networking basics behind a cloud workload.',
    description: `## Cloud fluency starts with the fundamentals

This course explains the AWS mental model: global infrastructure, shared responsibility and the network path to a workload.

### What you will learn
- Regions, availability zones and edge locations
- The shared responsibility model
- Core networking checks for a cloud host
- How to reason about connectivity failures

### Who it is for
Beginners preparing for the AWS Cloud Practitioner exam and IT staff moving into cloud operations.`,
    category: 'Cloud',
    subcategory: 'AWS',
    level: 'beginner',
    durationHours: 10,
    price: 79,
    tags: ['aws', 'cloud', 'networking', 'practitioner'],
    cover: '/images/courses/cloud.svg',
    modules: [
      {
        title: 'Cloud Foundations',
        description: 'AWS global infrastructure and connectivity.',
        lessons: [
          {
            title: 'AWS Global Infrastructure',
            minutes: 18,
            free: true,
            content: `## Regions and zones

AWS groups infrastructure into regions, and each region contains multiple availability zones.

### Why placement matters
- A region is a geographic area
- An availability zone is an isolated location inside a region
- Designing across zones improves resilience
- Latency and compliance can dictate the region choice

A workload is not "in the cloud" in the abstract. It runs in a specific region, zone and network.`,
          },
          {
            title: 'Lab: Cloud Connectivity Diagnostics',
            minutes: 25,
            type: 'lab',
            content: `## Diagnose like you are on the host

Cloud connectivity problems often look like local network problems. Start with the host.

1. Review interface addresses
2. Check the default route
3. Test external reachability
4. Request a remote HTTPS service
5. Confirm local listeners

Document which layer failed before changing infrastructure.`,
          },
        ],
      },
    ],
    quiz: {
      lessonTitle: 'AWS Global Infrastructure',
      title: 'Cloud Practitioner Check',
      passScore: 70,
      questions: [
        { question: 'What is an AWS availability zone?', options: ['A billing account', 'An isolated location inside a region', 'A global DNS record', 'A type of IAM user'], correct: 1, explanation: 'Availability zones are isolated data center locations within a region.' },
        { question: 'What does the shared responsibility model divide?', options: ['Billing and support', 'Security responsibilities between AWS and the customer', 'Regions and zones', 'Users and groups'], correct: 1, explanation: 'AWS secures the cloud; customers secure what they put in it.' },
        { question: 'Which command shows the default route?', options: ['ip route', 'whoami', 'grep ERROR', 'chmod 640'], correct: 0, explanation: 'ip route displays the routing table, including the default gateway.' },
      ],
    },
    lab: {
      lessonTitle: 'Lab: Cloud Connectivity Diagnostics',
      title: 'Cloud Connectivity Diagnostics',
      slug: 'aws-cloud-connectivity-diagnostics',
      summary: 'Diagnose a cloud host connection from local interfaces through external reachability.',
      description: 'Work through the network layers in order and record where the connection succeeds or fails.',
      difficulty: 'beginner',
      minutes: 25,
      welcome: 'Cloud lab - verify this host network path from interface to external service.',
      steps: [
        { title: 'Review interface addresses', instruction: 'Display the host interface configuration.', command: 'ip addr', points: 15 },
        { title: 'Check the default route', instruction: 'Show the host routing table.', command: 'ip route', points: 15 },
        { title: 'Test external reachability', instruction: 'Ping 8.8.8.8 three times.', command: 'ping -c 3 8.8.8.8', points: 20 },
        { title: 'Request a remote service', instruction: 'Fetch https://example.com and inspect the response.', command: 'curl https://example.com', points: 20 },
        { title: 'Confirm local listeners', instruction: 'List listening TCP/UDP sockets.', command: 'ss -tuln', points: 15 },
        { title: 'Record the result', instruction: 'Tick when you can state which layer succeeded and which layer you would check next.', verification: 'manual', points: 15, optional: true },
      ],
    },
  },
];

async function upsertCourse(client, instructorId, course) {
  const { rows } = await client.query(
    `INSERT INTO courses (slug, title, summary, description, category, subcategory, level, duration_hours,
       price, cover_image, status, tags, instructor_id, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published',$11,$12,now())
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [
      course.slug,
      course.title,
      course.summary,
      course.description,
      course.category,
      course.subcategory,
      course.level,
      course.durationHours,
      course.price,
      course.cover,
      course.tags,
      instructorId,
    ]
  );
  if (rows[0]) return rows[0].id;
  const { rows: existing } = await client.query('SELECT id FROM courses WHERE slug = $1', [course.slug]);
  return existing[0].id;
}

async function ensureModule(client, courseId, module, position) {
  const { rows } = await client.query(
    `INSERT INTO modules (course_id, title, description, position)
     SELECT $1::bigint,$2::text,$3::text,$4::int
     WHERE NOT EXISTS (SELECT 1 FROM modules WHERE course_id = $1::bigint AND title = $2::text)
     RETURNING id`,
    [courseId, module.title, module.description ?? null, position]
  );
  if (rows[0]) return rows[0].id;
  const { rows: existing } = await client.query(
    'SELECT id FROM modules WHERE course_id = $1 AND title = $2 ORDER BY id LIMIT 1',
    [courseId, module.title]
  );
  return existing[0].id;
}

async function ensureLesson(client, courseId, moduleId, lesson, position) {
  const { rows } = await client.query(
    `INSERT INTO lessons (course_id, module_id, title, content, duration_minutes, lesson_type, position, is_free_preview)
     SELECT $1::bigint,$2::bigint,$3::text,$4::text,$5::int,$6::text,$7::int,$8::boolean
     WHERE NOT EXISTS (SELECT 1 FROM lessons WHERE course_id = $1::bigint AND title = $3::text)
     RETURNING id`,
    [
      courseId,
      moduleId,
      lesson.title,
      lesson.content,
      lesson.minutes ?? 15,
      lesson.type ?? 'reading',
      position,
      lesson.free ?? false,
    ]
  );
  if (rows[0]) return rows[0].id;
  const { rows: existing } = await client.query(
    'SELECT id FROM lessons WHERE course_id = $1 AND title = $2 ORDER BY id LIMIT 1',
    [courseId, lesson.title]
  );
  return existing[0].id;
}

async function ensureQuiz(client, courseId, lessonId, quiz) {
  const { rows: existing } = await client.query(
    'SELECT id FROM quizzes WHERE course_id = $1 AND title = $2 ORDER BY id LIMIT 1',
    [courseId, quiz.title]
  );
  if (existing[0]) return existing[0].id;

  const { rows } = await client.query(
    `INSERT INTO quizzes (course_id, lesson_id, title, description, pass_score)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [courseId, lessonId ?? null, quiz.title, quiz.description ?? '', quiz.passScore ?? 60]
  );
  const quizId = rows[0].id;
  for (let i = 0; i < quiz.questions.length; i += 1) {
    const question = quiz.questions[i];
    await client.query(
      `INSERT INTO quiz_questions (quiz_id, position, question, type, options, correct_option, explanation, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        quizId,
        i,
        question.question,
        question.type ?? 'mcq',
        JSON.stringify(question.options),
        question.correct,
        question.explanation ?? null,
        question.points ?? 1,
      ]
    );
  }
  return quizId;
}

async function ensureLab(client, { courseId, lessonId, createdBy, lab }) {
  const { rows: existing } = await client.query('SELECT id FROM labs WHERE slug = $1', [lab.slug]);
  let labId = existing[0]?.id;

  if (labId) {
    await client.query(
      `UPDATE labs SET course_id = COALESCE(course_id, $2), lesson_id = COALESCE(lesson_id, $3)
       WHERE id = $1`,
      [labId, courseId, lessonId ?? null]
    );
  } else {
    const { rows } = await client.query(
      `INSERT INTO labs (slug, course_id, lesson_id, title, summary, description, difficulty,
         estimated_minutes, terminal_welcome, initial_files, initial_cwd, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'/home/student','published',$11)
       RETURNING id`,
      [
        lab.slug,
        courseId,
        lessonId ?? null,
        lab.title,
        lab.summary,
        lab.description,
        lab.difficulty,
        lab.minutes,
        lab.welcome,
        JSON.stringify(lab.files ?? labFs()),
        createdBy,
      ]
    );
    labId = rows[0].id;
  }

  const { rows: stepCount } = await client.query(
    'SELECT COUNT(*)::int AS n FROM lab_steps WHERE lab_id = $1',
    [labId]
  );
  if (stepCount[0].n > 0) return labId;

  for (let i = 0; i < lab.steps.length; i += 1) {
    const step = lab.steps[i];
    await client.query(
      `INSERT INTO lab_steps (lab_id, position, title, instruction, hint, verification,
         expected_command, expected_output_pattern, points, is_optional)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        labId,
        i,
        step.title,
        step.instruction,
        step.hint ?? null,
        step.verification ?? (step.pattern ? 'output' : 'command'),
        step.command ?? null,
        step.pattern ?? null,
        step.points ?? 10,
        step.optional ?? false,
      ]
    );
  }
  return labId;
}

export async function seedExtraCatalog(client, instructors = {}) {
  for (const entry of extraCourses) {
    const instructorId = instructors[entry.instructor] ?? null;
    const courseId = await upsertCourse(client, instructorId, entry);
    const lessonIds = new Map();

    for (let moduleIndex = 0; moduleIndex < entry.modules.length; moduleIndex += 1) {
      const module = entry.modules[moduleIndex];
      const moduleId = await ensureModule(client, courseId, module, moduleIndex);
      for (let lessonIndex = 0; lessonIndex < module.lessons.length; lessonIndex += 1) {
        const lesson = module.lessons[lessonIndex];
        const lessonId = await ensureLesson(client, courseId, moduleId, lesson, lessonIndex);
        lessonIds.set(lesson.title, lessonId);
      }
    }

    if (entry.quiz) {
      await ensureQuiz(client, courseId, lessonIds.get(entry.quiz.lessonTitle), entry.quiz);
    }
    if (entry.lab) {
      await ensureLab(client, {
        courseId,
        lessonId: lessonIds.get(entry.lab.lessonTitle),
        createdBy: instructorId,
        lab: entry.lab,
      });
    }
  }
}

export { extraCourses };
