import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadEnvConfig, createOAuth2Client } from './auth.js';
import { GmailService, SendEmailParams, SearchEmailParams } from './gmail.js';
import { z } from 'zod';

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Load configuration
let config: ReturnType<typeof loadEnvConfig>;
let gmailService: GmailService;

try {
  config = loadEnvConfig();
  const oauth2Client = createOAuth2Client(config);
  gmailService = new GmailService(oauth2Client);
  console.log('Gmail service initialized successfully');
} catch (error) {
  console.error('Failed to initialize:', error);
  process.exit(1);
}

// API Key authentication middleware
function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  if (!config.API_KEY) {
    // No API key configured, allow all requests (dev mode)
    return next();
  }

  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey || apiKey !== config.API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid or missing API key',
    });
  }

  next();
}

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'gmail-mcp-http',
  });
});

// List available tools/endpoints
app.get('/api/tools', authenticateApiKey, (req: Request, res: Response) => {
  res.json({
    success: true,
    tools: [
      { name: 'list_emails', method: 'GET', path: '/api/emails' },
      { name: 'get_email', method: 'GET', path: '/api/emails/:id' },
      { name: 'search_emails', method: 'POST', path: '/api/emails/search' },
      { name: 'send_email', method: 'POST', path: '/api/emails/send' },
      { name: 'get_labels', method: 'GET', path: '/api/labels' },
      { name: 'modify_email', method: 'PUT', path: '/api/emails/:id/labels' },
      { name: 'mark_read', method: 'POST', path: '/api/emails/:id/read' },
      { name: 'mark_unread', method: 'POST', path: '/api/emails/:id/unread' },
      { name: 'trash_email', method: 'DELETE', path: '/api/emails/:id' },
    ],
  });
});

// ===================
// EMAIL ENDPOINTS
// ===================

// List emails
app.get('/api/emails', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string | undefined;
    const maxResults = parseInt(req.query.maxResults as string) || 10;

    const emails = await gmailService.listEmails(query, maxResults);
    res.json({
      success: true,
      count: emails.length,
      emails,
    });
  } catch (error) {
    console.error('Error listing emails:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get single email
app.get('/api/emails/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const email = await gmailService.getEmail(req.params.id);
    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found',
      });
    }
    res.json({
      success: true,
      email,
    });
  } catch (error) {
    console.error('Error getting email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Search emails
const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  maxResults: z.number().int().positive().max(100).optional().default(10),
});

app.post('/api/emails/search', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const emails = await gmailService.searchEmails(parsed.data);
    res.json({
      success: true,
      count: emails.length,
      emails,
    });
  } catch (error) {
    console.error('Error searching emails:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Send email
const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  htmlBody: z.string().optional(),
});

app.post('/api/emails/send', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = sendEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const result = await gmailService.sendEmail(parsed.data);
    res.json({
      success: true,
      message: 'Email sent successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================
// LABEL ENDPOINTS
// ===================

// Get all labels
app.get('/api/labels', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const labels = await gmailService.getLabels();
    res.json({
      success: true,
      count: labels.length,
      labels,
    });
  } catch (error) {
    console.error('Error getting labels:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Modify email labels
const modifyLabelsSchema = z.object({
  addLabelIds: z.array(z.string()).optional(),
  removeLabelIds: z.array(z.string()).optional(),
});

app.put('/api/emails/:id/labels', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = modifyLabelsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    await gmailService.modifyEmail(
      req.params.id,
      parsed.data.addLabelIds,
      parsed.data.removeLabelIds
    );

    res.json({
      success: true,
      message: 'Labels modified successfully',
    });
  } catch (error) {
    console.error('Error modifying labels:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Mark as read
app.post('/api/emails/:id/read', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.markAsRead(req.params.id);
    res.json({
      success: true,
      message: 'Email marked as read',
    });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Mark as unread
app.post('/api/emails/:id/unread', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.markAsUnread(req.params.id);
    res.json({
      success: true,
      message: 'Email marked as unread',
    });
  } catch (error) {
    console.error('Error marking as unread:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Trash email
app.delete('/api/emails/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.trashEmail(req.params.id);
    res.json({
      success: true,
      message: 'Email moved to trash',
    });
  } catch (error) {
    console.error('Error trashing email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================
// SLACK-FRIENDLY ENDPOINT
// ===================

// Generic tool call endpoint (useful for Slack/bot integrations)
app.post('/api/call', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { tool, arguments: args } = req.body;

    if (!tool) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: tool',
      });
    }

    let result: unknown;

    switch (tool) {
      case 'list_emails':
        result = await gmailService.listEmails(args?.query, args?.maxResults || 10);
        break;

      case 'get_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        result = await gmailService.getEmail(args.messageId);
        break;

      case 'search_emails':
        if (!args?.query) {
          return res.status(400).json({ success: false, error: 'query is required' });
        }
        result = await gmailService.searchEmails(args);
        break;

      case 'send_email':
        if (!args?.to || !args?.subject || !args?.body) {
          return res.status(400).json({
            success: false,
            error: 'to, subject, and body are required',
          });
        }
        result = await gmailService.sendEmail(args);
        break;

      case 'get_labels':
        result = await gmailService.getLabels();
        break;

      case 'modify_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.modifyEmail(args.messageId, args.addLabelIds, args.removeLabelIds);
        result = { message: 'Labels modified successfully' };
        break;

      case 'mark_read':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.markAsRead(args.messageId);
        result = { message: 'Marked as read' };
        break;

      case 'mark_unread':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.markAsUnread(args.messageId);
        result = { message: 'Marked as unread' };
        break;

      case 'trash_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.trashEmail(args.messageId);
        result = { message: 'Moved to trash' };
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown tool: ${tool}`,
        });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error executing tool:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Start server
const PORT = parseInt(config.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Gmail MCP HTTP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API endpoints: http://localhost:${PORT}/api/tools`);
});
