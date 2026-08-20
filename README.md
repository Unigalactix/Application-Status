# Application Tracker Dashboard

A static, responsive dashboard that loads the latest job application data directly from a published Google Sheets CSV. GitHub Pages serves the site; no authentication, API key, or scheduled workflow is required.

## Data source

The live CSV is configured in `app.js` with the published URL for sheet tab `1438332888`. The dashboard fetches it with browser caching disabled whenever the page opens and detects the header row after the sheet title.

Because this is a **Publish to web** URL, every field in the CSV is publicly accessible to anyone with the URL. Keep sensitive information out of the published tab.

The current tracker columns are:

- `Company`
- `Role / Title`
- `Application ID`
- `Current Status`
- `Application Date`
- `Last Status Update`
- `Location / Work Mode`
- `Portal / Source`
- `Action Required / Next Steps`
- `Notes / Verification Evidence`

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