import { app, initializeBackend } from './index.js';
import { env } from './config/env.js';
import { shutdownStore } from './store/db.js';
import { startNotificationScheduler } from './lib/reminderJob.js';
import { startEmailReportScheduler } from './lib/emailReportJob.js';

async function start() {
  console.log('Starting CareYu backend...');
  console.log(`[boot] NODE_ENV=${env.nodeEnv} PORT=${env.port} databaseSsl=${env.databaseSsl}`);

  await initializeBackend();
  startNotificationScheduler();
  startEmailReportScheduler();

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`Careyu backend listening on 0.0.0.0:${env.port}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${env.port} is already in use by another application. Stop that process or set PORT in backend/.env to a free port.`
      );
      process.exit(1);
    }
    throw error;
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await shutdownStore();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
