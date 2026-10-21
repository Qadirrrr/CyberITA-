import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, addLesson, enroll } from './helpers.js';

describe('Courses & enrollment', () => {
  it('hides draft courses from the public catalog and detail pages', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const draft = await createCourseFor(session.token, { title: 'Draft Course', status: 'draft' });

    const list = await api().get('/api/courses').expect(200);
    expect(list.body.courses.find((c) => c.slug === draft.slug)).toBeUndefined();

    await api().get(`/api/courses/${draft.slug}`).expect(404);

    const staffView = await session.auth(api().get(`/api/courses/${draft.slug}`)).expect(200);
    expect(staffView.body.course.title).toBe('Draft Course');

    await session.auth(api().get('/api/courses?all=true&status=draft')).expect(200);
  });

  it('supports full course authoring: modules, lessons, publishing and catalog filters', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token, {
      title: 'Advanced Networking Lab Course',
      category: 'Networking',
      level: 'advanced',
      status: 'draft',
      tags: ['networking', 'lab'],
    });

    const moduleRes = await session
      .auth(api().post(`/api/courses/${course.id}/modules`))
      .send({ title: 'Module One', description: 'Getting started' })
      .expect(201);
    const moduleId = moduleRes.body.module.id;

    const lesson = await session
      .auth(api().post(`/api/courses/${course.id}/lessons`))
      .send({ moduleId, title: 'First Lesson', content: '# Hello', durationMinutes: 15, isFreePreview: true })
      .expect(201);
    expect(lesson.body.lesson.module_id).toBe(moduleId);

    await session
      .auth(api().post(`/api/courses/${course.id}/lessons`))
      .send({ title: 'Second Lesson', content: 'More', durationMinutes: 20 })
      .expect(201);

    await session
      .auth(api().put(`/api/courses/${course.id}`))
      .send({ status: 'published' })
      .expect(200);

    const list = await api().get('/api/courses?category=Networking&level=advanced').expect(200);
    const found = list.body.courses.find((c) => c.id === course.id);
    expect(found).toBeTruthy();
    expect(Number(found.lesson_count)).toBe(2);

    const detail = await api().get(`/api/courses/${course.slug}`).expect(200);
    expect(detail.body.modules).toHaveLength(1);
    expect(detail.body.modules[0].lessons).toHaveLength(1);
    expect(detail.body.course.instructor_name).toBe(instructor.full_name);

    const search = await api().get('/api/courses?search=Networking').expect(200);
    expect(search.body.courses.some((c) => c.id === course.id)).toBe(true);

    const filters = await api().get('/api/courses/meta/filters').expect(200);
    expect(filters.body.levels).toContain('advanced');
  });

  it('validates lesson ownership and permissions', async () => {
    const owner = await createUser({ role: 'instructor' });
    const ownerSession = await loginAs(owner);
    const intruder = await createUser({ role: 'instructor' });
    const intruderSession = await loginAs(intruder);
    const student = await createUser();
    const studentSession = await loginAs(student);

    const course = await createCourseFor(ownerSession.token);
    const lesson = await addLesson(ownerSession.token, course.id);

    await intruderSession.auth(api().put(`/api/courses/lessons/${lesson.id}`)).send({ title: 'Hijacked' }).expect(403);
    await studentSession.auth(api().put(`/api/courses/lessons/${lesson.id}`)).send({ title: 'Hijacked' }).expect(403);
    await studentSession.auth(api().post('/api/courses')).send({ title: 'Nope' }).expect(403);

    const updated = await ownerSession
      .auth(api().put(`/api/courses/lessons/${lesson.id}`))
      .send({ title: 'Renamed Lesson', position: 3 })
      .expect(200);
    expect(updated.body.lesson.title).toBe('Renamed Lesson');

    await ownerSession.auth(api().delete(`/api/courses/lessons/${lesson.id}`)).expect(200);
    await ownerSession.auth(api().delete(`/api/courses/modules/999999`)).expect(404);
  });

  it('enrolls students, tracks progress and issues a certificate at 100%', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const student = await createUser({ fullName: 'Progress Student' });
    const studentSession = await loginAs(student);

    const course = await createCourseFor(instructorSession.token, { title: 'Progress Course' });
    const l1 = await addLesson(instructorSession.token, course.id, { title: 'One' });
    const l2 = await addLesson(instructorSession.token, course.id, { title: 'Two' });

    await api().post(`/api/courses/${course.id}/enroll`).expect(401);
    await enroll(studentSession.token, course.id);
    await studentSession.auth(api().post(`/api/courses/${course.id}/enroll`)).expect(409);

    const myCourses = await studentSession.auth(api().get('/api/my-courses')).expect(200);
    expect(myCourses.body.enrollments).toHaveLength(1);
    expect(Number(myCourses.body.enrollments[0].progress_percent)).toBe(0);
    expect(myCourses.body.enrollments[0].next_lesson_id).toBe(l1.id);

    const p1 = await studentSession
      .auth(api().post(`/api/lessons/${l1.id}/progress`))
      .send({ completed: true, timeSpentSeconds: 120 })
      .expect(200);
    expect(p1.body.percent).toBe(50);
    expect(p1.body.completedNow).toBe(false);

    const progress = await studentSession.auth(api().get(`/api/courses/${course.id}/progress`)).expect(200);
    expect(progress.body.lessons.find((l) => l.id === l1.id).status).toBe('completed');
    expect(progress.body.percent).toBe(50);

    const p2 = await studentSession
      .auth(api().post(`/api/lessons/${l2.id}/progress`))
      .send({ completed: true, timeSpentSeconds: 60 })
      .expect(200);
    expect(p2.body.percent).toBe(100);
    expect(p2.body.completedNow).toBe(true);
    expect(p2.body.certificate.serial).toMatch(/^CYB-/);

    const certs = await studentSession.auth(api().get('/api/certificates/mine')).expect(200);
    expect(certs.body.certificates).toHaveLength(1);
    expect(certs.body.certificates[0].course_title).toBe('Progress Course');

    const verify = await api().get(`/api/certificates/verify/${certs.body.certificates[0].serial}`).expect(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.certificate.student_name).toBe('Progress Student');
    await api().get('/api/certificates/verify/CYB-NOPE-0000').expect(404);

    const detail = await studentSession.auth(api().get(`/api/courses/${course.slug}`)).expect(200);
    expect(detail.body.certificate).toBeTruthy();
    expect(Number(detail.body.enrollment.progress_percent)).toBe(100);

    const stats = await studentSession.auth(api().get('/api/me/stats')).expect(200);
    expect(stats.body.enrollments.completed).toBe(1);
    expect(stats.body.certificates).toBe(1);

    const history = await studentSession.auth(api().get('/api/me/history')).expect(200);
    expect(history.body.events.some((e) => e.action === 'course.completed')).toBe(true);
  });

  it('requires enrollment for progress updates and validates lesson ids', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token);
    const lesson = await addLesson(session.token, course.id);
    const student = await createUser();
    const studentSession = await loginAs(student);

    const res = await studentSession
      .auth(api().post(`/api/lessons/${lesson.id}/progress`))
      .send({ completed: true })
      .expect(400);
    expect(res.body.error.message).toContain('Enroll');

    await studentSession.auth(api().post('/api/lessons/999999/progress')).send({ completed: true }).expect(404);
  });

  it('lets instructors view enrolled students for their course', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const student = await createUser({ fullName: 'Roster Student' });
    const studentSession = await loginAs(student);
    const course = await createCourseFor(session.token, { title: 'Roster Course' });
    await addLesson(session.token, course.id);
    await enroll(studentSession.token, course.id);

    const manage = await session.auth(api().get(`/api/courses/${course.id}/manage`)).expect(200);
    expect(manage.body.enrollments).toHaveLength(1);
    expect(manage.body.enrollments[0].full_name).toBe('Roster Student');

    const overview = await session.auth(api().get('/api/instructor/overview')).expect(200);
    expect(overview.body.students.learners).toBeGreaterThanOrEqual(1);
  });

  it('exposes a subcategory-aware catalog for the navbar', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const published = await createCourseFor(session.token, {
      title: 'React Frontend',
      category: 'Web Development',
      subcategory: 'React',
      status: 'published',
    });
    const draft = await createCourseFor(session.token, {
      title: 'Express API Draft',
      category: 'Web Development',
      subcategory: 'Express',
      status: 'draft',
    });

    const res = await api().get('/api/nav').expect(200);
    const listed = res.body.courses.find((course) => course.id === published.id);
    expect(listed).toBeTruthy();
    expect(listed.subcategory).toBe('React');
    expect(res.body.courses.find((course) => course.id === draft.id)).toBeUndefined();
    expect(Array.isArray(res.body.labs)).toBe(true);
  });

  it('supports learning paths in the public API', async () => {
    const { query } = await import('../src/config/db.js');
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const course = await createCourseFor(session.token, { title: 'Path Course' });
    const { rows } = await query(
      `INSERT INTO learning_paths (slug, title, description, level) VALUES ('test-path', 'Test Path', 'Desc', 'beginner') RETURNING id`
    );
    await query('INSERT INTO learning_path_courses (path_id, course_id, position) VALUES ($1, $2, 0)', [rows[0].id, course.id]);

    const res = await api().get('/api/learning-paths').expect(200);
    const path = res.body.paths.find((p) => p.slug === 'test-path');
    expect(path).toBeTruthy();
    expect(path.courses).toHaveLength(1);
    expect(path.courses[0].title).toBe('Path Course');
  });
});
