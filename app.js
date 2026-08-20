const COLUMN_ALIASES = {
  company: ["Company", "Company Name", "Employer"],
  role: ["Role / Title", "Role", "Job Title", "Position", "Title"],
  applicationId: ["Application ID", "Job ID", "Requisition ID"],
  status: ["Current Status", "Status", "Application Status"],
  date: ["Application Date", "Date Applied", "Applied Date", "Date"],
  lastUpdate: ["Last Status Update", "Status Updated", "Last Updated"],
  recruiter: ["Recruiter / POC (Name & Email)", "Recruiter/Point of Contact", "Recruiter / Point of Contact", "Recruiter", "Point of Contact"],
  resumeVersion: ["Resume Version", "Resume", "Resume Used"],
  interviewStage: ["Interview Stage", "Pipeline Stage", "Stage"],
  salaryBand: ["Salary Band", "Compensation", "Salary Range"],
  referral: ["Referral", "Referred", "Referral Source"],
  location: ["Location / Work Mode", "Location", "Work Mode"],
  source: ["Portal / Source", "Source", "Portal"],
  nextAction: ["Action Required / Next Steps", "Next Steps", "Next Action"],
  notes: ["Notes / Verification Evidence", "Notes", "Verification Evidence"]
};

const DATA_SOURCE = {
  label: "Live sheet",
  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2WFqLSxLSHAZm4yS3UaPfGVFdYuyJJoB3Xra0leap4-mOcWG8_GQ-IUihR_OgbzAfi4YYdkAaMl4_/pub?gid=1438332888&single=true&output=csv"
};

const PAGE_SIZE = 10;

const state = {
  applications: [],
  statusChart: null,
  timelineChart: null,
  referralChart: null,
  drilldown: null,
  currentPage: 1,
  filteredApplications: []
};

