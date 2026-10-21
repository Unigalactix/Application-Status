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
  followUpDate: ["Follow-Up Due Date", "Follow-Up Date", "Follow Up Date", "Follow-up Date"],
  followUpStatus: ["Follow-Up Status", "Follow Up Status", "Follow-up Status"],
  lastFollowUpDate: ["Last Follow-Up Date", "Last Follow Up Date", "Last Follow-up Date"],
  rejectionStage: ["Rejection Stage", "Rejection Category", "Rejection Reason"],
  notes: ["Notes / Verification Evidence", "Notes", "Verification Evidence"],
  latestEmailLink: ["Latest Email Link", "Latest Email", "Email Link"]
};

const DATA_SOURCE = {
  label: "Live sheet",
  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfFCkkC85sZ8yNJKLp9A7hqnzoaHT7aOVtRQgnWvNp9-0VVUyS_98k7h85oyB_m2lbD-V4J4LUaaPC/pub?output=csv"
};

const JOBS_SOURCE = {
  label: "Job postings feed",
  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLlTyzQlweD2qxir3pBkosG9KzQAhRZRIjV_i3PiCkQGfE_IkzyKPw074zmenTPYrIkBGqpCFz1Zt0/pub?output=csv",
  sheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLlTyzQlweD2qxir3pBkosG9KzQAhRZRIjV_i3PiCkQGfE_IkzyKPw074zmenTPYrIkBGqpCFz1Zt0/pubhtml"
};

const JOB_COLUMN_ALIASES = {
  title: ["Job Title", "Title", "Role"],
  company: ["Company", "Company Name", "Employer"],
  location: ["Location", "Job Location"],
  date: ["Date Posted", "Posted Date", "Date"],
  workType: ["Work Type", "Employment Type", "Work Mode"],
  compensation: ["Estimated Compensation", "Compensation", "Salary Range"],
  matchScore: ["Match Score", "Score"],
  skills: ["Matching Skills / Resume Alignment", "Matching Skills", "Skills"],
  referralContact: ["Referral Contact (Name / Role)", "Referral Contact", "Referral Lead"],
  applicationLink: ["Application Link", "Apply Link", "Job URL", "URL"]
};

const PAGE_SIZE = 10;
const WEEKLY_APPLICATION_GOAL = 10;
const SCHEDULED_UPDATE_HOURS = [8, 20];
const FOLLOW_UP_STORAGE_KEY = "application-tracker-follow-ups";
const APPLIED_JOBS_STORAGE_KEY = "application-tracker-applied-jobs";
const STARRED_APPLICATIONS_STORAGE_KEY = "application-tracker-starred-applications";
const THEME_STORAGE_KEY = "application-tracker-theme";
const MISSING_APPLICATION_IDENTIFIERS = new Set(["", "n/a", "na", "none", "unknown", "not provided", "tbd", "-"]);

function loadStoredRecord(storageKey) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

const state = {
  applications: [],
  timelineChart: null,
  drilldown: null,
  currentPage: 1,
  filteredApplications: [],
  columnFilters: new Map(),
  activeColumnFilter: null,
  activeColumnValues: [],
  pendingColumnValues: new Set(),
  dataLoadStatus: "loading",
  jobPostings: [],
  followUpLog: loadStoredRecord(FOLLOW_UP_STORAGE_KEY),
  appliedJobs: loadStoredRecord(APPLIED_JOBS_STORAGE_KEY),
  starredApplications: loadStoredRecord(STARRED_APPLICATIONS_STORAGE_KEY)
};

const elements = {
  body: document.querySelector("#applicationsBody"),
  emptyState: document.querySelector("#emptyState"),
  emptyStateText: document.querySelector("#emptyStateText"),
  loadMessage: document.querySelector("#loadMessage"),
  searchInput: document.querySelector("#searchInput"),
  companyFilter: document.querySelector("#companyFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  roleFilter: document.querySelector("#roleFilter"),
  starredFilter: document.querySelector("#starredFilter"),
  drilldownBar: document.querySelector("#drilldownBar"),
  drilldownLabel: document.querySelector("#drilldownLabel"),
  clearDrilldown: document.querySelector("#clearDrilldown"),
  resultSummary: document.querySelector("#resultSummary"),
  syncState: document.querySelector("#syncState"),
  syncLabel: document.querySelector("#syncLabel"),
  syncCountdown: document.querySelector("#syncCountdown"),
  themeToggle: document.querySelector("#themeToggle"),
  totalMetric: document.querySelector("#totalMetric"),
  monthMetric: document.querySelector("#monthMetric"),
  activeMetric: document.querySelector("#activeMetric"),
  interviewMetric: document.querySelector("#interviewMetric"),
  offerMetric: document.querySelector("#offerMetric"),
  rejectedMetric: document.querySelector("#rejectedMetric"),
  followUpMetric: document.querySelector("#followUpMetric")
};

const jobElements = {
  badge: document.querySelector("#jobPostingBadge"),
  search: document.querySelector("#jobPostingSearch"),
  workType: document.querySelector("#jobWorkTypeFilter"),
  sort: document.querySelector("#jobPostingSort"),
  summary: document.querySelector("#jobPostingSummary"),
  message: document.querySelector("#jobPostingsMessage"),
  grid: document.querySelector("#jobPostingsGrid"),
  empty: document.querySelector("#jobPostingsEmpty"),
  source: document.querySelector("#jobPostingsSource")
};

function storedTheme() {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY);
    return theme === "light" || theme === "dark" ? theme : null;
  } catch {
    return null;
  }
}

