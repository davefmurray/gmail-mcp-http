#!/usr/bin/env npx tsx
/**
 * OAuth Token Helper Script
 *
 * Run this locally to obtain refresh tokens for your Gmail account.
 * The refresh token can then be used as an environment variable on Railway.
 *
 * Prerequisites:
 * 1. Create a Google Cloud project at https://console.cloud.google.com
 * 2. Enable the Gmail API
 * 3. Create OAuth 2.0 credentials (Desktop app type)
 * 4. Download the credentials JSON
 *
 * Usage:
 *   npx tsx scripts/get-tokens.ts
 *
 * You'll be prompted to enter your Client ID and Client Secret,
 * then a browser will open for authorization.
 */

import { OAuth2Client } from 'google-auth-library';
import * as http from 'http';
import * as url from 'url';
import * as readline from 'readline';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('\n===========================================');
  console.log('Gmail OAuth Token Helper');
  console.log('===========================================\n');

  console.log('This script will help you obtain OAuth tokens for your Gmail account.');
  console.log('You will need your Google Cloud OAuth credentials.\n');

  console.log('If you don\'t have credentials yet:');
  console.log('1. Go to https://console.cloud.google.com');
  console.log('2. Create a new project or select existing');
  console.log('3. Enable the Gmail API');
  console.log('4. Go to Credentials > Create Credentials > OAuth client ID');
  console.log('5. Choose "Desktop app" as application type');
  console.log('6. Copy the Client ID and Client Secret\n');

  const clientId = await question('Enter your Google Client ID: ');
  const clientSecret = await question('Enter your Google Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('Error: Both Client ID and Client Secret are required.');
    process.exit(1);
  }

  const redirectUri = 'http://localhost:3333/oauth2callback';
  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  // Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to ensure refresh token is returned
  });

  console.log('\n===========================================');
  console.log('Opening browser for authorization...');
  console.log('===========================================\n');

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

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out'));
    }, 5 * 60 * 1000);
  });

  // Exchange code for tokens
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
    console.log('This can happen if you\'ve already authorized this app before.');
    console.log('Try revoking access at https://myaccount.google.com/permissions');
    console.log('Then run this script again.\n');
  }

  if (tokens.access_token) {
    console.log(`GOOGLE_ACCESS_TOKEN=${tokens.access_token}`);
    console.log('\n(Access token is optional - it will be auto-refreshed)');
  }

  console.log('\n===========================================');
  console.log('IMPORTANT: Keep your refresh token secure!');
  console.log('Anyone with this token can access your Gmail.');
  console.log('===========================================\n');

  rl.close();
}

main().catch((error) => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
