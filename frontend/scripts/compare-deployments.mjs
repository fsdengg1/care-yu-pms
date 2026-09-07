const urls = [
  ['stable', 'https://careyu-frontend.pages.dev'],
  ['414ccae5', 'https://414ccae5.careyu-frontend.pages.dev'],
  ['8108bdc6', 'https://8108bdc6.careyu-frontend.pages.dev'],
];

for (const [label, base] of urls) {
  const health = await fetch(`${base}/api/health`);
  const ht = health.headers.get('content-type') || '';
  const hb = ht.includes('json') ? JSON.stringify(await health.json()) : (await health.text()).slice(0, 80);

  const login = await fetch(`${base}/login`);
  const html = await login.text();
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[a-z0-9_-]+\.js/g)].map((m) => m[0]).slice(0, 5);
  const buildId = html.match(/"b":"([^"]+)"/)?.[1] || html.match(/buildId":"([^"]+)"/)?.[1] || 'unknown';

  let redirects = 'unavailable';
  try {
    const rr = await fetch(`${base}/_redirects`);
    redirects = (await rr.text()).split('\n').slice(0, 3).join(' | ');
  } catch {
    // ignore
  }

  const hasProjectsDetail = redirects.includes('projects/detail');
  const hasLoginCatchall = redirects.includes('/login/index.html');

  console.log(`\n=== ${label} (${base}) ===`);
  console.log('health:', health.status, hb);
  console.log('build marker:', buildId);
  console.log('chunks:', chunks.join(', '));
  console.log('redirects:', redirects);
  console.log('has projects/detail redirect:', hasProjectsDetail);
  console.log('has login catchall:', hasLoginCatchall);
  console.log('cf-ray:', login.headers.get('cf-ray'));
  console.log('cache-control login:', login.headers.get('cache-control'));
}