function updateThemeControl(theme) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} mode`;
  const icon = elements.themeToggle.querySelector("svg, i");
  elements.themeToggle.setAttribute("aria-label", label);
  elements.themeToggle.title = label;
  icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The active theme still applies when browser storage is unavailable.
    }
  }
  updateThemeControl(theme);
  if (window.lucide) lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  if (state.timelineChart) renderCharts();
}

function initializeTheme() {
  const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(storedTheme() || (systemPreference.matches ? "dark" : "light"));
  elements.themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  });
  systemPreference.addEventListener("change", (event) => {
    if (!storedTheme()) applyTheme(event.matches ? "dark" : "light");
  });
}

function scheduledUpdateWindow(now = new Date()) {
  const todayAt = (hour) => {
    const date = new Date(now);
    date.setHours(hour, 0, 0, 0);
    return date;
  };
  const morningUpdate = todayAt(SCHEDULED_UPDATE_HOURS[0]);
  const eveningUpdate = todayAt(SCHEDULED_UPDATE_HOURS[1]);

  if (now >= eveningUpdate) {
    const nextUpdate = new Date(morningUpdate);
    nextUpdate.setDate(nextUpdate.getDate() + 1);
    return { previousUpdate: eveningUpdate, nextUpdate };
  }
  if (now >= morningUpdate) {
    return { previousUpdate: morningUpdate, nextUpdate: eveningUpdate };
  }

  const previousUpdate = new Date(eveningUpdate);
  previousUpdate.setDate(previousUpdate.getDate() - 1);
  return { previousUpdate, nextUpdate: morningUpdate };
}

function formatDataAge(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function updateDataFreshness(now = new Date()) {
  const { nextUpdate } = scheduledUpdateWindow(now);
  if (state.dataLoadStatus === "loaded") {
    elements.syncLabel.textContent = `Fetched ${formatDataAge(now - state.fetchedAt)} ago`;
  } else if (state.dataLoadStatus === "unavailable") {
    elements.syncLabel.textContent = "Data unavailable";
  }
  elements.syncCountdown.textContent = `Estimated sheet schedule in ${formatCountdown(nextUpdate - now)}`;
}

function initializeDataFreshnessTimer() {
  updateDataFreshness();
  window.setInterval(updateDataFreshness, 1000);
}

function isSameLocalDate(first, second) {
  return first?.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function renderUpdateSummaryMetric(value, label) {
  const metric = document.createElement("div");
  const count = document.createElement("strong");
  count.textContent = value;
  const description = document.createElement("span");
  description.textContent = label;
  metric.append(count, description);
  return metric;
}

function openUpdateSummary() {
  if (state.dataLoadStatus !== "loaded") return;

  const previousUpdate = state.applications.reduce((latest, application) => {
    const date = applicationActivityDate(application);
    return date && (!latest || date > latest) ? date : latest;
  }, null);
  if (!previousUpdate) {
    announce("The sheet has no dated activity to summarize.");
    return;
  }
  const newApplications = state.applications.filter((application) =>
    isSameLocalDate(application.parsedDate, previousUpdate)
  );
  const updatedApplications = state.applications.filter((application) =>
    isSameLocalDate(application.parsedLastUpdate, previousUpdate)
  );
  const activity = [...new Set([...newApplications, ...updatedApplications])];
  const metrics = document.querySelector("#updateSummaryMetrics");
  metrics.replaceChildren(
    renderUpdateSummaryMetric(newApplications.length, "New applications"),
    renderUpdateSummaryMetric(updatedApplications.length, "Records updated"),
    renderUpdateSummaryMetric(activity.filter(isInterviewReached).length, "At screening+"),
    renderUpdateSummaryMetric(activity.filter((application) => isOfferStatus(application.status)).length, "Offers")
  );

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
  document.querySelector("#updateSummaryWindow").textContent =
    `Latest recorded activity: ${dateFormatter.format(previousUpdate)} · Fetched at ${timeFormatter.format(state.fetchedAt)} (your local time)`;

  const list = document.querySelector("#updateSummaryList");
  list.replaceChildren();
  if (!activity.length) {
    const empty = document.createElement("div");
    empty.className = "inline-empty update-summary-empty";
    const icon = document.createElement("i");
    icon.dataset.lucide = "clipboard-check";
    icon.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "No dated activity found";
    const detail = document.createElement("span");
    detail.textContent = `No application or status updates are dated ${dateFormatter.format(previousUpdate)}.`;
    copy.append(title, detail);
    empty.append(icon, copy);
    list.append(empty);
  } else {
    activity.slice(0, 12).forEach((application) => {
      const item = document.createElement("article");
      item.className = "update-summary-item";
      const copy = document.createElement("div");
      const company = document.createElement("strong");
      company.textContent = application.company;
      const role = document.createElement("span");
      role.textContent = application.role;
      copy.append(company, role);
      const details = document.createElement("div");
      details.className = "update-summary-item-details";
      const status = document.createElement("span");
      status.className = `status-pill status-${statusTone(application.status)}`;
      status.textContent = application.status;
      const change = document.createElement("small");
      const isNew = newApplications.includes(application);
      const isUpdated = updatedApplications.includes(application);
      change.textContent = isNew && isUpdated
        ? "New application · Status updated"
        : isNew ? "New application" : "Status updated";
      details.append(status, change);
      item.append(copy, details);
      list.append(item);
    });
    if (activity.length > 12) {
      const remaining = document.createElement("p");
      remaining.className = "update-summary-remaining";
      remaining.textContent = `+${activity.length - 12} more updated record${activity.length - 12 === 1 ? "" : "s"}`;
      list.append(remaining);
    }
  }

  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  document.querySelector("#updateSummaryDialog").showModal();
}

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

function jobRowsFromCsvMatrix(matrix) {
  const headerIndex = matrix.findIndex((row) => {
    const cells = row.map((cell) => String(cell ?? "").trim());
    return JOB_COLUMN_ALIASES.title.some((alias) => cells.includes(alias))
      && JOB_COLUMN_ALIASES.company.some((alias) => cells.includes(alias));
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
    const parsed = new Date(Number(isoParts[1]), Number(isoParts[2]) - 1, Number(isoParts[3]));
    return parsed.getFullYear() === Number(isoParts[1])
      && parsed.getMonth() === Number(isoParts[2]) - 1
      && parsed.getDate() === Number(isoParts[3]) ? parsed : null;
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
  const applications = rows
    .map((row) => {
      const company = valueFor(row, COLUMN_ALIASES.company);
      const role = valueFor(row, COLUMN_ALIASES.role);
      const status = valueFor(row, COLUMN_ALIASES.status) || "Unknown";
      const rawDate = valueFor(row, COLUMN_ALIASES.date);
      const rawLastUpdate = valueFor(row, COLUMN_ALIASES.lastUpdate);
      const rawFollowUpDate = valueFor(row, COLUMN_ALIASES.followUpDate);
      const rawLastFollowUpDate = valueFor(row, COLUMN_ALIASES.lastFollowUpDate);

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
        rawFollowUpDate,
        parsedFollowUpDate: parseDate(rawFollowUpDate),
        followUpStatus: valueFor(row, COLUMN_ALIASES.followUpStatus),
        rawLastFollowUpDate,
        parsedLastFollowUpDate: parseDate(rawLastFollowUpDate),
        rejectionStage: valueFor(row, COLUMN_ALIASES.rejectionStage),
        notes: valueFor(row, COLUMN_ALIASES.notes),
        latestEmailLink: valueFor(row, COLUMN_ALIASES.latestEmailLink)
      };
    })
    .filter((application) => application.company !== "Unknown company" || application.role !== "Untitled role");

  return mergeDuplicateApplications(applications)
    .sort((first, second) => (second.parsedDate?.getTime() || 0) - (first.parsedDate?.getTime() || 0));
}

function normalizedApplicationIdentifier(value) {
  const normalizedId = value.trim().toLowerCase();
  if (MISSING_APPLICATION_IDENTIFIERS.has(normalizedId)) return null;
  return normalizedId.split(/\s*\/\s*/)[0].trim();
}

function mergeDuplicateApplications(applications) {
  const groupsById = new Map();
  const applicationsWithoutId = [];

  applications.forEach((application) => {
    const normalizedId = normalizedApplicationIdentifier(application.applicationId);
    if (!normalizedId) {
      applicationsWithoutId.push(application);
      return;
    }
    if (!groupsById.has(normalizedId)) groupsById.set(normalizedId, []);
    groupsById.get(normalizedId).push(application);
  });

  const mergedApplications = [...groupsById.values()].map((group) => {
    if (group.length === 1) return group[0];

    const freshestFirst = [...group].sort((first, second) =>
      (second.parsedLastUpdate?.getTime() || second.parsedDate?.getTime() || 0)
      - (first.parsedLastUpdate?.getTime() || first.parsedDate?.getTime() || 0)
    );
    const merged = { ...freshestFirst[0] };

    freshestFirst.slice(1).forEach((application) => {
      Object.keys(merged).forEach((key) => {
        if ((merged[key] === "" || merged[key] === null) && application[key] !== "" && application[key] !== null) {
          merged[key] = application[key];
        }
      });
    });

    const applicationDates = group.filter((application) => application.parsedDate);
    if (applicationDates.length) {
      const earliest = applicationDates.reduce((current, application) =>
        application.parsedDate < current.parsedDate ? application : current
      );
      merged.rawDate = earliest.rawDate;
      merged.parsedDate = earliest.parsedDate;
    }

    const statusUpdates = group.filter((application) => application.parsedLastUpdate);
    if (statusUpdates.length) {
      const latest = statusUpdates.reduce((current, application) =>
        application.parsedLastUpdate > current.parsedLastUpdate ? application : current
      );
      merged.rawLastUpdate = latest.rawLastUpdate;
      merged.parsedLastUpdate = latest.parsedLastUpdate;
    }

    const followUps = group.filter((application) => application.parsedLastFollowUpDate);
    if (followUps.length) {
      const latest = followUps.reduce((current, application) =>
        application.parsedLastFollowUpDate > current.parsedLastFollowUpDate ? application : current
      );
      merged.rawLastFollowUpDate = latest.rawLastFollowUpDate;
      merged.parsedLastFollowUpDate = latest.parsedLastFollowUpDate;
    }

    return merged;
  });

  return [...mergedApplications, ...applicationsWithoutId];
}

function normalizeJobRows(rows) {
  return rows
    .map((row) => {
      const rawDate = valueFor(row, JOB_COLUMN_ALIASES.date);
      const rawScore = valueFor(row, JOB_COLUMN_ALIASES.matchScore);
      return {
        title: valueFor(row, JOB_COLUMN_ALIASES.title),
        company: valueFor(row, JOB_COLUMN_ALIASES.company),
        location: valueFor(row, JOB_COLUMN_ALIASES.location),
        rawDate,
        parsedDate: parseDate(rawDate),
        workType: valueFor(row, JOB_COLUMN_ALIASES.workType),
        compensation: valueFor(row, JOB_COLUMN_ALIASES.compensation),
        matchScore: Number.parseInt(rawScore.replace(/[^0-9]/g, ""), 10) || 0,
        skills: valueFor(row, JOB_COLUMN_ALIASES.skills),
        referralContact: valueFor(row, JOB_COLUMN_ALIASES.referralContact),
        applicationLink: valueFor(row, JOB_COLUMN_ALIASES.applicationLink)
      };
    })
    .filter((job) => job.title || job.company)
    .sort((first, second) =>
      (second.parsedDate?.getTime() || 0) - (first.parsedDate?.getTime() || 0)
      || second.matchScore - first.matchScore
    );
}

function formatJobDate(job) {
  if (!job.parsedDate) return job.rawDate || "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(job.parsedDate);
}

function createJobMeta(iconName, text, className = "") {
  const item = document.createElement("span");
  if (className) item.className = className;
  item.title = text;
  const icon = document.createElement("i");
  icon.dataset.lucide = iconName;
  icon.setAttribute("aria-hidden", "true");
  item.append(icon, document.createTextNode(text));
  return item;
}

function jobKey(job) {
  return [job.applicationLink, job.company, job.title, job.rawDate].join("|").toLowerCase();
}

function normalizedJobIdentity(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isTrackedApplication(job) {
  const company = normalizedJobIdentity(job.company);
  const title = normalizedJobIdentity(job.title);
  if (!company || !title) return false;
  return state.applications.some((application) =>
    normalizedJobIdentity(application.company) === company
    && normalizedJobIdentity(application.role) === title
  );
}

function isJobApplied(job) {
  return Boolean(state.appliedJobs[jobKey(job)]) || isTrackedApplication(job);
}

function markJobApplied(job) {
  state.appliedJobs[jobKey(job)] = new Date().toISOString();
  try {
    localStorage.setItem(APPLIED_JOBS_STORAGE_KEY, JSON.stringify(state.appliedJobs));
  } catch {
    // Keep the applied state for this page load when browser storage is unavailable.
  }
}

function createJobPostingCard(job) {
  const card = document.createElement("article");
  card.className = "job-posting-card";

  const heading = document.createElement("div");
  heading.className = "job-posting-heading";
  const company = document.createElement("p");
  company.textContent = job.company || "Company unavailable";
  const score = document.createElement("span");
  score.className = "job-match-score";
  score.textContent = `${job.matchScore}% match`;
  heading.append(company, score);

  const title = document.createElement("h3");
  title.textContent = job.title || "Untitled opportunity";

  const metadata = document.createElement("div");
  metadata.className = "job-posting-meta";
  metadata.append(
    createJobMeta("map-pin", job.location || "Location unavailable"),
    createJobMeta("briefcase", job.workType || "Work type unavailable"),
    createJobMeta("calendar-days", formatJobDate(job))
  );
  if (job.compensation) metadata.append(createJobMeta("badge-dollar-sign", job.compensation));
  if (job.referralContact) {
    metadata.append(createJobMeta("user-check", `Referral lead: ${job.referralContact}`, "job-referral-meta"));
  }

  const skills = document.createElement("p");
  skills.className = "job-posting-skills";
  skills.textContent = job.skills || "Resume alignment details unavailable";

  const footer = document.createElement("div");
  footer.className = "job-posting-footer";
  const age = document.createElement("span");
  const daysOld = daysSince(job.parsedDate);
  age.textContent = daysOld === null ? "Posting date unavailable"
    : daysOld === 0 ? "Posted today"
      : `${daysOld} day${daysOld === 1 ? "" : "s"} ago`;
  const directLink = validExternalUrl(job.applicationLink);
  const isApplied = isJobApplied(job);
  const action = document.createElement(directLink ? "a" : "span");
  action.className = directLink
    ? `job-apply-link${isApplied ? " is-applied" : ""}`
    : "job-apply-link is-unavailable";
  if (directLink) {
    action.href = directLink;
    action.target = "_blank";
    action.rel = "noopener noreferrer";
    action.title = isApplied ? "Open application page again" : "Open application page";
    action.addEventListener("click", () => {
      if (isApplied) return;
      markJobApplied(job);
      action.classList.add("is-applied");
      action.replaceChildren(document.createTextNode("Applied"));
      const appliedIcon = document.createElement("i");
      appliedIcon.dataset.lucide = "check";
      appliedIcon.setAttribute("aria-hidden", "true");
      action.append(appliedIcon);
      action.title = "Open application page again";
      lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
      window.setTimeout(renderJobPostings, 0);
    });
  } else {
    action.setAttribute("aria-disabled", "true");
    action.title = "The published sheet does not expose this application's URL";
  }
  const actionIcon = document.createElement("i");
  actionIcon.dataset.lucide = directLink ? (isApplied ? "check" : "send") : "link-2-off";
  actionIcon.setAttribute("aria-hidden", "true");
  action.append(document.createTextNode(isApplied ? "Applied" : "Apply now"), actionIcon);
  footer.append(age, action);

  card.append(heading, title, metadata, skills, footer);
  return card;
}

function renderJobPostings() {
  const query = jobElements.search.value.trim().toLowerCase();
  const selectedWorkType = jobElements.workType.value;
  const jobs = state.jobPostings.filter((job) => {
    const searchable = [job.title, job.company, job.location, job.workType, job.skills, job.referralContact]
      .join(" ").toLowerCase();
    return (!query || searchable.includes(query))
      && (!selectedWorkType || job.workType === selectedWorkType);
  });

  const sorters = {
    latest: (first, second) => (second.parsedDate?.getTime() || 0) - (first.parsedDate?.getTime() || 0),
    match: (first, second) => second.matchScore - first.matchScore,
    company: (first, second) => first.company.localeCompare(second.company)
  };
  const selectedSorter = sorters[jobElements.sort.value] || sorters.latest;
  jobs.sort((first, second) =>
    Number(isJobApplied(first)) - Number(isJobApplied(second))
    || selectedSorter(first, second)
  );
  const appliedCount = jobs.filter(isJobApplied).length;
  jobElements.grid.replaceChildren(...jobs.map(createJobPostingCard));
  jobElements.grid.hidden = jobs.length === 0;
  jobElements.empty.hidden = jobs.length > 0;
  jobElements.summary.textContent = `${jobs.length} of ${state.jobPostings.length} postings · ${appliedCount} applied`;
  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function initializeJobPostings(rows) {
  state.jobPostings = normalizeJobRows(rows);
  const workTypes = [...new Set(state.jobPostings.map((job) => job.workType).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  workTypes.forEach((workType) => {
    const option = document.createElement("option");
    option.value = workType;
    option.textContent = workType;
    jobElements.workType.append(option);
  });
  jobElements.badge.textContent = `${state.jobPostings.length} available`;
  jobElements.message.hidden = true;
  renderJobPostings();
  renderDailyFocus();
}

function showJobPostingsError(message) {
  jobElements.badge.textContent = "Feed unavailable";
  jobElements.summary.textContent = "Unable to load opportunities";
  jobElements.message.textContent = message;
  jobElements.message.hidden = false;
  jobElements.grid.hidden = true;
  jobElements.empty.hidden = true;
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

function isRejectedStatus(status) {
  return ["reject", "declin", "not selected"]
    .some((term) => status.toLowerCase().includes(term));
}

function applicationKey(application) {
  return [application.applicationId, application.company, application.role, application.rawDate]
    .join("|").toLowerCase();
}

function isApplicationStarred(application) {
  return Boolean(state.starredApplications[applicationKey(application)]);
}

function toggleApplicationStar(application) {
  const key = applicationKey(application);
  if (isApplicationStarred(application)) delete state.starredApplications[key];
  else state.starredApplications[key] = new Date().toISOString();

  const saved = persistLocal(STARRED_APPLICATIONS_STORAGE_KEY, state.starredApplications);
  if (saved) announce("Star preference saved on this device.");
  applyFilters();
}

function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

function effectiveLastFollowUpDate(application) {
  const localDate = parseDate(state.followUpLog[applicationKey(application)] || "");
  const sheetDate = application.parsedLastFollowUpDate;
  if (!localDate) return sheetDate;
  if (!sheetDate) return localDate;
  return localDate > sheetDate ? localDate : sheetDate;
}

function hasExplicitFollowUpAction(application) {
  const nextAction = application.nextAction.toLowerCase();
  return ["follow", "contact", "prepare", "schedule", "complete"]
    .some((term) => nextAction.includes(term));
}

function followUpDueDate(application, today = new Date()) {
  if (!isActiveApplication(application)) return null;
  const lastFollowUpDate = effectiveLastFollowUpDate(application);
  if (application.parsedFollowUpDate) {
    if (!lastFollowUpDate || lastFollowUpDate < application.parsedFollowUpDate) {
      return startOfDay(application.parsedFollowUpDate);
    }
    return addDays(lastFollowUpDate, 7);
  }

  const activityDate = applicationActivityDate(application);
  if (lastFollowUpDate && (!activityDate || lastFollowUpDate >= activityDate)) {
    return addDays(lastFollowUpDate, 7);
  }
  if (hasExplicitFollowUpAction(application)) return startOfDay(today);
  return activityDate ? addDays(activityDate, 15) : null;
}

function followUpCadence(application, today = new Date()) {
  if (!isActiveApplication(application)) return "Closed";
  const dueDate = followUpDueDate(application, today);
  if (!dueDate) return "No date";
  const daysUntilDue = Math.round((startOfDay(dueDate) - startOfDay(today)) / 86400000);
  if (daysUntilDue < 0) return effectiveLastFollowUpDate(application) ? "Follow up again" : "Follow up";
  if (daysUntilDue === 0) return "Due today";

  const inactivity = daysSince(applicationActivityDate(application), today);
  if (inactivity !== null && inactivity <= 7) return "Wait";
  if (inactivity !== null && inactivity <= 14) return "Monitor";
  return "Upcoming";
}

function isFollowUpNeeded(application, today = new Date()) {
  const dueDate = followUpDueDate(application, today);
  return Boolean(dueDate) && startOfDay(dueDate) <= startOfDay(today);
}

function rejectionCategory(application) {
  if (hasMeaningfulValue(application.rejectionStage)) return application.rejectionStage;
  const evidence = `${application.status} ${application.interviewStage} ${application.notes}`.toLowerCase();
  if (["position closed", "role closed", "position filled", "cancelled", "canceled"]
    .some((term) => evidence.includes(term))) return "Position closed";
  if (["assessment", "coding test", "take-home", "take home"]
    .some((term) => evidence.includes(term))) return "After assessment";
  if (["interview", "screen", "onsite", "panel", "technical", "system design"]
    .some((term) => evidence.includes(term))) return "After interview";
  if (!hasMeaningfulValue(application.interviewStage)
    || ["applied", "submitted", "under review", "recruiter review", "declin", "reject", "not started"]
      .some((term) => application.interviewStage.toLowerCase().includes(term))) return "Before screening";
  return "Unknown";
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

function createNodeCell(node, className) {
  const cell = document.createElement("td");
  cell.append(node);
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
  if (key === "followUpDate") {
    return application.rawFollowUpDate
      ? formatDate({ parsedDate: application.parsedFollowUpDate, rawDate: application.rawFollowUpDate })
      : "Not provided";
  }
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
  if (document.querySelector(".column-filter-button")) return;
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
    const starred = isApplicationStarred(application);
    row.classList.toggle("is-starred", starred);
    const starButton = document.createElement("button");
    starButton.type = "button";
    starButton.className = "application-star";
    starButton.classList.toggle("is-active", starred);
    starButton.title = starred ? "Stop watching this application" : "Watch this application";
    starButton.setAttribute("aria-label", starButton.title);
    starButton.setAttribute("aria-pressed", String(starred));
    starButton.innerHTML = '<i data-lucide="star" aria-hidden="true"></i>';
    starButton.addEventListener("click", () => toggleApplicationStar(application));
    row.append(createNodeCell(starButton, "watch-cell"));
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
    row.append(createCell(application.rawFollowUpDate
      ? formatDate({ parsedDate: application.parsedFollowUpDate, rawDate: application.rawFollowUpDate })
      : "Not provided", "date-cell"));
    row.append(createCell(displayValue(application.followUpStatus)));
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
  renderCompactApplications(pageApplications);
  updatePresentation();
  document.querySelector("#listScope").textContent = `${applications.length} matching · ${scopeDescription()} · ${state.page === "overview" ? "all applications" : PAGE_VIEWS[state.page].title}`;
}

function metricCount(predicate) {
  return scopedApplications().filter((application) => predicate(application.status.toLowerCase())).length;
}

function renderMetrics() {
  const now = new Date();
  const applications = scopedApplications();
  const currentMonthCount = applications.filter((application) =>
    application.parsedDate
    && application.parsedDate.getMonth() === now.getMonth()
    && application.parsedDate.getFullYear() === now.getFullYear()
  ).length;

  elements.totalMetric.textContent = applications.length;
  elements.monthMetric.textContent = `${currentMonthCount} this month`;
  elements.activeMetric.textContent = applications.filter(isActiveApplication).length;
  elements.interviewMetric.textContent = applications.filter((application) => currentStage(application) === "screening").length;
  document.querySelector("#assessmentMetric").textContent = applications.filter((application) => currentStage(application) === "assessment").length;
  document.querySelector("#finalMetric").textContent = applications.filter((application) => currentStage(application) === "final").length;
  elements.offerMetric.textContent = metricCount(isOfferStatus);
  elements.rejectedMetric.textContent = metricCount(isRejectedStatus);
  elements.followUpMetric.textContent = applications.filter((application) => isFollowUpNeeded(application)
    || (isActiveApplication(application) && application.status.toLowerCase().includes("action required"))).length;
}

function chartTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
}

function chartGridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim();
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderStageFunnel() {
  const stageDefinitions = [
    { label: "Applied / awaiting progress", key: "applied" },
    { label: "Action required", key: "action" },
    { label: "Assessments", key: "assessment" },
    { label: "Screening interview / outreach", key: "screening" },
    { label: "Final interview", key: "final" },
    { label: "Offer", key: "offer" },
    { label: "Declined / rejected", key: "rejected" },
    { label: "Other closed", key: "closed" },
    { label: "Status unavailable", key: "unknown" }
  ];
  const applications = scopedApplications();
  const counts = stageDefinitions.map(({ key }) => applications.filter((application) => currentStage(application) === key).length);
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

  const terminal = document.createElement("p");
  terminal.className = "funnel-terminal";
  terminal.textContent = `${applications.length} applications, each counted once. Current stage is inferred from status and stage text; outreach does not confirm a scheduled interview. Historical conversion and stage duration require event history.`;
  funnel.append(terminal);
}

function renderCompensation(offers) {
  const applications = offers.filter((application) => hasMeaningfulValue(application.salaryBand));
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
    ? `${applications.length} offer${applications.length === 1 ? "" : "s"} with salary data`
    : "No salary data for offers";
}

function percentage(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

function daysSince(date, today = new Date()) {
  if (!date) return null;
  const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((end - start) / 86400000));
}

function applicationActivityDate(application) {
  return application.parsedLastUpdate || application.parsedDate;
}

function isActiveApplication(application) {
  return hasMeaningfulValue(application.status) && !isClosedStatus(application.status) && !isOfferStatus(application.status);
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
    offers: group.filter((application) => isOfferStatus(application.status)).length,
    rejected: group.filter((application) => isRejectedStatus(application.status)).length,
    closed: group.filter((application) => isClosedStatus(application.status)).length
  }));
}

function formatShortDate(date) {
  return date
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
    : "Date unavailable";
}

function createFocusEmpty(message) {
  const empty = document.createElement("p");
  empty.className = "focus-empty";
  empty.textContent = message;
  return empty;
}

function createFollowUpButton(application, label = "Followed up") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "follow-up-complete";
  button.dataset.applicationKey = applicationKey(application);
  button.title = "Record a follow-up today in this browser";
  const icon = document.createElement("i");
  icon.dataset.lucide = "check";
  icon.setAttribute("aria-hidden", "true");
  button.append(icon, document.createTextNode(label));
  return button;
}

function createFocusApplication(application, { action = false } = {}) {
  const item = document.createElement("article");
  item.className = "focus-item";
  const copy = document.createElement("div");
  const company = document.createElement("strong");
  company.textContent = application.company;
  const role = document.createElement("span");
  role.textContent = application.role;
  const detail = document.createElement("small");
  const dueDate = followUpDueDate(application);
  detail.textContent = action
    ? `${followUpCadence(application)} · ${formatShortDate(dueDate)} · ${displayValue(application.nextAction)}`
    : `${displayValue(application.interviewStage)} · ${displayValue(application.nextAction)}`;
  copy.append(company, role, detail);
  item.append(copy);
  if (action) item.append(createFollowUpButton(application));
  return item;
}

function renderFocusList(id, items, createItem, emptyMessage) {
  const container = document.querySelector(`#${id}`);
  container.replaceChildren(...(items.length ? items.map(createItem) : [createFocusEmpty(emptyMessage)]));
}

