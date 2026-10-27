import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, enroll, TINY_PNG } from './helpers.js';

async function setupLabFixture() {
  const instructor = await createUser({ role: 'instructor', fullName: 'Lab Instructor' });
  const instructorSession = await loginAs(instructor);
  const student = await createUser({ fullName: 'Lab Student' });
  const studentSession = await loginAs(student);

  const course = await createCourseFor(instructorSession.token, { title: 'Linux Labs Course' });
  await enroll(studentSession.token, course.id);

  const labRes = await instructorSession
    .auth(api().post('/api/labs'))
    .send({
      title: 'File System Basics Lab',
      courseId: course.id,
      summary: 'Practice navigation',
      description: 'A practical lab.',
      difficulty: 'beginner',
      estimatedMinutes: 20,
      terminalWelcome: 'Welcome to the test lab.',
      status: 'published',
    })
    .expect(201);
  const lab = labRes.body.lab;

  const step1 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({ title: 'Print directory', instruction: 'Run pwd', verification: 'command', expectedCommand: 'pwd', points: 20 })
    .expect(201);
  const step2 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({ title: 'List files', instruction: 'Run ls -la', verification: 'command', expectedCommand: 'ls -la', points: 20 })
    .expect(201);
  const step3 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({ title: 'Read welcome', instruction: 'Run cat welcome.txt', verification: 'output', expectedOutputPattern: 'Welcome to your CyberITA\\+ lab environment', points: 20 })
    .expect(201);
  const step4 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({ title: 'Reflect', instruction: 'Explain what you learned', verification: 'manual', points: 20 })
    .expect(201);

  return { instructor, instructorSession, student, studentSession, course, lab, steps: [step1.body.step, step2.body.step, step3.body.step, step4.body.step] };
}

describe('Lab provider status', () => {
  it('reports the mock provider as available and never requires real cloud creds', async () => {
    const res = await api().get('/api/labs/status').expect(200);
    expect(res.body.provider).toBe('mock');
    expect(res.body.available).toBe(true);
  });
});

