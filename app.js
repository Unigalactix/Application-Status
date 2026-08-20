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
  notes: ["Notes / Verification Evidence", "Notes", "Verification Evidence"],
  latestEmailLink: ["Latest Email Link", "Latest Email", "Email Link"]
};

const DATA_SOURCE = {
  label: "Live sheet",
  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2WFqLSxLSHAZm4yS3UaPfGVFdYuyJJoB3Xra0leap4-mOcWG8_GQ-IUihR_OgbzAfi4YYdkAaMl4_/pub?gid=1438332888&single=true&output=csv"
};

const PAGE_SIZE = 10;
const WEEKLY_APPLICATION_GOAL = 10;

const state = {
  applications: [],
  statusChart: null,
  timelineChart: null,
  referralChart: null,
  drilldown: null,
  currentPage: 1,
  filteredApplications: [],
  columnFilters: new Map(),
  activeColumnFilter: null,
  activeColumnValues: [],
  pendingColumnValues: new Set(),
  insightStartIndex: 0
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
        notes: valueFor(row, COLUMN_ALIASES.notes),
        latestEmailLink: valueFor(row, COLUMN_ALIASES.latestEmailLink)
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

function validExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function createEmailLinkCell(value) {
  const cell = document.createElement("td");
  cell.className = "email-link-cell";
  const url = validExternalUrl(value);

  if (!url) {
    cell.textContent = value ? "Link unavailable" : "Not provided";
    return cell;
  }

  const link = document.createElement("a");
  link.className = "email-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "Open latest email";
  link.append(document.createTextNode("Open email"));
  const icon = document.createElement("i");
  icon.dataset.lucide = "external-link";
  icon.setAttribute("aria-hidden", "true");
  link.append(icon);
  cell.append(link);
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

function columnFilterValue(application, key) {
  if (key === "date") return formatDate(application);
  if (key === "latestEmailLink") return validExternalUrl(application.latestEmailLink)
    ? "Link available"
    : "Not provided";
  if (key === "lastUpdate") {
    return application.rawLastUpdate
      ? formatDate({ parsedDate: application.parsedLastUpdate, rawDate: application.rawLastUpdate })
      : "Not provided";
  }
  return displayValue(application[key]);
}

function updateColumnFilterSelection() {
  const selectedCount = state.pendingColumnValues.size;
  const totalCount = state.activeColumnValues.length;
  document.querySelector("#columnFilterSelection").textContent = selectedCount === totalCount
    ? "All values selected"
    : `${selectedCount} of ${totalCount} selected`;
}

function renderColumnFilterOptions() {
  const query = document.querySelector("#columnFilterSearch").value.trim().toLowerCase();
  const values = state.activeColumnValues.filter((value) => value.toLowerCase().includes(query));
  const options = document.querySelector("#columnFilterOptions");
  options.replaceChildren();

  values.forEach((value) => {
    const label = document.createElement("label");
    label.className = "column-filter-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.pendingColumnValues.has(value);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.pendingColumnValues.add(value);
      else state.pendingColumnValues.delete(value);
      updateColumnFilterSelection();
    });
    const text = document.createElement("span");
    text.textContent = value;
    label.append(checkbox, text);
    options.append(label);
  });

  if (!values.length) {
    const empty = document.createElement("p");
    empty.className = "column-filter-empty";
    empty.textContent = "No matching values";
    options.append(empty);
  }
  updateColumnFilterSelection();
}

function closeColumnFilterMenu() {
  const menu = document.querySelector("#columnFilterMenu");
  menu.hidden = true;
  document.querySelectorAll(".column-filter-button[aria-expanded='true']")
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
  state.activeColumnFilter = null;
}

