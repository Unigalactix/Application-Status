const PAGE_VIEWS = {
  all: { title: "Total applications", description: "Every application, with a daily calendar and a focused list." },
  active: { title: "Active pipeline", description: "Open opportunities. Age is measured from the last status update, or the application date." },
  assessment: { title: "Assessments", description: "Active records with assessment, coding test, take-home, or online-test stage evidence." },
  screening: { title: "Screening interviews", description: "Active screening, recruiter outreach, virtual agent, phone, technical, or other non-final interview stages. Outreach is not a confirmed appointment." },
  final: { title: "Final interviews", description: "Active final-round, onsite, panel, or final-interview stages. Stage text is not a confirmed appointment." },
  offer: { title: "Offers", description: "Recorded offers and accepted outcomes. Compensation is shown only when present in the source." },
  rejected: { title: "Rejected applications", description: "Employer declines and rejections, with recorded or inferred rejection categories." },
  "follow-up": { title: "Follow-ups & next actions", description: "A manageable action queue. Followed up saves on this device only and postpones the next follow-up by seven days." }
};
const SAVED_VIEWS_KEY = "application-tracker-saved-views-v1";
const SNAPSHOT_KEY = "application-tracker-snapshot-v1";
const VISIT_KEY = "application-tracker-visit-v1";

function currentStage(application) {
  if (!hasMeaningfulValue(application.status)) return "unknown";
  if (isRejectedStatus(application.status)) return "rejected";
  if (isClosedStatus(application.status)) return "closed";
  if (isOfferStatus(application.status)) return "offer";
  const text = `${application.interviewStage} ${application.status}`.toLowerCase();
  if (/\b(final|onsite|on-site|panel)\b/.test(text)) return "final";
  if (/\b(assessment|coding test|take.home|online test|oa)\b/.test(text)) return "assessment";
  if (/\b(screen|screening|interview|recruiter outreach|virtual agent|system design)\b/.test(text)) return "screening";
  if (/action required/i.test(application.status)) return "action";
  return "applied";
}

function canonicalSource(value) {
  const source = value.trim();
  if (!hasMeaningfulValue(source)) return "Not provided";
  const normalized = source.toLowerCase().replace(/[()._-]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.includes("linkedin") && normalized.includes("easy apply")) return "LinkedIn Easy Apply";
  if (normalized === "linkedin" || normalized === "linkedin jobs") return "LinkedIn";
  if (/^amazon( jobs| careers)?$/.test(normalized)) return "Amazon Jobs";
  if (/^microsoft( careers| jobs)?$/.test(normalized)) return "Microsoft Careers";
  if (/^workday( careers| jobs)?$/.test(normalized)) return "Workday";
  return source || "Not provided";
}

function scopeDescription() {
  const range = document.querySelector("#dateRange").value;
  if (range === "custom") {
    return `${document.querySelector("#dateFrom").value || "Any start"} to ${document.querySelector("#dateTo").value || "Any end"}`;
  }
  return range === "all" ? "All time" : `Last ${range} days`;
}

function dateScopeBounds(range, from, to, now = new Date()) {
  if (range === "all") return { from: null, to: null };
  if (range === "custom") return { from: parseDate(from), to: parseDate(to) };
  return { from: addDays(now, 1 - Number(range)), to: startOfDay(now) };
}

function scopedApplications() {
  const range = document.querySelector("#dateRange").value;
  const bounds = dateScopeBounds(range, document.querySelector("#dateFrom").value, document.querySelector("#dateTo").value);
  return state.applications.filter((application) => {
    if (!bounds.from && !bounds.to) return true;
    const date = application.parsedDate && startOfDay(application.parsedDate);
    return date && (!bounds.from || date >= bounds.from) && (!bounds.to || date <= bounds.to);
  });
}

function matchesAge(application, bucket, now = new Date()) {
  if (!bucket) return true;
  const days = daysSince(applicationActivityDate(application), now);
  if (days === null) return false;
  if (bucket === "31+") return days > 30;
  const [min, max] = bucket.split("-").map(Number);
  return days >= min && days <= max;
}

