const { createClient } = require("@supabase/supabase-js");
const { readCustomers, writeCustomers } = require("./_customer-auth");

function normalizePreferences(value) {
  const zip = typeof value?.zip === "string" ? value.zip.trim() : "";
  return { zip: /^\d{5}$/.test(zip) ? zip : "" };
}

async function shippingPreferences(customer, next) {
  if (customer.source === "supabase") {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.admin.getUserById(customer.id);
    if (error || !data.user) throw error || new Error("Missing customer");
    if (next !== undefined) {
      const result = await client.auth.admin.updateUserById(customer.id, {
        user_metadata: { ...data.user.user_metadata, cubicship_shipping: normalizePreferences(next) },
      });
      if (result.error) throw result.error;
      return normalizePreferences(next);
    }
    return normalizePreferences(data.user.user_metadata?.cubicship_shipping);
  }
  if (next === undefined) return normalizePreferences(customer.shippingPreferences);
  const customers = await readCustomers();
  const record = customers.find((item) => item.id === customer.id && item.active !== false);
  if (!record) throw new Error("Missing customer");
  record.shippingPreferences = normalizePreferences(next);
  await writeCustomers(customers);
  return record.shippingPreferences;
}

module.exports = { normalizePreferences, shippingPreferences };
