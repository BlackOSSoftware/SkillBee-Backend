import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    htmlBody: { type: String, required: true, maxlength: 50000 },
    textBody: { type: String, required: true, maxlength: 20000 },
    variables: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    isSystem: { type: Boolean, default: false },
    /** Built-in design revision — system templates are upgraded when this is bumped. */
    designVersion: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

emailTemplateSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    subject: this.subject,
    htmlBody: this.htmlBody,
    textBody: this.textBody,
    variables: this.variables || [],
    isActive: this.isActive,
    isSystem: this.isSystem,
    designVersion: this.designVersion ?? 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
