const { get, put } = require("@vercel/blob");
const { LOCATIONS, findLocation, publicLocation } = require("./_locations");

function envEnabled(value) {
  return /^(1|true|yes)$/i.test(clean(value));
}

const DEMO_PASSWORD = clean(process.env.PORTAL_DEMO_PASSWORD);
const DEMO_ENABLED = envEnabled(process.env.PORTAL_DEMO_ENABLED) && DEMO_PASSWORD.length >= 12;
const DEMO_PATHS = {
  staffUsers: "portal/demo/staff-users.json",
  shipments: "portal/demo/shipments.json",
  reports: "portal/demo/store-reports.json",
  agents: "portal/demo/agent-pipeline.json",
  shifts: "portal/demo/employee-shifts.json",
  training: "portal/demo/employee-training.json",
  oplEntries: "portal/demo/opl-operations-log.json",
  refunds: "portal/demo/refund-ledger.json",
};

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function atHour(hour) {
  const date = new Date();
  date.setHours(hour, 15, 0, 0);
  return date.toISOString();
}

function demoUsers() {
  return [
    {
      id: "demo_owner",
      email: "demo-mo@cubicship.com",
      name: "Mo Demo",
      role: "owner",
      locationId: "",
      locationName: "All locations",
      accountType: "demo",
      active: true,
      demo: true,
    },
    {
      id: "demo_manager",
      email: "demo-manager@cubicship.com",
      name: "Bridgeview Manager Demo",
      role: "manager",
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      accountType: "demo",
      active: true,
      demo: true,
    },
    {
      id: "demo_employee",
      email: "demo-employee@cubicship.com",
      name: "Bridgeview Employee Demo",
      role: "employee",
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      accountType: "demo",
      active: true,
      demo: true,
    },
  ];
}

function demoStaffUsersSeed() {
  return [
    {
      id: "demo_staff_bridgeview",
      name: "Bridgeview Location",
      email: "bridgeview-demo@cubicship.com",
      role: "manager",
      accountType: "branch",
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      active: true,
      createdAt: atHour(7),
      createdBy: "demo-mo@cubicship.com",
      lastLoginAt: atHour(8),
      demo: true,
    },
    {
      id: "demo_staff_allentown",
      name: "Allentown Location",
      email: "allentown-demo@cubicship.com",
      role: "manager",
      accountType: "branch",
      locationId: "allentown-pa",
      locationName: "Allentown, PA",
      active: true,
      createdAt: atHour(7),
      createdBy: "demo-mo@cubicship.com",
      lastLoginAt: "",
      demo: true,
    },
    ...demoUsers().filter((user) => user.role !== "owner"),
  ];
}

