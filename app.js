const COLUMN_ALIASES = {
  company: ["Company", "Company Name", "Employer"],
  role: ["Role / Title", "Role", "Job Title", "Position", "Title"],
  applicationId: ["Application ID", "Job ID", "Requisition ID"],
  status: ["Current Status", "Status", "Application Status"],
  date: ["Application Date", "Date Applied", "Applied Date", "Date"],
  lastUpdate: ["Last Status Update", "Status Updated", "Last Updated"],
  location: ["Location / Work Mode", "Location", "Work Mode"],
  source: ["Portal / Source", "Source", "Portal"],
  nextAction: ["Action Required / Next Steps", "Next Steps", "Next Action"],
  notes: ["Notes / Verification Evidence", "Notes", "Verification Evidence"]
};

const DATA_SOURCE = {
  label: "Live sheet",
  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2WFqLSxLSHAZm4yS3UaPfGVFdYuyJJoB3Xra0leap4-mOcWG8_GQ-IUihR_OgbzAfi4YYdkAaMl4_/pub?gid=1438332888&single=true&output=csv"
};

const state = {
  applications: [],
  statusChart: null,
  companyChart: null
};

const elements = {
  body: document.querySelector("#applicationsBody"),
  emptyState: document.querySelector("#emptyState"),
  emptyStateText: document.querySelector("#emptyStateText"),
  loadMessage: document.querySelector("#loadMessage"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
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

function renderTable(applications) {
  elements.body.replaceChildren();
  const fragment = document.createDocumentFragment();

  applications.forEach((application) => {
    const row = document.createElement("tr");
    row.append(createStackedCell(application.company, application.source, "company-cell"));
    row.append(createStackedCell(
      application.role,
      application.applicationId && application.applicationId !== "N/A" ? `ID ${application.applicationId}` : ""
    ));

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
    row.append(createCell(application.location || "Not provided", "location-cell"));
    row.append(createCell(formatDate(application), "date-cell"));
    row.append(createStackedCell(application.nextAction, application.notes, "action-cell"));
    fragment.append(row);
  });

  elements.body.append(fragment);
  elements.emptyState.hidden = applications.length > 0;
  document.querySelector(".table-wrap").hidden = applications.length === 0;
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

  const isClosed = (status) => ["reject", "declin", "withdraw", "closed", "not selected"].some((term) => status.includes(term));

  elements.totalMetric.textContent = state.applications.length;
  elements.monthMetric.textContent = `${currentMonthCount} this month`;
  elements.activeMetric.textContent = metricCount((status) => !isClosed(status) && !status.includes("offer") && !status.includes("accepted"));
  elements.interviewMetric.textContent = metricCount((status) => status.includes("interview") || status.includes("screen"));
  elements.offerMetric.textContent = metricCount((status) => status.includes("offer") || status.includes("accepted"));
}

function chartTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
}

function renderCharts() {
  const statuses = Object.entries(countBy(state.applications, (application) => application.status))
    .sort((first, second) => second[1] - first[1]);
  const companies = Object.entries(countBy(state.applications, (application) => application.company))
    .sort((first, second) => second[1] - first[1])
    .slice(0, 8);

  state.statusChart?.destroy();
  state.companyChart?.destroy();

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
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, color: chartTextColor(), padding: 16, usePointStyle: true }
        }
      }
    }
  });

  state.companyChart = new Chart(document.querySelector("#companyChart"), {
    type: "bar",
    data: {
      labels: companies.map(([company]) => company),
      datasets: [{
        label: "Applications",
        data: companies.map(([, count]) => count),
        backgroundColor: "#33758d",
        borderRadius: 4,
        barThickness: 18
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: chartTextColor(), precision: 0 },
          grid: { color: "#e7ece8" }
        },
        y: {
          ticks: { color: chartTextColor() },
          grid: { display: false }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
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

function applyFilters() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const selectedStatus = elements.statusFilter.value;
  const filtered = state.applications.filter((application) => {
    const searchableText = [
      application.company,
      application.role,
      application.applicationId,
      application.status,
      application.location,
      application.source,
      application.nextAction,
      application.notes
    ].join(" ").toLowerCase();
    const matchesQuery = !query || searchableText.includes(query);
    const matchesStatus = !selectedStatus || application.status === selectedStatus;
    return matchesQuery && matchesStatus;
  });

  elements.emptyStateText.textContent = state.applications.length
    ? "Try changing your search or status filter."
    : "Your synced applications will appear here.";
  renderTable(filtered);
}

function initializeDashboard(rows, sourceLabel) {
  state.applications = normalizeRows(rows);
  populateStatusFilter();
  renderMetrics();
  renderCharts();
  renderTable(state.applications);

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

elements.searchInput.addEventListener("input", applyFilters);
elements.statusFilter.addEventListener("change", applyFilters);

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