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
   * Create a new label
   */
  async createLabel(name: string, options?: {
    labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
    messageListVisibility?: 'show' | 'hide';
    backgroundColor?: string;
    textColor?: string;
  }): Promise<{ id: string; name: string }> {
    const response = await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: options?.labelListVisibility || 'labelShow',
        messageListVisibility: options?.messageListVisibility || 'show',
        color: options?.backgroundColor ? {
          backgroundColor: options.backgroundColor,
          textColor: options.textColor || '#000000',
        } : undefined,
      },
    });

    return {
      id: response.data.id || '',
      name: response.data.name || '',
    };
  }

  /**
   * Delete a label
   */
  async deleteLabel(labelId: string): Promise<void> {
    await this.gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    });
  }

  /**
   * Update a label
   */
  async updateLabel(labelId: string, name: string): Promise<{ id: string; name: string }> {
    const response = await this.gmail.users.labels.update({
      userId: 'me',
      id: labelId,
      requestBody: {
        name,
      },
    });

    return {
      id: response.data.id || '',
      name: response.data.name || '',
    };
  }

  /**
   * Star an email
   */
  async starEmail(messageId: string): Promise<void> {
    await this.modifyEmail(messageId, ['STARRED'], undefined);
  }

  /**
   * Unstar an email
   */
  async unstarEmail(messageId: string): Promise<void> {
    await this.modifyEmail(messageId, undefined, ['STARRED']);
  }

  /**
   * Archive an email (remove from INBOX)
   */
  async archiveEmail(messageId: string): Promise<void> {
    await this.modifyEmail(messageId, undefined, ['INBOX']);
  }

  /**
   * Batch modify multiple emails
   */
  async batchModifyEmails(
    messageIds: string[],
    addLabelIds?: string[],
    removeLabelIds?: string[]
  ): Promise<void> {
    await this.gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: messageIds,
        addLabelIds,
        removeLabelIds,
      },
    });
  }

  /**
   * Get email with full headers including List-Unsubscribe
   */
  async getEmailWithUnsubscribe(messageId: string): Promise<{
    email: EmailMessage | null;
    unsubscribeLinks: string[];
    unsubscribeEmail: string | null;
  }> {
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

      // Extract List-Unsubscribe header
      const unsubscribeHeader = getHeader('List-Unsubscribe');
      const unsubscribeLinks: string[] = [];
      let unsubscribeEmail: string | null = null;

      if (unsubscribeHeader) {
        // Parse mailto: and http(s): links from the header
        const matches = unsubscribeHeader.match(/<([^>]+)>/g) || [];
        for (const match of matches) {
          const link = match.slice(1, -1); // Remove < and >
          if (link.startsWith('mailto:')) {
            unsubscribeEmail = link.replace('mailto:', '').split('?')[0];
          } else if (link.startsWith('http://') || link.startsWith('https://')) {
            unsubscribeLinks.push(link);
          }
        }
      }

      // Also search email body for common unsubscribe patterns
      let body = '';
      const payload = message.payload;

      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf8');
      } else if (payload?.parts) {
        const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');

        if (htmlPart?.body?.data) {
          body = Buffer.from(htmlPart.body.data, 'base64').toString('utf8');
        } else if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      }

      // Find unsubscribe links in body
      const urlRegex = /https?:\/\/[^\s<>"]+(?:unsubscribe|opt-out|optout|remove|preferences)[^\s<>"]*/gi;
      const bodyLinks = body.match(urlRegex) || [];
      for (const link of bodyLinks) {
        if (!unsubscribeLinks.includes(link)) {
          unsubscribeLinks.push(link);
        }
      }

      return {
        email: {
          id: message.id || '',
          threadId: message.threadId || '',
          subject: getHeader('Subject'),
          from: getHeader('From'),
          to: getHeader('To'),
          date: getHeader('Date'),
          snippet: message.snippet || '',
          body,
          labels: message.labelIds || [],
        },
        unsubscribeLinks,
        unsubscribeEmail,
      };
    } catch (error) {
      console.error(`Error fetching email ${messageId}:`, error);
      return {
        email: null,
        unsubscribeLinks: [],
        unsubscribeEmail: null,
      };
    }
  }

  /**
   * Find marketing/promotional emails for potential unsubscribe
   */
  async findMarketingEmails(maxResults: number = 10): Promise<EmailMessage[]> {
    // Search for emails in the PROMOTIONS category or with common marketing patterns
    const queries = [
      'category:promotions',
      'subject:(unsubscribe OR newsletter OR promotional)',
      'from:(noreply OR newsletter OR marketing OR promo)',
    ];

    const allEmails: EmailMessage[] = [];
    const seenIds = new Set<string>();

    for (const query of queries) {
      try {
        const emails = await this.listEmails(query, Math.ceil(maxResults / 2));
        for (const email of emails) {
          if (!seenIds.has(email.id)) {
            seenIds.add(email.id);
            allEmails.push(email);
          }
        }
      } catch (error) {
        console.error(`Error searching with query "${query}":`, error);
      }
    }

    return allEmails.slice(0, maxResults);
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
