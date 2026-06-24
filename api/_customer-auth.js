const crypto = require("crypto");
const { get, put } = require("@vercel/blob");

const COOKIE_NAME = "cubic_customer_session";
const USERS_PATH = "portal/customers.json";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const pairs = header.split(";").map((part) => part.trim());
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index) === name) return decodeURIComponent(pair.slice(index + 1));
  }
  return "";
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function sessionSecret() {
  const secret = clean(process.env.CUSTOMER_SESSION_SECRET || process.env.PORTAL_SESSION_SECRET);
  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET or PORTAL_SESSION_SECRET is not configured.");
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 310000;
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = clean(storedHash).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("hex");
  return safeCompare(actual, expected);
}

function makeSession(customer) {
  const payload = base64url(JSON.stringify({
    sub: customer.id,
    email: customer.email,
    name: customer.name,
    source: customer.source || "blob",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }));
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  const [payload, signature] = clean(token).split(".");
  if (!payload || !signature || !safeCompare(sign(payload), signature)) return null;
  try {
    const data = JSON.parse(fromBase64url(payload));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (error) {
    return null;
  }
}

function setCustomerCookie(req, res, customer) {
  const secure = (req.headers["x-forwarded-proto"] || "").includes("https") || process.env.VERCEL === "1";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(makeSession(customer))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearCustomerCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function readCustomerSession(req) {
  return verifySessionToken(readCookie(req, COOKIE_NAME));
}

async function streamToText(stream) {
  const chunks = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readCustomers() {
  try {
    const result = await get(USERS_PATH, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const data = JSON.parse(await streamToText(result.stream));
    return Array.isArray(data.customers) ? data.customers : [];
  } catch (error) {
    if (error && /not found/i.test(String(error.message || ""))) return [];
    throw error;
  }
}

async function writeCustomers(customers) {
  await put(USERS_PATH, JSON.stringify({ customers }, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || "",
    company: customer.company || "",
    accountType: customer.accountType || "personal",
    businessProfile: customer.businessProfile || null,
    createdAt: customer.createdAt || null,
    lastLoginAt: customer.lastLoginAt || null,
  };
}

async function authenticateCustomer(email, password) {
  const normalized = normalizeEmail(email);
  const customers = await readCustomers();
  const customer = customers.find((item) => normalizeEmail(item.email) === normalized && item.active !== false);
  if (!customer || !verifyPassword(password, customer.passwordHash)) return null;
  customer.lastLoginAt = new Date().toISOString();
  await writeCustomers(customers);
  return customer;
}

async function requireCustomer(req, res) {
  const session = verifySessionToken(readCookie(req, COOKIE_NAME));
  if (!session) {
    json(res, 401, { ok: false, error: "Please log in to your Cubic Ship account." });
    return null;
  }
  if (session.source === "supabase") {
    json(res, 401, { ok: false, error: "Please log in to your Cubic Ship account again." });
    return null;
  }

  const customers = await readCustomers();
  const customer = customers.find((item) => item.id === session.sub && normalizeEmail(item.email) === normalizeEmail(session.email));
  if (!customer || customer.active === false) {
    json(res, 401, { ok: false, error: "This customer account is no longer active." });
    return null;
  }
  return customer;
}

async function readBody(req) {
  if (typeof req.body === "object" && req.body) return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = {
  authenticateCustomer,
  clean,
  clearCustomerCookie,
  hashPassword,
  json,
  normalizeEmail,
  publicCustomer,
  readBody,
  readCustomerSession,
  readCustomers,
  requireCustomer,
  setCustomerCookie,
  writeCustomers,
};
