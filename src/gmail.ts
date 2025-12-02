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

export interface ReplyEmailParams {
  messageId: string;
  body: string;
  htmlBody?: string;
  replyAll?: boolean;
}

export interface ForwardEmailParams {
  messageId: string;
  to: string[];
  body?: string;
  cc?: string[];
  bcc?: string[];
}

export interface DraftParams {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  htmlBody?: string;
}

export interface ThreadMessage {
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

export interface EmailThread {
  id: string;
  historyId: string;
  messages: ThreadMessage[];
}

export interface Draft {
  id: string;
  message: {
    id: string;
    threadId: string;
    subject: string;
    to: string;
    snippet: string;
  };
}

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface EmailWithAttachments extends EmailMessage {
  attachments: AttachmentInfo[];
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
   * Restore an email from trash
   */
  async untrashEmail(messageId: string): Promise<void> {
    await this.gmail.users.messages.untrash({
      userId: 'me',
      id: messageId,
    });
  }

  /**
   * Reply to an email
   */
  async replyToEmail(params: ReplyEmailParams): Promise<{ id: string; threadId: string }> {
    // Get the original email to extract headers
    const original = await this.gmail.users.messages.get({
      userId: 'me',
      id: params.messageId,
      format: 'full',
    });

    const headers = original.data.payload?.headers || [];
    const getHeader = (name: string): string => {
      const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const originalFrom = getHeader('From');
    const originalTo = getHeader('To');
    const originalCc = getHeader('Cc');
    const originalSubject = getHeader('Subject');
    const messageId = getHeader('Message-ID');
    const references = getHeader('References');

    // Determine recipients
    let toRecipients: string[];
    if (params.replyAll) {
      // Reply all: send to original sender + all To recipients (except self) + all Cc
      const allRecipients = new Set<string>();
      allRecipients.add(originalFrom);
      if (originalTo) {
        originalTo.split(',').forEach(r => allRecipients.add(r.trim()));
      }
      if (originalCc) {
        originalCc.split(',').forEach(r => allRecipients.add(r.trim()));
      }
      toRecipients = Array.from(allRecipients);
    } else {
      // Simple reply: just to the original sender
      toRecipients = [originalFrom];
    }

    // Build reply subject
    const replySubject = originalSubject.toLowerCase().startsWith('re:')
      ? originalSubject
      : `Re: ${originalSubject}`;

    // Build email
    const emailLines: string[] = [];
    emailLines.push(`To: ${toRecipients.join(', ')}`);
    emailLines.push(`Subject: ${this.encodeHeader(replySubject)}`);
    emailLines.push(`In-Reply-To: ${messageId}`);
    emailLines.push(`References: ${references ? `${references} ${messageId}` : messageId}`);
    emailLines.push('MIME-Version: 1.0');

    if (params.htmlBody) {
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
        threadId: original.data.threadId || undefined,
      },
    });

    return {
      id: response.data.id || '',
      threadId: response.data.threadId || '',
    };
  }

