import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    companyName: { type: String, trim: true, maxlength: 200, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    alternatePhone: { type: String, trim: true, maxlength: 30, default: '' },
    whatsappNumber: { type: String, trim: true, maxlength: 30, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    city: { type: String, trim: true, maxlength: 120, default: '' },
    state: { type: String, trim: true, maxlength: 120, default: '' },
    country: { type: String, trim: true, maxlength: 120, default: '' },
    postalCode: { type: String, trim: true, maxlength: 20, default: '' },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 15, default: '' },
    businessHours: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

const socialLinksSchema = new mongoose.Schema(
  {
    facebook: { type: String, trim: true, maxlength: 500, default: '' },
    instagram: { type: String, trim: true, maxlength: 500, default: '' },
    linkedin: { type: String, trim: true, maxlength: 500, default: '' },
    youtube: { type: String, trim: true, maxlength: 500, default: '' },
    twitter: { type: String, trim: true, maxlength: 500, default: '' },
    telegram: { type: String, trim: true, maxlength: 500, default: '' },
    whatsapp: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    contact: { type: contactSchema, default: () => ({}) },
    socialLinks: { type: socialLinksSchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false }
);

siteSettingsSchema.methods.toAdminObject = function toAdminObject() {
  return {
    id: this._id.toString(),
    contact: this.contact || {},
    socialLinks: this.socialLinks || {},
    updatedBy: this.updatedBy?.toString?.() || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

siteSettingsSchema.methods.toPublicObject = function toPublicObject() {
  const c = this.contact || {};
  const s = this.socialLinks || {};
  return {
    contact: {
      companyName: c.companyName || '',
      email: c.email || '',
      phone: c.phone || '',
      alternatePhone: c.alternatePhone || '',
      whatsappNumber: c.whatsappNumber || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || '',
      country: c.country || '',
      postalCode: c.postalCode || '',
      gstin: c.gstin || '',
      businessHours: c.businessHours || '',
    },
    socialLinks: {
      facebook: s.facebook || '',
      instagram: s.instagram || '',
      linkedin: s.linkedin || '',
      youtube: s.youtube || '',
      twitter: s.twitter || '',
      telegram: s.telegram || '',
      whatsapp: s.whatsapp || '',
    },
  };
};

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);
