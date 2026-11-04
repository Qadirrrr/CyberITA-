/**
 * Shared labels and tones for the hierarchical moderator system.
 *
 *   Admin -> Senior Moderator -> Subject/Course Moderator -> Instructors
 *
 * These maps are intentionally separate from `lib/constants.js` so the
 * moderation vocabulary never leaks into student/instructor UI that already
 * uses its own report statuses.
 */

export const MODERATOR_TIERS = {
  senior_moderator: {
    label: 'Senior Moderator',
    short: 'Senior',
    tone: 'accent',
    description: 'Supervises subject moderators and resolves escalations.',
  },
  subject_moderator: {
    label: 'Subject / Course Moderator',
    short: 'Subject',
    tone: 'brand',
    description: 'Manages assigned courses, instructors and student complaints.',
  },
};

export const MODERATOR_STATUS = {
  active: { label: 'Active', tone: 'emerald' },
  suspended: { label: 'Suspended', tone: 'rose' },
};

export const MODERATION_REPORT_STATUS = {
  open: { label: 'Open', tone: 'brand' },
  in_review: { label: 'In review', tone: 'amber' },
  escalated: { label: 'Escalated', tone: 'accent' },
  resolved: { label: 'Resolved', tone: 'emerald' },
  dismissed: { label: 'Dismissed', tone: 'slate' },
};

export const MODERATION_REPORT_KIND = {
  complaint: { label: 'Student complaint', tone: 'rose' },
  content_quality: { label: 'Content quality', tone: 'amber' },
  moderation_task: { label: 'Moderation task', tone: 'brand' },
  escalation: { label: 'Escalation', tone: 'accent' },
};

export const MODERATION_SEVERITY = {
  low: { label: 'Low', tone: 'slate' },
  normal: { label: 'Normal', tone: 'brand' },
  high: { label: 'High', tone: 'amber' },
  urgent: { label: 'Urgent', tone: 'rose' },
};

export const ASSIGNMENT_KIND_LABEL = {
  course: 'Course',
  instructor: 'Instructor',
  subject: 'Subject',
  subject_moderator: 'Subject moderator',
};

export function tierMeta(tier) {
  return MODERATOR_TIERS[tier] || { label: tier || 'Moderator', short: tier || 'Moderator', tone: 'slate' };
}

export function reportStatusMeta(status) {
  return MODERATION_REPORT_STATUS[status] || { label: status || 'Unknown', tone: 'slate' };
}

export function reportKindMeta(kind) {
  return MODERATION_REPORT_KIND[kind] || { label: kind || 'Report', tone: 'slate' };
}

export function severityMeta(severity) {
  return MODERATION_SEVERITY[severity] || { label: severity || 'Normal', tone: 'slate' };
}

/** Turns the API's assignment rows into the shape AssignmentPicker edits. */
export function assignmentsFromApi(assignments = []) {
  return assignments
    .map((item) => {
      if (item.kind === 'course' && item.course_id) return { kind: 'course', courseId: Number(item.course_id) };
      if (item.kind === 'instructor' && item.instructor_id) {
        return { kind: 'instructor', instructorId: Number(item.instructor_id) };
      }
      if (item.kind === 'subject' && item.subject) return { kind: 'subject', subject: item.subject };
      if (item.kind === 'subject_moderator') {
        const id = Number(item.moderator_target_id || item.instructor_id);
        if (id) return { kind: 'subject_moderator', subjectModeratorId: id };
      }
      return null;
    })
    .filter(Boolean);
}

/** Human readable summary for an assignment row. */
export function describeAssignment(item) {
  if (!item) return '';
  if (item.kind === 'course') return item.course_title || `Course #${item.course_id}`;
  if (item.kind === 'instructor') return item.instructor_name || `Instructor #${item.instructor_id}`;
  if (item.kind === 'subject') return item.subject || 'Subject';
  if (item.kind === 'subject_moderator') {
    return item.subject_moderator_name || item.display_name || `Moderator #${item.moderator_target_id || item.instructor_id}`;
  }
  return item.kind;
}
