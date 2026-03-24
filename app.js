// ============================================
// ATTENDANCE TRACKER - WORKING VERSION
// ============================================

let db;
let currentSession = null;
let currentEditId = null;

// ========== DATABASE SETUP ==========
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AttendTrackDB", 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains("attendance")) {
        db.createObjectStore("attendance", { keyPath: "id", autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains("leaves")) {
        db.createObjectStore("leaves", { keyPath: "id", autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains("session")) {
        db.createObjectStore("session", { keyPath: "key" });
      }
    };
  });
}

// ========== DATABASE HELPERS ==========
function addData(storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.add(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updateData(storeName, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getData(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllData(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteAllData(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ========== UI HELPERS ==========
function showAlert(message, type) {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 3000);
}

function updateSyncStatus(status) {
  const el = document.getElementById("sync-status");
  if (el) el.textContent = status;
}

// ========== EXPORT TO CSV ==========
function exportToCSV(data, filename) {
  if (!data || data.length === 0) {
    showAlert("No data to export", "warning");
    return;
  }
  
  let headers = Object.keys(data[0]);
  let rows = data.map(row => headers.map(h => JSON.stringify(row[h] || "")));
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  showAlert(`Exported ${data.length} records`, "success");
}

// ========== ICLOUD BACKUP ==========
async function backupToICloud() {
  try {
    const attendance = await getAllData("attendance");
    const leaves = await getAllData("leaves");
    const session = await getData("session", "currentSession");
    
    const backupData = {
      version: "1.0",
      date: new Date().toISOString(),
      attendance: attendance,
      leaves: leaves,
      session: session
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendtrack_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showAlert("Backup created! Save to iCloud Drive.", "success");
  } catch (error) {
    showAlert("Backup failed", "warning");
  }
}

function restoreFromICloud() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        let imported = 0;
        
        if (data.attendance && data.attendance.length) {
          for (let record of data.attendance) {
            await addData("attendance", record);
            imported++;
          }
        }
        
        if (data.leaves && data.leaves.length) {
          for (let leave of data.leaves) {
            await addData("leaves", leave);
            imported++;
          }
        }
        
        showAlert(`Restored ${imported} records!`, "success");
        refreshAllDisplays();
      } catch (error) {
        showAlert("Restore failed", "warning");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ========== EDIT FUNCTIONS ==========
window.openEditModal = async function(recordId) {
  const allRecords = await getAllData("attendance");
  const record = allRecords.find(r => r.id === recordId);
  if (!record) return;
  
  currentEditId = recordId;
  document.getElementById("edit-checkin").value = record.checkInTime.slice(0, 16);
  if (record.checkOutTime) {
    document.getElementById("edit-checkout").value = record.checkOutTime.slice(0, 16);
  } else {
    document.getElementById("edit-checkout").value = "";
  }
  document.getElementById("editModal").classList.add("active");
};

window.deleteRecordHandler = async function(recordId) {
  if (confirm("Delete this record?")) {
    await deleteRecord("attendance", recordId);
    showAlert("Record deleted", "success");
    refreshAllDisplays();
  }
};

async function saveEdit() {
  if (!currentEditId) return;
  
  const allRecords = await getAllData("attendance");
  const record = allRecords.find(r => r.id === currentEditId);
  if (!record) return;
  
  const checkInValue = document.getElementById("edit-checkin").value;
  const checkOutValue = document.getElementById("edit-checkout").value;
  
  if (!checkInValue) {
    showAlert("Check-in time required", "warning");
    return;
  }
  
  record.checkInTime = new Date(checkInValue).toISOString();
  record.checkOutTime = checkOutValue ? new Date(checkOutValue).toISOString() : null;
  record.date = record.checkInTime.split("T")[0];
  
  await updateData("attendance", record);
  closeModal();
  showAlert("Record updated!", "success");
  refreshAllDisplays();
}

function closeModal() {
  document.getElementById("editModal").classList.remove("active");
  currentEditId = null;
}

// ========== ATTENDANCE FUNCTIONS ==========
async function loadCurrentSession() {
  const session = await getData("session", "currentSession");
  if (session && session.value && !session.value.checkOutTime) {
    currentSession = session.value;
  }
  updateUI();
}

async function saveCurrentSession(session) {
  currentSession = session;
  await updateData("session", { key: "currentSession", value: session });
  updateUI();
}

function updateUI() {
  const badge = document.getElementById("status-badge");
  const checkInBtn = document.getElementById("check-in-btn");
  const checkOutBtn = document.getElementById("check-out-btn");
  const statusText = document.getElementById("current-status-text");
  
  if (currentSession && !currentSession.checkOutTime) {
    badge.innerHTML = "● Checked In";
    badge.className = "status-badge status-checked-in";
    checkInBtn.style.display = "none";
    checkOutBtn.style.display = "block";
    statusText.textContent = `Checked in at ${new Date(currentSession.checkInTime).toLocaleTimeString()}`;
  } else {
    badge.innerHTML = "● Checked Out";
    badge.className = "status-badge status-checked-out";
    checkInBtn.style.display = "block";
    checkOutBtn.style.display = "none";
    statusText.textContent = "Ready to start your day";
  }
}

async function checkIn() {
  if (currentSession && !currentSession.checkOutTime) {
    showAlert("Already checked in!", "warning");
    return;
  }
  
  const now = new Date();
  const sessionData = {
    checkInTime: now.toISOString(),
    checkOutTime: null,
    date: now.toISOString().split("T")[0],
    timestamp: now.getTime()
  };
  
  await saveCurrentSession(sessionData);
  await addData("attendance", sessionData);
  showAlert(`Checked in at ${now.toLocaleTimeString()}`, "success");
  refreshAllDisplays();
}

async function checkOut() {
  if (!currentSession || currentSession.checkOutTime) {
    showAlert("Not checked in!", "warning");
    return;
  }
  
  const now = new Date();
  currentSession.checkOutTime = now.toISOString();
  await saveCurrentSession(currentSession);
  
  const allRecords = await getAllData("attendance");
  const lastRecord = allRecords.reverse().find(r => !r.checkOutTime);
  if (lastRecord) {
    lastRecord.checkOutTime = now.toISOString();
    await updateData("attendance", lastRecord);
  }
  
  const duration = Math.round((now - new Date(currentSession.checkInTime)) / 1000 / 60);
  showAlert(`Checked out at ${now.toLocaleTimeString()} (${duration} min)`, "success");
  refreshAllDisplays();
}

// ========== LEAVE FUNCTIONS ==========
async function submitLeave() {
  const start = document.getElementById("leave-start").value;
  const end = document.getElementById("leave-end").value;
  const reason = document.getElementById("leave-reason").value;
  
  if (!start || !end) {
    showAlert("Please select dates", "warning");
    return;
  }
  
  const leaveData = {
    startDate: start,
    endDate: end,
    reason: reason || "Not specified",
    status: "pending",
    submittedAt: new Date().toISOString()
  };
  
  await addData("leaves", leaveData);
  
  document.getElementById("leave-start").value = "";
  document.getElementById("leave-end").value = "";
  document.getElementById("leave-reason").value = "";
  
  showAlert("Leave request submitted!", "success");
  refreshAllDisplays();
}

// ========== LOAD DISPLAYS ==========
async function loadTodayActivity() {
  const today = new Date().toISOString().split("T")[0];
  const allRecords = await getAllData("attendance");
  const todayRecords = allRecords.filter(r => r.date === today).reverse();
  const container = document.getElementById("today-activity");
  
  if (todayRecords.length === 0) {
    container.innerHTML = '<div class="empty-state">No activity today</div>';
  } else {
    let html = "";
    for (let r of todayRecords) {
      const checkIn = new Date(r.checkInTime).toLocaleTimeString();
      const checkOut = r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : "Active";
      html += `
        <div class="record-item">
          <div class="record-header">
            <span class="record-date">✅ ${checkIn}</span>
            ${r.checkOutTime ? `<button class="btn-edit" onclick="openEditModal(${r.id})">✏️ Edit</button>` : ''}
          </div>
          <div class="record-detail">🔴 Check Out: ${checkOut}</div>
        </div>
      `;
    }
    container.innerHTML = html;
  }
}

async function loadSummaryStats() {
  const allRecords = await getAllData("attendance");
  const now = new Date();
  const thisMonth = now.toISOString().split("T")[0].substring(0, 7);
  const monthRecords = allRecords.filter(r => r.date.startsWith(thisMonth));
  
  let totalMinutes = 0;
  for (let r of monthRecords) {
    if (r.checkOutTime) {
      const checkIn = new Date(r.checkInTime);
      const checkOut = new Date(r.checkOutTime);
      totalMinutes += (checkOut - checkIn) / 1000 / 60;
    }
  }
  
  const hoursWorked = Math.round(totalMinutes / 60 * 10) / 10;
  
  document.getElementById("summary-stats").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${monthRecords.length}</div>
        <div class="stat-label">Days Worked</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${hoursWorked}</div>
        <div class="stat-label">Hours</div>
      </div>
    </div>
  `;
}

async function loadAttendanceHistory() {
  const allRecords = await getAllData("attendance");
  const container = document.getElementById("attendance-history");
  
  if (allRecords.length === 0) {
    container.innerHTML = '<div class="empty-state">No records</div>';
    return;
  }
  
  const grouped = {};
  for (let r of allRecords) {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  }
  
  let html = "";
  const dates = Object.keys(grouped).sort().reverse();
  for (let date of dates.slice(0, 30)) {
    html += `<div style="margin-bottom: 20px;"><div style="font-weight: 700; margin-bottom: 10px; color: white;">📆 ${date}</div>`;
    for (let r of grouped[date]) {
      const checkIn = new Date(r.checkInTime).toLocaleTimeString();
      const checkOut = r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : "Active";
      html += `
        <div class="record-item">
          <div class="record-header">
            <div>✅ ${checkIn} → ${checkOut}</div>
            <div class="record-actions">
              <button class="btn-edit" onclick="openEditModal(${r.id})">✏️ Edit</button>
              <button class="btn-edit" style="background:#ff3b30;" onclick="deleteRecordHandler(${r.id})">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }
  container.innerHTML = html;
}

async function loadPendingLeaves() {
  const allLeaves = await getAllData("leaves");
  const pending = allLeaves.filter(l => l.status === "pending").reverse();
  const container = document.getElementById("pending-leaves");
  
  if (pending.length === 0) {
    container.innerHTML = '<div class="empty-state">No pending requests</div>';
  } else {
    let html = "";
    for (let l of pending) {
      html += `
        <div class="leave-request">
          <strong>📅 ${l.startDate} → ${l.endDate}</strong>
          <div style="margin: 8px 0;">📝 ${l.reason}</div>
          <span style="color: #ff9500;">⏳ Pending</span>
        </div>
      `;
    }
    container.innerHTML = html;
  }
}

async function loadLeaveHistory() {
  const allLeaves = await getAllData("leaves");
  const container = document.getElementById("leave-history");
  
  if (allLeaves.length === 0) {
    container.innerHTML = '<div class="empty-state">No records</div>';
  } else {
    let html = "";
    for (let l of allLeaves.reverse()) {
      const color = l.status === "approved" ? "#34c759" : l.status === "rejected" ? "#ff3b30" : "#ff9500";
      const text = l.status === "approved" ? "✅ Approved" : l.status === "rejected" ? "❌ Rejected" : "⏳ Pending";
      html += `
        <div class="leave-request" style="border-left-color: ${color}">
          <strong>📅 ${l.startDate} → ${l.endDate}</strong>
          <div style="margin: 8px 0;">📝 ${l.reason}</div>
          <span style="color: ${color};">${text}</span>
        </div>
      `;
    }
    container.innerHTML = html;
  }
}

async function loadDataStats() {
  const attendance = await getAllData("attendance");
  const leaves = await getAllData("leaves");
  document.getElementById("data-stats").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${attendance.length}</div>
        <div class="stat-label">Attendance</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${leaves.length}</div>
        <div class="stat-label">Leaves</div>
      </div>
    </div>
  `;
}

async function clearAllData() {
  if (confirm("Delete ALL data? This cannot be undone.")) {
    await deleteAllData("attendance");
    await deleteAllData("leaves");
    await deleteAllData("session");
    currentSession = null;
    showAlert("All data cleared", "success");
    refreshAllDisplays();
  }
}

// ========== TAB NAVIGATION ==========
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const sections = {
    attendance: document.getElementById("attendance-tab"),
    leave: document.getElementById("leave-tab"),
    history: document.getElementById("history-tab"),
    backup: document.getElementById("backup-tab")
  };
  
  tabs.forEach(tab => {
    tab.onclick = () => {
      const tabName = tab.getAttribute("data-tab");
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      Object.values(sections).forEach(s => { if (s) s.style.display = "none"; });
      if (sections[tabName]) sections[tabName].style.display = "block";
      
      if (tabName === "attendance") { loadTodayActivity(); loadSummaryStats(); }
      else if (tabName === "leave") loadPendingLeaves();
      else if (tabName === "history") { loadAttendanceHistory(); loadLeaveHistory(); }
      else if (tabName === "backup") loadDataStats();
    };
  });
}

function refreshAllDisplays() {
  loadTodayActivity();
  loadSummaryStats();
  loadPendingLeaves();
  loadAttendanceHistory();
  loadLeaveHistory();
  loadDataStats();
  updateUI();
}

function updateClock() {
  const el = document.getElementById("current-time");
  if (el) el.textContent = new Date().toLocaleTimeString();
}

// ========== INITIALIZATION ==========
async function init() {
  await openDB();
  await loadCurrentSession();
  initTabs();
  refreshAllDisplays();
  
  document.getElementById("check-in-btn").onclick = checkIn;
  document.getElementById("check-out-btn").onclick = checkOut;
  document.getElementById("submit-leave-btn").onclick = submitLeave;
  document.getElementById("backup-to-icloud").onclick = backupToICloud;
  document.getElementById("restore-from-icloud").onclick = restoreFromICloud;
  document.getElementById("clear-all-data").onclick = clearAllData;
  document.getElementById("export-attendance-btn").onclick = async () => {
    const data = await getAllData("attendance");
    exportToCSV(data, "attendance_export");
  };
  document.getElementById("export-leave-btn").onclick = async () => {
    const data = await getAllData("leaves");
    exportToCSV(data, "leave_export");
  };
  document.getElementById("saveEditBtn").onclick = saveEdit;
  document.getElementById("closeModalBtn").onclick = closeModal;
  
  setInterval(updateClock, 1000);
  updateClock();
  updateSyncStatus(navigator.onLine ? "✨ Online" : "📡 Offline");
  
  window.addEventListener("online", () => updateSyncStatus("✨ Online"));
  window.addEventListener("offline", () => updateSyncStatus("📡 Offline"));
}

// Start the app
init();
