import request from 'supertest';
import { createApp } from '../src/app.js';
import { query } from '../src/config/db.js';
import { hashPassword } from '../src/services/authService.js';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Passw0rd!';

let counter = 0;

export async function createUser({ fullName = 'Test User', role = 'student', password = PASSWORD, email } = {}) {
  counter += 1;
  const address = email || `${role}.${counter}.${Date.now()}@test.cyberita.plus`;
  const hash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, full_name, role, created_at`,
    [address.toLowerCase(), hash, fullName, role]
  );
  return { ...rows[0], password };
}

export async function loginAs(user) {
  const res = await api().post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
  return {
    user: res.body.user,
    token: res.body.accessToken,
    auth: (req) => req.set('Authorization', `Bearer ${res.body.accessToken}`),
    refreshCookie: res.headers['set-cookie'],
  };
}

export async function createCourseFor(instructorToken, overrides = {}) {
  const payload = {
    title: 'Test Course',
    summary: 'A test course',
    description: 'Learn things',
    category: 'Testing',
    level: 'beginner',
    durationHours: 5,
    price: 0,
    tags: ['test'],
    status: 'published',
    ...overrides,
  };
  const res = await api()
    .post('/api/courses')
    .set('Authorization', `Bearer ${instructorToken}`)
    .send(payload)
    .expect(201);
  return res.body.course;
}

export async function addLesson(instructorToken, courseId, overrides = {}) {
  const res = await api()
    .post(`/api/courses/${courseId}/lessons`)
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({
      title: 'Test Lesson',
      content: '# Lesson content',
      durationMinutes: 10,
      lessonType: 'reading',
      ...overrides,
    })
    .expect(201);
  return res.body.lesson;
}

export async function enroll(studentToken, courseId) {
  const res = await api()
    .post(`/api/courses/${courseId}/enroll`)
    .set('Authorization', `Bearer ${studentToken}`)
    .expect(201);
  return res.body.enrollment;
}

/** 1x1 transparent PNG used for screenshot upload tests. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