function renderDailyFocus() {
  if (!state.applications.length) return;
  const today = startOfDay();
  const active = scopedApplications().filter(isActiveApplication);
  const dueApplications = active
    .map((application) => ({ application, dueDate: followUpDueDate(application, today) }))
    .filter(({ dueDate }) => dueDate)
    .sort((first, second) => first.dueDate - second.dueDate
      || (applicationActivityDate(first.application)?.getTime() || 0)
      - (applicationActivityDate(second.application)?.getTime() || 0));
  const overdue = dueApplications.filter(({ dueDate }) => dueDate < today).map(({ application }) => application);
  const dueToday = dueApplications.filter(({ dueDate }) => isSameLocalDate(dueDate, today)).map(({ application }) => application);
  const upcoming = dueApplications.filter(({ dueDate }) => dueDate > today)
    .slice(0, 5).map(({ application }) => application);

  document.querySelector("#overdueFollowUpCount").textContent = overdue.length;
  document.querySelector("#todayFollowUpCount").textContent = dueToday.length;
  document.querySelector("#upcomingFollowUpCount").textContent = upcoming.length;
  renderFocusList("overdueFollowUps", overdue.slice(0, 5), (application) => createFocusApplication(application, { action: true }), "Nothing overdue");
  renderFocusList("todayFollowUps", dueToday.slice(0, 5), (application) => createFocusApplication(application, { action: true }), "Nothing due today");
  renderFocusList("upcomingFollowUps", upcoming, (application) => createFocusApplication(application, { action: true }), "No upcoming follow-ups");

  const interviews = active.filter((application) => isInterviewReached(application)
    || ["assessment", "screen", "interview", "schedule", "complete", "prepare"]
      .some((term) => `${application.interviewStage} ${application.nextAction}`.toLowerCase().includes(term)))
    .slice(0, 5);
  renderFocusList("focusInterviews", interviews, createFocusApplication, "No interviews or assessments queued");

  const missingDetails = active.filter((application) =>
    !hasMeaningfulValue(application.recruiter)
    || !hasMeaningfulValue(application.resumeVersion)
    || !hasMeaningfulValue(application.nextAction)
  ).slice(0, 5);
  renderFocusList("focusMissingDetails", missingDetails, (application) => {
    const item = createFocusApplication(application);
    const missing = [
      !hasMeaningfulValue(application.recruiter) && "recruiter",
      !hasMeaningfulValue(application.resumeVersion) && "resume version",
      !hasMeaningfulValue(application.nextAction) && "next step"
    ].filter(Boolean).join(", ");
    item.querySelector("small").textContent = `Missing: ${missing}`;
    return item;
  }, "Key application details are complete");

  const strongJobs = state.jobPostings
    .filter((job) => job.matchScore >= 80 && !isJobApplied(job))
    .slice(0, 5);
  renderFocusList("focusJobMatches", strongJobs, (job) => {
    const item = document.createElement("article");
    item.className = "focus-item";
    const copy = document.createElement("div");
    const company = document.createElement("strong");
    company.textContent = job.company;
    const role = document.createElement("span");
    role.textContent = job.title;
    const detail = document.createElement("small");
    detail.textContent = job.referralContact
      ? `${job.matchScore}% match · Referral lead: ${job.referralContact}`
      : `${job.matchScore}% match · ${job.location || "Location unavailable"}`;
    copy.append(company, role, detail);
    item.append(copy);
    const directLink = validExternalUrl(job.applicationLink);
    if (directLink) {
      const link = document.createElement("a");
      link.className = "focus-job-link";
      link.href = directLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "Open application page";
      const icon = document.createElement("i");
      icon.dataset.lucide = "send";
      icon.setAttribute("aria-hidden", "true");
      link.append(icon, document.createTextNode("Apply"));
      item.append(link);
    }
    return item;
  }, state.jobPostings.length ? "No jobs currently score 80% or higher" : "Job matches are loading");

  document.querySelector("#dailyFocusSummary").textContent = `${overdue.length + dueToday.length} follow-up${overdue.length + dueToday.length === 1 ? "" : "s"} need attention`;
  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function recordFollowUp(applicationKeyValue) {
  state.followUpLog[applicationKeyValue] = localDateKey(new Date());
  const saved = persistLocal(FOLLOW_UP_STORAGE_KEY, state.followUpLog);
  renderMetrics();
  renderApplicationInsights();
  renderDailyFocus();
  document.querySelector("#dailyFocusStatus").textContent = saved ? "Follow-up recorded for today in this browser." : "Follow-up recorded for this session only; browser storage is unavailable.";
  renderWorkspaceSignals();
  applyFilters();
  if (document.querySelector("#applicationDetail").open && state.detailApplication) openApplicationDetail(state.detailApplication);
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

function initializeInsightCards() {
  const container = document.querySelector("#applicationInsightsContent");
  if (container.dataset.ready === "true") return;
  container.dataset.ready = "true";
  const cards = [...container.querySelectorAll(".insight-panel")];
  cards.forEach((card, index) => {
    const title = card.querySelector("h3").textContent;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${title} details`);
    card.setAttribute("aria-posinset", String(index + 1));
    card.setAttribute("aria-setsize", String(cards.length));
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      openInsightDetail(card);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openInsightDetail(card);
    });
  });
}

function initializeApplicationInsightsDisclosure() {
  initializeSectionDisclosure({
    toggleId: "toggleApplicationInsights",
    contentId: "applicationInsightsContent",
    showLabel: "Show insights",
    hideLabel: "Hide insights"
  });
}

function initializeSectionDisclosure({ toggleId, contentId, showLabel, hideLabel, onExpand }) {
  const toggle = document.querySelector(`#${toggleId}`);
  const content = document.querySelector(`#${contentId}`);
  const section = toggle.closest("section");
  const card = section.querySelector(":scope > .shell");

  toggle.addEventListener("click", () => {
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isExpanded));
    toggle.querySelector("span").textContent = isExpanded ? showLabel : hideLabel;
    toggle.setAttribute("aria-label", `${isExpanded ? "Expand" : "Collapse"} ${section.querySelector("h2").textContent}`);
    content.hidden = isExpanded;
    if (section.closest(".expandable-sections")) {
      updateExpandableSectionGroup(section, !isExpanded);
      queueMicrotask(() => updateExpandableCardTrigger(
        card,
        toggle,
        section.classList.contains("is-expanded")
      ));
    } else {
      section.classList.toggle("is-expanded", !isExpanded);
    }
    if (!isExpanded) onExpand?.();
  });
}

function updateExpandableCardTrigger(card, toggle, isExpanded) {
  if (isExpanded || card.hasAttribute("data-inline-action")) {
    card.removeAttribute("role");
    card.removeAttribute("tabindex");
    card.removeAttribute("aria-label");
    card.removeAttribute("aria-controls");
    card.removeAttribute("aria-expanded");
    return;
  }

  const title = card.querySelector("h2").textContent;
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.setAttribute("aria-label", `Open ${title}`);
  card.setAttribute("aria-controls", toggle.getAttribute("aria-controls"));
  card.setAttribute("aria-expanded", "false");
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
    updateExpandableCardTrigger(card, toggle, false);
    card.addEventListener("click", (event) => {
      if (section.classList.contains("is-expanded")) return;
      if (event.target.closest("button, a, input, select, textarea")) return;
      toggle.click();
    });
    card.addEventListener("keydown", (event) => {
      if (section.classList.contains("is-expanded")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle.click();
    });
  });
}

function resizeVisualCharts() {
  state.timelineChart?.resize();
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
  const applications = scopedApplications();
  const allSourceGroups = groupApplications(applications, (application) => canonicalSource(application.source))
    .sort((first, second) => second.total - first.total);
  const companyGroups = groupApplications(applications, (application) => application.company)
    .sort((first, second) => second.total - first.total);
  const topCompany = companyGroups[0];
  const roleGroups = groupApplications(applications, (application) => roleConcentration(application.role))
    .sort((first, second) => second.total - first.total);
  const strongestConversion = (groups) => [...groups]
    .filter((group) => group.total >= 2)
    .sort((first, second) =>
      percentage(second.interviews, second.total) - percentage(first.interviews, first.total)
      || second.interviews - first.interviews
      || second.total - first.total
    )[0];
  const bestSource = strongestConversion(allSourceGroups);
  const bestRole = strongestConversion(roleGroups);
  renderInsightPanel("targetingInsight", [
    { value: bestSource?.label || "N/A", label: "Leading observed source", detail: bestSource ? `${bestSource.interviews}/${bestSource.total} screening+ (${percentage(bestSource.interviews, bestSource.total)}%)${bestSource.total < 20 ? " · Small sample" : ""}` : "Needs more data" },
    { value: bestRole?.label || "N/A", label: "Leading observed role", detail: bestRole ? `${bestRole.interviews}/${bestRole.total} screening+ (${percentage(bestRole.interviews, bestRole.total)}%)${bestRole.total < 20 ? " · Small sample" : ""}` : "Needs more data" },
    { value: `${percentage(topCompany?.total || 0, applications.length)}%`, label: "Top-company share", detail: topCompany?.label || "N/A" }
  ], allSourceGroups.slice(0, 5).map((group) => ({
    label: group.label, value: `${group.interviews}/${group.total}`,
    detail: `${percentage(group.interviews, group.total)}% observed screening+ · ${group.total < 20 ? "Small sample" : "Descriptive, not causal"}`
  })), "Denominator: applications in the applied-date cohort; numerator: records with screening, assessment, interview or offer evidence. Aliases are grouped. Not a historical conversion rate; leaders require 2+ records.");

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
    { value: `${percentage(thisWeek.length, WEEKLY_APPLICATION_GOAL)}%`, label: "Goal reached", detail: `${thisWeek.length} of ${WEEKLY_APPLICATION_GOAL}` },
    { value: thisWeek.filter(isInterviewReached).length, label: "Reached screening+" }
  ], [{
    label: "Prior week",
    detail: `${closuresThisWeek.length} closure${closuresThisWeek.length === 1 ? "" : "s"} recorded this week`,
    value: priorWeek.length
  }  ], "Rolling seven-day windows ending today, within the selected applied-date cohort. Screening+ reflects recorded stage evidence, not scheduled interviews.");

  const rejected = applications.filter((application) => isRejectedStatus(application.status));
  const rejectionGroups = groupApplications(rejected, rejectionCategory)
    .sort((first, second) => second.total - first.total);
  const primaryRejection = rejectionGroups[0];
  const postScreenRejections = rejected.filter((application) =>
    ["After assessment", "After interview"].includes(rejectionCategory(application))
  ).length;
  renderInsightPanel("rejectionInsight", [
    { value: primaryRejection?.label || "N/A", label: "Primary rejection point", detail: primaryRejection ? `${primaryRejection.total} applications` : "No rejections" },
    { value: `${percentage(primaryRejection?.total || 0, rejected.length)}%`, label: "Share at that point" },
    { value: postScreenRejections, label: "Post-screen rejections" }
  ], [], "A high before-screening share points to targeting or resume alignment; explicit Rejection Stage values override inference.");
}

