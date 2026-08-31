# Application Tracker Dashboard

A static, responsive dashboard that loads job application tracking data and new job postings directly from published Google Sheets CSV feeds. GitHub Pages serves the site; no authentication, API key, or scheduled workflow is required.

## Data source

The application and job-posting CSV feeds are configured in `app.js`. The dashboard fetches both with browser caching disabled whenever the page opens. Each feed loads independently, so a job-posting feed failure does not prevent the application tracker from loading.

The header estimates data age from the sheet's scheduled updates at 8:00 AM and 8:00 PM and shows a live countdown to the next update. Both times use the visitor's local time zone. Selecting the freshness indicator opens a summary of applications and status activity dated on the latest update day. The age is an estimate, and the summary cannot distinguish the morning and evening runs because the published CSV provides dates without timestamps.

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

- New job postings with search, work-type filtering, newest/best-match sorting, resume-alignment details, referral leads, and safe application actions
- **Applied** labels for job postings already present in the application tracker or selected through **Apply now**; applied postings sort below new opportunities
- Pipeline totals with direct application drill-downs
- A single 30-day application-pace chart for spotting consistency and gaps
- A single interview-progression funnel with terminal outcomes reported separately
- Offer compensation details inside the Offers KPI popup when salary bands are available
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

Missing data is reported explicitly. For example, referral lift is shown as `N/A` until at least one referred application exists, and the compensation view remains empty while salary bands are blank or `N/A`.

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

## Publish with GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In **Settings > Pages**, select **Deploy from a branch**.
3. Select the `main` branch and `/ (root)`, then save.

Each page load reads the current published sheet. Update the sheet and refresh the dashboard to see new data.