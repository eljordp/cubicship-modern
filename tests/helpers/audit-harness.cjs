const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function createHarness(options = {}) {
  const state = {
    items: [],
    version: 0,
    exists: false,
    emails: [],
    writes: 0,
    failEmail: false,
    failStore: false,
  };
  const blob = {
    get: async () =>
      state.exists
        ? {
            statusCode: 200,
            blob: { etag: String(state.version) },
            stream: new ReadableStream({
              start(c) {
                c.enqueue(
                  Buffer.from(
                    JSON.stringify({ shipments: structuredClone(state.items) }),
                  ),
                );
                c.close();
              },
            }),
          }
        : null,
    put: async (p, body, opt) => {
      if (state.failStore) throw Error("Storage unavailable");
      if (
        (state.exists && !opt.allowOverwrite) ||
        (opt.ifMatch && opt.ifMatch !== String(state.version))
      ) {
        const e = Error("ETag precondition failed");
        e.name = "BlobPreconditionFailedError";
        throw e;
      }
      state.items = JSON.parse(body).shipments;
      state.version++;
      state.exists = true;
      state.writes++;
      return { etag: String(state.version) };
    },
  };
  const json = (res, status, data) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  const auth = {
    clean: (v) => String(v || "").trim(),
    json,
    readBody: async (req) => req.body,
    publicCustomer: (x) => x,
    requireCustomer: async () => ({
      id: "test-customer",
      name: "Test Customer",
      email: "test@example.com",
    }),
    requireUser: async () => ({
      id: "test-staff",
      role: "owner",
      name: "Test Staff",
      email: "staff@example.com",
      locationId: "dearborn",
    }),
  };
  const modules = {};
  function load(name) {
    if (["customer-recovery", "intake-availability", "request-status", "service-request"].includes(name)) name = "_" + name;
    if (modules[name]) return modules[name];
    const filename = path.resolve(__dirname, "../../api", name + ".js"),
      module = { exports: {} };
    const requireFrom = require("node:module").createRequire(filename);
    const overrides = {
      "@vercel/blob": blob,
      "./_customer-auth": auth,
      "./_portal-auth": auth,
      "./_demo-data": { isDemoUser: () => false },
      "./_rate-limit": {
        consumeRateLimit: () => ({ allowed: true }),
        sendRateLimited: (res, r, m) => json(res, 429, { ok: false, error: m }),
      },
      "./_email": {
        sendEmail: async (data) => {
          state.emails.push(data);
          return state.failEmail
            ? { ok: false, error: "Test email outage" }
            : { ok: true, id: "test-email" };
        },
      },
      "./_supabase-customer-store": { maybeRequireCustomer: async () => null },
    };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      require: (key) =>
        ["./_shipments", "./_customer-recovery", "./_intake-availability", "./_request-status", "./_service-request"].includes(key)
          ? load(key.slice(2))
          : overrides[key] || requireFrom(key),
      module,
      exports: module.exports,
      URL,
      Date,
      Math,
      process: { env: {} },
      Buffer,
      console,
      ReadableStream,
      structuredClone,
    });
    modules[name] = module.exports;
    return module.exports;
  }
  async function call(name, body = {}, method = "POST", url = "/api/" + name) {
    const req = { method, url, headers: { host: "localhost" }, body },
      res = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        end(raw) {
          this.data = JSON.parse(raw);
        },
      };
    await load(name)(req, res);
    return res;
  }
  return { state, load, call, blob };
}
module.exports = { createHarness };
