const {
  STAFF_ROLES,
  clean,
  hashPassword,
  json,
  normalizeEmail,
  ownerUser,
  publicUser,
  readBody,
  readStaffUsers,
  requireOwner,
  writeStaffUsers,
} = require("./_portal-auth");
const { LOCATIONS, findLocation, publicLocation } = require("./_locations");
const {
  isDemoUser,
  publicDemoStaffUser,
  readDemoList,
  writeDemoList,
} = require("./_demo-data");

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
  const owner = await requireOwner(req, res);
  if (!owner) return;

  if (isDemoUser(owner)) {
    if (req.method === "GET") {
      const users = await readDemoList("staffUsers");
      return json(res, 200, { ok: true, users: users.map(publicDemoStaffUser) });
    }

    if (req.method === "POST") {
      let body = {};
      try {
        body = await readBody(req);
      } catch (error) {
        return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
      }
      const users = await readDemoList("staffUsers");
      const role = STAFF_ROLES.has(clean(body.role)) ? clean(body.role) : "employee";
      if (body.bulkLocationUsers) {
        const existingEmails = new Set(users.map((user) => normalizeEmail(user.email)));
        const created = [];
        const skipped = [];
        LOCATIONS.map(publicLocation).forEach((branch) => {
          const branchEmail = normalizeEmail(`${branch.city || branch.id}-demo@cubicship.com`.replace(/\s+/g, ""));
          if (existingEmails.has(branchEmail)) {
            skipped.push({ email: branchEmail, locationName: branch.name });
            return;
          }
          const user = {
            id: `demo_staff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name: `${branch.city || branch.name} Demo Branch`,
            email: branchEmail,
            role,
            accountType: "branch",
            locationId: branch.id,
            locationName: branch.name,
            active: true,
            createdAt: new Date().toISOString(),
            createdBy: owner.email,
            lastLoginAt: null,
            demo: true,
          };
          users.push(user);
          existingEmails.add(branchEmail);
          created.push(publicDemoStaffUser(user));
        });
        await writeDemoList("staffUsers", users);
        return json(res, 201, { ok: true, users: created, created, skipped });
      }

      const name = clean(body.name);
      const email = normalizeEmail(body.email);
      const location = findLocation(body.locationId);
      if (!name) return json(res, 400, { ok: false, error: "Staff name is required." });
      if (!isEmail(email)) return json(res, 400, { ok: false, error: "Staff email is not valid." });
      if (users.some((user) => normalizeEmail(user.email) === email)) {
        return json(res, 409, { ok: false, error: "A staff login with that email already exists in demo data." });
      }
      const user = {
        id: `demo_staff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        email,
        role,
        accountType: body.accountType === "branch" ? "branch" : "person",
        locationId: location.id,
        locationName: location.name,
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: owner.email,
        lastLoginAt: null,
        demo: true,
      };
      users.push(user);
      await writeDemoList("staffUsers", users);
      return json(res, 201, { ok: true, user: publicDemoStaffUser(user) });
    }

    if (req.method === "PATCH") {
      let body = {};
      try {
        body = await readBody(req);
      } catch (error) {
        return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
      }
      const users = await readDemoList("staffUsers");
      const user = users.find((item) => item.id === clean(body.id));
      if (!user) return json(res, 404, { ok: false, error: "Demo staff login was not found." });
      if ("active" in body) user.active = Boolean(body.active);
      if (clean(body.name)) user.name = clean(body.name);
      if (STAFF_ROLES.has(clean(body.role))) user.role = clean(body.role);
      if ("locationId" in body) {
        const location = findLocation(body.locationId);
        user.locationId = location.id;
        user.locationName = location.name;
      }
      user.updatedAt = new Date().toISOString();
      await writeDemoList("staffUsers", users);
      return json(res, 200, { ok: true, user: publicDemoStaffUser(user) });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url, `https://${req.headers.host || "cubicship.com"}`);
      const id = clean(url.searchParams.get("id"));
      const users = await readDemoList("staffUsers");
      const nextUsers = users.filter((user) => user.id !== id);
      if (nextUsers.length === users.length) return json(res, 404, { ok: false, error: "Demo staff login was not found." });
      await writeDemoList("staffUsers", nextUsers);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (req.method === "GET") {
    const users = await readStaffUsers();
    return json(res, 200, { ok: true, users: users.map(publicUser) });
  }

  if (req.method === "POST") {
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
    }

    const name = clean(body.name);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const role = STAFF_ROLES.has(clean(body.role)) ? clean(body.role) : "employee";
    const location = findLocation(body.locationId);

    if (body.bulkLocationUsers) {
      const branchRole = STAFF_ROLES.has(clean(body.role)) ? clean(body.role) : "manager";
      if (password.length < 8) return json(res, 400, { ok: false, error: "Temporary password must be at least 8 characters." });
      const users = await readStaffUsers();
      const existingEmails = new Set(users.map((user) => normalizeEmail(user.email)));
      const created = [];
      const skipped = [];
      LOCATIONS.map(publicLocation).forEach((branch) => {
        const branchEmail = normalizeEmail(branch.branchEmail || branch.email);
        if (!isEmail(branchEmail)) return;
        if (existingEmails.has(branchEmail) || branchEmail === ownerUser().email) {
          skipped.push({ email: branchEmail, locationName: branch.name });
          return;
        }
        const user = {
          id: `staff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          name: `${branch.city || branch.name} Location`,
          email: branchEmail,
          role: branchRole,
          accountType: "branch",
          locationId: branch.id,
          locationName: branch.name,
          active: true,
          passwordHash: hashPassword(password),
          createdAt: new Date().toISOString(),
          createdBy: owner.email,
          lastLoginAt: null,
        };
        users.push(user);
        existingEmails.add(branchEmail);
        created.push(publicUser(user));
      });
      await writeStaffUsers(users);
      return json(res, 201, { ok: true, users: created, created, skipped });
    }

    if (!name) return json(res, 400, { ok: false, error: "Staff name is required." });
    if (!isEmail(email)) return json(res, 400, { ok: false, error: "Staff email is not valid." });
    if (email === ownerUser().email) return json(res, 400, { ok: false, error: "That email is already the owner account." });
    if (password.length < 8) return json(res, 400, { ok: false, error: "Password must be at least 8 characters." });

    const users = await readStaffUsers();
    if (users.some((user) => normalizeEmail(user.email) === email)) {
      return json(res, 409, { ok: false, error: "A staff login with that email already exists." });
    }

    const user = {
      id: `staff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      email,
      role,
      accountType: body.accountType === "branch" ? "branch" : "person",
      locationId: location.id,
      locationName: location.name,
      active: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      createdBy: owner.email,
      lastLoginAt: null,
    };
    users.push(user);
    await writeStaffUsers(users);
    return json(res, 201, { ok: true, user: publicUser(user) });
  }

  if (req.method === "PATCH") {
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
    }

    const id = clean(body.id);
    const users = await readStaffUsers();
    const user = users.find((item) => item.id === id);
    if (!user) return json(res, 404, { ok: false, error: "Staff login was not found." });

    if ("active" in body) user.active = Boolean(body.active);
    if (clean(body.name)) user.name = clean(body.name);
    if (STAFF_ROLES.has(clean(body.role))) user.role = clean(body.role);
    if ("locationId" in body) {
      const location = findLocation(body.locationId);
      user.locationId = location.id;
      user.locationName = location.name;
    }
    if (body.password) {
      const password = String(body.password);
      if (password.length < 8) return json(res, 400, { ok: false, error: "Password must be at least 8 characters." });
      user.passwordHash = hashPassword(password);
    }
    await writeStaffUsers(users);
    return json(res, 200, { ok: true, user: publicUser(user) });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url, `https://${req.headers.host || "cubicship.com"}`);
    const id = clean(url.searchParams.get("id"));
    const users = await readStaffUsers();
    const nextUsers = users.filter((user) => user.id !== id);
    if (nextUsers.length === users.length) return json(res, 404, { ok: false, error: "Staff login was not found." });
    await writeStaffUsers(nextUsers);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
};
