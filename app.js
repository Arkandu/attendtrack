// ============================================
// ATTENDANCE & LEAVE TRACKER WITH ICLOUD SYNC
// ============================================

let db;
let currentSession = null;

// ========== DATABASE SETUP ==========

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AttendTrackDB", 2);
    
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

// ========== NETWORK STATUS ==========

const isOnline = () => navigator.onLine;

const updateSyncStatus = (status) => {
  const statusDiv = document.getElementById("sync-status");
  if (statusDiv) statusDiv.textContent = status;
};

// ========== EXPORT TO EXCEL (CSV) ==========

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
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: "iOS PWA"
      },
      attendance: attendance,
      leaves: leaves,
      session: session,
      totalRecords: {
        attendance: attendance.length,
        leaves: leaves.length
      }
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const filename = `attendtrack_backup_${new Date().toISOString().split("T")[0]}.json`;
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    
    updateSyncStatus("✅ Backup created");
    setTimeout(() => updateSyncStatus(isOnline() ? "📡 Online" : "📡 Offline"), 2000);
    
    showAlert("Backup created! Choose 'Save to Files' and select iCloud Drive.", "success");
  } catch (error) {
    console.error("Backup error:", error);
    updateSyncStatus("❌ Backup failed");
    showAlert("Backup failed: " + error.message, "error");
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
        
        if (!data.version || !data.attendance || !data.leaves) {
          throw new Error("Invalid backup file format");
        }
        
        if (data.attendance && Array.isArray(data.attendance)) {
          const existing = await getAllData("attendance");
          for (let record of data.attendance) {
            const exists = existing.some(e => 
              e.checkInTime === record.checkInTime && 
              e.date === record.date
            );
            if (!exists && record.checkInTime) {
              await addData("attendance", record);
              imported.attendance++;
            }
          }
        }
        
        if (data.leaves && Array.isArray(data.leaves)) {
          const existing = await getAllData("leaves");
          for (let leave of data.leaves) {
            const exists = existing.some(e => e.submittedAt === leave.submittedAt);
            if (!exists && leave.submittedAt) {
              await addData("leaves", leave);
              imported.leaves++;
            }
          }
        }
        
        updateSyncStatus("✅ Restore complete");
        showAlert(`Restored ${imported.attendance} attendance and ${imported.leaves} leave records!`, "success");
        refreshAllDisplays();
        
      } catch (error) {
        console.error("Restore error:", error);
        updateSyncStatus("❌ Restore failed");
        showAlert("Restore failed: " + error.message, "error");
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
};

const clearAllData = async () => {
  const confirmClear = confirm("⚠️ WARNING: This will delete ALL data. This cannot be undone. Are you sure?");
  if (!confirmClear) return;
  
  const doubleConfirm = confirm("LAST CHANCE: Are you ABSOLUTELY sure? All your data will be permanently deleted.");
  if (!doubleConfirm) return;
  
  try {
    await deleteAllData("attendance");
    await deleteAllData("leaves");
    await deleteAllData("session");
    
    currentSession = null;
    await updateData("session", { key: "currentSession", value: null });
    
    showAlert("All data has been cleared.", "success");
    refreshAllDisplays();
  } catch (error) {
    console.error("Clear data error:", error);
    showAlert("Error clearing data: " + error.message, "error");
  }
};

// ========== ATTENDANCE FUNCTIONS WITH EDIT ==========

const loadCurrentSession = async () => {
  const session = await getData("session", "currentSession");
  if (session && session.value) {
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
    statusBadge.textContent = "● Checked In";
    statusBadge.className = "status-badge status-checked-in";
    checkInBtn.style.display = "none";
    checkOutBtn.style.display = "block";
    statusText.textContent = `Checked in at ${new Date(currentSession.checkInTime).toLocaleTimeString()}`;
  } else {
    statusBadge.textContent = "● Checked Out";
    statusBadge.className = "status-badge status-checked-out";
    checkInBtn.style.display = "block";
    checkOutBtn.style.display = "none";
    statusText.textContent = "Ready to check in";
  }
};