function renderCharts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const timelineDates = Array.from({ length: 30 }, (_value, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    return date;
  });
  const dateCounts = countBy(
    scopedApplications().filter((application) => application.parsedDate),
    (application) => localDateKey(application.parsedDate)
  );

  state.timelineChart?.destroy();

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
          grid: { color: chartGridColor() }
        },
        x: { ticks: { color: chartTextColor(), maxTicksLimit: 8 }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  renderStageFunnel();
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

function populateCompanyFilter() {
  [...new Set(state.applications.map((application) => application.company))]
    .sort((first, second) => first.localeCompare(second))
    .forEach((company) => {
      const option = document.createElement("option");
      option.value = company;
      option.textContent = company;
      elements.companyFilter.append(option);
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
    if (isActive) card.setAttribute("aria-current", "page");
    else card.removeAttribute("aria-current");
  });
}

function setDrilldown(drilldown, { resetControls = true, scroll = true } = {}) {
  state.drilldown = drilldown;
  state.currentPage = 1;
  if (resetControls) {
    elements.searchInput.value = "";
    elements.companyFilter.value = "";
    elements.statusFilter.value = "";
    elements.roleFilter.value = "";
    elements.starredFilter.setAttribute("aria-pressed", "false");
  }
  renderDrilldownState();
  applyFilters();
  if (scroll) scrollToApplications();
}

function applyFilters() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const selectedCompany = elements.companyFilter.value;
  const selectedStatus = elements.statusFilter.value;
  const selectedRole = elements.roleFilter.value;
  const starredOnly = elements.starredFilter.getAttribute("aria-pressed") === "true";
  const filtered = scopedApplications().filter((application) => {
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
      application.rawFollowUpDate,
      application.followUpStatus,
      application.notes,
      application.latestEmailLink
    ].join(" ").toLowerCase();
    const matchesQuery = !query || searchableText.includes(query);
    const matchesCompany = !selectedCompany || application.company === selectedCompany;
    const matchesStatus = !selectedStatus || application.status === selectedStatus;
    const matchesRole = matchesRoleFilter(application, selectedRole);
    const matchesStarred = !starredOnly || isApplicationStarred(application);
    const matchesDrilldown = !state.drilldown || state.drilldown.predicate(application);
    const matchesColumnFilters = [...state.columnFilters].every(([key, selectedValues]) =>
      selectedValues.has(columnFilterValue(application, key))
    );
    return matchesQuery && matchesCompany && matchesStatus && matchesRole
      && matchesStarred && matchesDrilldown && matchesColumnFilters && matchesWorkspaceFilters(application);
  }).sort((first, second) =>
    (state.page === "follow-up" ? Number(/action required/i.test(second.status)) - Number(/action required/i.test(first.status))
      || (followUpDueDate(first)?.getTime() || Infinity) - (followUpDueDate(second)?.getTime() || Infinity) : 0)
    || Number(isApplicationStarred(second)) - Number(isApplicationStarred(first))
    || (second.parsedDate?.getTime() || 0) - (first.parsedDate?.getTime() || 0)
  );

  elements.emptyStateText.textContent = state.applications.length
    ? "Try changing your search or filters."
    : "Your synced applications will appear here.";
  state.calendarCandidates = filtered;
  state.filteredApplications = state.selectedDay
    ? filtered.filter((application) => application.parsedDate && localDateKey(application.parsedDate) === state.selectedDay)
    : filtered;
  renderCalendar();
  renderTable();
}

