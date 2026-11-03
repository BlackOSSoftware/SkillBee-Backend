import mongoose from 'mongoose';

export const FAQ_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
});

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 500 },
    answer: { type: String, required: true, maxlength: 20000 },
    category: { type: String, trim: true, maxlength: 120, default: 'general', index: true },
    relatedCourseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
      index: true,
    },
    displayOrder: { type: Number, default: 0, index: true },
    status: {
      type: String,
      enum: Object.values(FAQ_STATUS),
      default: FAQ_STATUS.DRAFT,
      index: true,
    },
    isFeatured: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

faqSchema.index({ status: 1, displayOrder: 1, createdAt: -1 });
faqSchema.index({ relatedCourseId: 1, status: 1, displayOrder: 1 });

faqSchema.methods.toAdminObject = function toAdminObject() {
  return {
    id: this._id.toString(),
    question: this.question,
    answer: this.answer,
    category: this.category,
    relatedCourseId: this.relatedCourseId?.toString?.() || null,
    displayOrder: this.displayOrder,
    status: this.status,
    isFeatured: this.isFeatured,
    createdBy: this.createdBy?.toString?.() || null,
    updatedBy: this.updatedBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

faqSchema.methods.toPublicObject = function toPublicObject() {
  return {
    id: this._id.toString(),
    question: this.question,
    answer: this.answer,
    category: this.category,
    relatedCourseId: this.relatedCourseId?.toString?.() || null,
    displayOrder: this.displayOrder,
    isFeatured: this.isFeatured,
  };
};

export const Faq = mongoose.model('Faq', faqSchema);
