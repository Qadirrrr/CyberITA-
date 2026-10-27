import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, createCourseFor, enroll } from './helpers.js';

async function setupChat() {
  const instructor = await createUser({ role: 'instructor', fullName: 'Chat Instructor' });
  const instructorSession = await loginAs(instructor);
  const student = await createUser({ fullName: 'Chat Student' });
  const studentSession = await loginAs(student);
  const course = await createCourseFor(instructorSession.token, { title: 'Chat Support Course' });
  await enroll(studentSession.token, course.id);
  return { instructor, instructorSession, student, studentSession, course };
}

describe('Student and instructor messaging', () => {
  it('lists permitted contacts and prevents unrelated users from messaging', async () => {
    const { instructor, studentSession, instructorSession } = await setupChat();

    const studentContacts = await studentSession.auth(api().get('/api/messages/contacts')).expect(200);
    expect(studentContacts.body.contacts).toHaveLength(1);
    expect(studentContacts.body.contacts[0]).toMatchObject({
      id: instructor.id,
      full_name: 'Chat Instructor',
      role: 'instructor',
      conversation_id: null,
    });
    expect(studentContacts.body.contacts[0].courses).toHaveLength(1);

    const instructorContacts = await instructorSession.auth(api().get('/api/messages/contacts')).expect(200);
    expect(instructorContacts.body.contacts).toHaveLength(1);
    expect(instructorContacts.body.contacts[0].full_name).toBe('Chat Student');

    const outsider = await createUser({ fullName: 'No Course Student' });
    const outsiderSession = await loginAs(outsider);
    await outsiderSession
      .auth(api().post('/api/messages/conversations'))
      .send({ peerId: instructor.id })
      .expect(403);
    const outsiderContacts = await outsiderSession.auth(api().get('/api/messages/contacts')).expect(200);
    expect(outsiderContacts.body.contacts).toHaveLength(0);
  });

  it('creates one conversation per pair, sends messages, tracks unread state and replies', async () => {
    const { instructor, instructorSession, student, studentSession, course } = await setupChat();

    const created = await studentSession
      .auth(api().post('/api/messages/conversations'))
      .send({ peerId: instructor.id, courseId: course.id })
      .expect(201);
    expect(created.body.created).toBe(true);
    const conversationId = created.body.conversation.id;
    expect(created.body.conversation.peer.id).toBe(instructor.id);

    const duplicate = await studentSession
      .auth(api().post('/api/messages/conversations'))
      .send({ peerId: instructor.id, courseId: course.id })
      .expect(200);
    expect(duplicate.body.created).toBe(false);
    expect(duplicate.body.conversation.id).toBe(conversationId);

    const sent = await studentSession
      .auth(api().post(`/api/messages/conversations/${conversationId}/messages`))
      .send({ body: 'Could you explain the lab firewall step?' })
      .expect(201);
    expect(sent.body.message).toMatchObject({
      conversation_id: conversationId,
      sender_id: student.id,
      body: 'Could you explain the lab firewall step?',
      attachment_path: null,
    });

    const studentUnread = await studentSession.auth(api().get('/api/messages/unread-count')).expect(200);
    expect(studentUnread.body.unread).toBe(0);

    const instructorUnread = await instructorSession.auth(api().get('/api/messages/unread-count')).expect(200);
    expect(instructorUnread.body.unread).toBe(1);

    const inbox = await instructorSession.auth(api().get('/api/messages/conversations')).expect(200);
    expect(inbox.body.conversations).toHaveLength(1);
    expect(inbox.body.conversations[0]).toMatchObject({
      id: conversationId,
      course_title: 'Chat Support Course',
      unread: 1,
    });
    expect(inbox.body.conversations[0].peer.full_name).toBe('Chat Student');

    const received = await instructorSession
      .auth(api().get(`/api/messages/conversations/${conversationId}/messages`))
      .expect(200);
    expect(received.body.messages).toHaveLength(1);
    expect(received.body.messages[0].body).toBe('Could you explain the lab firewall step?');

    const readUnread = await instructorSession.auth(api().get('/api/messages/unread-count')).expect(200);
    expect(readUnread.body.unread).toBe(0);

    await instructorSession
      .auth(api().post(`/api/messages/conversations/${conversationId}/messages`))
      .send({ body: 'Open the firewall lab and follow step 3.' })
      .expect(201);

    const studentUnreadAgain = await studentSession.auth(api().get('/api/messages/unread-count')).expect(200);
    expect(studentUnreadAgain.body.unread).toBe(1);

    const studentThread = await studentSession
      .auth(api().get(`/api/messages/conversations/${conversationId}/messages`))
      .expect(200);
    expect(studentThread.body.messages).toHaveLength(2);
    expect(studentThread.body.messages[1].body).toBe('Open the firewall lab and follow step 3.');
    expect(studentThread.body.messages[0].read_at).toBeTruthy();

    const outsider = await createUser({ fullName: 'Unrelated User' });
    const outsiderSession = await loginAs(outsider);
    await outsiderSession
      .auth(api().get(`/api/messages/conversations/${conversationId}/messages`))
      .expect(403);
  });

  it('accepts document attachments and rejects unsupported files', async () => {
    const { instructor, studentSession } = await setupChat();
    const conversation = await studentSession
      .auth(api().post('/api/messages/conversations'))
      .send({ peerId: instructor.id })
      .expect(201);
    const conversationId = conversation.body.conversation.id;

    const withAttachment = await studentSession
      .auth(api().post(`/api/messages/conversations/${conversationId}/messages`))
      .field('body', 'Screenshot attached.')
      .attach('file', Buffer.from('fake png bytes'), { filename: 'evidence.png', contentType: 'image/png' })
      .expect(201);
    expect(withAttachment.body.message.attachment_path).toMatch(/^\/uploads\/msg-/);
    expect(withAttachment.body.message.attachment_name).toBe('evidence.png');
    expect(withAttachment.body.message.attachment_size).toBeGreaterThan(0);

    await studentSession
      .auth(api().post(`/api/messages/conversations/${conversationId}/messages`))
      .field('body', 'Not allowed.')
      .attach('file', Buffer.from('script'), { filename: 'payload.exe', contentType: 'application/octet-stream' })
      .expect(400);
  });
});