function initializeDashboard(rows, sourceLabel) {
  const selections = [elements.companyFilter.value, elements.statusFilter.value, elements.roleFilter.value];
  state.applications = normalizeRows(rows);
  state.fetchedAt = new Date();
  state.rawRowCount = rows.filter((row) => valueFor(row, COLUMN_ALIASES.company) || valueFor(row, COLUMN_ALIASES.role)).length;
  elements.loadMessage.hidden = true;
  captureChanges();
  if (state.jobPostings.length) renderJobPostings();
  [elements.companyFilter, elements.statusFilter, elements.roleFilter].forEach((select) => {
    select.replaceChildren(select.options[0]);
  });
  populateCompanyFilter();
  populateStatusFilter();
  populateRoleFilter();
  [elements.companyFilter, elements.statusFilter, elements.roleFilter].forEach((select, index) => {
    select.value = [...select.options].some((option) => option.value === selections[index]) ? selections[index] : "";
  });
  initializeColumnFilters();
  renderMetrics();
  renderCharts();
  renderApplicationInsights();
  renderDailyFocus();
  initializeInsightCards();
  applyFilters();
  state.dataLoadStatus = "loaded";
  elements.syncState.disabled = false;
  elements.syncState.title = `${sourceLabel}; view the latest recorded activity summary`;
  updateDataFreshness();
  renderWorkspaceSignals();
}

