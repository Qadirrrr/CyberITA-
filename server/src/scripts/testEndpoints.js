import supertest from 'supertest';
import { createApp } from '../app.js';
import { signAccessToken } from '../services/authService.js';
import { query } from '../config/db.js';

async function main() {
  const app = createApp();

  const { rows: users } = await query('SELECT id, role, email FROM users');
  console.log('Available users:', users);

  for (const user of users) {
    const token = signAccessToken(user);
    console.log(`\n--- Testing user ${user.id} (${user.role}: ${user.email}) ---`);

    const resOverview = await supertest(app)
      .get('/api/instructor/overview')
      .set('Authorization', `Bearer ${token}`);
    console.log(`GET /api/instructor/overview -> status: ${resOverview.status}`);
    if (resOverview.status !== 200) {
      console.log('Response body:', resOverview.body);
    }
  }

  const resUnauth = await supertest(app).get('/api/instructor/overview');
  console.log(`\nUnauth GET /api/instructor/overview -> status: ${resUnauth.status}`, resUnauth.body);

  const resRefresh = await supertest(app).post('/api/auth/refresh');
  console.log(`\nPOST /api/auth/refresh (without cookie) -> status: ${resRefresh.status}`, resRefresh.body);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

