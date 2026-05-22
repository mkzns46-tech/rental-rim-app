const SUPABASE_URL = "https://ihsbkknysozkstvylqff.supabase.co";
const SUPABASE_API_KEY = "sb_publishable_8f005IzGsMeOZktqtNtTRQ_ms6bzvze";

const STATUS_AVAILABLE = "在庫";
const STATUS_OUT = "貸出中";
const STATUS_WAITING = "未貸出";
const STATUS_RETURNED = "返却済";

let state = { orders: [], rims: [], rentals: [], staff: [], selectedOrderNo: "" };
const el = id => document.getElementById(id);

window.addEventListener("error", e => showMessage("checkoutMessage", "起動エラー。\n" + (e.message || ""), "err"));
window.addEventListener("unhandledrejection", e => showMessage("checkoutMessage", "通信エラー。\n" + (e.reason?.message || e.reason || ""), "err"));

async function sb(path, opt = {}) {
  const headers = {
    apikey: SUPABASE_API_KEY,
    Authorization: "Bearer " + SUPABASE_API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(opt.headers || {})
  };
  const res = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + path, { ...opt, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`Supabaseエラー ${res.status}\n${typeof body === "object" ? JSON.stringify(body) : body}`);
  return body;
}

async function reloadAll() {
  showMessage("checkoutMessage", "読み込み中...");
  const [orders, rims, rentals, staff] = await Promise.all([
    sb("rental_orders?select=*&order=created_at.desc&limit=500"),
    sb("rental_rims?select=*&order=rim_no.asc&limit=1000"),
    sb("rental_histories?select=*&order=checked_out_at.desc&limit=500"),
    sb("staff_members?select=name&order=name.asc")
  ]);
  state.orders = orders.map(mapOrder);
  state.rims = rims.map(mapRim);
  state.rentals = rentals.map(mapRental);
  state.staff = staff.map(s => s.name).filter(Boolean);
  render();
  showMessage("checkoutMessage", "準備OK。注文を選択してバーコードをスキャンしてください。", "ok");
}

function render() {
  renderStaff();
  renderOrders();
  renderRims();
  renderHistory();
}

function renderStaff() {
  const options = '<option value="">担当者を選択</option>' + state.staff.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
  el("checkoutStaff").innerHTML = options;
  el("returnStaff").innerHTML = options;
  el("staffCountBadge").textContent = `担当者：${state.staff.length}人`;
  el("staffListBody").innerHTML = state.staff.map(name => `<tr><td>${esc(name)}</td><td><button class="staff-delete-btn" onclick="deleteStaff('${encodeURIComponent(name)}')">削除</button></td></tr>`).join("") || '<tr><td colspan="2">担当者が未登録です</td></tr>';
}

function renderOrders() {
  const q = el("orderSearchInput").value.trim().toLowerCase();
  const rows = state.orders.filter(o => !q || [o.order_no, o.member_code, o.customer_name].join(" ").toLowerCase().includes(q)).slice(0, 100);
  el("ordersBody").innerHTML = rows.map(o => {
    const selected = o.order_no === state.selectedOrderNo ? "selected-row" : "";
    const spec = [o.requested_size, o.requested_pound, o.requested_type].filter(Boolean).join(" / ") || "未抽出";
    return `<tr class="clickable ${selected}" onclick="selectOrder('${encodeURIComponent(o.order_no)}')"><td>${status(o.order_status)}</td><td><b>${esc(o.order_no)}</b></td><td>${esc(o.customer_name)}<br><small>${esc(o.member_code)}</small></td><td>${esc(spec)}</td></tr>`;
  }).join("") || '<tr><td colspan="4">対象注文がありません</td></tr>';
}

function renderRims() {
  const rows = filterRims();
  el("rimCountBadge").textContent = `表示：${rows.length}本 / 登録：${state.rims.length}本`;
  el("rimsBody").innerHTML = rows.map(r => {
    const spec = [r.size, r.pound, r.rim_type, r.notes].filter(Boolean).join(" / ");
    const current = [r.current_member_code, r.current_customer_name].filter(Boolean).join(" / ") || r.current_order_no || "";
    return `<tr class="clickable" onclick="selectRimForEdit('${encodeURIComponent(r.rim_no)}')"><td>${status(r.status)}</td><td>${esc(r.rim_no)}</td><td>${esc(r.barcode)}</td><td>${esc(spec)}</td><td>${esc(current)}</td></tr>`;
  }).join("") || '<tr><td colspan="5">リムが未登録です</td></tr>';
}

