import mongoose from 'mongoose';

export const CERTIFICATE_TEMPLATE_STATUSES = Object.freeze(['draft', 'active', 'inactive']);

const mediaRefSchema = new mongoose.Schema(
  {
    storageKey: { type: String, trim: true, default: null },
    mediaAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', default: null },
    url: { type: String, trim: true, default: null },
    originalFileName: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const certificateTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    templateCode: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    backgroundImage: { type: mediaRefSchema, default: () => ({}) },
    organizationName: { type: String, trim: true, maxlength: 200, default: 'SkillBee' },
    organizationLogo: { type: mediaRefSchema, default: () => ({}) },
    signatureImage: { type: mediaRefSchema, default: () => ({}) },
    authorizedSignatoryName: { type: String, trim: true, maxlength: 200, default: '' },
    authorizedSignatoryDesignation: { type: String, trim: true, maxlength: 200, default: '' },
    certificateTitle: {
      type: String,
      trim: true,
      maxlength: 200,
      default: 'Certificate of Completion',
    },
    certificateDescription: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: 'This certifies that the learner has successfully completed the course.',
    },
    fieldConfiguration: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        showStudentName: true,
        showCourseName: true,
        showCertificateNumber: true,
        showCompletionDate: true,
        showIssueDate: true,
        showVerificationUrl: true,
        showQrCode: true,
        showSignatory: true,
      }),
    },
    layoutConfiguration: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        orientation: 'landscape',
        pageWidth: 842,
        pageHeight: 595,
        margin: 40,
      }),
    },
    status: {
      type: String,
      enum: CERTIFICATE_TEMPLATE_STATUSES,
      default: 'draft',
      index: true,
    },
    isDefault: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null, index: true },
    isDemoSeed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

certificateTemplateSchema.index(
  { templateCode: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
certificateTemplateSchema.index({ status: 1, deletedAt: 1, isDefault: 1 });

certificateTemplateSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    templateCode: this.templateCode,
    backgroundImage: this.backgroundImage,
    organizationName: this.organizationName,
    organizationLogo: this.organizationLogo,
    signatureImage: this.signatureImage,
    authorizedSignatoryName: this.authorizedSignatoryName,
    authorizedSignatoryDesignation: this.authorizedSignatoryDesignation,
    certificateTitle: this.certificateTitle,
    certificateDescription: this.certificateDescription,
    fieldConfiguration: this.fieldConfiguration,
    layoutConfiguration: this.layoutConfiguration,
    status: this.status,
    isDefault: this.isDefault,
    createdBy: this.createdBy?.toString?.() || null,
    updatedBy: this.updatedBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

certificateTemplateSchema.methods.toSnapshot = function toSnapshot() {
  return {
    templateId: this._id.toString(),
    name: this.name,
    templateCode: this.templateCode,
    organizationName: this.organizationName,
    authorizedSignatoryName: this.authorizedSignatoryName,
    authorizedSignatoryDesignation: this.authorizedSignatoryDesignation,
    certificateTitle: this.certificateTitle,
    certificateDescription: this.certificateDescription,
    fieldConfiguration: this.fieldConfiguration,
    layoutConfiguration: this.layoutConfiguration,
    backgroundImage: this.backgroundImage,
    organizationLogo: this.organizationLogo,
    signatureImage: this.signatureImage,
    snapshottedAt: new Date(),
  };
};

export const CertificateTemplate = mongoose.model(
  'CertificateTemplate',
  certificateTemplateSchema
);
