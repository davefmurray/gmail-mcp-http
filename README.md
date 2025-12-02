# Gmail HTTP API 📬

HTTP REST API server for Gmail integration - deployable to Railway, Render, or any cloud platform. This service provides a simple REST interface to Gmail, accepting OAuth credentials via environment variables.

## Features

- 🔐 **OAuth via Environment Variables** - No file-based credential storage
- 🔄 **Automatic Token Refresh** - Handles token expiration automatically
- 🛡️ **API Key Protection** - Secure your endpoints in production
- 📧 **Full Gmail Operations** - List, search, send, reply, forward, drafts, and more
- 📎 **Attachment Support** - Download email attachments
- 🧵 **Thread Support** - Get full email conversations
- ✉️ **Draft Management** - Create, update, and send drafts
- 🏖️ **Vacation Responder** - Configure auto-reply settings
- 🐳 **Docker Ready** - Deploy anywhere with Docker support
- 🤖 **Bot-Friendly** - Generic `/api/call` endpoint for integrations

## Quick Start

### 1. Get OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable the **Gmail API**
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Choose **Desktop app** as the application type
6. Download/copy the Client ID and Client Secret

### 2. Get Refresh Token

```bash
# Clone and install
git clone https://github.com/davefmurray/gmail-mcp-http.git
cd gmail-mcp-http
npm install

# Run the token helper
npx tsx scripts/get-tokens.ts
```

This opens a browser for authorization and outputs your refresh token.

### 3. Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

Set these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth Client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth Client Secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | Refresh token from step 2 |
| `API_KEY` | Recommended | API key for endpoint authentication |
| `PORT` | No | Server port (default: 3000) |

## API Reference

### Authentication

If `API_KEY` is configured, include it in all requests:

```bash
curl -H "x-api-key: your-api-key" https://your-app.railway.app/api/emails
```

### Endpoints

#### Health Check
```http
GET /health
```

#### List Available Tools
```http
GET /api/tools
```

#### List Emails
```http
GET /api/emails?maxResults=10&q=from:someone@example.com
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxResults` | number | 10 | Number of emails to return |
| `q` | string | - | Gmail search query |

#### Get Single Email
```http
GET /api/emails/:id
```

#### Search Emails
```http
POST /api/emails/search
Content-Type: application/json

{
  "query": "from:boss@company.com is:unread",
  "maxResults": 10
}
```

#### Send Email
```http
POST /api/emails/send
Content-Type: application/json

{
  "to": ["recipient@example.com"],
  "subject": "Hello",
  "body": "Plain text body",
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "htmlBody": "<h1>HTML body</h1>"
}
```

#### Get Labels
```http
GET /api/labels
```

#### Modify Email Labels
```http
PUT /api/emails/:id/labels
Content-Type: application/json

{
  "addLabelIds": ["STARRED"],
  "removeLabelIds": ["UNREAD"]
}
```

#### Mark as Read
```http
POST /api/emails/:id/read
```

#### Mark as Unread
```http
POST /api/emails/:id/unread
```

#### Trash Email
```http
DELETE /api/emails/:id
```

#### Restore from Trash
```http
POST /api/emails/:id/untrash
```

#### Permanently Delete Email
```http
DELETE /api/emails/:id/permanent
```

#### Reply to Email
```http
POST /api/emails/:id/reply
Content-Type: application/json

{
  "body": "Thanks for your message!",
  "htmlBody": "<p>Thanks for your message!</p>",
  "replyAll": false
}
```

#### Forward Email
```http
POST /api/emails/:id/forward
Content-Type: application/json

{
  "to": ["recipient@example.com"],
  "body": "FYI - see below",
  "cc": ["cc@example.com"]
}
```

#### Get Email Thread
```http
GET /api/threads/:id
```

Returns all messages in a conversation thread.

#### Get Unread Count
```http
GET /api/emails/unread/count
```

#### Get Email with Attachments
```http
GET /api/emails/:id/attachments
```

Returns email metadata plus attachment information (filename, size, mimeType, attachmentId).

#### Download Attachment
```http
GET /api/emails/:id/attachments/:attachmentId
```

Returns base64-encoded attachment data.

### Drafts

#### List Drafts
```http
GET /api/drafts?maxResults=10
```

#### Get Draft
```http
GET /api/drafts/:id
```

#### Create Draft
```http
POST /api/drafts
Content-Type: application/json

{
  "to": ["recipient@example.com"],
  "subject": "Draft Subject",
  "body": "Draft body text",
  "cc": ["cc@example.com"],
  "htmlBody": "<p>HTML draft body</p>"
}
```

#### Update Draft
```http
PUT /api/drafts/:id
Content-Type: application/json

{
  "to": ["recipient@example.com"],
  "subject": "Updated Subject",
  "body": "Updated body"
}
```

#### Delete Draft
```http
DELETE /api/drafts/:id
```

#### Send Draft
```http
POST /api/drafts/:id/send
```

### Labels

#### Get Labels
```http
GET /api/labels
```

#### Create Label
```http
POST /api/labels
Content-Type: application/json

{
  "name": "My Label"
}
```

#### Update Label
```http
PUT /api/labels/:id
Content-Type: application/json

{
  "name": "New Label Name"
}
```

#### Delete Label
```http
DELETE /api/labels/:id
```

### Settings

#### Get Vacation Responder Settings
```http
GET /api/settings/vacation
```

