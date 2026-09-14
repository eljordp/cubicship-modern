const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function harness(settings = {}) {
  const state = { calls: [] };
  const auth = {
    getUser: async (token) =>
      token === "valid"
        ? { data: { user: { email_confirmed_at: "2026-01-01" } } }
        : { data: {}, error: { message: "expired" } },
    setSession: async (data) =>
      data.access_token === "valid"
        ? { data: { user: { id: "test" } } }
        : { error: {} },
    updateUser: async (data) => {
      state.calls.push(["update", data.password.length]);
      return {};
    },
    signOut: async () => ({}),
    resetPasswordForEmail: async (email, options) => {
      state.calls.push(["reset", email, options.redirectTo]);
      return {};
    },
    resend: async (data) => {
      state.calls.push(["resend", data.email]);
      return {};
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../api/_customer-recovery"), "utf8"),
    {
      module: mod,
      exports: mod.exports,
      process: {
        env:
          settings.configured === false
            ? {}
            : {
                SUPABASE_URL: "https://example.supabase.co",
                SUPABASE_ANON_KEY: "test-public-key",
              },
      },
      require: (key) =>
        ({
          "@supabase/supabase-js": { createClient: () => ({ auth }) },
          "./_customer-auth": {
            readBody: async (req) => req.body,
            json: (res, status, data) => {
              res.statusCode = status;
              res.data = data;
            },
          },
          "./_rate-limit": { consumeRateLimit: () => ({ allowed: true }) },
        })[key],
    },
  );
  return {
    state,
    async call(body) {
      const res = { setHeader() {} };
      await mod.exports({ method: "POST", body }, res);
      return res;
    },
  };
}
test("confirmation requires a provider-verified email", async () => {
  const h = harness();
  assert.equal(
    (await h.call({ action: "verify", accessToken: "invalid" })).statusCode,
    400,
  );
  assert.equal(
    (await h.call({ action: "verify", accessToken: "valid" })).statusCode,
    200,
  );
});
test("reset uses the recovery callback, and resend does not claim an account exists", async () => {
  const h = harness();
  const result = await h.call({ action: "reset", email: "test@example.com" });
  assert.equal(result.statusCode, 200);
  assert.match(result.data.message, /If this account is eligible/);
  assert.equal(
    h.state.calls[0][2],
    "https://cubicship.com/auth/callback.html?flow=recovery",
  );
  assert.equal(
    (await h.call({ action: "resend", email: "test@example.com" })).statusCode,
    200,
  );
});
test("password update requires a valid provider session; missing configuration is explicit", async () => {
  const h = harness();
  assert.equal(
    (
      await h.call({
        action: "update-password",
        accessToken: "bad",
        refreshToken: "bad",
        password: "synthetic-test-only-password",
      })
    ).statusCode,
    400,
  );
  assert.equal(h.state.calls.length, 0);
  assert.equal(
    (
      await h.call({
        action: "update-password",
        accessToken: "valid",
        refreshToken: "valid",
        password: "synthetic-test-only-password",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await harness({ configured: false }).call({
        action: "reset",
        email: "test@example.com",
      })
    ).statusCode,
    503,
  );
});
