import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor } from './helpers.js';
import { generateLab, LAB_BLUEPRINT_KEYS } from '../src/services/labGenerator.js';
import { generateAssignment } from '../src/services/assignmentGenerator.js';
import { generateQuiz } from '../src/services/quizGenerator.js';

describe('Content generators', () => {
  it('builds real, verifiable lab steps for every blueprint', () => {
    for (const key of LAB_BLUEPRINT_KEYS) {
      const lab = generateLab({ title: key.replace(/_/g, ' '), stepCount: 5 });
      expect(lab.steps.length).toBeGreaterThanOrEqual(3);
      expect(lab.steps.length).toBeLessThanOrEqual(5);
      expect(lab.description).toContain('## Scenario');
      expect(lab.objectives.length).toBeGreaterThan(0);
      expect(lab.initialCwd).toBe('/home/student');
      for (const step of lab.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.instruction).toContain('```bash');
        expect(['command', 'output', 'manual']).toContain(step.verification);
        expect(step.points).toBeGreaterThan(0);
        if (step.verification === 'command') expect(step.expectedCommand).toBeTruthy();
        else expect(step.expectedOutputPattern).toBeTruthy();
      }
    }
  });

  it('selects the log-analysis blueprint and ships a real fixture file', () => {
    const lab = generateLab({
      title: 'Investigate a brute-force login campaign',
      details: 'Analyse the nginx access log and identify SQL injection probes',
      stepCount: 8,
    });
    expect(lab.domain).toBe('log_analysis');
    expect(Object.keys(lab.initialFiles)).toContain('practice/access.log');
    expect(lab.initialFiles['practice/access.log']).toContain('sqlmap');
    expect(lab.steps.some((step) => /sqlmap/i.test(step.instruction))).toBe(true);
  });

  it('marks practice labs as ungraded and skips submission requirements', () => {
    const lab = generateLab({ title: 'Linux practice sandbox', isPractice: true, stepCount: 4 });
    expect(lab.isPractice).toBe(true);
    expect(lab.submissionRequirements).toBe('');
    expect(lab.description).toContain('Practice mode');
  });

  it('writes a complete assignment brief with rubric and evidence requirements', () => {
    const assignment = generateAssignment({
      title: 'Audit a Linux server',
      details: 'permissions and processes',
      difficulty: 'advanced',
      points: 80,
      dueInDays: 3,
    });
    expect(assignment.domain).toBe('linux');
    expect(assignment.points).toBe(80);
    expect(assignment.description).toContain('## Scenario');
    expect(assignment.description).toContain('## Tasks');
    expect(assignment.description).toContain('## Deliverables');
    expect(assignment.description).toContain('## Grading rubric');
    expect(assignment.description).toContain('advanced brief');
    const due = new Date(assignment.dueAt).getTime();
    expect(due).toBeGreaterThan(Date.now() + 2 * 24 * 60 * 60 * 1000);
  });

  it('uses the quiz details field to scope generated questions', () => {
    const quiz = generateQuiz({
      title: 'Linux permissions checkpoint',
      details: 'Focus on chmod, chown and least privilege',
      mcqCount: 3,
      subjectiveCount: 1,
      difficulty: 'beginner',
    });
    expect(quiz.questions).toHaveLength(4);
    expect(quiz.description).toContain('chmod');
    expect(quiz.counts.mcq).toBe(3);
    expect(quiz.counts.subjective).toBe(1);
  });
});

