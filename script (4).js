// ─── Supabase 設定 ────────────────────────────────────────────────
// 請將下方兩個值換成你自己的 Supabase 專案資料
const SUPABASE_URL = "https://uqmrjaxyiqsdcrbgunzb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxbXJqYXh5aXFzZGNyYmd1bnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDYzODcsImV4cCI6MjA5MzEyMjM4N30.65d-vaXUIxu1gwmXicvrOncMWlEvSRNhg9gxplxaoGM";

const TRIP_ID = "singapore-trip-2026"; // 共用的行程 ID，所有使用者共享同一筆資料

// ─── App 常數 ─────────────────────────────────────────────────────
const STORAGE_KEY = "singaporeTripPlanner.v1";
const NOTES_TAB_ID = "notes";
const ACCOUNTING_TAB_ID = "accounting";

const defaultTrip = {
  activeDayId: "day-1",
  activeTab: "day-1",
  notes: [],
  members: [],
  expenses: [],
  days: [
    {
      id: "day-1",
      label: "Day1",
      theme: "抵達＋市區",
      totalCost: "",
      items: [
        createItem("14:00", "抵達新加坡", "", ""),
        createItem("16:00", "魚尾獅公園（Merlion Park）", "", ""),
        createItem("17:30", "濱海灣花園（Garden by the Bay）", "", ""),
        createItem("19:30", "老巴剎（Lau Pa Sat）晚餐", "", ""),
        createItem("20:30", "金沙燈光秀", "", "")
      ]
    },
    {
      id: "day-2",
      label: "Day2",
      theme: "聖淘沙／環球影城",
      totalCost: "",
      items: [
        createItem("09:00", "出發前往聖淘沙", "", ""),
        createItem("10:00", "環球影城（Universal Studios Singapore）", "", ""),
        createItem("18:00", "晚餐（VivoCity）", "", ""),
        createItem("19:30", "海灘散步", "", "")
      ]
    },
    {
      id: "day-3",
      label: "Day3",
      theme: "文化＋購物",
      totalCost: "",
      items: [
        createItem("09:30", "阿拉伯區（Haji Lane）", "", ""),
        createItem("11:30", "小印度（Little India）", "", ""),
        createItem("13:00", "Tekka Centre午餐", "", ""),
        createItem("15:00", "牛車水（Chinatown）", "", ""),
        createItem("18:00", "Orchard Road購物", "", "")
      ]
    },
    {
      id: "day-4",
      label: "Day4",
      theme: "咖啡＋回程",
      totalCost: "",
      items: [
        createItem("09:00", "Tiong Bahru咖啡區", "", ""),
        createItem("11:30", "午餐", "", ""),
        createItem("14:00", "前往機場", "", ""),
        createItem("16:00", "Jewel樟宜機場", "", "")
      ]
    }
  ]
};

// ─── Supabase 初始化 ──────────────────────────────────────────────
let supabaseClient = null;
let realtimeChannel = null;
// 用來防止自己發出的廣播又觸發自己更新
let isSavingToSupabase = false;

function initSupabase() {
  if (typeof window.supabase === "undefined") {
    console.warn("[Sync] Supabase SDK 未載入，僅使用 localStorage 模式");
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[Sync] Supabase 已初始化");
}

// ─── 即時同步 ─────────────────────────────────────────────────────
function subscribeRealtime() {
  if (!supabaseClient) return;

  realtimeChannel = supabaseClient
    .channel(`trip-sync:${TRIP_ID}`)
    .on("broadcast", { event: "trip-updated" }, (payload) => {
      if (isSavingToSupabase) return; // 忽略自己發出的事件
      const incoming = payload.payload?.trip;
      if (!incoming) return;

      // 保留本機的 UI 狀態（active tab），合併遠端資料
      const localActiveTab = trip.activeTab;
      const localActiveDayId = trip.activeDayId;

      trip = normalizeTrip(incoming);
      trip.activeTab = localActiveTab;
      trip.activeDayId = localActiveDayId;

      // 同步到 localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
      render();
      showSyncIndicator();
    })
    .subscribe((status) => {
      console.log("[Sync] Realtime 狀態：", status);
      updateSyncStatus(status);
    });
}

function broadcastTrip() {
  if (!realtimeChannel) return;
  isSavingToSupabase = true;
  realtimeChannel.send({
    type: "broadcast",
    event: "trip-updated",
    payload: { trip }
  }).finally(() => {
    // 短暫延遲後恢復，確保自己的回音不會觸發
    setTimeout(() => { isSavingToSupabase = false; }, 200);
  });
}

// 同步狀態指示器
function updateSyncStatus(status) {
  const indicator = document.querySelector("#syncIndicator");
  if (!indicator) return;

  if (status === "SUBSCRIBED") {
    indicator.className = "sync-indicator connected";
    indicator.title = "已連線，即時同步中";
  } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
    indicator.className = "sync-indicator error";
    indicator.title = "同步連線中斷，嘗試重連…";
  } else {
    indicator.className = "sync-indicator connecting";
    indicator.title = "正在連線…";
  }
}

function showSyncIndicator() {
  const indicator = document.querySelector("#syncIndicator");
  if (!indicator) return;
  indicator.classList.add("pulse");
  setTimeout(() => indicator.classList.remove("pulse"), 800);
}

