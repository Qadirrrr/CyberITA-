import { useMemo, useState } from 'react';
import { Badge, Button, Input } from '../ui';
import { IconBookOpen, IconLayers, IconPlus, IconSearch, IconShield, IconUsers } from '../icons';

/**
 * Assignment editor used by the Admin Moderator Management screen.
 *
 * The shape it edits is exactly what `PUT /api/moderators/:id/assignments`
 * accepts:
 *   { kind: 'course', courseId }
 *   { kind: 'instructor', instructorId }
 *   { kind: 'subject', subject }
 *   { kind: 'subject_moderator', subjectModeratorId }
 */
export default function AssignmentPicker({ tier, meta, value = [], onChange, disabled = false }) {
  const [courseSearch, setCourseSearch] = useState('');
  const [instructorSearch, setInstructorSearch] = useState('');
  const [subjectDraft, setSubjectDraft] = useState('');

  const courses = meta?.courses || [];
  const instructors = meta?.instructors || [];
  const subjectModerators = meta?.subjectModerators || [];
  const suggestedSubjects = meta?.subjects || [];

  const filteredCourses = useMemo(() => {
    const term = courseSearch.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) =>
      `${course.title} ${course.category || ''} ${course.instructor_name || ''}`.toLowerCase().includes(term)
    );
  }, [courses, courseSearch]);

  const filteredInstructors = useMemo(() => {
    const term = instructorSearch.trim().toLowerCase();
    if (!term) return instructors;
    return instructors.filter((item) => `${item.full_name} ${item.email}`.toLowerCase().includes(term));
  }, [instructors, instructorSearch]);

  const has = (predicate) => value.some(predicate);
  const emit = (next) => onChange?.(next);

  const toggleCourse = (courseId) => {
    if (disabled) return;
    emit(
      has((item) => item.kind === 'course' && item.courseId === courseId)
        ? value.filter((item) => !(item.kind === 'course' && item.courseId === courseId))
        : [...value, { kind: 'course', courseId }]
    );
  };

  const toggleInstructor = (instructorId) => {
    if (disabled) return;
    emit(
      has((item) => item.kind === 'instructor' && item.instructorId === instructorId)
        ? value.filter((item) => !(item.kind === 'instructor' && item.instructorId === instructorId))
        : [...value, { kind: 'instructor', instructorId }]
    );
  };

  const toggleSubject = (subject) => {
    if (disabled) return;
    const clean = String(subject || '').trim();
    if (!clean) return;
    emit(
      has((item) => item.kind === 'subject' && item.subject?.toLowerCase() === clean.toLowerCase())
        ? value.filter((item) => !(item.kind === 'subject' && item.subject?.toLowerCase() === clean.toLowerCase()))
        : [...value, { kind: 'subject', subject: clean }]
    );
  };

  const toggleSubjectModerator = (id) => {
    if (disabled) return;
    emit(
      has((item) => item.kind === 'subject_moderator' && item.subjectModeratorId === id)
        ? value.filter((item) => !(item.kind === 'subject_moderator' && item.subjectModeratorId === id))
        : [...value, { kind: 'subject_moderator', subjectModeratorId: id }]
    );
  };

  const addSubjectDraft = () => {
    const clean = subjectDraft.trim();
    if (!clean) return;
    toggleSubject(clean);
    setSubjectDraft('');
  };

  const counts = {
    course: value.filter((item) => item.kind === 'course').length,
    instructor: value.filter((item) => item.kind === 'instructor').length,
    subject: value.filter((item) => item.kind === 'subject').length,
    subject_moderator: value.filter((item) => item.kind === 'subject_moderator').length,
  };

  const Section = ({ icon: Icon, title, hint, count, children }) => (
    <section className="rounded-xl border border-slate-200 dark:border-white/10">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-400/10 dark:text-brand-300">
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
            {hint && <p className="truncate text-[10px] text-slate-500">{hint}</p>}
          </div>
        </div>
        <Badge tone={count > 0 ? 'brand' : 'slate'}>{count} selected</Badge>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );

  if (!meta) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-white/10">
        Loading assignment options…
      </div>
    );
  }

  if (tier === 'senior_moderator') {
    return (
      <div className="space-y-3">
        <Section
          icon={IconShield}
          title="Supervised subject moderators"
          hint="The senior moderator reviews their reports and escalations."
          count={counts.subject_moderator}
        >
          {subjectModerators.length === 0 ? (
            <p className="px-1 py-3 text-xs text-slate-500">
              No subject moderators exist yet. Create one first, then assign them here.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {subjectModerators.map((moderator) => {
                const checked = has(
                  (item) => item.kind === 'subject_moderator' && item.subjectModeratorId === moderator.id
                );
                return (
                  <li key={moderator.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleSubjectModerator(moderator.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-night-900 dark:text-brand-400"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                          {moderator.display_name || moderator.full_name}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">{moderator.email}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Section
        icon={IconBookOpen}
        title="Courses"
        hint="Courses this moderator oversees."
        count={counts.course}
      >
        <div className="relative mb-2">
          <IconSearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            placeholder="Search courses…"
            className="input h-8 pl-8 text-xs"
            aria-label="Search courses"
          />
        </div>
        {filteredCourses.length === 0 ? (
          <p className="px-1 py-3 text-xs text-slate-500">No courses match your search.</p>
        ) : (
          <ul className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
            {filteredCourses.map((course) => {
              const checked = has((item) => item.kind === 'course' && item.courseId === Number(course.id));
              return (
                <li key={course.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleCourse(Number(course.id))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-night-900 dark:text-brand-400"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                        {course.title}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {course.category || 'Uncategorised'} · {course.instructor_name || 'No instructor'}
                      </span>
                    </span>
                    <Badge tone={course.status === 'published' ? 'emerald' : 'slate'}>{course.status}</Badge>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        icon={IconUsers}
        title="Instructors"
        hint="Instructors whose courses and labs this moderator reviews."
        count={counts.instructor}
      >
        <div className="relative mb-2">
          <IconSearch size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={instructorSearch}
            onChange={(event) => setInstructorSearch(event.target.value)}
            placeholder="Search instructors…"
            className="input h-8 pl-8 text-xs"
            aria-label="Search instructors"
          />
        </div>
        {filteredInstructors.length === 0 ? (
          <p className="px-1 py-3 text-xs text-slate-500">No instructors match your search.</p>
        ) : (
          <ul className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
            {filteredInstructors.map((instructor) => {
              const checked = has(
                (item) => item.kind === 'instructor' && item.instructorId === Number(instructor.id)
              );
              return (
                <li key={instructor.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleInstructor(Number(instructor.id))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-night-900 dark:text-brand-400"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                        {instructor.full_name}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">{instructor.email}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        icon={IconLayers}
        title="Subjects"
        hint="Any course in these subjects falls inside the moderator's scope."
        count={counts.subject}
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestedSubjects.map((subject) => {
            const checked = has(
              (item) => item.kind === 'subject' && item.subject?.toLowerCase() === subject.toLowerCase()
            );
            return (
              <button
                key={subject}
                type="button"
                disabled={disabled}
                onClick={() => toggleSubject(subject)}
                className={`chip text-[11px] ${checked ? 'chip-active' : ''}`}
              >
                {subject}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={subjectDraft}
            onChange={(event) => setSubjectDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addSubjectDraft();
              }
            }}
            placeholder="Add another subject…"
            className="h-9 text-xs"
            disabled={disabled}
          />
          <Button type="button" size="sm" variant="secondary" onClick={addSubjectDraft} disabled={disabled}>
            <IconPlus size={13} /> Add
          </Button>
        </div>
      </Section>
    </div>
  );
}
