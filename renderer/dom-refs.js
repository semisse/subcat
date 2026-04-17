// ── Shared DOM Element Caches + Global State ───────────────────────────────
// Loaded before all page/component scripts so they can reference these globals.

document.querySelectorAll('.detail-view').forEach(v => v.classList.remove('active'));
const prListView = document.getElementById('prListView');
if (prListView) prListView.classList.add('active');

// My PRs page
const myPrsSection = document.getElementById('myPrsSection');
const myPrsList = document.getElementById('myPrsList');
const myPrsNav = document.getElementById('myPrsNav');
const prDetailNav = document.getElementById('prDetailNav');
const prDetailBack = document.getElementById('prDetailBack');
const prDetailTitle = document.getElementById('prDetailTitle');
const prDetailList = document.getElementById('prDetailList');

// Workflow runs view
const workflowRunsNav = document.getElementById('workflowRunsNav');
const workflowRunsBack = document.getElementById('workflowRunsBack');
const workflowRunsTitle = document.getElementById('workflowRunsTitle');
const workflowRunsList = document.getElementById('workflowRunsList');
const workflowRunsReportBtn = document.getElementById('workflowRunsReportBtn');
const workflowRunsRerunBtn = document.getElementById('workflowRunsRerunBtn');
const workflowRunsCancelAllBtn = document.getElementById('workflowRunsCancelAllBtn');
const workflowRunsPinBtn = document.getElementById('workflowRunsPinBtn');
const workflowRepeatInput = document.getElementById('workflowRepeatInput');

// Pending repeat totals: runId → repeatTotal (for workflow reruns)
const pendingRepeatTotals = new Map();

// Runs page / watch dock
const addBtn = document.getElementById('addBtn');
const watchDockTrigger = document.getElementById('watchDockTrigger');
const urlFormClose = document.getElementById('urlFormClose');
const urlForm = document.getElementById('urlForm');
const urlInput = document.getElementById('urlInput');
const repeatInput = document.getElementById('repeatInput');
const watchBtn = document.getElementById('watchBtn');
const cancelBtn = document.getElementById('cancelBtn');
const runsList = document.getElementById('runsList');

// Dashboard sections
const sectionMyPrs = document.getElementById('sectionMyPrs');
const sectionRuns = document.getElementById('sectionRuns');
const sectionWorkflows = document.getElementById('sectionWorkflows');
const sectionMyPrsItems = document.getElementById('sectionMyPrsItems');
const sectionRunsItems = document.getElementById('sectionRunsItems');
const sectionWorkflowsItems = document.getElementById('sectionWorkflowsItems');
const sectionPinned = document.getElementById('sectionPinned');
const sectionPinnedItems = document.getElementById('sectionPinnedItems');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const loadingText = document.getElementById('loadingText');
const errorContainer = document.getElementById('errorContainer');

// Auth / profile
const logoutBtn = document.getElementById('logoutBtn');
const authAvatar = document.getElementById('authAvatar');
const authUsername = document.getElementById('authUsername');
const authEmail = document.getElementById('authEmail');
const appVersion = document.getElementById('appVersion');

// ── Shared App State ────────────────────────────────────────────────────────

const watchedRuns = new Map();
let featureFlags = {};
