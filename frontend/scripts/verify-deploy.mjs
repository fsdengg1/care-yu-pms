async function verify() {
  console.log('Testing Cloudflare deployment...');
  
  // 1. Backend Health
  try {
    const bRes = await fetch('https://careyu-backend-api.aicareyuautomation.workers.dev/api/health');
    const bJson = await bRes.json();
    console.log('Backend API Health [GET /api/health]:', bRes.status, JSON.stringify(bJson));
  } catch (err) {
    console.error('Backend Health Error:', err.message);
  }

  // 2. Frontend HTML Pages
  const routes = ['/', '/login', '/projects', '/daily-updates', '/admin/users'];
  for (const route of routes) {
    try {
      const res = await fetch(`https://careyu-frontend.pages.dev${route}`);
      console.log(`Frontend Route [${route}]:`, res.status, res.headers.get('content-type'));
    } catch (err) {
      console.error(`Route ${route} Error:`, err.message);
    }
  }

  // 3. Frontend Static Assets
  try {
    const html = await (await fetch('https://careyu-frontend.pages.dev/login')).text();
    const scriptMatch = html.match(/src="(\/_next\/static\/chunks\/[^"]+)"/);
    if (scriptMatch) {
      const scriptUrl = 'https://careyu-frontend.pages.dev' + scriptMatch[1];
      const sRes = await fetch(scriptUrl);
      console.log('Static JS Asset:', scriptMatch[1]);
      console.log('Asset Response Status:', sRes.status, 'Content-Type:', sRes.headers.get('content-type'));
    }
  } catch (err) {
    console.error('Asset Check Error:', err.message);
  }
}

verify();
