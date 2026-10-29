import { describe, it, expect } from 'vitest';
import { MockShell } from './support/lab-mock/mockShell.js';
import { defaultFs } from './support/lab-mock/virtualFs.js';

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
});
