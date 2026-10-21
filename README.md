# Application Tracker Dashboard

A static, responsive dashboard that loads job application tracking data and new job postings directly from published Google Sheets CSV feeds. GitHub Pages serves the site; no authentication, API key, or scheduled workflow is required.

Repository-specific guidance for coding agents is in [AGENTS.md](AGENTS.md).

## Data source

The application and job-posting CSV feeds are configured in `app.js`. The dashboard fetches both with browser caching disabled whenever the page opens. Each feed loads independently, so a job-posting feed failure does not prevent the application tracker from loading.

The header shows time since the last successful fetch, separately from the latest recorded sheet activity date and an estimated 8:00 AM / 8:00 PM update schedule in the visitor's local time zone. The countdown does not verify an upstream update or automatically refresh the page. **Refresh data** reloads both feeds independently. Selecting the freshness indicator summarizes the latest recorded activity date; date-only source fields cannot distinguish morning and evening runs.

The dashboard follows the visitor's system light or dark preference on first use. The header theme button saves a manual override in browser `localStorage`. The sheet shortcut beside **New job postings** opens the public source data in a new tab.

Because this is a **Publish to web** URL, every field in the CSV is publicly accessible to anyone with the URL, even if a field is not displayed by the dashboard. This includes recruiter names and email addresses in `Recruiter / POC (Name & Email)`. Remove sensitive contact details from the published tab or publish a separate sanitized tab if that information should remain private.

The current tracker columns are:

- `Company`
- `Role / Title`
- `Application ID`
- `Current Status`
- `Application Date`
- `Last Status Update`
- `Recruiter / POC (Name & Email)`
- `Resume Version` (supported when the column is added to the sheet)
- `Interview Stage`
- `Salary Band`
- `Referral`
- `Location / Work Mode`
- `Portal / Source`
- `Action Required / Next Steps`
- `Follow-Up Due Date` (overrides the inferred follow-up date)
- `Follow-Up Status`
- `Last Follow-Up Date` (optional; sheet-based record of completed follow-ups)
- `Rejection Stage` (optional; explicit rejection category)
- `Notes / Verification Evidence`
- `Latest Email Link`

The job-posting feed columns are:

- `Job Title`
- `Company`
- `Location`
- `Date Posted`
- `Work Type`
- `Estimated Compensation`
- `Match Score`
- `Matching Skills / Resume Alignment`
- `Referral Contact (Name / Role)`
- `Application Link`

`Application Link` must contain a raw absolute `http://` or `https://` URL as the cell's displayed value for **Apply now** to open the application directly. Published CSV output can flatten a spreadsheet hyperlink to display text such as `Apply Here`; when that happens, **Apply now** remains unavailable rather than sending users to an unrelated page.

## Dashboard views

### Workspace navigation

KPI cards are links to dedicated full-page views in the same static document, using bookmarkable URLs such as `?view=active` and `?view=follow-up`. They navigate normally instead of opening KPI dialogs. Supported views are `all`, `active`, `assessment`, `screening`, `final`, `offer`, `rejected`, and `follow-up`; browser Back returns to the prior page.

- **Assessments**, **Screening interview**, and **Final interview** are separate active-stage cards. Closed and offer outcomes take precedence; final-stage terms take precedence over assessment terms, then screening terms. Screening includes outreach and virtual-agent screens and does not imply a scheduled appointment. Original stage text remains visible in the record.
- **Total applications** includes a direct Calendar shortcut and a month calendar. Select a day to filter the list to applications submitted that day; month navigation and **Show all dates** clear the selected day. Calendar counts respect all other application filters.
- **Follow up needed** includes due/overdue follow-ups and active `Action Required` records. Its page contains the former Today's focus features, capped at five records per lane, plus a paginated queue with overdue, today, upcoming, action-required, and all-active views.
- The overview shows the **next five actions**, prioritizing action-required records, and clickable active-pipeline age buckets. Inactivity uses the last status update or application date; unknown dates are excluded from aging buckets.
- Compact application rows are the default, with a details drawer for full records. **Full dataset** retains the column slicers and all source fields. Both presentations share search, filters, pagination, and stars.
- An applied-date range (all time, rolling 7/30/90 days, or custom inclusive dates) scopes KPI counts, insights, aging, calendar, and lists. Additional list filters do not change KPI counts. The jobs feed is independent of the application date range. Undated applications appear only when the cohort has no date bounds.
- Weekly pace still uses rolling seven-day windows ending today, within the selected applied-date cohort; the pace chart shows the last 30 days within that cohort.
- The stage visualization is a **current stage distribution**, not a historical conversion funnel. Each record appears once. Historical stage conversions and stage durations require event history that is not present in the feed.
- Targeting signals normalize known source aliases and show numerator/denominator, observed screening+ percentages, and small-sample warnings below 20 records. These descriptive comparisons are not causal evidence or confirmed interview counts.
- Data coverage explains unavailable salary, resume, contact, identifier, and sheet-based follow-up fields. Missing values are never reported as zero compensation or successful outcomes.
- Built-in saved views include urgent actions, starred active roles, stale active roles (15+ days), and declines updated in the last seven days. Named custom views save the current filters, date range, presentation, and calendar selection in this browser only. Page context still applies when opening a saved view.
- **What changed** compares a minimal browser-local snapshot of record identities, status, stage, and update date with the previous visit baseline. The first visit establishes a baseline; new records and observed changes are listed, and **Mark reviewed** resets the baseline. This is not a full history, cross-device sync, or detection of removed records.
- All navigation tiles have matching collapsed dimensions and the UI supports both light/dark themes and mobile layouts.

