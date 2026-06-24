const { get, put } = require("@vercel/blob");
const { clean, json, readBody, requireUser } = require("./_portal-auth");
const { findLocation } = require("./_locations");
const { readShipments } = require("./_shipments");
const { isDemoUser, readDemoList, writeDemoList } = require("./_demo-data");

const REPORTS_PATH = "portal/store-reports.json";
const AGENTS_PATH = "portal/agent-pipeline.json";
const SHIFTS_PATH = "portal/employee-shifts.json";
const TRAINING_PATH = "portal/employee-training.json";
const OPL_PATH = "portal/opl-operations-log.json";
const REFUNDS_PATH = "portal/refund-ledger.json";
const AGENT_WEIGHTS = {
  scoreService: 25,
  scoreReliability: 20,
  scoreCommunication: 15,
  scoreSystems: 15,
  scoreSecurity: 15,
  scoreRevenue: 10,
};
const TRAINING_MODULES = [
  ["trainingBrand", "Brand and service mindset"],
  ["trainingDailyOps", "Daily operations SOP"],
  ["trainingDhl", "DHL shipment and drop-off processing"],
  ["trainingOpl", "OPL, DSS, and reporting discipline"],
  ["trainingCustomerIssues", "Customer experience and complaint handling"],
  ["trainingSecurity", "Escalation, data privacy, and safety"],
  ["trainingRevenue", "Revenue awareness and service expansion"],
];
const LOCATION_WARNING_METERS = 750;

