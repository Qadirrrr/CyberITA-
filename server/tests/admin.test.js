import { describe, expect, it } from 'vitest';
import { api, createUser, loginAs, createCourseFor } from './helpers.js';

describe('Admin controls, RBAC & platform settings', () => {
  it('protects admin endpoints from students and instructors', async () => {
    const student = await createUser({ role: 'student' });
    const instructor = await createUser({ role: 'instructor' });
    const { token: studentToken } = await loginAs(student);
    const { token: instructorToken } = await loginAs(instructor);

    await api()
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    await api()
      .get('/api/admin/lab-sessions')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(403);

    await api()
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    await api()
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(403);
  });

  it('allows admins to inspect infrastructure health, lab sessions, logs, and update settings', async () => {
    const admin = await createUser({ role: 'admin' });
    const { token: adminToken } = await loginAs(admin);

    // 1. Health
    const healthRes = await api()
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(healthRes.body.status).toBe('ok');
    expect(healthRes.body.database.status).toBe('ok');
    expect(healthRes.body.infrastructure).toBeDefined();

    // 2. Lab sessions list
    const sessionsRes = await api()
      .get('/api/admin/lab-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(sessionsRes.body.sessions)).toBe(true);

    // 3. Audit logs list
    const logsRes = await api()
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(logsRes.body.logs)).toBe(true);

    // 4. Settings get & update
    const getSettingsRes = await api()
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(getSettingsRes.body.settings).toBeDefined();

    const updateRes = await api()
      .put('/api/admin/settings/general')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        value: {
          platformName: 'CyberITA+ Pro',
          supportEmail: 'admin@cyberita.local',
          maintenanceMode: false,
          registrationOpen: true,
        },
      })
      .expect(200);
    expect(updateRes.body.setting.key).toBe('general');
    expect(updateRes.body.setting.value.platformName).toBe('CyberITA+ Pro');
  });

  it('allows admins to assign and reassign course instructors', async () => {
    const admin = await createUser({ role: 'admin' });
    const instructor1 = await createUser({ role: 'instructor' });
    const instructor2 = await createUser({ role: 'instructor' });

    const { token: adminToken } = await loginAs(admin);
    const { token: inst1Token } = await loginAs(instructor1);

    // Instructor 1 creates a course
    const course = await createCourseFor(inst1Token, { title: 'Security 101' });
    expect(course.instructor_id).toBe(instructor1.id);

    // Admin reassigns the course to Instructor 2
    const updateRes = await api()
      .put(`/api/courses/${course.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructorId: instructor2.id })
      .expect(200);
    expect(updateRes.body.course.instructor_id).toBe(instructor2.id);

    // Instructor 1 should now be forbidden from modifying it
    await api()
      .put(`/api/courses/${course.id}`)
      .set('Authorization', `Bearer ${inst1Token}`)
      .send({ title: 'Hacked Title' })
      .expect(403);
  });

  it('restricts instructors to authorized enrolled students only', async () => {
    const instructor1 = await createUser({ role: 'instructor' });
    const instructor2 = await createUser({ role: 'instructor' });
    const student1 = await createUser({ role: 'student' });
    const student2 = await createUser({ role: 'student' });

    const { token: inst1Token } = await loginAs(instructor1);
    const { token: inst2Token } = await loginAs(instructor2);
    const { token: s1Token } = await loginAs(student1);

    // Instructor 1 course, student 1 enrolls
    const course1 = await createCourseFor(inst1Token, { title: 'Inst1 Course' });
    await api()
      .post(`/api/courses/${course1.id}/enroll`)
      .set('Authorization', `Bearer ${s1Token}`)
      .expect(201);

    // Instructor 1 can view student 1
    const resAuth = await api()
      .get(`/api/users/${student1.id}`)
      .set('Authorization', `Bearer ${inst1Token}`)
      .expect(200);
    expect(resAuth.body.user.id).toBe(student1.id);

    // Instructor 1 CANNOT view student 2 (not enrolled in instructor 1's courses)
    await api()
      .get(`/api/users/${student2.id}`)
      .set('Authorization', `Bearer ${inst1Token}`)
      .expect(403);

    // Instructor 2 CANNOT view student 1
    await api()
      .get(`/api/users/${student1.id}`)
      .set('Authorization', `Bearer ${inst2Token}`)
      .expect(403);
  });

  it('exposes platform-wide course, catalog and instructor-assignment controls', async () => {
    const admin = await createUser({ role: 'admin' });
    const instructor = await createUser({ role: 'instructor' });
    const { token: adminToken } = await loginAs(admin);
    const { token: instructorToken } = await loginAs(instructor);

    const course = await createCourseFor(instructorToken, { title: 'Platform Oversight Course', status: 'draft' });

    const listRes = await api()
      .get('/api/admin/courses?search=Oversight')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listRes.body.courses.some((c) => c.id === course.id)).toBe(true);
    expect(Array.isArray(listRes.body.categories)).toBe(true);

    const statusRes = await api()
      .post(`/api/admin/courses/${course.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'published' })
      .expect(200);
    expect(statusRes.body.course.status).toBe('published');

    const catalogRes = await api()
      .get('/api/admin/catalog')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(catalogRes.body.stats.courses).toBeGreaterThan(0);
    expect(Array.isArray(catalogRes.body.paths)).toBe(true);

    const assignRes = await api()
      .put(`/api/admin/instructors/${instructor.id}/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courseIds: [course.id] })
      .expect(200);
    expect(assignRes.body.assigned).toBe(1);

    const assignedRes = await api()
      .get(`/api/admin/instructors/${instructor.id}/courses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(assignedRes.body.courses.find((c) => c.id === course.id).assigned).toBe(true);
  });

  it('runs moderation, system status and lab runtime verification end to end', async () => {
    const admin = await createUser({ role: 'admin' });
    const instructor = await createUser({ role: 'instructor' });
    const student = await createUser({ role: 'student' });
    const { token: adminToken } = await loginAs(admin);
    const { token: instructorToken } = await loginAs(instructor);
    const { token: studentToken } = await loginAs(student);

    const course = await createCourseFor(instructorToken, { title: 'Reportable Course' });
    await api()
      .post('/api/content-reports')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ contentType: 'course', contentId: course.id, reason: 'misleading', details: 'Example is outdated.' })
      .expect(201);

    const overviewRes = await api()
      .get('/api/admin/content-overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(overviewRes.body.flagsTotal).toBeGreaterThanOrEqual(1);
    expect(overviewRes.body.policies).toBeDefined();

    const queueRes = await api()
      .get('/api/admin/content-reports?status=open')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const flag = queueRes.body.reports.find(
      (report) => report.content_type === 'course' && report.content_id === course.id
    );
    expect(flag).toBeTruthy();

    const resolvedRes = await api()
      .patch(`/api/admin/content-reports/${flag.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved', note: 'Content corrected.' })
      .expect(200);
    expect(resolvedRes.body.report.status).toBe('resolved');

    const systemRes = await api()
      .get('/api/admin/system-status')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(systemRes.body.database.migrations.length).toBeGreaterThan(0);
    expect(systemRes.body.learning).toBeDefined();
    expect(systemRes.body.backups).toBeDefined();

    // Works without Docker (mock provider in tests) but always reports structured checks.
    const verifyRes = await api()
      .post('/api/admin/labs/runtime/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(verifyRes.body.checks)).toBe(true);
    expect(verifyRes.body.checks.length).toBeGreaterThan(0);

    await api()
      .post('/api/admin/labs/runtime/verify')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });
});