const elements = {
  body: document.querySelector("#applicationsBody"),
  emptyState: document.querySelector("#emptyState"),
  emptyStateText: document.querySelector("#emptyStateText"),
  loadMessage: document.querySelector("#loadMessage"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  roleFilter: document.querySelector("#roleFilter"),
  drilldownBar: document.querySelector("#drilldownBar"),
  drilldownLabel: document.querySelector("#drilldownLabel"),
  clearDrilldown: document.querySelector("#clearDrilldown"),
  resultSummary: document.querySelector("#resultSummary"),
  syncLabel: document.querySelector("#syncLabel"),
  totalMetric: document.querySelector("#totalMetric"),
  monthMetric: document.querySelector("#monthMetric"),
  activeMetric: document.querySelector("#activeMetric"),
  interviewMetric: document.querySelector("#interviewMetric"),
  offerMetric: document.querySelector("#offerMetric")
};

function valueFor(row, aliases) {
  const key = aliases.find((alias) => Object.hasOwn(row, alias));
  return key ? String(row[key] ?? "").trim() : "";
}

function rowsFromCsvMatrix(matrix) {
  const headerIndex = matrix.findIndex((row) => {
    const cells = row.map((cell) => String(cell ?? "").trim());
    return COLUMN_ALIASES.company.some((alias) => cells.includes(alias))
      && COLUMN_ALIASES.status.some((alias) => cells.includes(alias));
  });

  if (headerIndex === -1) return null;

  const headers = matrix[headerIndex].map((header) => String(header ?? "").trim());
  return matrix.slice(headerIndex + 1).map((values) => Object.fromEntries(
    headers
      .map((header, index) => [header, values[index] ?? ""])
      .filter(([header]) => header)
  ));
}

function parseDate(value) {
  if (!value) return null;

  const isoParts = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoParts) {
    return new Date(Number(isoParts[1]), Number(isoParts[2]) - 1, Number(isoParts[3]));
  }

  const directDate = new Date(value);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const parts = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!parts) return null;

  const year = parts[3].length === 2 ? Number(`20${parts[3]}`) : Number(parts[3]);
  const parsedDate = new Date(year, Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeRows(rows) {
  return rows
    .map((row) => {
      const company = valueFor(row, COLUMN_ALIASES.company);
      const role = valueFor(row, COLUMN_ALIASES.role);
      const status = valueFor(row, COLUMN_ALIASES.status) || "Unknown";
      const rawDate = valueFor(row, COLUMN_ALIASES.date);
      const rawLastUpdate = valueFor(row, COLUMN_ALIASES.lastUpdate);

      return {
        company: company || "Unknown company",
        role: role || "Untitled role",
        applicationId: valueFor(row, COLUMN_ALIASES.applicationId),
        status,
        rawDate,
        parsedDate: parseDate(rawDate),
        rawLastUpdate,
        parsedLastUpdate: parseDate(rawLastUpdate),
        recruiter: valueFor(row, COLUMN_ALIASES.recruiter),
        resumeVersion: valueFor(row, COLUMN_ALIASES.resumeVersion),
        interviewStage: valueFor(row, COLUMN_ALIASES.interviewStage),
        salaryBand: valueFor(row, COLUMN_ALIASES.salaryBand),
        referral: valueFor(row, COLUMN_ALIASES.referral),
        location: valueFor(row, COLUMN_ALIASES.location),
        source: valueFor(row, COLUMN_ALIASES.source),
        nextAction: valueFor(row, COLUMN_ALIASES.nextAction),
        notes: valueFor(row, COLUMN_ALIASES.notes)
      };
    })
    .filter((application) => application.company !== "Unknown company" || application.role !== "Untitled role")
    .sort((first, second) => (second.parsedDate?.getTime() || 0) - (first.parsedDate?.getTime() || 0));
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function statusTone(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes("interview") || normalized.includes("screen")) return "interview";
  if (normalized.includes("offer") || normalized.includes("accepted")) return "offer";
  if (["reject", "declin", "withdraw", "closed", "not selected"].some((term) => normalized.includes(term))) return "closed";
  return "active";
}

function isClosedStatus(status) {
  return ["reject", "declin", "withdraw", "closed", "not selected"]
    .some((term) => status.toLowerCase().includes(term));
}

function isInterviewStatus(status) {
  const normalized = status.toLowerCase();
  return normalized.includes("interview") || normalized.includes("screen");
}

function isOfferStatus(status) {
  const normalized = status.toLowerCase();
  return normalized.includes("offer") || normalized.includes("accepted");
}

function isInterviewReached(application) {
  const stage = application.interviewStage.toLowerCase();
  return isInterviewStatus(application.status)
    || isOfferStatus(application.status)
    || ["screen", "assessment", "technical", "system design", "onsite", "interview", "offer"]
      .some((term) => stage.includes(term));
}

function hasReferral(value) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized)
    && !["none", "no", "n/a", "na", "false", "not referred", "not provided"].includes(normalized);
}

function hasMeaningfulValue(value) {
  return Boolean(value)
    && !["n/a", "na", "none", "unknown", "not provided", "tbd"]
      .includes(value.trim().toLowerCase());
}

function formatDate(application) {
  if (!application.parsedDate) return application.rawDate || "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(application.parsedDate);
}

