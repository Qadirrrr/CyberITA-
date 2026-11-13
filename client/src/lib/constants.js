export const ROLES = {
  student: 'Student',
  instructor: 'Instructor',
  admin: 'Administrator',
  senior_moderator: 'Senior Moderator',
  subject_moderator: 'Subject / Course Moderator',
};

/** Roles that may be assigned through the regular Users screen. */
export const STANDARD_ROLES = ['admin', 'instructor', 'student'];

/** Moderation roles are provisioned from Moderator Management only. */
export const MODERATOR_ROLES = ['senior_moderator', 'subject_moderator'];

export const DIFFICULTIES = {
  beginner: { label: 'Beginner', tone: 'emerald' },
  intermediate: { label: 'Intermediate', tone: 'amber' },
  advanced: { label: 'Advanced', tone: 'rose' },
};

/** How a lab is delivered: guided steps, a question-only assessment, or a
 *  question-only assessment on a dedicated cloud server (Real VPS). */
export const LAB_MODES = {
  practice: {
    label: 'Guided practice',
    short: 'Guided',
    tone: 'sky',
    description: 'Step-by-step instructions, hints and automatic step verification.',
  },
  real: {
    label: 'Real assessment',
    short: 'Real',
    tone: 'rose',
    description: 'Question-only task with screenshot evidence and instructor review.',
  },
  vps: {
    label: 'Real VPS',
    short: 'Real VPS',
    tone: 'accent',
    description: 'Question-only task on a dedicated cloud server, with screenshot evidence and instructor review.',
  },
};

/** Fixed VPS gateway profiles an instructor can pick for a Real VPS lab. */
export const VPS_LAB_PROFILES = [
  { key: 'ubuntu-basic', label: 'CyberITA Lab (Ubuntu)', providerName: 'AWS' },
  { key: 'debian-admin', label: 'CyberITA Lab (Debian)', providerName: 'AWS' },
  { key: 'network-firewall', label: 'CyberITA Lab (Ubuntu - Networking)', providerName: 'AWS' },
  { key: 'server-hardening', label: 'CyberITA Lab (Ubuntu - Hardening)', providerName: 'AWS' },
  { key: 'penetration-testing', label: 'CyberITA Lab (Ubuntu - Pen Testing)', providerName: 'AWS' },
  { key: 'ubuntu-basic-linode', label: 'CyberITA Lab (Ubuntu)', providerName: 'Linode' },
  { key: 'debian-admin-linode', label: 'CyberITA Lab (Debian)', providerName: 'Linode' },
  { key: 'network-firewall-linode', label: 'CyberITA Lab (Ubuntu - Networking)', providerName: 'Linode' },
  { key: 'server-hardening-linode', label: 'CyberITA Lab (Ubuntu - Hardening)', providerName: 'Linode' },
  { key: 'penetration-testing-linode', label: 'CyberITA Lab (Ubuntu - Pen Testing)', providerName: 'Linode' },
];

/**
 * Canonical course categories shown in the course editor dropdown.
 * Keep this list in sync with the public catalog navigation.
 */
export const CATEGORIES = [
  'Cybersecurity',
  'Networking',
  'DevOps',
  'Linux',
  'System Administration',
  'Cloud Computing',
  'Digital Marketing',
  'Programming',
  'Designing',
];

/** Legacy category names still stored on older courses (kept for editing/back-compat). */
export const LEGACY_CATEGORIES = ['Cloud', 'Windows', 'Web Development', 'Databases', 'Automation', 'Career'];

export const SUBCATEGORY_SUGGESTIONS = {
  Cybersecurity: ['CEH', 'CISSP', 'Penetration Testing', 'SIEM'],
  Networking: ['CCNA', 'CCNP', 'HCIA-Datacom', 'HCIP-Datacom'],
  DevOps: [
    'Git',
    'Docker',
    'Docker Compose',
    'Kubernetes',
    'CI/CD',
    'Prometheus',
    'Terraform',
    'Jenkins',
    'Ansible',
    'Puppet',
    'Chef',
    'Vagrant',
    'Nagios',
  ],
  Linux: ['RHCSA', 'RHCE', 'Kali Linux', 'FreeBSD UNIX', 'OpenShift', 'OpenSUSE Linux'],
  'System Administration': ['Server Administration', 'Active Directory', 'PowerShell', 'Virtualisation', 'Backup & Recovery'],
  'Cloud Computing': [
    'AWS Certified Solutions Architect – Associate',
    'AWS Certified Solutions Architect – Professional',
    'GCP – Google Cloud Platform',
    'Microsoft Azure',
  ],
  'Digital Marketing': ['SEO', 'Social Media', 'Content Marketing', 'Google Ads', 'Email Marketing'],
  Programming: [
    'Back End Website Development',
    'Front End Website Development',
    'Java Programming',
    'Python Programming',
    'CyberSecurity',
  ],
  Designing: ['Graphics Designing', 'Video Editing'],
  // Legacy categories (older courses)
  Cloud: ['AWS Certified Solutions Architect – Associate', 'GCP – Google Cloud Platform', 'Microsoft Azure'],
  Windows: ['Server Administration', 'Active Directory', 'PowerShell'],
  'Web Development': ['Front End Website Development', 'Back End Website Development', 'Full Stack', 'APIs'],
  Databases: ['SQL & PostgreSQL', 'Database Design', 'Performance'],
  Automation: ['Ansible', 'Puppet', 'Chef', 'Scripting'],
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
