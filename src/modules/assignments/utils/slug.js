export function slugify(text) {
  return (
    String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'assignment'
  );
}

export async function ensureUniqueAssignmentSlug(Assignment, courseId, base, excludeId = null) {
  let slug = slugify(base);
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const filter = { courseId, slug: candidate, deletedAt: null };
    if (excludeId) filter._id = { $ne: excludeId };
    const exists = await Assignment.exists(filter);
    if (!exists) return candidate;
    i += 1;
  }
}
