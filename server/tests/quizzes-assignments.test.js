import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, enroll } from './helpers.js';

async function setupQuiz() {
  const instructor = await createUser({ role: 'instructor' });
  const instructorSession = await loginAs(instructor);
  const student = await createUser({ fullName: 'Quiz Student' });
  const studentSession = await loginAs(student);
  const course = await createCourseFor(instructorSession.token, { title: 'Quiz Course' });
  await enroll(studentSession.token, course.id);

  const quizRes = await instructorSession
    .auth(api().post(`/api/quizzes/courses/${course.id}`))
    .send({
      title: 'Linux Check',
      description: 'Quick check',
      passScore: 75,
      questions: [
        { question: 'Which command prints the working directory?', options: ['pwd', 'ls', 'cd', 'id'], correctOption: 0, explanation: 'pwd prints it.', points: 2 },
        { question: 'Is /etc for configuration?', type: 'true_false', options: ['True', 'False'], correctOption: 0, points: 1 },
        { question: 'Which is a private IP?', options: ['8.8.8.8', '192.168.1.5', '1.1.1.1'], correctOption: 1, points: 1 },
      ],
    })
    .expect(201);

  const quizId = quizRes.body.quiz.id;
  const studentView = await studentSession.auth(api().get(`/api/quizzes/${quizId}`)).expect(200);
  return { instructorSession, studentSession, course, quizId, studentView };
}

describe('Quizzes', () => {
  it('never leaks correct answers to students', async () => {
    const { studentView } = await setupQuiz();
    expect(studentView.body.questions).toHaveLength(3);
    expect(JSON.stringify(studentView.body.questions)).not.toContain('correctOption');
    expect(JSON.stringify(studentView.body.questions)).not.toContain('correct_option');
    expect(studentView.body.quiz.passScore).toBe(75);
  });

  it('grades attempts server-side and returns explanations', async () => {
    const { studentSession, quizId, studentView } = await setupQuiz();
    const questions = studentView.body.questions;

    const perfect = await studentSession
      .auth(api().post(`/api/quizzes/${quizId}/attempts`))
      .send({
        answers: [
          { questionId: questions[0].id, option: 0 },
          { questionId: questions[1].id, option: 0 },
          { questionId: questions[2].id, option: 1 },
        ],
      })
      .expect(201);
    expect(perfect.body.passed).toBe(true);
    expect(perfect.body.score).toBe(4);
    expect(perfect.body.maxPoints).toBe(4);
    expect(perfect.body.percent).toBe(100);
    expect(perfect.body.detail.every((d) => d.correct)).toBe(true);

    const failed = await studentSession
      .auth(api().post(`/api/quizzes/${quizId}/attempts`))
      .send({
        answers: [
          { questionId: questions[0].id, option: 3 },
          { questionId: questions[1].id, option: 1 },
          { questionId: questions[2].id, option: 2 },
        ],
      })
      .expect(201);
    expect(failed.body.passed).toBe(false);
    expect(failed.body.score).toBe(0);
    expect(failed.body.detail[0].correctOption).toBe(0);
    expect(failed.body.detail[0].explanation).toBeTruthy();

    const attempts = await studentSession.auth(api().get(`/api/quizzes/${quizId}/attempts`)).expect(200);
    expect(attempts.body.attempts).toHaveLength(2);
  });

  it('validates quiz authoring and ownership', async () => {
    const { instructorSession, quizId } = await setupQuiz();
    const otherInstructor = await createUser({ role: 'instructor' });
    const otherSession = await loginAs(otherInstructor);
    const student = await createUser();
    const studentSession = await loginAs(student);

    await otherSession.auth(api().put(`/api/quizzes/${quizId}`)).send({ title: 'Hijack' }).expect(403);
    await studentSession.auth(api().put(`/api/quizzes/${quizId}`)).send({ title: 'Hijack' }).expect(403);

    const updated = await instructorSession
      .auth(api().put(`/api/quizzes/${quizId}`))
      .send({ title: 'Linux Check v2', passScore: 80 })
      .expect(200);
    expect(updated.body.quiz.title).toBe('Linux Check v2');

    await instructorSession.auth(api().delete(`/api/quizzes/${quizId}`)).expect(200);
  });

  it('lists quizzes for enrolled students', async () => {
    const { studentSession, course, instructorSession, quizId } = await setupQuiz();
    const list = await studentSession.auth(api().get(`/api/quizzes/courses/${course.id}`)).expect(200);
    expect(list.body.quizzes).toHaveLength(1);
    expect(list.body.quizzes[0].question_count).toBe(3);
    expect(list.body.quizzes[0].has_passed).toBe(false);

    const outsider = await createUser();
    const outsiderSession = await loginAs(outsider);
    await outsiderSession.auth(api().get(`/api/quizzes/courses/${course.id}`)).expect(400);
    expect(quizId).toBeTruthy();
    expect(instructorSession).toBeTruthy();
  });

  it('automatically generates MCQs and Subjective questions based on title and counts', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const course = await createCourseFor(instructorSession.token, { title: 'Network Security Course' });

    // 1. Generate preview without autoSave
    const preview = await instructorSession
      .auth(api().post('/api/quizzes/generate'))
      .send({
        title: 'SQL Injection and XSS Remediation',
        mcqCount: 4,
        subjectiveCount: 2,
        difficulty: 'intermediate',
        courseId: course.id,
      })
      .expect(200);

    expect(preview.body.saved).toBe(false);
    expect(preview.body.quiz.title).toBe('SQL Injection and XSS Remediation');
    expect(preview.body.quiz.questions).toHaveLength(6);
    expect(preview.body.quiz.counts.mcq).toBe(4);
    expect(preview.body.quiz.counts.subjective).toBe(2);

    // Verify questions have valid options and explanations
    for (const q of preview.body.quiz.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(typeof q.correctOption).toBe('number');
      expect(q.explanation).toBeTruthy();
    }

    // 2. Auto-generate and directly publish with autoSave: true
    const published = await instructorSession
      .auth(api().post('/api/quizzes/generate'))
      .send({
        title: 'Container & Docker Security',
        mcqCount: 3,
        subjectiveCount: 1,
        difficulty: 'advanced',
        courseId: course.id,
        autoSave: true,
      })
      .expect(201);

    expect(published.body.saved).toBe(true);
    expect(published.body.quiz.id).toBeTruthy();
    expect(published.body.quiz.title).toBe('Container & Docker Security');

    // 3. Ensure student cannot call the generate endpoint
    const student = await createUser({ role: 'student' });
    const studentSession = await loginAs(student);
    await studentSession
      .auth(api().post('/api/quizzes/generate'))
      .send({ title: 'Hacking Quiz', mcqCount: 2, subjectiveCount: 1 })
      .expect(403);
  });
});