function matchesFollowUpQueue(application, queue, now = new Date()) {
  if (!isActiveApplication(application)) return false;
  const due = followUpDueDate(application, now);
  const today = startOfDay(now);
  const action = /action required/i.test(application.status);
  if (queue === "all") return true;
  if (queue === "action") return action;
  if (queue === "overdue") return due && due < today;
  if (queue === "today") return due && isSameLocalDate(due, today);
  if (queue === "upcoming") return due && due > today;
  return action || (due && due <= today);
}

function matchesWorkspaceFilters(application) {
  const page = state.page;
  const stage = currentStage(application);
  if (page === "active" && !isActiveApplication(application)) return false;
  if (["assessment", "screening", "final", "offer", "rejected"].includes(page) && stage !== page) return false;
  if (page === "follow-up" && !matchesFollowUpQueue(application, document.querySelector("#followUpFilter").value)) return false;
  if (!matchesAge(application, document.querySelector("#agingFilter").value)) return false;
  const selected = document.querySelector("#savedView").value;
  const saved = state.savedViews[selected]?.filters?.preset || selected;
  if (saved === "urgent" && !matchesFollowUpQueue(application, "due")) return false;
  if (saved === "starred" && (!isActiveApplication(application) || !isApplicationStarred(application))) return false;
  if (saved === "stale" && (!isActiveApplication(application) || (daysSince(applicationActivityDate(application)) ?? -1) < 15)) return false;
  if (saved === "declined") {
    if (!isRejectedStatus(application.status) || !application.parsedLastUpdate) return false;
    if (application.parsedLastUpdate < addDays(new Date(), -6) || application.parsedLastUpdate > new Date()) return false;
  }
  return true;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function announce(message) {
  document.querySelector("#workspaceStatus").textContent = message;
}

function persistLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Browser storage write failed for ${key}: ${error.message}`);
    announce("Browser storage is unavailable or full. Changes apply only to this page and will not survive a reload.");
    return false;
  }
}

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Browser storage read failed for ${key}: ${error.message}`);
    announce("Saved browser data could not be read. You can continue using the live sheet.");
    return fallback;
  }
}

function snapshotIdentity(application) {
  const id = normalizedApplicationIdentifier(application.applicationId);
  const identity = id ? `id:${id}` : `row:${applicationKey(application)}`;
  let hash = 2166136261;
  for (const character of identity) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createSnapshot(applications) {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    records: Object.fromEntries(applications.map((application) => [
      snapshotIdentity(application),
      { status: application.status, stage: application.interviewStage, updated: application.rawLastUpdate }
    ]))
  };
}

function validSnapshot(value) {
  return value && value.version === 1 && value.records && typeof value.records === "object"
    && !Array.isArray(value.records) && typeof value.capturedAt === "string"
    && !Number.isNaN(new Date(value.capturedAt).getTime())
    && Object.values(value.records).every((record) => record && typeof record.status === "string"
      && typeof record.stage === "string" && typeof record.updated === "string");
}

function compareSnapshots(previous, applications) {
  if (!validSnapshot(previous)) return [];
  return applications.flatMap((application) => {
    const before = previous.records[snapshotIdentity(application)];
    if (!before) return [{ application, kind: "New application" }];
    if (before.status !== application.status || before.stage !== application.interviewStage) {
      return [{ application, kind: `${before.status} / ${before.stage || "No stage"} → ${application.status} / ${application.interviewStage || "No stage"}` }];
    }
    if (before.updated !== application.rawLastUpdate) return [{ application, kind: "Activity date updated" }];
    return [];
  });
}

function captureChanges() {
  if (state.snapshotInitialized && !state.previousSnapshot && state.lastSnapshot) state.previousSnapshot = state.lastSnapshot;
  if (!state.snapshotInitialized) {
    const previous = readLocal(SNAPSHOT_KEY, null);
    state.previousSnapshot = validSnapshot(previous) ? previous : null;
    try {
      const visit = sessionStorage.getItem(VISIT_KEY);
      if (visit) {
        const parsed = JSON.parse(visit);
        if (parsed === null || validSnapshot(parsed)) state.previousSnapshot = parsed;
        else throw new Error("Invalid visit snapshot");
      } else sessionStorage.setItem(VISIT_KEY, JSON.stringify(state.previousSnapshot));
    } catch (error) {
      console.warn(`Visit comparison storage unavailable: ${error.message}`);
      announce("Visit comparison could not be retained for navigation. Other live features remain available.");
    }
    state.snapshotInitialized = true;
  }
  state.changes = compareSnapshots(state.previousSnapshot, state.applications);
  const snapshot = createSnapshot(state.applications);
  persistLocal(SNAPSHOT_KEY, snapshot);
  if (!state.previousSnapshot) {
    try { sessionStorage.setItem(VISIT_KEY, JSON.stringify(snapshot)); }
    catch (error) { console.warn(`Initial comparison baseline could not be retained: ${error.message}`); announce("Change comparisons will not survive navigation in this browser."); }
  }
  state.lastSnapshot = snapshot;
}

