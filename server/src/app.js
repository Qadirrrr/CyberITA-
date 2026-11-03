import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import courseRoutes from './routes/courses.js';
import enrollmentRoutes from './routes/enrollment.js';
import labRoutes from './routes/labs.js';
import reportRoutes from './routes/reports.js';
import postRoutes from './routes/posts.js';
import notificationRoutes from './routes/notifications.js';
import contactRoutes from './routes/contact.js';
import certificateRoutes from './routes/certificates.js';
import statsRoutes from './routes/stats.js';
import learningPathRoutes from './routes/learningPaths.js';
import navRoutes from './routes/nav.js';
import adminRoutes from './routes/admin.js';
import messageRoutes from './routes/messages.js';
import studentRoutes from './routes/student.js';
import instructorRoutes from './routes/instructor.js';
import contentReportRoutes from './routes/contentReports.js';
import contentRoutes from './routes/content.js';
import labSubmissionRoutes from './routes/labSubmissions.js';
import projectRoutes from './routes/projects.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Static uploads (lab screenshots / assignment files)
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir, { maxAge: env.isProduction ? '7d' : 0, dotfiles: 'deny' }));

  // Health / readiness
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', name: 'CyberITA+ API', env: env.nodeEnv, time: new Date().toISOString() });
  });

  // Global (optional) authentication, req.user is set when a valid token exists
  app.use('/api', authenticate);

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api', enrollmentRoutes);
  app.use('/api/labs', labRoutes);
  app.use('/api/lab-submissions', labSubmissionRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/certificates', certificateRoutes);
  app.use('/api/learning-paths', learningPathRoutes);
  app.use('/api/nav', navRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/content-reports', contentReportRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/instructor', instructorRoutes);
  app.use('/api', studentRoutes);
  app.use('/api', statsRoutes);

  // Serve the built frontend in production (single-origin deployment)
  const clientDist = path.resolve(process.cwd(), '..', 'client', 'dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res, next) => {
      res.sendFile(path.join(clientDist, 'index.html'), (error) => error && next(error));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
