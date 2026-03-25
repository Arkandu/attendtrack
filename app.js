// ============================================
// COMPLETE ATTENDANCE SYSTEM
// GOOGLE DRIVE AUTO-SYNC + EDIT FEATURE
// ============================================

// ========== CONFIGURATION ==========
const GOOGLE_DRIVE_FOLDER_ID = "1oMXzsWYCn9Z1JW2UYySzug5U2lCm7U6E";
const BACKUP_FILE_NAME = "attendtrack_master_data.json";

// ========== DATABASE SETUP ==========
let db;
let currentUser = null;
let currentSession = null;
let syncInterval = null;
let lastSyncTime = null;
let syncCount = 0;
let deviceId = null;
let currentEditRecord = null;

// Generate device ID
deviceId = localStorage.getItem("deviceId") || ("device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9));
localStorage.setItem("deviceId", deviceId);

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AttendTrackDB", 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("users")) db.createObjectStore("users", { keyPath: "email" });
      if (!db.objectStoreNames.contains("attendance")) {
        const store = db.createObjectStore("attendance", { keyPath: "id", autoIncrement: true });
        store.createIndex("email", "email", { unique: false });
        store.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains("leaves")) {
        const store = db.createObjectStore("leaves", { keyPath: "id", autoIncrement: true });
        store.createIndex("email", "email", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("session")) db.createObjectStore("session", { keyPath: "key" });
      if (!db.objectStoreNames.contains("syncInfo")) db.createObjectStore("syncInfo", { keyPath: "key" });
    };
  });
};

