import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { api, createUser, loginAs, createCourseFor, enroll } from './helpers.js';
import { createApp } from '../src/app.js';
import { initWebSocket } from '../src/websocket/index.js';

let server;
let wss;
let baseUrl;

beforeAll(async () => {
  server = http.createServer(createApp());
  wss = initWebSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `ws://127.0.0.1:${server.address().port}/ws`;
});

afterAll(async () => {
  for (const client of wss.clients) client.terminate();
  await new Promise((resolve) => wss.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

function connect(token) {
  const socket = new WebSocket(`${baseUrl}?token=${encodeURIComponent(token)}`);
  const messages = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].type === message.type) {
        waiters[index].resolve(message);
        waiters.splice(index, 1);
      }
    }
  });
  const waitFor = (type, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const existing = messages.find((message) => message.type === type);
      if (existing) return resolve(existing);
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
      waiters.push({
        type,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  const open = new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return { socket, messages, waitFor, open };
}

describe('WebSocket lab terminal', () => {
  it('authenticates, attaches to an owned session and executes commands in real time', async () => {
    const instructor = await createUser({ role: 'instructor', fullName: 'WS Instructor' });
    const instructorSession = await loginAs(instructor);
    const student = await createUser({ fullName: 'WS Student' });
    const studentSession = await loginAs(student);
    const course = await createCourseFor(instructorSession.token, { title: 'WebSocket Course' });
    await enroll(studentSession.token, course.id);

    const labRes = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'WebSocket Lab', courseId: course.id, status: 'published' })
      .expect(201);
    const lab = labRes.body.lab;
    await instructorSession
      .auth(api().post(`/api/labs/${lab.id}/steps`))
      .send({ title: 'Print cwd', instruction: 'Run pwd', expectedCommand: 'pwd' })
      .expect(201);

    const sessionRes = await studentSession.auth(api().post(`/api/labs/${lab.id}/sessions`)).expect(201);
    const sessionId = sessionRes.body.session.id;

    const client = connect(studentSession.token);
    await client.open;
    const ready = await client.waitFor('ready');
    expect(String(ready.user.id)).toBe(String(student.id));

    client.socket.send(JSON.stringify({ type: 'lab.attach', sessionId }));
    const attached = await client.waitFor('lab.attached');
    expect(String(attached.sessionId)).toBe(String(sessionId));
    expect(attached.cwd).toBe('/home/student');

    client.socket.send(JSON.stringify({ type: 'lab.exec', sessionId, command: 'pwd' }));
    const output = await client.waitFor('lab.output');
    expect(String(output.sessionId)).toBe(String(sessionId));
    expect(output.exitCode).toBe(0);
    expect(output.output).toContain('/home/student');

    const progress = await client.waitFor('lab.progress');
    expect(progress.completedSteps.map((step) => step.title)).toContain('Print cwd');

    client.socket.close();
  });

  it('rejects unauthenticated and cross-user terminal access', async () => {
    const anonymous = new WebSocket(baseUrl);
    const close = await new Promise((resolve) => anonymous.once('close', resolve));
    expect(close).toBe(4001);

    const owner = await createUser({ fullName: 'Owner Student' });
    const ownerSession = await loginAs(owner);
    const intruder = await createUser({ fullName: 'Intruder Student' });
    const intruderSession = await loginAs(intruder);
    const instructor = await createUser({ role: 'instructor' });
    const instructorSession = await loginAs(instructor);
    const course = await createCourseFor(instructorSession.token, { title: 'Private WS Course' });
    await enroll(ownerSession.token, course.id);
    const labRes = await instructorSession
      .auth(api().post('/api/labs'))
      .send({ title: 'Private WS Lab', courseId: course.id, status: 'published' })
      .expect(201);
    await instructorSession
      .auth(api().post(`/api/labs/${labRes.body.lab.id}/steps`))
      .send({ title: 'Step', instruction: 'Run pwd', expectedCommand: 'pwd' })
      .expect(201);
    const sessionRes = await ownerSession.auth(api().post(`/api/labs/${labRes.body.lab.id}/sessions`)).expect(201);

    const client = connect(intruderSession.token);
    await client.open;
    await client.waitFor('ready');
    client.socket.send(JSON.stringify({ type: 'lab.attach', sessionId: sessionRes.body.session.id }));
    const error = await client.waitFor('error');
    expect(error.message).toMatch(/access|owner/i);
    client.socket.close();
  });
});
