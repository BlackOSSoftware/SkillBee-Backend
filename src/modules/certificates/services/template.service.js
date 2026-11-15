import { CertificateTemplate } from '../../../models/CertificateTemplate.js';
import { Certificate } from '../../../models/Certificate.js';
import { MediaAsset } from '../../../models/MediaAsset.js';
import { AppError } from '../../../utils/AppError.js';
import { getOrSetCache } from '../../../services/cache/cache.service.js';
import { CACHE_TTL, certificateTemplatesKey } from '../../../services/cache/keys.js';
import { invalidateCertificateCaches } from '../../../services/cache/invalidation.service.js';

function slugifyCode(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

const MEDIA_FIELDS = ['backgroundImage', 'organizationLogo', 'signatureImage'];

/**
 * Template images reference uploaded image assets. The stored URL is taken from the asset, never
 * from the client; an empty reference clears the image.
 */
async function normalizeMediaRefs(input) {
  const out = { ...input };
  for (const key of MEDIA_FIELDS) {
    const ref = input[key];
    if (ref === undefined) continue;
    if (!ref || (!ref.mediaAssetId && !ref.storageKey && !ref.url)) {
      out[key] = {};
      continue;
    }
    if (ref.mediaAssetId) {
      const asset = await MediaAsset.findOne({ _id: ref.mediaAssetId, deletedAt: null, mediaType: 'image' })
        .select('secureUrl originalFileName')
        .lean();
      if (!asset) throw new AppError(`Image for ${key} was not found`, 400, 'TEMPLATE_IMAGE_NOT_FOUND');
      out[key] = {
        mediaAssetId: asset._id,
        url: asset.secureUrl || null,
        originalFileName: ref.originalFileName || asset.originalFileName || null,
        storageKey: null,
      };
    }
  }
  return out;
}

export async function listTemplates(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const filter = { deletedAt: null };
  if (query.status) filter.status = query.status;
  if (query.search) {
    filter.name = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  return getOrSetCache(certificateTemplatesKey(query), CACHE_TTL.STATIC, async () => {
    const [rows, total] = await Promise.all([
      CertificateTemplate.find(filter)
        .sort({ isDefault: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CertificateTemplate.countDocuments(filter),
    ]);
    return {
      templates: rows.map((t) => t.toSafeObject()),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  });
}

export async function getTemplate(id) {
  const template = await CertificateTemplate.findOne({ _id: id, deletedAt: null });
  if (!template) throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
  return template.toSafeObject();
}

export async function createTemplate(req, rawInput) {
  const input = await normalizeMediaRefs(rawInput);
  const code = slugifyCode(input.templateCode || input.name);
  const exists = await CertificateTemplate.exists({ templateCode: code, deletedAt: null });
  if (exists) throw new AppError('Template code already exists', 409, 'TEMPLATE_CODE_EXISTS');

  const template = new CertificateTemplate({
    ...input,
    templateCode: code,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  if (input.isDefault) {
    await CertificateTemplate.updateMany(
      { deletedAt: null, isDefault: true },
      { $set: { isDefault: false } }
    );
    template.isDefault = true;
    template.status = template.status === 'draft' ? 'active' : template.status;
  }
  await template.save();
  await invalidateCertificateCaches();
  return template.toSafeObject();
}

export async function updateTemplate(req, id, rawInput) {
  const template = await CertificateTemplate.findOne({ _id: id, deletedAt: null });
  if (!template) throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
  const input = await normalizeMediaRefs(rawInput);

  const assignable = [
    'name',
    'description',
    'backgroundImage',
    'organizationName',
    'organizationLogo',
    'signatureImage',
    'authorizedSignatoryName',
    'authorizedSignatoryDesignation',
    'certificateTitle',
    'certificateDescription',
    'fieldConfiguration',
    'layoutConfiguration',
    'status',
  ];
  for (const key of assignable) {
    if (input[key] !== undefined) template[key] = input[key];
  }
  if (input.templateCode) {
    const code = slugifyCode(input.templateCode);
    const clash = await CertificateTemplate.exists({
      templateCode: code,
      deletedAt: null,
      _id: { $ne: template._id },
    });
    if (clash) throw new AppError('Template code already exists', 409, 'TEMPLATE_CODE_EXISTS');
    template.templateCode = code;
  }
  template.updatedBy = req.user._id;
  await template.save();
  await invalidateCertificateCaches();
  return template.toSafeObject();
}

export async function setTemplateStatus(req, id, status) {
  return updateTemplate(req, id, { status });
}

export async function setDefaultTemplate(req, id) {
  const template = await CertificateTemplate.findOne({ _id: id, deletedAt: null });
  if (!template) throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
  await CertificateTemplate.updateMany(
    { deletedAt: null, isDefault: true },
    { $set: { isDefault: false } }
  );
  template.isDefault = true;
  if (template.status !== 'active') template.status = 'active';
  template.updatedBy = req.user._id;
  await template.save();
  await invalidateCertificateCaches();
  return template.toSafeObject();
}

export async function duplicateTemplate(req, id) {
  const source = await CertificateTemplate.findOne({ _id: id, deletedAt: null });
  if (!source) throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
  const code = slugifyCode(`${source.templateCode}-copy-${Date.now().toString(36)}`);
  const copy = new CertificateTemplate({
    name: `${source.name} (Copy)`,
    description: source.description,
    templateCode: code,
    backgroundImage: source.backgroundImage,
    organizationName: source.organizationName,
    organizationLogo: source.organizationLogo,
    signatureImage: source.signatureImage,
    authorizedSignatoryName: source.authorizedSignatoryName,
    authorizedSignatoryDesignation: source.authorizedSignatoryDesignation,
    certificateTitle: source.certificateTitle,
    certificateDescription: source.certificateDescription,
    fieldConfiguration: source.fieldConfiguration,
    layoutConfiguration: source.layoutConfiguration,
    status: 'draft',
    isDefault: false,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await copy.save();
  await invalidateCertificateCaches();
  return copy.toSafeObject();
}

export async function deleteTemplate(req, id) {
  const template = await CertificateTemplate.findOne({ _id: id, deletedAt: null });
  if (!template) throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');

  const referenced = await Certificate.exists({
    certificateTemplateId: template._id,
    deletedAt: null,
  });
  if (referenced) {
    throw new AppError(
      'Cannot delete template referenced by issued certificates',
      409,
      'TEMPLATE_IN_USE'
    );
  }

  template.deletedAt = new Date();
  template.isDefault = false;
  template.updatedBy = req.user._id;
  await template.save();
  await invalidateCertificateCaches();
  return { id: template._id.toString(), deleted: true };
}

export async function resolveIssuableTemplate(templateId) {
  let template = null;
  if (templateId) {
    template = await CertificateTemplate.findOne({
      _id: templateId,
      deletedAt: null,
      status: 'active',
    });
  }
  if (!template) {
    template = await CertificateTemplate.findOne({
      deletedAt: null,
      status: 'active',
      isDefault: true,
    });
  }
  if (!template) {
    template = await CertificateTemplate.findOne({ deletedAt: null, status: 'active' }).sort({
      updatedAt: -1,
    });
  }
  if (!template) {
    throw new AppError('No active certificate template available', 400, 'NO_ACTIVE_TEMPLATE');
  }
  return template;
}