function renderFeedStatus() {
  const container = document.querySelector("#feedStatus");
  container.replaceChildren();
  const time = (date) => date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  [["Applications", state.dataLoadStatus, state.fetchedAt], ["Job postings", state.jobsLoadStatus || "loading", state.jobsFetchedAt]]
    .forEach(([label, status, date]) => {
      const item = node("span", `feed-indicator feed-${status}`, `${label}: ${status === "loaded" ? `fetched at ${time(date)}` : status === "unavailable" ? "unavailable · retry refresh" : "loading"}`);
      container.append(item);
    });
  const latest = state.applications.reduce((result, application) =>
    application.parsedLastUpdate && (!result || application.parsedLastUpdate > result) ? application.parsedLastUpdate : result, null);
  container.append(node("span", "", `Latest sheet activity: ${latest ? formatShortDate(latest) : "not available"} · Schedule estimate: 8 AM / 8 PM, your local time`));
}

function renderPriorityActions() {
  const applications = scopedApplications().filter((application) => matchesFollowUpQueue(application, "due"))
    .sort((first, second) =>
      Number(/action required/i.test(second.status)) - Number(/action required/i.test(first.status))
      || (followUpDueDate(first)?.getTime() || Infinity) - (followUpDueDate(second)?.getTime() || Infinity));
  const container = document.querySelector("#priorityActions");
  container.replaceChildren();
  applications.slice(0, 5).forEach((application) => {
    const item = node("article", "priority-item");
    const button = node("button", "application-title", `${application.company} · ${application.role}`);
    button.type = "button";
    button.addEventListener("click", () => openApplicationDetail(application));
    const detail = node("span", "", `${/action required/i.test(application.status) ? "Action required · " : ""}${displayValue(application.nextAction)}`);
    const due = followUpDueDate(application);
    const copy = node("div");
    copy.append(button, detail, node("small", "", `Due ${due ? formatShortDate(due) : "date unavailable"}`));
    item.append(copy, createFollowUpButton(application));
    container.append(item);
  });
  if (!applications.length) container.append(createFocusEmpty(state.dataLoadStatus === "loaded" ? "You're caught up. No actions are due in this date range." : "Loading your action queue…"));
  document.querySelector("#allActionsLink").textContent = `View all ${applications.length} actions →`;
}

function renderAgingBuckets() {
  const active = scopedApplications().filter(isActiveApplication);
  const container = document.querySelector("#agingBuckets");
  container.replaceChildren();
  [["0-7", "0–7 days", "Recent"], ["8-14", "8–14 days", "Monitor"], ["15-30", "15–30 days", "Review"], ["31+", "31+ days", "Stale"]]
    .forEach(([key, label, hint]) => {
      const link = node("a", "aging-bucket");
      link.href = pageHref("active", { age: key });
      link.append(node("strong", "", active.filter((application) => matchesAge(application, key)).length), node("span", "", label), node("small", "", hint));
      container.append(link);
    });
  const unknown = active.filter((application) => !applicationActivityDate(application)).length;
  if (unknown) container.append(node("p", "data-note", `${unknown} active applications have no activity date and are excluded from these buckets.`));
}

