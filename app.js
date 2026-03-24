// ============================================
// ATTENDANCE TRACKER PRO - FULL EDIT CAPABILITY
// ============================================

let db;
let currentSession = null;
let currentEditId = null;

// ========== DATABASE SETUP ==========

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AttendTrackProDB", 3);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains("attendance")) {
        const attendanceStore = db.createObjectStore("attendance", { keyPath: "id", autoIncrement: true });
        attendanceStore.createIndex("date", "date", { unique: false });
        attendanceStore.createIndex("timestamp", "timestamp", { unique: false });
      }
      
      if (!db.objectStoreNames.contains("leaves")) {
        const leaveStore = db.createObjectStore("leaves", { keyPath: "id", autoIncrement: true });
        leaveStore.createIndex("status", "status", { unique: false });
        leaveStore.createIndex("submittedAt", "submittedAt", { unique: false });
      }
      
      if (!db.objectStoreNames.contains("session")) {
        db.createObjectStore("session", { keyPath: "key" });
      }
    };
  });
};

// ========== DATABASE HELPERS ==========

const addData = (storeName, data) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.add(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const updateData = (storeName, data) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getData = (storeName, key) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllData = (storeName) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getDataByIndex = (storeName, indexName, value) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const deleteAllData = (storeName) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const deleteRecord = (storeName, id) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ========== NETWORK STATUS ==========

const isOnline = () => navigator.onLine;
const updateSyncStatus = (status) => {
  const statusDiv = document.getElementById("sync-status");
  if (statusDiv) statusDiv.textContent = status;
};

// ========== EXPORT TO EXCEL ==========

const exportToCSV = (data, filename, type = "attendance") => {
  if (!data || data.length === 0) {
    showAlert(`No ${type} data to export`, "warning");
    return;
  }
  
  let headers = [];
  let rows = [];
  
  if (type === "attendance") {
    headers = ["ID", "Date", "Check In Time", "Check Out Time", "Duration (minutes)"];
    rows = data.map(record => {
      const checkIn = new Date(record.checkInTime);
      const checkOut = record.checkOutTime ? new Date(record.checkOutTime) : null;
      const duration = checkOut ? Math.round((checkOut - checkIn) / 1000 / 60) : "In Progress";
      return [
        record.id,
        record.date,
        checkIn.toLocaleString(),
        checkOut ? checkOut.toLocaleString() : "Not checked out",
        duration
      ];
    });
  } else if (type === "leave") {
    headers = ["ID", "Start Date", "End Date", "Reason", "Status", "Submitted At"];
    rows = data.map(record => [
      record.id,
      record.startDate,
      record.endDate,
      record.reason,
      record.status,
      new Date(record.submittedAt).toLocaleString()
    ]);
  }
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  showAlert(`Exported ${data.length} ${type} records`, "success");
};

// ========== ICLOUD BACKUP ==========

const backupToICloudDrive = async () => {
  try {
    updateSyncStatus("📤 Creating backup...");
    
    const attendance = await getAllData("attendance");
    const leaves = await getAllData("leaves");
    const session = await getData("session", "currentSession");
    
    const exportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      attendance: attendance,
      leaves: leaves,
      session: session
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendtrack_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    updateSyncStatus("✅ Backup saved");
    showAlert("Backup created! Save to iCloud Drive.", "success");
  } catch (error) {
    showAlert("Backup failed: " + error.message, "warning");
  }
};

const restoreFromICloudDrive = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    updateSyncStatus("📥 Restoring...");
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        let imported = { attendance: 0, leaves: 0 };
        
        if (data.attendance && Array.isArray(data.attendance)) {
          const existing = await getAllData("attendance");
          for (let record of data.attendance) {
            const exists = existing.some(e => e.checkInTime === record.checkInTime);
            if (!exists) {
              await addData("attendance", record);
              imported.attendance++;
            }
          }
        }
        
        if (data.leaves && Array.isArray(data.leaves)) {
          const existing = await getAllData("leaves");
          for (let leave of data.leaves) {
            const exists = existing.some(e => e.submittedAt === leave.submittedAt);
            if (!exists) {
              await addData("leaves", leave);
              imported.leaves++;
            }
          }
        }
        
        updateSyncStatus("✅ Restored");
        showAlert(`Restored ${imported.attendance} attendance, ${imported.leaves} leaves!`, "success");
        refreshAllDisplays();
      } catch (error) {
        showAlert("Restore failed: Invalid file", "warning");
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
};

