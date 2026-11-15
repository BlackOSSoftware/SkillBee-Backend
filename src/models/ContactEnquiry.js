import mongoose from 'mongoose';
import { ENQUIRY_CATEGORIES, SUPPORT_STATUS } from '../config/security.js';

const statusHistoryEntry = new mongoose.Schema(
  {
    from: { type: String, default: null },
    to: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const enquiryReplySchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['admin', 'instructor'], required: true },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    /** Set when the reply email was queued (never claims delivery). */
    notifiedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const internalNoteSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, enum: ['admin', 'instructor'], required: true },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const contactEnquirySchema = new mongoose.Schema(
  {
    /** Public-facing reference, e.g. ENQ-7F3K2Q9X */
    referenceNumber: { type: String, required: true, unique: true, trim: true, maxlength: 20, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, index: true },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 10000 },
    category: {
      type: String,
      enum: [...ENQUIRY_CATEGORIES, ''],
      default: 'general',
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SUPPORT_STATUS),
      default: SUPPORT_STATUS.OPEN,
      index: true,
    },
    replies: { type: [enquiryReplySchema], default: [] },
    internalNotes: { type: [internalNoteSchema], default: [] },
    statusHistory: { type: [statusHistoryEntry], default: [] },
    reviewedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

contactEnquirySchema.index({ status: 1, createdAt: -1 });
contactEnquirySchema.index({ email: 1, createdAt: -1 });
contactEnquirySchema.index({ createdAt: -1 });

contactEnquirySchema.methods.pushStatus = function pushStatus(from, to, actorId) {
  this.statusHistory = this.statusHistory || [];
  this.statusHistory.push({ from: from || null, to, actorId: actorId || null, at: new Date() });
  if (this.statusHistory.length > 100) this.statusHistory = this.statusHistory.slice(-100);
};

contactEnquirySchema.methods.toSafeObject = function toSafeObject({ includeAdmin = false } = {}) {
  const base = {
    id: this._id.toString(),
    referenceNumber: this.referenceNumber,
    name: this.name,
    email: this.email,
    phone: this.phone || '',
    subject: this.subject,
    message: this.message,
    category: this.category || 'general',
    status: this.status,
    replies: (this.replies || []).map((r) => ({
      id: r._id.toString(),
      senderId: r.senderId?.toString?.() || String(r.senderId),
      senderRole: r.senderRole,
      message: r.message,
      notifiedAt: r.notifiedAt,
      createdAt: r.createdAt,
    })),
    statusHistory: (this.statusHistory || []).map((h) => ({
      from: h.from,
      to: h.to,
      actorId: h.actorId?.toString?.() || null,
      at: h.at,
    })),
    reviewedAt: this.reviewedAt,
    resolvedAt: this.resolvedAt,
    closedAt: this.closedAt,
    lastActivityAt: this.lastActivityAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
  if (includeAdmin) {
    base.internalNotes = (this.internalNotes || []).map((n) => ({
      id: n._id.toString(),
      authorId: n.authorId?.toString?.() || String(n.authorId),
      authorRole: n.authorRole,
      message: n.message,
      createdAt: n.createdAt,
    }));
    base.deletedAt = this.deletedAt;
  }
  return base;
};

export const ContactEnquiry = mongoose.model('ContactEnquiry', contactEnquirySchema);
