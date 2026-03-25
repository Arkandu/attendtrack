// ============================================
// ATTENDANCE SYSTEM WITH LOCATION TRACKING
// AUTO-SYNC EVERY 15 MINUTES
// DEVICE REMEMBER ME FUNCTIONALITY
// ============================================

// ========== DATABASE SETUP ==========
let db;
let currentUser = null;
let currentSession = null;
let syncInterval = null;
let lastSyncTime = null;
let syncCount = 0;
let nextSyncTimer = null;
let deviceId = null;

// Generate or get unique device ID
const getDeviceId = () => {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = "device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("deviceId", id);
  }
  return id;
};

deviceId = getDeviceId();

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AttendTrackDB", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("users")) {
        db.createObjectStore("users", { keyPath: "email" });
      }
      if (!db.objectStoreNames.contains("attendance")) {
        const store = db.createObjectStore("attendance", { keyPath: "id", autoIncrement: true });
        store.createIndex("email", "email", { unique: false });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("deviceId", "deviceId", { unique: false });
      }
      if (!db.objectStoreNames.contains("leaves")) {
        const store = db.createObjectStore("leaves", { keyPath: "id", autoIncrement: true });
        store.createIndex("email", "email", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("session")) {
        db.createObjectStore("session", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("syncInfo")) {
        db.createObjectStore("syncInfo", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("deviceInfo")) {
        db.createObjectStore("deviceInfo", { keyPath: "key" });
      }
    };
  });
};

// ========== DATABASE HELPERS ==========
const addData = (store, data) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([store], "readwrite");
    const request = transaction.objectStore(store).add(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const updateData = (store, data) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([store], "readwrite");
    const request = transaction.objectStore(store).put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getData = (store, key) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([store], "readonly");
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllData = (store) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([store], "readonly");
    const request = transaction.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getDataByIndex = (store, index, value) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([store], "readonly");
    const request = transaction.objectStore(store).index(index).getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const deleteData = (store, key) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([store], "readwrite");
    const request = transaction.objectStore(store).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const clearStore = (store) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([store], "readwrite");
    const request = transaction.objectStore(store).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ========== LOCATION FUNCTIONS ==========
const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString()
        });
      },
      (error) => {
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
};

const updateLocationStatus = (status) => {
  const locationDiv = document.getElementById("location-status");
  if (locationDiv) {
    locationDiv.textContent = status;
  }
};

// ========== SYNC MANAGEMENT (Every 15 Minutes) ==========
const saveSyncInfo = async (time, count) => {
  if (!db) return;
  await updateData("syncInfo", { key: "lastSync", value: time });
  await updateData("syncInfo", { key: "syncCount", value: count });
  lastSyncTime = time;
  syncCount = count;
  updateSyncDisplay();
  startNextSyncTimer();
};

const loadSyncInfo = async () => {
  if (!db) return;
  const lastSync = await getData("syncInfo", "lastSync");
  const count = await getData("syncInfo", "syncCount");
  lastSyncTime = lastSync ? lastSync.value : null;
  syncCount = count ? count.value : 0;
  updateSyncDisplay();
  startNextSyncTimer();
};

const updateSyncDisplay = () => {
  const lastSyncDisplay = document.getElementById("last-sync-time");
  const lastSyncAdminDisplay = document.getElementById("last-sync-time-display");
  const syncCountDisplay = document.getElementById("sync-count");
  
  if (lastSyncDisplay) {
    lastSyncDisplay.textContent = lastSyncTime ? `Last sync: ${new Date(lastSyncTime).toLocaleString()}` : "Last sync: Never";
  }
  if (lastSyncAdminDisplay) {
    lastSyncAdminDisplay.textContent = lastSyncTime ? new Date(lastSyncTime).toLocaleString() : "Never";
  }
  if (syncCountDisplay) {
    syncCountDisplay.textContent = syncCount;
  }
};

