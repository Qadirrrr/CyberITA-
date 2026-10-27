import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, enroll } from './helpers.js';

async function setupCourseWithLearner({ title = 'Instructor Course' } = {}) {
  const instructor = await createUser({ role: 'instructor', fullName: 'Instructor One' });
  const instructorSession = await loginAs(instructor);
  const student = await createUser({ fullName: 'Learner One' });
  const studentSession = await loginAs(student);
  const course = await createCourseFor(instructorSession.token, { title });
  await enroll(studentSession.token, course.id);
  return { instructor, instructorSession, student, studentSession, course };
}

async function createQuiz(instructorSession, courseId) {
  const res = await instructorSession
    .auth(api().post(`/api/quizzes/courses/${courseId}`))
    .send({
      title: 'Security Check',
      description: 'Basics',
      passScore: 50,
      questions: [
        { question: 'Which command lists files?', options: ['ls', 'cd', 'pwd'], correctOption: 0, points: 2 },
        { question: 'Root UID is 0?', type: 'true_false', options: ['True', 'False'], correctOption: 0, points: 2 },
      ],
    })
    .expect(201);
  return res.body.quiz;
}

async function createAssignment(instructorSession, courseId) {
  const res = await instructorSession
    .auth(api().post(`/api/assignments/courses/${courseId}`))
    .send({ title: 'Harden the host', description: 'Write your steps.', points: 50, isPublished: true })
    .expect(201);
  return res.body.assignment;
}