function renderChanges() {
  const changes = state.changes || [];
  document.querySelector("#changesSummary").textContent = !state.previousSnapshot
    ? "First visit on this browser. A comparison baseline has been saved for your next visit."
    : `${changes.length} new or updated applications since ${new Date(state.previousSnapshot.capturedAt).toLocaleString()}.`;
  const container = document.querySelector("#recentChanges");
  container.replaceChildren();
  changes.slice(0, 5).forEach(({ application, kind }) => {
    const button = node("button", "change-item");
    button.type = "button";
    button.append(node("strong", "", `${application.company} · ${application.role}`), node("span", "", kind));
    button.addEventListener("click", () => openApplicationDetail(application));
    container.append(button);
  });
  if (changes.length > 5) {
    const more = node("button", "text-button", `Show all ${changes.length} changes`);
    more.type = "button";
    more.addEventListener("click", () => {
      changes.slice(5).forEach(({ application, kind }) => {
        const button = node("button", "change-item", `${application.company} · ${application.role} — ${kind}`);
        button.type = "button";
        button.addEventListener("click", () => openApplicationDetail(application));
        container.append(button);
      });
      more.remove();
    });
    container.append(more);
  }
  document.querySelector("#acknowledgeChanges").disabled = !state.previousSnapshot || !changes.length;
}

function renderCoverage() {
  const applications = scopedApplications();
  const grid = document.querySelector("#coverageGrid");
  grid.replaceChildren();
  [["Recruiter / contact", (application) => hasMeaningfulValue(application.recruiter)],
    ["Application ID", (application) => Boolean(normalizedApplicationIdentifier(application.applicationId))],
    ["Salary band", (application) => hasMeaningfulValue(application.salaryBand)],
    ["Resume version", (application) => hasMeaningfulValue(application.resumeVersion)],
    ["Sheet follow-up completions", (application) => Boolean(application.parsedLastFollowUpDate)]]
    .forEach(([label, predicate]) => {
      const count = applications.filter(predicate).length;
      const item = node("div", "coverage-item");
      item.append(node("span", "", label), node("strong", "", `${count}/${applications.length}`), node("small", "", `${applications.length ? percentage(count, applications.length) + "% populated" : "No records in this cohort"}`));
      grid.append(item);
    });
  if (state.rawRowCount !== undefined) grid.append(node("p", "data-note", `${state.rawRowCount} nonempty source rows → ${state.applications.length} unique applications after ID merging. Coverage above uses the selected applied-date cohort.`));
}

function renderWorkspaceSignals() {
  renderPriorityActions();
  renderAgingBuckets();
  renderChanges();
  renderCoverage();
  renderFeedStatus();
  document.querySelector("#scopeLabel").textContent = `${scopeDescription()} · Applied-date cohort for KPIs, insights, aging and lists`;
  document.querySelectorAll("[data-drilldown]").forEach((link) => { link.href = pageHref(link.dataset.drilldown); });
  document.querySelector("#allActionsLink").href = pageHref("follow-up");
  document.querySelector("#totalCalendarLink").href = pageHref("all", { calendar: "true" });
  if (state.page === "offer") renderCompensation(scopedApplications().filter((application) => currentStage(application) === "offer"));
}

function pageHref(view, extra = {}) {
  const params = new URLSearchParams({ view, range: document.querySelector("#dateRange").value });
  if (params.get("range") === "custom") {
    params.set("from", document.querySelector("#dateFrom").value);
    params.set("to", document.querySelector("#dateTo").value);
  }
  Object.entries(extra).forEach(([key, value]) => params.set(key, value));
  return `?${params}`;
}

function renderCompactApplications(applications) {
  const container = document.querySelector("#compactApplications");
  container.replaceChildren();
  applications.forEach((application) => {
    const card = node("article", "application-row");
    const star = node("button", "application-star", isApplicationStarred(application) ? "★" : "☆");
    star.type = "button";
    star.setAttribute("aria-label", `${isApplicationStarred(application) ? "Unstar" : "Star"} ${application.company} application. Saved on this device.`);
    star.setAttribute("aria-pressed", String(isApplicationStarred(application)));
    star.addEventListener("click", () => toggleApplicationStar(application));
    const copy = node("div", "application-row-copy");
    const title = node("button", "application-title", application.company);
    title.type = "button";
    title.addEventListener("click", () => openApplicationDetail(application));
    copy.append(title, node("span", "", application.role), node("small", "", `${formatDate(application)} · ${displayValue(application.location)}`));
    const status = node("div", "application-row-status");
    const badge = node("span", "status-pill", application.status);
    badge.dataset.tone = statusTone(application.status);
    const activity = applicationActivityDate(application);
    status.append(badge, node("small", "", `Last activity ${activity ? formatShortDate(activity) : "unknown"}`));
    if (["assessment", "screening", "final"].includes(currentStage(application))) {
      status.append(node("small", "stage-note", displayValue(application.interviewStage)));
    }
    const action = node("div", "application-row-action");
    action.append(node("span", "", displayValue(application.nextAction)));
    const due = followUpDueDate(application);
    action.append(node("small", "", due ? `${followUpCadence(application)} · ${formatShortDate(due)}` : isActiveApplication(application) ? "No follow-up date" : "Closed / offer outcome"));
    const details = node("button", "row-details", "Details →");
    details.type = "button";
    details.addEventListener("click", () => openApplicationDetail(application));
    card.append(star, copy, status, action, details);
    if (state.page === "follow-up" && isActiveApplication(application)) card.append(createFollowUpButton(application));
    container.append(card);
  });
}