function demoShipmentsSeed() {
  const today = todayIso();
  return [
    {
      id: "demo_ship_001",
      number: "CS-DEMO-1001",
      status: "payment_due",
      customerName: "Lina's Etsy Studio",
      customerEmail: "lina.demo@example.com",
      customerPhone: "708-555-0188",
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      serviceType: "DHL label",
      recipientName: "Nadia Saleh",
      destinationCountry: "Jordan",
      destinationCity: "Amman",
      destinationPostal: "11181",
      pieces: "1",
      weight: "4 lb",
      dimensions: "12 x 9 x 6",
      contents: "Handmade accessories",
      declaredValue: "$180",
      shipmentValueProtection: "Requested",
      notes: "Customer will pay at counter. Needs CRA label created by staff.",
      payment: { status: "due", amount: "86.40", method: "counter", notes: "Collect before release.", updatedAt: atHour(9), paidAt: null, paidBy: "" },
      staffWorkflow: { nextAction: "Create Shipment", priority: "urgent", assignedTo: "Bridgeview counter", checklist: [] },
      labelReference: "",
      carrierTracking: "",
      shipmentType: "Package",
      requestedServiceLevel: "DHL Express",
      staffNotes: "Verify receiver phone before CRA entry.",
      sender: { name: "Lina Haddad", company: "Lina's Etsy Studio", phone: "708-555-0188", email: "lina.demo@example.com", address1: "7327 W 87th St", city: "Bridgeview", state: "IL", postal: "60455", country: "US" },
      receiver: { name: "Nadia Saleh", company: "", phone: "+962 6 555 0199", email: "nadia.demo@example.com", address1: "Rainbow Street", city: "Amman", state: "", postal: "11181", country: "Jordan" },
      createdAt: `${today}T15:20:00.000Z`,
      updatedAt: `${today}T16:05:00.000Z`,
      auditLog: [
        { at: `${today}T15:20:00.000Z`, by: "customer", action: "submitted", message: "Business customer submitted shipment request." },
        { at: `${today}T16:05:00.000Z`, by: "demo-manager@cubicship.com", action: "payment_due", message: "Manager marked counter payment due." },
      ],
    },
    {
      id: "demo_ship_002",
      number: "CS-DEMO-1002",
      status: "ready_for_dropoff",
      customerName: "Oak Lawn Phone Repair",
      customerEmail: "repair.demo@example.com",
      customerPhone: "708-555-0112",
      locationId: "oak-lawn",
      locationName: "Oak Lawn, IL",
      serviceType: "Printing",
      recipientName: "Customer pickup",
      destinationCountry: "United States",
      destinationCity: "Oak Lawn",
      destinationPostal: "60453",
      pieces: "35",
      weight: "",
      dimensions: "",
      contents: "Printed intake forms",
      declaredValue: "",
      payment: { status: "paid", amount: "24.99", method: "counter", notes: "Paid at counter.", updatedAt: atHour(10), paidAt: atHour(10), paidBy: "oaklawn-demo@cubicship.com" },
      staffWorkflow: { nextAction: "Customer pickup", priority: "normal", assignedTo: "Oak Lawn counter", checklist: [] },
      labelReference: "PRINT-2044",
      carrierTracking: "",
      shipmentType: "Document",
      staffNotes: "Ready in back tray.",
      createdAt: `${today}T14:15:00.000Z`,
      updatedAt: `${today}T15:10:00.000Z`,
      auditLog: [
        { at: `${today}T14:15:00.000Z`, by: "customer", action: "submitted", message: "Customer submitted print job." },
      ],
    },
    {
      id: "demo_ship_003",
      number: "CS-DEMO-1003",
      status: "issue",
      customerName: "Dearborn Export Desk",
      customerEmail: "export.demo@example.com",
      customerPhone: "313-555-0195",
      locationId: "dearborn",
      locationName: "Dearborn, MI",
      serviceType: "DHL label",
      recipientName: "Karim Trading",
      destinationCountry: "United Arab Emirates",
      destinationCity: "Dubai",
      destinationPostal: "",
      pieces: "2",
      weight: "18 lb",
      dimensions: "18 x 14 x 12",
      contents: "Retail samples",
      declaredValue: "$640",
      payment: { status: "not_ready", amount: "", method: "counter", notes: "", updatedAt: null, paidAt: null, paidBy: "" },
      staffWorkflow: { nextAction: "Manager review", priority: "manager", assignedTo: "Dearborn manager", checklist: [] },
      labelReference: "",
      carrierTracking: "",
      shipmentType: "Package",
      staffNotes: "Commercial invoice details incomplete.",
      createdAt: `${today}T13:30:00.000Z`,
      updatedAt: `${today}T13:50:00.000Z`,
      auditLog: [
        { at: `${today}T13:50:00.000Z`, by: "demo-manager@cubicship.com", action: "status_changed", message: "Marked manager issue for missing invoice details." },
      ],
    },
  ];
}

