# Application Tracker Dashboard

A static, responsive dashboard that loads the latest job application data directly from a published Google Sheets CSV. GitHub Pages serves the site; no authentication, API key, or scheduled workflow is required.

## Data source

The live CSV is configured in `app.js` with the published URL for sheet tab `1438332888`. The dashboard fetches it with browser caching disabled whenever the page opens and detects the header row after the sheet title.

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
- `Notes / Verification Evidence`

## Dashboard views

- Pipeline totals and an interactive status chart
- Daily application volume for the latest 30 days
- Interview-stage funnel with terminal outcomes reported separately
- Referral cohort sizes, interview rates, and referral lift when both cohorts exist
- Compensation details for active roles with meaningful salary bands
- Pipeline health, stale-record detection, inactivity aging, and follow-up priorities
- Employer response and interview conversion across the complete portfolio
- Source, company, and role concentration rankings with interview conversion
- Action Center checks for overdue applications and missing analysis fields
- Rolling weekly cadence compared with the prior seven days and a configurable application goal
- Search, status, role concentration, and exact-role filters
- Searchable multi-select slicers on every dataset column
- Complete 15-column dataset table with 10-row pagination

Missing data is reported explicitly. For example, referral lift is shown as `N/A` until at least one referred application exists, and the compensation view remains empty while salary bands are blank or `N/A`.

Insight definitions:

- An employer response means screening/interview/offer progress or a terminal employer decision.
- Inactivity uses `Last Status Update`, falling back to `Application Date` when needed.
- Stale applications are active records with more than 14 days of inactivity.
- Weekly cadence uses rolling seven-day windows ending today. The default application goal is configured by `WEEKLY_APPLICATION_GOAL` in `app.js`.
- Stage-duration, resume-effectiveness, referral-lift, and compensation comparisons remain unavailable until their source columns contain meaningful data.

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