function positionColumnFilterMenu(button) {
  const menu = document.querySelector("#columnFilterMenu");
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(
    Math.max(8, buttonRect.right - menuRect.width),
    window.innerWidth - menuRect.width - 8
  );
  const below = buttonRect.bottom + 6;
  const preferredTop = below + menuRect.height <= window.innerHeight - 8
    ? below
    : buttonRect.top - menuRect.height - 6;
  const top = Math.min(
    Math.max(8, preferredTop),
    Math.max(8, window.innerHeight - menuRect.height - 8)
  );
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function openColumnFilterMenu(button) {
  const key = button.dataset.filterKey;
  state.activeColumnFilter = key;
  state.activeColumnValues = [...new Set(
    state.applications.map((application) => columnFilterValue(application, key))
  )].sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  state.pendingColumnValues = state.columnFilters.has(key)
    ? new Set(state.columnFilters.get(key))
    : new Set(state.activeColumnValues);

  document.querySelector("#columnFilterTitle").textContent = button.dataset.filterLabel;
  document.querySelector("#columnFilterSearch").value = "";
  document.querySelectorAll(".column-filter-button").forEach((filterButton) => {
    filterButton.setAttribute("aria-expanded", String(filterButton === button));
  });
  renderColumnFilterOptions();
  const menu = document.querySelector("#columnFilterMenu");
  menu.hidden = false;
  positionColumnFilterMenu(button);
  document.querySelector("#columnFilterSearch").focus();
}

function updateColumnFilterButtons() {
  document.querySelectorAll(".column-filter-button").forEach((button) => {
    const isActive = state.columnFilters.has(button.dataset.filterKey);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.title = `${isActive ? "Edit active" : "Filter"} ${button.dataset.filterLabel} filter`;
  });
}

function initializeColumnFilters() {
  document.querySelectorAll("th[data-filter-key]").forEach((header) => {
    const label = header.textContent.trim();
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "column-filter-button";
    button.dataset.filterKey = header.dataset.filterKey;
    button.dataset.filterLabel = label;
    button.title = `Filter ${label}`;
    button.setAttribute("aria-label", `Filter ${label}`);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<i data-lucide="list-filter" aria-hidden="true"></i>';
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.activeColumnFilter === button.dataset.filterKey) closeColumnFilterMenu();
      else openColumnFilterMenu(button);
    });
    const content = document.createElement("div");
    content.className = "column-header-content";
    content.append(labelElement, button);
    header.replaceChildren(content);
  });
  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
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
    row.append(createEmailLinkCell(application.latestEmailLink));
    fragment.append(row);
  });

  elements.body.append(fragment);
  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  elements.emptyState.hidden = applications.length > 0;
  document.querySelector(".table-wrap").hidden = state.applications.length === 0;
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

function percentage(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

function daysSince(date, today = new Date()) {
  if (!date) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function applicationActivityDate(application) {
  return application.parsedLastUpdate || application.parsedDate;
}

function isActiveApplication(application) {
  return !isClosedStatus(application.status) && !isOfferStatus(application.status);
}

function hasEmployerResponse(application) {
  return isInterviewReached(application)
    || isOfferStatus(application.status)
    || isClosedStatus(application.status);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
}

function groupApplications(applications, getKey) {
  const groups = new Map();
  applications.forEach((application) => {
    const key = getKey(application) || "Not provided";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(application);
  });
  return [...groups].map(([label, group]) => ({
    label,
    applications: group,
    total: group.length,
    active: group.filter(isActiveApplication).length,
    interviews: group.filter(isInterviewReached).length,
    closed: group.filter((application) => isClosedStatus(application.status)).length
  }));
}

function roleConcentration(role) {
  const normalized = role.toLowerCase();
  if (["ai", "machine learning", "ml", "agentic", "applied scientist", "coreai"]
    .some((term) => normalized.includes(term))) return "AI / ML";
  if (["backend", "platform", "cloud", "storage", "infrastructure", "distributed", "core"]
    .some((term) => normalized.includes(term))) return "Backend / Platform / Cloud";
  if (["full stack", "full-stack", "frontend", "front end"]
    .some((term) => normalized.includes(term))) return "Full stack / Frontend";
  return "General software engineering";
}

function renderInsightPanel(id, metrics, rows = [], note = "") {
  const container = document.querySelector(`#${id}`);
  container.replaceChildren();

  const metricGrid = document.createElement("div");
  metricGrid.className = "insight-metrics";
  metrics.forEach(({ value, label, detail }) => {
    const metric = document.createElement("div");
    metric.className = "insight-metric";
    const valueElement = document.createElement("strong");
    valueElement.textContent = value;
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    metric.append(valueElement, labelElement);
    if (detail) {
      const detailElement = document.createElement("small");
      detailElement.textContent = detail;
      metric.append(detailElement);
    }
    metricGrid.append(metric);
  });
  container.append(metricGrid);

  if (rows.length) {
    const list = document.createElement("div");
    list.className = "insight-list";
    rows.forEach(({ label, value, detail }) => {
      const row = document.createElement("div");
      row.className = "insight-row";
      const text = document.createElement("div");
      const labelElement = document.createElement("strong");
      labelElement.textContent = label;
      text.append(labelElement);
      if (detail) {
        const detailElement = document.createElement("span");
        detailElement.textContent = detail;
        text.append(detailElement);
      }
      const valueElement = document.createElement("b");
      valueElement.textContent = value;
      row.append(text, valueElement);
      list.append(row);
    });
    container.append(list);
  }

  if (note) {
    const noteElement = document.createElement("p");
    noteElement.className = "insight-note";
    noteElement.textContent = note;
    container.append(noteElement);
  }
}

function insightCardsPerView() {
  return window.matchMedia("(max-width: 700px)").matches ? 1 : 2;
}

function updateInsightCarouselControls() {
  const cards = [...document.querySelectorAll(".insight-panel")];
  const cardsPerView = insightCardsPerView();
  const maximumStart = Math.max(0, cards.length - cardsPerView);
  state.insightStartIndex = Math.min(Math.max(0, state.insightStartIndex), maximumStart);
  const end = Math.min(state.insightStartIndex + cardsPerView, cards.length);
  document.querySelector("#insightPosition").textContent = `${state.insightStartIndex + 1}-${end} of ${cards.length}`;
  document.querySelector("#previousInsights").disabled = state.insightStartIndex === 0;
  document.querySelector("#nextInsights").disabled = state.insightStartIndex === maximumStart;
}

function scrollToInsight(index, behavior = "smooth") {
  const viewport = document.querySelector("#insightCarouselViewport");
  const track = viewport.querySelector(".intelligence-grid");
  const cards = [...track.querySelectorAll(".insight-panel")];
  const cardsPerView = insightCardsPerView();
  state.insightStartIndex = Math.min(Math.max(0, index), Math.max(0, cards.length - cardsPerView));
  const target = cards[state.insightStartIndex];
  if (target) {
    viewport.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior });
  }
  updateInsightCarouselControls();
}

