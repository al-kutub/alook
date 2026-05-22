import { eq, desc, and, or } from "drizzle-orm";
import { emails } from "../schema";
import type { Database } from "../index";
import type { EmailDirection } from "../../types";
import { EmailMailbox } from "../../constants";
import type { EmailMailboxType } from "../../constants";
import { getMailboxAddressFields } from "../../lib/email-mailbox";

export interface EmailPagination {
  limit: number;
  offset: number;
}

export interface EmailMailboxFilters {
  status?: string;
  pagination?: EmailPagination;
  address?: string;
}

export async function createEmail(
  db: Database,
  data: { agentId: string; workspaceId: string; fromEmail: string; toEmail: string; subject: string; r2Key: string; isWhitelisted: boolean; forwarded: boolean; direction: EmailDirection; messageId?: string; inReplyTo?: string; references?: string; htmlBody?: string; attachments?: string; status?: string; mailbox?: EmailMailboxType }
) {
  const rows = await db.insert(emails).values(data).returning();
  return rows[0]!;
}

export async function getEmailById(db: Database, id: string, workspaceId: string) {
  const rows = await db.select().from(emails).where(and(eq(emails.id, id), eq(emails.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function getEmailsByAgent(db: Database, agentId: string, workspaceId: string, status?: string, pagination?: EmailPagination) {
  const conditions = [eq(emails.agentId, agentId), eq(emails.workspaceId, workspaceId)];
  if (status) conditions.push(eq(emails.status, status));
  const q = db
    .select()
    .from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt));
  if (pagination) return q.limit(pagination.limit).offset(pagination.offset);
  return q;
}

export async function getInboxEmails(db: Database, agentId: string, agentEmail: string, workspaceId: string, status?: string, pagination?: EmailPagination) {
  const conditions = [eq(emails.agentId, agentId), eq(emails.toEmail, agentEmail), eq(emails.workspaceId, workspaceId), eq(emails.direction, "inbound")];
  if (status) conditions.push(eq(emails.status, status));
  const q = db.select().from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt));
  if (pagination) return q.limit(pagination.limit).offset(pagination.offset);
  return q;
}

export async function getSentEmails(db: Database, agentId: string, agentEmail: string, workspaceId: string, status?: string, pagination?: EmailPagination) {
  const conditions = [eq(emails.agentId, agentId), eq(emails.fromEmail, agentEmail), eq(emails.workspaceId, workspaceId), eq(emails.direction, "outbound")];
  if (status) conditions.push(eq(emails.status, status));
  const q = db.select().from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt));
  if (pagination) return q.limit(pagination.limit).offset(pagination.offset);
  return q;
}

export async function getTrustedEmails(db: Database, agentId: string, agentEmail: string, workspaceId: string, status?: string, pagination?: EmailPagination) {
  const conditions = [eq(emails.agentId, agentId), eq(emails.toEmail, agentEmail), eq(emails.workspaceId, workspaceId), eq(emails.isWhitelisted, true), eq(emails.direction, "inbound")];
  if (status) conditions.push(eq(emails.status, status));
  const q = db.select().from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt));
  if (pagination) return q.limit(pagination.limit).offset(pagination.offset);
  return q;
}

export async function getRejectedEmails(db: Database, agentId: string, agentEmail: string, workspaceId: string, status?: string, pagination?: EmailPagination) {
  const conditions = [eq(emails.agentId, agentId), eq(emails.toEmail, agentEmail), eq(emails.workspaceId, workspaceId), eq(emails.isWhitelisted, false), eq(emails.direction, "inbound")];
  if (status) conditions.push(eq(emails.status, status));
  const q = db.select().from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt));
  if (pagination) return q.limit(pagination.limit).offset(pagination.offset);
  return q;
}