describe('Assignments', () => {
  it('supports submission, grading and feedback notifications', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const student = await createUser({ fullName: 'Assignment Student' });
    const studentSession = await loginAs(student);
    const course = await createCourseFor(instructorSession.token, { title: 'Assignment Course' });
    await enroll(studentSession.token, course.id);

    const assignmentRes = await instructorSession
      .auth(api().post(`/api/assignments/courses/${course.id}`))
      .send({ title: 'Write a case study', description: 'Describe your troubleshooting process.', points: 50 })
      .expect(201);
    const assignmentId = assignmentRes.body.assignment.id;

    const list = await studentSession.auth(api().get(`/api/assignments/courses/${course.id}`)).expect(200);
    expect(list.body.assignments).toHaveLength(1);
    expect(list.body.assignments[0].submission_id).toBeNull();

    await studentSession.auth(api().post(`/api/assignments/${assignmentId}/submit`)).send({ content: '' }).expect(400);

    const submitted = await studentSession
      .auth(api().post(`/api/assignments/${assignmentId}/submit`))
      .send({ content: 'I checked processes, ports, logs and disk usage.' })
      .expect(201);
    expect(submitted.body.submission.status).toBe('submitted');

    const submissions = await instructorSession.auth(api().get(`/api/assignments/${assignmentId}/submissions`)).expect(200);
    expect(submissions.body.submissions).toHaveLength(1);
    const submissionId = submissions.body.submissions[0].id;

    await instructorSession
      .auth(api().post(`/api/assignments/submissions/${submissionId}/grade`))
      .send({ grade: 99, feedback: 'Too high' })
      .expect(400);

    const graded = await instructorSession
      .auth(api().post(`/api/assignments/submissions/${submissionId}/grade`))
      .send({ grade: 45, feedback: 'Good structure, add more evidence.' })
      .expect(200);
    expect(Number(graded.body.submission.grade)).toBe(45);
    expect(graded.body.submission.status).toBe('graded');

    const studentDetail = await studentSession.auth(api().get(`/api/assignments/${assignmentId}`)).expect(200);
    expect(Number(studentDetail.body.submission.grade)).toBe(45);
    expect(studentDetail.body.submission.feedback).toContain('evidence');

    const notifications = await studentSession.auth(api().get('/api/notifications')).expect(200);
    expect(notifications.body.notifications.some((n) => n.type === 'grade')).toBe(true);

    // Resubmission resets the grade
    const resubmit = await studentSession
      .auth(api().post(`/api/assignments/${assignmentId}/submit`))
      .send({ content: 'Revised submission with evidence.' })
      .expect(201);
    expect(resubmit.body.submission.grade).toBeNull();
  });

  it('blocks submissions from students who are not enrolled', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const course = await createCourseFor(instructorSession.token);
    const assignment = await instructorSession
      .auth(api().post(`/api/assignments/courses/${course.id}`))
      .send({ title: 'Locked assignment', description: 'x' })
      .expect(201);

    const outsider = await createUser();
    const outsiderSession = await loginAs(outsider);
    await outsiderSession
      .auth(api().post(`/api/assignments/${assignment.body.assignment.id}/submit`))
      .send({ content: 'Trying anyway' })
      .expect(400);
  });
});
