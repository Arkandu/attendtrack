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
      session: session,
      totalRecords: {
        attendance: attendance.length,
        leaves: leaves.length
      }
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
        
        if (!data.attendance || !data.leaves) {
          throw new Error("Invalid backup file");
        }
        
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
  
  const doubleConfirm = confirm("LAST CHANCE: Are you ABSOLUTELY sure?");
  if (!doubleConfirm) return;
  
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
 