const startNextSyncTimer = () => {
  if (nextSyncTimer) clearInterval(nextSyncTimer);
  
  const updateTimer = () => {
    const nextSyncDisplay = document.getElementById("next-sync-timer");
    if (nextSyncDisplay && lastSyncTime) {
      const nextSync = new Date(new Date(lastSyncTime).getTime() + 15 * 60 * 1000);
      const now = new Date();
      const diff = Math.max(0, nextSync - now);
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      nextSyncDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };
  
  updateTimer();
  nextSyncTimer = setInterval(updateTimer, 1000);
};

// ========== GOOGLE DRIVE SYNC ==========
const getDriveFileName = () => {
  return `attendtrack_master_data.json`;
};

const syncToGoogleDrive = async (showMessage = true) => {
  if (!navigator.onLine) {
    if (showMessage) showAlert("No internet connection. Will sync when online.", "warning");
    return false;
  }
  
  updateSyncStatus("📤 Syncing...");
  
  const attendance = await getAllData("attendance");
  const leaves = await getAllData("leaves");
  const users = await getAllData("users");
  const deviceInfo = await getData("deviceInfo", "registeredDevices");
  
  const exportData = {
    lastSync: new Date().toISOString(),
    version: "4.0",
    users: users,
    attendance: attendance,
    leaves: leaves,
    deviceInfo: deviceInfo ? deviceInfo.value : [],
    stats: {
      totalUsers: users.length,
      totalAttendance: attendance.length,
      totalLeaves: leaves.length,
      lastSyncBy: currentUser ? currentUser.email : "system",
      deviceId: deviceId
    }
  };
  
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getDriveFileName();
  a.click();
  URL.revokeObjectURL(url);
  
  const newSyncTime = new Date().toISOString();
  await saveSyncInfo(newSyncTime, syncCount + 1);
  
  updateSyncStatus("✅ Synced");
  if (showMessage) showAlert("Data synced to Google Drive!", "success");
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
        
        if (!data.version) throw new Error("Invalid backup file");
        
        // Import users (keep current admin)
        if (data.users && Array.isArray(data.users)) {
          const existingUsers = await getAllData("users");
          const currentAdmin = existingUsers.find(u => u.role === "admin");
          
          if (currentAdmin) {
            for (let user of data.users) {
              if (user.email !== currentAdmin.email) {
                const exists = existingUsers.find(u => u.email === user.email);
                if (!exists) {
                  await addData("users", user);
                  imported.users++;
                }
              }
            }
          } else {
            await clearStore("users");
            for (let user of data.users) {
              await addData("users", user);
              imported.users++;
            }
          }
        }
        
        // Import attendance
        if (data.attendance && Array.isArray(data.attendance)) {
          const existingAttendance = await getAllData("attendance");
          for (let record of data.attendance) {
            const exists = existingAttendance.some(e => e.id === record.id);
            if (!exists) {
              await addData("attendance", record);
              imported.attendance++;
            }
          }
        }
        
        // Import leaves
        if (data.leaves && Array.isArray(data.leaves)) {
          const existingLeaves = await getAllData("leaves");
          for (let leave of data.leaves) {
            const exists = existingLeaves.some(e => e.id === leave.id);
            if (!exists) {
              await addData("leaves", leave);
              imported.leaves++;
            }
          }
        }
        
        if (data.lastSync) {
          await saveSyncInfo(data.lastSync, syncCount + 1);
        }
        
        updateSyncStatus("✅ Restored");
        showAlert(`Restored: ${imported.users} users, ${imported.attendance} attendance, ${imported.leaves} leaves`, "success");
        
        if (currentUser && currentUser.role === "admin") loadAdminPanel();
        loadUserData();
        
      } catch (error) {
        showAlert("Restore failed: Invalid backup file", "error");
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
};

// ========== AUTO-SYNC (Every 15 Minutes) ==========
const startAutoSync = () => {
  if (syncInterval) clearInterval(syncInterval);
  
  // Sync every 15 minutes (15 * 60 * 1000 = 900000 ms)
  syncInterval = setInterval(async () => {
    if (navigator.onLine && currentUser) {
      console.log("Auto-sync triggered (15 min interval)...");
      await syncToGoogleDrive(false);
    }
  }, 15 * 60 * 1000);
  
  console.log("Auto-sync enabled (every 15 minutes)");
};

// ========== UI HELPERS ==========
const showAlert = (message, type) => {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 3000);
};

const updateSyncStatus = (status) => {
  const statusDiv = document.getElementById("sync-status");
  if (statusDiv) statusDiv.textContent = status;
};

