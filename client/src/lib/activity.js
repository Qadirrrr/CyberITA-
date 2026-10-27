const meta = {
  'account.registered': { tone: 'brand', template: () => 'Created your CyberITA+ account' },
  'account.login': { tone: 'slate', template: () => 'Signed in to your account' },
  'course.enrolled': { tone: 'brand', template: (m) => `Enrolled in ${m.title ? `“${m.title}”` : 'a course'}` },
  'course.completed': { tone: 'emerald', template: () => 'Completed a course' },
  'lesson.completed': {
    tone: 'emerald',
    template: (m) => `Completed lesson${m.title ? ` “${m.title}”` : ''}${m.progress != null ? `, ${m.progress}%` : ''}`,
  },
  'quiz.attempted': {
    tone: 'accent',
    template: (m) => `Attempted quiz${m.title ? ` “${m.title}”` : ''}${m.score != null ? `, ${m.score}/${m.maxPoints}` : ''}`,
  },
  'lab.started': { tone: 'brand', template: (m) => `Started lab${m.title ? ` “${m.title}”` : ''}` },
  'lab.stopped': { tone: 'slate', template: () => 'Stopped a lab session' },
  'lab.step_completed': { tone: 'brand', template: (m) => `Verified lab step${m.stepTitle ? ` “${m.stepTitle}”` : ''}` },
  'lab.screenshot_uploaded': { tone: 'accent', template: (m) => `Uploaded screenshot${m.name ? ` ${m.name}` : ''}` },
  'lab.completed': { tone: 'emerald', template: (m) => `Completed lab${m.title ? ` “${m.title}”` : ''}` },
  'assignment.submitted': { tone: 'amber', template: (m) => `Submitted assignment${m.title ? ` “${m.title}”` : ''}` },
  'assignment.graded': { tone: 'emerald', template: (m) => `Assignment graded${m.grade != null ? `, ${m.grade} points` : ''}` },
  'report.generated': { tone: 'brand', template: (m) => `Generated a practical report${m.steps ? ` (${m.steps} steps)` : ''}` },
  'report.submitted': { tone: 'amber', template: (m) => `Submitted report${m.title ? ` “${m.title}”` : ''} for review` },
  'report.approved': { tone: 'emerald', template: () => 'Practical report approved' },
  'report.rejected': { tone: 'rose', template: () => 'Practical report returned for changes' },
  'report.published': { tone: 'emerald', template: () => 'Report published to the blog' },
  'admin.user_updated': { tone: 'slate', template: () => 'Updated a user account' },
};

export function describeActivity(event) {
  const entry = meta[event.action];
  const metadata = event.metadata || {};
  if (!entry) {
    return { title: event.action.replace(/[._]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()), tone: 'slate' };
  }
  return { title: entry.template(metadata), tone: entry.tone };
}

export function activityToneClasses(tone = 'slate') {
  const tones = {
    brand: 'bg-brand-400/10 text-brand-300',
    emerald: 'bg-emerald-400/10 text-emerald-300',
    amber: 'bg-amber-400/10 text-amber-300',
    rose: 'bg-rose-400/10 text-rose-300',
    accent: 'bg-accent-400/10 text-accent-300',
    slate: 'bg-white/5 text-slate-400',
  };
  return tones[tone] || tones.slate;
}