function openInsightDetail(card) {
  const title = card.querySelector("h3").textContent;
  const summary = card.querySelector(".panel-heading p").textContent;
  const content = card.querySelector(".insight-content").cloneNode(true);
  content.removeAttribute("id");
  document.querySelector("#insightDialogTitle").textContent = title;
  document.querySelector("#insightDialogSummary").textContent = summary;
  document.querySelector("#insightDialogBody").replaceChildren(content);
  document.querySelector("#insightDetailDialog").showModal();
}

function initializeInsightCarousel() {
  const viewport = document.querySelector("#insightCarouselViewport");
  if (viewport.dataset.ready === "true") {
    scrollToInsight(state.insightStartIndex, "auto");
    return;
  }
  viewport.dataset.ready = "true";
  const cards = [...viewport.querySelectorAll(".insight-panel")];
  cards.forEach((card, index) => {
    const title = card.querySelector("h3").textContent;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${title} details`);
    card.setAttribute("aria-posinset", String(index + 1));
    card.setAttribute("aria-setsize", String(cards.length));
    card.addEventListener("click", () => openInsightDetail(card));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openInsightDetail(card);
    });
  });

  document.querySelector("#previousInsights").addEventListener("click", () => {
    scrollToInsight(state.insightStartIndex - insightCardsPerView());
  });
  document.querySelector("#nextInsights").addEventListener("click", () => {
    scrollToInsight(state.insightStartIndex + insightCardsPerView());
  });
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") scrollToInsight(state.insightStartIndex - insightCardsPerView());
    if (event.key === "ArrowRight") scrollToInsight(state.insightStartIndex + insightCardsPerView());
  });

  let scrollFrame;
  viewport.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const track = viewport.querySelector(".intelligence-grid");
      const left = viewport.scrollLeft;
      state.insightStartIndex = cards.reduce((closestIndex, card, index) => {
        const cardLeft = card.offsetLeft - track.offsetLeft;
        const closestLeft = cards[closestIndex].offsetLeft - track.offsetLeft;
        return Math.abs(cardLeft - left) < Math.abs(closestLeft - left) ? index : closestIndex;
      }, 0);
      updateInsightCarouselControls();
    });
  }, { passive: true });
  window.addEventListener("resize", () => scrollToInsight(state.insightStartIndex, "auto"));
  scrollToInsight(0, "auto");
}

function initializeApplicationInsightsDisclosure() {
  initializeSectionDisclosure({
    toggleId: "toggleApplicationInsights",
    contentId: "applicationInsightsContent",
    showLabel: "Show insights",
    hideLabel: "Hide insights",
    onExpand: () => requestAnimationFrame(() => scrollToInsight(state.insightStartIndex, "auto"))
  });
}

function initializeSectionDisclosure({ toggleId, contentId, showLabel, hideLabel, onExpand }) {
  const toggle = document.querySelector(`#${toggleId}`);
  const content = document.querySelector(`#${contentId}`);
  const section = toggle.closest("section");

  toggle.addEventListener("click", () => {
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isExpanded));
    toggle.querySelector("span").textContent = isExpanded ? showLabel : hideLabel;
    content.hidden = isExpanded;
    updateExpandableSectionGroup(section, !isExpanded);
    if (!isExpanded) onExpand?.();
  });
}