function openApplicationDetail(application) {
  document.querySelector("#applicationDetailTitle").textContent = `${application.company} · ${application.role}`;
  const body = document.querySelector("#applicationDetailBody");
  body.replaceChildren();
  const list = node("dl", "application-detail-list");
  const fields = [
    ["Status", application.status], ["Interview stage", application.interviewStage], ["Application ID", application.applicationId],
    ["Applied", formatDate(application)], ["Last activity", formatShortDate(applicationActivityDate(application))],
    ["Next action", application.nextAction], ["Follow-up due", formatShortDate(followUpDueDate(application))],
    ["Follow-up status (sheet)", application.followUpStatus], ["Last follow-up (sheet or this browser)", formatShortDate(effectiveLastFollowUpDate(application))],
    ["Recruiter / contact", application.recruiter], ["Source", application.source], ["Location / work mode", application.location],
    ["Resume version", application.resumeVersion], ["Salary band", application.salaryBand], ["Referral", application.referral],
    ["Notes / evidence", application.notes]
  ];
  if (isRejectedStatus(application.status)) fields.push(["Rejection category", `${rejectionCategory(application)} (${hasMeaningfulValue(application.rejectionStage) ? "recorded" : "inferred"})`]);
  fields.forEach(([label, value]) => { list.append(node("dt", "", label), node("dd", "", hasMeaningfulValue(value) ? value : "Not provided")); });
  body.append(list);
  const url = validExternalUrl(application.latestEmailLink);
  if (url) {
    const link = node("a", "primary-button", "Open latest email ↗");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    body.append(link);
  }
  if (isActiveApplication(application)) body.append(createFollowUpButton(application));
  body.append(node("p", "data-note", "Stars and follow-up completions are saved on this device only. Stage and rejection inference does not establish a scheduled meeting or historical sequence."));
  const dialog = document.querySelector("#applicationDetail");
  if (!dialog.open) dialog.showModal();
  state.detailApplication = application;
}

function updatePresentation() {
  const mode = state.presentation || "compact";
  document.querySelector("#compactApplications").hidden = mode === "dataset";
  document.querySelector(".table-wrap").hidden = mode !== "dataset" || !state.applications.length;
  document.querySelector("#applicationCalendar").hidden = mode !== "calendar";
  ["compact", "dataset", "calendar"].forEach((name) => {
    document.querySelector(`#${name}View`).setAttribute("aria-pressed", String(mode === name));
  });
}

function renderCalendar() {
  if (!state.calendarMonth) return;
  const month = state.calendarMonth;
  const grid = document.querySelector("#calendarGrid");
  grid.replaceChildren();
  document.querySelector("#calendarTitle").textContent = month.toLocaleDateString([], { month: "long", year: "numeric" });
  const counts = countBy((state.calendarCandidates || []).filter((application) => application.parsedDate), (application) => localDateKey(application.parsedDate));
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let index = 0; index < firstDay.getDay(); index++) grid.append(node("span", "calendar-blank"));
  for (let day = 1; day <= end; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const key = localDateKey(date);
    const count = counts[key] || 0;
    const button = node("button", `calendar-day${count ? " has-applications" : ""}`);
    button.type = "button";
    button.setAttribute("aria-pressed", String(key === state.selectedDay));
    button.setAttribute("aria-label", `${date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}: ${count} applications`);
    if (isSameLocalDate(date, new Date())) button.setAttribute("aria-current", "date");
    button.append(node("span", "", day), node("strong", "", count || "—"));
    button.addEventListener("click", () => {
      state.selectedDay = key;
      resetPageAndFilter();
    });
    grid.append(button);
  }
  document.querySelector("#calendarSelection").textContent = state.selectedDay ? `Applications applied on ${state.selectedDay}: ${state.filteredApplications.length}` : "Select a day to filter the list below.";
}

