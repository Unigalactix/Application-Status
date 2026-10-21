# Repository guidance

## Architecture

- This is a static GitHub Pages dashboard built with plain HTML, CSS, and browser JavaScript. There is no package manifest, bundler, backend, or automated test suite.
- [index.html](index.html) defines the page, controls, and dialogs; [styles.css](styles.css) defines responsive layouts and light/dark theme tokens; [app.js](app.js) handles data loading, normalization, metrics, rendering, and interactions.
- Chart.js, Papa Parse, and Lucide load from pinned CDN URLs in the HTML. Preserve deferred script ordering and existing DOM IDs used by JavaScript.
- See [README.md](README.md) for feed schemas, metric definitions, local preview, and GitHub Pages publishing.

## Data and behavior contracts

- The published Google Sheets CSV feeds are the source of truth. `DATA_SOURCE` is the application tracker; `JOBS_SOURCE` is a separate job-posting feed. An iframe or `pubhtml` link is a viewing URL, not the CSV fetch endpoint.
- Keep the feeds independent: failure of one must not prevent the other from rendering. Preserve explicit loading, empty, invalid-schema, and request-error states.
- Reuse column aliases, CSV header detection, normalization, and date helpers when adding fields. Treat missing values as unavailable, not zero or a successful outcome.
- Calculate application metrics and views from normalized, deduplicated records. Preserve merging by non-placeholder application ID, slash-separated primary-ID aliases, newest status data, and earliest application dates; do not merge unidentified rows by company alone.
- Preserve explicit sheet follow-up dates and the most recent sheet/browser completion date. Keep closed applications out of the action queue.
- Stars, followed-up actions, theme preferences, and locally applied-job markers are browser-local state, not writes to Google Sheets or cross-device synchronization.
- Freshness is currently estimated from scheduled 8 AM / 8 PM updates in the visitor's local time zone. Do not describe the countdown as proof of a successful sheet refresh or claim precise status history from date-only fields.
- Define denominators and time windows for new metrics. Distinguish current-stage counts from historical conversions and inferred categories from recorded evidence.

## Implementation conventions

- Keep changes focused and framework-free unless a larger architecture change is explicitly requested. Reuse existing rendering, filtering, dialog, and storage helpers.
- Preserve consistent results across KPI drill-downs, daily focus, insights, application filters, pagination, and job-posting matching.
- Use existing CSS variables for colors and shared layout classes. Support both themes and narrow screens without hiding essential information.
- Preserve semantic controls, accessible labels, live status messages, keyboard interaction, and dialog dismissal/focus behavior.
- Treat all sheet values as untrusted text. Prefer `textContent` and DOM construction; do not interpolate feed content into HTML.
- Reuse existing URL validation for external actions and allow only absolute HTTP(S) destinations. Keep `rel="noopener noreferrer"` on new-tab links. Do not turn flattened hyperlink labels into guessed URLs.
- Do not commit downloaded tracker rows, recruiter contact details, email URLs, credentials, or browser storage dumps. A published sheet is public even when the UI hides a column.
- Update the README when changing source columns, metric definitions, persistence behavior, dependencies, or preview/deployment steps.

## Validation

- Documentation-only changes: check links and run `git diff --check`.
- For JavaScript changes, run `node --check app.js`; there is no npm build or test command.
- Preview from the repository root with `python -m http.server 8000`, then open `http://localhost:8000`. Do not rely on `file://` for CSV fetching.
- For UI or behavior changes, verify both feeds, KPI counts/drill-downs, follow-up actions, search and combined filters, pagination, disclosure controls, dialogs, theme switching, and a narrow viewport as relevant.
- For data-logic changes, exercise missing fields, duplicate/placeholder IDs, date boundaries, unavailable salary/referral data, invalid external links, malformed CSV, and independent feed failures as relevant. Use synthetic records rather than committing live personal data.
- Inspect browser errors and confirm any temporary local server is stopped when validation is finished.

## Git and publishing

- GitHub Pages publishes `main` from the repository root; a push there can update the live site.
- Stage only task-related files and preserve unrelated work. Commit or push only when requested, and verify the target remote, branch, and authenticated account first.