describe('Instructor workspace', () => {
  it('lists quizzes with attempt performance for the owning instructor only', async () => {
    const { instructorSession, studentSession, course } = await setupCourseWithLearner();
    const quiz = await createQuiz(instructorSession, course.id);

    const studentView = await studentSession.auth(api().get(`/api/quizzes/${quiz.id}`)).expect(200);
    await studentSession
      .auth(api().post(`/api/quizzes/${quiz.id}/attempts`))
      .send({ answers: studentView.body.questions.map((question) => ({ questionId: question.id, option: 0 })) })
      .expect(201);

    const list = await instructorSession.auth(api().get('/api/instructor/quizzes')).expect(200);
    expect(list.body.quizzes).toHaveLength(1);
    expect(list.body.quizzes[0]).toMatchObject({
      id: quiz.id,
      title: 'Security Check',
      question_count: 2,
      points_total: 4,
      attempt_count: 1,
      learner_count: 1,
      pass_count: 1,
    });

    const attempts = await instructorSession.auth(api().get(`/api/instructor/quizzes/${quiz.id}/attempts`)).expect(200);
    expect(attempts.body.attempts).toHaveLength(1);
    expect(attempts.body.attempts[0].full_name).toBe('Learner One');

    const otherInstructor = await createUser({ role: 'instructor' });
    const otherSession = await loginAs(otherInstructor);
    expect((await otherSession.auth(api().get('/api/instructor/quizzes')).expect(200)).body.quizzes).toHaveLength(0);
    await otherSession.auth(api().get(`/api/instructor/quizzes/${quiz.id}/attempts`)).expect(403);
  });

  it('lists assignments with submission and grading counts', async () => {
    const { instructorSession, studentSession, course } = await setupCourseWithLearner();
    const assignment = await createAssignment(instructorSession, course.id);

    const submission = await studentSession
      .auth(api().post(`/api/assignments/${assignment.id}/submit`))
      .send({ content: 'Applied CIS hardening.' })
      .expect(201);
    await instructorSession
      .auth(api().post(`/api/assignments/submissions/${submission.body.submission.id}/grade`))
      .send({ grade: 45, feedback: 'Good work.', status: 'graded' })
      .expect(200);

    const list = await instructorSession.auth(api().get('/api/instructor/assignments')).expect(200);
    expect(list.body.assignments).toHaveLength(1);
    expect(list.body.assignments[0]).toMatchObject({
      id: assignment.id,
      title: 'Harden the host',
      submission_count: 1,
      pending_count: 0,
      graded_count: 1,
      learner_count: 1,
    });
  });

  it('sends announcements to enrolled learners and records delivery', async () => {
    const { instructorSession, studentSession, course } = await setupCourseWithLearner();

    const sent = await instructorSession
      .auth(api().post('/api/instructor/announcements'))
      .send({
        title: 'Lab moved to Thursday',
        body: 'We will meet in the lab at 14:00 instead of the classroom.',
        courseId: course.id,
        link: '/student/calendar',
      })
      .expect(201);
    expect(sent.body.delivered).toBe(1);
    expect(sent.body.announcement.recipient_count).toBe(1);

    const history = await instructorSession.auth(api().get('/api/instructor/announcements')).expect(200);
    expect(history.body.announcements).toHaveLength(1);
    expect(history.body.announcements[0]).toMatchObject({
      title: 'Lab moved to Thursday',
      course_id: course.id,
      recipient_count: 1,
    });

    const inbox = await studentSession.auth(api().get('/api/notifications')).expect(200);
    expect(inbox.body.notifications.some((item) => item.title === 'Lab moved to Thursday')).toBe(true);

    const otherInstructor = await createUser({ role: 'instructor' });
    const otherSession = await loginAs(otherInstructor);
    await otherSession
      .auth(api().post('/api/instructor/announcements'))
      .send({ title: 'Nope', body: 'This should not reach another course.', courseId: course.id })
      .expect(403);
  });

  it('rejects announcements when no learners are enrolled', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token, { title: 'Empty Course' });
    const res = await session
      .auth(api().post('/api/instructor/announcements'))
      .send({ title: 'Hello', body: 'No one is here yet.', courseId: course.id })
      .expect(400);
    expect(res.body.error.message).toMatch(/no enrolled learners/i);
  });

  it('exposes assessment, inbox and recent activity aggregates on the overview', async () => {
    const { instructorSession, studentSession, course } = await setupCourseWithLearner();
    const quiz = await createQuiz(instructorSession, course.id);
    const assignment = await createAssignment(instructorSession, course.id);
    const studentView = await studentSession.auth(api().get(`/api/quizzes/${quiz.id}`)).expect(200);
    await studentSession
      .auth(api().post(`/api/quizzes/${quiz.id}/attempts`))
      .send({ answers: studentView.body.questions.map((question) => ({ questionId: question.id, option: 0 })) })
      .expect(201);
    await studentSession
      .auth(api().post(`/api/assignments/${assignment.id}/submit`))
      .send({ content: 'Submitted for overview.' })
      .expect(201);

    const overview = await instructorSession.auth(api().get('/api/instructor/overview')).expect(200);
    expect(overview.body.assessments).toMatchObject({ quizzes: 1, assignments: 1, attempts: 1, graded: 0 });
    expect(overview.body.recentSubmissions).toHaveLength(1);
    expect(overview.body.recentSubmissions[0].student_name).toBe('Learner One');
    expect(overview.body.recentAttempts).toHaveLength(1);
    expect(overview.body.recentAttempts[0].quiz_title).toBe('Security Check');
  });

  it('blocks learners from instructor endpoints', async () => {
    const student = await createUser();
    const session = await loginAs(student);
    await session.auth(api().get('/api/instructor/quizzes')).expect(403);
    await session.auth(api().get('/api/instructor/assignments')).expect(403);
    await session.auth(api().get('/api/instructor/announcements')).expect(403);
    await session.auth(api().post('/api/instructor/announcements')).send({ title: 'Test', body: 'Blocked.' }).expect(403);
    await session.auth(api().get('/api/instructor/students')).expect(403);
  });

  it('keeps other instructors out of private courses, labs, sessions, reports and students', async () => {
    const { instructorSession, student, studentSession, course } = await setupCourseWithLearner({
      title: 'Private Course',
    });

    const draftCourse = await createCourseFor(instructorSession.token, {
      title: 'Private Draft Course',
      status: 'draft',
    });
    const publishedLab = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'Private Lab', courseId: course.id, status: 'published' })
      .expect(201);
    const lab = publishedLab.body.lab;
    await instructorSession
      .auth(api().post(`/api/labs/${lab.id}/steps`))
      .send({ title: 'Run pwd', instruction: 'Run pwd', verification: 'command', expectedCommand: 'pwd', points: 10 })
      .expect(201);
    const draftLab = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'Draft Lab', courseId: course.id, status: 'draft' })
      .expect(201);

    const sessionRes = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    const sessionId = sessionRes.body.session.id;
    await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionId}/exec`))
      .send({ command: 'pwd' })
      .expect(200);
    const reportRes = await studentSession
      .auth(api().post(`/api/reports/sessions/${sessionId}/generate`))
      .expect(201);
    const reportId = reportRes.body.report.id;

    const otherInstructor = await createUser({ role: 'instructor' });
    const otherSession = await loginAs(otherInstructor);

    // Course catalog and unpublished detail pages
    const catalog = await otherSession.auth(api().get('/api/courses?all=true&limit=60')).expect(200);
    expect(catalog.body.courses.some((item) => item.id === course.id || item.id === draftCourse.id)).toBe(false);
    await otherSession.auth(api().get(`/api/courses/${draftCourse.slug}`)).expect(404);
    await otherSession.auth(api().put(`/api/courses/${course.id}`)).send({ summary: 'hijack' }).expect(403);
    await otherSession.auth(api().get(`/api/courses/${course.id}/manage`)).expect(403);

    // Labs, sessions and answers
    await otherSession.auth(api().get(`/api/labs/${draftLab.body.lab.id}`)).expect(404);
    await otherSession.auth(api().get(`/api/labs/${lab.id}/manage`)).expect(403);
    await otherSession.auth(api().get(`/api/labs/sessions/${sessionId}`)).expect(403);
    await otherSession.auth(api().post(`/api/labs/sessions/${sessionId}/exec`)).send({ command: 'pwd' }).expect(403);

    // Reports
    await otherSession.auth(api().get(`/api/reports/${reportId}`)).expect(403);
    await otherSession.auth(api().post(`/api/reports/${reportId}/review`)).send({ action: 'approve' }).expect(403);

    // Course assessment content stays with the assigned instructor
    await otherSession.auth(api().get(`/api/assignments/courses/${course.id}`)).expect(403);
    await otherSession.auth(api().get(`/api/quizzes/courses/${course.id}`)).expect(403);
    await instructorSession.auth(api().get(`/api/assignments/courses/${course.id}`)).expect(200);
    await instructorSession.auth(api().get(`/api/quizzes/courses/${course.id}`)).expect(200);

    // Student records and analytics
    await otherSession.auth(api().get(`/api/users/${student.id}`)).expect(403);
    const students = await otherSession.auth(api().get('/api/instructor/students')).expect(200);
    expect(students.body.students).toHaveLength(0);
    await otherSession.auth(api().get(`/api/instructor/students/${student.id}`)).expect(403);

    // Contact inbox is admin-only
    await otherSession.auth(api().get('/api/contact')).expect(403);

    // The owning instructor still has access
    await instructorSession.auth(api().get(`/api/labs/sessions/${sessionId}`)).expect(200);
    await instructorSession.auth(api().get(`/api/reports/${reportId}`)).expect(200);
    const ownStudents = await instructorSession.auth(api().get('/api/instructor/students')).expect(200);
    expect(ownStudents.body.students.map((item) => item.id)).toContain(student.id);
  });

  it('returns scoped student analytics and practical grading data', async () => {
    const { instructorSession, studentSession, student, course } = await setupCourseWithLearner({
      title: 'Analytics Course',
    });
    const quiz = await createQuiz(instructorSession, course.id);
    const assignment = await createAssignment(instructorSession, course.id);

    const quizView = await studentSession.auth(api().get(`/api/quizzes/${quiz.id}`)).expect(200);
    await studentSession
      .auth(api().post(`/api/quizzes/${quiz.id}/attempts`))
      .send({ answers: quizView.body.questions.map((question) => ({ questionId: question.id, option: 0 })) })
      .expect(201);
    const submitted = await studentSession
      .auth(api().post(`/api/assignments/${assignment.id}/submit`))
      .send({ content: 'Hardening notes.' })
      .expect(201);
    await instructorSession
      .auth(api().post(`/api/assignments/submissions/${submitted.body.submission.id}/grade`))
      .send({ grade: 42, feedback: 'Solid.', status: 'graded' })
      .expect(200);

    const lab = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'Analytics Lab', courseId: course.id, status: 'published' })
      .expect(201);
    await instructorSession
      .auth(api().post(`/api/labs/${lab.body.lab.id}/steps`))
      .send({ title: 'Run pwd', instruction: 'Run pwd', verification: 'command', expectedCommand: 'pwd', points: 10 })
      .expect(201);
    const sessionRes = await studentSession
      .auth(api().post(`/api/labs/${lab.body.lab.id}/sessions`))
      .expect(201);
    await studentSession
      .auth(api().post(`/api/labs/sessions/${sessionRes.body.session.id}/exec`))
      .send({ command: 'pwd' })
      .expect(200);
    const reportRes = await studentSession
      .auth(api().post(`/api/reports/sessions/${sessionRes.body.session.id}/generate`))
      .expect(201);
    const reportId = reportRes.body.report.id;
    await studentSession.auth(api().post(`/api/reports/${reportId}/submit`)).expect(200);

    const list = await instructorSession.auth(api().get('/api/instructor/students')).expect(200);
    const row = list.body.students.find((item) => item.id === student.id);
    expect(row).toMatchObject({ course_count: 1, quiz_attempts: 1, reports_total: 1, reports_pending: 1 });
    expect(Number(row.avg_quiz_percent)).toBe(100);

    const detail = await instructorSession.auth(api().get(`/api/instructor/students/${student.id}`)).expect(200);
    expect(detail.body.summary).toMatchObject({
      courseCount: 1,
      gradedSubmissions: 1,
      avgGrade: 42,
      reportsPending: 1,
      avgQuizPercent: 100,
    });
    expect(Number(detail.body.quizzes[0].best_percent)).toBe(100);
    expect(detail.body.assignments[0]).toMatchObject({ submission_status: 'graded' });
    expect(Number(detail.body.assignments[0].grade)).toBe(42);
    expect(detail.body.enrollments.map((item) => item.course_id)).toContain(course.id);

    // Practical grading persists numeric marks and a per-step rubric
    const review = await instructorSession
      .auth(api().post(`/api/reports/${reportId}/review`))
      .send({
        action: 'approve',
        feedback: 'Well documented.',
        score: 18,
        maxScore: 20,
        rubric: [
          { stepId: 1, title: 'Run pwd', points: 10, maxPoints: 10, comment: 'Correct command.' },
        ],
      })
      .expect(200);
    expect(Number(review.body.report.score)).toBe(18);
    expect(Number(review.body.report.max_score)).toBe(20);
    expect(review.body.report.rubric).toHaveLength(1);
    expect(review.body.report.rubric[0]).toMatchObject({ title: 'Run pwd', points: 10 });
  });
});