function showLoadError(message) {
  state.dataLoadStatus = "unavailable";
  elements.syncState.disabled = true;
  elements.loadMessage.hidden = false;
  elements.loadMessage.textContent = message;
  updateDataFreshness();
  elements.resultSummary.textContent = "Unable to load applications";
  elements.emptyState.hidden = false;
  document.querySelector(".table-wrap").hidden = true;
  document.querySelector("#workspaceStatus").textContent = message + " Use Refresh data to retry.";
  renderFeedStatus();
}

function resetPageAndFilter() {
  state.currentPage = 1;
  applyFilters();
}

elements.searchInput.addEventListener("input", resetPageAndFilter);
elements.companyFilter.addEventListener("change", resetPageAndFilter);
elements.statusFilter.addEventListener("change", resetPageAndFilter);
elements.roleFilter.addEventListener("change", resetPageAndFilter);
elements.starredFilter.addEventListener("click", () => {
  const isActive = elements.starredFilter.getAttribute("aria-pressed") === "true";
  elements.starredFilter.setAttribute("aria-pressed", String(!isActive));
  resetPageAndFilter();
});
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
document.addEventListener("click", (event) => {
  const button = event.target.closest(".follow-up-complete");
  if (!button) return;
  recordFollowUp(button.dataset.applicationKey);
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
elements.syncState.addEventListener("click", openUpdateSummary);
document.querySelector("#closeUpdateSummary").addEventListener("click", () => {
  document.querySelector("#updateSummaryDialog").close();
});
document.querySelector("#updateSummaryDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector("#updateSummaryDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  event.currentTarget.close();
});
document.querySelector("#updateSummaryDialog").addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.currentTarget.close();
});
jobElements.search.addEventListener("input", renderJobPostings);
jobElements.workType.addEventListener("change", renderJobPostings);
jobElements.sort.addEventListener("change", renderJobPostings);

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