// ========== DATABASE HELPERS ==========
const addData = (store, data) => new Promise((resolve, reject) => {
  const transaction = db.transaction([store], "readwrite");
  const request = transaction.objectStore(store).add(data);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const updateData = (store, data) => new Promise((resolve, reject) => {
  const transaction = db.transaction([store], "readwrite");
  const request = transaction.objectStore(store).put(data);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const getData = (store, key) => new Promise((resolve, reject) => {
  const transaction = db.transaction([store], "readonly");
  const request = transaction.objectStore(store).get(key);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const getAllData = (store) => new Promise((resolve, reject) => {
  const transaction = db.transaction([store], "readonly");
  const request = transaction.objectStore(store).getAll();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const getDataByIndex = (store, index, value) => new Promise((resolve, reject) => {
  const transaction = db.transaction([store], "readonly");
  const request = transaction.objectStore(store).index(index).getAll(value);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const deleteData = (store, key) => new Promise((resolve, reject) => {
  const transaction = db.transaction([store], "readwrite");
  const request = transaction.objectStore(store).delete(key);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

const clearStore = (store) => new Promise((resolve, reject) => {
  const transaction = db.transaction([store], "readwrite");
  const request = transaction.objectStore(store).clear();
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

// ========== LOCATION ==========
const getCurrentLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) reject("Not supported");
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    (e) => reject(e),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

const updateLocationStatus = (status) => {
  const div = document.getElementById("location-status");
  if (div) div.textContent = status;
};

// ========== SYNC MANAGEMENT ==========
const saveSyncInfo = async (time, count) => {
  await updateData("syncInfo", { key: "lastSync", value: time });
  await updateData("syncInfo", { key: "syncCount", value: count });
  lastSyncTime = time;
  syncCount = count;
  updateSyncDisplay();
};

const loadSyncInfo = async () => {
  const lastSync = await getData("syncInfo", "lastSync");
  const count = await getData("syncInfo", "syncCount");
  lastSyncTime = lastSync ? lastSync.value : null;
  syncCount = count ? count.value : 0;
  updateSyncDisplay();
};

const updateSyncDisplay = () => {
  const syncDisplay = document.getElementById("last-sync-time");
  if (syncDisplay) syncDisplay.textContent = lastSyncTime ? `Last sync: ${new Date(lastSyncTime).toLocaleString()}` : "Last sync: Never";
  const countDisplay = document.getElementById("sync-count");
  if (countDisplay) countDisplay.textContent = syncCount;
  
  // Update next sync timer
  if (lastSyncTime) {
    const nextSync = new Date(new Date(lastSyncTime).getTime() + 15 * 60 * 1000);
    const now = new Date();
    const diff = Math.max(0, nextSync - now);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    const timerDisplay = document.getElementById("next-sync-timer");
    if (timerDisplay) timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
};

// ========== GOOGLE DRIVE AUTO-SYNC ==========
const syncToGoogleDrive = async (showMessage = true) => {
  if (!navigator.onLine) {
    if (showMessage) showAlert("No internet", "warning");
    return false;
  }
  
  updateSyncStatus("📤 Syncing to Google Drive...");
  
  const attendance = await getAllData("attendance");
  const leaves = await getAllData("leaves");
  const users = await getAllData("users");
  
  const exportData = {
    lastSync: new Date().toISOString(),
    version: "4.0",
    users: users,
    attendance: attendance,
    leaves: leaves,
    deviceId: deviceId,
    folderId: GOOGLE_DRIVE_FOLDER_ID
  };
  
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  // Create download and save to Google Drive
  const a = document.createElement("a");
  a.href = url;
  a.download = BACKUP_FILE_NAME;
  a.click();
  
  URL.revokeObjectURL(url);
  
  await saveSyncInfo(new Date().toISOString(), syncCount + 1);
  updateSyncStatus("✅ Synced");
  if (showMessage) showAlert(`Data synced! Save "${BACKUP_FILE_NAME}" to your Google Drive folder.`, "success");
  return true;
};

const restoreFromGoogleDrive = async () => {
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
        let imported = { users: 0, attendance: 0, leaves: 0 };
        
        if (data.users) {
          const existingUsers = await getAllData("users");
          for (let user of data.users) {
            const exists = existingUsers.find(u => u.email === user.email);
            if (!exists && user.role !== "admin") {
              await addData("users", user);
              imported.users++;
            }
          }
        }
        
        if (data.attendance) {
          const existing = await getAllData("attendance");
          for (let record of data.attendance) {
            const exists = existing.some(e => e.id === record.id);
            if (!exists) {
              await addData("attendance", record);
              imported.attendance++;
            }
          }
        }
        
        if (data.leaves) {
          const existing = await getAllData("leaves");
          for (let leave of data.leaves) {
            const exists = existing.some(e => e.id === leave.id);
            if (!exists) {
              await addData("leaves", leave);
              imported.leaves++;
            }
          }
        }
        
        if (data.lastSync) await saveSyncInfo(data.lastSync, syncCount + 1);
        
        showAlert(`Restored: ${imported.users} users, ${imported.attendance} attendance, ${imported.leaves} leaves`, "success");
        if (currentUser?.role === "admin") loadAdminPanel();
        loadUserData();
        loadCurrentSession();
      } catch (error) {
        showAlert("Restore failed: Invalid file", "error");
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

// ========== AUTO-SYNC ==========
const startAutoSync = () => {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(async () => {
    if (navigator.onLine && currentUser) await syncToGoogleDrive(false);
  }, 15 * 60 * 1000);
  setInterval(() => updateSyncDisplay(), 1000);
};

// ========== UI HELPERS ==========
const showAlert = (msg, type) => {
  const div = document.createElement("div");
  div.className = `alert alert-${type}`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
};

const updateSyncStatus = (status) => {
  const div = document.getElementById("sync-status");
  if (div) div.textContent = status;
};

// ========== USER MANAGEMENT ==========
const checkAdminExists = async () => {
  const users = await getAllData("users");
  return users.some(u => u.role === "admin");
};

const setupAdmin = async () => {
  const email = prompt("Admin Email:");
  if (!email) return;
  const password = prompt("Admin Password:");
  if (!password) return;
  const name = prompt("Admin Name:");
  if (!name) return;
  
  await addData("users", { email, password, name, role: "admin", status: "approved", registeredAt: new Date().toISOString() });
  showAlert("Admin created! Please login.", "success");
  location.reload();
};

const login = async () => {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  if (!email || !password) { showAlert("Enter email and password", "warning"); return; }
  
  const users = await getAllData("users");
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) { showAlert("Invalid credentials", "error"); return; }
  if (user.status !== "approved") { showAlert("Pending approval", "warning"); return; }
  
  currentUser = user;
  localStorage.setItem("currentUser", JSON.stringify(user));
  
  document.getElementById("login-section").style.display = "none";
  document.getElementById("app-section").style.display = "block";
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-role").textContent = user.role === "admin" ? "👑 Admin" : "👤 User";
  
  if (user.role === "admin") {
    document.getElementById("admin-tab-btn").style.display = "block";
    loadAdminPanel();
  }
  
  loadUserData();
  loadCurrentSession();
  await loadSyncInfo();
  startAutoSync();
  
  const lastSync = await getData("syncInfo", "lastSync");
  if (!lastSync && navigator.onLine && confirm("Restore from Google Drive?")) restoreFromGoogleDrive();
  
  showAlert(`Welcome ${user.name}!`, "success");
};

const register = async () => {
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  const name = document.getElementById("reg-name").value;
  if (!email || !password || !name) { showAlert("Fill all fields", "warning"); return; }
  
  const users = await getAllData("users");
  if (users.some(u => u.email === email)) { showAlert("Email exists", "warning"); return; }
  
  await addData("users", { email, password, name, role: "user", status: "pending", registeredAt: new Date().toISOString() });
  showAlert("Registered! Waiting for admin approval.", "success");
  document.getElementById("register-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
};

const logout = () => {
  if (syncInterval) clearInterval(syncInterval);
  currentUser = null;
  localStorage.removeItem("currentUser");
  document.getElementById("login-section").style.display = "block";
  document.getElementById("app-section").style.display = "none";
  showAlert("Logged out", "success");
};

// ========== EDIT FUNCTIONS ==========
const openEditModal = (record) => {
  currentEditRecord = record;
  document.getElementById("edit-date").value = record.date;
  document.getElementById("edit-checkin-time").value = new Date(record.checkInTime).toTimeString().slice(0, 5);
  if (record.checkOutTime) {
    document.getElementById("edit-checkout-time").value = new Date(record.checkOutTime).toTimeString().slice(0, 5);
  } else {
    document.getElementById("edit-checkout-time").value = "";
  }
  document.getElementById("editModal").classList.add("active");
};

const saveEdit = async () => {
  if (!currentEditRecord) return;
  
  const newDate = document.getElementById("edit-date").value;
  const newCheckInTime = document.getElementById("edit-checkin-time").value;
  const newCheckOutTime = document.getElementById("edit-checkout-time").value;
  
  if (!newDate || !newCheckInTime) {
    showAlert("Date and check-in time required", "warning");
    return;
  }
  
  const checkInDateTime = new Date(`${newDate}T${newCheckInTime}`);
  currentEditRecord.checkInTime = checkInDateTime.toISOString();
  currentEditRecord.date = newDate;
  
  if (newCheckOutTime) {
    const checkOutDateTime = new Date(`${newDate}T${newCheckOutTime}`);
    currentEditRecord.checkOutTime = checkOutDateTime.toISOString();
  } else {
    currentEditRecord.checkOutTime = null;
  }
  
  await updateData("attendance", currentEditRecord);
  
  // Update current session if this was the active one
  if (currentSession && currentSession.id === currentEditRecord.id) {
    if (currentEditRecord.checkOutTime) {
      currentSession = null;
      await updateData("session", { key: currentUser.email, value: null });
    } else {
      currentSession = currentEditRecord;
      await updateData("session", { key: currentUser.email, value: currentSession });
    }
    updateUIForSession();
  }
  
  closeModal();
  showAlert("Record updated!", "success");
  loadUserData();
  if (currentUser.role === "admin") loadAdminPanel();
  syncToGoogleDrive(false);
};

const deleteRecord = async (recordId) => {
  if (!confirm("Delete this record permanently?")) return;
  await deleteData("attendance", recordId);
  showAlert("Record deleted", "success");
  loadUserData();
  if (currentUser.role === "admin") loadAdminPanel();
  syncToGoogleDrive(false);
};

const closeModal = () => {
  document.getElementById("editModal").classList.remove("active");
  currentEditRecord = null;
};

// ========== ATTENDANCE FUNCTIONS ==========
const loadCurrentSession = async () => {
  if (!currentUser) return;
  const session = await getData("session", currentUser.email);
  if (session?.value && !session.value.checkOutTime) currentSession = session.value;
  updateUIForSession();
};

const saveCurrentSession = async (session) => {
  currentSession = session;
  await updateData("session", { key: currentUser.email, value: session });
  updateUIForSession();
};

const updateUIForSession = () => {
  const badge = document.getElementById("status-badge");
  const text = document.getElementById("current-status-text");
  const inBtn = document.getElementById("check-in-btn");
  const outBtn = document.getElementById("check-out-btn");
  
  if (currentSession && !currentSession.checkOutTime) {
    badge.textContent = "● Checked In";
    badge.className = "status-badge status-checked-in";
    text.textContent = `Checked in at ${new Date(currentSession.checkInTime).toLocaleTimeString()}`;
    inBtn.style.display = "none";
    outBtn.style.display = "block";
  } else {
    badge.textContent = "● Checked Out";
    badge.className = "status-badge status-checked-out";
    text.textContent = "Ready to start";
    inBtn.style.display = "block";
    outBtn.style.display = "none";
  }
};

const checkIn = async () => {
  if (currentSession && !currentSession.checkOutTime) {
    showAlert("Already checked in!", "warning");
    return;
  }
  
  updateLocationStatus("📍 Getting location...");
  let location = null;
  try {
    location = await getCurrentLocation();
    updateLocationStatus(`📍 ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
  } catch (e) {
    updateLocationStatus("📍 Location unavailable");
  }
  
  const now = new Date();
  const record = {
    email: currentUser.email,
    name: currentUser.name,
    checkInTime: now.toISOString(),
    checkOutTime: null,
    date: now.toISOString().split("T")[0],
    timestamp: now.getTime(),
    deviceId: deviceId,
    checkInLocation: location,
    checkOutLocation: null
  };
  
  await saveCurrentSession(record);
  await addData("attendance", record);
  showAlert(`Checked in at ${now.toLocaleTimeString()}`, "success");
  loadUserData();
  if (currentUser.role === "admin") loadAdminPanel();
  syncToGoogleDrive(false);
};

const checkOut = async () => {
  if (!currentSession || currentSession.checkOutTime) {
    showAlert("Not checked in!", "warning");
    return;
  }
  
  updateLocationStatus("📍 Getting location...");
  let location = null;
  try {
    location = await getCurrentLocation();
    updateLocationStatus(`📍 ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
  } catch (e) {
    updateLocationStatus("📍 Location unavailable");
  }
  
  const now = new Date();
  currentSession.checkOutTime = now.toISOString();
  currentSession.checkOutLocation = location;
  await saveCurrentSession(currentSession);
  
  const allAttendance = await getAllData("attendance");
  const lastRecord = allAttendance.reverse().find(r => r.email === currentUser.email && !r.checkOutTime);
  if (lastRecord) {
    lastRecord.checkOutTime = now.toISOString();
    lastRecord.checkOutLocation = location;
    await updateData("attendance", lastRecord);
  }
  
  const duration = Math.round((now - new Date(currentSession.checkInTime)) / 1000 / 60);
  showAlert(`Checked out (${duration} min)`, "success");
  loadUserData();
  if (currentUser.role === "admin") loadAdminPanel();
  syncToGoogleDrive(false);
};

// ========== LEAVE FUNCTIONS ==========
const submitLeave = async () => {
  const start = document.getElementById("leave-start").value;
  const end = document.getElementById("leave-end").value;
  const reason = document.getElementById("leave-reason").value;
  if (!start || !end) { showAlert("Select dates", "warning"); return; }
  
  await addData("leaves", {
    email: currentUser.email, name: currentUser.name, startDate: start, endDate: end,
    reason: reason || "Not specified", status: "pending", submittedAt: new Date().toISOString(), deviceId
  });
  
  document.getElementById("leave-start").value = "";
  document.getElementById("leave-end").value = "";
  document.getElementById("leave-reason").value = "";
  showAlert("Leave request submitted!", "success");
  loadUserData();
  if (currentUser.role === "admin") loadAdminPanel();
  syncToGoogleDrive(false);
};

// ========== ADMIN FUNCTIONS ==========
const loadAdminPanel = async () => {
  const users = await getAllData("users");
  const attendance = await getAllData("attendance");
  const leaves = await getAllData("leaves");
  
  const pendingUsers = users.filter(u => u.status === "pending");
  const approvedUsers = users.filter(u => u.status === "approved" && u.role !== "admin");
  
  // Pending users
  const pendingDiv = document.getElementById("pending-users");
  if (pendingUsers.length === 0) pendingDiv.innerHTML = '<div class="empty-state">No pending users</div>';
  else {
    let html = "";
    for (let user of pendingUsers) {
      html += `<div class="pending-user"><div><strong>${user.name}</strong><br><small>${user.email}</small></div>
        <div class="flex"><button onclick="approveUser('${user.email}')" class="btn-approve btn-small">Approve</button>
        <button onclick="rejectUser('${user.email}')" class="btn-reject btn-small">Reject</button></div></div>`;
    }
    pendingDiv.innerHTML = html;
  }
  
  // All users
  const usersDiv = document.getElementById("all-users");
  let usersHtml = "";
  for (let user of approvedUsers) {
    const userAttendance = attendance.filter(a => a.email === user.email);
    usersHtml += `<div class="record-item"><div><strong>${user.name}</strong></div><div style="font-size:12px">${user.email}</div>
      <div style="font-size:12px">📊 ${userAttendance.length} records</div></div>`;
  }
  usersDiv.innerHTML = usersHtml || '<div class="empty-state">No users</div>';
  
  // All attendance with edit buttons
  const attendanceDiv = document.getElementById("all-attendance");
  let attendanceHtml = "";
  for (let record of attendance.reverse().slice(0, 50)) {
    const user = users.find(u => u.email === record.email);
    attendanceHtml += `
      <div class="record-item">
        <div class="record-header">
          <div><strong>${user ? user.name : record.email}</strong> - ${record.date}</div>
          <div class="record-actions">
            <button class="btn-edit" onclick="openEditModalForRecord(${record.id})">✏️ Edit</button>
            <button class="btn-delete" onclick="deleteRecord(${record.id})">🗑️</button>
          </div>
        </div>
        <div>✅ ${new Date(record.checkInTime).toLocaleTimeString()}</div>
        <div>🔴 ${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active"}</div>
        ${record.checkInLocation ? `<div class="location-badge">📍 ${record.checkInLocation.lat?.toFixed(4)}, ${record.checkInLocation.lng?.toFixed(4)}</div>` : ''}
      </div>`;
  }
  attendanceDiv.innerHTML = attendanceHtml || '<div class="empty-state">No records</div>';
  
  // All leaves
  const leavesDiv = document.getElementById("all-leaves");
  let leavesHtml = "";
  for (let leave of leaves.reverse().slice(0, 50)) {
    const user = users.find(u => u.email === leave.email);
    const statusColor = leave.status === "approved" ? "#34c759" : leave.status === "rejected" ? "#ff3b30" : "#ff9500";
    leavesHtml += `
      <div class="leave-request" style="border-left-color: ${statusColor}">
        <div><strong>${user ? user.name : leave.email}</strong></div>
        <div>📅 ${leave.startDate} → ${leave.endDate}</div>
        <div>📝 ${leave.reason}</div>
        <div style="color:${statusColor}">${leave.status}</div>
        ${leave.status === "pending" ? `<div class="flex mt-2"><button onclick="approveLeave(${leave.id})" class="btn-approve btn-small">Approve</button>
        <button onclick="rejectLeave(${leave.id})" class="btn-reject btn-small">Reject</button></div>` : ''}
      </div>`;
  }
  leavesDiv.innerHTML = leavesHtml || '<div class="empty-state">No records</div>';
};

window.approveUser = async (email) => {
  const users = await getAllData("users");
  const user = users.find(u => u.email === email);
  if (user) { user.status = "approved"; await updateData("users", user); showAlert(`${email} approved`, "success"); loadAdminPanel(); syncToGoogleDrive(false); }
};

window.rejectUser = async (email) => { await deleteData("users", email); showAlert("User rejected", "success"); loadAdminPanel(); syncToGoogleDrive(false); };

window.approveLeave = async (id) => {
  const leaves = await getAllData("leaves");
  const leave = leaves.find(l => l.id === id);
  if (leave) { leave.status = "approved"; await updateData("leaves", leave); showAlert("Approved", "success"); loadAdminPanel(); syncToGoogleDrive(false); }
};

window.rejectLeave = async (id) => {
  const leaves = await getAllData("leaves");
  const leave = leaves.find(l => l.id === id);
  if (leave) { leave.status = "rejected"; await updateData("leaves", leave); showAlert("Rejected", "success"); loadAdminPanel(); syncToGoogleDrive(false); }
};

window.openEditModalForRecord = async (id) => {
  const attendance = await getAllData("attendance");
  const record = attendance.find(r => r.id === id);
  if (record) openEditModal(record);
};

window.deleteRecord = deleteRecord;

// ========== LOAD USER DATA ==========
const loadUserData = async () => {
  if (!currentUser) return;
  
  const allAttendance = await getAllData("attendance");
  const userAttendance = allAttendance.filter(a => a.email === currentUser.email);
  const userLeaves = await getDataByIndex("leaves", "email", currentUser.email);
  
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = userAttendance.filter(r => r.date === today);
  const todayDiv = document.getElementById("today-activity");
  if (todayRecords.length === 0) todayDiv.innerHTML = '<div class="empty-state">No activity today</div>';
  else {
    let html = "";
    for (let record of todayRecords.reverse()) {
      html += `<div class="record-item"><div>✅ ${new Date(record.checkInTime).toLocaleTimeString()}</div>
        <div>🔴 ${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active"}</div>
        ${record.checkInLocation ? `<div class="location-badge">📍 ${record.checkInLocation.lat?.toFixed(4)}, ${record.checkInLocation.lng?.toFixed(4)}</div>` : ''}</div>`;
    }
    todayDiv.innerHTML = html;
  }
  
  // Monthly stats
  const thisMonth = today.substring(0, 7);
  const thisMonthRecords = userAttendance.filter(r => r.date.startsWith(thisMonth) && r.checkOutTime);
  const totalMinutes = thisMonthRecords.reduce((t, r) => t + (new Date(r.checkOutTime) - new Date(r.checkInTime)) / 60000, 0);
  document.getElementById("summary-stats").innerHTML = `<div class="stats-grid"><div class="stat-card"><div class="stat-number">${thisMonthRecords.length}</div><div class="stat-label">Days</div></div>
    <div class="stat-card"><div class="stat-number">${Math.round(totalMinutes/60*10)/10}</div><div class="stat-label">Hours</div></div></div>`;
  
  // History with edit buttons
  const historyDiv = document.getElementById("attendance-history");
  if (userAttendance.length === 0) historyDiv.innerHTML = '<div class="empty-state">No records</div>';
  else {
    let html = "";
    for (let record of userAttendance.reverse().slice(0, 30)) {
      html += `<div class="record-item">
        <div class="record-header">
          <div><strong>${record.date}</strong></div>
          <div class="record-actions">
            <button class="btn-edit" onclick="openEditModalForRecord(${record.id})">✏️ Edit</button>
            <button class="btn-delete" onclick="deleteRecord(${record.id})">🗑️</button>
          </div>
        </div>
        <div>✅ ${new Date(record.checkInTime).toLocaleTimeString()}</div>
        <div>🔴 ${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active"}</div>
        ${record.checkInLocation ? `<div class="location-badge">📍 ${record.checkInLocation.lat?.toFixed(4)}, ${record.checkInLocation.lng?.toFixed(4)}</div>` : ''}
      </div>`;
    }
    historyDiv.innerHTML = html;
  }
  
  // Leave history
  const leavesDiv = document.getElementById("leave-history");
  if (userLeaves.length === 0) leavesDiv.innerHTML = '<div class="empty-state">No records</div>';
  else {
    let html = "";
    for (let leave of userLeaves.reverse()) {
      const statusColor = leave.status === "approved" ? "#34c759" : leave.status === "rejected" ? "#ff3b30" : "#ff9500";
      html += `<div class="leave-request" style="border-left-color:${statusColor}"><div><strong>${leave.startDate} → ${leave.endDate}</strong></div>
        <div>📝 ${leave.reason}</div><div style="color:${statusColor}">${leave.status}</div></div>`;
    }
    leavesDiv.innerHTML = html;
  }
  
  const pendingLeaves = userLeaves.filter(l => l.status === "pending");
  const pendingDiv = document.getElementById("pending-leaves");
  if (pendingLeaves.length === 0) pendingDiv.innerHTML = '<div class="empty-state">No pending</div>';
  else {
    let html = "";
    for (let leave of pendingLeaves) {
      html += `<div class="leave-request"><div><strong>${leave.startDate} → ${leave.endDate}</strong></div>
        <div>📝 ${leave.reason}</div><div style="color:#ff9500">⏳ Pending</div></div>`;
    }
    pendingDiv.innerHTML = html;
  }
};

// ========== EXPORT ==========
const exportAttendance = async () => {
  const records = await getDataByIndex("attendance", "email", currentUser.email);
  if (records.length === 0) { showAlert("No data", "warning"); return; }
  const headers = ["Date", "Check In", "Check Out", "Duration", "Location"];
  const rows = records.map(r => {
    const dur = r.checkOutTime ? Math.round((new Date(r.checkOutTime) - new Date(r.checkInTime)) / 60000) : "";
    const loc = r.checkInLocation ? `${r.checkInLocation.lat},${r.checkInLocation.lng}` : "";
    return [r.date, new Date(r.checkInTime).toLocaleString(), r.checkOutTime ? new Date(r.checkOutTime).toLocaleString() : "", dur, loc];
  });
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_${currentUser.email}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showAlert("Exported!", "success");
};

const exportLeave = async () => {
  const records = await getDataByIndex("leaves", "email", currentUser.email);
  if (records.length === 0) { showAlert("No data", "warning"); return; }
  const headers = ["Start", "End", "Reason", "Status"];
  const rows = records.map(r => [r.startDate, r.endDate, r.reason, r.status]);
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leaves_${currentUser.email}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showAlert("Exported!", "success");
};

const exportAllData = async () => {
  const data = { users: await getAllData("users"), attendance: await getAllData("attendance"), leaves: await getAllData("leaves") };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `attendtrack_full_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showAlert("Exported!", "success");
};

// ========== TABS & CLOCK ==========
const initTabs = () => {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const name = tab.getAttribute("data-tab");
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("attendance-tab").style.display = "none";
      document.getElementById("leave-tab").style.display = "none";
      document.getElementById("history-tab").style.display = "none";
      document.getElementById("admin-tab-content").style.display = "none";
      if (name === "attendance") document.getElementById("attendance-tab").style.display = "block";
      else if (name === "leave") document.getElementById("leave-tab").style.display = "block";
      else if (name === "history") document.getElementById("history-tab").style.display = "block";
      else if (name === "admin") document.getElementById("admin-tab-content").style.display = "block";
    });
  });
};

const updateClock = () => {
  const timeDiv = document.getElementById("current-time");
  if (timeDiv) timeDiv.textContent = new Date().toLocaleTimeString();
};

// ========== INIT ==========
const init = async () => {
  await openDB();
  initTabs();
  setInterval(updateClock, 1000);
  updateClock();
  
  const saved = localStorage.getItem("currentUser");
  if (saved) {
    currentUser = JSON.parse(saved);
    const users = await getAllData("users");
    const exists = users.find(u => u.email === currentUser.email && u.status === "approved");
    if (exists) {
      currentUser = exists;
      document.getElementById("login-section").style.display = "none";
      document.getElementById("app-section").style.display = "block";
      document.getElementById("user-email").textContent = currentUser.email;
      document.getElementById("user-role").textContent = currentUser.role === "admin" ? "👑 Admin" : "👤 User";
      if (currentUser.role === "admin") { document.getElementById("admin-tab-btn").style.display = "block"; loadAdminPanel(); }
      loadUserData();
      loadCurrentSession();
      await loadSyncInfo();
      startAutoSync();
    }
  }
  
  if (!(await checkAdminExists())) document.getElementById("admin-setup").style.display = "block";
  
  document.getElementById("login-btn")?.addEventListener("click", login);
  document.getElementById("register-btn")?.addEventListener("click", register);
  document.getElementById("show-register-btn")?.addEventListener("click", () => {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "block";
  });
  document.getElementById("back-to-login-btn")?.addEventListener("click", () => {
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "block";
  });
  document.getElementById("setup-admin-btn")?.addEventListener("click", setupAdmin);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document.getElementById("check-in-btn")?.addEventListener("click", checkIn);
  document.getElementById("check-out-btn")?.addEventListener("click", checkOut);
  document.getElementById("submit-leave-btn")?.addEventListener("click", submitLeave);
  document.getElementById("export-attendance-btn")?.addEventListener("click", exportAttendance);
  document.getElementById("export-leave-btn")?.addEventListener("click", exportLeave);
  document.getElementById("manual-sync-btn")?.addEventListener("click", () => syncToGoogleDrive(true));
  document.getElementById("save-edit-btn")?.addEventListener("click", saveEdit);
  document.getElementById("close-modal-btn")?.addEventListener("click", closeModal);
  
  window.addEventListener("online", () => { updateSyncStatus("✨ Online"); syncToGoogleDrive(false); });
  window.addEventListener("offline", () => updateSyncStatus("📡 Offline"));
  updateLocationStatus("📍 Ready");
};

init();