function filterRims() {
  const customerQ = el("customerRimSearchInput")?.value.trim().toLowerCase() || "";
  const rimQ = el("rimSearchInput")?.value.trim().toLowerCase() || "";
  const sizeQ = el("availableSizeFilter")?.value.trim().toLowerCase() || "";
  const poundQ = el("availablePoundFilter")?.value.trim().toLowerCase() || "";
  const availableOnly = el("availableOnlyFilter")?.checked || sizeQ || poundQ;

  return state.rims.filter(r => {
    const customerText = [r.current_member_code, r.current_customer_name, r.current_order_no].join(" ").toLowerCase();
    const rimText = [r.rim_no, r.barcode, r.size, r.pound, r.rim_type, r.notes].join(" ").toLowerCase();
    if (customerQ && !customerText.includes(customerQ)) return false;
    if (rimQ && !rimText.includes(rimQ)) return false;
    if (availableOnly && r.status !== STATUS_AVAILABLE) return false;
    if (sizeQ && String(r.size || "").toLowerCase() !== sizeQ) return false;
    if (poundQ && String(r.pound || "").toLowerCase() !== poundQ) return false;
    return true;
  });
}

function renderHistory() {
  el("historyCountBadge").textContent = `履歴：${state.rentals.length}件`;
  el("historyBody").innerHTML = historyRows(state.rentals);
}

function selectOrder(encoded) {
  state.selectedOrderNo = decodeURIComponent(encoded);
  el("selectedOrderNo").value = state.selectedOrderNo;
  renderOrders();
  el("barcodeInput").focus();
}

function selectRimHistory(encoded) {
  el("rimHistoryBarcodeInput").value = decodeURIComponent(encoded);
  loadRimHistory();
}

function selectRimForEdit(encoded) {
  const rimNo = decodeURIComponent(encoded);
  const rim = state.rims.find(r => r.rim_no === rimNo);
  if (!rim) return;
  el("rimNoInput").value = rim.rim_no || "";
  el("rimBarcodeInput").value = rim.barcode || "";
  el("rimSizeInput").value = rim.size || "";
  el("rimPoundInput").value = rim.pound || "";
  el("rimTypeInput").value = rim.rim_type || "";
  el("rimNotesInput").value = rim.notes || "";
  el("rimStatusInput").value = rim.status || STATUS_AVAILABLE;
  el("rimFormModeBadge").textContent = "編集中";
  selectRimHistory(encodeURIComponent(rim.barcode || rim.rim_no));
}

function clearRimForm() {
  el("rimNoInput").value = "";
  el("rimBarcodeInput").value = "";
  el("rimSizeInput").value = "";
  el("rimPoundInput").value = "";
  el("rimTypeInput").value = "";
  el("rimNotesInput").value = "";
  el("rimStatusInput").value = STATUS_AVAILABLE;
  el("rimFormModeBadge").textContent = "新規 / 更新";
  showMessage("rimFormMessage", "リム台帳をアプリから登録できます");
}