async function loadJobPostings() {
  state.jobsLoadStatus = "loading";
  try {
    const response = await fetch(JOBS_SOURCE.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${JOBS_SOURCE.label} returned HTTP ${response.status}`);

    const csvText = await response.text();
    const results = Papa.parse(csvText, { skipEmptyLines: "greedy" });
    if (results.errors.some((error) => error.type === "Delimiter" || error.type === "Quotes")) {
      throw new Error(`${JOBS_SOURCE.label} returned invalid CSV`);
    }

    const rows = jobRowsFromCsvMatrix(results.data);
    if (!rows) throw new Error(`${JOBS_SOURCE.label} is missing the expected columns`);
    initializeJobPostings(rows);
    state.jobsLoadStatus = "loaded";
    state.jobsFetchedAt = new Date();
  } catch (error) {
    console.warn(error.message);
    showJobPostingsError("New job postings could not be loaded from the published feed.");
    state.jobsLoadStatus = "unavailable";
  }
  renderFeedStatus();
}

window.addEventListener("DOMContentLoaded", () => {
  initializeWorkspace();
  initializeTheme();
  lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  jobElements.source.href = JOBS_SOURCE.sheetUrl;
  initializeDataFreshnessTimer();
  initializeExpandableSectionCards();
  initializeSectionDisclosure({
    toggleId: "toggleDailyFocus",
    contentId: "dailyFocusContent",
    showLabel: "Show focus",
    hideLabel: "Hide focus"
  });
  initializeSectionDisclosure({
    toggleId: "toggleJobPostings",
    contentId: "jobPostingsContent",
    showLabel: "Show jobs",
    hideLabel: "Hide jobs"
  });
  initializeSectionDisclosure({
    toggleId: "toggleJobPortals",
    contentId: "jobPortalsContent",
    showLabel: "Show portals",
    hideLabel: "Hide portals"
  });
  initializeApplicationInsightsDisclosure();
  initializeSectionDisclosure({
    toggleId: "togglePipelineAnalytics",
    contentId: "pipelineAnalyticsContent",
    showLabel: "Show analytics",
    hideLabel: "Hide analytics",
    onExpand: () => requestAnimationFrame(resizeVisualCharts)
  });
  initializeSectionDisclosure({
    toggleId: "togglePipelineInsights",
    contentId: "pipelineInsightsContent",
    showLabel: "Show insights",
    hideLabel: "Hide insights"
  });
  initializeSectionDisclosure({
    toggleId: "toggleApplications",
    contentId: "applicationsContent",
    showLabel: "Show applications",
    hideLabel: "Hide applications"
  });
  configureWorkspacePage();
  loadDashboardData();
  loadJobPostings();
});