function filterValues() {
  return {
    range: document.querySelector("#dateRange").value, from: document.querySelector("#dateFrom").value,
    to: document.querySelector("#dateTo").value, search: elements.searchInput.value,
    company: elements.companyFilter.value, status: elements.statusFilter.value, role: elements.roleFilter.value,
    starred: elements.starredFilter.getAttribute("aria-pressed") === "true",
    age: document.querySelector("#agingFilter").value, queue: document.querySelector("#followUpFilter").value,
    columns: [...state.columnFilters].map(([key, values]) => [key, [...values]]),
    presentation: state.presentation, day: state.selectedDay || "", month: localDateKey(state.calendarMonth),
    preset: ["urgent", "starred", "stale", "declined"].includes(document.querySelector("#savedView").value)
      ? document.querySelector("#savedView").value : state.savedViews[document.querySelector("#savedView").value]?.filters?.preset || ""
  };
}

function applySavedFilters(values) {
  const assignments = {
    dateRange: values.range, dateFrom: values.from, dateTo: values.to, searchInput: values.search,
    companyFilter: values.company, statusFilter: values.status, roleFilter: values.role,
    agingFilter: values.age, followUpFilter: values.queue
  };
  Object.entries(assignments).forEach(([id, value]) => { document.querySelector(`#${id}`).value = value || ""; });
  elements.starredFilter.setAttribute("aria-pressed", String(Boolean(values.starred)));
  state.columnFilters = new Map((values.columns || []).map(([key, selected]) => [key, new Set(selected)]));
  state.presentation = values.presentation === "calendar" && state.page !== "all" ? "compact" : values.presentation || "compact";
  state.selectedDay = state.presentation === "calendar" ? values.day || null : null;
  state.calendarMonth = parseDate(values.month) || startOfDay(new Date());
  updateColumnFilterButtons();
  updateDateScope();
  if (state.presentation === "calendar") {
    state.selectedDay = values.day || null;
    resetPageAndFilter();
  }
}

function renderSavedViews() {
  const select = document.querySelector("#savedView");
  select.querySelectorAll("[data-custom-view]").forEach((option) => option.remove());
  Object.entries(state.savedViews).forEach(([id, view]) => {
    if (!view || typeof view.name !== "string" || !view.filters) return;
    const option = node("option", "", view.name);
    option.value = id;
    option.dataset.customView = "true";
    select.append(option);
  });
}