// ─── 第一次載入：從 Supabase 取得最新資料 ──────────────────────────
async function fetchTripFromSupabase() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("trips")
      .select("data")
      .eq("id", TRIP_ID)
      .single();
    if (error) {
      console.warn("[Sync] 從 Supabase 取得資料失敗：", error.message);
      return null;
    }
    return data?.data || null;
  } catch (err) {
    console.warn("[Sync] 網路錯誤：", err);
    return null;
  }
}

async function saveTripToSupabase() {
  if (!supabaseClient) return;
  try {
    await supabaseClient
      .from("trips")
      .upsert({ id: TRIP_ID, data: trip, updated_at: new Date().toISOString() });
  } catch (err) {
    console.warn("[Sync] 儲存到 Supabase 失敗：", err);
  }
}

// ─── 狀態 ─────────────────────────────────────────────────────────
let trip = loadTrip(); // 先用 localStorage 做初始值
let editingState = null;
let draggedItemId = null;
let editingExpenseId = null;

const dayTabs = document.querySelector("#dayTabs");
const dayView = document.querySelector("#dayView");
const itemModal = document.querySelector("#itemModal");
const itemForm = document.querySelector("#itemForm");
const modalTitle = document.querySelector("#modalTitle");
const closeModalBtn = document.querySelector("#closeModalBtn");
const cancelModalBtn = document.querySelector("#cancelModalBtn");
const timeInput = document.querySelector("#timeInput");
const placeInput = document.querySelector("#placeInput");
const descriptionInput = document.querySelector("#descriptionInput");
const notesInput = document.querySelector("#notesInput");
const toast = document.querySelector("#toast");

// ─── 啟動 ─────────────────────────────────────────────────────────
async function init() {
  render(); // 先用 localStorage 資料渲染，快速顯示畫面

  initSupabase();

  if (supabaseClient) {
    // 從 Supabase 取最新資料
    const remoteData = await fetchTripFromSupabase();
    if (remoteData) {
      const localActiveTab = trip.activeTab;
      const localActiveDayId = trip.activeDayId;
      trip = normalizeTrip(remoteData);
      trip.activeTab = localActiveTab;
      trip.activeDayId = localActiveDayId;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
      render();
    }

    subscribeRealtime();
  }
}

init();

// ─── Modal ────────────────────────────────────────────────────────
closeModalBtn.addEventListener("click", closeModal);
cancelModalBtn.addEventListener("click", closeModal);

itemForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const itemData = {
    time: timeInput.value,
    place: placeInput.value.trim(),
    description: descriptionInput.value.trim(),
    notes: notesInput.value.trim()
  };

  if (!itemData.time || !itemData.place) {
    showToast("請填寫時間與地點名稱");
    return;
  }

  const day = getActiveDay();
  if (!day) return;

  if (editingState?.itemId) {
    // 編輯既有行程
    const item = day.items.find((entry) => entry.id === editingState.itemId);
    if (item) Object.assign(item, itemData);
  } else {
    // 新增行程
    day.items.push(createItem(itemData.time, itemData.place, itemData.description, itemData.notes));
  }

  // 依時間自動排序（空白時間排最後）
  day.items.sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  saveAndRender();
  closeModal();
  showToast("行程已儲存");
});

dayTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab-id]");
  if (!button) return;

  trip.activeTab = button.dataset.tabId;
  if (isDayTab(trip.activeTab)) {
    trip.activeDayId = trip.activeTab;
  }
  editingExpenseId = null;
  saveAndRender();
});

dayView.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const action = actionButton.dataset.action;

  if (action === "toggle-note-menu") {
    const noteElement = actionButton.closest("[data-note-id]");
    if (noteElement) toggleNoteMenu(noteElement, actionButton);
    return;
  }

  if (action === "toggle-expense-menu") {
    const expenseElement = actionButton.closest("[data-expense-id]");
    if (expenseElement) toggleExpenseMenu(expenseElement, actionButton);
    return;
  }

  if (action === "edit-note") {
    const noteElement = actionButton.closest("[data-note-id]");
    closeNoteMenus();
    if (noteElement) editNote(noteElement.dataset.noteId);
    return;
  }

  if (action === "delete-note") {
    const noteElement = actionButton.closest("[data-note-id]");
    closeNoteMenus();
    if (noteElement) deleteNote(noteElement.dataset.noteId);
    return;
  }

  if (action === "delete-member") {
    const memberElement = actionButton.closest("[data-member-id]");
    if (memberElement) deleteMember(memberElement.dataset.memberId);
    return;
  }

  if (action === "edit-expense") {
    const expenseElement = actionButton.closest("[data-expense-id]");
    closeExpenseMenus();
    if (expenseElement) {
      editingExpenseId = expenseElement.dataset.expenseId;
      render();
      // 錨點到編輯支出區塊
      setTimeout(() => {
        const target = dayView.querySelector("[data-expense-form]");
        if (target) target.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
    return;
  }

  if (action === "cancel-expense-edit") {
    editingExpenseId = null;
    render();
    return;
  }

  if (action === "delete-expense") {
    const expenseElement = actionButton.closest("[data-expense-id]");
    if (expenseElement) deleteExpense(expenseElement.dataset.expenseId);
    return;
  }

  const itemElement = actionButton.closest("[data-item-id]");
  const itemId = itemElement?.dataset.itemId;
  const day = getActiveDay();
  if (!day) return;

  if (action === "toggle-item" && itemElement) {
    const isOpen = itemElement.classList.toggle("open");
    itemElement
      .querySelectorAll("[data-action='toggle-item']")
      .forEach((button) => button.setAttribute("aria-expanded", isOpen.toString()));
    return;
  }

  if (action === "edit-item" && itemId) {
    const item = day.items.find((entry) => entry.id === itemId);
    if (item) openModal(item);
    return;
  }

  if (action === "delete-item" && itemId) {
    deleteItem(day, itemId);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".note-menu-wrap")) {
    closeNoteMenus();
  }
  if (!event.target.closest(".expense-menu-wrap")) {
    closeExpenseMenus();
  }
});

