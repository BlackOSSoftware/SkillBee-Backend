import mongoose from 'mongoose';
import {
  MESSAGE_VISIBILITY,
  SUPPORT_STATUS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_SENDER_ROLES,
} from '../config/security.js';

const statusHistoryEntry = new mongoose.Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const attachmentRefSchema = new mongoose.Schema(
  {
    mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    fileName: { type: String, trim: true, maxlength: 255, default: '' },
    mimeType: { type: String, trim: true, maxlength: 120, default: '' },
    /** Public-safe URL only (never signed private URLs) */
    publicUrl: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { _id: true }
);

const ticketMessageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: Object.values(TICKET_SENDER_ROLES), required: true },
    /** public = visible to the student; internal = staff-only note */
    visibility: {
      type: String,
      enum: Object.values(MESSAGE_VISIBILITY),
      default: MESSAGE_VISIBILITY.PUBLIC,
      index: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    attachments: { type: [attachmentRefSchema], default: [] },
    /** Client idempotency key to prevent duplicate replies on retry */
    idempotencyKey: { type: String, trim: true, maxlength: 120, default: null },
    /** Set when the reply notification email was queued (never claims delivery). */
    notifiedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    /** Public-facing reference, e.g. TKT-7F3K2Q9X */
    ticketNumber: { type: String, required: true, unique: true, trim: true, maxlength: 20, index: true },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [...TICKET_CATEGORIES],
      required: true,
      index: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    priority: {
      type: String,
      enum: Object.values(TICKET_PRIORITIES),
      default: 'normal',
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SUPPORT_STATUS),
      default: SUPPORT_STATUS.OPEN,
      index: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    messages: { type: [ticketMessageSchema], default: [] },
    statusHistory: { type: [statusHistoryEntry], default: [] },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

supportTicketSchema.index({ studentId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ category: 1, status: 1, lastActivityAt: -1 });
supportTicketSchema.index({ createdAt: -1 });

supportTicketSchema.methods.pushStatus = function pushStatus(from, to, actorId) {
  this.statusHistory = this.statusHistory || [];
  this.statusHistory.push({ from: from || null, to, actorId: actorId || null, at: new Date() });
  if (this.statusHistory.length > 100) this.statusHistory = this.statusHistory.slice(-100);
};

function mapMessage(m) {
  return {
    id: m._id.toString(),
    senderId: m.senderId?.toString?.() || String(m.senderId),
    senderRole: m.senderRole,
    visibility: m.visibility,
    message: m.message,
    attachments: (m.attachments || []).map((a) => ({
      id: a._id?.toString?.(),
      mediaAssetId: a.mediaAssetId?.toString?.() || null,
      fileName: a.fileName || '',
      mimeType: a.mimeType || '',
      publicUrl: a.publicUrl || '',
    })),
    notifiedAt: m.notifiedAt,
    createdAt: m.createdAt,
  };
}

supportTicketSchema.methods.toSafeObject = function toSafeObject({ includeInternal = false } = {}) {
  const messages = (this.messages || []).filter(
    (m) => includeInternal || m.visibility === MESSAGE_VISIBILITY.PUBLIC
  );
  const base = {
    id: this._id.toString(),
    ticketNumber: this.ticketNumber,
    studentId: this.studentId?.toString?.() || String(this.studentId),
    category: this.category,
    subject: this.subject,
    description: this.description,
    priority: this.priority,
    status: this.status,
    assignedTo: this.assignedTo?.toString?.() || null,
    messages: messages.map(mapMessage),
    statusHistory: (this.statusHistory || []).map((h) => ({
      from: h.from,
      to: h.to,
      actorId: h.actorId?.toString?.() || null,
      at: h.at,
    })),
    resolvedAt: this.resolvedAt,
    closedAt: this.closedAt,
    lastActivityAt: this.lastActivityAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (includeInternal) {
    base.deletedAt = this.deletedAt;
  }
  return base;
};

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
