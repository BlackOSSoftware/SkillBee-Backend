import mongoose from 'mongoose';
import { QUESTION_SENDER_ROLES } from '../config/security.js';

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

const questionReplySchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseQuestion',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: Object.values(QUESTION_SENDER_ROLES),
      required: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    attachments: { type: [attachmentRefSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
    /** Client idempotency key to prevent duplicate replies on retry */
    idempotencyKey: { type: String, trim: true, maxlength: 120, default: null },
  },
  { timestamps: true, versionKey: false }
);

questionReplySchema.index({ questionId: 1, createdAt: 1 });
questionReplySchema.index(
  { questionId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' }, deletedAt: null },
  }
);

questionReplySchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    questionId: this.questionId.toString(),
    senderId: this.senderId?.toString?.() || String(this.senderId),
    senderRole: this.senderRole,
    message: this.message,
    attachments: (this.attachments || []).map((a) => ({
      id: a._id?.toString?.(),
      mediaAssetId: a.mediaAssetId?.toString?.() || null,
      fileName: a.fileName || '',
      mimeType: a.mimeType || '',
      publicUrl: a.publicUrl || '',
    })),
    editedAt: this.editedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const QuestionReply = mongoose.model('QuestionReply', questionReplySchema);