function createCell(text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function createStackedCell(primary, secondary, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;

  const primaryText = document.createElement("span");
  primaryText.className = "cell-primary";
  primaryText.textContent = primary || "Not provided";
  cell.append(primaryText);

  if (secondary) {
    const secondaryText = document.createElement("span");
    secondaryText.className = "cell-secondary";
    secondaryText.textContent = secondary;
    secondaryText.title = secondary;
    cell.append(secondaryText);
  }

  return cell;
}

function displayValue(value) {
  return value || "Not provided";
}

function renderTable() {
  const applications = state.filteredApplications;
  const totalPages = Math.max(1, Math.ceil(applications.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const startIndex = (state.currentPage - 1) * PAGE_SIZE;
  const pageApplications = applications.slice(startIndex, startIndex + PAGE_SIZE);

  elements.body.replaceChildren();
  const fragment = document.createDocumentFragment();

  pageApplications.forEach((application) => {
    const row = document.createElement("tr");
    row.append(createCell(application.company, "company-cell"));
    row.append(createCell(application.role));
    row.append(createCell(displayValue(application.applicationId)));

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = "status-pill";
    status.dataset.tone = statusTone(application.status);
    status.textContent = application.status;
    status.title = application.status;
    statusCell.append(status);
    if (application.rawLastUpdate) {
      const statusUpdate = document.createElement("span");
      statusUpdate.className = "cell-secondary";
      statusUpdate.textContent = `Updated ${formatDate({
        parsedDate: application.parsedLastUpdate,
        rawDate: application.rawLastUpdate
      })}`;
      statusCell.append(statusUpdate);
    }
    row.append(statusCell);
    row.append(createCell(formatDate(application), "date-cell"));
    row.append(createCell(application.rawLastUpdate
      ? formatDate({ parsedDate: application.parsedLastUpdate, rawDate: application.rawLastUpdate })
      : "Not provided", "date-cell"));
    row.append(createCell(displayValue(application.recruiter), "recruiter-cell"));
    row.append(createCell(displayValue(application.resumeVersion)));
    row.append(createCell(displayValue(application.interviewStage)));
    row.append(createCell(displayValue(application.salaryBand)));
    row.append(createCell(displayValue(application.referral)));
    row.append(createCell(displayValue(application.location), "location-cell"));
    row.append(createCell(displayValue(application.source)));
    row.append(createCell(displayValue(application.nextAction), "action-cell"));
    row.append(createCell(displayValue(application.notes), "notes-cell"));
    fragment.append(row);
  });

  elements.body.append(fragment);
  elements.emptyState.hidden = applications.length > 0;
  document.querySelector(".table-wrap").hidden = applications.length === 0;
  const pagination = document.querySelector("#pagination");
  pagination.hidden = applications.length === 0;
  document.querySelector("#pageSummary").textContent = applications.length
    ? `Showing ${startIndex + 1}-${Math.min(startIndex + PAGE_SIZE, applications.length)} of ${applications.length}`
    : "Showing 0 applications";
  document.querySelector("#pageIndicator").textContent = `Page ${state.currentPage} of ${totalPages}`;
  document.querySelector("#previousPage").disabled = state.currentPage === 1;
  document.querySelector("#nextPage").disabled = state.currentPage === totalPages;
  elements.resultSummary.textContent = `${applications.length} of ${state.applications.length} applications shown`;
}

function metricCount(predicate) {
  return state.applications.filter((application) => predicate(application.status.toLowerCase())).length;
}

function renderMetrics() {
  const now = new Date();
  const currentMonthCount = state.applications.filter((application) =>
    application.parsedDate
    && application.parsedDate.getMonth() === now.getMonth()
    && application.parsedDate.getFullYear() === now.getFullYear()
  ).length;

  elements.totalMetric.textContent = state.applications.length;
  elements.monthMetric.textContent = `${currentMonthCount} this month`;
  elements.activeMetric.textContent = metricCount((status) => !isClosedStatus(status) && !isOfferStatus(status));
  elements.interviewMetric.textContent = state.applications.filter(isInterviewReached).length;
  elements.offerMetric.textContent = metricCount(isOfferStatus);
}

function chartTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderStageFunnel() {
  const stageDefinitions = [
    { label: "Applied", terms: ["application submitted", "applied", "submitted"] },
    { label: "Recruiter screen", terms: ["initial screening", "recruiter screen", "phone screen"] },
    { label: "Technical assessment", terms: ["technical assessment", "coding assessment", "assessment"] },
    { label: "System design", terms: ["system design"] },
    { label: "Onsite / final", terms: ["onsite", "final interview", "panel"] },
    { label: "Offer", terms: ["offer"] }
  ];
  const counts = stageDefinitions.map(({ terms }) => state.applications.filter((application) => {
    const stage = application.interviewStage.toLowerCase();
    return terms.some((term) => stage.includes(term));
  }).length);
  const maxCount = Math.max(...counts, 1);
  const funnel = document.querySelector("#stageFunnel");
  funnel.replaceChildren();

  stageDefinitions.forEach(({ label }, index) => {
    const row = document.createElement("div");
    row.className = "funnel-row";
    const heading = document.createElement("div");
    heading.className = "funnel-label";
    heading.innerHTML = `<span>${label}</span><strong>${counts[index]}</strong>`;
    const track = document.createElement("div");
    track.className = "funnel-track";
    const bar = document.createElement("span");
    bar.style.width = counts[index] ? `${Math.max((counts[index] / maxCount) * 100, 4)}%` : "0";
    track.append(bar);
    row.append(heading, track);
    funnel.append(row);
  });

  const terminalCounts = state.applications.filter((application) => {
    const stage = application.interviewStage.toLowerCase();
    return stage.includes("closed") || stage.includes("declined");
  }).length;
  const terminal = document.createElement("p");
  terminal.className = "funnel-terminal";
  terminal.textContent = `${terminalCounts} terminal outcome${terminalCounts === 1 ? "" : "s"} reported separately (closed or declined).`;
  funnel.append(terminal);
}

function renderReferralAnalytics() {
  const referred = state.applications.filter((application) => hasReferral(application.referral));
  const direct = state.applications.filter((application) => !hasReferral(application.referral));
  const referredRate = referred.length
    ? (referred.filter(isInterviewReached).length / referred.length) * 100
    : 0;
  const directRate = direct.length
    ? (direct.filter(isInterviewReached).length / direct.length) * 100
    : 0;

  document.querySelector("#referredCount").textContent = referred.length;
  document.querySelector("#directCount").textContent = direct.length;
  document.querySelector("#referralLift").textContent = referred.length && direct.length
    ? `${referredRate - directRate >= 0 ? "+" : ""}${Math.round(referredRate - directRate)} pp`
    : "N/A";
  document.querySelector("#referralNote").textContent = referred.length
    ? "Interview progress includes screening, assessment, interview, onsite, and offer stages."
    : "No referred applications are recorded yet, so referral lift cannot be compared.";

  state.referralChart?.destroy();
  state.referralChart = new Chart(document.querySelector("#referralChart"), {
    type: "bar",
    data: {
      labels: ["With referral", "Without referral"],
      datasets: [{
        label: "Interview rate",
        data: [referredRate, directRate],
        backgroundColor: ["#d7972a", "#33758d"],
        borderRadius: 4,
        barThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: chartTextColor(), callback: (value) => `${value}%` },
          grid: { color: "#e7ece8" }
        },
        x: { ticks: { color: chartTextColor() }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `${context.raw.toFixed(1)}% reached interview` } }
      }
    }
  });
}

function renderCompensation() {
  const applications = state.applications.filter((application) =>
    !isClosedStatus(application.status) && hasMeaningfulValue(application.salaryBand)
  );
  const body = document.querySelector("#compensationBody");
  const table = document.querySelector(".compensation-table");
  const empty = document.querySelector("#compensationEmpty");
  body.replaceChildren();

  applications.forEach((application) => {
    const row = document.createElement("tr");
    row.append(
      createCell(application.company),
      createCell(application.role),
      createCell(application.salaryBand),
      createCell(application.status)
    );
    body.append(row);
  });

  table.hidden = applications.length === 0;
  empty.hidden = applications.length > 0;
  document.querySelector("#compensationSummary").textContent = applications.length
    ? `${applications.length} active role${applications.length === 1 ? "" : "s"} with salary data`
    : "No salary data for active roles";
}

function renderCharts() {
  const statuses = Object.entries(countBy(state.applications, (application) => application.status))
    .sort((first, second) => second[1] - first[1]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const timelineDates = Array.from({ length: 30 }, (_value, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    return date;
  });
  const dateCounts = countBy(
    state.applications.filter((application) => application.parsedDate),
    (application) => localDateKey(application.parsedDate)
  );

  state.statusChart?.destroy();
  state.timelineChart?.destroy();

  state.statusChart = new Chart(document.querySelector("#statusChart"), {
    type: "doughnut",
    data: {
      labels: statuses.map(([status]) => status),
      datasets: [{
        data: statuses.map(([, count]) => count),
        backgroundColor: ["#184f3a", "#d7972a", "#33758d", "#c95d4b", "#83958b", "#7d6049", "#5d7a68"],
        borderColor: "#ffffff",
        borderWidth: 3,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
      onClick: (_event, activeElements) => {
        if (!activeElements.length) return;
        const status = statuses[activeElements[0].index][0];
        setDrilldown({
          key: `status:${status}`,
          label: `Status: ${status}`,
          predicate: (application) => application.status === status
        });
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, color: chartTextColor(), padding: 16, usePointStyle: true }
        }
      }
    }
  });

  state.timelineChart = new Chart(document.querySelector("#timelineChart"), {
    type: "line",
    data: {
      labels: timelineDates.map((date) => new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
      }).format(date)),
      datasets: [{
        label: "Applications",
        data: timelineDates.map((date) => dateCounts[localDateKey(date)] || 0),
        borderColor: "#33758d",
        backgroundColor: "rgba(51, 117, 141, 0.15)",
        fill: true,
        pointBackgroundColor: "#184f3a",
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: chartTextColor(), precision: 0, stepSize: 1 },
          grid: { color: "#e7ece8" }
        },
        x: { ticks: { color: chartTextColor(), maxTicksLimit: 8 }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  renderStageFunnel();
  renderReferralAnalytics();
  renderCompensation();
}

function populateStatusFilter() {
  const statuses = [...new Set(state.applications.map((application) => application.status))]
    .sort((first, second) => first.localeCompare(second));

  statuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    elements.statusFilter.append(option);
  });
}

function populateRoleFilter() {
  const concentrationGroup = document.createElement("optgroup");
  concentrationGroup.label = "Role concentrations";
  [
    ["__ai__", "AI / Agentic AI / Machine Learning"],
    ["__backend__", "Backend / Platform / Cloud"],
    ["__fullstack__", "Full-stack engineering"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    concentrationGroup.append(option);
  });

  const exactRoleGroup = document.createElement("optgroup");
  exactRoleGroup.label = "Exact roles";
  [...new Set(state.applications.map((application) => application.role))]
    .sort((first, second) => first.localeCompare(second))
    .forEach((role) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      exactRoleGroup.append(option);
    });

  elements.roleFilter.append(concentrationGroup, exactRoleGroup);
}

function matchesRoleFilter(application, selectedRole) {
  if (!selectedRole) return true;

  const role = application.role.toLowerCase();
  const concentrations = {
    __ai__: ["ai", "machine learning", "ml", "agentic", "applied scientist"],
    __backend__: ["backend", "platform", "cloud", "storage", "core", "infrastructure", "distributed"],
    __fullstack__: ["full stack", "full-stack", "frontend", "front end"]
  };

  if (concentrations[selectedRole]) {
    return concentrations[selectedRole].some((term) => role.includes(term));
  }
  return application.role === selectedRole;
}

function scrollToApplications() {
  document.querySelector("#applicationsHeading").scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
  });
}

