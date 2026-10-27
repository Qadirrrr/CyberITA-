import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, enroll } from './helpers.js';
import { query } from '../src/config/db.js';

async function setupPracticeFixture() {
  const instructor = await createUser({ role: 'instructor', fullName: 'Practice Instructor' });
  const instructorSession = await loginAs(instructor);
  const student = await createUser({ fullName: 'Practice Student' });
  const studentSession = await loginAs(student);

  const course = await createCourseFor(instructorSession.token, { title: 'Practice Course' });
  await enroll(studentSession.token, course.id);

  const labRes = await instructorSession
    .auth(api().post('/api/labs'))
    .send({
      title: 'Practice Terminal Lab',
      courseId: course.id,
      summary: 'Try commands before the real lab',
      status: 'published',
    })
    .expect(201);
  const lab = labRes.body.lab;

  const step1 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({
      title: 'Show working directory',
      instruction: 'Run pwd.',
      verification: 'command',
      expectedCommand: 'pwd',
      practiceCommand: 'pwd',
      practiceOutput: '/home/student',
      practiceExplanation: 'pwd prints the current working directory.',
    })
    .expect(201);

  const step2 = await instructorSession
    .auth(api().post(`/api/labs/${lab.id}/steps`))
    .send({
      title: 'List files',
      instruction: 'List the home directory.',
      verification: 'command',
      expectedCommand: 'ls',
      practiceCommand: 'ls',
      practiceOutput: 'welcome.txt',
      practiceExplanation: 'ls lists directory entries.',
    })
    .expect(201);

  return { instructorSession, student, studentSession, course, lab, steps: [step1.body.step, step2.body.step] };
}

describe('Practice lab mode', () => {
  it('returns simulated practice content without leaking real verification answers', async () => {
    const { studentSession, lab, steps } = await setupPracticeFixture();

    const res = await studentSession.auth(api().get(`/api/labs/${lab.id}/practice`)).expect(200);
    expect(res.body.simulated).toBe(true);
    expect(res.body.notice).toMatch(/never run on a real server/i);
    expect(res.body.lab.title).toBe('Practice Terminal Lab');
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.steps[0].practice_command).toBe('pwd');
    expect(res.body.steps[0].practice_output).toBe('/home/student');
    expect(res.body.steps[0].expected_command).toBeUndefined();
    expect(res.body.steps[0].completed).toBe(false);
    expect(res.body.steps.map((step) => step.id)).toEqual(steps.map((step) => step.id));
    expect(res.body.progress.percent).toBe(0);
  });

  it('executes simulated commands, completes steps, persists state and resets', async () => {
    const { studentSession, student, lab, steps } = await setupPracticeFixture();

    const pwd = await studentSession
      .auth(api().post(`/api/labs/${lab.id}/practice/exec`))
      .send({ command: 'pwd' })
      .expect(200);
    expect(pwd.body.simulated).toBe(true);
    expect(pwd.body.output).toBe('/home/student');
    expect(pwd.body.exitCode).toBe(0);
    expect(pwd.body.completedSteps.map((step) => step.id)).toEqual([steps[0].id]);
    expect(pwd.body.progress.completedRequired).toBe(1);

    const ls = await studentSession
      .auth(api().post(`/api/labs/${lab.id}/practice/exec`))
      .send({ command: 'ls' })
      .expect(200);
    expect(ls.body.output).toContain('welcome.txt');

    // Practice state survives a page reload.
    const resumed = await studentSession.auth(api().get(`/api/labs/${lab.id}/practice`)).expect(200);
    expect(resumed.body.progress.percent).toBe(100);
    expect(resumed.body.session.history.length).toBeGreaterThan(0);

    // Practice never provisions a real lab session or requires screenshots.
    const sessions = await query('SELECT COUNT(*)::int AS n FROM lab_sessions WHERE user_id = $1 AND lab_id = $2', [student.id, lab.id]);
    expect(sessions.rows[0].n).toBe(0);

    // Repeat steps and mark them individually.
    const repeat = await studentSession
      .auth(api().post(`/api/labs/${lab.id}/practice/exec`))
      .send({ command: 'pwd' })
      .expect(200);
    expect(repeat.body.output).toBe('/home/student');

    const marked = await studentSession
      .auth(api().post(`/api/labs/${lab.id}/practice/steps/${steps[1].id}/complete`))
      .expect(200);
    expect(marked.body.steps.find((step) => step.id === steps[1].id).completed).toBe(true);

    const reset = await studentSession.auth(api().post(`/api/labs/${lab.id}/practice/reset`)).expect(200);
    expect(reset.body.progress.percent).toBe(0);
    expect(reset.body.session.history).toEqual([]);
    expect(reset.body.steps.every((step) => step.completed === false)).toBe(true);
  });

  it('requires course enrollment and validates simulated commands', async () => {
    const { instructorSession, lab } = await setupPracticeFixture();
    const outsider = await createUser({ fullName: 'Not Enrolled' });
    const outsiderSession = await loginAs(outsider);

    const denied = await outsiderSession.auth(api().get(`/api/labs/${lab.id}/practice`)).expect(400);
    expect(denied.body.error.message).toMatch(/Enroll/i);

    await instructorSession
      .auth(api().post(`/api/labs/${lab.id}/practice/exec`))
      .send({ command: '   ' })
      .expect(400);

    await instructorSession
      .auth(api().post(`/api/labs/${lab.id}/practice/exec`))
      .send({ command: 'x'.repeat(4001) })
      .expect(400);

    const unknown = await instructorSession
      .auth(api().post(`/api/labs/${lab.id}/practice/exec`))
      .send({ command: 'definitelynotacommand' })
      .expect(200);
    expect(unknown.body.exitCode).toBe(127);
    expect(unknown.body.output).toContain('command not found');
  });
});