window.addEventListener("resize", closeNoteMenus);
window.addEventListener("scroll", closeNoteMenus, true);

dayView.addEventListener("submit", (event) => {
  const noteForm = event.target.closest("[data-note-form]");
  if (noteForm) {
    event.preventDefault();
    addNote(noteForm);
    return;
  }

  const memberForm = event.target.closest("[data-member-form]");
  if (memberForm) {
    event.preventDefault();
    addMember(memberForm);
    return;
  }

  const expenseForm = event.target.closest("[data-expense-form]");
  if (expenseForm) {
    event.preventDefault();
    saveExpenseFromForm(expenseForm);
  }
});

dayView.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-action='complete-item']");
  if (!checkbox) return;

  const day = getActiveDay();
  const itemElement = checkbox.closest("[data-item-id]");
  const item = day?.items.find((entry) => entry.id === itemElement?.dataset.itemId);
  if (!item) return;

  item.completed = checkbox.checked;
  saveAndRender();
});

dayView.addEventListener("dragstart", (event) => {
  const itemElement = event.target.closest("[data-item-id]");
  if (!itemElement || !isDayTab(trip.activeTab)) return;
  draggedItemId = itemElement.dataset.itemId;
  itemElement.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedItemId);
});

dayView.addEventListener("dragend", (event) => {
  event.target.closest("[data-item-id]")?.classList.remove("dragging");
  dayView.querySelectorAll(".drag-over").forEach((entry) => entry.classList.remove("drag-over"));
  draggedItemId = null;
});

dayView.addEventListener("dragover", (event) => {
  const target = event.target.closest("[data-item-id]");
  if (!target || target.dataset.itemId === draggedItemId || !isDayTab(trip.activeTab)) return;
  event.preventDefault();
  target.classList.add("drag-over");
});

dayView.addEventListener("dragleave", (event) => {
  event.target.closest("[data-item-id]")?.classList.remove("drag-over");
});

dayView.addEventListener("drop", (event) => {
  const target = event.target.closest("[data-item-id]");
  if (!target || !draggedItemId || target.dataset.itemId === draggedItemId || !isDayTab(trip.activeTab)) return;
  event.preventDefault();
  target.classList.remove("drag-over");
  reorderItems(draggedItemId, target.dataset.itemId);
});

// ─── 資料工廠 ─────────────────────────────────────────────────────
function createItem(time, place, description, notes) {
  return {
    id: `item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time,
    place,
    description,
    notes,
    completed: false
  };
}

function createNote(content) {
  return {
    id: `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    content
  };
}

function createMember(name) {
  return {
    id: `member-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name
  };
}

function createExpense(data) {
  return {
    id: `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: data.title,
    amount: data.amount,
    payerId: data.payerId,
    participantIds: data.participantIds,
    notes: data.notes
  };
}

// ─── 儲存與讀取 ───────────────────────────────────────────────────
function loadTrip() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return cloneData(defaultTrip);

  try {
    const parsed = JSON.parse(stored);
    return normalizeTrip(parsed);
  } catch {
    return cloneData(defaultTrip);
  }
}