const clearAllData = async () => {
  const confirmClear = confirm("⚠️ Delete ALL data? This cannot be undone.");
  if (!confirmClear) return;
  
  await deleteAllData("attendance");
  await deleteAllData("leaves");
  await deleteAllData("session");
  currentSession = null;
  
  showAlert("All data cleared", "success");
  refreshAllDisplays();
};

// ========== EDIT FUNCTIONS ==========

const openEditModal = async (recordId) => {
  const allAttendance = await getAllData("attendance");
  const record = allAttendance.find(r => r.id === recordId);
  
  if (!record) return;
  
  currentEditId = recordId;
  
  const checkInInput = document.getElementById("edit-checkin");
  const checkOutInput = document.getElementById("edit-checkout");
  
  // Format datetime-local value
  const checkInDate = new Date(record.checkInTime);
  const checkOutDate = record.checkOutTime ? new Date(record.checkOutTime) : null;
  
  checkInInput.value = checkInDate.toISOString().slice(0, 16);
  if (checkOutDate) {
    checkOutInput.value = checkOutDate.toISOString().slice(0, 16);
  } else {
    checkOutInput.value = "";
  }
  
  document.getElementById("editModal").classList.add("active");
};

const saveEdit = async () => {
  if (!currentEditId) return;
  
  const allAttendance = await getAllData("attendance");
  const record = allAttendance.find(r => r.id === currentEditId);
  
  if (!record) return;
  
  const checkInValue = document.getElementById("edit-checkin").value;
  const checkOutValue = document.getElementById("edit-checkout").value;
  
  if (!checkInValue) {
    showAlert("Check-in time is required", "warning");
    return;
  }
  
  const newCheckIn = new Date(checkInValue);
  const newCheckOut = checkOutValue ? new Date(checkOutValue) : null;
  
  record.checkInTime = newCheckIn.toISOString();
  record.checkOutTime = newCheckOut ? newCheckOut.toISOString() : null;
  record.date = newCheckIn.toISOString().split("T")[0];
  
  await updateData("attendance", record);
  
  // Update current session if this was the active one
  if (currentSession && currentSession.checkInTime === record.checkInTime) {
    if (newCheckOut) {
      currentSession.checkOutTime = newCheckOut.toISOString();
      await updateData("session", { key: "currentSession", value: currentSession });
    }
  }
  
  closeModal();
  showAlert("Attendance record updated!", "success");
  refreshAllDisplays();
};

const deleteRecordHandler = async (recordId) => {
  const confirmDelete = confirm("Delete this record? This cannot be undone.");
  if (!confirmDelete) return;
  
  await deleteRecord("attendance", recordId);
  showAlert("Record deleted", "success");
  refreshAllDisplays();
};

const closeModal = () => {
  document.getElementById("editModal").classList.remove("active");
  currentEditId = null;
};

// ========== ATTENDANCE FUNCTIONS ==========

const loadCurrentSession = async () => {
  const session = await getData("session", "currentSession");
  if (session && session.value && !session.value.checkOutTime) {
    currentSession = session.value;
  }
  updateUIForSession();
};

const saveCurrentSession = async (session) => {
  currentSession = session;
  await updateData("session", { key: "currentSession", value: session });
  updateUIForSession();
};

const updateUIForSession = () => {
  const statusBadge = document.getElementById("status-badge");
  const checkInBtn = document.getElementById("check-in-btn");
  const checkOutBtn = document.getElementById("check-out-btn");
  const statusText = document.getElementById("current-status-text");
  
  if (currentSession && !currentSession.checkOutTime) {
    statusBadge.innerHTML = '<span>●</span> Checked In';
    statusBadge.className = "status-badge status-checked-in";
    checkInBtn.style.display = "none";
    checkOutBtn.style.display = "block";
    statusText.textContent = `Checked in at ${new Date(currentSession.checkInTime).toLocaleTimeString()}`;
  } else {
    statusBadge.innerHTML = '<span>●</span> Checked Out';
    statusBadge.className = "status-badge status-checked-out";
    checkInBtn.style.display = "block";
    checkOutBtn.style.display = "none";
    statusText.textContent = "Ready to start your day";
  }
};

const checkIn = async () => {
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
  
  showAlert(`✨ Checked in at ${now.toLocaleTimeString()}`, "success");
  refreshAllDisplays();
};

