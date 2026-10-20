import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs } from './helpers.js';

describe('Blog posts', () => {
  it('manages the editorial lifecycle and tracks views', async () => {
    const instructor = await createUser({ role: 'instructor', fullName: 'Blog Author' });
    const session = await loginAs(instructor);

    const created = await session
      .auth(api().post('/api/posts'))
      .send({
        title: 'Optimizing Linux Boot Times',
        excerpt: 'Practical steps to trim your boot time.',
        content: '# Optimizing Linux Boot Times\n\nUse systemd-analyze blame.',
        tags: ['linux', 'performance'],
        status: 'draft',
      })
      .expect(201);
    const post = created.body.post;
    expect(post.status).toBe('draft');

    const drafts = await session.auth(api().get('/api/posts?status=draft')).expect(200);
    expect(drafts.body.posts.some((p) => p.id === post.id)).toBe(true);

    const publicList = await api().get('/api/posts').expect(200);
    expect(publicList.body.posts.some((p) => p.id === post.id)).toBe(false);

    const edited = await session
      .auth(api().put(`/api/posts/${post.id}`))
      .send({ excerpt: 'Updated excerpt for the article.' })
      .expect(200);
    expect(edited.body.post.excerpt).toContain('Updated');

    const published = await session
      .auth(api().post(`/api/posts/${post.id}/status`))
      .send({ status: 'published' })
      .expect(200);
    expect(published.body.post.status).toBe('published');
    expect(published.body.post.published_at).toBeTruthy();

    const visible = await api().get('/api/posts').expect(200);
    expect(visible.body.posts.some((p) => p.id === post.id)).toBe(true);
    expect(visible.body.tags.some((t) => t.tag === 'linux')).toBe(true);

    const firstRead = await api().get(`/api/posts/${post.slug}`).expect(200);
    expect(firstRead.body.post.author_name).toBe('Blog Author');
    expect(firstRead.body.post.content).toContain('systemd-analyze');
    expect(firstRead.body.post.view_count).toBe(1);
    const secondRead = await api().get(`/api/posts/${post.slug}`).expect(200);
    expect(secondRead.body.post.view_count).toBe(2);

    const search = await api().get('/api/posts?search=Boot').expect(200);
    expect(search.body.posts.length).toBeGreaterThanOrEqual(1);

    await api().get('/api/posts/does-not-exist').expect(404);

    // Only admins can hard-delete
    await session.auth(api().delete(`/api/posts/${post.id}`)).expect(403);
  });

  it('prevents students from authoring posts', async () => {
    const student = await createUser();
    const session = await loginAs(student);
    await session
      .auth(api().post('/api/posts'))
      .send({ title: 'Student post', content: 'Nope', status: 'published' })
      .expect(403);
  });
});

describe('Contact messages', () => {
  it('accepts public messages and lets staff triage them', async () => {
    const res = await api()
      .post('/api/contact')
      .send({ name: 'Recruiter', email: 'recruiter@example.com', subject: 'Team training', message: 'We would like to book 10 seats for our team.' })
      .expect(201);
    expect(res.body.ok).toBe(true);

    await api().post('/api/contact').send({ name: 'A', email: 'bad', subject: 'x', message: 'short' }).expect(400);

    const student = await createUser();
    const studentSession = await loginAs(student);
    await studentSession.auth(api().get('/api/contact')).expect(403);

    const admin = await createUser({ role: 'admin' });
    const adminSession = await loginAs(admin);
    const list = await adminSession.auth(api().get('/api/contact')).expect(200);
    const message = list.body.messages.find((m) => m.email === 'recruiter@example.com');
    expect(message).toBeTruthy();

    const updated = await adminSession.auth(api().patch(`/api/contact/${message.id}`)).send({ status: 'replied' }).expect(200);
    expect(updated.body.message.status).toBe('replied');
    expect(updated.body.message.handled_at).toBeTruthy();
  });
});

describe('Notifications', () => {
  it('lists, marks read and broadcasts to a role', async () => {
    const student = await createUser({ fullName: 'Notified Student' });
    const studentSession = await loginAs(student);

    const admin = await createUser({ role: 'admin' });
    const adminSession = await loginAs(admin);

    const broadcast = await adminSession
      .auth(api().post('/api/notifications/broadcast'))
      .send({ title: 'Platform maintenance', body: 'Saturday 02:00 UTC.', role: 'student' })
      .expect(201);
    expect(broadcast.body.delivered).toBeGreaterThanOrEqual(1);

    const list = await studentSession.auth(api().get('/api/notifications')).expect(200);
    expect(list.body.notifications[0].title).toBe('Platform maintenance');
    expect(list.body.unread).toBeGreaterThanOrEqual(1);

    const first = list.body.notifications[0];
    await studentSession.auth(api().post(`/api/notifications/${first.id}/read`)).expect(200);
    await studentSession.auth(api().post('/api/notifications/read-all')).expect(200);

    const after = await studentSession.auth(api().get('/api/notifications')).expect(200);
    expect(after.body.unread).toBe(0);

    await studentSession.auth(api().post('/api/notifications/broadcast')).send({ title: 'Nope' }).expect(403);
  });
});

describe('Validation & error handling', () => {
  it('returns structured validation errors', async () => {
    const instructor = await createUser({ role: 'instructor' });
    const session = await loginAs(instructor);
    const res = await session.auth(api().post('/api/courses')).send({ title: 'x' }).expect(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.some((d) => d.path === 'title')).toBe(true);
  });

  it('rejects payloads over the JSON limit', async () => {
    const res = await api()
      .post('/api/contact')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x', pad: 'a'.repeat(3 * 1024 * 1024) }));
    expect([400, 413]).toContain(res.status);
  });

  it('protects admin-only endpoints and self-demotion', async () => {
    const admin = await createUser({ role: 'admin' });
    const session = await loginAs(admin);
    await session.auth(api().patch(`/api/users/${admin.id}`)).send({ role: 'student' }).expect(400);
    await session.auth(api().patch(`/api/users/${admin.id}`)).send({ isActive: false }).expect(400);
    const users = await session.auth(api().get('/api/users?role=instructor')).expect(200);
    expect(Array.isArray(users.body.users)).toBe(true);
  });
});
