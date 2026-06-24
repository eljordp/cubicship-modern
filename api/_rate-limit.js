const buckets = global.__cubicRateLimitBuckets || new Map();
global.__cubicRateLimitBuckets = buckets;

function clean(value) {
  return String(value || "").trim();
}

function clientIp(req) {
  return clean(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function consumeRateLimit(req, { scope, identity = "", limit, windowMs }) {
  const now = Date.now();
  const key = [scope, clientIp(req), clean(identity).toLowerCase()].filter(Boolean).join(":");
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function sendRateLimited(res, result, message) {
  res.statusCode = 429;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Retry-After", String(result.retryAfter));
  res.end(JSON.stringify({ ok: false, error: message }));
}

module.exports = {
  consumeRateLimit,
  sendRateLimited,
};