async function saveRim(event) {
  event.preventDefault();
  const rimNo = el("rimNoInput").value.trim();
  const barcode = el("rimBarcodeInput").value.trim();
  if (!rimNo || !barcode) return showMessage("rimFormMessage", "リム番号とバーコードは必須です。", "err");

  const payload = {
    rim_no: rimNo,
    barcode,
    size: el("rimSizeInput").value.trim(),
    pound: el("rimPoundInput").value.trim(),
    rim_type: el("rimTypeInput").value.trim(),
    notes: el("rimNotesInput").value.trim(),
    status: el("rimStatusInput").value || STATUS_AVAILABLE
  };

  const existing = state.rims.find(r => r.rim_no === rimNo || r.barcode === barcode);
  if (existing) {
    await sb(`rental_rims?id=eq.${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  } else {
    await sb("rental_rims", {
      method: "POST",
      body: JSON.stringify([payload])
    });
  }
  showMessage("rimFormMessage", "リムを登録 / 更新しました。", "ok");
  clearRimForm();
  await reloadAll();
}

async function importRimCsv(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return showMessage("rimCsvMessage", "CSVにデータ行がありません。", "err");

  const headers = rows[0].map(normalizeHeader);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    if (row.every(v => !String(v || "").trim())) continue;
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || "");
    const payload = mapRimCsvRow(obj);
    if (!payload.rim_no || !payload.barcode) {
      skipped++;
      continue;
    }
    const existing = state.rims.find(r => r.rim_no === payload.rim_no || r.barcode === payload.barcode);
    if (existing) {
      await sb(`rental_rims?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      updated++;
    } else {
      await sb("rental_rims", { method: "POST", body: JSON.stringify([payload]) });
      created++;
    }
  }
  event.target.value = "";
  showMessage("rimCsvMessage", `CSV取り込み完了\n追加: ${created}\n更新: ${updated}\nスキップ: ${skipped}`, "ok");
  await reloadAll();
}

function downloadRimSampleCsv() {
  const csv = [
    ["rim_no", "barcode", "size", "pound", "rim_type", "notes", "status"],
    ["RIM-001", "123456789001", "M", "10", "標準", "サンプル", "在庫"]
  ].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rental_rims_sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function mapRimCsvRow(obj) {
  return {
    rim_no: pick(obj, ["rim_no", "リム番号", "管理番号"]),
    barcode: pick(obj, ["barcode", "バーコード"]),
    size: pick(obj, ["size", "サイズ"]),
    pound: pick(obj, ["pound", "ポンド"]),
    rim_type: pick(obj, ["rim_type", "type", "種類", "タイプ"]),
    notes: pick(obj, ["notes", "note", "備考", "メモ"]),
    status: pick(obj, ["status", "状態"]) || STATUS_AVAILABLE
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote && ch === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quote = !quote;
    } else if (!quote && ch === ",") {
      row.push(cell);
      cell = "";
    } else if (!quote && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter(r => r.some(v => String(v).trim()));
}

function pick(obj, keys) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (obj[normalized] !== undefined && obj[normalized] !== "") return String(obj[normalized]).trim();
  }
  return "";
}

function normalizeHeader(value) { return String(value || "").replace(/^\uFEFF/, "").trim(); }
function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

async function addStaff(event) {
  event.preventDefault();
  const name = el("staffNameInput").value.trim();
  if (!name) return;
  await sb("staff_members", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ name }])
  });
  el("staffNameInput").value = "";
  await reloadAll();
}

async function deleteStaff(encoded) {
  const name = decodeURIComponent(encoded);
  await sb(`staff_members?name=eq.${encodeURIComponent(name)}`, { method: "DELETE" });
  await reloadAll();
}

async function previewCheckout() {
  const orderNo = state.selectedOrderNo;
  const barcode = el("barcodeInput").value.trim();
  if (!orderNo || !barcode) return;
  const order = state.orders.find(o => String(o.order_no) === String(orderNo));
  const rim = state.rims.find(r => String(r.barcode) === String(barcode) || String(r.rim_no) === String(barcode));
  if (!order) return showMessage("scanInfo", "注文が見つかりません。", "err");
  if (!rim) return showMessage("scanInfo", "リムが見つかりません。", "err");
  const warnings = validateCheckout(order, rim);
  showMessage("scanInfo", [
    `注文番号: ${order.order_no}`,
    `顧客名: ${order.customer_name}`,
    `リム番号: ${rim.rim_no}`,
    `状態: ${rim.status}`,
    ...(warnings.length ? ["", ...warnings] : [])
  ].join("\n"), warnings.length ? "warn" : "ok");
}

