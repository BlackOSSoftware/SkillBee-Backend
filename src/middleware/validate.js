export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(result.error);
    }

    req[source] = result.data;
    return next();
  };
}

export function validateRequest({ body, query, params } = {}) {
  return (req, _res, next) => {
    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) return next(result.error);
      req.body = result.data;
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) return next(result.error);
      req.query = result.data;
    }

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) return next(result.error);
      req.params = result.data;
    }

    return next();
  };
}