export async function getEmailsByMailbox(
  db: Database,
  agentId: string,
  workspaceId: string,
  mailbox: EmailMailboxType,
  filters: EmailMailboxFilters = {}
) {
  const conditions = [
    eq(emails.agentId, agentId),
    eq(emails.workspaceId, workspaceId),
    eq(emails.mailbox, mailbox),
  ];
  if (filters.status) conditions.push(eq(emails.status, filters.status));
  if (filters.address) {
    const addressFields = getMailboxAddressFields(mailbox);
    if (addressFields.length === 2) {
      conditions.push(or(eq(emails.toEmail, filters.address), eq(emails.fromEmail, filters.address))!);
    } else if (addressFields[0] === "fromEmail") {
      conditions.push(eq(emails.fromEmail, filters.address));
    } else {
      conditions.push(eq(emails.toEmail, filters.address));
    }
  }
  const q = db.select().from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt));
  if (filters.pagination) return q.limit(filters.pagination.limit).offset(filters.pagination.offset);
  return q;
}

export async function getEmailByMessageId(db: Database, messageId: string, workspaceId: string) {
  if (!messageId) return null;
  const rows = await db.select().from(emails).where(and(eq(emails.messageId, messageId), eq(emails.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function updateEmailStatus(db: Database, id: string, workspaceId: string, status: string) {
  const rows = await db.update(emails).set({ status }).where(and(eq(emails.id, id), eq(emails.workspaceId, workspaceId))).returning();
  return rows[0] ?? null;
}

export async function updateEmailMailbox(
  db: Database,
  id: string,
  workspaceId: string,
  mailbox: EmailMailboxType,
  extra?: { status?: string }
) {
  const rows = await db
    .update(emails)
    .set({ mailbox, ...(extra?.status ? { status: extra.status } : {}) })
    .where(and(eq(emails.id, id), eq(emails.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function claimDraftForSend(
  db: Database,
  input: {
    id: string;
    agentId: string;
    workspaceId: string;
  }
) {
  const rows = await db
    .update(emails)
    .set({ status: "sending" })
    .where(and(
      eq(emails.id, input.id),
      eq(emails.agentId, input.agentId),
      eq(emails.workspaceId, input.workspaceId),
      eq(emails.direction, "outbound"),
      eq(emails.mailbox, EmailMailbox.DRAFT),
      eq(emails.status, "draft"),
    ))
    .returning();
  return rows[0] ?? null;
}

export async function finalizeDraftSend(
  db: Database,
  input: {
    id: string;
    agentId: string;
    workspaceId: string;
    patch: {
      r2Key: string;
      messageId: string;
      inReplyTo: string;
      references: string;
      htmlBody: string;
      attachments: string;
      status: string;
      mailbox: EmailMailboxType;
    };
  }
) {
  const rows = await db
    .update(emails)
    .set(input.patch)
    .where(and(
      eq(emails.id, input.id),
      eq(emails.agentId, input.agentId),
      eq(emails.workspaceId, input.workspaceId),
      eq(emails.direction, "outbound"),
      eq(emails.mailbox, EmailMailbox.DRAFT),
      eq(emails.status, "sending"),
    ))
    .returning();
  return rows[0] ?? null;
}

export async function restoreDraftAfterSendFailure(
  db: Database,
  input: {
    id: string;
    agentId: string;
    workspaceId: string;
  }
) {
  const rows = await db
    .update(emails)
    .set({ status: "draft" })
    .where(and(
      eq(emails.id, input.id),
      eq(emails.agentId, input.agentId),
      eq(emails.workspaceId, input.workspaceId),
      eq(emails.direction, "outbound"),
      eq(emails.mailbox, EmailMailbox.DRAFT),
      eq(emails.status, "sending"),
    ))
    .returning();
  return rows[0] ?? null;
}

export async function markDraftSendUnknown(
  db: Database,
  input: {
    id: string;
    agentId: string;
    workspaceId: string;
  }
) {
  const rows = await db
    .update(emails)
    .set({ status: "send_unknown" })
    .where(and(
      eq(emails.id, input.id),
      eq(emails.agentId, input.agentId),
      eq(emails.workspaceId, input.workspaceId),
      eq(emails.direction, "outbound"),
      eq(emails.mailbox, EmailMailbox.DRAFT),
      eq(emails.status, "sending"),
    ))
    .returning();
  return rows[0] ?? null;
}

export async function deleteEmail(db: Database, id: string, workspaceId: string) {
  return db.delete(emails).where(and(eq(emails.id, id), eq(emails.workspaceId, workspaceId)));
}