function updateExpandableSectionGroup(activeSection, isExpanded) {
  const group = activeSection.closest(".expandable-sections");
  activeSection.classList.toggle("is-expanded", isExpanded);
  group.classList.toggle("has-expanded-section", isExpanded);
  group.querySelectorAll(":scope > section").forEach((section) => {
    section.hidden = isExpanded && section !== activeSection;
  });
}

function initializeExpandableSectionCards() {
  document.querySelectorAll(".expandable-sections > section").forEach((section) => {
    const card = section.querySelector(":scope > .shell");
    const toggle = section.querySelector(".section-toggle");
    card.addEventListener("click", (event) => {
      if (section.classList.contains("is-expanded")) return;
      if (event.target.closest("button, a, input, select, textarea")) return;
      toggle.click();
    });
  });
}

function resizeVisualCharts() {
  state.statusChart?.resize();
  state.timelineChart?.resize();
  state.referralChart?.resize();
}

let activeVisualizationCard = null;

function closeVisualizationDetail() {
  document.querySelector("#visualizationDetailDialog").close();
}

function restoreVisualizationCard() {
  if (!activeVisualizationCard) return;
  const { card, parent, nextSibling } = activeVisualizationCard;
  parent.insertBefore(card, nextSibling?.parentNode === parent ? nextSibling : null);
  activeVisualizationCard = null;
  requestAnimationFrame(() => {
    resizeVisualCharts();
    card.focus();
  });
}

function openVisualizationDetail(card) {
  const heading = card.querySelector(".panel-heading");
  const title = heading.querySelector("h3").textContent;
  const summary = heading.querySelector("p").textContent;
  activeVisualizationCard = { card, parent: card.parentNode, nextSibling: card.nextSibling };
  document.querySelector("#visualizationDialogTitle").textContent = title;
  document.querySelector("#visualizationDialogSummary").textContent = summary;
  document.querySelector("#visualizationDialogBody").append(card);
  document.querySelector("#visualizationDetailDialog").showModal();
  requestAnimationFrame(resizeVisualCharts);
}