function num(value) {
  const parsed = Number(String(value || "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function latLng(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthMeters = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function shapeLocationVerification(input, location, event) {
  const data = input && typeof input === "object" ? input : {};
  const now = new Date().toISOString();
  const latitude = latLng(data.latitude);
  const longitude = latLng(data.longitude);
  const accuracyMeters = Math.max(0, Math.round(num(data.accuracyMeters || data.accuracy)));
  const officeLatitude = latLng(location.latitude);
  const officeLongitude = latLng(location.longitude);
  const geofenceMeters = Math.max(100, Math.round(num(location.geofenceMeters) || 250));
  const base = {
    event,
    checkedAt: now,
    status: "missing",
    message: "Browser location was not provided.",
    reviewRequired: true,
    latitude,
    longitude,
    accuracyMeters,
    officeLatitude,
    officeLongitude,
    officeGeofenceMeters: geofenceMeters,
    distanceMeters: null,
    source: clean(data.source) || "browser_geolocation",
    permission: clean(data.permission),
    error: clean(data.error),
  };
  if (data.error || data.permission === "denied") {
    return {
      ...base,
      status: "location_not_shared",
      message: data.permission === "denied" ? "Employee denied browser location permission." : `Location unavailable: ${clean(data.error)}`,
    };
  }
  if (latitude === null || longitude === null) return base;
  if (officeLatitude === null || officeLongitude === null) {
    return {
      ...base,
      status: "office_reference_missing",
      message: "Assigned location does not have an office GPS reference yet.",
    };
  }
  const distanceMeters = haversineMeters(latitude, longitude, officeLatitude, officeLongitude);
  const allowance = geofenceMeters + Math.min(accuracyMeters || 0, 300);
  if (accuracyMeters > 500) {
    return {
      ...base,
      status: "imprecise",
      message: `GPS was too imprecise to verify clearly (${accuracyMeters}m accuracy).`,
      distanceMeters,
    };
  }
  if (distanceMeters <= allowance) {
    return {
      ...base,
      status: "verified_on_site",
      message: `Verified near assigned location (${distanceMeters}m away).`,
      reviewRequired: false,
      distanceMeters,
    };
  }
  if (distanceMeters <= LOCATION_WARNING_METERS + Math.min(accuracyMeters || 0, 300)) {
    return {
      ...base,
      status: "nearby_review",
      message: `Near the assigned location, but outside normal range (${distanceMeters}m away).`,
      distanceMeters,
    };
  }
  return {
    ...base,
    status: "off_site_review",
    message: `Outside assigned location range (${distanceMeters}m away).`,
    distanceMeters,
  };
}

function locationLabel(verification) {
  if (!verification) return "No location check";
  if (verification.status === "verified_on_site") return "On site";
  if (verification.status === "nearby_review") return "Nearby - review";
  if (verification.status === "off_site_review") return "Off site - review";
  if (verification.status === "imprecise") return "GPS imprecise";
  if (verification.status === "location_not_shared") return "Location not shared";
  if (verification.status === "office_reference_missing") return "Office GPS missing";
  return "Location missing";
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

async function readReports(user = null) {
  if (isDemoUser(user)) return readDemoList("reports");
  return readStoredList(REPORTS_PATH, "reports");
}

async function writeReports(user, reports) {
  if (isDemoUser(user)) return writeDemoList("reports", reports);
  await writeStoredList(REPORTS_PATH, "reports", reports);
}

async function readAgentRecords(user = null) {
  if (isDemoUser(user)) return readDemoList("agents");
  return readStoredList(AGENTS_PATH, "agents");
}

async function writeAgentRecords(user, agents) {
  if (isDemoUser(user)) return writeDemoList("agents", agents);
  await writeStoredList(AGENTS_PATH, "agents", agents);
}

async function readShifts(user = null) {
  if (isDemoUser(user)) return readDemoList("shifts");
  return readStoredList(SHIFTS_PATH, "shifts");
}

async function writeShifts(user, shifts) {
  if (isDemoUser(user)) return writeDemoList("shifts", shifts);
  await writeStoredList(SHIFTS_PATH, "shifts", shifts);
}

async function readTrainingRecords(user = null) {
  if (isDemoUser(user)) return readDemoList("training");
  return readStoredList(TRAINING_PATH, "training");
}

async function writeTrainingRecords(user, training) {
  if (isDemoUser(user)) return writeDemoList("training", training);
  await writeStoredList(TRAINING_PATH, "training", training);
}

async function readOplEntries(user = null) {
  if (isDemoUser(user)) return readDemoList("oplEntries");
  return readStoredList(OPL_PATH, "entries");
}

async function writeOplEntries(user, entries) {
  if (isDemoUser(user)) return writeDemoList("oplEntries", entries);
  await writeStoredList(OPL_PATH, "entries", entries);
}

async function readRefunds(user = null) {
  if (isDemoUser(user)) return readDemoList("refunds");
  return readStoredList(REFUNDS_PATH, "refunds");
}

async function writeRefunds(user, refunds) {
  if (isDemoUser(user)) return writeDemoList("refunds", refunds);
  await writeStoredList(REFUNDS_PATH, "refunds", refunds);
}

async function readStoredList(path, key) {
  try {
    const result = await get(path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const data = JSON.parse(await streamToText(result.stream));
    return Array.isArray(data[key]) ? data[key] : [];
  } catch (error) {
    if (error && /not found/i.test(String(error.message || ""))) return [];
    throw error;
  }
}

async function writeStoredList(path, key, records) {
  await put(path, JSON.stringify({ [key]: records }, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

function canSeeReport(user, report) {
  if (user.role === "owner") return true;
  if (user.role === "manager") {
    const assignedLocation = user.locationId || "bridgeview";
    return !report.locationId || report.locationId === assignedLocation;
  }
  return false;
}

function canSeeAgent(user, agent) {
  if (user.role === "owner") return true;
  if (user.role === "manager") {
    const assignedLocation = user.locationId || "bridgeview";
    return !agent.locationId || agent.locationId === assignedLocation;
  }
  return false;
}

function canReviewAgents(user) {
  return user.role === "owner" || user.role === "manager";
}

function canSeeOwnerDashboard(user) {
  return user.role === "owner";
}

function canSeeShift(user, shift) {
  if (user.role === "owner") return true;
  if (user.role === "manager") {
    const assignedLocation = user.locationId || "bridgeview";
    return !shift.locationId || shift.locationId === assignedLocation;
  }
  return shift.userEmail === user.email;
}

function canSeeLocationRecord(user, record) {
  if (user.role === "owner") return true;
  const assignedLocation = user.locationId || "bridgeview";
  return !record.locationId || record.locationId === assignedLocation;
}

function canManageRefunds(user) {
  return user.role === "owner" || user.role === "manager";
}

async function sendTeamsNotice(title, lines) {
  const url = clean(process.env.TEAMS_WEBHOOK_URL || process.env.MICROSOFT_TEAMS_WEBHOOK_URL);
  if (!url) return { skipped: true };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `**${title}**\n\n${lines.filter(Boolean).join("\n")}` }),
    });
    if (!response.ok) return { ok: false, error: `Teams webhook returned ${response.status}.` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || "Teams webhook failed." };
  }
}

function publicReport(report) {
  return {
    id: report.id,
    reportDate: report.reportDate,
    locationId: report.locationId,
    locationName: report.locationName,
    submittedBy: report.submittedBy,
    submittedByName: report.submittedByName,
    revenueTarget: report.revenueTarget,
    actualRevenue: report.actualRevenue,
    revenueAchievement: report.revenueTarget ? Math.round((report.actualRevenue / report.revenueTarget) * 100) : 0,
    docShipments: report.docShipments,
    nonDocShipments: report.nonDocShipments,
    serviceOrders: report.serviceOrders,
    totalTransactions: report.docShipments + report.nonDocShipments + report.serviceOrders,
    oplCompleted: report.oplCompleted,
    openingOnTime: report.openingOnTime,
    closingCompleted: report.closingCompleted,
    shipmentAccuracy: report.shipmentAccuracy,
    responseTimeMinutes: report.responseTimeMinutes,
    googleRating: report.googleRating,
    reviewsRequested: report.reviewsRequested,
    newReviews: report.newReviews,
    complaints: report.complaints,
    topDestinations: report.topDestinations,
    addOnServices: report.addOnServices,
    issues: report.issues,
    suppliesOrEquipment: report.suppliesOrEquipment,
    managerNotes: report.managerNotes,
    checklistScore: report.checklistScore,
    checklistStatus: report.checklistStatus,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function checklistStatus(score) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Needs Attention";
  return "Action Required";
}

function agentScoreStatus(score) {
  if (score >= 85) return "Strong";
  if (score >= 75) return "Coach and Advance";
  if (score >= 65) return "Manager Review";
  return "Do Not Advance";
}

function agentRecommendation(score, trainingCompletion) {
  if (score >= 85 && trainingCompletion >= 70) return "Ready for shadowing";
  if (score >= 85) return "Advance to virtual training";
  if (score >= 75) return "Proceed with coaching plan";
  if (score >= 65) return "Hold for manager review";
  return "Do not advance yet";
}

function agentNextStep(stage, score, trainingCompletion) {
  if (score < 65) return "Reject or restart after service-quality review";
  if (stage === "Interview" && score >= 85) return "Send agreement and assign virtual modules";
  if (stage === "Virtual Training" && trainingCompletion >= 70) return "Schedule shadowing and first OPL practice";
  if (stage === "Shadowing") return "Run first-week checklist";
  if (stage === "First Week Review") return "Set KPI cadence and manager check-in";
  return "Manager review and targeted coaching";
}

function scoreValue(value) {
  const parsed = Math.round(num(value));
  return Math.min(5, Math.max(1, parsed || 1));
}

function weightedAgentScore(scores) {
  return Math.round(Object.entries(AGENT_WEIGHTS).reduce((total, [field, weight]) => {
    return total + (scoreValue(scores[field]) / 5) * weight;
  }, 0));
}

function resolveAgentLocation(value) {
  const id = clean(value) || "bridgeview";
  if (id === "other") return { id: "other", name: "Other / New Location" };
  return findLocation(id);
}

function trainingFromBody(body) {
  const completed = TRAINING_MODULES.filter(([id]) => bool(body[id])).map(([, label]) => label);
  return {
    completed,
    completion: Math.round((completed.length / TRAINING_MODULES.length) * 100),
  };
}

function makeSummary(reports) {
  const count = reports.length || 0;
  const sum = (field) => reports.reduce((total, report) => total + num(report[field]), 0);
  const avg = (field) => count ? Math.round(sum(field) / count) : 0;
  const revenueTarget = sum("revenueTarget");
  const actualRevenue = sum("actualRevenue");
  const latest = reports.slice().sort((a, b) => String(b.reportDate || "").localeCompare(String(a.reportDate || "")))[0] || null;
  return {
    reportCount: count,
    revenueTarget,
    actualRevenue,
    revenueAchievement: revenueTarget ? Math.round((actualRevenue / revenueTarget) * 100) : 0,
    totalTransactions: reports.reduce((total, report) => total + report.docShipments + report.nonDocShipments + report.serviceOrders, 0),
    oplCompletion: count ? Math.round((reports.filter((report) => report.oplCompleted).length / count) * 100) : 0,
    openingCompliance: count ? Math.round((reports.filter((report) => report.openingOnTime).length / count) * 100) : 0,
    closingCompliance: count ? Math.round((reports.filter((report) => report.closingCompleted).length / count) * 100) : 0,
    shipmentAccuracy: avg("shipmentAccuracy"),
    responseTimeMinutes: avg("responseTimeMinutes"),
    avgGoogleRating: count ? Number((sum("googleRating") / count).toFixed(1)) : 0,
    newReviews: sum("newReviews"),
    complaints: sum("complaints"),
    avgChecklistScore: avg("checklistScore"),
    checklistStatus: checklistStatus(avg("checklistScore")),
    latestReportDate: latest?.reportDate || "",
  };
}

function publicAgent(agent) {
  return {
    id: agent.id,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    createdBy: agent.createdBy,
    createdByName: agent.createdByName,
    name: agent.name,
    locationId: agent.locationId,
    locationName: agent.locationName,
    stage: agent.stage,
    role: agent.role,
    scores: agent.scores,
    weightedScore: agent.weightedScore,
    scoreStatus: agent.scoreStatus,
    recommendation: agent.recommendation,
    nextStep: agent.nextStep,
    trainingCompleted: agent.trainingCompleted,
    trainingCompletion: agent.trainingCompletion,
    trainingModules: agent.trainingModules,
    notes: agent.notes,
    approvalStatus: agent.approvalStatus,
    reviewedBy: agent.reviewedBy,
    reviewedByName: agent.reviewedByName,
    reviewedAt: agent.reviewedAt,
    reviewNotes: agent.reviewNotes,
  };
}

function makeAgentSummary(agents) {
  const count = agents.length;
  const avg = (field) => count ? Math.round(agents.reduce((total, agent) => total + num(agent[field]), 0) / count) : 0;
  return {
    count,
    avgWeightedScore: avg("weightedScore"),
    avgTrainingCompletion: avg("trainingCompletion"),
    pendingReview: agents.filter((agent) => agent.approvalStatus === "pending_review").length,
    approved: agents.filter((agent) => agent.approvalStatus === "approved").length,
    coachingRequired: agents.filter((agent) => agent.approvalStatus === "coaching_required").length,
  };
}

function statusLabel(status) {
  const labels = {
    submitted: "needs attention",
    in_review: "in review",
    payment_due: "payment due",
    ready_for_dropoff: "ready for drop-off",
    dropped_off: "dropped off / paid",
    completed: "completed",
    issue: "needs review",
    voided: "voided / deleted",
  };
  return labels[status] || String(status || "").replace(/_/g, " ");
}

function approvalLabel(status) {
  const labels = {
    pending_review: "Pending review",
    approved: "Approved",
    coaching_required: "Coaching required",
    not_approved: "Not approved",
  };
  return labels[status] || status || "Pending review";
}

function inc(map, key, amount = 1) {
  const normalized = clean(key) || "Unassigned";
  map[normalized] = (map[normalized] || 0) + amount;
}

function makeBreakdown(rows, keyFn, valueFn = () => 1) {
  const map = {};
  rows.forEach((row) => inc(map, keyFn(row), valueFn(row)));
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function oplDestinationLabel(entry) {
  return clean(entry.shipmentDestination) || "Destination pending";
}

function oplCountryLabel(entry) {
  const destination = oplDestinationLabel(entry);
  if (destination === "Destination pending") return destination;
  const parts = destination.split(",").map((part) => clean(part)).filter(Boolean);
  return parts[parts.length - 1] || destination;
}

function makeEmployeeActivity(shipments, reports, agents, shifts = [], oplEntries = [], refunds = []) {
  const activity = {};
  const touch = (email, name, field) => {
    const key = clean(email || name || "Unknown");
    if (!activity[key]) {
      activity[key] = {
        email: clean(email),
        name: clean(name || email || "Unknown"),
        orderUpdates: 0,
        labelsUploaded: 0,
        paymentsHandled: 0,
        dropoffsVerified: 0,
        reportsSubmitted: 0,
        agentsCreated: 0,
        agentReviews: 0,
        oplEntries: 0,
        refundsLogged: 0,
      };
    }
    activity[key][field] += 1;
  };

  shipments.forEach((shipment) => {
    (Array.isArray(shipment.auditLog) ? shipment.auditLog : []).forEach((event) => {
      touch(event.by, event.by, "orderUpdates");
      if (event.action === "label_pdf_uploaded") touch(event.by, event.by, "labelsUploaded");
      if (event.action === "payment_marked_paid" || event.action === "payment_due") touch(event.by, event.by, "paymentsHandled");
      if (event.action === "dropoff_confirmed") touch(event.by, event.by, "dropoffsVerified");
    });
    if (shipment.labelPdf?.uploadedBy) touch(shipment.labelPdf.uploadedBy, shipment.labelPdf.uploadedBy, "labelsUploaded");
    if (shipment.verifiedBy) touch(shipment.verifiedBy, shipment.verifiedBy, "dropoffsVerified");
    if (shipment.payment?.paidBy) touch(shipment.payment.paidBy, shipment.payment.paidBy, "paymentsHandled");
  });

  reports.forEach((report) => touch(report.submittedBy, report.submittedByName, "reportsSubmitted"));
  agents.forEach((agent) => {
    touch(agent.createdBy, agent.createdByName, "agentsCreated");
    if (agent.reviewedBy) touch(agent.reviewedBy, agent.reviewedByName, "agentReviews");
  });
  shifts.forEach((shift) => {
    touch(shift.userEmail, shift.userName, "orderUpdates");
  });
  oplEntries.forEach((entry) => touch(entry.submittedBy, entry.submittedByName, "oplEntries"));
  refunds.forEach((refund) => touch(refund.createdBy, refund.createdByName, "refundsLogged"));

  return Object.values(activity)
    .map((row) => ({
      ...row,
      total: row.orderUpdates + row.labelsUploaded + row.paymentsHandled + row.dropoffsVerified + row.reportsSubmitted + row.agentsCreated + row.agentReviews + row.oplEntries + row.refundsLogged,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function makeRecentAudit(shipments, reports, agents, shifts = [], oplEntries = [], refunds = []) {
  const events = [];
  shipments.forEach((shipment) => {
    (Array.isArray(shipment.auditLog) ? shipment.auditLog : []).forEach((event) => {
      events.push({
        at: event.at,
        by: event.by,
        type: "Order",
        target: shipment.number,
        action: event.action || "order_update",
        message: event.message || "Order updated.",
      });
    });
  });
  reports.forEach((report) => {
    events.push({
      at: report.createdAt || report.updatedAt || report.reportDate,
      by: report.submittedBy,
      type: "Store Report",
      target: `${report.locationName} ${report.reportDate}`,
      action: "store_report_submitted",
      message: `Store report submitted with ${report.checklistScore || 0}% checklist score.`,
    });
  });
  agents.forEach((agent) => {
    events.push({
      at: agent.createdAt,
      by: agent.createdBy,
      type: "Agent",
      target: agent.name,
      action: "agent_scorecard_created",
      message: `${agent.weightedScore || 0}/100 weighted readiness score.`,
    });
    if (agent.reviewedAt) {
      events.push({
        at: agent.reviewedAt,
        by: agent.reviewedBy,
        type: "Agent",
        target: agent.name,
        action: `agent_${agent.approvalStatus}`,
        message: approvalLabel(agent.approvalStatus),
      });
    }
  });
  shifts.forEach((shift) => {
    events.push({
      at: shift.clockInAt,
      by: shift.userEmail,
      type: "Shift",
      target: shift.locationName,
      action: "clock_in",
      message: `${shift.userName} clocked in. Location check: ${locationLabel(shift.clockInLocation)}.`,
    });
    if (shift.clockOutAt) {
      events.push({
        at: shift.clockOutAt,
        by: shift.userEmail,
        type: "Shift",
        target: shift.locationName,
        action: "clock_out",
        message: `${shift.userName} clocked out with ${shift.kpiScore || 0}/100 KPI score, ${shift.checklist?.reviewAsks || 0} review asks, and ${locationLabel(shift.clockOutLocation)} location check.`,
      });
    }
  });
  oplEntries.forEach((entry) => {
    const publicEntry = publicOplEntry(entry);
    events.push({
      at: publicEntry.updatedAt || publicEntry.createdAt || publicEntry.logDate,
      by: publicEntry.submittedBy,
      type: "OPL",
      target: `${publicEntry.locationName} ${publicEntry.airbill || publicEntry.shipperName || publicEntry.logDate}`,
      action: publicEntry.shipmentStatus || "New",
      message: `${publicEntry.salesDept}: ${publicEntry.shipperName || "Shipment"} to ${publicEntry.shipmentDestination || "destination pending"} - ${publicEntry.commentsNotes || "OPL row saved."}`,
    });
  });
  refunds.forEach((refund) => {
    const history = Array.isArray(refund.history) && refund.history.length ? refund.history : [{
      at: refund.createdAt,
      by: refund.createdBy,
      action: "created",
      message: "Refund record created.",
    }];
    history.forEach((event) => {
      events.push({
        at: event.at || refund.updatedAt || refund.createdAt,
        by: event.by || refund.createdBy,
        type: "Refund",
        target: `${refund.locationName} ${refund.orderNumber || refund.customerName || refund.id}`,
        action: event.action || refund.refundStatus || "updated",
        message: `${event.message || "Refund record updated."} Amount: $${num(refund.amount).toFixed(2)}.`,
      });
    });
  });
  return events
    .filter((event) => event.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 40);
}

function publicTraining(record) {
  return {
    userEmail: record.userEmail,
    userName: record.userName,
    locationId: record.locationId,
    locationName: record.locationName,
    agreementAcknowledgedAt: record.agreementAcknowledgedAt || "",
    agreementVersion: record.agreementVersion || "Retail Associate Operating Agreement",
    modulesUnlocked: Boolean(record.agreementAcknowledgedAt),
    updatedAt: record.updatedAt || record.agreementAcknowledgedAt || "",
  };
}

function publicShift(shift) {
  return {
    id: shift.id,
    userEmail: shift.userEmail,
    userName: shift.userName,
    locationId: shift.locationId,
    locationName: shift.locationName,
    status: shift.status,
    clockInAt: shift.clockInAt,
    clockOutAt: shift.clockOutAt || "",
    clockInLocation: shift.clockInLocation || null,
    clockOutLocation: shift.clockOutLocation || null,
    locationReviewRequired: Boolean(shift.locationReviewRequired),
    locationStatusLabel: shift.locationStatusLabel || locationLabel(shift.clockOutLocation || shift.clockInLocation),
    durationMinutes: shift.clockOutAt ? Math.max(0, Math.round((new Date(shift.clockOutAt) - new Date(shift.clockInAt)) / 60000)) : 0,
    checklist: shift.checklist || null,
    kpiScore: shift.kpiScore || 0,
    teamsNotificationStatus: shift.teamsNotificationStatus || "",
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,
  };
}

function publicOplEntry(entry) {
  const shipmentStatus = clean(entry.shipmentStatus || entry.status) || "New";
  const salesDept = normalizedSalesDept(entry);
  const shipmentType = normalizedShipmentType(entry, salesDept);
  const shipperName = clean(entry.shipperName || entry.customerName);
  const airbill = clean(entry.airbill || entry.reference);
  const commentsNotes = clean(entry.commentsNotes || entry.issue || entry.notes);
  return {
    id: entry.id,
    logDate: entry.logDate,
    locationId: entry.locationId,
    locationName: entry.locationName,
    submittedBy: entry.submittedBy,
    submittedByName: entry.submittedByName,
    branchAgent: clean(entry.branchAgent || entry.submittedByName),
    salesDept,
    shipperName,
    driverLicenseLast4: clean(entry.driverLicenseLast4),
    driverLicenseExpiration: clean(entry.driverLicenseExpiration),
    shipperEmail: clean(entry.shipperEmail),
    shipmentDestination: clean(entry.shipmentDestination),
    airbill,
    shipmentType,
    packageType: shipmentType,
    saleAmount: num(entry.saleAmount),
    dropOff: num(entry.dropOff),
    shipmentStatus,
    commentsNotes,
    emailSent: normalizeYesNo(entry.emailSent),
    resolved: normalizeYesNo(entry.resolved),
    resolutionDate: clean(entry.resolutionDate),
    category: salesDept,
    shiftPart: entry.shiftPart,
    reference: airbill,
    customerName: shipperName,
    issue: commentsNotes,
    actionTaken: entry.actionTaken,
    status: shipmentStatus,
    followUpOwner: entry.followUpOwner,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function normalizeYesNo(value) {
  const normalized = clean(value).toUpperCase();
  if (normalized === "YES") return "Y";
  if (normalized === "NO") return "N";
  return normalized === "Y" || normalized === "N" ? normalized : "";
}

function normalizedOplStatus(entry) {
  const raw = clean(entry.shipmentStatus || entry.status);
  const lower = raw.toLowerCase().replace(/[_-]/g, " ");
  if (lower === "in transit") return "In transit";
  if (lower === "delivered" || lower === "resolved") return "Delivered";
  if (lower === "added to cs" || lower === "customer service" || lower === "escalated" || lower === "needs follow up") return "Added to CS";
  if (lower === "other" || lower === "open") return "Other";
  if (lower === "logged" || lower === "new" || !lower) return "New";
  return raw;
}

function normalizedShipmentType(entry, salesDept = normalizedSalesDept(entry)) {
  const raw = clean(entry.shipmentType || entry.packageType || entry.documentType || entry.shipmentKind);
  const lower = raw.toLowerCase().replace(/[_-]/g, " ");
  if (lower.includes("doc")) return "Document";
  if (lower.includes("pack") || lower.includes("non doc") || lower.includes("nondoc") || lower.includes("parcel")) return "Package";
  if (lower.includes("drop")) return "Drop-off";
  if (lower.includes("other")) return "Other";
  if (salesDept === "DHL-DropOff") return "Drop-off";
  return raw;
}

function normalizedSalesDept(entry) {
  const raw = clean(entry.salesDept || entry.category);
  const lower = raw.toLowerCase().replace(/[_-]/g, " ");
  if (lower.includes("drop")) return "DHL-DropOff";
  if (lower.includes("duplicate")) return "Duplicate";
  if (lower.includes("other")) return "Other";
  return "DHL-Shipment";
}

function publicOplViews(entries) {
  const publicEntries = entries.map(publicOplEntry);
  return {
    customerService: publicEntries.filter((entry) => entry.shipmentStatus === "Added to CS"),
    delivered: publicEntries.filter((entry) => entry.shipmentStatus === "Delivered"),
    dailySummary: makeOplDailySummary(publicEntries),
    contractorPerformance: makeOplContractorPerformance(publicEntries),
  };
}

function publicRefund(refund) {
  return {
    id: refund.id,
    refundDate: refund.refundDate,
    locationId: refund.locationId,
    locationName: refund.locationName,
    createdBy: refund.createdBy,
    createdByName: refund.createdByName,
    customerName: refund.customerName,
    orderNumber: refund.orderNumber,
    serviceType: refund.serviceType,
    amount: refund.amount,
    method: refund.method,
    reason: refund.reason,
    approvedBy: refund.approvedBy,
    refundStatus: refund.refundStatus,
    notes: refund.notes,
    history: Array.isArray(refund.history) ? refund.history : [],
    createdAt: refund.createdAt,
    updatedAt: refund.updatedAt,
  };
}

function makeOplSummary(entries) {
  const today = new Date().toISOString().slice(0, 10);
  const publicEntries = entries.map(publicOplEntry);
  const delivered = publicEntries.filter((entry) => entry.shipmentStatus === "Delivered");
  const emailSent = publicEntries.filter((entry) => entry.emailSent === "Y");
  const dropOffs = publicEntries.reduce((total, entry) => total + num(entry.dropOff), 0);
  const saleAmount = publicEntries.reduce((total, entry) => total + num(entry.saleAmount), 0);
  const addedToCs = publicEntries.filter((entry) => entry.shipmentStatus === "Added to CS");
  return {
    count: publicEntries.length,
    todayCount: publicEntries.filter((entry) => entry.logDate === today).length,
    dhlShipmentCount: publicEntries.filter((entry) => entry.salesDept === "DHL-Shipment").length,
    duplicateCount: publicEntries.filter((entry) => entry.salesDept === "Duplicate").length,
    documentCount: publicEntries.filter((entry) => entry.shipmentType === "Document").length,
    packageCount: publicEntries.filter((entry) => entry.shipmentType === "Package").length,
    dropOffCount: dropOffs,
    deliveredCount: delivered.length,
    customerServiceCount: addedToCs.length,
    emailSentCount: emailSent.length,
    missingEmailCount: Math.max(0, delivered.length - emailSent.length),
    saleAmount,
    dropOffIncome: dropOffs * 1.5,
    grossIncome: saleAmount / 2 + dropOffs * 1.5,
    openCount: addedToCs.filter((entry) => entry.resolved !== "Y").length,
    escalatedCount: addedToCs.length,
  };
}

function makeOplDailySummary(entries) {
  const byDate = {};
  entries.forEach((entry) => {
    const date = clean(entry.logDate);
    if (!date) return;
    if (!byDate[date]) {
      byDate[date] = {
        date,
        totalDhlShipments: 0,
        totalDhlDuplicates: 0,
        totalDhlDropOffs: 0,
        totalDocuments: 0,
        totalPackages: 0,
        dhlSales: 0,
        dropOffIncome: 0,
        grossIncome: 0,
        totalDhlTransactions: 0,
        deliveredComplete: 0,
        addedToCs: 0,
        emailSent: 0,
        missingEmails: 0,
        emailPercent: 0,
        flag: "",
      };
    }
    const row = byDate[date];
    if (entry.salesDept === "DHL-Shipment") row.totalDhlShipments += 1;
    if (entry.salesDept === "Duplicate") row.totalDhlDuplicates += 1;
    if (entry.salesDept === "DHL-DropOff") row.totalDhlDropOffs += 1;
    if (entry.shipmentType === "Document") row.totalDocuments += 1;
    if (entry.shipmentType === "Package") row.totalPackages += 1;
    row.dhlSales += num(entry.saleAmount);
    row.dropOffIncome += num(entry.dropOff) * 1.5;
    row.totalDhlTransactions += 1;
    if (entry.shipmentStatus === "Delivered") row.deliveredComplete += 1;
    if (entry.shipmentStatus === "Added to CS") row.addedToCs += 1;
    if (entry.emailSent === "Y") row.emailSent += 1;
  });
  return Object.values(byDate)
    .map((row) => {
      row.grossIncome = row.dhlSales / 2 + row.dropOffIncome;
      row.missingEmails = Math.max(0, row.deliveredComplete - row.emailSent);
      row.emailPercent = row.deliveredComplete ? Math.round((row.emailSent / row.deliveredComplete) * 100) : 0;
      if (row.totalDhlShipments === 0 && row.totalDhlDropOffs === 0 && row.totalDhlDuplicates === 0) row.flag = "NO ACTIVITY";
      else if (row.deliveredComplete === 0) row.flag = "NO DELIVERIES";
      else if (row.emailSent === 0) row.flag = "NO EMAILS";
      else if (row.missingEmails > 0) row.flag = "MISSING EMAILS";
      else row.flag = "OK";
      return row;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function makeOplContractorPerformance(entries) {
  const byAgent = {};
  entries.forEach((entry) => {
    const agent = clean(entry.branchAgent || entry.submittedByName || entry.submittedBy);
    if (!agent) return;
    if (!byAgent[agent]) {
      byAgent[agent] = {
        branchAgent: agent,
        salesTotal: 0,
        activeDates: new Set(),
        totalTransactions: 0,
        customerServiceCount: 0,
      };
    }
    const row = byAgent[agent];
    row.salesTotal += num(entry.saleAmount);
    row.totalTransactions += 1;
    if (entry.logDate) row.activeDates.add(entry.logDate);
    if (entry.shipmentStatus === "Added to CS") row.customerServiceCount += 1;
  });
  return Object.values(byAgent)
    .map((row) => ({
      branchAgent: row.branchAgent,
      avgDailySales: row.activeDates.size ? Math.round((row.salesTotal / row.activeDates.size) * 100) / 100 : 0,
      totalTransactions: row.totalTransactions,
      customerServiceCount: row.customerServiceCount,
    }))
    .sort((a, b) => b.totalTransactions - a.totalTransactions || a.branchAgent.localeCompare(b.branchAgent));
}

function makeRefundSummary(refunds) {
  return {
    count: refunds.length,
    totalAmount: refunds.reduce((total, refund) => total + num(refund.amount), 0),
    pendingCount: refunds.filter((refund) => refund.refundStatus === "pending").length,
    completedCount: refunds.filter((refund) => refund.refundStatus === "completed").length,
  };
}

function makeShiftSummary(shifts) {
  const ended = shifts.filter((shift) => shift.status === "ended");
  const active = shifts.filter((shift) => shift.status === "active");
  const avg = (field) => ended.length ? Math.round(ended.reduce((total, shift) => total + num(shift[field]), 0) / ended.length) : 0;
  return {
    totalShifts: shifts.length,
    activeShifts: active.length,
    endedShifts: ended.length,
    avgKpiScore: avg("kpiScore"),
    totalReviewAsks: ended.reduce((total, shift) => total + num(shift.checklist?.reviewAsks), 0),
    totalCustomersHelped: ended.reduce((total, shift) => total + num(shift.checklist?.customersHelped), 0),
    totalServiceOrders: ended.reduce((total, shift) => total + num(shift.checklist?.serviceOrdersHandled), 0),
    totalLabelsUploaded: ended.reduce((total, shift) => total + num(shift.checklist?.labelsUploaded), 0),
    totalPaymentsHandled: ended.reduce((total, shift) => total + num(shift.checklist?.paymentsHandled), 0),
    locationReviewsRequired: shifts.filter((shift) => shift.locationReviewRequired).length,
  };
}

function scoreShiftChecklist(checklist) {
  const checks = [
    bool(checklist.openingChecklistCompleted),
    bool(checklist.duringDayChecklistCompleted),
    bool(checklist.shipmentChecklistCompleted),
    bool(checklist.escalationChecklistCompleted),
    bool(checklist.statusInquiryStandardFollowed),
    bool(checklist.customerDataProtected),
    bool(checklist.dressedProperly),
    bool(checklist.downtimeProductive),
    bool(checklist.oplCompleted),
    bool(checklist.dailyReportCompleted),
    bool(checklist.customerIssuesLogged),
    bool(checklist.suppliesChecked),
    bool(checklist.workspaceClosed),
  ];
  const trafficActivity = num(checklist.customersHelped) + num(checklist.serviceOrdersHandled);
  const activityScore = trafficActivity
    ? Math.min(25, num(checklist.reviewAsks) * 3 + num(checklist.customersHelped) * 1.5 + num(checklist.serviceOrdersHandled) * 2)
    : (bool(checklist.downtimeProductive) ? 20 : 0);
  return Math.min(100, Math.round(activityScore + (checks.filter(Boolean).length / checks.length) * 75));
}

function trainingForUser(training, user) {
  return training.find((record) => record.userEmail === user.email) || null;
}

function shapeAgreementAcknowledgment(body, user) {
  const location = findLocation(user.locationId || body.locationId);
  const now = new Date().toISOString();
  return {
    userEmail: user.email,
    userName: user.name || user.email,
    locationId: location.id,
    locationName: location.name,
    agreementVersion: clean(body.agreementVersion) || "Retail Associate Operating Agreement",
    agreementAcknowledgedAt: now,
    acknowledgedIp: "",
    updatedAt: now,
  };
}

function shapeShiftChecklist(body) {
  return {
    reviewAsks: num(body.reviewAsks),
    customersHelped: num(body.customersHelped),
    serviceOrdersHandled: num(body.serviceOrdersHandled),
    labelsUploaded: num(body.labelsUploaded),
    paymentsHandled: num(body.paymentsHandled),
    notaryRequestsHandled: num(body.notaryRequestsHandled),
    complaintsOrIssues: num(body.complaintsOrIssues),
    openingChecklistCompleted: bool(body.openingChecklistCompleted),
    duringDayChecklistCompleted: bool(body.duringDayChecklistCompleted),
    shipmentChecklistCompleted: bool(body.shipmentChecklistCompleted),
    escalationChecklistCompleted: bool(body.escalationChecklistCompleted),
    statusInquiryStandardFollowed: bool(body.statusInquiryStandardFollowed),
    customerDataProtected: bool(body.customerDataProtected),
    dressedProperly: bool(body.dressedProperly),
    downtimeProductive: bool(body.downtimeProductive),
    oplCompleted: bool(body.oplCompleted),
    dailyReportCompleted: bool(body.dailyReportCompleted),
    customerIssuesLogged: bool(body.customerIssuesLogged),
    suppliesChecked: bool(body.suppliesChecked),
    workspaceClosed: bool(body.workspaceClosed),
    notes: clean(body.shiftNotes),
  };
}

function resolveUserLocation(body, user, existing = null) {
  if (user.role === "owner") return findLocation(body.locationId || existing?.locationId || user.locationId || "bridgeview");
  return findLocation(user.locationId || existing?.locationId || "bridgeview");
}

function shapeOplEntry(body, user, existing = null) {
  const now = new Date().toISOString();
  const location = resolveUserLocation(body, user, existing);
  const salesDept = normalizedSalesDept({
    salesDept: body.salesDept || existing?.salesDept,
    category: body.category || existing?.category,
  });
  const shipmentType = normalizedShipmentType({
    shipmentType: body.shipmentType || body.packageType || existing?.shipmentType || existing?.packageType,
  }, salesDept);
  const shipmentStatus = normalizedOplStatus({
    shipmentStatus: body.shipmentStatus || body.status || existing?.shipmentStatus || existing?.status || "New",
  });
  const shipperName = clean(body.shipperName || body.customerName || existing?.shipperName || existing?.customerName);
  const airbill = clean(body.airbill || body.reference || existing?.airbill || existing?.reference);
  const existingComments = clean(existing?.commentsNotes || existing?.issue || existing?.notes);
  const submittedComments = clean(body.commentsNotes || body.issue || body.notes);
  const appendNote = clean(body.appendNote || body.noteToAppend);
  let commentsNotes = submittedComments || existingComments;
  if (appendNote) {
    const by = clean(user.name || user.email);
    const stampedNote = `${now.slice(0, 16).replace("T", " ")} ${by}: ${appendNote}`;
    commentsNotes = [submittedComments || existingComments, stampedNote].filter(Boolean).join("\n");
  }
  const dropOff = body.dropOff === undefined && existing?.dropOff !== undefined
    ? num(existing.dropOff)
    : (bool(body.dropOff) || salesDept === "DHL-DropOff" ? 1 : num(body.dropOff));
  const emailSent = normalizeYesNo(body.emailSent || existing?.emailSent || (airbill ? "N" : ""));
  const resolved = normalizeYesNo(
    body.resolved ||
    existing?.resolved ||
    (shipmentStatus === "Delivered" ? "Y" : shipmentStatus === "Added to CS" ? "N" : "")
  );
  const resolutionDate = clean(body.resolutionDate || existing?.resolutionDate || (resolved === "Y" ? now.slice(0, 10) : ""));
  return {
    id: existing?.id || `opl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    logDate: clean(body.logDate || existing?.logDate) || now.slice(0, 10),
    locationId: location.id,
    locationName: location.name,
    submittedBy: existing?.submittedBy || user.email,
    submittedByName: existing?.submittedByName || user.name || user.email,
    branchAgent: clean(body.branchAgent || existing?.branchAgent || user.name || user.email),
    salesDept,
    shipperName,
    driverLicenseLast4: clean(body.driverLicenseLast4 || existing?.driverLicenseLast4),
    driverLicenseExpiration: clean(body.driverLicenseExpiration || existing?.driverLicenseExpiration),
    shipperEmail: clean(body.shipperEmail || existing?.shipperEmail),
    shipmentDestination: clean(body.shipmentDestination || existing?.shipmentDestination),
    airbill,
    shipmentType,
    packageType: shipmentType,
    saleAmount: num(body.saleAmount ?? existing?.saleAmount),
    dropOff,
    shipmentStatus,
    commentsNotes,
    emailSent,
    resolved,
    resolutionDate,
    category: salesDept,
    shiftPart: clean(body.shiftPart || existing?.shiftPart) || "During Day",
    reference: airbill,
    customerName: shipperName,
    issue: commentsNotes,
    actionTaken: clean(body.actionTaken || existing?.actionTaken),
    status: shipmentStatus,
    followUpOwner: clean(body.followUpOwner || existing?.followUpOwner),
    notes: commentsNotes,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function shapeRefund(body, user, existing = null) {
  const now = new Date().toISOString();
  const location = resolveUserLocation(body, user, existing);
  const previousStatus = existing?.refundStatus || "";
  const nextStatus = clean(body.refundStatus || existing?.refundStatus) || "pending";
  const history = Array.isArray(existing?.history) ? existing.history.slice() : [];
  const action = existing ? "updated" : "created";
  const refund = {
    id: existing?.id || `refund_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    refundDate: clean(body.refundDate || existing?.refundDate) || now.slice(0, 10),
    locationId: location.id,
    locationName: location.name,
    createdBy: existing?.createdBy || user.email,
    createdByName: existing?.createdByName || user.name || user.email,
    customerName: clean(body.customerName || existing?.customerName),
    orderNumber: clean(body.orderNumber || existing?.orderNumber),
    serviceType: clean(body.serviceType || existing?.serviceType) || "DHL / Counter Service",
    amount: num(body.amount ?? existing?.amount),
    method: clean(body.method || existing?.method) || "counter",
    reason: clean(body.reason || existing?.reason),
    approvedBy: clean(body.approvedBy || existing?.approvedBy || user.name || user.email),
    refundStatus: nextStatus,
    notes: clean(body.notes || existing?.notes),
    history,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  refund.history.push({
    at: now,
    by: user.email,
    byName: user.name || user.email,
    action,
    message: existing && previousStatus !== nextStatus ? `Refund status changed from ${previousStatus || "blank"} to ${nextStatus}.` : `Refund ${action}.`,
    amount: refund.amount,
    status: refund.refundStatus,
    notes: clean(body.historyNote || body.notes),
  });
  return refund;
}

async function buildEmployeeDashboard(user) {
  const [shifts, training] = await Promise.all([readShifts(user), readTrainingRecords(user)]);
  const visibleShifts = shifts.filter((shift) => canSeeShift(user, shift)).sort((a, b) => String(b.clockInAt || "").localeCompare(String(a.clockInAt || "")));
  const activeShift = visibleShifts.find((shift) => shift.userEmail === user.email && shift.status === "active") || null;
  const trainingStatus = trainingForUser(training, user);
  return {
    shifts: visibleShifts.map(publicShift),
    activeShift: activeShift ? publicShift(activeShift) : null,
    trainingStatus: trainingStatus ? publicTraining(trainingStatus) : null,
    summary: makeShiftSummary(visibleShifts),
    canViewAll: user.role === "owner" || user.role === "manager",
  };
}

async function acknowledgeAgreement(body, user) {
  const training = await readTrainingRecords(user);
  const record = shapeAgreementAcknowledgment(body, user);
  const index = training.findIndex((item) => item.userEmail === user.email);
  if (index === -1) training.push(record);
  else training[index] = { ...training[index], ...record };
  await writeTrainingRecords(user, training);
  await sendTeamsNotice("CubicShip agreement acknowledged", [
    `Employee: ${record.userName}`,
    `Location: ${record.locationName}`,
    `Agreement: ${record.agreementVersion}`,
  ]);
  return record;
}

async function clockIn(body, user) {
  const shifts = await readShifts(user);
  const existing = shifts.find((shift) => shift.userEmail === user.email && shift.status === "active");
  if (existing) return { shift: existing, alreadyActive: true };
  const location = findLocation(user.locationId || "bridgeview");
  const now = new Date().toISOString();
  const clockInLocation = shapeLocationVerification(body.locationVerification, location, "clock_in");
  const shift = {
    id: `shift_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userEmail: user.email,
    userName: user.name || user.email,
    locationId: location.id,
    locationName: location.name,
    status: "active",
    clockInAt: now,
    clockOutAt: "",
    clockInLocation,
    clockOutLocation: null,
    locationReviewRequired: Boolean(clockInLocation.reviewRequired),
    locationStatusLabel: locationLabel(clockInLocation),
    checklist: null,
    kpiScore: 0,
    createdAt: now,
    updatedAt: now,
  };
  const notice = await sendTeamsNotice("CubicShip employee clocked in", [
    `Employee: ${shift.userName}`,
    `Location: ${shift.locationName}`,
    `Time: ${shift.clockInAt}`,
    `Location check: ${shift.locationStatusLabel} - ${clockInLocation.message}`,
  ]);
  shift.teamsNotificationStatus = notice.ok ? "sent" : notice.skipped ? "not_configured" : "failed";
  shifts.push(shift);
  await writeShifts(user, shifts);
  return { shift, alreadyActive: false };
}

async function clockOut(body, user) {
  const shifts = await readShifts(user);
  const index = shifts.findIndex((shift) => shift.userEmail === user.email && shift.status === "active");
  if (index === -1) return null;
  const now = new Date().toISOString();
  const checklist = shapeShiftChecklist(body);
  const location = findLocation(shifts[index].locationId || user.locationId || "bridgeview");
  const clockOutLocation = shapeLocationVerification(body.locationVerification, location, "clock_out");
  const locationReviewRequired = Boolean(shifts[index].clockInLocation?.reviewRequired || clockOutLocation.reviewRequired);
  const shift = {
    ...shifts[index],
    status: "ended",
    clockOutAt: now,
    clockOutLocation,
    locationReviewRequired,
    locationStatusLabel: locationLabel(clockOutLocation),
    checklist,
    kpiScore: scoreShiftChecklist(checklist),
    updatedAt: now,
  };
  const notice = await sendTeamsNotice("CubicShip employee clocked out", [
    `Employee: ${shift.userName}`,
    `Location: ${shift.locationName}`,
    `KPI score: ${shift.kpiScore}/100`,
    `Review asks: ${checklist.reviewAsks}`,
    `Customers helped: ${checklist.customersHelped}`,
    `Location check: ${shift.locationStatusLabel} - ${clockOutLocation.message}`,
    `Notes: ${checklist.notes || "None"}`,
  ]);
  shift.teamsNotificationStatus = notice.ok ? "sent" : notice.skipped ? "not_configured" : "failed";
  shifts[index] = shift;
  await writeShifts(user, shifts);
  return shift;
}

async function handleEmployeeDashboardPost(body, user) {
  const action = clean(body.action);
  if (action === "acknowledge_agreement") {
    await acknowledgeAgreement(body, user);
    return buildEmployeeDashboard(user);
  }
  if (action === "clock_in") {
    await clockIn(body, user);
    return buildEmployeeDashboard(user);
  }
  if (action === "clock_out") {
    const shift = await clockOut(body, user);
    if (!shift) {
      const error = new Error("No active shift found for this employee.");
      error.statusCode = 400;
      throw error;
    }
    return buildEmployeeDashboard(user);
  }
  const error = new Error("Use acknowledge_agreement, clock_in, or clock_out.");
  error.statusCode = 400;
  throw error;
}

function makeOwnerDashboard(shipments, reports, agents, shifts = [], oplEntries = [], refunds = []) {
  const storeSummary = makeSummary(reports);
  const agentSummary = makeAgentSummary(agents);
  const shiftSummary = makeShiftSummary(shifts);
  const oplSummary = makeOplSummary(oplEntries);
  const refundSummary = makeRefundSummary(refunds);
  const paidShipments = shipments.filter((shipment) => shipment.payment?.status === "paid");
  const paymentDueShipments = shipments.filter((shipment) => shipment.payment?.status === "due" || shipment.status === "payment_due");
  const labelShipments = shipments.filter((shipment) => shipment.labelPdf);
  const summary = {
    totalOrders: shipments.length,
    activeOrders: shipments.filter((shipment) => ["submitted", "in_review", "payment_due", "ready_for_dropoff", "issue"].includes(shipment.status)).length,
    completedOrders: shipments.filter((shipment) => shipment.status === "completed").length,
    labelsUploaded: labelShipments.length,
    paymentDue: paymentDueShipments.length,
    paidOrders: paidShipments.length,
    notaryRequests: shipments.filter((shipment) => shipment.serviceType === "Virtual Notary").length,
    storeReports: reports.length,
    revenueTarget: storeSummary.revenueTarget,
    actualRevenue: storeSummary.actualRevenue,
    revenueAchievement: storeSummary.revenueAchievement,
    avgChecklistScore: storeSummary.avgChecklistScore,
    complaints: storeSummary.complaints,
    agentCount: agentSummary.count,
    pendingAgentReviews: agentSummary.pendingReview,
    approvedAgents: agentSummary.approved,
    avgAgentScore: agentSummary.avgWeightedScore,
    avgTrainingCompletion: agentSummary.avgTrainingCompletion,
    activeShifts: shiftSummary.activeShifts,
    totalShifts: shiftSummary.totalShifts,
    avgShiftKpiScore: shiftSummary.avgKpiScore,
    totalReviewAsks: shiftSummary.totalReviewAsks,
    locationReviewsRequired: shiftSummary.locationReviewsRequired,
    oplEntries: oplSummary.count,
    openOplEntries: oplSummary.openCount,
    escalatedOplEntries: oplSummary.escalatedCount,
    refundCount: refundSummary.count,
    refundAmount: refundSummary.totalAmount,
    pendingRefunds: refundSummary.pendingCount,
    completedRefunds: refundSummary.completedCount,
  };
  return {
    summary,
    serviceBreakdown: makeBreakdown(shipments, (shipment) => shipment.serviceType || "Unknown"),
    statusBreakdown: makeBreakdown(shipments, (shipment) => statusLabel(shipment.status)),
    locationBreakdown: makeBreakdown(shipments, (shipment) => shipment.locationName || shipment.locationId || "Unassigned"),
    paymentBreakdown: makeBreakdown(shipments, (shipment) => shipment.payment?.status || "not_ready"),
    storeKpiByLocation: makeBreakdown(reports, (report) => report.locationName, (report) => num(report.checklistScore)),
    oplBreakdown: makeBreakdown(oplEntries, (entry) => normalizedSalesDept(entry)),
    oplStatusBreakdown: makeBreakdown(oplEntries, (entry) => normalizedOplStatus(entry)),
    oplDestinationAmountBreakdown: makeBreakdown(oplEntries, oplDestinationLabel, (entry) => num(entry.saleAmount)),
    oplCountryAmountBreakdown: makeBreakdown(oplEntries, oplCountryLabel, (entry) => num(entry.saleAmount)),
    oplLocationAmountBreakdown: makeBreakdown(oplEntries, (entry) => entry.locationName || entry.locationId || "Unassigned", (entry) => num(entry.saleAmount)),
    oplShipmentTypeBreakdown: makeBreakdown(oplEntries, (entry) => normalizedShipmentType(entry)),
    oplShipmentTypeAmountBreakdown: makeBreakdown(oplEntries, (entry) => normalizedShipmentType(entry), (entry) => num(entry.saleAmount)),
    refundLocationBreakdown: makeBreakdown(refunds, (refund) => refund.locationName || refund.locationId || "Unassigned", (refund) => num(refund.amount)),
    refundStatusBreakdown: makeBreakdown(refunds, (refund) => refund.refundStatus || "pending", (refund) => num(refund.amount)),
    employeeActivity: makeEmployeeActivity(shipments, reports, agents, shifts, oplEntries, refunds),
    recentAudit: makeRecentAudit(shipments, reports, agents, shifts, oplEntries, refunds),
  };
}

function shapeReport(body, user, existing = null) {
  const location = findLocation(body.locationId || user.locationId || existing?.locationId);
  const checklistChecks = [
    bool(body.storeOpenedOnTime),
    bool(body.closingCompleted),
    bool(body.oplCompleted),
    bool(body.shipmentsAccurate),
    bool(body.noRepeatedErrors),
    bool(body.customerGreeting),
    bool(body.reviewRequested),
    bool(body.organizedWorkflow),
    bool(body.revenueAwareness),
    bool(body.escalatedIssues),
  ];
  const score = Math.round((checklistChecks.filter(Boolean).length / checklistChecks.length) * 100);
  const now = new Date().toISOString();
  return {
    id: existing?.id || `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    reportDate: clean(body.reportDate) || new Date().toISOString().slice(0, 10),
    locationId: location.id,
    locationName: location.name,
    submittedBy: user.email,
    submittedByName: user.name || user.email,
    revenueTarget: num(body.revenueTarget),
    actualRevenue: num(body.actualRevenue),
    docShipments: num(body.docShipments),
    nonDocShipments: num(body.nonDocShipments),
    serviceOrders: num(body.serviceOrders),
    oplCompleted: bool(body.oplCompleted),
    openingOnTime: bool(body.storeOpenedOnTime),
    closingCompleted: bool(body.closingCompleted),
    shipmentAccuracy: num(body.shipmentAccuracy || (bool(body.shipmentsAccurate) ? 100 : 0)),
    responseTimeMinutes: num(body.responseTimeMinutes),
    googleRating: num(body.googleRating),
    reviewsRequested: num(body.reviewsRequested),
    newReviews: num(body.newReviews),
    complaints: num(body.complaints),
    topDestinations: clean(body.topDestinations),
    addOnServices: clean(body.addOnServices),
    issues: clean(body.issues),
    suppliesOrEquipment: clean(body.suppliesOrEquipment),
    managerNotes: clean(body.managerNotes),
    checklistScore: score,
    checklistStatus: checklistStatus(score),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function shapeAgent(body, user, existing = null) {
  const location = resolveAgentLocation(body.locationId || existing?.locationId || user.locationId);
  const scores = {
    scoreService: scoreValue(body.scoreService ?? existing?.scores?.scoreService),
    scoreReliability: scoreValue(body.scoreReliability ?? existing?.scores?.scoreReliability),
    scoreSystems: scoreValue(body.scoreSystems ?? existing?.scores?.scoreSystems),
    scoreCommunication: scoreValue(body.scoreCommunication ?? existing?.scores?.scoreCommunication),
    scoreSecurity: scoreValue(body.scoreSecurity ?? existing?.scores?.scoreSecurity),
    scoreRevenue: scoreValue(body.scoreRevenue ?? existing?.scores?.scoreRevenue),
  };
  const weightedScore = weightedAgentScore(scores);
  const training = trainingFromBody(body);
  const stage = clean(body.stage || existing?.stage || "Interview");
  const now = new Date().toISOString();
  return {
    id: existing?.id || `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || user.email,
    createdByName: existing?.createdByName || user.name || user.email,
    name: clean(body.name || existing?.name),
    locationId: location.id,
    locationName: location.name,
    stage,
    role: clean(body.role || existing?.role || "Retail Associate"),
    scores,
    weightedScore,
    scoreStatus: agentScoreStatus(weightedScore),
    recommendation: agentRecommendation(weightedScore, training.completion),
    nextStep: agentNextStep(stage, weightedScore, training.completion),
    trainingCompleted: training.completed,
    trainingCompletion: training.completion,
    trainingModules: clean(body.trainingModules || existing?.trainingModules),
    notes: clean(body.notes || existing?.notes),
    approvalStatus: existing?.approvalStatus || "pending_review",
    reviewedBy: existing?.reviewedBy || "",
    reviewedByName: existing?.reviewedByName || "",
    reviewedAt: existing?.reviewedAt || "",
    reviewNotes: existing?.reviewNotes || "",
  };
}

function applyAgentReview(agent, body, user) {
  const action = clean(body.action);
  const statuses = {
    approve: "approved",
    coach: "coaching_required",
    hold: "pending_review",
    reject: "not_approved",
  };
  const status = statuses[action];
  if (!status) return null;
  return {
    ...agent,
    approvalStatus: status,
    reviewedBy: user.email,
    reviewedByName: user.name || user.email,
    reviewedAt: new Date().toISOString(),
    reviewNotes: clean(body.reviewNotes),
    updatedAt: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const type = clean(req.query?.type);

  if (req.method === "GET") {
    if (type === "employee-dashboard") {
      const dashboard = await buildEmployeeDashboard(user);
      return json(res, 200, {
        ok: true,
        dashboard,
      });
    }

    if (type === "owner-dashboard") {
      if (!canSeeOwnerDashboard(user)) return json(res, 403, { ok: false, error: "Owner access is required." });
      const [shipments, reports, agents, shifts, oplEntries, refunds] = await Promise.all([
        readShipments(user),
        readReports(user),
        readAgentRecords(user),
        readShifts(user),
        readOplEntries(user),
        readRefunds(user),
      ]);
      return json(res, 200, {
        ok: true,
        dashboard: makeOwnerDashboard(shipments, reports, agents, shifts, oplEntries, refunds),
      });
    }

    if (type === "opl") {
      const entries = (await readOplEntries(user)).filter((entry) => canSeeLocationRecord(user, entry));
      const sortedEntries = entries.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const publicEntries = sortedEntries.map(publicOplEntry);
      return json(res, 200, {
        ok: true,
        entries: publicEntries,
        summary: makeOplSummary(sortedEntries),
        views: publicOplViews(sortedEntries),
      });
    }

    if (type === "refunds") {
      if (!canManageRefunds(user)) return json(res, 403, { ok: false, error: "Manager or owner access is required." });
      const refunds = (await readRefunds(user)).filter((refund) => canSeeLocationRecord(user, refund));
      const sortedRefunds = refunds.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json(res, 200, {
        ok: true,
        refunds: sortedRefunds.map(publicRefund),
        summary: makeRefundSummary(sortedRefunds),
      });
    }

    if (type === "agents") {
      if (!canReviewAgents(user)) return json(res, 403, { ok: false, error: "Manager or owner access is required." });
      const agents = (await readAgentRecords(user)).filter((agent) => canSeeAgent(user, agent));
      const sortedAgents = agents.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json(res, 200, {
        ok: true,
        agents: sortedAgents.map(publicAgent),
        summary: makeAgentSummary(sortedAgents),
        canReview: canReviewAgents(user),
      });
    }

    if (!(user.role === "owner" || user.role === "manager")) return json(res, 403, { ok: false, error: "Manager or owner access is required." });
    const reports = (await readReports(user)).filter((report) => canSeeReport(user, report));
    const sorted = reports.slice().sort((a, b) => String(b.reportDate || "").localeCompare(String(a.reportDate || "")));
    return json(res, 200, {
      ok: true,
      reports: sorted.map(publicReport),
      summary: makeSummary(sorted),
    });
  }

  if (req.method === "POST") {
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
    }

    if (clean(body.type) === "agent" || type === "agents") {
      if (!canReviewAgents(user)) return json(res, 403, { ok: false, error: "Manager or owner access is required." });
      const agents = await readAgentRecords(user);
      const agent = shapeAgent(body, user);
      if (!agent.name) return json(res, 400, { ok: false, error: "Candidate or agent name is required." });
      if (!canSeeAgent(user, agent)) return json(res, 403, { ok: false, error: "This agent belongs to another location." });
      agents.push(agent);
      await writeAgentRecords(user, agents);
      const visibleAgents = agents.filter((item) => canSeeAgent(user, item));
      return json(res, 201, {
        ok: true,
        agent: publicAgent(agent),
        agents: visibleAgents.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map(publicAgent),
        summary: makeAgentSummary(visibleAgents),
        canReview: canReviewAgents(user),
      });
    }

    if (type === "opl") {
      const entries = await readOplEntries(user);
      const requiredFields = [
        [body.branchAgent, "Branch agent is required."],
        [body.salesDept || body.category, "Sales Dept is required."],
        [body.shipperName || body.customerName, "Shipper name is required."],
        [body.shipmentDestination, "Shipment destination is required."],
      ];
      for (const [value, message] of requiredFields) {
        if (!clean(value)) return json(res, 400, { ok: false, error: message });
      }
      const entry = shapeOplEntry(body, user);
      if (!canSeeLocationRecord(user, entry)) return json(res, 403, { ok: false, error: "This OPL entry belongs to another location." });
      entries.push(entry);
      await writeOplEntries(user, entries);
      const visibleEntries = entries.filter((item) => canSeeLocationRecord(user, item));
      const sortedVisible = visibleEntries.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json(res, 201, {
        ok: true,
        entry: publicOplEntry(entry),
        entries: sortedVisible.map(publicOplEntry),
        summary: makeOplSummary(visibleEntries),
        views: publicOplViews(sortedVisible),
      });
    }

    if (type === "refunds") {
      if (!canManageRefunds(user)) return json(res, 403, { ok: false, error: "Manager or owner access is required." });
      const refunds = await readRefunds(user);
      const refund = shapeRefund(body, user);
      if (!refund.amount) return json(res, 400, { ok: false, error: "Refund amount is required." });
      if (!refund.reason) return json(res, 400, { ok: false, error: "Refund reason is required." });
      if (!canSeeLocationRecord(user, refund)) return json(res, 403, { ok: false, error: "This refund belongs to another location." });
      refunds.push(refund);
      await writeRefunds(user, refunds);
      const visibleRefunds = refunds.filter((item) => canSeeLocationRecord(user, item));
      return json(res, 201, {
        ok: true,
        refund: publicRefund(refund),
        refunds: visibleRefunds.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map(publicRefund),
        summary: makeRefundSummary(visibleRefunds),
      });
    }

    if (type === "employee-dashboard") {
      try {
        const dashboard = await handleEmployeeDashboardPost(body, user);
        return json(res, 200, { ok: true, dashboard });
      } catch (error) {
        return json(res, error.statusCode || 400, { ok: false, error: error.message || "Employee dashboard action failed." });
      }
    }

    const reports = await readReports(user);
    if (!(user.role === "owner" || user.role === "manager")) return json(res, 403, { ok: false, error: "Manager or owner access is required." });
    const report = shapeReport(body, user);
    if (!canSeeReport(user, report)) return json(res, 403, { ok: false, error: "This report belongs to another location." });
    reports.push(report);
    await writeReports(user, reports);
    return json(res, 201, { ok: true, report: publicReport(report), summary: makeSummary(reports.filter((item) => canSeeReport(user, item))) });
  }

  if (req.method === "PATCH") {
    if (type === "opl") {
      let body = {};
      try {
        body = await readBody(req);
      } catch (error) {
        return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
      }
      const entries = await readOplEntries(user);
      const index = entries.findIndex((entry) => entry.id === clean(body.id));
      if (index === -1) return json(res, 404, { ok: false, error: "OPL record not found." });
      if (!canSeeLocationRecord(user, entries[index])) return json(res, 403, { ok: false, error: "This OPL entry belongs to another location." });
      entries[index] = shapeOplEntry(body, user, entries[index]);
      await writeOplEntries(user, entries);
      const visibleEntries = entries.filter((item) => canSeeLocationRecord(user, item));
      const sortedVisible = visibleEntries.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json(res, 200, {
        ok: true,
        entry: publicOplEntry(entries[index]),
        entries: sortedVisible.map(publicOplEntry),
        summary: makeOplSummary(visibleEntries),
        views: publicOplViews(sortedVisible),
      });
    }

    if (type === "refunds") {
      if (!canManageRefunds(user)) return json(res, 403, { ok: false, error: "Manager or owner access is required." });
      let body = {};
      try {
        body = await readBody(req);
      } catch (error) {
        return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
      }
      const refunds = await readRefunds(user);
      const index = refunds.findIndex((refund) => refund.id === clean(body.id));
      if (index === -1) return json(res, 404, { ok: false, error: "Refund record not found." });
      if (!canSeeLocationRecord(user, refunds[index])) return json(res, 403, { ok: false, error: "This refund belongs to another location." });
      refunds[index] = shapeRefund(body, user, refunds[index]);
      await writeRefunds(user, refunds);
      const visibleRefunds = refunds.filter((item) => canSeeLocationRecord(user, item));
      return json(res, 200, {
        ok: true,
        refund: publicRefund(refunds[index]),
        refunds: visibleRefunds.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map(publicRefund),
        summary: makeRefundSummary(visibleRefunds),
      });
    }

    if (type !== "agents") return json(res, 400, { ok: false, error: "PATCH is only available for agent, OPL, or refund records." });
    if (!canReviewAgents(user)) return json(res, 403, { ok: false, error: "Manager or owner access is required to review agents." });
    let body = {};
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: "Request body must be valid JSON." });
    }
    const agents = await readAgentRecords(user);
    const index = agents.findIndex((agent) => agent.id === clean(body.id));
    if (index === -1) return json(res, 404, { ok: false, error: "Agent record not found." });
    if (!canSeeAgent(user, agents[index])) return json(res, 403, { ok: false, error: "This agent belongs to another location." });
    const reviewed = applyAgentReview(agents[index], body, user);
    if (!reviewed) return json(res, 400, { ok: false, error: "Use approve, coach, hold, or reject as the review action." });
    agents[index] = reviewed;
    await writeAgentRecords(user, agents);
    const visibleAgents = agents.filter((item) => canSeeAgent(user, item));
    return json(res, 200, {
      ok: true,
      agent: publicAgent(reviewed),
      agents: visibleAgents.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map(publicAgent),
      summary: makeAgentSummary(visibleAgents),
      canReview: canReviewAgents(user),
    });
  }

  if (req.method === "DELETE") {
    if (type === "opl") {
      if (user.role !== "owner") return json(res, 403, { ok: false, error: "Owner access is required to delete OPL rows." });
      const url = new URL(req.url, `https://${req.headers.host || "cubicship.com"}`);
      const id = clean(url.searchParams.get("id"));
      const entries = await readOplEntries(user);
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) return json(res, 404, { ok: false, error: "OPL record not found." });
      const deleted = entries[index];
      entries.splice(index, 1);
      await writeOplEntries(user, entries);
      const visibleEntries = entries.filter((item) => canSeeLocationRecord(user, item));
      const sortedVisible = visibleEntries.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json(res, 200, {
        ok: true,
        deleted: publicOplEntry(deleted),
        entries: sortedVisible.map(publicOplEntry),
        summary: makeOplSummary(visibleEntries),
        views: publicOplViews(sortedVisible),
      });
    }
    return json(res, 400, { ok: false, error: "DELETE is only available for OPL records." });
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
};
