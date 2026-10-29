import { describe, expect, it } from 'vitest';
import {
  passwordError,
  validateChangePassword,
  validateContactForm,
  validateForgotPasswordForm,
  validateLoginForm,
  validateRegisterForm,
  validateResetPasswordForm,
} from './validation';

describe('password rules', () => {
  it('requires at least 8 characters with a letter and a number', () => {
    expect(passwordError('Short1')).toMatch(/at least 8/);
    expect(passwordError('abcdefgh')).toMatch(/number/);
    expect(passwordError('12345678')).toMatch(/letter/);
    expect(passwordError('Secret12')).toBe('');
  });
});

describe('auth forms', () => {
  it('validates login fields', () => {
    expect(validateLoginForm({ email: '', password: '' })).toMatchObject({
      email: 'Email is required.',
      password: 'Password is required.',
    });
    expect(validateLoginForm({ email: 'not-an-email', password: 'x' }).email).toMatch(/valid email/);
    expect(validateLoginForm({ email: 'you@example.com', password: 'x' })).toEqual({});
  });

  it('validates registration fields including terms and confirm', () => {
    const errors = validateRegisterForm({
      fullName: 'A',
      email: 'bad',
      password: 'short',
      confirm: 'other',
      accepted: false,
    });
    expect(errors.fullName).toMatch(/at least 2/);
    expect(errors.email).toMatch(/valid email/);
    expect(errors.password).toMatch(/at least 8/);
    expect(errors.confirm).toBe('Passwords do not match.');
    expect(errors.accepted).toMatch(/accept the terms/);
  });
});

describe('forgot and reset password forms', () => {
  it('requires a valid email to start a reset', () => {
    expect(validateForgotPasswordForm({ email: '' }).email).toMatch(/required/);
    expect(validateForgotPasswordForm({ email: 'nope' }).email).toMatch(/valid email/);
    expect(validateForgotPasswordForm({ email: 'you@example.com' })).toEqual({});
  });

  it('requires a token plus matching, strong passwords to finish a reset', () => {
    expect(validateResetPasswordForm({ password: '', confirm: '', token: '' })).toMatchObject({
      token: expect.stringMatching(/token/i),
      password: expect.stringMatching(/required|at least 8/),
    });
    expect(
      validateResetPasswordForm({ password: 'Secret12', confirm: 'Other123', token: 'abc' }).confirm
    ).toBe('Passwords do not match.');
    expect(validateResetPasswordForm({ password: 'Secret12', confirm: 'Secret12', token: 'abc' })).toEqual({});
  });
});

describe('contact and password change', () => {
  it('requires a 10 character contact message', () => {
    const errors = validateContactForm({ name: 'Alex', email: 'a@b.co', subject: '', message: 'too short' });
    expect(errors.subject).toMatch(/topic/);
    expect(errors.message).toMatch(/at least 10/);
  });

  it('rejects a new password that matches the current one', () => {
    const errors = validateChangePassword({
      currentPassword: 'Secret12',
      newPassword: 'Secret12',
      confirm: 'Secret12',
    });
    expect(errors.newPassword).toMatch(/different/);
  });
});