function initializeVisualCarousel({
  toggleId,
  contentId,
  viewportId,
  previousId,
  nextId,
  positionId,
  showLabel,
  hideLabel
}) {
  const toggle = document.querySelector(`#${toggleId}`);
  const content = document.querySelector(`#${contentId}`);
  const viewport = document.querySelector(`#${viewportId}`);
  const track = viewport.querySelector(".visual-carousel-track");
  const cards = [...track.querySelectorAll(".visual-carousel-card")];
  const previous = document.querySelector(`#${previousId}`);
  const next = document.querySelector(`#${nextId}`);
  const position = document.querySelector(`#${positionId}`);
  const section = toggle.closest("section");
  let currentIndex = 0;

  const updateControls = () => {
    position.textContent = `${currentIndex + 1} of ${cards.length}`;
    previous.disabled = currentIndex === 0;
    next.disabled = currentIndex === cards.length - 1;
  };

  const scrollToCard = (index, behavior = "smooth") => {
    currentIndex = Math.min(Math.max(0, index), cards.length - 1);
    const target = cards[currentIndex];
    viewport.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior });
    updateControls();
  };

  toggle.addEventListener("click", () => {
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isExpanded));
    toggle.querySelector("span").textContent = isExpanded ? showLabel : hideLabel;
    content.hidden = isExpanded;
    updateExpandableSectionGroup(section, !isExpanded);
    if (!isExpanded) requestAnimationFrame(() => {
      scrollToCard(currentIndex, "auto");
      resizeVisualCharts();
    });
  });

  previous.addEventListener("click", () => scrollToCard(currentIndex - 1));
  next.addEventListener("click", () => scrollToCard(currentIndex + 1));
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") scrollToCard(currentIndex - 1);
    if (event.key === "ArrowRight") scrollToCard(currentIndex + 1);
  });

  let scrollFrame;
  viewport.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const left = viewport.scrollLeft;
      currentIndex = cards.reduce((closestIndex, card, index) => {
        const cardLeft = card.offsetLeft - track.offsetLeft;
        const closestLeft = cards[closestIndex].offsetLeft - track.offsetLeft;
        return Math.abs(cardLeft - left) < Math.abs(closestLeft - left) ? index : closestIndex;
      }, 0);
      updateControls();
    });
  }, { passive: true });

  cards.forEach((card, index) => {
    const title = card.querySelector("h3").textContent;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${title} expanded view`);
    card.setAttribute("aria-posinset", String(index + 1));
    card.setAttribute("aria-setsize", String(cards.length));
    card.addEventListener("click", (event) => {
      if (event.target.closest("canvas")) return;
      openVisualizationDetail(card);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openVisualizationDetail(card);
    });
  });

  updateControls();
}

function renderApplicationInsights() {
  const applications = state.applications;
  const active = applications.filter(isActiveApplication);
  const responded = applications.filter(hasEmployerResponse);
  const interviews = applications.filter(isInterviewReached);
  const activeAges = active
    .map((application) => daysSince(applicationActivityDate(application)))
    .filter((days) => days !== null);
  const stale14 = active.filter((application) =>
    (daysSince(applicationActivityDate(application)) || 0) > 14
  );
  const followUps = active.filter((application) => {
    const nextAction = application.nextAction.toLowerCase();
    return ["follow", "contact", "prepare", "schedule", "complete"]
      .some((term) => nextAction.includes(term));
  });

  renderInsightPanel("pipelineHealthInsight", [
    { value: active.length, label: "Active" },
    { value: stale14.length, label: "Stale 14+ days" },
    { value: followUps.length, label: "Action indicated" },
    { value: `${median(activeAges)}d`, label: "Median inactivity" }
  ], stale14
    .sort((first, second) => daysSince(applicationActivityDate(second)) - daysSince(applicationActivityDate(first)))
    .slice(0, 3)
    .map((application) => ({
      label: application.company,
      detail: application.role,
      value: `${daysSince(applicationActivityDate(application))}d`
    })), "Stale uses the latest status update, or application date when no update is recorded.");

  renderInsightPanel("responseInsight", [
    { value: `${percentage(responded.length, applications.length)}%`, label: "Response rate", detail: `${responded.length} of ${applications.length}` },
    { value: `${percentage(interviews.length, applications.length)}%`, label: "Interview rate", detail: `${interviews.length} reached screening+` },
    { value: `${percentage(applications.filter((application) => isClosedStatus(application.status)).length, applications.length)}%`, label: "Terminal rate" },
    { value: `${percentage(applications.filter((application) => isOfferStatus(application.status)).length, applications.length)}%`, label: "Offer rate" }
  ], [], "Response means screening/interview/offer progress or a terminal employer decision.");

  const agingBuckets = [
    { label: "0-7 days", minimum: 0, maximum: 7 },
    { label: "8-14 days", minimum: 8, maximum: 14 },
    { label: "15-30 days", minimum: 15, maximum: 30 },
    { label: "30+ days", minimum: 31, maximum: Infinity }
  ];
  renderInsightPanel("agingInsight", [
    { value: `${median(activeAges)}d`, label: "Median inactivity" },
    { value: `${Math.max(...activeAges, 0)}d`, label: "Oldest inactivity" }
  ], agingBuckets.map((bucket) => {
    const count = activeAges.filter((days) => days >= bucket.minimum && days <= bucket.maximum).length;
    return {
      label: bucket.label,
      detail: `${percentage(count, active.length)}% of active pipeline`,
      value: count
    };
  }), "Aging measures inactivity, not total time spent in each stage.");

  const allSourceGroups = groupApplications(applications, (application) => displayValue(application.source))
    .sort((first, second) => second.total - first.total);
  const sourceGroups = allSourceGroups.slice(0, 5);
  renderInsightPanel("sourceInsight", [
    { value: allSourceGroups.length, label: "Sources" },
    { value: sourceGroups[0]?.label || "N/A", label: "Highest volume" }
  ], sourceGroups.map((group) => ({
    label: group.label,
    detail: `${group.interviews} interview-stage application${group.interviews === 1 ? "" : "s"}`,
    value: `${group.total} · ${percentage(group.interviews, group.total)}%`
  })), "Rows show application volume followed by interview conversion.");

  const companyGroups = groupApplications(applications, (application) => application.company)
    .sort((first, second) => second.total - first.total)
    .slice(0, 5);
  const topCompany = companyGroups[0];
  renderInsightPanel("companyInsight", [
    { value: new Set(applications.map((application) => application.company)).size, label: "Companies" },
    { value: `${percentage(topCompany?.total || 0, applications.length)}%`, label: "Top-company share", detail: topCompany?.label || "N/A" }
  ], companyGroups.map((group) => ({
    label: group.label,
    detail: `${group.active} active · ${group.closed} terminal`,
    value: `${group.total} · ${percentage(group.interviews, group.total)}%`
  })), topCompany && percentage(topCompany.total, applications.length) >= 40
    ? `${topCompany.label} represents a high concentration of the current portfolio.`
    : "No single company exceeds 40% of the current portfolio.");

  const roleGroups = groupApplications(applications, (application) => roleConcentration(application.role))
    .sort((first, second) => second.total - first.total);
  const noResponseRoles = applications.filter((application) => !hasEmployerResponse(application)).length;
  renderInsightPanel("roleInsight", [
    { value: new Set(applications.map((application) => application.role)).size, label: "Exact roles" },
    { value: noResponseRoles, label: "Awaiting response" }
  ], roleGroups.map((group) => ({
    label: group.label,
    detail: `${group.interviews} reached screening+`,
    value: `${group.total} · ${percentage(group.interviews, group.total)}%`
  })), hasMeaningfulValue(applications.find((application) => application.resumeVersion)?.resumeVersion || "")
    ? "Resume-version effectiveness can be compared as data accumulates."
    : "Resume effectiveness is unavailable until Resume Version is populated.");

  const missingRecruiter = applications.filter((application) => !hasMeaningfulValue(application.recruiter)).length;
  const missingResume = applications.filter((application) => !hasMeaningfulValue(application.resumeVersion)).length;
  const missingSalary = active.filter((application) => !hasMeaningfulValue(application.salaryBand)).length;
  const noReferral = applications.filter((application) => !hasReferral(application.referral)).length;
  renderInsightPanel("actionInsight", [
    { value: stale14.length, label: "Follow up: 14+ days" },
    { value: followUps.length, label: "Explicit next actions" }
  ], [
    { label: "Missing recruiter contact", value: missingRecruiter, detail: "All applications" },
    { label: "Missing resume version", value: missingResume, detail: "Needed for resume analysis" },
    { label: "Missing active salary band", value: missingSalary, detail: "Active applications only" },
    { label: "No referral recorded", value: noReferral, detail: "Referral cohort unavailable" }
  ], "Prioritize stale active records, then enrich fields needed for outcome analysis.");

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - 6);
  currentWeekStart.setHours(0, 0, 0, 0);
  const priorWeekStart = new Date(currentWeekStart);
  priorWeekStart.setDate(currentWeekStart.getDate() - 7);
  const priorWeekEnd = new Date(currentWeekStart);
  priorWeekEnd.setMilliseconds(-1);
  const inRange = (date, start, end) => date && date >= start && date <= end;
  const thisWeek = applications.filter((application) => inRange(application.parsedDate, currentWeekStart, today));
  const priorWeek = applications.filter((application) => inRange(application.parsedDate, priorWeekStart, priorWeekEnd));
  const closuresThisWeek = applications.filter((application) =>
    isClosedStatus(application.status) && inRange(application.parsedLastUpdate, currentWeekStart, today)
  );
  const weeklyDelta = thisWeek.length - priorWeek.length;
  renderInsightPanel("weeklyInsight", [
    { value: thisWeek.length, label: "Applied this week", detail: `${weeklyDelta >= 0 ? "+" : ""}${weeklyDelta} vs prior week` },
    { value: priorWeek.length, label: "Prior week" },
    { value: thisWeek.filter(isInterviewReached).length, label: "New apps at screening+" },
    { value: closuresThisWeek.length, label: "Closures recorded" }
  ], [{
    label: "Weekly application goal",
    detail: `Default target: ${WEEKLY_APPLICATION_GOAL}`,
    value: `${percentage(thisWeek.length, WEEKLY_APPLICATION_GOAL)}%`
  }], "Weekly windows are rolling seven-day periods ending today. The goal is configurable in app.js.");
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
      createCell(formatDate(application), "date-cell"),
      createEmailLinkCell(application.latestEmailLink)
    );
    body.append(row);
  });
  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });

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
      application.notes,
      application.latestEmailLink
    ].join(" ").toLowerCase();
    const matchesQuery = !query || searchableText.includes(query);
    const matchesStatus = !selectedStatus || application.status === selectedStatus;
    const matchesRole = matchesRoleFilter(application, selectedRole);
    const matchesDrilldown = !state.drilldown || state.drilldown.predicate(application);
    const matchesColumnFilters = [...state.columnFilters].every(([key, selectedValues]) =>
      selectedValues.has(columnFilterValue(application, key))
    );
    return matchesQuery && matchesStatus && matchesRole && matchesDrilldown && matchesColumnFilters;
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
  initializeColumnFilters();
  renderMetrics();
  renderCharts();
  renderApplicationInsights();
  initializeInsightCarousel();
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
document.querySelector("#columnFilterSearch").addEventListener("input", renderColumnFilterOptions);
document.querySelector("#selectAllColumnValues").addEventListener("click", () => {
  state.pendingColumnValues = new Set(state.activeColumnValues);
  renderColumnFilterOptions();
});
document.querySelector("#clearColumnValues").addEventListener("click", () => {
  state.pendingColumnValues.clear();
  renderColumnFilterOptions();
});
document.querySelector("#applyColumnFilter").addEventListener("click", () => {
  const key = state.activeColumnFilter;
  if (!key) return;
  if (state.pendingColumnValues.size === state.activeColumnValues.length) {
    state.columnFilters.delete(key);
  } else {
    state.columnFilters.set(key, new Set(state.pendingColumnValues));
  }
  updateColumnFilterButtons();
  closeColumnFilterMenu();
  resetPageAndFilter();
});
document.querySelector("#closeColumnFilter").addEventListener("click", closeColumnFilterMenu);
document.addEventListener("click", (event) => {
  const menu = document.querySelector("#columnFilterMenu");
  if (!menu.hidden && !menu.contains(event.target)) closeColumnFilterMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#columnFilterMenu").hidden) {
    closeColumnFilterMenu();
  }
});
document.querySelector(".table-wrap").addEventListener("scroll", closeColumnFilterMenu);
window.addEventListener("resize", closeColumnFilterMenu);
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
document.querySelector("#closeInsightDialog").addEventListener("click", () => {
  document.querySelector("#insightDetailDialog").close();
});
document.querySelector("#insightDetailDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector("#insightDetailDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  event.currentTarget.close();
});
document.querySelector("#insightDetailDialog").addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.currentTarget.close();
});
document.querySelector("#closeVisualizationDialog").addEventListener("click", closeVisualizationDetail);
document.querySelector("#visualizationDetailDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeVisualizationDetail();
});
document.querySelector("#visualizationDetailDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeVisualizationDetail();
});
document.querySelector("#visualizationDetailDialog").addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  closeVisualizationDetail();
});
document.querySelector("#visualizationDetailDialog").addEventListener("close", restoreVisualizationCard);

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
  initializeExpandableSectionCards();
  initializeSectionDisclosure({
    toggleId: "toggleJobPortals",
    contentId: "jobPortalsContent",
    showLabel: "Show portals",
    hideLabel: "Hide portals"
  });
  initializeApplicationInsightsDisclosure();
  initializeVisualCarousel({
    toggleId: "togglePipelineAnalytics",
    contentId: "pipelineAnalyticsContent",
    viewportId: "analyticsCarouselViewport",
    previousId: "previousAnalytics",
    nextId: "nextAnalytics",
    positionId: "analyticsPosition",
    showLabel: "Show analytics",
    hideLabel: "Hide analytics"
  });
  initializeVisualCarousel({
    toggleId: "togglePipelineInsights",
    contentId: "pipelineInsightsContent",
    viewportId: "pipelineInsightsCarouselViewport",
    previousId: "previousPipelineInsight",
    nextId: "nextPipelineInsight",
    positionId: "pipelineInsightPosition",
    showLabel: "Show insights",
    hideLabel: "Hide insights"
  });
  loadDashboardData();
});