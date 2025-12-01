# Gmail MCP HTTP Server

HTTP REST API server for Gmail integration - deployable to Railway, Render, or any cloud platform.

## Features

- **REST API endpoints** for all Gmail operations
- **OAuth2 authentication** via environment variables
- **API key protection** for production deployments
- **Slack-friendly** `/api/call` endpoint for bot integrations
- **Docker ready** for cloud deployment

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/tools` | List available tools |
| GET | `/api/emails` | List emails (optional `?q=query&maxResults=10`) |
| GET | `/api/emails/:id` | Get single email |
| POST | `/api/emails/search` | Search emails |
| POST | `/api/emails/send` | Send email |
| GET | `/api/labels` | Get all labels |
| PUT | `/api/emails/:id/labels` | Modify email labels |
| POST | `/api/emails/:id/read` | Mark as read |
| POST | `/api/emails/:id/unread` | Mark as unread |
| DELETE | `/api/emails/:id` | Move to trash |
| POST | `/api/call` | Generic tool call (for Slack bots) |

## Setup

### 1. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the Gmail API
4. Go to **Credentials > Create Credentials > OAuth client ID**
5. Choose **Desktop app** as application type
6. Download or copy the Client ID and Client Secret

### 2. Get Refresh Token

Run the helper script locally:

```bash
npm install
npx tsx scripts/get-tokens.ts
```

This will open a browser for you to authorize the app and give you the refresh token.

### 3. Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

Set these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | OAuth refresh token |
| `API_KEY` | Recommended | API key for authentication |
| `PORT` | No | Server port (default: 3000) |

## API Usage

### Authentication

If `API_KEY` is set, include it in requests:

```bash
curl -H "x-api-key: your-api-key" https://your-app.railway.app/api/emails
```

### List Emails

```bash
curl -H "x-api-key: $API_KEY" "https://your-app.railway.app/api/emails?maxResults=5"
```

### Search Emails

```bash
curl -X POST \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "from:example@gmail.com", "maxResults": 10}' \
  "https://your-app.railway.app/api/emails/search"
```

### Send Email

```bash
curl -X POST \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to": ["recipient@example.com"], "subject": "Hello", "body": "Hello World!"}' \
  "https://your-app.railway.app/api/emails/send"
```

### Generic Tool Call (for Slack bots)

```bash
curl -X POST \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_emails", "arguments": {"maxResults": 5}}' \
  "https://your-app.railway.app/api/call"
```

Available tools for `/api/call`:
- `list_emails` - List emails
- `get_email` - Get single email (requires `messageId`)
- `search_emails` - Search emails (requires `query`)
- `send_email` - Send email (requires `to`, `subject`, `body`)
- `get_labels` - Get all labels
- `modify_email` - Modify labels (requires `messageId`)
- `mark_read` - Mark as read (requires `messageId`)
- `mark_unread` - Mark as unread (requires `messageId`)
- `trash_email` - Move to trash (requires `messageId`)

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run production build
npm start
```

## License

MIT