function validSavedView(view) {
  const values = view?.filters;
  return view && typeof view.name === "string" && values
    && ["all", "7", "30", "90", "custom"].includes(values.range)
    && ["compact", "dataset", "calendar"].includes(values.presentation)
    && ["from", "to", "search", "company", "status", "role", "age", "queue", "month"].every((key) => typeof values[key] === "string")
    && typeof values.starred === "boolean"
    && Array.isArray(values.columns)
    && values.columns.every((entry) => Array.isArray(entry) && entry.length === 2
      && typeof entry[0] === "string" && Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string"));
}

function updateDateScope() {
  const range = document.querySelector("#dateRange").value;
  ["#dateFromLabel", "#dateToLabel"].forEach((id) => { document.querySelector(id).hidden = range !== "custom"; });
  const from = document.querySelector("#dateFrom").value;
  const to = document.querySelector("#dateTo").value;
  if (range === "custom" && from && to && from > to) {
    document.querySelector("#dateTo").setCustomValidity("End date must be on or after start date.");
    document.querySelector("#dateTo").reportValidity();
    announce("Choose an end date on or after the start date.");
    return;
  }
  document.querySelector("#dateTo").setCustomValidity("");
  state.selectedDay = null;
  const params = new URLSearchParams(location.search);
  params.set("range", range);
  params.delete("from");
  params.delete("to");
  if (range === "custom") { params.set("from", from); params.set("to", to); }
  history.replaceState(null, "", `${location.pathname}?${params}`);
  if (state.dataLoadStatus === "loaded") {
    renderMetrics();
    renderCharts();
    renderApplicationInsights();
    renderDailyFocus();
    renderWorkspaceSignals();
    resetPageAndFilter();
  }
}

function initializeWorkspace() {
  const params = new URLSearchParams(location.search);
  state.page = Object.hasOwn(PAGE_VIEWS, params.get("view")) ? params.get("view") : "overview";
  state.calendarMonth = startOfDay(new Date());
  state.presentation = params.get("calendar") === "true" && state.page === "all" ? "calendar" : "compact";
  state.jobsLoadStatus = "loading";
  state.savedViews = readLocal(SAVED_VIEWS_KEY, {});
  if (!state.savedViews || typeof state.savedViews !== "object" || Array.isArray(state.savedViews)) {
    announce("Saved view data is invalid. New views can be saved in this browser.");
    state.savedViews = {};
  }
  Object.entries(state.savedViews).forEach(([id, view]) => {
    if (validSavedView(view)) return;
    delete state.savedViews[id];
    announce("An invalid saved view was ignored. You can save a new view from the current filters.");
  });
  document.body.dataset.page = state.page;
  const range = params.get("range");
  document.querySelector("#dateRange").value = ["all", "7", "30", "90", "custom"].includes(range) ? range : "all";
  ["from", "to"].forEach((key) => {
    const value = params.get(key);
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && parseDate(value)) document.querySelector(key === "from" ? "#dateFrom" : "#dateTo").value = value;
  });
  if (["0-7", "8-14", "15-30", "31+"].includes(params.get("age"))) document.querySelector("#agingFilter").value = params.get("age");
  renderSavedViews();
  updateDateScope();
  ["#dateRange", "#dateFrom", "#dateTo"].forEach((id) => { document.querySelector(id).addEventListener("change", updateDateScope); });
  ["#agingFilter", "#followUpFilter"].forEach((id) => { document.querySelector(id).addEventListener("change", resetPageAndFilter); });
  ["compact", "dataset", "calendar"].forEach((mode) => {
    document.querySelector(`#${mode}View`).addEventListener("click", () => {
      state.presentation = mode;
      if (mode !== "calendar") state.selectedDay = null;
      resetPageAndFilter();
    });
  });
  [["previousMonth", -1], ["nextMonth", 1], ["calendarToday", 0]].forEach(([id, delta]) => {
    document.querySelector(`#${id}`).addEventListener("click", () => {
      const month = state.calendarMonth;
      state.calendarMonth = delta ? new Date(month.getFullYear(), month.getMonth() + delta, 1) : startOfDay(new Date());
      state.selectedDay = null;
      resetPageAndFilter();
    });
  });
  document.querySelector("#clearCalendarDay").addEventListener("click", () => { state.selectedDay = null; resetPageAndFilter(); });
  document.querySelector("#closeApplicationDetail").addEventListener("click", () => document.querySelector("#applicationDetail").close());
  document.querySelector("#applicationDetail").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelector("#acknowledgeChanges").addEventListener("click", () => {
    state.previousSnapshot = createSnapshot(state.applications);
    persistLocal(SNAPSHOT_KEY, state.previousSnapshot);
    try { sessionStorage.setItem(VISIT_KEY, JSON.stringify(state.previousSnapshot)); }
    catch (error) { console.warn(error); announce("Reviewed for this page; visit storage is unavailable."); }
    state.changes = [];
    renderChanges();
  });
  document.querySelector("#refreshData").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    state.dataLoadStatus = "loading";
    state.jobsLoadStatus = "loading";
    renderFeedStatus();
    announce("Refreshing both feeds…");
    await Promise.all([loadDashboardData(), loadJobPostings()]);
    button.disabled = false;
    announce(state.dataLoadStatus === "loaded" && state.jobsLoadStatus === "loaded" ? "Both feeds refreshed successfully." : "Some data could not be refreshed. Check feed status above; previous data may still be shown.");
  });
  document.querySelector("#savedView").addEventListener("change", (event) => {
    const custom = state.savedViews[event.target.value];
    document.querySelector("#deleteView").hidden = !custom;
    if (custom) applySavedFilters(custom.filters);
    else {
      elements.searchInput.value = "";
      elements.companyFilter.value = "";
      elements.statusFilter.value = "";
      elements.roleFilter.value = "";
      elements.starredFilter.setAttribute("aria-pressed", "false");
      document.querySelector("#agingFilter").value = "";
      state.columnFilters.clear();
      state.selectedDay = null;
      updateColumnFilterButtons();
      resetPageAndFilter();
    }
  });
  document.querySelector("#saveView").addEventListener("click", () => document.querySelector("#saveViewDialog").showModal());
  document.querySelector("#cancelSaveView").addEventListener("click", () => document.querySelector("#saveViewDialog").close());
  document.querySelector("#saveViewForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.querySelector("#savedViewName").value.trim();
    if (!name) { document.querySelector("#savedViewName").setCustomValidity("Enter a view name."); document.querySelector("#savedViewName").reportValidity(); return; }
    const id = `saved-${Date.now()}`;
    state.savedViews[id] = { name, filters: filterValues() };
    const saved = persistLocal(SAVED_VIEWS_KEY, state.savedViews);
    renderSavedViews();
    document.querySelector("#savedView").value = id;
    document.querySelector("#deleteView").hidden = false;
    document.querySelector("#saveViewDialog").close();
    announce(saved ? `“${name}” saved on this device.` : "View created for this page only; browser storage is unavailable.");
  });
  document.querySelector("#savedViewName").addEventListener("input", (event) => event.target.setCustomValidity(""));
  document.querySelector("#deleteView").addEventListener("click", () => {
    delete state.savedViews[document.querySelector("#savedView").value];
    persistLocal(SAVED_VIEWS_KEY, state.savedViews);
    renderSavedViews();
    document.querySelector("#savedView").value = "";
    document.querySelector("#deleteView").hidden = true;
    resetPageAndFilter();
  });
  document.querySelector("#resetFilters").addEventListener("click", () => {
    document.querySelector("#savedView").value = "";
    document.querySelector("#savedView").dispatchEvent(new Event("change"));
    document.querySelector("#followUpFilter").value = "due";
    state.drilldown = null;
    renderDrilldownState();
    resetPageAndFilter();
    announce("List filters reset. The applied-date range is unchanged.");
  });
  renderFeedStatus();
}

