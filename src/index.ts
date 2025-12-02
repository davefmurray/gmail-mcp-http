import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadEnvConfig, createOAuth2Client } from './auth.js';
import { GmailService, SendEmailParams, SearchEmailParams, ReplyEmailParams, ForwardEmailParams, DraftParams } from './gmail.js';
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
      // Email operations
      { name: 'list_emails', method: 'GET', path: '/api/emails' },
      { name: 'get_email', method: 'GET', path: '/api/emails/:id' },
      { name: 'search_emails', method: 'POST', path: '/api/emails/search' },
      { name: 'send_email', method: 'POST', path: '/api/emails/send' },
      { name: 'reply_email', method: 'POST', path: '/api/emails/:id/reply' },
      { name: 'forward_email', method: 'POST', path: '/api/emails/:id/forward' },
      { name: 'modify_email', method: 'PUT', path: '/api/emails/:id/labels' },
      { name: 'mark_read', method: 'POST', path: '/api/emails/:id/read' },
      { name: 'mark_unread', method: 'POST', path: '/api/emails/:id/unread' },
      { name: 'star_email', method: 'POST', path: '/api/emails/:id/star' },
      { name: 'unstar_email', method: 'DELETE', path: '/api/emails/:id/star' },
      { name: 'archive_email', method: 'POST', path: '/api/emails/:id/archive' },
      { name: 'trash_email', method: 'DELETE', path: '/api/emails/:id' },
      { name: 'untrash_email', method: 'POST', path: '/api/emails/:id/untrash' },
      { name: 'delete_email', method: 'DELETE', path: '/api/emails/:id/permanent' },
      { name: 'batch_modify', method: 'POST', path: '/api/emails/batch/labels' },
      { name: 'get_unsubscribe_info', method: 'GET', path: '/api/emails/:id/unsubscribe' },
      { name: 'find_marketing_emails', method: 'GET', path: '/api/emails/marketing' },
      { name: 'get_unread_count', method: 'GET', path: '/api/emails/unread/count' },
      // Thread operations
      { name: 'get_thread', method: 'GET', path: '/api/threads/:id' },
      // Attachment operations
      { name: 'get_email_attachments', method: 'GET', path: '/api/emails/:id/attachments' },
      { name: 'download_attachment', method: 'GET', path: '/api/emails/:id/attachments/:attachmentId' },
      // Label operations
      { name: 'get_labels', method: 'GET', path: '/api/labels' },
      { name: 'create_label', method: 'POST', path: '/api/labels' },
      { name: 'update_label', method: 'PUT', path: '/api/labels/:id' },
      { name: 'delete_label', method: 'DELETE', path: '/api/labels/:id' },
      // Draft operations
      { name: 'list_drafts', method: 'GET', path: '/api/drafts' },
      { name: 'get_draft', method: 'GET', path: '/api/drafts/:id' },
      { name: 'create_draft', method: 'POST', path: '/api/drafts' },
      { name: 'update_draft', method: 'PUT', path: '/api/drafts/:id' },
      { name: 'delete_draft', method: 'DELETE', path: '/api/drafts/:id' },
      { name: 'send_draft', method: 'POST', path: '/api/drafts/:id/send' },
      // Settings
      { name: 'get_vacation_settings', method: 'GET', path: '/api/settings/vacation' },
      { name: 'set_vacation_settings', method: 'PUT', path: '/api/settings/vacation' },
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

// Create a new label
const createLabelSchema = z.object({
  name: z.string().min(1, 'Label name is required'),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
});

