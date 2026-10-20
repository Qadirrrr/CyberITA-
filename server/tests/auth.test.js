import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, PASSWORD } from './helpers.js';

describe('Health', () => {
  it('reports API status', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.name).toContain('CyberITA');
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await api().get('/api/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('Authentication', () => {
  it('registers a student and returns a session', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ fullName: 'New Learner', email: 'new.learner@test.cyberita.plus', password: 'Secret123' })
      .expect(201);
    expect(res.body.user.email).toBe('new.learner@test.cyberita.plus');
    expect(res.body.user.role).toBe('student');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.headers['set-cookie'].join(';')).toContain('cyberita_rt');
  });

  it('rejects invalid registration payloads', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ fullName: 'A', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('prevents duplicate email registration (case insensitive)', async () => {
    await createUser({ email: 'duplicate@test.cyberita.plus' });
    const res = await api()
      .post('/api/auth/register')
      .send({ fullName: 'Dupe User', email: 'DUPLICATE@test.cyberita.plus', password: 'Secret123' })
      .expect(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('logs in, exposes the current user and enforces authentication', async () => {
    const user = await createUser({ email: 'login@test.cyberita.plus', fullName: 'Login User' });
    const session = await loginAs(user);
    expect(session.user.full_name).toBe('Login User');

    const me = await session.auth(api().get('/api/auth/me')).expect(200);
    expect(me.body.user.email).toBe(user.email);

    await api().get('/api/auth/me').expect(401);
  });

  it('rejects wrong passwords and disabled accounts', async () => {
    const user = await createUser({ email: 'wrongpass@test.cyberita.plus' });
    await api().post('/api/auth/login').send({ email: user.email, password: 'Nope12345' }).expect(401);

    const disabled = await createUser({ email: 'disabled@test.cyberita.plus' });
    await api().patch(`/api/users/${disabled.id}`).set('Authorization', 'Bearer invalid').expect(401);
    const admin = await createUser({ role: 'admin' });
    const adminSession = await loginAs(admin);
    await adminSession.auth(api().patch(`/api/users/${disabled.id}`)).send({ isActive: false }).expect(200);
    await api().post('/api/auth/login').send({ email: disabled.email, password: PASSWORD }).expect(401);
  });

  it('rotates refresh tokens and revokes on logout', async () => {
    const user = await createUser({ email: 'refresh@test.cyberita.plus' });
    const login = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('cyberita_rt'));

    const refreshed = await api().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    const rotated = refreshed.headers['set-cookie'].find((c) => c.startsWith('cyberita_rt'));
    expect(rotated).toBeDefined();

    await api().post('/api/auth/logout').set('Cookie', rotated).expect(200);
    await api().post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('changes password and invalidates old credentials', async () => {
    const user = await createUser({ email: 'changepass@test.cyberita.plus' });
    const session = await loginAs(user);
    await session
      .auth(api().put('/api/auth/change-password'))
      .send({ currentPassword: PASSWORD, newPassword: 'NewSecret123' })
      .expect(200);
    await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
    await api().post('/api/auth/login').send({ email: user.email, password: 'NewSecret123' }).expect(200);
  });

  it('enforces role based access control', async () => {
    const student = await createUser();
    const session = await loginAs(student);
    await session.auth(api().get('/api/users')).expect(403);
    await session.auth(api().get('/api/admin/overview')).expect(403);

    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    await instructorSession.auth(api().get('/api/users')).expect(200);
    await instructorSession.auth(api().get('/api/admin/overview')).expect(403);

    const admin = await createUser({ role: 'admin' });
    const adminSession = await loginAs(admin);
    const overview = await adminSession.auth(api().get('/api/admin/overview')).expect(200);
    expect(overview.body.users.total).toBeGreaterThan(0);
  });

  it('updates the profile of the current user', async () => {
    const user = await createUser({ email: 'profile@test.cyberita.plus' });
    const session = await loginAs(user);
    const res = await session
      .auth(api().put('/api/users/me'))
      .send({ fullName: 'Updated Name', headline: 'Linux Learner' })
      .expect(200);
    expect(res.body.user.full_name).toBe('Updated Name');
    expect(res.body.user.headline).toBe('Linux Learner');
  });
});