function configureWorkspacePage() {
  if (state.page === "overview") return;
  const page = PAGE_VIEWS[state.page];
  document.title = `${page.title} · Application Tracker`;
  document.querySelector("#pageTitle").textContent = page.title;
  document.querySelector("#pageDescription").textContent = page.description;
  document.querySelector("#pageEyebrow").textContent = "Application workspace";
  const breadcrumb = document.querySelector("#pageBreadcrumb");
  breadcrumb.hidden = false;
  breadcrumb.textContent = ` / ${page.title}`;
  document.querySelector("#applicationsHeading").textContent = page.title;
  document.querySelector("#stageDefinition").textContent = `${page.description} KPI counts use only the applied-date range; list filters further narrow the records below.`;
  document.querySelector("#toggleApplications").click();
  document.querySelector("#toggleApplications").hidden = true;
  document.querySelector("#calendarView").hidden = state.page !== "all";
  document.querySelector("#followUpFilterLabel").hidden = state.page !== "follow-up";
  if (state.page === "follow-up") {
    document.querySelector(".daily-focus-section").hidden = false;
    document.querySelector("#toggleDailyFocus").click();
    document.querySelector("#dailyFocusSummary").textContent = "Showing up to five items per lane. Use the queue below to review all.";
    document.querySelector("#toggleDailyFocus").hidden = true;
    const toolbar = node("div", "queue-shortcuts");
    [["overdue", "Review overdue"], ["today", "Review due today"], ["upcoming", "Review upcoming"], ["action", "Action required"]].forEach(([queue, label]) => {
      const button = node("button", "text-button", label);
      button.type = "button";
      button.addEventListener("click", () => { document.querySelector("#followUpFilter").value = queue; resetPageAndFilter(); scrollToApplications(); });
      toolbar.append(button);
    });
    document.querySelector("#dailyFocusContent").append(toolbar);
  }
  if (state.page === "offer") {
    const compensation = document.querySelector("#offerCompensation");
    compensation.hidden = false;
    document.querySelector("#applicationsContent").prepend(compensation);
  }
}