const checkOut = async () => {
  if (!currentSession || currentSession.checkOutTime) {
    showAlert("Not checked in!", "warning");
    return;
  }
  
  const now = new Date();
  currentSession.checkOutTime = now.toISOString();
  await saveCurrentSession(currentSession);
  
  const allAttendance = await getAllData("attendance");
  const lastRecord = allAttendance.reverse().find(r => !r.checkOutTime);
  if (lastRecord) {
    lastRecord.checkOutTime = now.toISOString();
    await updateData("attendance", lastRecord);
  }
  
  const duration = Math.round((now - new Date(currentSession.checkInTime)) / 1000 / 60);
  showAlert(`🔴 Checked out at ${now.toLocaleTimeString()} (${duration} min)`, "success");
  refreshAllDisplays();
};

// ========== LEAVE FUNCTIONS ==========

const submitLeave = async () => {
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
};

// ========== LOAD DISPLAYS ==========

const loadTodayActivity = async () => {
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = await getDataByIndex("attendance", "date", today);
  const activityDiv = document.getElementById("today-activity");
  
  if (todayRecords.length === 0) {
    activityDiv.innerHTML = '<div class="empty-state">✨ No activity yet today</div>';
  } else {
    let html = "";
    for (let record of todayRecords.reverse()) {
      const checkIn = new Date(record.checkInTime).toLocaleTimeString();
      const checkOut = record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active";
      html += `
        <div class="record-item">
          <div class="record-header">
            <span class="record-date">✅ ${checkIn}</span>
            <div class="record-actions">
              ${record.checkOutTime ? `<button class="btn-edit btn-icon" onclick="openEditModal(${record.id})">✏️ Edit</button>` : ''}
            </div>
          </div>
          <div class="record-detail">🔴 Check Out: ${checkOut}</div>
        </div>
      `;
    }
    activityDiv.innerHTML = html;
  }
};

const loadSummaryStats = async () => {
  const allAttendance = await getAllData("attendance");
  const now = new Date();
  const thisMonth = now.toISOString().split("T")[0].substring(0, 7);
  
  const thisMonthAttendance = allAttendance.filter(a => a.date.startsWith(thisMonth));
  
  const totalMinutes = thisMonthAttendance.reduce((total, record) => {
    if (record.checkOutTime) {
      const checkIn = new Date(record.checkInTime);
      const checkOut = new Date(record.checkOutTime);
      return total + (checkOut - checkIn) / 1000 / 60;
    }
    return total;
  }, 0);
  
  const hoursWorked = Math.round(totalMinutes / 60 * 10) / 10;
  
  document.getElementById("summary-stats").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${thisMonthAttendance.length}</div>
        <div class="stat-label">Days Worked</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${hoursWorked}</div>
        <div class="stat-label">Hours This Month</div>
      </div>
    </div>
  `;
};

const loadAttendanceHistory = async () => {
  const allAttendance = await getAllData("attendance");
  const historyDiv = document.getElementById("attendance-history");
  
  if (allAttendance.length === 0) {
    historyDiv.innerHTML = '<div class="empty-state">No attendance records</div>';
  } else {
    const grouped = {};
    for (let record of allAttendance) {
      if (!grouped[record.date]) grouped[record.date] = [];
      grouped[record.date].push(record);
    }
    
    let html = "";
    const dates = Object.keys(grouped).sort().reverse();
    for (let date of dates.slice(0, 30)) {
      html += `<div style="margin-bottom: 20px;">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 12px; color: white;">📆 ${date}</div>`;
      for (let record of grouped[date]) {
        const checkIn = new Date(record.checkInTime).toLocaleTimeString();
        const checkOut = record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active";
        html += `
          <div class="record-item">
            <div class="record-header">
              <div>
                <div>✅ ${checkIn} → ${checkOut}</div>
                <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 4px;">ID: ${record.id}</div>
              </div>
              <div class="record-actions">
                <button class="btn-edit btn-icon" onclick="openEditModal(${record.id})">✏️ Edit</button>
                <button class="btn-edit btn-icon" style="background: linear-gradient(135deg, #ff3b30, #ff2d20);" onclick="deleteRecordHandler(${record.id})">🗑️</button>
              </div>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }
    historyDiv.innerHTML = html;
  }
};

const loadPendingLeaves = async () => {
  const allLeaves = await getAllData("leaves");
  const pending = allLeaves.filter(l => l.status === "pending").reverse();
  const pendingDiv = document.getElementById("pending-leaves");
  
  if (pending.length === 0) {
    pendingDiv.innerHTML = '<div class="empty-state">No pending requests</div>';
  } else {
    let html = "";
    for (let leave of pending) {
      html += `
        <div class="leave-request">
          <strong>📅 ${leave.startDate} → ${leave.endDate}</strong>
          <div style="margin: 8px 0;">📝 ${leave.reason}</div>
          <span style="color: #ff9500;">⏳ Pending</span>
        </div>
      `;
    }
    pendingDiv.innerHTML = html;
  }
};

const loadLeaveHistory = async () => {
  const allLeaves = await getAllData("leaves");
  const historyDiv = document.getElementById("leave-history");
  
  if (allLeaves.length === 0) {
    historyDiv.innerHTML = '<div class="empty-state">No leave records</div>';
  } else {
    let html = "";
    for (let leave of allLeaves.reverse()) {
      const statusColor = leave.status === "approved" ? "#34c759" : leave.status === "rejected" ? "#ff3b30" : "#ff9500";
      const statusText = leave.status === "approved" ? "✅ Approved" : leave.status === "rejected" ? "❌ Rejected" : "⏳ Pending";
      html += `
        <div class="leave-request" style="border-left-color: ${statusColor}">
          <strong>📅 ${leave.startDate} → ${leave.endDate}</strong>
          <div style="margin: 8px 0;">📝 ${leave.reason}</div>
          <span style="color: ${statusColor};">${statusText}</span>
        </div>
      `;
    }
    historyDiv.innerHTML = html;
  }
};

const loadDataStats = async () => {
  const attendance = await getAllData("attendance");
  const leaves = await getAllData("leaves");
  
  document.getElementById("data-stats").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${attendance.length}</div>
        <div class="stat-label">Attendance Records</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${leaves.length}</div>
        <div class="stat-label">Leave Requests</div>
      </div>
    </div>
  `;
};

// ========== TAB NAVIGATION ==========

const initTabs = () => {
  const tabs = document.querySelectorAll(".tab");
  const tabsContent = {
    attendance: document.getElementById("attendance-tab"),
    leave: document.getElementById("leave-tab"),
    history: document.getElementById("history-tab"),
    backup: document.getElementById("backup-tab")
  };
  
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      Object.values(tabsContent).forEach(content => {
        if (content) content.style.display = "none";
      });
      
      if (tabsContent[tabName]) {
        tabsContent[tabName].style.display = "block";
      }
      
      if (tabName === "attendance") {
        loadTodayActivity();
        loadSummaryStats();
      } else if (tabName === "leave") {
        loadPendingLeaves();
      } else if (tabName === "history") {
        loadAttendanceHistory();
        loadLeaveHistory();
      } else if (tabName === "backup") {
        loadDataStats();
      }
    });
  });
};

