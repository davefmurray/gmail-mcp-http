import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
}

export interface SendEmailParams {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  htmlBody?: string;
}

export interface SearchEmailParams {
  query: string;
  maxResults?: number;
}

export class GmailService {
  private gmail: gmail_v1.Gmail;

  constructor(oauth2Client: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * List emails with optional query filter
   */
  async listEmails(query?: string, maxResults: number = 10): Promise<EmailMessage[]> {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = response.data.messages || [];
    const emails: EmailMessage[] = [];

    for (const msg of messages) {
      if (msg.id) {
        const email = await this.getEmail(msg.id);
        if (email) {
          emails.push(email);
        }
      }
    }

    return emails;
  }

  /**
   * Get a single email by ID
   */
  async getEmail(messageId: string): Promise<EmailMessage | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];

      const getHeader = (name: string): string => {
        const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
        return header?.value || '';
      };

      // Extract body content
      let body = '';
      const payload = message.payload;

      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf8');
      } else if (payload?.parts) {
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');

        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        } else if (htmlPart?.body?.data) {
          body = Buffer.from(htmlPart.body.data, 'base64').toString('utf8');
        }
      }

      return {
        id: message.id || '',
        threadId: message.threadId || '',
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        snippet: message.snippet || '',
        body,
        labels: message.labelIds || [],
      };
    } catch (error) {
      console.error(`Error fetching email ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Search emails using Gmail query syntax
   */
  async searchEmails(params: SearchEmailParams): Promise<EmailMessage[]> {
    return this.listEmails(params.query, params.maxResults || 10);
  }

  /**
   * Send an email
   */
  async sendEmail(params: SendEmailParams): Promise<{ id: string; threadId: string }> {
    const emailLines: string[] = [];

    // Headers
    emailLines.push(`To: ${params.to.join(', ')}`);
    if (params.cc?.length) {
      emailLines.push(`Cc: ${params.cc.join(', ')}`);
    }
    if (params.bcc?.length) {
      emailLines.push(`Bcc: ${params.bcc.join(', ')}`);
    }
    emailLines.push(`Subject: ${this.encodeHeader(params.subject)}`);
    emailLines.push('MIME-Version: 1.0');

    if (params.htmlBody) {
      // Multipart email
      const boundary = `----=_Part_${Math.random().toString(36).substring(2)}`;
      emailLines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      emailLines.push('');
      emailLines.push(`--${boundary}`);
      emailLines.push('Content-Type: text/plain; charset=UTF-8');
      emailLines.push('');
      emailLines.push(params.body);
      emailLines.push('');
      emailLines.push(`--${boundary}`);
      emailLines.push('Content-Type: text/html; charset=UTF-8');
      emailLines.push('');
      emailLines.push(params.htmlBody);
      emailLines.push('');
      emailLines.push(`--${boundary}--`);
    } else {
      // Plain text email
      emailLines.push('Content-Type: text/plain; charset=UTF-8');
      emailLines.push('');
      emailLines.push(params.body);
    }

    const rawMessage = emailLines.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      id: response.data.id || '',
      threadId: response.data.threadId || '',
    };
  }

  /**
   * Get all labels
   */
  async getLabels(): Promise<Array<{ id: string; name: string; type: string }>> {
    const response = await this.gmail.users.labels.list({
      userId: 'me',
    });

    return (response.data.labels || []).map(label => ({
      id: label.id || '',
      name: label.name || '',
      type: label.type || '',
    }));
  }

  /**
   * Modify email labels (move, archive, etc.)
   */
  async modifyEmail(
    messageId: string,
    addLabelIds?: string[],
    removeLabelIds?: string[]
  ): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds,
        removeLabelIds,
      },
    });
  }

  /**
   * Mark email as read
   */
  async markAsRead(messageId: string): Promise<void> {
    await this.modifyEmail(messageId, undefined, ['UNREAD']);
  }

  /**
   * Mark email as unread
   */
  async markAsUnread(messageId: string): Promise<void> {
    await this.modifyEmail(messageId, ['UNREAD'], undefined);
  }

  /**
   * Delete an email (move to trash)
   */
  async trashEmail(messageId: string): Promise<void> {
    await this.gmail.users.messages.trash({
      userId: 'me',
      id: messageId,
    });
  }

  /**
   * Permanently delete an email
   */
  async deleteEmail(messageId: string): Promise<void> {
    await this.gmail.users.messages.delete({
      userId: 'me',
      id: messageId,
    });
  }

  /**
   * Encode email header for non-ASCII characters
   */
  private encodeHeader(text: string): string {
    if (/[^\x00-\x7F]/.test(text)) {
      return '=?UTF-8?B?' + Buffer.from(text).toString('base64') + '?=';
    }
    return text;
  }
}
