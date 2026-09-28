const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
function harness() {
  const state = {
    entry: null,
    sends: 0,
    fail: false,
    failStore: false,
    keys: [],
  };
  let op = "select",
    payload;
  const q = new Proxy(
    {},
    {
      get: (_, k) =>
        k === "then"
          ? (resolve) => {
              if (state.failStore)
                return resolve({ error: { code: "OFFLINE" } });
              if (op === "insert")
                state.entry = {
                  ...payload,
                  id: "activity",
                  created_at: new Date().toISOString(),
                };
              if (op === "update") Object.assign(state.entry, payload);
              resolve({ data: state.entry, error: null });
            }
          : (...args) => {
              if (["select", "insert", "update"].includes(k)) {
                if (k !== "select" || op !== "insert") {
                  op = k;
                  payload = args[0];
                }
              }
              if (k === "from") op = "select";
              return q;
            },
    },
  );
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../api/_crm-email"), "utf8"),
    {
      module,
      require: (k) =>
        k === "./_crm"
          ? {
              db: () => q,
              checked: async (p) => {
                const r = await p;
                if (r.error) throw r.error;
                return r.data;
              },
            }
          : require(k),
      process: {
        env: {
          RESEND_API_KEY: "fixture",
          QUOTE_FROM_EMAIL: "test@example.invalid",
        },
      },
      Date,
      AbortSignal,
      fetch: async (url, opt) => {
        assert.equal(url, "https://api.resend.com/emails");
        state.sends++;
        state.keys.push(opt.headers["Idempotency-Key"]);
        return {
          ok: !state.fail,
          status: state.fail ? 503 : 200,
          json: async () => ({ id: "fixture-message" }),
        };
      },
    },
  );
  return { send: module.exports, state };
}
const lead = {
    id: "11111111-1111-4111-8111-111111111111",
    contact: { email: "customer@example.invalid" },
  },
  user = { name: "Test staff" },
  body = {
    requestId: "22222222-2222-4222-8222-222222222222",
    subject: "Test",
    message: "Fixture only",
  };
test("email history is durable before sending; storage failure prevents delivery", async () => {
  const h = harness();
  h.state.failStore = true;
  await assert.rejects(() => h.send(lead, user, body));
  assert.equal(h.state.sends, 0);
});
test("accepted retries do not resend and changed content cannot reuse a send attempt", async () => {
  const h = harness();
  await h.send(lead, user, body);
  assert.equal(h.state.entry.metadata.status, "accepted");
  await h.send(lead, user, body);
  assert.equal(h.state.sends, 1);
  await assert.rejects(() =>
    h.send(lead, user, { ...body, message: "changed" }),
  );
  assert.equal(h.state.sends, 1);
});
test("provider failure is visible and retries use the same idempotency key", async () => {
  const h = harness();
  h.state.fail = true;
  await assert.rejects(() => h.send(lead, user, body));
  assert.equal(h.state.entry.metadata.status, "failed");
  h.state.fail = false;
  await h.send(lead, user, body);
  assert.equal(h.state.keys[0], h.state.keys[1]);
  assert.equal(h.state.entry.metadata.status, "accepted");
});
test("old uncertain sends require manual review beyond provider deduplication window", async () => {
  const h = harness();
  h.state.fail = true;
  await assert.rejects(() => h.send(lead, user, body));
  h.state.entry.created_at = new Date(Date.now() - 25 * 3600000).toISOString();
  await assert.rejects(() => h.send(lead, user, body), /manual review/);
  assert.equal(h.state.sends, 1);
});
