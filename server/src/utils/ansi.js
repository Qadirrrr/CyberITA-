/**
 * Strip ANSI/VT100 escape sequences from terminal output so it can be stored
 * in history or matched against verification patterns.
 */
export function stripAnsi(value = '') {
  return String(value)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI sequences
    .replace(/\x1b[@-Z\\-_]/g, '') // other escapes
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}