  /**
   * Forward an email
   */
  async forwardEmail(params: ForwardEmailParams): Promise<{ id: string; threadId: string }> {
    // Get the original email
    const original = await this.gmail.users.messages.get({
      userId: 'me',
      id: params.messageId,
      format: 'full',
    });

    const headers = original.data.payload?.headers || [];
    const getHeader = (name: string): string => {
      const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const originalFrom = getHeader('From');
    const originalTo = getHeader('To');
    const originalDate = getHeader('Date');
    const originalSubject = getHeader('Subject');

    // Extract original body
    let originalBody = '';
    const payload = original.data.payload;
    if (payload?.body?.data) {
      originalBody = Buffer.from(payload.body.data, 'base64').toString('utf8');
    } else if (payload?.parts) {
      const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        originalBody = Buffer.from(textPart.body.data, 'base64').toString('utf8');
      }
    }

    // Build forward subject
    const forwardSubject = originalSubject.toLowerCase().startsWith('fwd:')
      ? originalSubject
      : `Fwd: ${originalSubject}`;

    // Build forwarded message body
    const forwardedContent = [
      params.body || '',
      '',
      '---------- Forwarded message ---------',
      `From: ${originalFrom}`,
      `Date: ${originalDate}`,
      `Subject: ${originalSubject}`,
      `To: ${originalTo}`,
      '',
      originalBody,
    ].join('\n');

    // Build email
    const emailLines: string[] = [];
    emailLines.push(`To: ${params.to.join(', ')}`);
    if (params.cc?.length) {
      emailLines.push(`Cc: ${params.cc.join(', ')}`);
    }
    if (params.bcc?.length) {
      emailLines.push(`Bcc: ${params.bcc.join(', ')}`);
    }
    emailLines.push(`Subject: ${this.encodeHeader(forwardSubject)}`);
    emailLines.push('MIME-Version: 1.0');
    emailLines.push('Content-Type: text/plain; charset=UTF-8');
    emailLines.push('');
    emailLines.push(forwardedContent);

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
   * Get an email thread (full conversation)
   */
  async getThread(threadId: string): Promise<EmailThread | null> {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });

      const thread = response.data;
      const messages: ThreadMessage[] = [];

      for (const msg of thread.messages || []) {
        const headers = msg.payload?.headers || [];
        const getHeader = (name: string): string => {
          const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
          return header?.value || '';
        };

        let body = '';
        const payload = msg.payload;
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

        messages.push({
          id: msg.id || '',
          threadId: msg.threadId || '',
          subject: getHeader('Subject'),
          from: getHeader('From'),
          to: getHeader('To'),
          date: getHeader('Date'),
          snippet: msg.snippet || '',
          body,
          labels: msg.labelIds || [],
        });
      }

