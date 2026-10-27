import { describe, it, expect } from 'vitest';
import { studentIdentity } from '../src/labs/identity.js';

describe('studentIdentity', () => {
  it('builds a shell name from the learner name', () => {
    expect(studentIdentity({ id: 3, full_name: 'Saif Khan' })).toEqual({
      studentId: '3',
      displayName: 'Saif Khan',
      shellUser: 'saif',
      hostname: 'cyberita-lab',
      prompt: 'saif@cyberita-lab',
    });
  });

  it('sanitizes separators and leading digits', () => {
    expect(studentIdentity({ id: 8, full_name: '  Ahmed_ALI  ' })).toMatchObject({
      shellUser: 'ahmed',
      displayName: 'Ahmed_ALI',
    });
    expect(studentIdentity({ id: 9, full_name: 'Zara-Bibi' }).shellUser).toBe('zara');
    expect(studentIdentity({ id: 10, full_name: '123 Student' }).shellUser).toBe('u123');
  });

  it('falls back to the student id for non-ASCII or reserved names', () => {
    expect(studentIdentity({ id: 12, full_name: 'سيف' })).toMatchObject({
      shellUser: 'student-12',
      displayName: 'سيف',
      studentId: '12',
    });
    expect(studentIdentity({ id: 13, full_name: 'root' }).shellUser).toBe('student-13');
    expect(studentIdentity({ id: 14, full_name: 'Student' }).shellUser).toBe('student-14');
  });

  it('never emits characters that break passwd, hostname or the prompt', () => {
    const identity = studentIdentity({ id: 21, full_name: "O'Brien:$(whoami)\nrm -rf /" });
    expect(identity.shellUser).toMatch(/^[a-z0-9_-]+$/);
    expect(identity.hostname).toBe('cyberita-lab');
    expect(identity.displayName).not.toContain('\n');
  });
});
