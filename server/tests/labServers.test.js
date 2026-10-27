import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, enroll } from './helpers.js';

async function setupFixture({ withServer = false, maxSessions = 0 } = {}) {
  const admin = await createUser({ role: 'admin', fullName: 'Platform Admin' });
  const adminSession = await loginAs(admin);

  const instructor = await createUser({ role: 'instructor', fullName: 'Lab Instructor' });
  const instructorSession = await loginAs(instructor);
  const otherInstructor = await createUser({ role: 'instructor', fullName: 'Other Instructor' });
  const otherInstructorSession = await loginAs(otherInstructor);

  const student = await createUser({ fullName: 'Lab Student' });
  const studentSession = await loginAs(student);
  const otherStudent = await createUser({ fullName: 'Second Student' });
  const otherStudentSession = await loginAs(otherStudent);

  const course = await createCourseFor(instructorSession.token, { title: 'Server Labs Course' });
  await enroll(studentSession.token, course.id);
  await enroll(otherStudentSession.token, course.id);

  const labRes = await instructorSession
    .auth(api().post('/api/labs'))
    .send({
      title: 'Server Routing Lab',
      courseId: course.id,
      summary: 'Runs on an assigned server',
      description: 'A practical lab.',
      difficulty: 'beginner',
      estimatedMinutes: 20,
      status: 'published',
      submissionRequirements: 'Upload a screenshot of the listing.',
    })
    .expect(201);
  const lab = labRes.body.lab;

  const step1 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({ title: 'Show directory', instruction: 'Run pwd', verification: 'command', expectedCommand: 'pwd', points: 30 })
    .expect(201);
  const step2 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({ title: 'List files', instruction: 'Run ls -la', verification: 'command', expectedCommand: 'ls -la', points: 30 })
    .expect(201);

  let server = null;
  if (withServer) {
    const serverRes = await adminSession
      .auth(api().post('/api/admin/lab-servers'))
      .send({ name: `Lab node ${Date.now()}${Math.random().toString(16).slice(2, 6)}`, dockerHost: 'ssh://lab@10.0.0.5', location: 'Campus B', maxSessions })
      .expect(201);
    server = serverRes.body.server;
    await adminSession.auth(api().put(`/api/admin/labs/${lab.id}/server`)).send({ labServerId: server.id }).expect(200);
  }

  return {
    admin,
    adminSession,
    instructor,
    instructorSession,
    otherInstructor,
    otherInstructorSession,
    student,
    studentSession,
    otherStudent,
    otherStudentSession,
    course,
    lab,
    steps: [step1.body.step, step2.body.step],
    server,
  };
}

async function completeSession(studentSession, labId) {
  const startRes = await studentSession.auth(api().post(`/api/labs/${labId}/sessions`)).expect(201);
  const sessionId = startRes.body.session.id;
  await studentSession.auth(api().post(`/api/labs/sessions/${sessionId}/exec`)).send({ command: 'pwd' }).expect(200);
  await studentSession.auth(api().post(`/api/labs/sessions/${sessionId}/exec`)).send({ command: 'ls -la' }).expect(200);
  return sessionId;
}

