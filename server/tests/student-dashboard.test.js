import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, addLesson, enroll } from './helpers.js';

async function setupStudentDashboard() {
  const instructor = await createUser({ role: 'instructor', fullName: 'Dashboard Instructor' });
  const instructorSession = await loginAs(instructor);
  const student = await createUser({ fullName: 'Dashboard Student' });
  const studentSession = await loginAs(student);
  const course = await createCourseFor(instructorSession.token, { title: 'Dashboard Course' });
  const lesson = await addLesson(instructorSession.token, course.id, { title: 'Dashboard Lesson' });
  await enroll(studentSession.token, course.id);

  const quizRes = await instructorSession
    .auth(api().post(`/api/quizzes/courses/${course.id}`))
    .send({
      title: 'Dashboard Quiz',
      passScore: 50,
      questions: [{ question: 'Pick one', options: ['Yes', 'No'], correctOption: 0, points: 2 }],
    })
    .expect(201);
  const quizId = quizRes.body.quiz.id;

  const assignmentRes = await instructorSession
    .auth(api().post(`/api/assignments/courses/${course.id}`))
    .send({
      title: 'Dashboard Assignment',
      description: 'Complete the work.',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      points: 20,
    })
    .expect(201);

  return {
    instructorSession,
    studentSession,
    course,
    lesson,
    quizId,
    assignmentId: assignmentRes.body.assignment.id,
  };
}

describe('Student dashboard aggregate APIs', () => {
  it('requires authentication', async () => {
    await api().get('/api/me/quizzes').expect(401);
    await api().get('/api/me/assignments').expect(401);
    await api().get('/api/me/lessons').expect(401);
    await api().get('/api/me/calendar').expect(401);
  });

  it('returns quizzes, assignments and lessons for enrolled courses only', async () => {
    const { studentSession, course, lesson, quizId, assignmentId } = await setupStudentDashboard();

    const quizView = await studentSession.auth(api().get(`/api/quizzes/${quizId}`)).expect(200);
    await studentSession
      .auth(api().post(`/api/quizzes/${quizId}/attempts`))
      .send({ answers: [{ questionId: quizView.body.questions[0].id, option: 0 }] })
      .expect(201);

    const quizzes = await studentSession.auth(api().get('/api/me/quizzes')).expect(200);
    expect(quizzes.body.quizzes).toHaveLength(1);
    expect(quizzes.body.quizzes[0]).toMatchObject({
      id: quizId,
      course_title: 'Dashboard Course',
      question_count: 1,
      has_passed: true,
      attempt_count: 1,
    });

    const assignments = await studentSession.auth(api().get('/api/me/assignments')).expect(200);
    expect(assignments.body.assignments).toHaveLength(1);
    expect(assignments.body.assignments[0]).toMatchObject({
      id: assignmentId,
      course_title: 'Dashboard Course',
      submission_id: null,
      submission_status: null,
      is_overdue: false,
    });

    await studentSession
      .auth(api().post(`/api/lessons/${lesson.id}/progress`))
      .send({ completed: true, timeSpentSeconds: 60 })
      .expect(200);

    const lessons = await studentSession.auth(api().get('/api/me/lessons')).expect(200);
    expect(lessons.body.lessons).toHaveLength(1);
    expect(lessons.body.lessons[0]).toMatchObject({
      id: lesson.id,
      course_id: course.id,
      course_title: 'Dashboard Course',
      progress_status: 'completed',
    });

    const outsider = await createUser({ fullName: 'Outside Student' });
    const outsiderSession = await loginAs(outsider);
    const empty = await outsiderSession.auth(api().get('/api/me/lessons')).expect(200);
    expect(empty.body.lessons).toHaveLength(0);
  });

  it('lists due dates, submissions, stats and overdue assignments accurately', async () => {
    const { studentSession, assignmentId, quizId } = await setupStudentDashboard();

    const calendar = await studentSession.auth(api().get('/api/me/calendar')).expect(200);
    expect(calendar.body.events).toHaveLength(1);
    expect(calendar.body.events[0]).toMatchObject({ id: assignmentId, is_overdue: false });

    await studentSession
      .auth(api().post(`/api/assignments/${assignmentId}/submit`))
      .send({ content: 'My completed assignment response.' })
      .expect(201);

    const assignments = await studentSession.auth(api().get('/api/me/assignments')).expect(200);
    expect(assignments.body.assignments[0].submission_status).toBe('submitted');

    const stats = await studentSession.auth(api().get('/api/me/stats')).expect(200);
    expect(stats.body.enrollments.active).toBe(1);
    expect(stats.body.quizzes.available).toBe(1);
    expect(stats.body.assignments.total).toBe(1);
    expect(stats.body.assignments.submitted).toBe(1);
    expect(stats.body.assignments.pending).toBe(0);
    expect(quizId).toBeTruthy();
  });
});