function renderDrilldownState() {
  elements.drilldownBar.hidden = !state.drilldown;
  elements.drilldownLabel.textContent = state.drilldown?.label || "All applications";

  document.querySelectorAll("[data-drilldown]").forEach((card) => {
    const isActive = card.dataset.drilldown === state.drilldown?.key;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-pressed", String(isActive));
  });
}

function setDrilldown(drilldown, { resetControls = true, scroll = true } = {}) {
  state.drilldown = drilldown;
  state.currentPage = 1;
  if (resetControls) {
    elements.searchInput.value = "";
    elements.statusFilter.value = "";
    elements.roleFilter.value = "";
  }
  renderDrilldownState();
  applyFilters();
  if (scroll) scrollToApplications();
}

function metricDrilldown(key) {
  const drilldowns = {
    active: {
      key: "active",
      label: "Active pipeline",
      predicate: (application) => !isClosedStatus(application.status) && !isOfferStatus(application.status)
    },
    interview: {
      key: "interview",
      label: "Interview-stage applications",
      predicate: isInterviewReached
    },
    offer: {
      key: "offer",
      label: "Offers",
      predicate: (application) => isOfferStatus(application.status)
    }
  };

  return drilldowns[key] || null;
}

function openKpiDrilldown(key) {
  const drilldown = key === "all" ? null : metricDrilldown(key);
  const applications = drilldown
    ? state.applications.filter(drilldown.predicate)
    : state.applications;
  const titles = {
    all: "Total applications",
    active: "Active pipeline",
    interview: "Interview-stage applications",
    offer: "Offers"
  };
  const body = document.querySelector("#kpiDrilldownBody");
  body.replaceChildren();

  applications.forEach((application) => {
    const row = document.createElement("tr");
    row.append(
      createCell(application.company, "company-cell"),
      createCell(application.role),
      createCell(application.status),
      createCell(displayValue(application.interviewStage)),
      createCell(formatDate(application), "date-cell")
    );
    body.append(row);
  });

  document.querySelector("#kpiDialogTitle").textContent = titles[key] || "Applications";
  document.querySelector("#kpiDialogSummary").textContent = `${applications.length} application${applications.length === 1 ? "" : "s"}`;
  document.querySelector("#kpiDialogTableWrap").hidden = applications.length === 0;
  document.querySelector("#kpiDialogEmpty").hidden = applications.length > 0;
  document.querySelector("#kpiDrilldownDialog").showModal();
}

