import { initStore, replaceCollectionsFromPostgres, runWithoutPersisting, shutdownStore, store } from '../src/store/db.js';
import { DAILY_WORK_SYNC_COLLECTIONS } from '../src/lib/dailyStatus.js';
import { authenticateLogin, lookupLoginMode } from '../src/lib/authService.js';
import { env } from '../src/config/env.js';

function assert(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(name);
}

await initStore();
console.info('[verify-login-isolate] In-memory only after snapshot. Live Postgres will not be modified.');

await runWithoutPersisting(async () => {
  const before = store.getUsers().length;
  assert('users loaded from postgres', before > 0, `count=${before}`);

  await replaceCollectionsFromPostgres([...DAILY_WORK_SYNC_COLLECTIONS]);
  const afterDailySync = store.getUsers().length;
  assert(
    'Daily Work sync does not wipe users',
    afterDailySync === before && afterDailySync > 0,
    `before=${before} after=${afterDailySync}`
  );

  await replaceCollectionsFromPostgres(['users', 'pendingSignups']);
  const afterAuthSync = store.getUsers().length;
  assert('auth reload still has users', afterAuthSync > 0, `count=${afterAuthSync}`);

  const emails = ['robotlead1@careyu.ai', 'robottech@careyu.ai', 'kabitha@careyu.ai', 'fsdengg1@careyu.ai'];
  for (const email of emails) {
    const mode = lookupLoginMode(email);
    const user =
      store.findUserByEmail(email) ||
      (email === 'robotlead1@careyu.ai' ? store.findUserByEmail('robottech@careyu.ai') : undefined);
    if (!user && email !== 'robotlead1@careyu.ai') continue;
    assert(`${email} login mode resolved`, Boolean(mode.loginMode), mode.loginMode);
  }

  const robotLogin = await authenticateLogin({ email: 'robotlead1@careyu.ai', password: env.robotLeadPassword });
  const demoLogin = robotLogin.ok
    ? robotLogin
    : await authenticateLogin({ email: 'robotlead1@careyu.ai', password: env.demoPassword });
  assert(
    'robotlead1 can authenticate with configured password',
    demoLogin.ok,
    demoLogin.ok ? demoLogin.user.email : ('message' in demoLogin ? demoLogin.message : 'failed')
  );
});

await shutdownStore();
console.log('login isolate checks passed');
