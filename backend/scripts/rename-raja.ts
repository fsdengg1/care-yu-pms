import { initStore, shutdownStore, store } from '../src/store/db.js';
import { ensureLiveDirectory } from '../src/lib/directoryRoles.js';

async function main() {
  await initStore();
  const before = store.findUserByEmail('raja@careyu.ai');
  console.log('Before:', before ? { id: before.id, name: before.name, role: before.role_code } : 'NOT_FOUND');

  await ensureLiveDirectory();

  const after = store.findUserByEmail('raja@careyu.ai');
  console.log('After:', after ? { id: after.id, name: after.name, role: after.role_code } : 'NOT_FOUND');
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
