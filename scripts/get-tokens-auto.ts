#!/usr/bin/env npx tsx
/**
 * OAuth Token Helper Script (Auto version)
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx npx tsx scripts/get-tokens-auto.ts
 */

import { OAuth2Client } from 'google-auth-library';
import * as http from 'http';
import * as url from 'url';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required.');
    process.exit(1);
  }

  console.log('\n===========================================');
  console.log('Gmail OAuth Token Helper');
  console.log('===========================================\n');

  const redirectUri = 'http://localhost:3333/oauth2callback';
  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  // Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('Opening browser for authorization...\n');
  console.log('If browser doesn\'t open, visit this URL manually:');
  console.log(authUrl);
  console.log('');

  // Try to open browser
  const open = (await import('open')).default;
  try {
    await open(authUrl);
  } catch {
    console.log('Could not open browser automatically.');
  }

  // Start local server to receive the callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);

        if (parsedUrl.pathname === '/oauth2callback') {
          const code = parsedUrl.query.code as string;

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1>✅ Authorization Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                </body>
              </html>
            `);
            server.close();
            resolve(code);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Authorization Failed</h1>
                  <p>No authorization code received.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('No authorization code received'));
          }
        }
      } catch (error) {
        reject(error);
      }
    });

    server.listen(3333, () => {
      console.log('Waiting for authorization callback on http://localhost:3333...\n');
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out'));
    }, 5 * 60 * 1000);
  });

  console.log('Exchanging authorization code for tokens...\n');
  const { tokens } = await oauth2Client.getToken(code);

  console.log('===========================================');
  console.log('SUCCESS! Here are your tokens:');
  console.log('===========================================\n');

  console.log('Add these environment variables to Railway:\n');
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);

  if (tokens.refresh_token) {
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } else {
    console.log('\n⚠️  WARNING: No refresh token received.');
    console.log('Try revoking access at https://myaccount.google.com/permissions');
  }

  if (tokens.access_token) {
    console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);
  }

  console.log('\n===========================================\n');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