function applyFilters() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const selectedStatus = elements.statusFilter.value;
  const selectedRole = elements.roleFilter.value;
  const filtered = state.applications.filter((application) => {
    const searchableText = [
      application.company,
      application.role,
      application.applicationId,
      application.status,
      application.recruiter,
      application.resumeVersion,
      application.interviewStage,
      application.salaryBand,
      application.referral,
      application.location,
      application.source,
      application.nextAction,
      application.notes
    ].join(" ").toLowerCase();
    const matchesQuery = !query || searchableText.includes(query);
    const matchesStatus = !selectedStatus || application.status === selectedStatus;
    const matchesRole = matchesRoleFilter(application, selectedRole);
    const matchesDrilldown = !state.drilldown || state.drilldown.predicate(application);
    return matchesQuery && matchesStatus && matchesRole && matchesDrilldown;
  });

  elements.emptyStateText.textContent = state.applications.length
    ? "Try changing your search or filters."
    : "Your synced applications will appear here.";
  state.filteredApplications = filtered;
  renderTable();
}

function initializeDashboard(rows, sourceLabel) {
  state.applications = normalizeRows(rows);
  populateStatusFilter();
  populateRoleFilter();
  renderMetrics();
  renderCharts();
  applyFilters();

  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
  elements.syncLabel.textContent = `${sourceLabel} loaded ${today}`;
}