// ========== HELPER FUNCTIONS ==========

const showAlert = (message, type) => {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 3000);
};

const refreshAllDisplays = () => {
  loadTodayActivity();
  loadSummaryStats();
  loadPendingLeaves();
  loadAttendanceHistory();
  loadLeaveHistory();
  loadDataStats();
  updateUIForSession();
};

const updateClock = () => {
  const timeDiv = document.getElementById("current-time");
  if (timeDiv) {
    timeDiv.textContent = new Date().toLocaleTimeString();
  }
};

// Make functions global for onclick handlers
window.openEditModal = openEditModal;
window.deleteRecordHandler = deleteRecordHandler;

// ========== INITIALIZATION ==========

const init = async () => {
  await openDB();
  await loadCurrentSession();
  initTabs();
  refreshAllDisplays();
  
  document.getElementById("check-in-btn").addEventListener("click", checkIn);
  document.getElementById("check-out-btn").addEventListener("click", checkOut);
  document.getElementById("submit-leave-btn").addEventListener("click", submitLeave);
  document.getElementById("backup-to-icloud").addEventListener("click", backupToICloudDrive);
  document.getElementById("restore-from-icloud").addEventListener("click", restoreFromICloudDrive);
  document.getElementById("clear-all-data").addEventListener("click", clearAllData);
  document.getElementById("export-attendance-btn").addEventListener("click", async () => {
    const data = await getAllData("attendance");
    exportToCSV(data, "attendance_export", "attendance");
  });
  document.getElementById("export-leave-btn").addEventListener("click", async () => {
    const data = await getAllData("leaves");
    exportToCSV(data, "leave_export", "leave");
  });
  document.getElementById("saveEditBtn").addEventListener("click", saveEdit);
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  
  setInterval(updateClock, 1000);
  updateClock();
  updateSyncStatus(isOnline() ? "✨ Online" : "📡 Offline");
};

init();