describe('Auto-generated content endpoints', () => {
  it('generates and saves a lab with verified steps for a course', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token, { title: 'Generated Lab Course' });

    const res = await session
      .auth(api().post('/api/labs/generate'))
      .send({
        title: 'Analyse a web access log',
        details: 'Find brute-force attempts and SQL injection probes in an nginx log',
        difficulty: 'intermediate',
        stepCount: 6,
        courseId: course.id,
        status: 'published',
      })
      .expect(201);

    expect(res.body.saved).toBe(true);
    expect(res.body.lab.course_id).toBe(course.id);
    expect(res.body.lab.is_practice).toBe(false);
    expect(res.body.steps).toHaveLength(6);
    expect(res.body.generated.domain).toBe('log_analysis');

    const manage = await session.auth(api().get(`/api/labs/${res.body.lab.id}/manage`)).expect(200);
    expect(manage.body.steps).toHaveLength(6);
    expect(manage.body.lab.initial_files).toHaveProperty('practice/access.log');

    await session.auth(api().delete(`/api/labs/${res.body.lab.id}`)).expect(200);
  });

  it('generates a quiz and an assignment from a title and details', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token, { title: 'Generated Assessment Course' });

    const quiz = await session
      .auth(api().post('/api/quizzes/generate'))
      .send({
        title: 'Network defence checkpoint',
        details: 'Firewall rules, port scanning and segmentation',
        mcqCount: 3,
        subjectiveCount: 1,
        difficulty: 'intermediate',
        courseId: course.id,
        autoSave: true,
      })
      .expect(201);
    expect(quiz.body.saved).toBe(true);
    expect(quiz.body.generated.questions).toHaveLength(4);

    const assignment = await session
      .auth(api().post('/api/assignments/generate'))
      .send({
        title: 'Map an undocumented host',
        details: 'Enumerate interfaces and listening services',
        courseId: course.id,
        difficulty: 'advanced',
        points: 70,
        dueInDays: 5,
      })
      .expect(201);
    expect(assignment.body.saved).toBe(true);
    expect(assignment.body.assignment.course_id).toBe(course.id);
    expect(assignment.body.assignment.points).toBe(70);
    expect(assignment.body.assignment.description).toContain('## Grading rubric');
  });

  it('creates a lab, quiz and assignment in one Content Studio call', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token, { title: 'Studio Pack Course' });

    const res = await session
      .auth(api().post('/api/content/generate'))
      .send({
        title: 'Linux permission hardening',
        details: 'Practice chmod, chown and least privilege on a real host',
        courseId: course.id,
        difficulty: 'beginner',
        publish: true,
        includeLab: true,
        labStepCount: 5,
        includeQuiz: true,
        quizMcqCount: 2,
        quizSubjectiveCount: 1,
        includeAssignment: true,
        assignmentPoints: 50,
        dueInDays: 4,
      })
      .expect(201);

    expect(res.body.lab.id).toBeTruthy();
    expect(res.body.quiz.id).toBeTruthy();
    expect(res.body.assignment.id).toBeTruthy();
    expect(res.body.lab.status).toBe('published');

    const quiz = await session.auth(api().get(`/api/quizzes/${res.body.quiz.id}`)).expect(200);
    expect(quiz.body.questions).toHaveLength(3);

    const assignment = await session.auth(api().get(`/api/assignments/${res.body.assignment.id}`)).expect(200);
    expect(assignment.body.assignment.is_published).toBe(true);
  });

  it('requires at least one artefact and a course for quizzes/assignments', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);

    await session
      .auth(api().post('/api/content/generate'))
      .send({
        title: 'Nothing selected',
        includeLab: false,
        includeQuiz: false,
        includeAssignment: false,
      })
      .expect(400);

    const noCourse = await session
      .auth(api().post('/api/content/generate'))
      .send({
        title: 'Quiz without course',
        includeLab: false,
        includeQuiz: true,
        includeAssignment: false,
      })
      .expect(400);
    expect(noCourse.body.error.details?.some((detail) => detail.path === 'courseId')).toBe(true);

    // A practice lab does not waive the course requirement for graded items.
    await session
      .auth(api().post('/api/content/generate'))
      .send({
        title: 'Practice lab plus quiz',
        includeLab: true,
        labPractice: true,
        includeQuiz: true,
        includeAssignment: false,
      })
      .expect(400);
  });

  it('lets any learner start a practice lab without enrollment and blocks grading artefacts', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const course = await createCourseFor(instructorSession.token, { title: 'Practice Lab Course' });

    const generated = await instructorSession
      .auth(api().post('/api/labs/generate'))
      .send({
        title: 'Linux practice sandbox',
        details: 'Warm up on the commands every analyst uses',
        difficulty: 'beginner',
        stepCount: 4,
        isPractice: true,
        courseId: course.id,
        status: 'published',
      })
      .expect(201);

    expect(generated.body.lab.is_practice).toBe(true);
    expect(generated.body.lab.course_id).toBeNull();

    const student = await createUser();
    const studentSession = await loginAs(student);

    const catalog = await studentSession.auth(api().get('/api/labs')).expect(200);
    const entry = catalog.body.labs.find((lab) => lab.id === generated.body.lab.id);
    expect(entry.is_practice).toBe(true);

    const detail = await studentSession.auth(api().get(`/api/labs/${generated.body.lab.id}`)).expect(200);
    expect(detail.body.lab.is_practice).toBe(true);

    const started = await studentSession.auth(api().post(`/api/labs/${generated.body.lab.id}/sessions`)).expect(201);
    expect(started.body.session.status).toBe('running');
    expect(started.body.lab.is_practice).toBe(true);

    const sessionId = started.body.session.id;
    await studentSession.auth(api().post(`/api/reports/sessions/${sessionId}/generate`)).expect(400);
    await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/submit`))
      .field('note', 'practice evidence')
      .expect(400);

    // Practice labs can be restarted freely: stopping and starting creates a new session.
    const firstId = sessionId;
    await studentSession.auth(api().post(`/api/labs/sessions/${firstId}/stop`)).expect(200);
    const second = await studentSession.auth(api().post(`/api/labs/${generated.body.lab.id}/sessions`)).expect(201);
    expect(second.body.session.id).not.toBe(firstId);
  });

  it('keeps practice labs detached from courses when created or edited', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token, { title: 'Detached Practice Course' });

    const created = await session
      .auth(api().post('/api/labs'))
      .send({ title: 'Manual practice lab', courseId: course.id, isPractice: true, status: 'draft' })
      .expect(201);
    expect(created.body.lab.is_practice).toBe(true);
    expect(created.body.lab.course_id).toBeNull();

    const courseLab = await session
      .auth(api().post('/api/labs'))
      .send({ title: 'Course bound lab', courseId: course.id, status: 'draft' })
      .expect(201);
    expect(courseLab.body.lab.course_id).toBe(course.id);

    const updated = await session
      .auth(api().put(`/api/labs/${courseLab.body.lab.id}`))
      .send({ isPractice: true })
      .expect(200);
    expect(updated.body.lab.is_practice).toBe(true);
    expect(updated.body.lab.course_id).toBeNull();
  });

  it('keeps generated content private to the owning instructor', async () => {
    const owner = await createUser({ role: 'instructor' });
    const ownerSession = await loginAs(owner);
    const other = await createUser({ role: 'instructor' });
    const otherSession = await loginAs(other);
    const course = await createCourseFor(ownerSession.token, { title: 'Private Studio Course' });

    await otherSession
      .auth(api().post('/api/labs/generate'))
      .send({ title: 'Not my course lab', courseId: course.id, isPractice: false })
      .expect(403);

    await otherSession
      .auth(api().post('/api/content/generate'))
      .send({ title: 'Not my course pack', courseId: course.id })
      .expect(403);
  });
});
