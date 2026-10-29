/**
 * Assignment brief generator for CyberITA+.
 *
 * Produces a professional, submission-ready brief from a title + short brief:
 * scenario, task list, deliverables, evidence requirements, grading rubric and
 * a submission checklist. The content is deterministic and domain aware, so two
 * briefs written by the same instructor stay consistent.
 */

const DOMAINS = [
  {
    key: 'log_analysis',
    match: ['log', 'siem', 'incident', 'forensic', 'detection', 'monitoring', 'audit', 'triage'],
    role: 'SOC analyst',
    scenario:
      'The monitoring team escalated a set of authentication failures and server errors from a production web tier. You receive the raw access logs and must decide, from evidence only, whether this was brute force, exploitation, or normal user error.',
    tasks: [
      'Establish a timeline of the suspicious activity, oldest event first.',
      'Identify every source address involved and rank them by request volume.',
      'Separate failed authentication attempts from successful ones.',
      'Highlight any request that looks like automated exploitation tooling.',
      'Recommend one detection rule that would have caught this earlier.',
    ],
    evidence: ['The exact commands or queries you used', 'Relevant log excerpts with timestamps', 'A screenshot of your analysis output'],
    criteria: [
      ['Evidence accuracy (commands and excerpts)', '30%'],
      ['Timeline and source attribution', '25%'],
      ['Attack classification and reasoning', '25%'],
      ['Detection recommendation', '20%'],
    ],
  },
  {
    key: 'network',
    match: ['network', 'firewall', 'port', 'tcp', 'udp', 'nmap', 'scan', 'dns', 'segmentation', 'vpn'],
    role: 'network security engineer',
    scenario:
      'A host was added to the estate without documentation. Before any firewall change is approved, you must produce an evidence-based picture of its interfaces, listening services and reachability.',
    tasks: [
      'Enumerate interfaces and assigned addresses.',
      'List every listening TCP/UDP service and the process behind it.',
      'Verify reachability of the exposed services from the same host.',
      'Classify each exposed service as required or unnecessary.',
      'Propose the minimum set of firewall rules that keeps the host functional.',
    ],
    evidence: ['Interface and socket listings', 'Reachability test output', 'Before/after rule proposal'],
    criteria: [
      ['Completeness of the enumeration', '30%'],
      ['Correct interpretation of the results', '25%'],
      ['Least-privilege rule design', '30%'],
      ['Clarity of the written recommendation', '15%'],
    ],
  },
  {
    key: 'linux',
    match: ['linux', 'permission', 'chmod', 'process', 'bash', 'systemd', 'server', 'hardening', 'privilege'],
    role: 'Linux systems administrator',
    scenario:
      'A production Linux server is reported as slow and a credential file was found with permissions that are too open. You have shell access and must collect evidence before changing anything.',
    tasks: [
      'Record the host identity: OS release, kernel, current user and groups.',
      'Collect CPU, memory and disk evidence and explain the bottleneck.',
      'Identify processes that are consuming the most memory or CPU.',
      'Locate the over-permissive file and correct its mode.',
      'Explain the permission change in terms of least privilege.',
    ],
    evidence: ['Command output for every finding', 'The permission change you applied', 'A short root-cause explanation'],
    criteria: [
      ['Systematic evidence collection', '30%'],
      ['Correct diagnosis', '30%'],
      ['Safe and minimal remediation', '25%'],
      ['Explanation of the security principle', '15%'],
    ],
  },
  {
    key: 'web',
    match: ['web', 'xss', 'sql', 'injection', 'csrf', 'api', 'owasp', 'session', 'cookie', 'jwt'],
    role: 'application security engineer',
    scenario:
      'A security review flagged an authenticated web endpoint that accepts user-controlled input. You must assess the risk, reproduce the weakness safely in the lab, and propose a defence that survives code review.',
    tasks: [
      'Describe the trust boundary the input crosses.',
      'Reproduce the weakness in the lab and record the exact request.',
      'Explain the impact if the weakness is exploited.',
      'Propose and justify a defence-in-depth fix.',
      'List the tests that prove the fix works.',
    ],
    evidence: ['Raw requests and responses', 'Screenshots of the reproduction', 'The proposed patch or configuration'],
    criteria: [
      ['Correct identification of the weakness', '30%'],
      ['Safe, reproducible evidence', '25%'],
      ['Quality of the remediation', '30%'],
      ['Verification plan', '15%'],
    ],
  },
  {
    key: 'general',
    match: [],
    role: 'security analyst',
    scenario:
      'Your team must assess a security concern, document the evidence and present a defensible recommendation. Assumptions must be stated explicitly; every claim must be supported by output you produced yourself.',
    tasks: [
      'Define the scope and state your assumptions.',
      'Collect evidence with repeatable commands or steps.',
      'Analyse the findings and separate facts from inferences.',
      'Recommend the smallest effective remediation.',
      'Describe how you would verify the remediation.',
    ],
    evidence: ['Reproducible command output', 'Screenshots where output alone is not enough', 'A written analysis with references'],
    criteria: [
      ['Scope and assumption quality', '20%'],
      ['Evidence and reproducibility', '30%'],
      ['Analysis and reasoning', '30%'],
      ['Remediation and verification plan', '20%'],
    ],
  },
];

