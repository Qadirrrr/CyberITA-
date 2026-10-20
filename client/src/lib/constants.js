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
  'DevOps',
  'Programming',
  'Databases',
  'Career',
];

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
