import { IncomingMessage, ServerResponse } from 'node:http';
import express from 'express';

const app = express();
app.use(express.json());
app.post('/test', (req, res) => {
  res.json({ receivedBody: req.body });
});

function testPreParsed() {
  const req = new IncomingMessage(null);
  req.method = 'POST';
  req.url = '/test';
  req.headers = { 'content-type': 'application/json' };
  req.body = { email: 'businesshead@careyu.ai' };

  const res = new ServerResponse(req);
  res.end = (chunk) => {
    console.log('Result with pre-parsed body ->', chunk?.toString());
  };

  req.push(null);
  app(req, res);
}

testPreParsed();