describe('Practical labs', () => {
  it('hides step answers from students but shows them to staff', async () => {
    const { instructorSession, studentSession, lab } = await setupLabFixture();

    const studentView = await studentSession.auth(api().get(`/api/labs/${lab.id}`)).expect(200);
    const studentStep = studentView.body.steps[0];
    expect(studentStep.expected_command).toBeUndefined();
    expect(JSON.stringify(studentView.body.steps)).not.toContain('expected_command');

    const staffView = await instructorSession.auth(api().get(`/api/labs/${lab.id}`)).expect(200);
    expect(staffView.body.steps[0].expected_command).toBe('pwd');
  });

  it('runs the complete lab workflow: session, terminal, screenshot, report, review, publish', async () => {
    const { instructorSession, studentSession, student, lab, steps } = await setupLabFixture();

    // Start session (mock provisioning)
    const startRes = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    expect(startRes.body.session.status).toBe('running');
    expect(startRes.body.session.provider).toBe('mock');
    expect(startRes.body.session.instance_id).toMatch(/^mock-/);
    expect(startRes.body.steps).toHaveLength(4);
    expect(startRes.body.progress.percent).toBe(0);
    const sessionId = startRes.body.session.id;

    // Reuse running session
    const reuseRes = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(200);
    expect(reuseRes.body.reused).toBe(true);

    // Run commands through the simulated terminal
    const pwd = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'pwd' })
      .expect(200);
    expect(pwd.body.output).toBe('/home/student');
    expect(pwd.body.exitCode).toBe(0);
    expect(pwd.body.completedSteps.map((s) => s.id)).toContain(steps[0].id);

    const ls = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'ls -la' })
      .expect(200);
    expect(ls.body.output).toContain('welcome.txt');

    const wrong = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'echo hi' })
      .expect(200);
    expect(wrong.body.completedSteps).toHaveLength(0);
    expect(wrong.body.output).toBe('hi');

    const cat = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'cat welcome.txt' })
      .expect(200);
    expect(cat.body.completedSteps.map((s) => s.id)).toContain(steps[2].id);

    // Simulated filesystem persists between commands
    await studentSession.auth(api().post(`/api/labs/sessions/${sessionId}/exec`)).send({ command: 'mkdir practice' }).expect(200);
    const listing = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'ls' })
      .expect(200);
    expect(listing.body.output).toContain('practice');

    // Unknown commands are handled gracefully
    const unknown = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'definitelynotacommand' })
      .expect(200);
    expect(unknown.body.exitCode).toBe(127);
    expect(unknown.body.output).toContain('command not found');

    await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: '   ' })
      .expect(400);

    // Manual step confirmation
    const manual = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/steps/${steps[3].id}/complete`))
      .send({ note: 'I learned how to navigate.' })
      .expect(200);
    expect(manual.body.completion.labCompleted).toBe(true);

    // Manual endpoint refuses auto-verified steps
    await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/steps/${steps[0].id}/complete`))
      .send({})
      .expect(400);

    // Screenshot upload
    const shot = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/screenshots`))
      .field('stepId', String(steps[0].id))
      .attach('file', TINY_PNG, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);
    expect(shot.body.screenshot.file_path).toMatch(/^\/uploads\/shot-/);
    expect(shot.body.screenshot.mime_type).toBe('image/png');

    const badUpload = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/screenshots`))
      .attach('file', Buffer.from('not an image'), { filename: 'evil.txt', contentType: 'text/plain' })
      .expect(400);
    expect(badUpload.body.error.message).toContain('PNG');

    // Overview reflects completion
    const overview = await studentSession.auth(api().get(`/api/labs/sessions/${sessionId}`)).expect(200);
    expect(overview.body.progress.percent).toBe(100);
    expect(overview.body.progress.allRequiredCompleted).toBe(true);
    expect(overview.body.screenshots).toHaveLength(1);

    // Generate report from session data
    const reportRes = await studentSession
      .auth(api().post(`/api/reports/sessions/${sessionId}/generate`))
      .expect(201);
    const report = reportRes.body.report;
    expect(report.status).toBe('draft');
    expect(report.sections.length).toBeGreaterThanOrEqual(3);
    expect(report.sections[0].command).toBeTruthy();
    expect(report.sections.some((s) => s.screenshots.length > 0)).toBe(true);

    await studentSession.auth(api().post(`/api/reports/sessions/${sessionId}/generate`)).expect(400);

    // Edit draft
    const edited = await studentSession
      .auth(api().put(`/api/reports/${report.id}`))
      .send({ title: 'My Custom Lab Report', summary: 'Updated summary' })
      .expect(200);
    expect(edited.body.report.title).toBe('My Custom Lab Report');

    // Submit for review
    const submitted = await studentSession.auth(api().post(`/api/reports/${report.id}/submit`)).expect(200);
    expect(submitted.body.report.status).toBe('submitted');

    await studentSession.auth(api().put(`/api/reports/${report.id}`)).send({ title: 'Nope' }).expect(403);

    // Instructor review queue
    const queue = await instructorSession.auth(api().get('/api/reports?status=submitted')).expect(200);
    expect(queue.body.reports.some((r) => r.id === report.id)).toBe(true);

    // Reject then approve
    const rejected = await instructorSession
      .auth(api().post(`/api/reports/${report.id}/review`))
      .send({ action: 'reject', feedback: 'Please add more detail to step 2.' })
      .expect(200);
    expect(rejected.body.report.status).toBe('rejected');

    const studentSees = await studentSession.auth(api().get(`/api/reports/${report.id}`)).expect(200);
    expect(studentSees.body.report.instructor_feedback).toContain('more detail');

    // Student revises and resubmits (editing a rejected report moves it back to draft)
    await studentSession.auth(api().put(`/api/reports/${report.id}`)).send({ summary: 'Revised summary' }).expect(200);
    await studentSession.auth(api().post(`/api/reports/${report.id}/submit`)).expect(200);

    // Cannot publish before approval
    await instructorSession.auth(api().post(`/api/reports/${report.id}/publish`)).send({}).expect(400);

    const approved = await instructorSession
      .auth(api().post(`/api/reports/${report.id}/review`))
      .send({ action: 'approve', feedback: 'Excellent work.' })
      .expect(200);
    expect(approved.body.report.status).toBe('approved');

    // Convert the approved report into an instructor-authored blog draft
    const publishRes = await instructorSession
      .auth(api().post(`/api/reports/${report.id}/publish`))
      .send({ title: 'Published Lab Report', tags: ['linux', 'lab-report'] })
      .expect(201);
    expect(publishRes.body.post.slug).toBeTruthy();
    expect(publishRes.body.post.status).toBe('draft');
    expect(publishRes.body.report.status).toBe('approved');

    // Drafts stay private until the instructor publishes them
    await api().get(`/api/posts/${publishRes.body.post.slug}`).expect(404);
    const draftArticle = await instructorSession
      .auth(api().get(`/api/posts/${publishRes.body.post.slug}`))
      .expect(200);
    expect(draftArticle.body.post.status).toBe('draft');

    await instructorSession
      .auth(api().post(`/api/posts/${publishRes.body.post.id}/status`))
      .send({ status: 'published' })
      .expect(200);

    const article = await api().get(`/api/posts/${publishRes.body.post.slug}`).expect(200);
    expect(article.body.post.title).toBe('Published Lab Report');
    expect(article.body.post.content).toContain('Practical Report');

    // Publishing twice is prevented
    await instructorSession.auth(api().post(`/api/reports/${report.id}/publish`)).send({}).expect(400);

    // Lab completion synced the linked lesson progress / notifications
    const notifications = await studentSession.auth(api().get('/api/notifications')).expect(200);
    expect(notifications.body.notifications.some((n) => n.type === 'lab')).toBe(true);
    expect(notifications.body.unread).toBeGreaterThan(0);

    // Session access control
    const other = await createUser();
    const otherSession = await loginAs(other);
    await otherSession.auth(api().get(`/api/labs/sessions/${sessionId}`)).expect(403);
    await otherSession.auth(api().post(`/api/labs/sessions/${sessionId}/exec`)).send({ command: 'pwd' }).expect(403);

    // Stop session and verify terminal is closed
    const stopRes = await studentSession.auth(api().post(`/api/labs/sessions/${sessionId}/stop`)).expect(200);
    expect(stopRes.body.session.status).toBe('stopped');
    const afterStop = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'pwd' })
      .expect(400);
    expect(afterStop.body.error.message).toContain('not running');

    expect(student.full_name).toBe('Lab Student');
  });

  it('rejects starting a lab without enrollment or without steps', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const student = await createUser();
    const studentSession = await loginAs(student);
    const course = await createCourseFor(instructorSession.token, { title: 'Unenrolled Course' });

    const emptyLab = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'Empty Lab', courseId: course.id, status: 'published' })
      .expect(201);

    await studentSession.auth(api().post(`/api/labs/${emptyLab.body.lab.id}/sessions`)).expect(400);

    const lab = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'Enrollment Lab', courseId: course.id, status: 'published' })
      .expect(201);
    await instructorSession
      .auth(api().post(`/api/labs/${lab.body.lab.id}/steps`))
      .send({ title: 'Step', instruction: 'Run pwd', expectedCommand: 'pwd' })
      .expect(201);

    const res = await studentSession.auth(api().post(`/api/labs/${lab.body.lab.id}/sessions`)).expect(400);
    expect(res.body.error.message).toContain('Enroll');
  });

  it('supports staff lab management and student lab catalog', async () => {
    const { instructorSession, studentSession, lab } = await setupLabFixture();

    const manage = await instructorSession.auth(api().get(`/api/labs/${lab.id}/manage`)).expect(200);
    expect(manage.body.steps).toHaveLength(4);
    expect(manage.body.stats.sessions).toBe(0);

    const update = await instructorSession
      .auth(api().put(`/api/labs/${lab.id}`))
      .send({ difficulty: 'intermediate', estimatedMinutes: 45 })
      .expect(200);
    expect(update.body.lab.difficulty).toBe('intermediate');

    const stepId = manage.body.steps[0].id;
    await instructorSession
      .auth(api().put(`/api/labs/steps/${stepId}`))
      .send({ title: 'Updated Step', points: 30 })
      .expect(200);
    await instructorSession.auth(api().delete(`/api/labs/steps/${stepId}`)).expect(200);

    const catalog = await studentSession.auth(api().get('/api/labs')).expect(200);
    expect(catalog.body.labs.some((l) => l.id === lab.id)).toBe(true);
    expect(catalog.body.labs.find((l) => l.id === lab.id).step_count).toBe(3);

    await instructorSession.auth(api().delete(`/api/labs/${lab.id}`)).expect(200);
    await api().get(`/api/labs/${lab.id}`).expect(404);
  });

  it('includes published labs in the navbar catalog', async () => {
    const { lab, course } = await setupLabFixture();
    const res = await api().get('/api/nav').expect(200);
    const found = res.body.labs.find((entry) => String(entry.id) === String(lab.id));
    expect(found).toBeTruthy();
    expect(String(found.course_id)).toBe(String(course.id));
    expect(found.course_title).toBe(course.title);
  });
});