function demoReportsSeed() {
  const today = todayIso();
  return [
    {
      id: "demo_report_bridgeview",
      reportDate: today,
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      submittedBy: "demo-manager@cubicship.com",
      submittedByName: "Bridgeview Manager Demo",
      revenueTarget: 2500,
      actualRevenue: 2325,
      docShipments: 14,
      nonDocShipments: 9,
      serviceOrders: 6,
      oplCompleted: true,
      openingOnTime: true,
      closingCompleted: false,
      shipmentAccuracy: 98,
      responseTimeMinutes: 18,
      googleRating: 4.8,
      reviewsRequested: 12,
      newReviews: 3,
      complaints: 1,
      topDestinations: "Jordan, Mexico, UAE",
      addOnServices: "Printing, mailbox inquiry",
      issues: "One shipment missing commercial invoice details.",
      suppliesOrEquipment: "Low on receipt paper.",
      managerNotes: "Strong day, closing checklist still needs discipline.",
      checklistScore: 90,
      checklistStatus: "Strong",
      createdAt: atHour(17),
      updatedAt: atHour(17),
    },
    {
      id: "demo_report_allentown",
      reportDate: today,
      locationId: "allentown-pa",
      locationName: "Allentown, PA",
      submittedBy: "allentown-demo@cubicship.com",
      submittedByName: "Allentown Location",
      revenueTarget: 1800,
      actualRevenue: 1210,
      docShipments: 5,
      nonDocShipments: 7,
      serviceOrders: 2,
      oplCompleted: true,
      openingOnTime: true,
      closingCompleted: true,
      shipmentAccuracy: 94,
      responseTimeMinutes: 26,
      googleRating: 4.7,
      reviewsRequested: 4,
      newReviews: 1,
      complaints: 0,
      topDestinations: "Dominican Republic, Mexico",
      addOnServices: "Drop-offs",
      issues: "",
      suppliesOrEquipment: "",
      managerNotes: "Traffic was light. Compare against foot traffic, not raw revenue only.",
      checklistScore: 100,
      checklistStatus: "Strong",
      createdAt: atHour(17),
      updatedAt: atHour(17),
    },
  ];
}

function demoAgentsSeed() {
  return [
    {
      id: "demo_agent_001",
      createdAt: atHour(8),
      updatedAt: atHour(9),
      createdBy: "demo-mo@cubicship.com",
      createdByName: "Mo Demo",
      name: "Amina N.",
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      stage: "Virtual Training",
      role: "Retail Associate",
      scores: { scoreService: 5, scoreReliability: 4, scoreSystems: 4, scoreCommunication: 5, scoreSecurity: 5, scoreRevenue: 3 },
      weightedScore: 88,
      scoreStatus: "Strong",
      recommendation: "Advance to supervised branch training",
      nextStep: "Complete first-week checklist",
      trainingCompleted: ["trainingBrand", "trainingDailyOps", "trainingDhl", "trainingOpl", "trainingSecurity"],
      trainingCompletion: 83,
      trainingModules: "Operating agreement signed; virtual training week in progress.",
      notes: "Good customer tone. Needs more CRA practice.",
      approvalStatus: "pending_review",
      reviewedBy: "",
      reviewedByName: "",
      reviewedAt: "",
      reviewNotes: "",
    },
  ];
}

function demoShiftsSeed() {
  const today = todayIso();
  return [
    {
      id: "demo_shift_001",
      userEmail: "demo-employee@cubicship.com",
      userName: "Bridgeview Employee Demo",
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      status: "ended",
      clockInAt: `${today}T14:00:00.000Z`,
      clockOutAt: `${today}T22:15:00.000Z`,
      clockInLocation: { status: "verified_on_site", message: "Verified near assigned location (64m away).", reviewRequired: false },
      clockOutLocation: { status: "location_not_shared", message: "Location not shared.", reviewRequired: true },
      locationReviewRequired: true,
      locationStatusLabel: "Location not shared",
      checklist: {
        reviewAsks: 7,
        customersHelped: 21,
        serviceOrdersHandled: 6,
        labelsUploaded: 3,
        paymentsHandled: 8,
        notaryRequestsHandled: 0,
        complaintsOrIssues: 1,
        openingChecklistCompleted: true,
        duringDayChecklistCompleted: true,
        shipmentChecklistCompleted: true,
        escalationChecklistCompleted: true,
        statusInquiryStandardFollowed: true,
        customerDataProtected: true,
        dressedProperly: true,
        downtimeProductive: true,
        oplCompleted: true,
        dailyReportCompleted: false,
        customerIssuesLogged: true,
        suppliesChecked: true,
        workspaceClosed: false,
        notes: "Good operations day. Closing proof and GPS clock-out need manager review.",
      },
      kpiScore: 87,
      teamsNotificationStatus: "not_configured",
      createdAt: `${today}T14:00:00.000Z`,
      updatedAt: `${today}T22:15:00.000Z`,
    },
  ];
}

