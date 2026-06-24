const crypto = require("crypto");
const { get, put } = require("@vercel/blob");
const { findLocation } = require("./_locations");
const {
  authenticateDemo,
  demoUserFromSession,
} = require("./_demo-data");

const COOKIE_NAME = "cubic_portal_session";
const USERS_PATH = "portal/users.json";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const STAFF_ROLES = new Set(["manager", "employee"]);

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
    if (pair.slice(0, index) === name) {
      return decodeURIComponent(pair.slice(index + 1));
    }
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
  const secret = clean(process.env.PORTAL_SESSION_SECRET);
  if (!secret) throw new Error("PORTAL_SESSION_SECRET is not configured.");
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

function makeSession(user) {
  const payload = base64url(JSON.stringify({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locationId: user.locationId || "",
    demo: Boolean(user.demo),
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

function setSessionCookie(req, res, user) {
  const secure = (req.headers["x-forwarded-proto"] || "").includes("https") || process.env.VERCEL === "1";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(makeSession(user))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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

async function readStaffUsers() {
  try {
    const result = await get(USERS_PATH, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const data = JSON.parse(await streamToText(result.stream));
    return Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    if (error && /not found/i.test(String(error.message || ""))) return [];
    throw error;
  }
}

async function writeStaffUsers(users) {
  await put(USERS_PATH, JSON.stringify({ users }, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

function ownerUser() {
  return {
    id: "owner",
    email: normalizeEmail(process.env.PORTAL_OWNER_EMAIL || "moed@cubicship.com"),
    name: "Owner",
    role: "owner",
    locationId: "",
    locationName: "All locations",
    active: true,
  };
}

function publicUser(user) {
  const location = user.locationId ? findLocation(user.locationId) : null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    accountType: user.accountType || "person",
    locationId: user.locationId || "",
    locationName: user.locationName || location?.name || (user.role === "owner" ? "All locations" : ""),
    branchEmail: location?.branchEmail || "",
    active: user.active !== false,
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    demo: Boolean(user.demo),
  };
}

async function authenticate(email, password) {
  const demo = authenticateDemo(email, password);
  if (demo) return demo;

  const normalized = normalizeEmail(email);
  const owner = ownerUser();
  if (normalized === owner.email) {
    const hash = clean(process.env.PORTAL_OWNER_PASSWORD_HASH);
    if (hash && verifyPassword(password, hash)) return owner;
    return null;
  }

  const users = await readStaffUsers();
  const user = users.find((item) => normalizeEmail(item.email) === normalized && item.active !== false);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  user.lastLoginAt = new Date().toISOString();
  await writeStaffUsers(users);
  return user;
}

async function requireUser(req, res) {
  const session = verifySessionToken(readCookie(req, COOKIE_NAME));
  if (!session) {
    json(res, 401, { ok: false, error: "Please log in to the operator portal." });
    return null;
  }

  const demo = demoUserFromSession(session);
  if (demo) return demo;

  if (session.role === "owner" && normalizeEmail(session.email) === ownerUser().email) {
    return ownerUser();
  }

  const users = await readStaffUsers();
  const user = users.find((item) => item.id === session.sub && normalizeEmail(item.email) === normalizeEmail(session.email));
  if (!user || user.active === false) {
    json(res, 401, { ok: false, error: "This portal account is no longer active." });
    return null;
  }
  return user;
}

async function requireOwner(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== "owner") {
    json(res, 403, { ok: false, error: "Owner access is required." });
    return null;
  }
  return user;
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
  STAFF_ROLES,
  authenticate,
  clean,
  clearSessionCookie,
  hashPassword,
  json,
  normalizeEmail,
  ownerUser,
  publicUser,
  readBody,
  readStaffUsers,
  requireOwner,
  requireUser,
  setSessionCookie,
  writeStaffUsers,
};