- New job postings with search, work-type filtering, newest/best-match sorting, resume-alignment details, referral leads, and safe application actions
- **Applied** labels for job postings already present in the application tracker or selected through **Apply now**; applied postings sort below new opportunities
- Pipeline totals with dedicated application pages
- A single 30-day application-pace chart for spotting consistency and gaps
- A current-stage distribution including terminal outcomes
- Offer compensation details on the Offers page when salary bands are available
- A daily action queue for overdue, due-today, and upcoming follow-ups, interviews/assessments, missing details, and strong new-job matches
- Collapsible daily-focus and application-table sections
- Browser-local **Followed up** actions that postpone the next follow-up by seven days without modifying the read-only sheet
- Weekly pace against the application goal
- A compact targeting view showing the strongest source, role focus, and company concentration
- Rejection-stage analysis using explicit sheet categories when available and inferred categories otherwise
- Search, status, role concentration, and exact-role filters
- Exact company filtering populated from the live application data
- Browser-local application stars with starred-first ordering and a **Starred only** view
- Automatic merging of rows with the same non-placeholder `Application ID`
- Searchable multi-select slicers on every dataset column
- Complete 18-column dataset table with published follow-up details, secure latest-email links, and 10-row pagination

Missing data is reported explicitly. Compensation remains unavailable while salary bands are blank or `N/A`; meaningful comparisons require populated source fields.

Insight definitions:

- An employer response means screening/interview/offer progress or a terminal employer decision.
- Inactivity uses `Last Status Update`, falling back to `Application Date` when needed.
- Follow-up cadence is: wait through day 7, monitor through day 14, and follow up from day 15. A completed follow-up becomes due again after seven days without newer activity.
- `Follow-Up Due Date` overrides inferred cadence. `Last Follow-Up Date` is combined with browser-local completions, and the most recent value wins.
- **Followed up** writes only to browser `localStorage` because the published CSV is read-only. Add the same date to `Last Follow-Up Date` in Google Sheets to share it across browsers or devices.
- Application stars are also saved in browser `localStorage`; they remain after a reload on the same browser but do not modify the source sheet or sync across devices.
- Duplicate application IDs are merged before metrics and views are calculated, including slash-separated aliases that share the same primary ID. The newest status-update row supplies current fields, blanks are backfilled from older rows, the earliest application date is retained, and placeholder IDs such as `N/A` remain separate.
- Rejection categories are `Before screening`, `After assessment`, `After interview`, `Position closed`, and `Unknown`. A populated `Rejection Stage` value overrides inference.
- Weekly cadence uses rolling seven-day windows ending today. The default application goal is configured by `WEEKLY_APPLICATION_GOAL` in `app.js`.
- Stage-duration, resume-effectiveness, referral-lift, and compensation comparisons require meaningful source data and are intentionally omitted from the minimal analysis views when they are not actionable.

## Preview locally

Run a local web server from the project folder:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`. A local server is required because the dashboard fetches CSV data over HTTP.

## Validation

No installation or build is required. Run syntax checks and synthetic regression tests with Node.js:

```powershell
node --check app.js
node --check workspace.js
node --test tests\workspace.test.cjs
```

Use the local preview for browser checks of dedicated pages, date ranges, calendar selection, filtering, drawers, local persistence, feed errors, themes, and narrow layouts. Tests use synthetic records rather than personal tracker data.

## Set up your own tracker

Open the footer's **[Setup guide](setup.html)** for a complete walkthrough: create sanitized Google Sheets with the documented headers, publish each tab as CSV, fork this repository, replace both feed URLs and public source links, and deploy your fork with GitHub Pages. The guide includes account, fork, Google publishing, and GitHub Pages documentation links.

## Publish with GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In **Settings > Pages**, select **Deploy from a branch**.
3. Select the `main` branch and `/ (root)`, then save.

Each page load reads the current published sheet. Update the sheet and refresh the dashboard to see new data.