function demoTrainingSeed() {
  return [
    {
      id: "demo_training_employee",
      userEmail: "demo-employee@cubicship.com",
      userName: "Bridgeview Employee Demo",
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      agreementVersion: "CubicShip Retail Associate Operating Agreement",
      agreementAcknowledgedAt: atHour(8),
      createdAt: atHour(8),
      updatedAt: atHour(8),
    },
  ];
}

function demoOplSeed() {
  const today = todayIso();
  return [
    {
      id: "demo_opl_001",
      logDate: today,
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      submittedBy: "demo-employee@cubicship.com",
      submittedByName: "Bridgeview Employee Demo",
      branchAgent: "Ayana",
      salesDept: "DHL-Shipment",
      shipperName: "Hani",
      driverLicenseLast4: "1534",
      driverLicenseExpiration: "2027-11-30",
      shipperEmail: "hani.demo@example.com",
      shipmentDestination: "Mexico",
      airbill: "2661491534",
      shipmentType: "Package",
      packageType: "Package",
      saleAmount: 58.83,
      dropOff: 0,
      shipmentStatus: "Added to CS",
      commentsNotes: "Customer shipped with us before. Needs follow-up before closing.",
      emailSent: "N",
      resolved: "N",
      resolutionDate: "",
      category: "DHL-Shipment",
      reference: "2661491534",
      customerName: "Hani",
      issue: "Customer shipped with us before. Needs follow-up before closing.",
      status: "Added to CS",
      notes: "Customer shipped with us before. Needs follow-up before closing.",
      createdAt: `${today}T14:40:00.000Z`,
      updatedAt: `${today}T14:40:00.000Z`,
    },
    {
      id: "demo_opl_002",
      logDate: today,
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      submittedBy: "demo-manager@cubicship.com",
      submittedByName: "Bridgeview Manager Demo",
      branchAgent: "Jordi",
      salesDept: "DHL-DropOff",
      shipperName: "Maya",
      driverLicenseLast4: "",
      driverLicenseExpiration: "",
      shipperEmail: "maya.demo@example.com",
      shipmentDestination: "United States",
      airbill: "JD014600011223344",
      shipmentType: "Drop-off",
      packageType: "Drop-off",
      saleAmount: 0,
      dropOff: 1,
      shipmentStatus: "Delivered",
      commentsNotes: "Drop-off scanned and stored securely.",
      emailSent: "Y",
      resolved: "Y",
      resolutionDate: today,
      category: "DHL-DropOff",
      reference: "JD014600011223344",
      customerName: "Maya",
      issue: "Drop-off scanned and stored securely.",
      status: "Delivered",
      notes: "Drop-off scanned and stored securely.",
      createdAt: `${today}T16:10:00.000Z`,
      updatedAt: `${today}T16:30:00.000Z`,
    },
    {
      id: "demo_opl_003",
      logDate: today,
      locationId: "allentown-pa",
      locationName: "Allentown, PA",
      submittedBy: "allentown-demo@cubicship.com",
      submittedByName: "Allentown Location",
      branchAgent: "Raylenne",
      salesDept: "DHL-Shipment",
      shipperName: "Carlos",
      driverLicenseLast4: "7741",
      driverLicenseExpiration: "2028-04-12",
      shipperEmail: "carlos.demo@example.com",
      shipmentDestination: "Dominican Republic",
      airbill: "742009998812",
      shipmentType: "Document",
      packageType: "Document",
      saleAmount: 42.15,
      dropOff: 0,
      shipmentStatus: "In transit",
      commentsNotes: "Document shipment entered through CRA. Email not sent yet.",
      emailSent: "N",
      resolved: "",
      resolutionDate: "",
      category: "DHL-Shipment",
      reference: "742009998812",
      customerName: "Carlos",
      issue: "Document shipment entered through CRA. Email not sent yet.",
      status: "In transit",
      notes: "Document shipment entered through CRA. Email not sent yet.",
      createdAt: `${today}T15:10:00.000Z`,
      updatedAt: `${today}T15:10:00.000Z`,
    },
  ];
}

