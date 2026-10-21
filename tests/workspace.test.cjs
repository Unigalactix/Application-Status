const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function context() {
  const element = {
    addEventListener() {},
    value: "",
    getAttribute() { return "false"; }
  };
  const selectors = new Map();
  const document = {
    querySelector(selector) { return selectors.get(selector) || element; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const sandbox = vm.createContext({
    console, URL, URLSearchParams, Date, Intl, Map, Set,
    localStorage: { getItem() { return null; } },
    document, window: { addEventListener() {} }
  });
  for (const file of ["app.js", "workspace.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
  }
  const run = (code) => vm.runInContext(code, sandbox);
  return { run, selectors };
}

test("current stages partition active interviews and exclude terminal outcomes", () => {
  const { run } = context();
  const cases = [
    ["Under Review", "Technical Assessment", "assessment"],
    ["Under Review", "Online Test", "assessment"],
    ["Under Review", "Recruiter Screen Outreach", "screening"],
    ["Action Required", "Virtual Agent Screen", "screening"],
    ["Under Review", "Technical Interview", "screening"],
    ["Under Review", "Final Interview", "final"],
    ["Under Review", "On-site Panel", "final"],
    ["Declined", "Final Interview", "rejected"],
    ["Inactive / Closed", "Technical Assessment", "closed"],
    ["Offer", "Final Interview", "offer"],
    ["Action Required", "Identity Verification Required", "action"],
    ["Application Received", "Application Submitted", "applied"],
    ["Unknown", "Application Submitted", "unknown"]
  ];
  for (const [status, interviewStage, expected] of cases) {
    assert.equal(run(`currentStage(${JSON.stringify({ status, interviewStage })})`), expected);
  }
});

test("source aliases group without combining direct LinkedIn and Easy Apply", () => {
  const { run } = context();
  assert.equal(run('canonicalSource("LinkedIn (Easy Apply)")'), "LinkedIn Easy Apply");
  assert.equal(run('canonicalSource(" linkedin easy apply ")'), "LinkedIn Easy Apply");
  assert.equal(run('canonicalSource("LinkedIn")'), "LinkedIn");
  assert.equal(run('canonicalSource("Amazon.jobs")'), "Amazon Jobs");
  assert.equal(run('canonicalSource("")'), "Not provided");
  assert.equal(run('canonicalSource("N/A")'), "Not provided");
});

test("ISO dates reject rollover and seven-day cohorts include today and six prior dates", () => {
  const { run } = context();
  assert.equal(run('parseDate("2026-02-30")'), null);
  assert.equal(run('parseDate("2026-13-01")'), null);
  assert.equal(run('localDateKey(parseDate("2024-02-29"))'), "2024-02-29");
  assert.equal(run('localDateKey(dateScopeBounds("7", "", "", new Date(2026, 9, 21)).from)'), "2026-10-15");
  assert.equal(run('localDateKey(dateScopeBounds("7", "", "", new Date(2026, 9, 21)).to)'), "2026-10-21");
  assert.equal(run('dateScopeBounds("all", "", "").from'), null);
});

test("age buckets have exact nonoverlapping boundaries and exclude missing dates", () => {
  const { run } = context();
  run('var now = new Date(2026, 9, 21);');
  for (const [days, bucket] of [[0, "0-7"], [7, "0-7"], [8, "8-14"], [14, "8-14"], [15, "15-30"], [30, "15-30"], [31, "31+"]]) {
    assert.equal(run(`matchesAge({parsedLastUpdate:addDays(now, -${days})}, "${bucket}", now)`), true);
    assert.equal(run(`["0-7","8-14","15-30","31+"].filter(b=>matchesAge({parsedLastUpdate:addDays(now, -${days})},b,now)).length`), 1);
  }
  assert.equal(run('matchesAge({parsedLastUpdate:null,parsedDate:null}, "0-7", now)'), false);
  assert.equal(run("daysSince(new Date(2026,2,8),new Date(2026,2,9))"), 1);
  assert.equal(run("daysSince(new Date(2026,10,1),new Date(2026,10,2))"), 1);
});

test("follow-ups respect explicit dates, completions and closed outcomes", () => {
  const { run } = context();
  run(`var now = new Date(2026,9,21);
    var app = {applicationId:"TEST",company:"Example",role:"Engineer",rawDate:"2026-10-01",
      status:"Under Review",nextAction:"",parsedDate:parseDate("2026-10-01"),
      parsedLastUpdate:parseDate("2026-10-01"),parsedFollowUpDate:parseDate("2026-10-21"),
      parsedLastFollowUpDate:null};`);
  assert.equal(run('matchesFollowUpQueue(app,"today",now)'), true);
  assert.equal(run('matchesFollowUpQueue(app,"overdue",now)'), false);
  run('state.followUpLog[applicationKey(app)]="2026-10-21";');
  assert.equal(run('localDateKey(followUpDueDate(app,now))'), "2026-10-28");
  assert.equal(run('matchesFollowUpQueue(app,"upcoming",now)'), true);
  assert.equal(run('matchesFollowUpQueue({...app,status:"Declined"},"all",now)'), false);
  assert.equal(run('matchesFollowUpQueue({...app,status:"Action Required"},"due",now)'), true);
});

test("duplicate IDs merge before counts; placeholder IDs remain separate", () => {
  const { run } = context();
  run(`var rows = [
    {"Company":"Example","Role / Title":"Engineer","Application ID":"123 / alias","Current Status":"Under Review","Application Date":"2026-10-01","Last Status Update":"2026-10-01"},
    {"Company":"Example","Role / Title":"Engineer","Application ID":"123","Current Status":"Declined","Application Date":"2026-10-05","Last Status Update":"2026-10-20"},
    {"Company":"Example","Role / Title":"Engineer","Application ID":"N/A"},
    {"Company":"Example","Role / Title":"Engineer","Application ID":"N/A"}
  ]; var apps = normalizeRows(rows);`);
  assert.equal(run("apps.length"), 3);
  assert.equal(run('apps.find(a=>a.applicationId==="123").status'), "Declined");
  assert.equal(run('localDateKey(apps.find(a=>a.applicationId==="123").parsedDate)'), "2026-10-01");
});

test("change snapshots establish baseline and report only actual new/changed records", () => {
  const { run } = context();
  run(`var app = {applicationId:"TEST",company:"Example",role:"Engineer",rawDate:"2026-10-01",status:"Under Review",interviewStage:"Application Submitted",rawLastUpdate:"2026-10-01"};
    var before = createSnapshot([app]);`);
  assert.equal(run("compareSnapshots(null,[app]).length"), 0);
  assert.equal(run("compareSnapshots(before,[app]).length"), 0);
  assert.equal(run('compareSnapshots(before,[{...app,status:"Declined"}]).length'), 1);
  assert.equal(run('compareSnapshots(before,[{...app,applicationId:"NEW"}])[0].kind'), "New application");
  assert.equal(run('compareSnapshots(before,[{...app,interviewStage:"Recruiter Screen"}]).length'), 1);
  assert.equal(run('validSnapshot({version:1,records:[],capturedAt:"invalid"})'), false);
  assert.equal(run('JSON.stringify(before).includes("company")'), false);
});

test("external actions reject script, relative and flattened hyperlink labels", () => {
  const { run } = context();
  assert.equal(run('validExternalUrl("javascript:alert(1)")'), null);
  assert.equal(run('validExternalUrl("/jobs")'), null);
  assert.equal(run('validExternalUrl("Apply Here")'), null);
  assert.equal(run('validExternalUrl("https://example.com/jobs")'), "https://example.com/jobs");
});

test("CSV header detection rejects wrong feeds and accepts a header-only source", () => {
  const { run } = context();
  assert.equal(run('rowsFromCsvMatrix([["Wrong","Columns"],["x","y"]])'), null);
  assert.equal(run('rowsFromCsvMatrix([["Company","Role / Title","Current Status"]]).length'), 0);
  assert.equal(run('jobRowsFromCsvMatrix([["Job Title","Company"]]).length'), 0);
});

test("custom date scope is inclusive and list filters do not change KPI cohort", () => {
  const { run, selectors } = context();
  selectors.set("#dateRange", { value: "custom" });
  selectors.set("#dateFrom", { value: "2026-10-01" });
  selectors.set("#dateTo", { value: "2026-10-03" });
  run(`state.applications = [
    {parsedDate:parseDate("2026-09-30")},
    {parsedDate:parseDate("2026-10-01")},
    {parsedDate:parseDate("2026-10-03")},
    {parsedDate:parseDate("2026-10-04")},
    {parsedDate:null}
  ];`);
  assert.equal(run("scopedApplications().length"), 2);
  selectors.set("#dateRange", { value: "all" });
  assert.equal(run("scopedApplications().length"), 5);
});

test("invalid saved views and snapshots cannot reach filter restoration", () => {
  const { run } = context();
  assert.equal(run('validSavedView(null)'), null);
  assert.equal(Boolean(run('validSavedView({name:"broken",filters:{columns:123}})')), false);
  assert.equal(run('validSnapshot({version:1,capturedAt:"2026-10-01",records:{x:{status:123}}})'), false);
});

test("storage write failures are explicitly surfaced", () => {
  const { run, selectors } = context();
  const status = { textContent: "" };
  selectors.set("#workspaceStatus", status);
  run('localStorage.setItem = () => { throw new Error("Quota exceeded"); };');
  assert.equal(run('persistLocal("synthetic-test",{x:1})'), false);
  assert.match(status.textContent, /will not survive a reload/);
});
