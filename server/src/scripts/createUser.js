import { parseArgs } from 'node:util';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { hashPassword } from '../services/authService.js';
import { generateTemporaryPassword } from '../utils/helpers.js';
import { emailSchema, fullNameSchema, passwordSchema } from '../utils/validation.js';

const roleSchema = z.enum(['admin', 'instructor', 'student'], {
  errorMap: () => ({ message: 'Role must be admin, instructor or student.' }),
});

function usage() {
  console.log(`Create an authenticated CyberITA+ account.

Usage:
  npm run user:create -- --email <email> --name <full name> --role <admin|instructor|student> [--password <password>]

Options:
  --email     Account email address (required)
  --name      Full name (required)
  --role      admin, instructor or student (required)
  --password  Password; omitted means a secure password is generated
  --help      Show this help

Examples:
  npm run user:create -- --email admin@example.com --name "Platform Admin" --role admin
  npm run user:create -- --email tutor@example.com --name "Course Tutor" --role instructor`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string' },
        password: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    fail(error.message);
    usage();
    return;
  }

  if (values.help) {
    usage();
    return;
  }

  const schema = z.object({
    email: emailSchema,
    name: fullNameSchema,
    role: roleSchema,
    password: passwordSchema,
  });

  const generatedPassword = values.password ? null : generateTemporaryPassword();
  const parsed = schema.safeParse({
    email: values.email,
    name: values.name,
    role: values.role,
    password: values.password || generatedPassword,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(issue.message);
    }
    return;
  }

  const { email, name, role, password } = parsed.data;
  const existing = await query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rows.length > 0) {
    fail(`An account with email ${email} already exists.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id, email, full_name, role, created_at`,
    [email.toLowerCase(), passwordHash, name, role]
  );

  const user = rows[0];
  console.log(`Created ${user.role} account: ${user.email} (id ${user.id})`);
  if (generatedPassword) {
    console.log(`Generated password: ${generatedPassword}`);
    console.log('Store this password securely. It will not be shown again.');
  }
}

main()
  .catch((error) => {
    if (error?.code === '23505') {
      fail('An account with this email already exists.');
    } else {
      fail(error.message || 'Unable to create the account.');
    }
  })
  .finally(async () => {
    await pool.end();
  });
