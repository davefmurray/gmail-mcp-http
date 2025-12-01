import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

// Environment variable schema
const envSchema = z.object({
  // OAuth Client credentials (from Google Cloud Console)
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),

  // OAuth tokens (obtained after user authorization)
  GOOGLE_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().min(1, 'GOOGLE_REFRESH_TOKEN is required'),

  // Server config
  PORT: z.string().default('3000'),
  API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnvConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Environment configuration error:\n${errors}`);
  }

  return result.data;
}

export function createOAuth2Client(config: EnvConfig): OAuth2Client {
  const oauth2Client = new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback' // Not used for refresh, but required
  );

  // Set the credentials from environment variables
  oauth2Client.setCredentials({
    access_token: config.GOOGLE_ACCESS_TOKEN,
    refresh_token: config.GOOGLE_REFRESH_TOKEN,
    token_type: 'Bearer',
  });

  // Set up automatic token refresh
  oauth2Client.on('tokens', (tokens) => {
    console.log('Tokens refreshed:', tokens.access_token ? 'New access token received' : 'No new access token');
    if (tokens.access_token) {
      oauth2Client.setCredentials({
        ...oauth2Client.credentials,
        access_token: tokens.access_token,
      });
    }
  });

  return oauth2Client;
}