// ========== DEVICE MANAGEMENT (Remember Me) ==========
const saveDeviceForUser = async (email) => {
  let registeredDevices = await getData("deviceInfo", "registeredDevices");
  let devices = registeredDevices ? registeredDevices.value : [];
  
  const existingDevice = devices.find(d => d.email === email);
  if (existingDevice) {
    existingDevice.deviceId = deviceId;
    existingDevice.lastUsed = new Date().toISOString();
  } else {
    devices.push({
      email: email,
      deviceId: deviceId,
      firstUsed: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    });
  }
  
  await updateData("deviceInfo", { key: "registeredDevices", value: devices });
  localStorage.setItem("savedDevice", deviceId);
  localStorage.setItem("savedUserEmail", email);
};

const isDeviceAuthorized = async (email) => {
  const registeredDevices = await getData("deviceInfo", "registeredDevices");
  const devices = registeredDevices ? registeredDevices.value : [];
  const deviceRecord = devices.find(d => d.email === email);
  
  // If no device record exists, this is first login on any device
  if (!deviceRecord) return true;
  
  // Check if this device is authorized
  return deviceRecord.deviceId === deviceId;
};

// ========== USER MANAGEMENT ==========
const checkAdminExists = async () => {
  const users = await getAllData("users");
  return users.some(u => u.role === "admin");
};

const setupAdmin = async () => {
  const email = prompt("Enter Admin Email:");
  if (!email) return;
  const password = prompt("Enter Admin Password:");
  if (!password) return;
  const name = prompt("Enter Admin Name:");
  if (!name) return;
  
  await addData("users", {
    email: email,
    password: password,
    name: name,
    role: "admin",
    status: "approved",
    registeredAt: new Date().toISOString()
  });
  
  showAlert("Admin account created! Please login.", "success");
  location.reload();
};

const login = async () => {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  
  if (!email || !password) {
    showAlert("Please enter email and password", "warning");
    return;
  }
  
  const users = await getAllData("users");
  const user = users.find(u => u.email === email && u.password === password);
  
  if (!user) {
    showAlert("Invalid email or password", "error");
    return;
  }
  
  if (user.status !== "approved") {
    showAlert("Your account is pending admin approval", "warning");
    return;
  }
  
  // Check device authorization
  const authorized = await isDeviceAuthorized(email);
  if (!authorized) {
    const confirmNewDevice = confirm("This is a new device. Would you like to authorize it? All data will sync from Google Drive.");
    if (!confirmNewDevice) return;
  }
  
  currentUser = user;
  localStorage.setItem("currentUser", JSON.stringify(user));
  
  // Save device for this user
  await saveDeviceForUser(email);
  
  document.getElementById("login-section").style.display = "none";
  document.getElementById("app-section").style.display = "block";
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-role").textContent = user.role === "admin" ? "👑 Administrator" : "👤 User";
  document.getElementById("device-id-display").textContent = `Device: ${deviceId.substring(0, 12)}...`;
  
  if (user.role === "admin") {
    document.getElementById("admin-tab-btn").style.display = "block";
    loadAdminPanel();
  }
  
  loadUserData();
  loadCurrentSession();
  await loadSyncInfo();
  
  // Start auto-sync
  startAutoSync();
  
  // Try to restore from Drive if this is a new device
  const lastSync = await getData("syncInfo", "lastSync");
  if (!lastSync && navigator.onLine) {
    const restoreConfirm = confirm("Welcome! Would you like to restore data from Google Drive backup?");
    if (restoreConfirm) {
      restoreFromGoogleDrive();
    }
  } else if (!authorized && navigator.onLine) {
    const restoreConfirm = confirm("New device detected! Restore data from Google Drive?");
    if (restoreConfirm) {
      restoreFromGoogleDrive();
    }
  }
  
  showAlert(`Welcome ${user.name}! Auto-sync active every 15 minutes.`, "success");
};