async function checkout(event) {
  event.preventDefault();
  const orderNo = state.selectedOrderNo;
  const barcode = el("barcodeInput").value.trim();
  const staff = el("checkoutStaff").value;
  if (!orderNo) return showMessage("checkoutMessage", "注文を選択してください。", "err");
  if (!barcode) return showMessage("checkoutMessage", "リムバーコードを入力してください。", "err");
  if (!staff) return showMessage("checkoutMessage", "担当者を選択してください。", "err");

  const order = state.orders.find(o => String(o.order_no) === String(orderNo));
  const rim = state.rims.find(r => String(r.barcode) === String(barcode) || String(r.rim_no) === String(barcode));
  if (!order) return showMessage("checkoutMessage", "注文が見つかりません。", "err");
  if (!rim) return showMessage("checkoutMessage", "リムが見つかりません。", "err");
  const warnings = validateCheckout(order, rim);
  const hard = warnings.find(msg => msg.includes("二重貸出") || msg.includes("未貸出ではありません"));
  if (hard) return showMessage("checkoutMessage", hard, "err");
  if (warnings.length && !confirm(warnings.join("\n") + "\n\n警告を確認して貸出しますか？")) return;

  const now = new Date().toISOString();
  await sb(`rental_orders?order_no=eq.${encodeURIComponent(orderNo)}`, {
    method: "PATCH",
    body: JSON.stringify({ order_status: STATUS_OUT, rented_rim_no: rim.rim_no, checked_out_at: now, warning: warnings.join("\n") })
  });
  await sb(`rental_rims?id=eq.${rim.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: STATUS_OUT, current_order_no: orderNo, current_member_code: order.member_code, current_customer_name: order.customer_name, checked_out_at: now })
  });
  await sb("rental_histories", {
    method: "POST",
    body: JSON.stringify([{ order_no: orderNo, member_code: order.member_code, customer_name: order.customer_name, rim_no: rim.rim_no, rim_barcode: rim.barcode, staff_name: staff, checked_out_at: now, status: STATUS_OUT, checkout_warning: warnings.join("\n") }])
  });
  el("barcodeInput").value = "";
  showMessage("checkoutMessage", "貸出登録しました。", "ok");
  await reloadAll();
}

async function scanReturn() {
  const barcode = el("returnBarcodeInput").value.trim();
  if (!barcode) return showMessage("returnMessage", "リムバーコードを入力してください。", "err");
  const rim = state.rims.find(r => String(r.barcode) === String(barcode) || String(r.rim_no) === String(barcode));
  if (!rim) return showMessage("returnInfo", "リムが見つかりません。", "err");
  const rental = state.rentals.find(r => r.status === STATUS_OUT && (r.rim_no === rim.rim_no || r.rim_barcode === rim.barcode));
  if (!rental) return showMessage("returnInfo", "このリムに貸出中履歴がありません。", "warn");
  showMessage("returnInfo", [`注文番号: ${rental.order_no}`, `会員番号: ${rental.member_code}`, `顧客名: ${rental.customer_name}`, `リム番号: ${rental.rim_no}`, `貸出日時: ${fmt(rental.checked_out_at)}`, `担当者: ${rental.staff_name}`].join("\n"), "ok");
}

async function returnRim() {
  const barcode = el("returnBarcodeInput").value.trim();
  const staff = el("returnStaff").value;
  const memo = el("returnMemo").value.trim();
  if (!barcode) return showMessage("returnMessage", "リムバーコードを入力してください。", "err");
  if (!staff) return showMessage("returnMessage", "返却担当者を選択してください。", "err");
  const rim = state.rims.find(r => String(r.barcode) === String(barcode) || String(r.rim_no) === String(barcode));
  if (!rim) return showMessage("returnMessage", "リムが見つかりません。", "err");
  const rental = state.rentals.find(r => r.status === STATUS_OUT && (r.rim_no === rim.rim_no || r.rim_barcode === rim.barcode));
  if (!rental) return showMessage("returnMessage", "このリムに貸出中履歴がありません。", "err");

  const now = new Date().toISOString();
  await sb(`rental_histories?id=eq.${rental.id}`, {
    method: "PATCH",
    body: JSON.stringify({ returned_at: now, status: STATUS_RETURNED, return_staff_name: staff, return_memo: memo })
  });
  await sb(`rental_rims?id=eq.${rim.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: STATUS_AVAILABLE, current_order_no: "", current_member_code: "", current_customer_name: "", checked_out_at: null })
  });
  await sb(`rental_orders?order_no=eq.${encodeURIComponent(rental.order_no)}`, {
    method: "PATCH",
    body: JSON.stringify({ order_status: STATUS_RETURNED, returned_at: now })
  });
  el("returnBarcodeInput").value = "";
  el("returnMemo").value = "";
  showMessage("returnMessage", "返却済みに変更しました。", "ok");
  await reloadAll();
}