function showLoadError(message) {
  elements.loadMessage.hidden = false;
  elements.loadMessage.textContent = message;
  elements.syncLabel.textContent = "Data unavailable";
  elements.resultSummary.textContent = "Unable to load applications";
  elements.emptyState.hidden = false;
  document.querySelector(".table-wrap").hidden = true;
}

function resetPageAndFilter() {
  state.currentPage = 1;
  applyFilters();
}

elements.searchInput.addEventListener("input", resetPageAndFilter);
elements.statusFilter.addEventListener("change", resetPageAndFilter);
elements.roleFilter.addEventListener("change", resetPageAndFilter);
document.querySelector("#previousPage").addEventListener("click", () => {
  if (state.currentPage === 1) return;
  state.currentPage -= 1;
  renderTable();
});
document.querySelector("#nextPage").addEventListener("click", () => {
  if (state.currentPage * PAGE_SIZE >= state.filteredApplications.length) return;
  state.currentPage += 1;
  renderTable();
});
elements.clearDrilldown.addEventListener("click", () => setDrilldown(null, { resetControls: false, scroll: false }));
document.querySelectorAll("[data-drilldown]").forEach((card) => {
  card.addEventListener("click", () => {
    openKpiDrilldown(card.dataset.drilldown);
  });
});
document.querySelector("#closeKpiDialog").addEventListener("click", () => {
  document.querySelector("#kpiDrilldownDialog").close();
});
document.querySelector("#kpiDrilldownDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector("#kpiDrilldownDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  event.currentTarget.close();
});
document.querySelector("#kpiDrilldownDialog").addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.currentTarget.close();
});

async function loadDashboardData() {
  try {
    const response = await fetch(DATA_SOURCE.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${DATA_SOURCE.label} returned HTTP ${response.status}`);

    const csvText = await response.text();
    const results = Papa.parse(csvText, { skipEmptyLines: "greedy" });
    if (results.errors.some((error) => error.type === "Delimiter" || error.type === "Quotes")) {
      throw new Error(`${DATA_SOURCE.label} returned invalid CSV`);
    }

    const rows = rowsFromCsvMatrix(results.data);
    if (!rows) throw new Error(`${DATA_SOURCE.label} is missing the expected columns`);

    initializeDashboard(rows, DATA_SOURCE.label);
  } catch (error) {
    console.warn(error.message);
    showLoadError("Application data could not be loaded from the published Google Sheet.");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  loadDashboardData();
});