const register = async () => {
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  const name = document.getElementById("reg-name").value;
  
  if (!email || !password || !name) {
    showAlert("Please fill all fields", "warning");
    return;
  }
  
  const users = await getAllData("users");
  if (users.some(u => u.email === email)) {
    showAlert("Email already registered", "warning");
    return;
  }
  
  await addData("users", {
    email: email,
    password: password,
    name: name,
    role: "user",
    status: "pending",
    registeredAt: new Date().toISOString()
  });
  
  showAlert("Registration successful! Waiting for admin approval.", "success");
  
  document.getElementById("register-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
};

const logout = () => {
  if (syncInterval) clearInterval(syncInterval);
  if (nextSyncTimer) clearInterval(nextSyncTimer);
  currentUser = null;
  currentSession = null;
  localStorage.removeItem("currentUser");
  // Keep deviceId for next login
  document.getElementById("login-section").style.display = "block";
  document.getElementById("app-section").style.display = "none";
  showAlert("Logged out successfully", "success");
};

// ========== ATTENDANCE FUNCTIONS WITH LOCATION ==========
const loadCurrentSession = async () => {
  if (!currentUser) return;
  const session = await getData("session", currentUser.email);
  if (session && session.value && !session.value.checkOutTime) {
    currentSession = session.value;
  }
  updateUIForSession();
};

const saveCurrentSession = async (session) => {
  currentSession = session;
  await updateData("session", { key: currentUser.email, value: session });
  updateUIForSession();
};

const updateUIForSession = () => {
  const statusBadge = document.getElementById("status-badge");
  const statusText = document.getElementById("current-status-text");
  const checkInBtn = document.getElementById("check-in-btn");
  const checkOutBtn = document.getElementById("check-out-btn");
  
  if (currentSession && !currentSession.checkOutTime) {
    statusBadge.textContent = "● Checked In";
    statusBadge.className = "status-badge status-checked-in";
    statusText.textContent = `Checked in at ${new Date(currentSession.checkInTime).toLocaleTimeString()}`;
    checkInBtn.style.display = "none";
    checkOutBtn.style.display = "block";
  } else {
    statusBadge.textContent = "● Checked Out";
    statusBadge.className = "status-badge status-checked-out";
    statusText.textContent = "Ready to start your day";
    checkInBtn.style.display = "block";
    checkOutBtn.style.display = "none";
  }
};

const checkIn = async () => {
  if (currentSession && !currentSession.checkOutTime) {
    showAlert("Already checked in!", "warning");
    return;
  }
  
  updateLocationStatus("📍 Getting location...");
  
  try {
    const location = await getCurrentLocation();
    updateLocationStatus(`📍 Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
    
    const now = new Date();
    const sessionData = {
      email: currentUser.email,
      name: currentUser.name,
      checkInTime: now.toISOString(),
      checkOutTime: null,
      date: now.toISOString().split("T")[0],
      timestamp: now.getTime(),
      deviceId: deviceId,
      checkInLocation: {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        timestamp: location.timestamp
      },
      checkOutLocation: null
    };
    
    await saveCurrentSession(sessionData);
    await addData("attendance", sessionData);
    
    showAlert(`✅ Checked in at ${now.toLocaleTimeString()}`, "success");
    loadUserData();
    if (currentUser.role === "admin") loadAdminPanel();
    syncToGoogleDrive(false);
    
  } catch (error) {
    updateLocationStatus("❌ Location failed - using time only");
    const now = new Date();
    const sessionData = {
      email: currentUser.email,
      name: currentUser.name,
      checkInTime: now.toISOString(),
      checkOutTime: null,
      date: now.toISOString().split("T")[0],
      timestamp: now.getTime(),
      deviceId: deviceId,
      checkInLocation: null,
      checkOutLocation: null
    };
    
    await saveCurrentSession(sessionData);
    await addData("attendance", sessionData);
    
    showAlert(`✅ Checked in at ${now.toLocaleTimeString()} (no location)`, "success");
    loadUserData();
    if (currentUser.role === "admin") loadAdminPanel();
    syncToGoogleDrive(false);
  }
};

const checkOut = async () => {
  if (!currentSession || currentSession.checkOutTime) {
    showAlert("Not checked in!", "warning");
    return;
  }
  
  updateLocationStatus("📍 Getting location for checkout...");
  
  try {
    const location = await getCurrentLocation();
    updateLocationStatus(`📍 Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
    
    const now = new Date();
    currentSession.checkOutTime = now.toISOString();
    currentSession.checkOutLocation = {
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      timestamp: location.timestamp
    };
    await saveCurrentSession(currentSession);
    
    const allAttendance = await getAllData("attendance");
    const lastRecord = allAttendance.reverse().find(r => r.email === currentUser.email && !r.checkOutTime);
    if (lastRecord) {
      lastRecord.checkOutTime = now.toISOString();
      lastRecord.checkOutLocation = currentSession.checkOutLocation;
      await updateData("attendance", lastRecord);
    }
    
    const duration = Math.round((now - new Date(currentSession.checkInTime)) / 1000 / 60);
    showAlert(`🔴 Checked out at ${now.toLocaleTimeString()} (${duration} minutes)`, "success");
    loadUserData();
    if (currentUser.role === "admin") loadAdminPanel();
    syncToGoogleDrive(false);
    
  } catch (error) {
    updateLocationStatus("❌ Location failed - using time only");
    const now = new Date();
    currentSession.checkOutTime = now.toISOString();
    await saveCurrentSession(currentSession);
    
    const allAttendance = await getAllData("attendance");
    const lastRecord = allAttendance.reverse().find(r => r.email === currentUser.email && !r.checkOutTime);
    if (lastRecord) {
      lastRecord.checkOutTime = now.toISOString();
      await updateData("attendance", lastRecord);
    }
    
    const duration = Math.round((now - new Date(currentSession.checkInTime)) / 1000 / 60);
    showAlert(`🔴 Checked out at ${now.toLocaleTimeString()} (${duration} minutes)`, "success");
    loadUserData();
    if (currentUser.role === "admin") loadAdminPanel();
    syncToGoogleDrive(false);
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
  
  const leaveData = {
    email: currentUser.email,
    name: currentUser.name,
    startDate: start,
    endDate: end,
    reason: reason || "Not specified",
    status: "pending",
    submittedAt: new Date().toISOString(),
    deviceId: deviceId
  };
  
  await addData("leaves", leaveData);
  
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
  
  // Admin's personal attendance
  const adminAttendance = attendance.filter(a => a.email === currentUser.email).reverse().slice(0, 5);
  const adminPersonalDiv = document.getElementById("admin-personal-attendance");
  if (adminAttendance.length === 0) {
    adminPersonalDiv.innerHTML = '<div class="empty-state">No attendance records yet</div>';
  } else {
    let html = "";
    for (let record of adminAttendance) {
      html += `
        <div class="record-item">
          <div><strong>${record.date}</strong></div>
          <div>✅ ${new Date(record.checkInTime).toLocaleTimeString()}</div>
          <div>🔴 ${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active"}</div>
          ${record.checkInLocation ? `<div class="location-badge">📍 ${record.checkInLocation.lat.toFixed(4)}, ${record.checkInLocation.lng.toFixed(4)}</div>` : ''}
        </div>
      `;
    }
    adminPersonalDiv.innerHTML = html;
  }
  
  // Pending users
  const pendingDiv = document.getElementById("pending-users");
  if (pendingUsers.length === 0) {
    pendingDiv.innerHTML = '<div class="empty-state">No pending user approvals</div>';
  } else {
    let html = "";
    for (let user of pendingUsers) {
      html += `
        <div class="pending-user">
          <div>
            <strong>${user.name}</strong><br>
            <small>${user.email}</small><br>
            <small>Registered: ${new Date(user.registeredAt).toLocaleDateString()}</small>
          </div>
          <div class="flex">
            <button onclick="approveUser('${user.email}')" class="btn-approve btn-small">Approve</button>
            <button onclick="rejectUser('${user.email}')" class="btn-reject btn-small">Reject</button>
          </div>
        </div>
      `;
    }
    pendingDiv.innerHTML = html;
  }
  
  // All users
  const usersDiv = document.getElementById("all-users");
  let usersHtml = "";
  for (let user of approvedUsers) {
    const userAttendance = attendance.filter(a => a.email === user.email);
    const userLeaves = leaves.filter(l => l.email === user.email);
    usersHtml += `
      <div class="record-item">
        <div><strong>${user.name}</strong></div>
        <div style="font-size: 12px; color: #666;">${user.email}</div>
        <div style="font-size: 12px; margin-top: 6px;">
          📊 ${userAttendance.length} check-ins | 📝 ${userLeaves.length} leaves
        </div>
      </div>
    `;
  }
  usersDiv.innerHTML = usersHtml || '<div class="empty-state">No users found</div>';
  
  // All attendance with location
  const attendanceDiv = document.getElementById("all-attendance");
  let attendanceHtml = "";
  for (let record of attendance.reverse().slice(0, 50)) {
    const user = users.find(u => u.email === record.email);
    attendanceHtml += `
      <div class="record-item">
        <div><strong>${user ? user.name : record.email}</strong></div>
        <div>📅 ${record.date}</div>
        <div>✅ ${new Date(record.checkInTime).toLocaleTimeString()}</div>
        <div>🔴 ${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active"}</div>
        ${record.checkInLocation ? `<div class="location-badge">📍 In: ${record.checkInLocation.lat.toFixed(4)}, ${record.checkInLocation.lng.toFixed(4)}</div>` : ''}
        ${record.checkOutLocation ? `<div class="location-badge">📍 Out: ${record.checkOutLocation.lat.toFixed(4)}, ${record.checkOutLocation.lng.toFixed(4)}</div>` : ''}
      </div>
    `;
  }
  attendanceDiv.innerHTML = attendanceHtml || '<div class="empty-state">No attendance records</div>';
  
  // All leaves
  const leavesDiv = document.getElementById("all-leaves");
  let leavesHtml = "";
  for (let leave of leaves.reverse().slice(0, 50)) {
    const user = users.find(u => u.email === leave.email);
    const statusColor = leave.status === "approved" ? "#34c759" : leave.status === "rejected" ? "#ff3b30" : "#ff9500";
    leavesHtml += `
      <div class="leave-request" style="border-left-color: ${statusColor}; background: white;">
        <div><strong>${user ? user.name : leave.email}</strong></div>
        <div>📅 ${leave.startDate} → ${leave.endDate}</div>
        <div>📝 ${leave.reason}</div>
        <div style="color: ${statusColor}; margin-top: 8px;">
          ${leave.status === "approved" ? "✅ Approved" : leave.status === "rejected" ? "❌ Rejected" : "⏳ Pending"}
        </div>
        ${leave.status === "pending" ? `
          <div class="flex mt-2">
            <button onclick="approveLeave(${leave.id})" class="btn-approve btn-small">Approve</button>
            <button onclick="rejectLeave(${leave.id})" class="btn-reject btn-small">Reject</button>
          </div>
        ` : ''}
      </div>
    `;
  }
  leavesDiv.innerHTML = leavesHtml || '<div class="empty-state">No leave records</div>';
};

window.approveUser = async (email) => {
  const users = await getAllData("users");
  const user = users.find(u => u.email === email);
  if (user) {
    user.status = "approved";
    await updateData("users", user);
    showAlert(`${email} approved!`, "success");
    loadAdminPanel();
    syncToGoogleDrive(false);
  }
};

window.rejectUser = async (email) => {
  await deleteData("users", email);
  showAlert(`User rejected`, "success");
  loadAdminPanel();
  syncToGoogleDrive(false);
};

window.approveLeave = async (leaveId) => {
  const leaves = await getAllData("leaves");
  const leave = leaves.find(l => l.id === leaveId);
  if (leave) {
    leave.status = "approved";
    await updateData("leaves", leave);
    showAlert("Leave approved!", "success");
    loadAdminPanel();
    syncToGoogleDrive(false);
  }
};

window.rejectLeave = async (leaveId) => {
  const leaves = await getAllData("leaves");
  const leave = leaves.find(l => l.id === leaveId);
  if (leave) {
    leave.status = "rejected";
    await updateData("leaves", leave);
    showAlert("Leave rejected!", "success");
    loadAdminPanel();
    syncToGoogleDrive(false);
  }
};

// ========== LOAD USER DATA ==========
const loadUserData = async () => {
  if (!currentUser) return;
  
  const allAttendance = await getAllData("attendance");
  const userAttendance = allAttendance.filter(a => a.email === currentUser.email);
  const userLeaves = await getDataByIndex("leaves", "email", currentUser.email);
  
  // Today's activity
  const today = new Date().toISOString().split("T")[0];
  const todayRecords = userAttendance.filter(r => r.date === today);
  const todayDiv = document.getElementById("today-activity");
  if (todayRecords.length === 0) {
    todayDiv.innerHTML = '<div class="empty-state">No activity today</div>';
  } else {
    let html = "";
    for (let record of todayRecords.reverse()) {
      html += `
        <div class="record-item">
          <div>✅ Check In: ${new Date(record.checkInTime).toLocaleTimeString()}</div>
          <div>🔴 Check Out: ${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active"}</div>
          ${record.checkInLocation ? `<div class="location-badge">📍 ${record.checkInLocation.lat.toFixed(4)}, ${record.checkInLocation.lng.toFixed(4)}</div>` : ''}
        </div>
      `;
    }
    todayDiv.innerHTML = html;
  }
  
  // Monthly stats
  const thisMonth = today.substring(0, 7);
  const thisMonthRecords = userAttendance.filter(r => r.date.startsWith(thisMonth) && r.checkOutTime);
  const totalMinutes = thisMonthRecords.reduce((total, r) => {
    const checkIn = new Date(r.checkInTime);
    const checkOut = new Date(r.checkOutTime);
    return total + (checkOut - checkIn) / 1000 / 60;
  }, 0);
  const hours = Math.round(totalMinutes / 60 * 10) / 10;
  
  document.getElementById("summary-stats").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${thisMonthRecords.length}</div><div class="stat-label">Days Worked</div></div>
      <div class="stat-card"><div class="stat-number">${hours}</div><div class="stat-label">Hours This Month</div></div>
    </div>
  `;
  
  // Attendance history with location
  const historyDiv = document.getElementById("attendance-history");
  if (userAttendance.length === 0) {
    historyDiv.innerHTML = '<div class="empty-state">No attendance records</div>';
  } else {
    let html = "";
    for (let record of userAttendance.reverse().slice(0, 30)) {
      html += `
        <div class="record-item">
          <div><strong>${record.date}</strong></div>
          <div>✅ ${new Date(record.checkInTime).toLocaleTimeString()}</div>
          <div>🔴 ${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : "Active"}</div>
          ${record.checkInLocation ? `<div class="location-badge">📍 ${record.checkInLocation.lat.toFixed(4)}, ${record.checkInLocation.lng.toFixed(4)}</div>` : ''}
        </div>
      `;
    }
    historyDiv.innerHTML = html;
  }
  
  // Leave history
  const leavesDiv = document.getElementById("leave-history");
  if (userLeaves.length === 0) {
    leavesDiv.innerHTML = '<div class="empty-state">No leave records</div>';
  } else {
    let html = "";
    for (let leave of userLeaves.reverse()) {
      const statusColor = leave.status === "approved" ? "#34c759" : leave.status === "rejected" ? "#ff3b30" : "#ff9500";
      html += `
        <div class="leave-request" style="border-left-color: ${statusColor}">
          <div><strong>${leave.startDate} → ${leave.endDate}</strong></div>
          <div>📝 ${leave.reason}</div>
          <div style="color: ${statusColor};">${leave.status === "approved" ? "✅ Approved" : leave.status === "rejected" ? "❌ Rejected" : "⏳ Pending"}</div>
        </div>
      `;
    }
    leavesDiv.innerHTML = html;
  }
  
  // Pending leaves
  const pendingLeaves = userLeaves.filter(l => l.status === "pending");
  const pendingDiv = document.getElementById("pending-leaves");
  if (pendingLeaves.length === 0) {
    pendingDiv.innerHTML = '<div class="empty-state">No pending requests</div>';
  } else {
    let html = "";
    for (let leave of pendingLeaves) {
      html += `
        <div class="leave-request">
          <div><strong>${leave.startDate} → ${leave.endDate}</strong></div>
          <div>📝 ${leave.reason}</div>
          <div style="color: #ff9500;">⏳ Pending Approval</div>
        </div>
      `;
    }
    pendingDiv.innerHTML = html;
  }
};

// ========== EXPORT FUNCTIONS ==========
const exportAttendance = async () => {
  const records = await getDataByIndex("attendance", "email", currentUser.email);
  if (records.length === 0) {
    showAlert("No data to export", "warning");
    return;
  }
  
  const headers = ["Date", "Check In Time", "Check Out Time", "Duration (minutes)", "Location (Check In)", "Location (Check Out)", "Device ID"];
  const rows = records.map(r => {
    const checkIn = new Date(r.checkInTime);
    const checkOut = r.checkOutTime ? new Date(r.checkOutTime) : null;
    const duration = checkOut ? Math.round((checkOut - checkIn) / 1000 / 60) : "Active";
    const checkInLoc = r.checkInLocation ? `${r.checkInLocation.lat},${r.checkInLocation.lng}` : "";
    const checkOutLoc = r.checkOutLocation ? `${r.checkOutLocation.lat},${r.checkOutLocation.lng}` : "";
    return [r.date, checkIn.toLocaleString(), checkOut ? checkOut.toLocaleString() : "Active", duration, checkInLoc, checkOutLoc, r.deviceId || ""];
  });
  
  const csv = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_${currentUser.email}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showAlert("Attendance exported with location data!", "success");
};

const exportLeave = async () => {
  const records = await getDataByIndex("leaves", "email", currentUser.email);
  if (records.length === 0) {
    showAlert("No data to export", "warning");
    return;
  }
  
  const headers = ["Start Date", "End Date", "Reason", "Status", "Submitted Date"];
  const rows = records.map(r => [r.startDate, r.endDate, r.reason, r.status, new Date(r.submittedAt).toLocaleDateString()]);
  
  const csv = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leaves_${currentUser.email}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showAlert("Leave history exported!", "success");
};

const exportAllData = async () => {
  const attendance = await getAllData("attendance");
  const leaves = await getAllData("leaves");
  const users = await getAllData("users");
  
  const exportData = {
    exportDate: new Date().toISOString(),
    version: "4.0",
    users: users,
    attendance: attendance,
    leaves: leaves,
    deviceId: deviceId
  };
  
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendtrack_full_export_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showAlert("All data exported!", "success");
};

// ========== TAB NAVIGATION ==========
const initTabs = () => {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      document.getElementById("attendance-tab").style.display = "none";
      document.getElementById("leave-tab").style.display = "none";
      document.getElementById("history-tab").style.display = "none";
      document.getElementById("admin-tab-content").style.display = "none";
      
      if (tabName === "attendance") document.getElementById("attendance-tab").style.display = "block";
      else if (tabName === "leave") document.getElementById("leave-tab").style.display = "block";
      else if (tabName === "history") document.getElementById("history-tab").style.display = "block";
      else if (tabName === "admin") document.getElementById("admin-tab-content").style.display = "block";
    });
  });
};

// ========== CLOCK ==========
const updateClock = () => {
  const timeDiv = document.getElementById("current-time");
  if (timeDiv) {
    timeDiv.textContent = new Date().toLocaleTimeString();
  }
};

// ========== INITIALIZATION ==========
const init = async () => {
  await openDB();
  initTabs();
  setInterval(updateClock, 1000);
  updateClock();
  
  // Set device ID display
  document.getElementById("device-id-display")?.setAttribute("style", "font-size: 10px; color: #999;");
  
  // Check saved login (Remember Me)
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    const users = await getAllData("users");
    const userExists = users.find(u => u.email === currentUser.email && u.status === "approved");
    if (userExists) {
      // Check if device is still authorized
      const authorized = await isDeviceAuthorized(currentUser.email);
      if (authorized) {
        currentUser = userExists;
        document.getElementById("login-section").style.display = "none";
        document.getElementById("app-section").style.display = "block";
        document.getElementById("user-email").textContent = currentUser.email;
        document.getElementById("user-role").textContent = currentUser.role === "admin" ? "👑 Administrator" : "👤 User";
        document.getElementById("device-id-display").textContent = `Device: ${deviceId.substring(0, 12)}...`;
        
        if (currentUser.role === "admin") {
          document.getElementById("admin-tab-btn").style.display = "block";
          loadAdminPanel();
        }
        loadUserData();
        loadCurrentSession();
        await loadSyncInfo();
        startAutoSync();
      } else {
        localStorage.removeItem("currentUser");
      }
    } else {
      localStorage.removeItem("currentUser");
    }
  }
  
  // Check if admin exists
  const adminExists = await checkAdminExists();
  if (!adminExists) {
    document.getElementById("admin-setup").style.display = "block";
  }
  
  // Event listeners
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
  document.getElementById("restore-from-drive-btn")?.addEventListener("click", restoreFromGoogleDrive);
  document.getElementById("export-all-data")?.addEventListener("click", exportAllData);
  
  // Online/Offline listeners
  window.addEventListener("online", async () => {
    updateSyncStatus("✨ Online");
    showAlert("Back online! Syncing...", "success");
    await syncToGoogleDrive(false);
  });
  
  window.addEventListener("offline", () => {
    updateSyncStatus("📡 Offline");
    showAlert("Offline mode - will sync when online", "warning");
  });
  
  // Initial location status
  updateLocationStatus("📍 Ready - tap Check In/Out");
};

init();
