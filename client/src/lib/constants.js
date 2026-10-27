export const ROLES = {
  student: 'Student',
  instructor: 'Instructor',
  admin: 'Administrator',
};

export const DIFFICULTIES = {
  beginner: { label: 'Beginner', tone: 'emerald' },
  intermediate: { label: 'Intermediate', tone: 'amber' },
  advanced: { label: 'Advanced', tone: 'rose' },
};

export const CATEGORIES = [
  'Linux',
  'Networking',
  'Cybersecurity',
  'Cloud',
  'Windows',
  'DevOps',
  'Programming',
  'Web Development',
  'Databases',
  'Automation',
  'Career',
];

export const SUBCATEGORY_SUGGESTIONS = {
  Linux: ['Linux Administration', 'Shell Scripting', 'System Hardening'],
  Networking: ['Network Fundamentals', 'Troubleshooting', 'Network Security', 'Cisco & Routing'],
  Cybersecurity: [
    'Security Fundamentals',
    'Ethical Hacking',
    'Penetration Testing',
    'Security Operations',
    'Governance & Compliance',
    'Threat Detection',
    'Incident Response',
  ],
  Cloud: ['Cloud Platforms', 'Cloud Security', 'Cloud Architecture', 'AWS', 'Cloud Networking'],
  Windows: ['Server Administration', 'Active Directory', 'PowerShell'],
  DevOps: ['CI/CD & Automation', 'Containers', 'Infrastructure as Code'],
  Programming: ['Python', 'JavaScript', 'Go', 'Bash'],
  'Web Development': ['React', 'Express', 'Full Stack', 'APIs'],
  Databases: ['SQL & PostgreSQL', 'Database Design', 'Performance'],
  Automation: ['Python Automation', 'Ansible', 'Scripting'],
  Career: ['Career Growth', 'Interview Prep', 'Portfolio'],
};

export const LAB_CATEGORIES = ['Linux', 'Networking', 'Cybersecurity', 'Cloud', 'DevOps', 'Programming', 'Databases'];

export const REPORT_STATUS = {
  draft: { label: 'Draft', tone: 'slate' },
  submitted: { label: 'Pending review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Needs changes', tone: 'rose' },
  published: { label: 'Published', tone: 'brand' },
};

export const SUBMISSION_STATUS = {
  submitted: { label: 'Submitted', tone: 'amber' },
  graded: { label: 'Graded', tone: 'emerald' },
  returned: { label: 'Returned', tone: 'rose' },
};

export const LAB_SUBMISSION_STATUS = {
  submitted: { label: 'Pending review', tone: 'amber' },
  changes_requested: { label: 'Changes requested', tone: 'rose' },
  approved: { label: 'Approved', tone: 'emerald' },
};

export const ENROLLMENT_STATUS = {
  active: { label: 'In progress', tone: 'brand' },
  completed: { label: 'Completed', tone: 'emerald' },
  dropped: { label: 'Dropped', tone: 'slate' },
};

export const NOTIFICATION_TONES = {
  system: 'slate',
  course: 'brand',
  grade: 'emerald',
  lab: 'accent',
  report: 'amber',
  certificate: 'emerald',
  message: 'brand',
};

export const SESSION_STORAGE = {
  terminalHistory: 'cyberita:terminal-history',
};