app.post('/api/labels', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = createLabelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const label = await gmailService.createLabel(parsed.data.name, {
      backgroundColor: parsed.data.backgroundColor,
      textColor: parsed.data.textColor,
    });
    res.json({
      success: true,
      message: 'Label created successfully',
      label,
    });
  } catch (error) {
    console.error('Error creating label:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete a label
app.delete('/api/labels/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.deleteLabel(req.params.id);
    res.json({
      success: true,
      message: 'Label deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting label:', error);
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

// Star email
app.post('/api/emails/:id/star', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.starEmail(req.params.id);
    res.json({
      success: true,
      message: 'Email starred',
    });
  } catch (error) {
    console.error('Error starring email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Unstar email
app.delete('/api/emails/:id/star', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.unstarEmail(req.params.id);
    res.json({
      success: true,
      message: 'Email unstarred',
    });
  } catch (error) {
    console.error('Error unstarring email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Archive email
app.post('/api/emails/:id/archive', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.archiveEmail(req.params.id);
    res.json({
      success: true,
      message: 'Email archived',
    });
  } catch (error) {
    console.error('Error archiving email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Batch modify emails
const batchModifySchema = z.object({
  messageIds: z.array(z.string()).min(1, 'At least one message ID is required'),
  addLabelIds: z.array(z.string()).optional(),
  removeLabelIds: z.array(z.string()).optional(),
});

app.post('/api/emails/batch/labels', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = batchModifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    await gmailService.batchModifyEmails(
      parsed.data.messageIds,
      parsed.data.addLabelIds,
      parsed.data.removeLabelIds
    );

    res.json({
      success: true,
      message: `Modified ${parsed.data.messageIds.length} emails`,
    });
  } catch (error) {
    console.error('Error batch modifying emails:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get unsubscribe info for an email
app.get('/api/emails/:id/unsubscribe', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const result = await gmailService.getEmailWithUnsubscribe(req.params.id);
    if (!result.email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found',
      });
    }

    res.json({
      success: true,
      email: {
        id: result.email.id,
        subject: result.email.subject,
        from: result.email.from,
      },
      unsubscribeLinks: result.unsubscribeLinks,
      unsubscribeEmail: result.unsubscribeEmail,
      hasUnsubscribe: result.unsubscribeLinks.length > 0 || result.unsubscribeEmail !== null,
    });
  } catch (error) {
    console.error('Error getting unsubscribe info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Find marketing/promotional emails
app.get('/api/emails/marketing', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const maxResults = parseInt(req.query.maxResults as string) || 10;
    const emails = await gmailService.findMarketingEmails(maxResults);

    // Get unsubscribe info for each email
    const emailsWithUnsubscribe = await Promise.all(
      emails.map(async (email) => {
        const unsubInfo = await gmailService.getEmailWithUnsubscribe(email.id);
        return {
          ...email,
          unsubscribeLinks: unsubInfo.unsubscribeLinks,
          unsubscribeEmail: unsubInfo.unsubscribeEmail,
          hasUnsubscribe: unsubInfo.unsubscribeLinks.length > 0 || unsubInfo.unsubscribeEmail !== null,
        };
      })
    );

    res.json({
      success: true,
      count: emailsWithUnsubscribe.length,
      emails: emailsWithUnsubscribe,
    });
  } catch (error) {
    console.error('Error finding marketing emails:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get unread email count
app.get('/api/emails/unread/count', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string | undefined;
    const count = await gmailService.getUnreadCount(query);
    res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Reply to email
const replySchema = z.object({
  body: z.string().min(1, 'Body is required'),
  htmlBody: z.string().optional(),
  replyAll: z.boolean().optional().default(false),
});

app.post('/api/emails/:id/reply', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const result = await gmailService.replyToEmail({
      messageId: req.params.id,
      ...parsed.data,
    });

    res.json({
      success: true,
      message: 'Reply sent successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error replying to email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Forward email
const forwardSchema = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  body: z.string().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
});

app.post('/api/emails/:id/forward', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = forwardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const result = await gmailService.forwardEmail({
      messageId: req.params.id,
      ...parsed.data,
    });

    res.json({
      success: true,
      message: 'Email forwarded successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error forwarding email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Untrash email (restore from trash)
app.post('/api/emails/:id/untrash', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.untrashEmail(req.params.id);
    res.json({
      success: true,
      message: 'Email restored from trash',
    });
  } catch (error) {
    console.error('Error restoring email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Permanently delete email
app.delete('/api/emails/:id/permanent', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.deleteEmail(req.params.id);
    res.json({
      success: true,
      message: 'Email permanently deleted',
    });
  } catch (error) {
    console.error('Error permanently deleting email:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get email attachments info
app.get('/api/emails/:id/attachments', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const email = await gmailService.getEmailWithAttachments(req.params.id);
    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found',
      });
    }

    res.json({
      success: true,
      email: {
        id: email.id,
        subject: email.subject,
        from: email.from,
      },
      attachments: email.attachments,
    });
  } catch (error) {
    console.error('Error getting attachments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Download attachment
app.get('/api/emails/:id/attachments/:attachmentId', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const attachment = await gmailService.getAttachment(req.params.id, req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found',
      });
    }

    res.json({
      success: true,
      data: attachment.data,
      size: attachment.size,
    });
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================
// THREAD ENDPOINTS
// ===================

// Get thread
app.get('/api/threads/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const thread = await gmailService.getThread(req.params.id);
    if (!thread) {
      return res.status(404).json({
        success: false,
        error: 'Thread not found',
      });
    }

    res.json({
      success: true,
      thread,
    });
  } catch (error) {
    console.error('Error getting thread:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================
// DRAFT ENDPOINTS
// ===================

// List drafts
app.get('/api/drafts', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const maxResults = parseInt(req.query.maxResults as string) || 10;
    const drafts = await gmailService.listDrafts(maxResults);
    res.json({
      success: true,
      count: drafts.length,
      drafts,
    });
  } catch (error) {
    console.error('Error listing drafts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get single draft
app.get('/api/drafts/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const draft = await gmailService.getDraft(req.params.id);
    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'Draft not found',
      });
    }

    res.json({
      success: true,
      draft,
    });
  } catch (error) {
    console.error('Error getting draft:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create draft
const draftSchema = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  htmlBody: z.string().optional(),
});

app.post('/api/drafts', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const result = await gmailService.createDraft(parsed.data);
    res.json({
      success: true,
      message: 'Draft created successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error creating draft:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update draft
app.put('/api/drafts/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const result = await gmailService.updateDraft(req.params.id, parsed.data);
    res.json({
      success: true,
      message: 'Draft updated successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error updating draft:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete draft
app.delete('/api/drafts/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    await gmailService.deleteDraft(req.params.id);
    res.json({
      success: true,
      message: 'Draft deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting draft:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Send draft
app.post('/api/drafts/:id/send', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const result = await gmailService.sendDraft(req.params.id);
    res.json({
      success: true,
      message: 'Draft sent successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error sending draft:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================
// SETTINGS ENDPOINTS
// ===================

// Get vacation settings
app.get('/api/settings/vacation', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const settings = await gmailService.getVacationSettings();
    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Error getting vacation settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Set vacation settings
const vacationSchema = z.object({
  enableAutoReply: z.boolean(),
  responseSubject: z.string().optional(),
  responseBodyPlainText: z.string().optional(),
  responseBodyHtml: z.string().optional(),
  restrictToContacts: z.boolean().optional(),
  restrictToDomain: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

app.put('/api/settings/vacation', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = vacationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    await gmailService.setVacationSettings({
      ...parsed.data,
      startTime: parsed.data.startTime ? new Date(parsed.data.startTime) : undefined,
      endTime: parsed.data.endTime ? new Date(parsed.data.endTime) : undefined,
    });

    res.json({
      success: true,
      message: 'Vacation settings updated successfully',
    });
  } catch (error) {
    console.error('Error setting vacation settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update label
const updateLabelSchema = z.object({
  name: z.string().min(1, 'Label name is required'),
});

app.put('/api/labels/:id', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = updateLabelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      });
    }

    const label = await gmailService.updateLabel(req.params.id, parsed.data.name);
    res.json({
      success: true,
      message: 'Label updated successfully',
      label,
    });
  } catch (error) {
    console.error('Error updating label:', error);
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

      case 'create_label':
        if (!args?.name) {
          return res.status(400).json({ success: false, error: 'name is required' });
        }
        result = await gmailService.createLabel(args.name, {
          backgroundColor: args.backgroundColor,
          textColor: args.textColor,
        });
        break;

      case 'delete_label':
        if (!args?.labelId) {
          return res.status(400).json({ success: false, error: 'labelId is required' });
        }
        await gmailService.deleteLabel(args.labelId);
        result = { message: 'Label deleted' };
        break;

      case 'star_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.starEmail(args.messageId);
        result = { message: 'Email starred' };
        break;

      case 'unstar_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.unstarEmail(args.messageId);
        result = { message: 'Email unstarred' };
        break;

      case 'archive_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.archiveEmail(args.messageId);
        result = { message: 'Email archived' };
        break;

      case 'batch_modify':
        if (!args?.messageIds || !Array.isArray(args.messageIds)) {
          return res.status(400).json({ success: false, error: 'messageIds array is required' });
        }
        await gmailService.batchModifyEmails(args.messageIds, args.addLabelIds, args.removeLabelIds);
        result = { message: `Modified ${args.messageIds.length} emails` };
        break;

      case 'get_unsubscribe_info':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        result = await gmailService.getEmailWithUnsubscribe(args.messageId);
        break;

      case 'find_marketing_emails':
        result = await gmailService.findMarketingEmails(args?.maxResults || 10);
        break;

      case 'reply_email':
        if (!args?.messageId || !args?.body) {
          return res.status(400).json({ success: false, error: 'messageId and body are required' });
        }
        result = await gmailService.replyToEmail({
          messageId: args.messageId,
          body: args.body,
          htmlBody: args.htmlBody,
          replyAll: args.replyAll,
        });
        break;

      case 'forward_email':
        if (!args?.messageId || !args?.to) {
          return res.status(400).json({ success: false, error: 'messageId and to are required' });
        }
        result = await gmailService.forwardEmail({
          messageId: args.messageId,
          to: Array.isArray(args.to) ? args.to : [args.to],
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
        });
        break;

      case 'get_thread':
        if (!args?.threadId) {
          return res.status(400).json({ success: false, error: 'threadId is required' });
        }
        result = await gmailService.getThread(args.threadId);
        break;

      case 'list_drafts':
        result = await gmailService.listDrafts(args?.maxResults || 10);
        break;

      case 'get_draft':
        if (!args?.draftId) {
          return res.status(400).json({ success: false, error: 'draftId is required' });
        }
        result = await gmailService.getDraft(args.draftId);
        break;

      case 'create_draft':
        if (!args?.to || !args?.subject || !args?.body) {
          return res.status(400).json({ success: false, error: 'to, subject, and body are required' });
        }
        result = await gmailService.createDraft({
          to: Array.isArray(args.to) ? args.to : [args.to],
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
          htmlBody: args.htmlBody,
        });
        break;

      case 'update_draft':
        if (!args?.draftId || !args?.to || !args?.subject || !args?.body) {
          return res.status(400).json({ success: false, error: 'draftId, to, subject, and body are required' });
        }
        result = await gmailService.updateDraft(args.draftId, {
          to: Array.isArray(args.to) ? args.to : [args.to],
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
          htmlBody: args.htmlBody,
        });
        break;

      case 'delete_draft':
        if (!args?.draftId) {
          return res.status(400).json({ success: false, error: 'draftId is required' });
        }
        await gmailService.deleteDraft(args.draftId);
        result = { message: 'Draft deleted' };
        break;

      case 'send_draft':
        if (!args?.draftId) {
          return res.status(400).json({ success: false, error: 'draftId is required' });
        }
        result = await gmailService.sendDraft(args.draftId);
        break;

      case 'get_email_attachments':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        result = await gmailService.getEmailWithAttachments(args.messageId);
        break;

      case 'download_attachment':
        if (!args?.messageId || !args?.attachmentId) {
          return res.status(400).json({ success: false, error: 'messageId and attachmentId are required' });
        }
        result = await gmailService.getAttachment(args.messageId, args.attachmentId);
        break;

      case 'update_label':
        if (!args?.labelId || !args?.name) {
          return res.status(400).json({ success: false, error: 'labelId and name are required' });
        }
        result = await gmailService.updateLabel(args.labelId, args.name);
        break;

      case 'get_unread_count':
        result = { count: await gmailService.getUnreadCount(args?.query) };
        break;

      case 'delete_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.deleteEmail(args.messageId);
        result = { message: 'Email permanently deleted' };
        break;

      case 'untrash_email':
        if (!args?.messageId) {
          return res.status(400).json({ success: false, error: 'messageId is required' });
        }
        await gmailService.untrashEmail(args.messageId);
        result = { message: 'Email restored from trash' };
        break;

      case 'get_vacation_settings':
        result = await gmailService.getVacationSettings();
        break;

      case 'set_vacation_settings':
        if (args?.enableAutoReply === undefined) {
          return res.status(400).json({ success: false, error: 'enableAutoReply is required' });
        }
        await gmailService.setVacationSettings({
          enableAutoReply: args.enableAutoReply,
          responseSubject: args.responseSubject,
          responseBodyPlainText: args.responseBodyPlainText,
          responseBodyHtml: args.responseBodyHtml,
          restrictToContacts: args.restrictToContacts,
          restrictToDomain: args.restrictToDomain,
          startTime: args.startTime ? new Date(args.startTime) : undefined,
          endTime: args.endTime ? new Date(args.endTime) : undefined,
        });
        result = { message: 'Vacation settings updated' };
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
