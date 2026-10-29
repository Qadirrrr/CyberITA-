import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs } from './helpers.js';
import { generateLab } from '../src/services/labGenerator.js';
import { PracticeShell } from '../src/labs/practice/practiceShell.js';
import { defaultFs, mergeInitialFiles } from '../src/labs/practice/virtualFs.js';

/**
 * Practice labs are container-less: they never provision Docker and their
 * terminal is the in-process PracticeShell. These tests pin that contract so
 * a practice warm-up can never consume a lab host or fail when Docker is down.
 */

async function publishPracticeLab(instructor, payload = {}) {
  const res = await instructor
    .auth(api().post('/api/labs/generate'))
    .send({
      title: 'Linux practice terminal',
      details: 'Warm up on the commands every analyst uses: identity, filesystem and system health',
      difficulty: 'beginner',
      stepCount: 12,
      isPractice: true,
      status: 'published',
      ...payload,
    })
    .expect(201);
  return res.body.lab;
}

function commandFromInstruction(instruction = '') {
  const match = String(instruction).match(/```bash\n([\s\S]*?)```/);
  return match ? match[1].trim() : '';
}

describe('Container-less practice labs', () => {
  it('starts a practice terminal without Docker and persists its shell state', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const lab = await publishPracticeLab(instructorSession);

    const student = await createUser({ fullName: 'Practice Student' });
    const studentSession = await loginAs(student);

    const status = await studentSession.auth(api().get('/api/labs/status')).expect(200);
    expect(status.body.practice).toMatchObject({ provider: 'practice', available: true });

    const started = await studentSession
      .auth(api().post(`/api/labs/${lab.id}/sessions`))
      .expect(201);

    expect(started.body.session.provider).toBe('practice');
    expect(started.body.session.containerless).toBe(true);
    expect(started.body.session.instance_id).toMatch(/^practice-[a-f0-9]{12}$/);
    expect(started.body.session.expires_at).toBeNull();
    expect(started.body.session.lab_server_id).toBeNull();

    const sessionId = started.body.session.id;

    const made = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'mkdir -p ~/work && cd ~/work' })
      .expect(200);
    expect(made.body.exitCode).toBe(0);
    expect(made.body.cwd).toBe('/home/student/work');

    await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'echo "practice state" > note.txt' })
      .expect(200);

    const read = await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'cat note.txt' })
      .expect(200);
    expect(read.body.output).toContain('practice state');

    const reloaded = await studentSession.auth(api().get(`/api/labs/sessions/${sessionId}`)).expect(200);
    expect(reloaded.body.session.cwd).toBe('/home/student/work');
    expect(reloaded.body.session.containerless).toBe(true);
    expect(reloaded.body.session.history.length).toBeGreaterThanOrEqual(6);

    // Asking to start again reuses the running practice terminal.
    const reused = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(200);
    expect(reused.body.reused).toBe(true);
    expect(reused.body.session.id).toBe(sessionId);

    // Stopping ends the in-process terminal; the next start is a clean sandbox.
    await studentSession.auth(api().post(`/api/labs/sessions/${sessionId}/stop`)).expect(200);
    const restarted = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    expect(restarted.body.session.id).not.toBe(sessionId);
    expect(restarted.body.session.cwd).toBe('/home/student');

    const missing = await studentSession
      .auth(api().post(`/api/labs/sessions/${restarted.body.session.id}/exec`))
      .send({ command: 'cat note.txt' })
      .expect(200);
    expect(missing.body.exitCode).not.toBe(0);
    expect(missing.body.output).toContain('No such file or directory');
  });

  it('ignores assigned lab servers and Docker availability for practice labs', async () => {
    const admin = await createUser({ role: 'admin' });
    const adminSession = await loginAs(admin);
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const lab = await publishPracticeLab(instructorSession);

    const server = await adminSession
      .auth(api().post('/api/admin/lab-servers'))
      .send({ name: `Disabled practice host ${Date.now()}`, status: 'disabled' })
      .expect(201);

    await adminSession
      .auth(api().put(`/api/admin/labs/${lab.id}/server`))
      .send({ labServerId: server.body.server.id })
      .expect(200);

    const student = await createUser();
    const studentSession = await loginAs(student);

    // A real lab on this host would be refused (server disabled); practice labs
    // are container-less, so they must still start and record no lab server.
    const started = await studentSession
      .auth(api().post(`/api/labs/${lab.id}/sessions`))
      .expect(201);
    expect(started.body.session.provider).toBe('practice');
    expect(started.body.session.lab_server_id).toBeNull();
  });

  it('lets the in-browser shell execute every generated practice step', async () => {
    const cases = [
      ['Linux command line practice', 'filesystem, shell basics, users, kernel and disk health'],
      ['Log analysis lab', 'read access logs with grep awk sort uniq and find attacks'],
      ['File integrity and hashing', 'sha256 md5 base64 checksum evidence integrity'],
      ['Container isolation', 'docker container cgroup namespace mounts'],
    ];

    for (const [title, details] of cases) {
      const lab = generateLab({ title, details, stepCount: 12 });
      expect(lab.steps.length).toBeGreaterThan(0);

      const root = defaultFs();
      mergeInitialFiles(root, lab.initialFiles || {}, '/home/student');
      const shell = new PracticeShell({
        fsState: root,
        cwd: '/home/student',
        hostname: 'cyberita-lab',
        user: 'student',
      });

      for (const step of lab.steps) {
        const command = step.expectedCommand || commandFromInstruction(step.instruction);
        expect(command, `${title}: step "${step.title}" has a runnable command`).toBeTruthy();

        const result = shell.execute(command);
        expect(result.exitCode, `${title} → ${command}`).toBe(0);

        if (step.verification === 'output' && step.expectedOutputPattern) {
          expect(
            new RegExp(step.expectedOutputPattern, 'i').test(result.output),
            `${title} → "${command}" output did not match ${step.expectedOutputPattern}:\n${result.output}`
          ).toBe(true);
        }
      }
    }

    // Practice copy must never claim that a real container is used.
    const practiceLab = generateLab({
      title: 'Linux practice warm-up',
      details: 'filesystem, users and kernel basics',
      isPractice: true,
      stepCount: 4,
    });
    expect(practiceLab.terminalWelcome).toMatch(/practice shell/i);
    expect(practiceLab.terminalWelcome).not.toMatch(/real Linux container/i);
    expect(practiceLab.description).not.toMatch(/real, disposable Linux container/i);
    expect(practiceLab.summary).not.toContain('filesystem, users and kernel basics');
  });

  it('completes a generated practice lab through the session API', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const lab = await publishPracticeLab(instructorSession, { stepCount: 4 });

    // Staff view exposes expected commands so we can drive the exact solutions.
    const detail = await instructorSession.auth(api().get(`/api/labs/${lab.id}`)).expect(200);
    const steps = detail.body.steps.filter((step) => !step.is_optional);
    expect(steps.length).toBeGreaterThanOrEqual(4);

    const student = await createUser();
    const studentSession = await loginAs(student);
    const started = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    const sessionId = started.body.session.id;
    expect(started.body.session.provider).toBe('practice');

    for (const step of steps) {
      const command = step.expected_command || commandFromInstruction(step.instruction);
      const result = await studentSession
        .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
        .send({ command })
        .expect(200);

      expect(result.body.exitCode, `${step.title} → ${command}`).toBe(0);
      expect(result.body.completedSteps.map((item) => item.id)).toContain(step.id);
    }

    const overview = await studentSession.auth(api().get(`/api/labs/sessions/${sessionId}`)).expect(200);
    expect(overview.body.progress.allRequiredCompleted).toBe(true);
    expect(overview.body.progress.percent).toBe(100);
    expect(overview.body.session.containerless).toBe(true);
  });
});