describe('Admin-managed lab servers', () => {
  it('restricts server management to admins and validates Docker hosts', async () => {
    const { adminSession, instructorSession, studentSession } = await setupFixture();

    await studentSession.auth(api().get('/api/admin/lab-servers')).expect(403);
    await instructorSession
      .auth(api().post('/api/admin/lab-servers'))
      .send({ name: 'Not allowed' })
      .expect(403);

    const badHost = await adminSession
      .auth(api().post('/api/admin/lab-servers'))
      .send({ name: 'Bad host server', dockerHost: 'http://example.com' })
      .expect(400);
    expect(badHost.body.error.message).toContain('docker host');

    const created = await adminSession
      .auth(api().post('/api/admin/lab-servers'))
      .send({ name: 'Primary lab node', dockerHost: '', location: 'Main campus', maxSessions: 25 })
      .expect(201);
    expect(created.body.server.name).toBe('Primary lab node');
    expect(created.body.server.docker_host).toBeNull();

    await adminSession
      .auth(api().post('/api/admin/lab-servers'))
      .send({ name: 'primary LAB node', location: 'Duplicate' })
      .expect(400);

    const list = await adminSession.auth(api().get('/api/admin/lab-servers')).expect(200);
    expect(list.body.servers).toHaveLength(1);
    expect(list.body.servers[0].assigned_labs).toBe(0);
    expect(list.body.servers[0].running_sessions).toBe(0);

    const updated = await adminSession
      .auth(api().put(`/api/admin/lab-servers/${created.body.server.id}`))
      .send({ status: 'maintenance', location: 'Main campus, rack 3' })
      .expect(200);
    expect(updated.body.server.status).toBe('maintenance');
    expect(updated.body.server.location).toBe('Main campus, rack 3');

    const removed = await adminSession
      .auth(api().delete(`/api/admin/lab-servers/${created.body.server.id}`))
      .expect(200);
    expect(removed.body.ok).toBe(true);
  });

  it('assigns a server to a lab and routes each student session to it', async () => {
    const { adminSession, instructorSession, studentSession, otherStudentSession, course, lab } =
      await setupFixture({ withServer: true });

    const labs = await adminSession.auth(api().get('/api/admin/labs')).expect(200);
    const assignedLab = labs.body.labs.find((item) => String(item.id) === String(lab.id));
    expect(assignedLab.lab_server_id).toBeTruthy();
    expect(assignedLab.lab_server_name).toBeTruthy();

    const manage = await instructorSession.auth(api().get(`/api/labs/${lab.id}/manage`)).expect(200);
    expect(manage.body.lab.lab_server_id).toBeTruthy();
    expect(manage.body.lab.lab_server_name).toBe(assignedLab.lab_server_name);

    // Each student gets their own container on the same server.
    const first = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    const second = await otherStudentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    expect(String(first.body.session.lab_server_id)).toBe(String(assignedLab.lab_server_id));
    expect(String(second.body.session.lab_server_id)).toBe(String(assignedLab.lab_server_id));
    expect(first.body.session.instance_id).not.toBe(second.body.session.instance_id);

    const overview = await studentSession.auth(api().get(`/api/labs/sessions/${first.body.session.id}`)).expect(200);
    expect(overview.body.session.lab_server_name).toBe(assignedLab.lab_server_name);
    expect(overview.body.lab.submission_requirements).toContain('screenshot');

    // A server's host cannot change under running sessions.
    const hostChange = await adminSession
      .auth(api().put(`/api/admin/lab-servers/${assignedLab.lab_server_id}`))
      .send({ dockerHost: 'ssh://lab@10.0.0.9' })
      .expect(400);
    expect(hostChange.body.error.message).toContain('running');

    // A server in maintenance refuses new sessions.
    await adminSession
      .auth(api().put(`/api/admin/lab-servers/${assignedLab.lab_server_id}`))
      .send({ status: 'maintenance' })
      .expect(200);

    const thirdStudent = await createUser({ fullName: 'Third Student' });
    const thirdSession = await loginAs(thirdStudent);
    await enroll(thirdSession.token, course.id);
    const refused = await thirdSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(503);
    expect(refused.body.error.code).toBe('lab_server_unavailable');
    expect(refused.body.error.message).toContain('maintenance');

    // Deleting a server with running sessions is blocked.
    const blockedDelete = await adminSession
      .auth(api().delete(`/api/admin/lab-servers/${assignedLab.lab_server_id}`))
      .expect(400);
    expect(blockedDelete.body.error.message).toContain('running');

    // Sessions can be stopped and the server removed; the lab falls back.
    await studentSession.auth(api().post(`/api/labs/sessions/${first.body.session.id}/stop`)).expect(200);
    await otherStudentSession.auth(api().post(`/api/labs/sessions/${second.body.session.id}/stop`)).expect(200);
    await adminSession.auth(api().put(`/api/admin/lab-servers/${assignedLab.lab_server_id}`)).send({ status: 'active' }).expect(200);
    await adminSession.auth(api().delete(`/api/admin/lab-servers/${assignedLab.lab_server_id}`)).expect(200);

    const labsAfter = await adminSession.auth(api().get('/api/admin/labs')).expect(200);
    const unassigned = labsAfter.body.labs.find((item) => String(item.id) === String(lab.id));
    expect(unassigned.lab_server_id).toBeNull();
  });
});