function detectDomain(text) {
  const normalized = String(text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const domain of DOMAINS) {
    const score = domain.match.reduce(
      (total, keyword) => (normalized.includes(keyword) ? total + keyword.length : total),
      0
    );
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }
  return best || DOMAINS[DOMAINS.length - 1];
}

const DIFFICULTY_GUIDANCE = {
  beginner:
    'This is an entry-level brief: follow the tasks in order, use the commands shown in the course material, and explain each result in one or two sentences.',
  intermediate:
    'This is an intermediate brief: you are expected to choose the right tooling, justify your choices, and document the evidence so a colleague could reproduce it.',
  advanced:
    'This is an advanced brief: assumptions, edge cases and limitations must be addressed. Where a command could be destructive, describe the safer alternative you used.',
};

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.details]
 * @param {'beginner'|'intermediate'|'advanced'} [options.difficulty]
 * @param {number} [options.points]
 * @param {number} [options.dueInDays]
 */
export function generateAssignment({ title, details = '', difficulty = 'intermediate', points = 100, dueInDays = 7 } = {}) {
  const cleanTitle = String(title || '').trim() || 'Security analysis brief';
  const cleanDetails = String(details || '').trim();
  const domain = detectDomain(`${cleanTitle} ${cleanDetails}`);
  const level = ['beginner', 'intermediate', 'advanced'].includes(difficulty) ? difficulty : 'intermediate';
  const totalPoints = Math.max(10, Math.min(500, Number(points) || 100));
  const days = Math.max(1, Math.min(120, Number(dueInDays) || 7));
  const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const description = [
    `## Scenario`,
    domain.scenario,
    cleanDetails ? `\n**Instructor brief:** ${cleanDetails}` : '',
    '',
    `## Your role`,
    `You are acting as the ${domain.role}. Write for a technical reviewer who has not seen your screen.`,
    '',
    `## Tasks`,
    ...domain.tasks.map((task, index) => `${index + 1}. ${task}`),
    '',
    `## Deliverables`,
    '- A written report (Markdown or PDF) with a short executive summary and a findings section.',
    '- An appendix with the exact commands, queries or requests you executed.',
    '- A conclusion that states what you would change and why.',
    '',
    `## Evidence to include`,
    ...domain.evidence.map((item) => `- ${item}`),
    '',
    `## Grading rubric`,
    '| Criterion | Weight |',
    '| --- | --- |',
    ...domain.criteria.map(([criterion, weight]) => `| ${criterion} | ${weight} |`),
    '',
    `## Expectations`,
    DIFFICULTY_GUIDANCE[level],
    '',
    `_Total marks: ${totalPoints}. Late submissions are accepted but flagged for review._`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    title: cleanTitle,
    description: description.replace(/\n{3,}/g, '\n\n'),
    points: totalPoints,
    difficulty: level,
    dueAt,
    domain: domain.key,
  };
}

export default { generateAssignment };