function normalizeTrip(data) {
  const source = data && typeof data === "object" ? data : {};
  const normalized = {
    activeDayId: typeof source.activeDayId === "string" ? source.activeDayId : "",
    activeTab: typeof source.activeTab === "string" ? source.activeTab : "",
    notes: Array.isArray(source.notes) ? source.notes : [],
    members: Array.isArray(source.members) ? source.members : source.accounting?.members || [],
    expenses: Array.isArray(source.expenses) ? source.expenses : source.accounting?.expenses || [],
    days: Array.isArray(source.days) ? source.days : []
  };

  normalized.notes = normalized.notes.map((note) => ({
    id: typeof note.id === "string" ? note.id : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    content: typeof note.content === "string" ? note.content : ""
  }));

  normalized.members = normalized.members.map((member) => ({
    id: typeof member.id === "string" ? member.id : `member-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: typeof member.name === "string" ? member.name : ""
  })).filter((member) => member.name);

  normalized.expenses = normalized.expenses.map((expense) => ({
    id: typeof expense.id === "string" ? expense.id : `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: typeof expense.title === "string" ? expense.title : "",
    amount: typeof expense.amount === "string" || typeof expense.amount === "number" ? String(expense.amount) : "",
    payerId: typeof expense.payerId === "string" ? expense.payerId : "",
    participantIds: Array.isArray(expense.participantIds) ? expense.participantIds.filter((id) => typeof id === "string") : [],
    notes: typeof expense.notes === "string" ? expense.notes : ""
  }));

  normalized.days = normalized.days.map((day, index) => ({
    id: typeof day.id === "string" ? day.id : `day-${index + 1}`,
    label: typeof day.label === "string" ? day.label : `Day${index + 1}`,
    theme: typeof day.theme === "string" ? day.theme : "",
    totalCost: typeof day.totalCost === "string" || typeof day.totalCost === "number" ? String(day.totalCost) : "",
    items: Array.isArray(day.items)
      ? day.items.map((item) => ({
          id: typeof item.id === "string" ? item.id : `item-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          time: typeof item.time === "string" ? item.time : "",
          place: typeof item.place === "string" ? item.place : "",
          description: typeof item.description === "string" ? item.description : "",
          notes: typeof item.notes === "string" ? item.notes : "",
          completed: Boolean(item.completed)
        }))
      : []
  }));

  if (!normalized.days.length) {
    return cloneData(defaultTrip);
  }

  if (!normalized.days.some((day) => day.id === normalized.activeDayId)) {
    normalized.activeDayId = normalized.days[0].id;
  }

  if (!normalized.activeTab) {
    normalized.activeTab = normalized.activeDayId;
  }

  if (!isSpecialTab(normalized.activeTab) && !normalized.days.some((day) => day.id === normalized.activeTab)) {
    normalized.activeTab = normalized.activeDayId;
  }

  return normalized;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function saveTrip() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
}

// 儲存：寫 localStorage + 廣播 Realtime + 定期寫 Supabase DB
let saveToDbTimer = null;
function saveAndRender() {
  saveTrip();
  render();
  // 即時廣播給其他在線使用者
  broadcastTrip();
  // 防抖：2 秒後寫入 Supabase DB（作為持久備份，讓新使用者載入時可取得最新資料）
  clearTimeout(saveToDbTimer);
  saveToDbTimer = setTimeout(() => {
    saveTripToSupabase();
  }, 2000);
}

// ─── 渲染 ─────────────────────────────────────────────────────────
function render() {
  renderTabs();
  if (trip.activeTab === NOTES_TAB_ID) {
    renderNotesPage();
  } else if (trip.activeTab === ACCOUNTING_TAB_ID) {
    renderAccountingPage();
  } else {
    renderActiveDay();
  }
}

function renderTabs() {
  const dayButtons = trip.days
    .map(
      (day) => `
        <button
          class="tab-button ${day.id === trip.activeTab ? "active" : ""}"
          type="button"
          role="tab"
          aria-selected="${day.id === trip.activeTab}"
          data-tab-id="${escapeAttribute(day.id)}"
        >
          ${escapeHtml(day.label)}
          <span class="tab-emoji" aria-hidden="true">${getDayEmoji(day)}</span>
          <span class="tab-count">${day.items.length}</span>
        </button>
      `
    )
    .join("");

  const notesButton = `
    <button
      class="tab-button ${trip.activeTab === NOTES_TAB_ID ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${trip.activeTab === NOTES_TAB_ID}"
      data-tab-id="${NOTES_TAB_ID}"
    >
      備註
      <span class="tab-emoji" aria-hidden="true">📝</span>
      <span class="tab-count">${trip.notes.length}</span>
    </button>
  `;

  const accountingButton = `
    <button
      class="tab-button ${trip.activeTab === ACCOUNTING_TAB_ID ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${trip.activeTab === ACCOUNTING_TAB_ID}"
      data-tab-id="${ACCOUNTING_TAB_ID}"
    >
      記帳
      <span class="tab-emoji" aria-hidden="true">💳</span>
      <span class="tab-count">${trip.expenses.length}</span>
    </button>
  `;

  dayTabs.innerHTML = dayButtons + notesButton + accountingButton;
}

function renderActiveDay() {
  const day = getActiveDay();
  if (!day) {
    dayView.innerHTML = "";
    return;
  }

  dayView.innerHTML = `
    <article class="day-card">
      <header class="day-card-header">
        <div class="day-title-wrap">
          <div class="day-title-row">
            <h2><span aria-hidden="true">${getDayEmoji(day)}</span> ${escapeHtml(day.label)}</h2>
            <span class="count-pill">${day.items.length} 個行程</span>
          </div>
          <div class="day-meta-row">
            <p class="day-theme">${getProgressText(day)}</p>
          </div>
        </div>
      </header>
      <div class="items-list">
        ${day.items.length ? day.items.map(renderItem).join("") : renderEmptyState()}
      </div>
      <div class="day-card-footer">
        <button class="primary-button add-item-btn" type="button" onclick="openAddItemModal()">＋ 新增行程</button>
      </div>
    </article>
  `;
}

function renderNotesPage() {
  dayView.innerHTML = `
    <article class="day-card notes-card">
      <header class="day-card-header">
        <div class="day-title-wrap">
          <div class="day-title-row">
            <h2><span aria-hidden="true">📝</span> 備註</h2>
            <span class="count-pill">${trip.notes.length} 條備註</span>
          </div>
          <p class="day-theme">把護照、交通卡、訂位或想買的小東西先放在這裡。</p>
        </div>
      </header>
      <div class="notes-panel">
        <form class="note-form" data-note-form>
          <label class="note-input-label">
            新增備註
            <textarea data-note-input rows="3" placeholder="例如：記得帶護照、買交通卡"></textarea>
          </label>
          <div class="note-form-actions">
            <button class="primary-button" type="submit">新增備註</button>
          </div>
        </form>
        <div class="notes-list">
          ${trip.notes.length ? trip.notes.map(renderNote).join("") : renderEmptyNotesState()}
        </div>
      </div>
    </article>
  `;
}

function renderAccountingPage() {
  const settlement = calculateSettlement();
  const editingExpense = getExpenseById(editingExpenseId);

  dayView.innerHTML = `
    <article class="day-card accounting-card">
      <header class="day-card-header">
        <div class="day-title-wrap">
          <div class="day-title-row">
            <h2><span aria-hidden="true">💳</span> 記帳</h2>
            <span class="count-pill">${trip.expenses.length} 筆支出</span>
          </div>
          <p class="day-theme">${trip.members.length} 位成員・自動平均分攤與結算</p>
        </div>
      </header>

      <section class="accounting-section">
        <div class="section-heading">
          <h3>成員</h3>
        </div>
        <form class="inline-form" data-member-form>
          <input data-member-input type="text" placeholder="輸入朋友名字" maxlength="20" />
          <button class="primary-button" type="submit">新增</button>
        </form>
        <div class="members-list">
          ${trip.members.length
            ? trip.members.map((member) => `
                <span class="member-tag" data-member-id="${escapeAttribute(member.id)}">
                  ${escapeHtml(member.name)}
                  <button class="member-remove" type="button" data-action="delete-member" aria-label="移除 ${escapeAttribute(member.name)}">×</button>
                </span>
              `).join("")
            : `<p class="muted-text">尚未新增成員</p>`}
        </div>
      </section>

      <section class="accounting-section">
        <div class="section-heading">
          <h3>${editingExpense ? "編輯支出" : "新增支出"}</h3>
        </div>
        <form class="expense-form" data-expense-form>
          <div class="form-grid">
            <label>
              支出名稱
              <input name="title" type="text" placeholder="例如：晚餐" required value="${editingExpense ? escapeAttribute(editingExpense.title) : ""}" />
            </label>
            <label>
              金額（$）
              <input name="amount" type="number" step="0.01" min="0" placeholder="0.00" required value="${editingExpense ? escapeAttribute(editingExpense.amount) : ""}" />
            </label>
            <label class="full">
              誰先付？
              <select name="payerId" required>
                <option value="">請選擇</option>
                ${trip.members.map((member) => `
                  <option value="${escapeAttribute(member.id)}" ${editingExpense?.payerId === member.id ? "selected" : ""}>
                    ${escapeHtml(member.name)}
                  </option>
                `).join("")}
              </select>
            </label>
            <fieldset class="full participant-fieldset">
              <legend>誰要分攤？</legend>
              <div class="participant-checks">
                ${trip.members.map((member) => `
                  <label class="participant-check">
                    <input
                      type="checkbox"
                      name="participantIds"
                      value="${escapeAttribute(member.id)}"
                      ${editingExpense?.participantIds.includes(member.id) ? "checked" : ""}
                    />
                    ${escapeHtml(member.name)}
                  </label>
                `).join("")}
                ${!trip.members.length ? `<p class="muted-text">請先新增成員</p>` : ""}
              </div>
            </fieldset>
            <label class="full">
              備註（選填）
              <input name="notes" type="text" placeholder="例如：含小費" value="${editingExpense ? escapeAttribute(editingExpense.notes) : ""}" />
            </label>
          </div>
          <div class="modal-actions">
            ${editingExpense ? `<button class="ghost-button" type="button" data-action="cancel-expense-edit">取消</button>` : ""}
            <button class="primary-button" type="submit">${editingExpense ? "更新支出" : "新增支出"}</button>
          </div>
        </form>
      </section>

      <section class="accounting-section">
        <div class="section-heading">
          <h3>支出紀錄</h3>
        </div>
        <div class="expenses-list">
          ${trip.expenses.length ? trip.expenses.map(renderExpense).join("") : renderEmptyExpenseState()}
        </div>
      </section>

      ${renderSettlementSection(settlement)}
    </article>
  `;
}

function renderExpense(expense) {
  const payerName = getMemberName(expense.payerId) || "未指定";
  const participantNames = expense.participantIds
    .map(getMemberName)
    .filter(Boolean);

  return `
    <article class="expense-item" data-expense-id="${escapeAttribute(expense.id)}">
      <div>
        <div class="expense-title-row">
          <h4>${escapeHtml(expense.title || "未命名支出")}</h4>
          <span class="amount-pill">${formatCurrency(toCents(expense.amount))}</span>
        </div>
        <div class="expense-meta">
          <span>先付：${escapeHtml(payerName)}</span>
          <span>分攤：${participantNames.length ? escapeHtml(participantNames.join("、")) : "未選擇"}</span>
        </div>
        ${expense.notes ? `<p class="expense-note">${escapeHtml(expense.notes)}</p>` : ""}
      </div>
      <div class="expense-menu-wrap">
        <button
          class="expense-dot-button"
          type="button"
          data-action="toggle-expense-menu"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="開啟支出操作選單"
        >⋮</button>
        <div class="note-menu" role="menu">
          <button type="button" data-action="edit-expense" role="menuitem">編輯</button>
          <button class="danger-menu-item" type="button" data-action="delete-expense" role="menuitem">刪除</button>
        </div>
      </div>
    </article>
  `;
}

function renderSettlementSection(settlement) {
  return `
    <section class="accounting-section">
      <div class="section-heading">
        <h3>結算結果</h3>
        <span>自動計算</span>
      </div>
      <div class="balance-grid">
        ${trip.members.length ? settlement.memberRows.map(renderMemberBalance).join("") : `<p class="muted-text">新增成員後會顯示每個人的實付與應付。</p>`}
      </div>
      <div class="settlement-list">
        <h4>建議轉帳</h4>
        ${
          settlement.payments.length
            ? settlement.payments.map((payment) => `
                <p>${escapeHtml(payment.from)} 給 ${escapeHtml(payment.to)} ${formatCurrency(payment.amount)}</p>
              `).join("")
            : `<p class="muted-text">目前沒有需要結算的款項。</p>`
        }
      </div>
    </section>
  `;
}

function renderMemberBalance(row) {
  return `
    <div class="balance-card">
      <strong>${escapeHtml(row.name)}</strong>
      <span>實付 ${formatCurrency(row.paid)}</span>
      <span>應付 ${formatCurrency(row.owed)}</span>
      <span class="${row.balance >= 0 ? "positive-balance" : "negative-balance"}">
        ${row.balance >= 0 ? "可收" : "應付"} ${formatCurrency(Math.abs(row.balance))}
      </span>
    </div>
  `;
}

function renderItem(item) {
  return `
    <article class="itinerary-item ${item.completed ? "completed" : ""}" data-item-id="${escapeAttribute(item.id)}" draggable="true">
      <div class="item-summary">
        <span class="drag-handle" aria-hidden="true" title="拖曳排序">⋮⋮</span>
        <span class="item-time"><span aria-hidden="true">⏰</span> ${escapeHtml(item.time || "--:--")}</span>
        <a
          class="item-place"
          href="${escapeAttribute(getMapUrl(item.place))}"
          target="_blank"
          rel="noopener noreferrer"
          title="在 Google Maps 開啟"
        >
          <span aria-hidden="true">📍</span> ${escapeHtml(item.place || "未命名行程")}
        </a>
        <span class="item-meta">
          <label class="complete-check" title="已完成行程">
            <input
              type="checkbox"
              data-action="complete-item"
              ${item.completed ? "checked" : ""}
              aria-label="已完成行程"
            />
          </label>
          <button class="icon-button expand-mark" type="button" data-action="toggle-item" aria-expanded="false" aria-label="展開或收合">⌄</button>
        </span>
      </div>
      <div class="item-details">
        <div class="detail-grid">
          <div class="detail-block">
            <p class="detail-label">行程說明</p>
            <p class="detail-text">${escapeHtml(item.description || "尚未填寫")}</p>
          </div>
          <div class="detail-block">
            <p class="detail-label">備註</p>
            <p class="detail-text">${escapeHtml(item.notes || "尚未填寫")}</p>
          </div>
        </div>
        <div class="item-actions">
          <button class="ghost-button" type="button" data-action="edit-item">編輯</button>
          <button class="ghost-button danger-button" type="button" data-action="delete-item">刪除</button>
        </div>
      </div>
    </article>
  `;
}

function renderNote(note) {
  return `
    <article class="note-item" data-note-id="${escapeAttribute(note.id)}">
      <p class="note-content">${escapeHtml(note.content)}</p>
      <div class="note-menu-wrap">
        <button
          class="note-menu-button"
          type="button"
          data-action="toggle-note-menu"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="開啟備註操作選單"
        >⋯</button>
        <div class="note-menu" role="menu">
          <button type="button" data-action="edit-note" role="menuitem">編輯</button>
          <button class="danger-menu-item" type="button" data-action="delete-note" role="menuitem">刪除</button>
        </div>
      </div>
    </article>
  `;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <p>這一天還沒有行程</p>
    </div>
  `;
}

function renderEmptyNotesState() {
  return `
    <div class="empty-state notes-empty">
      <p>目前還沒有備註</p>
    </div>
  `;
}

function renderEmptyExpenseState() {
  return `
    <div class="empty-state notes-empty">
      <p>目前還沒有支出紀錄</p>
    </div>
  `;
}

// ─── 行程操作 ─────────────────────────────────────────────────────
function openAddItemModal() {
  editingState = { itemId: null };
  modalTitle.textContent = "新增行程";
  itemForm.reset();
  itemModal.showModal();
  setTimeout(() => timeInput.focus(), 0);
}

function addNote(form) {
  const input = form.querySelector("[data-note-input]");
  const content = input.value.trim();
  if (!content) {
    showToast("請先輸入備註內容");
    return;
  }

  trip.notes.unshift(createNote(content));
  input.value = "";
  saveAndRender();
  showToast("備註已新增");
}

function addMember(form) {
  const input = form.querySelector("[data-member-input]");
  const name = input.value.trim();
  if (!name) {
    showToast("請輸入朋友姓名");
    return;
  }

  const isDuplicate = trip.members.some((member) => member.name.toLowerCase() === name.toLowerCase());
  if (isDuplicate) {
    showToast("這位朋友已經在清單裡");
    return;
  }

  trip.members.push(createMember(name));
  input.value = "";
  saveAndRender();
  showToast("成員已新增");
}

function saveExpenseFromForm(form) {
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const amount = String(formData.get("amount") || "").trim();
  const payerId = String(formData.get("payerId") || "");
  const participantIds = formData.getAll("participantIds").map(String);
  const notes = String(formData.get("notes") || "").trim();

  if (!title) {
    showToast("請輸入支出名稱");
    return;
  }

  if (toCents(amount) <= 0) {
    showToast("請輸入有效金額");
    return;
  }

  if (!trip.members.some((member) => member.id === payerId)) {
    showToast("請選擇誰先付");
    return;
  }

  if (!participantIds.length) {
    showToast("請至少勾選一位分攤成員");
    return;
  }

  const expenseData = {
    title,
    amount,
    payerId,
    participantIds,
    notes
  };

  if (editingExpenseId) {
    const expense = getExpenseById(editingExpenseId);
    if (expense) Object.assign(expense, expenseData);
    editingExpenseId = null;
    showToast("支出已更新");
  } else {
    trip.expenses.unshift(createExpense(expenseData));
    showToast("支出已新增");
  }

  saveAndRender();
}

function deleteMember(memberId) {
  const member = trip.members.find((entry) => entry.id === memberId);
  if (!member) return;

  const confirmed = confirm(`確定刪除「${member.name}」嗎？相關支出會保留，但會移除他的付款與分攤關係。`);
  if (!confirmed) return;

  trip.members = trip.members.filter((entry) => entry.id !== memberId);
  trip.expenses = trip.expenses.map((expense) => ({
    ...expense,
    payerId: expense.payerId === memberId ? "" : expense.payerId,
    participantIds: expense.participantIds.filter((id) => id !== memberId)
  }));

  if (editingExpenseId && !getExpenseById(editingExpenseId)) {
    editingExpenseId = null;
  }

  saveAndRender();
  showToast("成員已刪除");
}

function deleteExpense(expenseId) {
  const expense = getExpenseById(expenseId);
  if (!expense) return;

  const confirmed = confirm(`確定刪除「${expense.title}」嗎？`);
  if (!confirmed) return;

  trip.expenses = trip.expenses.filter((entry) => entry.id !== expenseId);
  if (editingExpenseId === expenseId) editingExpenseId = null;
  saveAndRender();
  showToast("支出已刪除");
}

function deleteItem(day, itemId) {
  const item = day.items.find((entry) => entry.id === itemId);
  if (!item) return;
  const confirmed = confirm(`確定刪除「${item.place}」嗎？`);
  if (!confirmed) return;

  day.items = day.items.filter((entry) => entry.id !== itemId);
  saveAndRender();
  showToast("行程已刪除");
}

function editNote(noteId) {
  const note = trip.notes.find((entry) => entry.id === noteId);
  if (!note) return;

  const nextContent = prompt("編輯備註", note.content);
  if (nextContent === null) return;

  const content = nextContent.trim();
  if (!content) {
    showToast("備註內容不能空白");
    return;
  }

  note.content = content;
  saveAndRender();
  showToast("備註已更新");
}

function deleteNote(noteId) {
  const note = trip.notes.find((entry) => entry.id === noteId);
  if (!note) return;

  const confirmed = confirm("確定刪除這條備註嗎？");
  if (!confirmed) return;

  trip.notes = trip.notes.filter((entry) => entry.id !== noteId);
  saveAndRender();
  showToast("備註已刪除");
}

function toggleNoteMenu(noteElement, button) {
  const wasOpen = noteElement.classList.contains("menu-open");
  closeNoteMenus();

  if (!wasOpen) {
    noteElement.classList.add("menu-open");
    button.setAttribute("aria-expanded", "true");
    positionNoteMenu(noteElement, button);
  }
}

function closeNoteMenus() {
  dayView.querySelectorAll(".note-item.menu-open").forEach((noteElement) => {
    noteElement.classList.remove("menu-open");
    const menu = noteElement.querySelector(".note-menu");
    if (menu) {
      menu.style.removeProperty("top");
      menu.style.removeProperty("left");
    }
    noteElement
      .querySelectorAll("[data-action='toggle-note-menu']")
      .forEach((button) => button.setAttribute("aria-expanded", "false"));
  });
}

function toggleExpenseMenu(expenseElement, button) {
  const wasOpen = expenseElement.classList.contains("menu-open");
  closeExpenseMenus();
  if (!wasOpen) {
    expenseElement.classList.add("menu-open");
    button.setAttribute("aria-expanded", "true");
    positionExpenseMenu(expenseElement, button);
  }
}

function closeExpenseMenus() {
  dayView.querySelectorAll(".expense-item.menu-open").forEach((el) => {
    el.classList.remove("menu-open");
    const menu = el.querySelector(".expense-menu");
    if (menu) {
      menu.style.removeProperty("top");
      menu.style.removeProperty("left");
    }
    el.querySelectorAll("[data-action='toggle-expense-menu']")
      .forEach((btn) => btn.setAttribute("aria-expanded", "false"));
  });
}

function positionExpenseMenu(expenseElement, button) {
  const menu = expenseElement.querySelector(".expense-menu");
  if (!menu) return;
  const gap = 6;
  const margin = 8;
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const menuWidth = menuRect.width || 120;
  const menuHeight = menuRect.height || 80;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = buttonRect.right - menuWidth;
  left = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));
  let top = buttonRect.bottom + gap;
  if (top + menuHeight + margin > viewportHeight) top = buttonRect.top - menuHeight - gap;
  top = Math.max(margin, Math.min(top, viewportHeight - menuHeight - margin));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function positionNoteMenu(noteElement, button) {
  const menu = noteElement.querySelector(".note-menu");
  if (!menu) return;

  const gap = 6;
  const margin = 8;
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const menuWidth = menuRect.width;
  const menuHeight = menuRect.height;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = buttonRect.right - menuWidth;
  left = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));

  let top = buttonRect.bottom + gap;
  const opensUp = top + menuHeight + margin > viewportHeight;
  if (opensUp) {
    top = buttonRect.top - menuHeight - gap;
  }
  top = Math.max(margin, Math.min(top, viewportHeight - menuHeight - margin));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function openModal(item) {
  editingState = { itemId: item.id };
  modalTitle.textContent = "編輯行程";
  timeInput.value = item?.time || "";
  placeInput.value = item?.place || "";
  descriptionInput.value = item?.description || "";
  notesInput.value = item?.notes || "";
  itemModal.showModal();
  setTimeout(() => timeInput.focus(), 0);
}

function closeModal() {
  itemModal.close();
  itemForm.reset();
  editingState = null;
}

function reorderItems(sourceId, targetId) {
  const day = getActiveDay();
  if (!day) return;

  const sourceIndex = day.items.findIndex((item) => item.id === sourceId);
  const targetIndex = day.items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const [movedItem] = day.items.splice(sourceIndex, 1);
  day.items.splice(targetIndex, 0, movedItem);
  saveAndRender();
}

// ─── 記帳計算 ─────────────────────────────────────────────────────
function calculateSettlement() {
  const totals = new Map(
    trip.members.map((member) => [
      member.id,
      {
        id: member.id,
        name: member.name,
        paid: 0,
        owed: 0
      }
    ])
  );

  trip.expenses.forEach((expense) => {
    const amount = toCents(expense.amount);
    if (amount <= 0) return;

    if (totals.has(expense.payerId)) {
      totals.get(expense.payerId).paid += amount;
    }

    const participants = expense.participantIds.filter((id) => totals.has(id));
    if (!participants.length) return;

    const baseShare = Math.floor(amount / participants.length);
    const remainder = amount % participants.length;
    participants.forEach((id, index) => {
      totals.get(id).owed += baseShare + (index < remainder ? 1 : 0);
    });
  });

  const memberRows = Array.from(totals.values()).map((row) => ({
    ...row,
    balance: row.paid - row.owed
  }));

  const debtors = memberRows
    .filter((row) => row.balance < 0)
    .map((row) => ({ ...row, amount: Math.abs(row.balance) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = memberRows
    .filter((row) => row.balance > 0)
    .map((row) => ({ ...row, amount: row.balance }))
    .sort((a, b) => b.amount - a.amount);

  const payments = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      payments.push({
        from: debtor.name,
        to: creditor.name,
        amount
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return { memberRows, payments };
}

// ─── 工具函式 ─────────────────────────────────────────────────────
function getActiveDay() {
  return trip.days.find((day) => day.id === trip.activeDayId) || trip.days[0];
}

function getExpenseById(expenseId) {
  return trip.expenses.find((expense) => expense.id === expenseId);
}

function getMemberName(memberId) {
  return trip.members.find((member) => member.id === memberId)?.name || "";
}

function getProgressText(day) {
  const done = day.items.filter((item) => item.completed).length;
  if (!day.items.length) return "0 / 0 已完成";
  return `${done} / ${day.items.length} 已完成`;
}

function getDayEmoji(day) {
  const number = Number.parseInt(day.label.replace(/[^\d]/g, ""), 10);
  const emojis = ["✈️", "🏝️", "🍜", "🌆", "🛍️", "☕", "🎒", "🌈"];
  if (!Number.isFinite(number) || number < 1) return "🌈";
  return emojis[(number - 1) % emojis.length];
}

function getMapUrl(place) {
  const query = `${place || ""} Singapore`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function isDayTab(tabId) {
  return trip.days.some((day) => day.id === tabId);
}

function isSpecialTab(tabId) {
  return tabId === NOTES_TAB_ID || tabId === ACCOUNTING_TAB_ID;
}

function toCents(value) {
  const amount = Number.parseFloat(String(value).replace(/,/g, ""));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function formatCurrency(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