const checkIn = async () => {
  if (currentSession && !currentSession.checkOutTime) {
    showAlert("You are already checked in!", "warning");
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
};

const checkOut = async () => {
  if (!currentSession || currentSession.checkOutTime) {
    showAlert("You are not checked in!", "warning");
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
  
  const checkInTime = new Date(currentSession.checkInTime);
  const duration = Math.round((now - checkInTime) / 1000 / 60);
  
  showAlert(`Checked out at ${now.toLocaleTimeString()}. Duration: ${duration} minutes`, "success");
  refreshAllDisplays();
};

// Edit past attendance
const editAttendanceRecord = async (recordId, newCheckOutTime) => {
  const allAttendance = await getAllData("attendance");
  const record = allAttendance.find(r => r.id === recordId);
  
  if (record) {
    record.checkOutTime = newCheckOutTime;
    await updateData("attendance", record);
    showAlert("Attendance record updated!", "success");
    refreshAllDisplays();
  }
};

// ========== LEAVE FUNCTIONS ==========

const submitLeave = async () => {
  const start = document.getElementById("leave-start").value;
  const end = document.getElementById("leave-end").value;
  const reason = document.getElementById("leave-reason").value;
  
  if (!start || !end) {
    showAlert("Please select start and end dates", "warning");
    return;
  }
  
  if (new Date(start) > new Date(end)) {
    showAlert("End date must be after start date", "warning");
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

// ========== LOAD DATA DISPLAYS ==========

const loadTodayActivity = async () => {
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = await getDataByIndex("attendance", "date", today);
  const activityDiv = document.getElementById("today-activity");
  
  if (todayRecords.length === 0) {
    activityDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #8e8e93;">✨ No activity today</div>';
  } else {
    let html = "";
    for (let record of todayRecords.reverse()) {
      const checkIn = new Date(record.checkInTime).toLocaleTimeString();
      const checkOut = record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Still checked in";
      html += `<div class="record-item">
        <div style="font-weight: 600;">✓ Check In: ${checkIn}</div>
        <div style="color: #8e8e93;">🔴 Check Out: ${checkOut}</div>
      </div>`;
    }
    activityDiv.innerHTML = html;
  }
};

const loadSummaryStats = async () => {
  const allAttendance = await getAllData("attendance");
  const allLeaves = await getAllData("leaves");
  
  const now = new Date();
  const thisMonth = now.toISOString().split("T")[0].substring(0, 7);
  
  const thisMonthAttendance = allAttendance.filter(a => a.date.startsWith(thisMonth));
  const thisMonthLeaves = allLeaves.filter(l => l.startDate.startsWith(thisMonth));
  const approvedLeaves = thisMonthLeaves.filter(l => l.status === "approved");
  
  const totalMinutes = thisMonthAttendance.reduce((total, record) => {
    if (record.checkOutTime) {
      const checkIn = new Date(record.checkInTime);
      const checkOut = new Date(record.checkOutTime);
      return total + (checkOut - checkIn) / 1000 / 60;
    }
    return total;
  }, 0);
  
  const hoursWorked = Math.round(totalMinutes / 60 * 10) / 10;
  
  const statsDiv = document.getElementById("summary-stats");
  statsDiv.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${thisMonthAttendance.length}</div>
        <div class="stat-label">Days Worked</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${hoursWorked}</div>
        <div class="stat-label">Hours This Month</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${approvedLeaves.length}</div>
        <div class="stat-label">Approved Leaves</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${allAttendance.length}</div>
        <div class="stat-label">Total Records</div>
      </div>
    </div>
  `;
};

const loadPendingLeaves = async () => {
  const allLeaves = await getAllData("leaves");
  const pending = allLeaves.filter(l => l.status === "pending").reverse();
  const pendingDiv = document.getElementById("pending-leaves");
  
  if (pending.length === 0) {
    pendingDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #8e8e93;">No pending requests</div>';
  } else {
    let html = "";
    for (let leave of pending) {
      html += `<div class="leave-request">
        <strong>📅 ${leave.startDate} → ${leave.endDate}</strong><br>
        📝 ${leave.reason}<br>
        <span style="color: #ff9500;">⏳ Pending</span>
      </div>`;
    }
    pendingDiv.innerHTML = html;
  }
};

const loadAttendanceHistory = async () => {
  const allAttendance = await getAllData("attendance");
  const historyDiv = document.getElementById("attendance-history");
  
  if (allAttendance.length === 0) {
    historyDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #8e8e93;">No attendance records</div>';
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
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 8px;">📆 ${date}</div>`;
      for (let record of grouped[date]) {
        const checkIn = new Date(record.checkInTime).toLocaleTimeString();
        const checkOut = record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active";
        html += `<div class="record-item" style="margin-left: 12px;">
          <div>✅ ${checkIn} → ${checkOut}</div>
          <div style="font-size: 12px; color: #8e8e93;">ID: ${record.id}</div>
        </div>`;
      }
      html += `</div>`;
    }
    historyDiv.innerHTML = html;
  }
};

const loadLeaveHistory = async () => {
  const allLeaves = await getAllData("leaves");
  const historyDiv = document.getElementById("leave-history");
  
  if (allLeaves.length === 0) {
    historyDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #8e8e93;">No leave records</div>';
  } else {
    let html = "";
    for (let leave of allLeaves.reverse()) {
      const statusColor = leave.status === "approved" ? "#34c759" : leave.status === "rejected" ? "#ff3b30" : "#ff9500";
      const statusText = leave.status === "approved" ? "✅ Approved" : leave.status === "rejected" ? "❌ Rejected" : "⏳ Pending";
      html += `<div class="leave-request" style="border-left-color: ${statusColor}">
        <strong>📅 ${leave.startDate} → ${leave.endDate}</strong><br>
        📝 ${leave.reason}<br>
        <span style="color: ${statusColor};">${statusText}</span>
      </div>`;
    }
    historyDiv.innerHTML = html;
  }
};

const loadDataStats = async () => {
  const attendance = await getAllData("attendance");
  const leaves = await getAllData("leaves");
  
  const statsDiv = document.getElementById("data-stats");
  statsDiv.innerHTML = `
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
  const attendanceTab = document.getElementById("attendance-tab");
  const leaveTab = document.getElementById("leave-tab");
  const historyTab = document.getElementById("history-tab");
  const backupTab = document.getElementById("backup-tab");
  
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      attendanceTab.style.display = "none";
      leaveTab.style.display = "none";
      historyTab.style.display = "none";
      backupTab.style.display = "none";
      
      if (tabName === "attendance") {
        attendanceTab.style.display = "block";
        loadTodayActivity();
        loadSummaryStats();
      } else if (tabName === "leave") {
        leaveTab.style.display = "block";
        loadPendingLeaves();
      } else if (tabName === "history") {
        historyTab.style.display = "block";
        loadAttendanceHistory();
        loadLeaveHistory();
      } else if (tabName === "backup") {
        backupTab.style.display = "block";
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
  
  setTimeout(() => {
    alertDiv.remove();
  }, 3000);
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
  
  setInterval(updateClock, 1000);
  updateClock();
  
  updateSyncStatus(isOnline() ? "📡 Online" : "📡 Offline");
};

init();