#### Set Vacation Responder
```http
PUT /api/settings/vacation
Content-Type: application/json

{
  "enableAutoReply": true,
  "responseSubject": "Out of Office",
  "responseBodyPlainText": "I am currently out of the office.",
  "responseBodyHtml": "<p>I am currently out of the office.</p>",
  "restrictToContacts": false,
  "restrictToDomain": false,
  "startTime": 1704067200000,
  "endTime": 1704672000000
}
```

### Generic Tool Call (for Bots)

```http
POST /api/call
Content-Type: application/json

{
  "tool": "list_emails",
  "arguments": {
    "maxResults": 5
  }
}
```

Available tools (40+):

**Email Operations:**
- `list_emails` - List emails (`query`, `maxResults`)
- `get_email` - Get single email (`messageId`)
- `search_emails` - Search emails (`query`, `maxResults`)
- `send_email` - Send email (`to`, `subject`, `body`, `cc`, `bcc`, `htmlBody`)
- `reply_to_email` - Reply to email (`messageId`, `body`, `htmlBody`, `replyAll`)
- `forward_email` - Forward email (`messageId`, `to`, `body`, `cc`, `bcc`)
- `modify_email` - Modify labels (`messageId`, `addLabelIds`, `removeLabelIds`)
- `mark_read` - Mark as read (`messageId`)
- `mark_unread` - Mark as unread (`messageId`)
- `trash_email` - Move to trash (`messageId`)
- `untrash_email` - Restore from trash (`messageId`)
- `delete_email` - Permanently delete (`messageId`)
- `star_email` - Star email (`messageId`)
- `unstar_email` - Unstar email (`messageId`)
- `archive_email` - Archive email (`messageId`)
- `batch_modify_emails` - Modify multiple emails (`messageIds`, `addLabelIds`, `removeLabelIds`)
- `get_unread_count` - Get unread count

**Threads:**
- `get_thread` - Get email thread (`threadId`)

**Attachments:**
- `get_email_attachments` - Get attachment info (`messageId`)
- `download_attachment` - Download attachment (`messageId`, `attachmentId`)

**Labels:**
- `get_labels` - Get all labels
- `create_label` - Create label (`name`)
- `update_label` - Update label (`labelId`, `name`)
- `delete_label` - Delete label (`labelId`)

**Drafts:**
- `list_drafts` - List drafts (`maxResults`)
- `get_draft` - Get draft (`draftId`)
- `create_draft` - Create draft (`to`, `subject`, `body`, `cc`, `bcc`, `htmlBody`)
- `update_draft` - Update draft (`draftId`, `to`, `subject`, `body`, `cc`, `bcc`, `htmlBody`)
- `delete_draft` - Delete draft (`draftId`)
- `send_draft` - Send draft (`draftId`)

**Settings:**
- `get_vacation_settings` - Get vacation responder settings
- `set_vacation_settings` - Set vacation responder (`enableAutoReply`, `responseSubject`, `responseBodyPlainText`, etc.)

**Marketing:**
- `find_marketing_emails` - Find marketing/unsubscribe emails (`maxResults`)
- `get_unsubscribe_info` - Get unsubscribe info (`messageId`)

## Gmail Search Syntax

The `q` parameter and search queries support full Gmail search syntax:

| Query | Description |
|-------|-------------|
| `from:user@example.com` | From specific sender |
| `to:user@example.com` | To specific recipient |
| `subject:meeting` | Subject contains "meeting" |
| `is:unread` | Unread emails |
| `is:starred` | Starred emails |
| `is:important` | Important emails |
| `has:attachment` | Has attachments |
| `after:2024/01/01` | After date |
| `before:2024/12/31` | Before date |
| `label:work` | Has specific label |
| `in:inbox` | In inbox |
| `in:sent` | In sent folder |
| `larger:5M` | Larger than 5MB |
| `filename:pdf` | Has PDF attachment |

Combine queries: `from:boss@company.com is:unread after:2024/01/01`

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cat > .env << EOF
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
API_KEY=optional-api-key
EOF

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Project Structure

```
gmail-mcp-http/
├── src/
│   ├── index.ts     # Express server and routes
│   ├── gmail.ts     # GmailService class
│   └── auth.ts      # OAuth configuration
├── scripts/
│   └── get-tokens.ts    # OAuth token helper
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Response Format

All endpoints return JSON with a consistent structure:

```json
{
  "success": true,
  "count": 5,
  "emails": [...]
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Related Projects

- [gmail-slack-bot](https://github.com/davefmurray/gmail-slack-bot) - Slack bot that uses this API

## Security Considerations

- Store OAuth credentials in environment variables, never in code
- Use `API_KEY` in production to protect endpoints
- The refresh token grants full access to your Gmail - keep it secure
- Consider IP restrictions at the infrastructure level

## Troubleshooting

### "GOOGLE_REFRESH_TOKEN is required"
Run the token helper script to obtain a refresh token:
```bash
npx tsx scripts/get-tokens.ts
```

### "Invalid Credentials" error
- Verify your Client ID and Secret are correct
- The refresh token may have expired - get a new one
- Check that the Gmail API is enabled in Google Cloud Console

### Token refresh not working
- Ensure you authorized with `access_type=offline` (the helper script does this)
- If you previously authorized, revoke access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and re-authorize

### 401 Unauthorized
- Check that your `API_KEY` header matches the configured key
- Header should be `x-api-key: your-key`

## License

MIT

---

Built with ❤️ for seamless Gmail integration
