export function buildPagination({ page = 1, limit = 20, total = 0 }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const totalPages = Math.ceil(total / safeLimit) || 0;

  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
}

export function getSkip({ page, limit }) {
  return (page - 1) * limit;
}