function demoRefundsSeed() {
  const today = todayIso();
  return [
    {
      id: "demo_refund_001",
      refundDate: today,
      locationId: "bridgeview",
      locationName: "Cubic Ship Bridgeview",
      createdBy: "demo-manager@cubicship.com",
      createdByName: "Bridgeview Manager Demo",
      customerName: "Lina's Etsy Studio",
      orderNumber: "CS-DEMO-1001",
      serviceType: "DHL / Counter Service",
      amount: 12.5,
      method: "counter",
      reason: "Manager adjustment after duplicate service fee.",
      approvedBy: "Mo Demo",
      refundStatus: "pending",
      notes: "Needs Mo review before closing.",
      history: [
        { at: atHour(16), by: "demo-manager@cubicship.com", byName: "Bridgeview Manager Demo", action: "created", message: "Refund created.", amount: 12.5, status: "pending", notes: "Duplicate service fee." },
      ],
      createdAt: atHour(16),
      updatedAt: atHour(16),
    },
  ];
}

function seedFor(key) {
  const seeds = {
    staffUsers: demoStaffUsersSeed,
    shipments: demoShipmentsSeed,
    reports: demoReportsSeed,
    agents: demoAgentsSeed,
    shifts: demoShiftsSeed,
    training: demoTrainingSeed,
    oplEntries: demoOplSeed,
    refunds: demoRefundsSeed,
  };
  return seeds[key] ? seeds[key]() : [];
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

async function readDemoList(key) {
  const path = DEMO_PATHS[key];
  if (!path) return [];
  try {
    const result = await get(path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return seedFor(key);
    const data = JSON.parse(await streamToText(result.stream));
    return Array.isArray(data[key]) ? data[key] : seedFor(key);
  } catch (error) {
    if (error && /not found/i.test(String(error.message || ""))) return seedFor(key);
    return seedFor(key);
  }
}

async function writeDemoList(key, records) {
  const path = DEMO_PATHS[key];
  if (!path) return;
  await put(path, JSON.stringify({ [key]: records }, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

function authenticateDemo(email, password) {
  if (!DEMO_ENABLED) return null;
  if (String(password || "") !== DEMO_PASSWORD) return null;
  return demoUsers().find((user) => normalizeEmail(user.email) === normalizeEmail(email)) || null;
}

function demoUserFromSession(session) {
  if (!DEMO_ENABLED) return null;
  if (!session?.demo) return null;
  return demoUsers().find((user) => user.id === session.sub && normalizeEmail(user.email) === normalizeEmail(session.email)) || null;
}

function isDemoUser(user) {
  return Boolean(DEMO_ENABLED && user?.demo);
}

function publicDemoStaffUser(user) {
  const location = user.locationId ? findLocation(user.locationId) : null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    accountType: user.accountType || "demo",
    locationId: user.locationId || "",
    locationName: user.locationName || location?.name || (user.role === "owner" ? "All locations" : ""),
    branchEmail: location?.branchEmail || "",
    active: user.active !== false,
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
    demo: true,
  };
}

module.exports = {
  DEMO_ENABLED,
  DEMO_PASSWORD,
  authenticateDemo,
  demoUserFromSession,
  demoUsers,
  isDemoUser,
  publicDemoStaffUser,
  readDemoList,
  writeDemoList,
  publicLocation,
  LOCATIONS,
};