      return {
        id: thread.id || '',
        historyId: thread.historyId || '',
        messages,
      };
    } catch (error) {
      console.error(`Error fetching thread ${threadId}:`, error);
      return null;
    }
  }

  /**
   * List all drafts
   */
  async listDrafts(maxResults: number = 10): Promise<Draft[]> {
    const response = await this.gmail.users.drafts.list({
      userId: 'me',
      maxResults,
    });

    const drafts: Draft[] = [];
    for (const draft of response.data.drafts || []) {
      if (draft.id) {
        const draftDetail = await this.getDraft(draft.id);
        if (draftDetail) {
          drafts.push(draftDetail);
        }
      }
    }

    return drafts;
  }

  /**
   * Get a single draft
   */
  async getDraft(draftId: string): Promise<Draft | null> {
    try {
      const response = await this.gmail.users.drafts.get({
        userId: 'me',
        id: draftId,
        format: 'full',
      });

      const draft = response.data;
      const message = draft.message;
      const headers = message?.payload?.headers || [];

      const getHeader = (name: string): string => {
        const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
        return header?.value || '';
      };

      return {
        id: draft.id || '',
        message: {
          id: message?.id || '',
          threadId: message?.threadId || '',
          subject: getHeader('Subject'),
          to: getHeader('To'),
          snippet: message?.snippet || '',
        },
      };
    } catch (error) {
      console.error(`Error fetching draft ${draftId}:`, error);
      return null;
    }
  }

  /**
   * Create a draft
   */
  async createDraft(params: DraftParams): Promise<{ id: string; messageId: string }> {
    const emailLines: string[] = [];

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

    const response = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
        },
      },
    });

    return {
      id: response.data.id || '',
      messageId: response.data.message?.id || '',
    };
  }

  /**
   * Update a draft
   */
  async updateDraft(draftId: string, params: DraftParams): Promise<{ id: string; messageId: string }> {
    const emailLines: string[] = [];

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

    const response = await this.gmail.users.drafts.update({
      userId: 'me',
      id: draftId,
      requestBody: {
        message: {
          raw: encodedMessage,
        },
      },
    });

    return {
      id: response.data.id || '',
      messageId: response.data.message?.id || '',
    };
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId: string): Promise<void> {
    await this.gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });
  }

  /**
   * Send a draft
   */
  async sendDraft(draftId: string): Promise<{ id: string; threadId: string }> {
    const response = await this.gmail.users.drafts.send({
      userId: 'me',
      requestBody: {
        id: draftId,
      },
    });

    return {
      id: response.data.id || '',
      threadId: response.data.threadId || '',
    };
  }

  /**
   * Get email with attachment info
   */
  async getEmailWithAttachments(messageId: string): Promise<EmailWithAttachments | null> {
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
      const attachments: AttachmentInfo[] = [];
      const payload = message.payload;

      const extractParts = (parts: gmail_v1.Schema$MessagePart[] | undefined) => {
        if (!parts) return;

        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            attachments.push({
              filename: part.filename,
              mimeType: part.mimeType || 'application/octet-stream',
              size: part.body.size || 0,
              attachmentId: part.body.attachmentId,
            });
          } else if (part.mimeType === 'text/plain' && part.body?.data && !body) {
            body = Buffer.from(part.body.data, 'base64').toString('utf8');
          } else if (part.parts) {
            extractParts(part.parts);
          }
        }
      };

      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf8');
      } else if (payload?.parts) {
        extractParts(payload.parts);
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
        attachments,
      };
    } catch (error) {
      console.error(`Error fetching email ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Download an attachment
   */
  async getAttachment(messageId: string, attachmentId: string): Promise<{ data: string; size: number } | null> {
    try {
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      return {
        data: response.data.data || '',
        size: response.data.size || 0,
      };
    } catch (error) {
      console.error(`Error fetching attachment ${attachmentId}:`, error);
      return null;
    }
  }

  /**
   * Get unread email count
   */
  async getUnreadCount(query?: string): Promise<number> {
    const fullQuery = query ? `is:unread ${query}` : 'is:unread';
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      q: fullQuery,
      maxResults: 1,
    });

    return response.data.resultSizeEstimate || 0;
  }

  /**
   * Get vacation/auto-reply settings
   */
  async getVacationSettings(): Promise<{
    enableAutoReply: boolean;
    responseSubject: string;
    responseBodyPlainText: string;
    restrictToContacts: boolean;
    restrictToDomain: boolean;
    startTime: string | null;
    endTime: string | null;
  }> {
    const response = await this.gmail.users.settings.getVacation({
      userId: 'me',
    });

    const settings = response.data;
    return {
      enableAutoReply: settings.enableAutoReply || false,
      responseSubject: settings.responseSubject || '',
      responseBodyPlainText: settings.responseBodyPlainText || '',
      restrictToContacts: settings.restrictToContacts || false,
      restrictToDomain: settings.restrictToDomain || false,
      startTime: settings.startTime ? new Date(parseInt(settings.startTime)).toISOString() : null,
      endTime: settings.endTime ? new Date(parseInt(settings.endTime)).toISOString() : null,
    };
  }

  /**
   * Set vacation/auto-reply settings
   */
  async setVacationSettings(params: {
    enableAutoReply: boolean;
    responseSubject?: string;
    responseBodyPlainText?: string;
    responseBodyHtml?: string;
    restrictToContacts?: boolean;
    restrictToDomain?: boolean;
    startTime?: Date;
    endTime?: Date;
  }): Promise<void> {
    await this.gmail.users.settings.updateVacation({
      userId: 'me',
      requestBody: {
        enableAutoReply: params.enableAutoReply,
        responseSubject: params.responseSubject,
        responseBodyPlainText: params.responseBodyPlainText,
        responseBodyHtml: params.responseBodyHtml,
        restrictToContacts: params.restrictToContacts,
        restrictToDomain: params.restrictToDomain,
        startTime: params.startTime ? params.startTime.getTime().toString() : undefined,
        endTime: params.endTime ? params.endTime.getTime().toString() : undefined,
      },
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