describe('Lab submissions', () => {
  it('requires completed steps and only accepts the session owner', async () => {
    const { studentSession, otherStudentSession, lab } = await setupFixture();
    const startRes = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    const sessionId = startRes.body.session.id;

    const early = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'Trying too soon')
      .expect(400);
    expect(early.body.error.message).toContain('required steps');

    await otherStudentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'Not mine')
      .expect(403);

    await studentSession.auth(api().post(`/api/labs/sessions/${sessionId}/exec`)).send({ command: 'pwd' }).expect(200);
    await studentSession.auth(api().post(`/api/labs/sessions/${sessionId}/exec`)).send({ command: 'ls -la' }).expect(200);

    const submitted = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'Completed both steps.')
      .expect(201);
    expect(submitted.body.submission.status).toBe('submitted');
    expect(submitted.body.submission.student_note).toBe('Completed both steps.');

    const duplicate = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'Again')
      .expect(400);
    expect(duplicate.body.error.message).toContain('already been submitted');
  });

  it('runs submit -> instructor review -> resubmit -> approve -> admin record', async () => {
    const {
      adminSession,
      instructorSession,
      otherInstructorSession,
      studentSession,
      otherStudentSession,
      lab,
      server,
    } = await setupFixture({ withServer: true });

    const sessionId = await completeSession(studentSession, lab.id);

    // Evidence attachment: a PDF is accepted.
    const submitted = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'Screenshot and listing included.')
      .attach('file', Buffer.from('%PDF-1.4 test report'), {
        filename: 'evidence.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const submission = submitted.body.submission;
    expect(submission.status).toBe('submitted');
    expect(submission.has_attachment).toBe(true);
    expect(submission.attachment_name).toBe('evidence.pdf');
    expect(submission.instructor_id).toBeTruthy();
    expect(submission.evidence.steps).toHaveLength(2);
    expect(submission.evidence.steps.every((step) => step.completed)).toBe(true);
    expect(submission.evidence.progress.all_required_completed).toBe(true);
    expect(submission.evidence.lab_server.name).toBe(server.name);

    // The session overview exposes the submission to the student.
    const overview = await studentSession.auth(api().get(`/api/labs/sessions/${sessionId}`)).expect(200);
    expect(overview.body.submission.id).toBe(submission.id);

    // The instructor is notified and sees it in their queue.
    const notifications = await instructorSession.auth(api().get('/api/notifications')).expect(200);
    expect(
      notifications.body.notifications.some((item) => item.link === '/instructor/lab-submissions')
    ).toBe(true);

    const queue = await instructorSession.auth(api().get('/api/lab-submissions?status=submitted')).expect(200);
    expect(queue.body.submissions.some((item) => String(item.id) === String(submission.id))).toBe(true);
    const stats = await instructorSession.auth(api().get('/api/lab-submissions/stats')).expect(200);
    expect(stats.body.stats.pending).toBe(1);

    // Isolation: another instructor and another student cannot read it.
    await otherInstructorSession.auth(api().get(`/api/lab-submissions/${submission.id}`)).expect(403);
    await otherStudentSession.auth(api().get(`/api/lab-submissions/${submission.id}`)).expect(403);
    await otherInstructorSession.auth(api().get('/api/lab-submissions')).expect(200);
    const otherQueue = await otherInstructorSession.auth(api().get('/api/lab-submissions')).expect(200);
    expect(otherQueue.body.submissions).toHaveLength(0);

    // Only the owning instructor may review.
    await otherInstructorSession
      .auth(api().post(`/api/lab-submissions/${submission.id}/review`))
      .send({ status: 'approved', feedback: 'Looks good' })
      .expect(403);

    // Requesting changes requires feedback.
    await instructorSession
      .auth(api().post(`/api/lab-submissions/${submission.id}/review`))
      .send({ status: 'changes_requested', feedback: '' })
      .expect(400);

    const changes = await instructorSession
      .auth(api().post(`/api/lab-submissions/${submission.id}/review`))
      .send({ status: 'changes_requested', feedback: 'Please include the full listing output.' })
      .expect(200);
    expect(changes.body.submission.status).toBe('changes_requested');
    expect(changes.body.submission.instructor_feedback).toContain('full listing');

    const studentView = await studentSession.auth(api().get(`/api/lab-submissions/${submission.id}`)).expect(200);
    expect(studentView.body.can_review).toBe(false);
    expect(studentView.body.submission.instructor_feedback).toContain('full listing');

    // Resubmission reopens the same submission and re-notifies the instructor.
    const resubmitted = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'Added the full listing.')
      .expect(201);
    expect(resubmitted.body.submission.status).toBe('submitted');
    expect(resubmitted.body.submission.id).toBe(submission.id);
    expect(resubmitted.body.submission.instructor_feedback).toBe('');

    const approved = await instructorSession
      .auth(api().post(`/api/lab-submissions/${submission.id}/review`))
      .send({ status: 'approved', feedback: 'Excellent work.' })
      .expect(200);
    expect(approved.body.submission.status).toBe('approved');

    await instructorSession
      .auth(api().post(`/api/lab-submissions/${submission.id}/review`))
      .send({ status: 'approved', feedback: 'Again' })
      .expect(409);

    // Attachments are downloadable by the student, owning instructor and admin,
    // but not by unrelated users.
    await studentSession.auth(api().get(`/api/lab-submissions/${submission.id}/attachment`)).expect(200);
    await instructorSession.auth(api().get(`/api/lab-submissions/${submission.id}/attachment`)).expect(200);
    await adminSession.auth(api().get(`/api/lab-submissions/${submission.id}/attachment`)).expect(200);
    await otherStudentSession.auth(api().get(`/api/lab-submissions/${submission.id}/attachment`)).expect(403);

    // Admin record + acknowledgement.
    const record = await adminSession.auth(api().get('/api/admin/lab-submissions')).expect(200);
    const recorded = record.body.submissions.find((item) => String(item.id) === String(submission.id));
    expect(recorded).toBeTruthy();
    expect(recorded.instructor_name).toBeTruthy();
    expect(record.body.stats.approved).toBe(1);
    expect(recorded.admin_acknowledged).toBe(false);

    await instructorSession
      .auth(api().post(`/api/admin/lab-submissions/${submission.id}/acknowledge`))
      .expect(403);

    const acknowledged = await adminSession
      .auth(api().post(`/api/admin/lab-submissions/${submission.id}/acknowledge`))
      .expect(200);
    expect(acknowledged.body.submission.admin_acknowledged).toBe(true);
    expect(acknowledged.body.submission.admin_acknowledged_at).toBeTruthy();

    const finalRecord = await adminSession.auth(api().get('/api/admin/lab-submissions')).expect(200);
    expect(finalRecord.body.stats.acknowledged).toBe(1);
  });

  it('routes a standalone lab submission to the instructor who created it', async () => {
    const { instructorSession, studentSession } = await setupFixture();

    const labRes = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'Standalone Practice Lab', status: 'published', summary: 'No course attached' })
      .expect(201);
    const lab = labRes.body.lab;
    await instructorSession
      .auth(api().post(`/api/labs/${lab.id}/steps`))
      .send({ title: 'Show directory', instruction: 'Run pwd', verification: 'command', expectedCommand: 'pwd' })
      .expect(201);

    const sessionId = await completeSession(studentSession, lab.id);
    const submitted = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'Standalone lab done')
      .expect(201);

    expect(String(submitted.body.submission.instructor_id)).toBe(String(instructorSession.user.id));

    const queue = await instructorSession.auth(api().get('/api/lab-submissions')).expect(200);
    expect(queue.body.submissions.some((item) => String(item.id) === String(submitted.body.submission.id))).toBe(true);
  });

  it('rejects unsupported attachment types and oversized notes', async () => {
    const { studentSession, lab } = await setupFixture();
    const sessionId = await completeSession(studentSession, lab.id);

    const badFile = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .attach('file', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' })
      .expect(400);
    expect(badFile.body.error.message).toContain('PDF');

    const longNote = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'x'.repeat(4001))
      .expect(400);
    expect(longNote.body.error.message).toContain('note');
  });
});
