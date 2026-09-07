async function testCloudflareLogin() {
  const url = 'https://careyu-backend-api.aicareyuautomation.workers.dev/api/auth/login';
  console.log('Testing login to Cloudflare Worker:', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://careyu-frontend.pages.dev'
    },
    body: JSON.stringify({
      email: 'businesshead@careyu.ai',
      password: 'Careyu@9865'
    })
  });
  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}

testCloudflareLogin();