async function loadRimHistory() {
  const barcode = el("rimHistoryBarcodeInput").value.trim();
  if (!barcode) return;
  const rim = state.rims.find(r => String(r.barcode) === String(barcode) || String(r.rim_no) === String(barcode));
  if (!rim) {
    el("rimHistoryBadge").textContent = "該当なし";
    el("rimHistoryBody").innerHTML = '<tr><td colspan="8">履歴がありません</td></tr>';
    return;
  }
  const histories = state.rentals.filter(r => r.rim_no === rim.rim_no || r.rim_barcode === rim.barcode);
  el("rimHistoryBadge").textContent = `${rim.rim_no}：${histories.length}件`;
  el("rimHistoryBody").innerHTML = historyRows(histories);
}

function validateCheckout(order, rim) {
  const warnings = [];
  if (order.order_status !== STATUS_WAITING) warnings.push("この注文は未貸出ではありません。");
  if (rim.status === STATUS_OUT) warnings.push("このリムは貸出中です。二重貸出はできません。");
  if (rim.status !== STATUS_AVAILABLE) warnings.push(`このリム状態は「${rim.status}」です。`);
  [["requested_size", "size", "サイズ"], ["requested_pound", "pound", "ポンド"], ["requested_type", "rim_type", "種類"]].forEach(([ok, rk, label]) => {
    if (order[ok] && rim[rk] && String(order[ok]).trim() !== String(rim[rk]).trim()) warnings.push(`${label}が注文条件「${order[ok]}」とリム台帳「${rim[rk]}」で一致しません。`);
  });
  return warnings;
}

function historyRows(rows) {
  return rows.map(r => `<tr><td>${fmt(r.checked_out_at)}</td><td>${fmt(r.returned_at)}</td><td>${status(r.status)}</td><td>${esc(r.rim_no || "")}</td><td>${esc(r.staff_name || "")}</td><td>${esc(r.order_no || "")}</td><td>${esc(r.customer_name || "")}</td><td>${esc([r.checkout_warning, r.return_memo].filter(Boolean).join(" / "))}</td></tr>`).join("") || '<tr><td colspan="8">履歴がありません</td></tr>';
}

function mapOrder(row) { return row; }
function mapRim(row) { return row; }
function mapRental(row) { return row; }
function status(value) {
  const cls = value === STATUS_OUT ? "status-out" : value === STATUS_RETURNED ? "status-returned" : "";
  return `<span class="${cls}">${esc(value || "")}</span>`;
}
function showMessage(id, text, type = "") {
  el(id).textContent = text;
  el(id).className = "message " + type;
}
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function fmt(value) { if (!value) return ""; const d = new Date(value); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleString("ja-JP"); }

el("reloadBtn").addEventListener("click", reloadAll);
el("orderSearchInput").addEventListener("input", renderOrders);
el("customerRimSearchInput").addEventListener("input", renderRims);
el("rimSearchInput").addEventListener("input", renderRims);
el("availableSizeFilter").addEventListener("input", renderRims);
el("availablePoundFilter").addEventListener("input", renderRims);
el("availableOnlyFilter").addEventListener("change", renderRims);
el("checkoutForm").addEventListener("submit", checkout);
el("barcodeInput").addEventListener("change", previewCheckout);
el("scanReturnBtn").addEventListener("click", scanReturn);
el("returnBtn").addEventListener("click", returnRim);
el("returnBarcodeInput").addEventListener("keydown", e => { if (e.key === "Enter") scanReturn(); });
el("rimHistoryBarcodeInput").addEventListener("keydown", e => { if (e.key === "Enter") loadRimHistory(); });
el("loadRimHistoryBtn").addEventListener("click", loadRimHistory);
el("staffForm").addEventListener("submit", addStaff);
el("rimForm").addEventListener("submit", saveRim);
el("clearRimFormBtn").addEventListener("click", clearRimForm);
el("rimCsvFile").addEventListener("change", importRimCsv);
el("downloadRimSampleCsvBtn").addEventListener("click", downloadRimSampleCsv);

reloadAll();
