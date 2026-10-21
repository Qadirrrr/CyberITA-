import { describe, it, expect } from 'vitest';
import { MockShell } from '../src/labs/mock/mockShell.js';
import { defaultFs } from '../src/labs/mock/virtualFs.js';
import { extraCourses } from '../src/db/seedCatalog.js';

const shell = () => new MockShell({ fsState: defaultFs(), cwd: '/home/student' });

describe('Mock shell network commands', () => {
  it('uses the destination rather than the ping count as the target', () => {
    const output = shell().execute('ping -c 2 10.0.15.1').output;
    expect(output).toContain('PING 10.0.15.1');
    expect(output).toContain('2 packets transmitted');
    expect(output).not.toContain('PING 2');
    expect(output).toMatch(/93\.184\.\d{1,3}\.\d{1,3}/);
    expect(output).not.toMatch(/93\.184\.-\d/);
  });

  it('returns a realistic 404 for a missing web path', () => {
    const result = shell().execute('curl http://localhost/404');
    expect(result.exitCode).toBe(22);
    expect(result.output).toContain('404');
  });

  it('runs every command step in the extended labs', () => {
    for (const course of extraCourses) {
      const lab = course.lab;
      const terminal = new MockShell({ fsState: lab.files, cwd: '/home/student', welcome: lab.welcome });
      for (const step of lab.steps) {
        if (!step.command) continue;
        const result = terminal.execute(step.command);
        if (step.command.includes('/404')) {
          expect(result.exitCode, `${lab.slug}: ${step.command}`).toBe(22);
        } else {
          expect(result.exitCode, `${lab.slug}: ${step.command}`).toBe(0);
        }
        if (!step.command.includes('>')) {
          expect((result.output || '').length, `${lab.slug}: ${step.command}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
