// Mock Data mimicking Excel files (Initial load only if Firestore is empty)
let COURSE_DATA = {
    "arch": { title: "معمارية حاسوب", students: [], attendance: [], announcements: [], hidden: false },
    "fund": { title: "أساسيات حاسوب", students: [], attendance: [], announcements: [], hidden: false },
    "comm": { title: "مبادئ اتصالات", students: [], attendance: [], announcements: [], hidden: false },
    "digit": { title: "إلكترونيات رقمية", students: [], attendance: [], announcements: [], hidden: false }
};

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyD3Vf8HMyLn1Crl8sRxGQ3s6jZ1e2PodTo",
    authDomain: "tgrades.firebaseapp.com",
    projectId: "tgrades",
    storageBucket: "tgrades.firebasestorage.app",
    messagingSenderId: "267127458162",
    appId: "1:267127458162:web:29340549514095054635eb",
    measurementId: "G-XX37NZHB7W"
};

// Initialize Firebase (Compatibility Mode)
let db;
let auth;
function initFirebase() {
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("Firebase not configured. Using LocalStorage fallback.");
        return false;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    return true;
}

const STORAGE_KEY = 'teacherPortalData';

// DOM Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const usernameGroup = document.getElementById('username-group'); // Container for email input
const usernameInput = document.getElementById('username');
const studentNameGroup = document.getElementById('student-name-group');
const studentNameInput = document.getElementById('student-name');
const studentNamesDatalist = document.getElementById('student-names-list');
const passwordInput = document.getElementById('password');
const loginBtn = loginForm.querySelector('button[type="submit"]');
const errorMsg = document.getElementById('error-msg');
const courseSelect = document.getElementById('course-select');
const tableBody = document.getElementById('grades-body');
const currentUserSpan = document.getElementById('current-user');
const tabBtns = document.querySelectorAll('.tab-btn');
const usernameLabel = document.getElementById('username-label');
const passwordGroup = document.getElementById('password-group');
const passwordLabel = document.getElementById('password-label');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');
const thControls = document.getElementById('th-controls');
const viewBtns = document.querySelectorAll('.view-btn');
const gradesContainer = document.getElementById('grades-container');
const attendanceContainer = document.getElementById('attendance-container');
const attendanceHead = document.getElementById('attendance-head');
const attendanceBody = document.getElementById('attendance-body');
const statsContainer = document.getElementById('stats-container');
const studentVisitsSpan = document.getElementById('student-visits-count');

let isAuthenticated = false;
let currentView = 'grades'; // 'grades' or 'attendance'
let userRole = 'teacher';
let currentStudentName = ''; // Changed from currentStudentId to Name

// Initialize
async function init() {
    const isFirebaseActive = initFirebase();

    if (isFirebaseActive) {
        // Listen for auth state
        auth.onAuthStateChanged(async user => {
            if (user && userRole === 'teacher') {
                // Persistent logged-in state for teacher
                isAuthenticated = true;
                currentUserSpan.textContent = user.email.split('@')[0];

                // Fetch data ONLY after successful login
                await fetchFromFirestore();

                showDashboard();
            } else if (!user && isAuthenticated && userRole === 'teacher') {
                // If user logs out or session expires while on dashboard
                handleLogout();
            }
        });
    } else {
        loadDataFromLocalStorage();
    }

    loginForm.addEventListener('submit', handleLogin);
    courseSelect.addEventListener('change', (e) => {
        if (currentView === 'grades') renderTable(e.target.value);
        else if (currentView === 'attendance') renderAttendanceTable(e.target.value);
        else if (currentView === 'announcements') renderAnnouncements(e.target.value);
    });

    // Student search now searches across all courses
    studentNameInput.addEventListener('input', () => {
        filterStudentNames();
        checkStudentStatus();
    });

    studentNameInput.addEventListener('change', checkStudentStatus);

    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Separate Listeners
    document.getElementById('grades-upload').addEventListener('change', (e) => processExcelFile(e, 'grades'));
    document.getElementById('attendance-upload').addEventListener('change', (e) => processExcelFile(e, 'attendance'));

    // Nav Listeners
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchRole(btn.dataset.role));
    });

    // Course Management
    // 'add-course-btn' and 'close-course-modal' are static in Modal, safe to attach here.

    // Sync UI with initial role
    switchRole(userRole);
    switchTab('grades'); // Force initial tab load
}

async function fetchFromFirestore() {
    try {
        const snapshot = await db.collection('grades').get();
        if (snapshot.empty) {
            console.log('No cloud data found.');
            return;
        }
        snapshot.forEach(doc => {
            const courseKey = doc.id;
            const data = doc.data();

            if (COURSE_DATA[courseKey]) {
                // Merge into existing (preserves mock structure if needed)
                Object.assign(COURSE_DATA[courseKey], data);
            } else {
                // Add new course from cloud
                COURSE_DATA[courseKey] = data;
            }
        });
        console.log('Cloud data loaded successfully.');
        populateCourseDropdown(); // Refresh UI after load
    } catch (e) {
        console.error('Error fetching from Firestore:', e);
    }
}

async function saveToFirestore(courseKey) {
    if (!db) return;
    try {
        const dataToSave = COURSE_DATA[courseKey];
        if (!dataToSave) return;

        await db.collection('grades').doc(courseKey).set(dataToSave);
        console.log(`Cloud save successful for course: ${courseKey}`);
    } catch (e) {
        console.error('Error saving to Firestore:', e);
        // Don't alert here to avoid spamming if called from loops
    }
}

// Student Password Management
async function getStudentPassword(studentName) {
    if (!db) return null;
    const doc = await db.collection('student_passwords').doc(studentName).get();
    return doc.exists ? doc.data().password : null;
}

async function setStudentPassword(studentName, password) {
    if (!db) return;
    await db.collection('student_passwords').doc(studentName).set({ password: password });
}

async function resetStudentPassword(studentName) {
    if (!db) return;
    if (confirm(`هل أنت متأكد من تصفير كلمة سر الطالب: ${studentName}؟`)) {
        await db.collection('student_passwords').doc(studentName).delete();
        alert('تم تصفير كلمة السر بنجاح. يمكن للطالب الآن تعيين كلمة سر جديدة عند الدخول.');
    }
}

async function resetAllCoursePasswords() {
    const courseKey = courseSelect.value;
    const course = COURSE_DATA[courseKey];

    if (!course || !course.students.length) {
        alert('⚠️ لا يوجد طلاب في هذا المقرر لتصفير كلمات مرورهم.');
        return;
    }

    const confirmMsg = `⚠️ تحذير نهائي:\n\n` +
        `هل أنت متأكد تماماً من تصفير كلمات السر لجميع طلاب مقرر (${course.title})؟\n` +
        `سيتم حذف جميع كلمات المرور الحالية ولن يتمكن الطلاب من الدخول إلا بعد تعيين كلمة مرور جديدة.\n\n` +
        `هل تريد الاستمرار؟`;

    if (confirm(confirmMsg)) {
        const resetBulkBtn = document.getElementById('reset-bulk-btn');
        if (resetBulkBtn) resetBulkBtn.disabled = true;
        const originalText = resetBulkBtn ? resetBulkBtn.innerHTML : '';
        if (resetBulkBtn) resetBulkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التصفير...';

        try {
            const batch = db.batch();
            course.students.forEach(student => {
                const ref = db.collection('student_passwords').doc(student.name.trim());
                batch.delete(ref);
            });
            await batch.commit();
            alert(`تم تصفير كلمات السر بنجاح لجميع طلاب مقرر (${course.title}).`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء التصفير الجماعي.');
        } finally {
            if (resetBulkBtn) {
                resetBulkBtn.disabled = false;
                resetBulkBtn.innerHTML = originalText;
            }
        }
    }
}

async function setAllCoursePasswordsToValue() {
    const courseKey = courseSelect.value;
    const course = COURSE_DATA[courseKey];
    if (!course || !course.students.length) {
        alert('لا يوجد طلاب في هذا المقرر.');
        return;
    }

    const newPass = prompt(`أدخل كلمة المرور الجديدة لجميع طلاب مقرر (${course.title}):`);
    if (newPass === null) return; // Cancelled
    if (newPass.trim() === '') {
        alert('كلمة المرور لا يمكن أن تكون فارغة.');
        return;
    }

    if (confirm(`هل أنت متأكد من تغيير كلمات مرور جميع طلاب مقرر (${course.title}) إلى "${newPass}"؟`)) {
        const setBtn = document.getElementById('set-unified-btn');
        if (setBtn) setBtn.disabled = true;
        const originalText = setBtn ? setBtn.innerHTML : '';
        if (setBtn) setBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحديث...';

        try {
            const batch = db.batch();
            course.students.forEach(student => {
                const ref = db.collection('student_passwords').doc(student.name.trim());
                batch.set(ref, { password: newPass.trim() });
            });
            await batch.commit();
            alert(`تم تعيين كلمة المرور بنجاح لجميع طلاب مقرر (${course.title}).`);
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء التحديث الجماعي.');
        } finally {
            if (setBtn) {
                setBtn.disabled = false;
                setBtn.innerHTML = originalText;
            }
        }
    }
}

async function incrementStudentVisit() {
    // Optimistically update local storage first for immediate feedback (though not shared)
    let localStats = JSON.parse(localStorage.getItem('portalStats') || '{"studentVisits": 0}');
    localStats.studentVisits++;
    localStorage.setItem('portalStats', JSON.stringify(localStats));

    if (db) {
        try {
            // Attempt cloud sync
            const statsRef = db.collection('student_passwords').doc('__STATS__');
            await statsRef.set({
                studentVisits: firebase.firestore.FieldValue.increment(1),
                lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log('Cloud visit incremented successfully.');
        } catch (e) {
            console.warn('Cloud increment failed (using local fallback):', e.code);
            // Permissions error is expected if rules are strict, we just silently fail to cloud
        }
    }
}

async function renderStatsView() {
    studentVisitsSpan.textContent = "...";

    let cloudCount = null;
    let errorOccurred = false;

    if (db) {
        try {
            const doc = await db.collection('student_passwords').doc('__STATS__').get();
            if (doc.exists) {
                cloudCount = doc.data().studentVisits;
            } else {
                // If cloud doc doesn't exist, it might be 0
                cloudCount = 0;
            }
        } catch (e) {
            console.warn('Cloud fetch failed:', e);
            errorOccurred = true;
        }
    }

    // Decision Logic:
    // 1. If we got a cloud count, show it (it's the source of truth).
    // 2. If cloud failed (permissions/network), fallback to local storage count.
    // 3. If local is empty, show 0.

    if (cloudCount !== null) {
        studentVisitsSpan.textContent = cloudCount;
    } else {
        // Fallback
        let localStats = JSON.parse(localStorage.getItem('portalStats') || '{"studentVisits": 0}');
        studentVisitsSpan.textContent = localStats.studentVisits;

        if (errorOccurred) {
            // Optional: Add a small visual indicator or log, but don't block the UI with "Error"
            console.log("Displayed local stats due to cloud error.");
        }
    }
}

function loadDataFromLocalStorage() {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
        try {
            const parsed = JSON.parse(storedData);
            // Merge stored data into global object
            Object.assign(COURSE_DATA, parsed);
            populateCourseDropdown(); // Refresh UI after load
        } catch (e) {
            console.error('Failed to load data', e);
        }
    }
}

function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(COURSE_DATA));
}

async function populateStudentNames() {
    // We strictly keep it empty now to prevent showing all names on focus
    studentNamesDatalist.innerHTML = '';
    studentNameInput.value = '';
    loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> دخول';
}

function filterStudentNames() {
    const query = studentNameInput.value.trim();

    // Clear list if query is too short
    if (query.length < 3) {
        studentNamesDatalist.innerHTML = '';
        return;
    }

    // Filter names that contain the query across ALL courses
    const allStudentNames = new Set();
    for (const data of Object.values(COURSE_DATA)) {
        if (data.hidden) continue;
        data.students.forEach(s => {
            if (s.name.trim().includes(query)) {
                allStudentNames.add(s.name.trim());
            }
        });
    }

    // Update datalist with matched names
    studentNamesDatalist.innerHTML = '';
    allStudentNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        studentNamesDatalist.appendChild(opt);
    });
}

async function checkStudentStatus() {
    const name = studentNameInput.value.trim();
    if (!name || name.length < 3) return;

    // Only check if it's a valid student in ANY course
    let studentExists = false;
    for (const data of Object.values(COURSE_DATA)) {
        if (data.students.some(s => s.name.trim() === name)) {
            studentExists = true;
            break;
        }
    }
    if (!studentExists) return;

    const storedPass = await getStudentPassword(name);
    if (storedPass === null) {
        loginBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> تسجيل (لأول مرة)';
    } else {
        loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> دخول';
    }
}

function switchRole(role) {
    userRole = role;
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.role === role));

    errorMsg.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
    studentNameInput.value = '';

    // Security: Hide Settings for Students
    const settingsBtn = document.getElementById('nav-settings-btn');
    const roleBadge = document.getElementById('user-role-badge');

    if (role === 'student') {
        usernameGroup.style.display = 'none';
        studentNameGroup.style.display = 'block';
        passwordGroup.style.display = 'block';
        passwordLabel.textContent = 'كلمة المرور';
        passwordInput.placeholder = 'أدخل كلمة السر (أو اختر واحدة جديدة)';
        loginSubtitle.textContent = 'سجل دخولك كـ طالب للمتابعة';
        const studentLabel = document.getElementById('student-name-label');
        if (studentLabel) studentLabel.textContent = 'الاسم';

        if (settingsBtn) settingsBtn.style.display = 'none';
        if (roleBadge) { roleBadge.textContent = 'Student'; roleBadge.className = 'badge-student'; }

        populateStudentNames();
    } else {
        usernameGroup.style.display = 'block';
        studentNameGroup.style.display = 'none';
        usernameLabel.textContent = 'البريد الإلكتروني';
        usernameInput.placeholder = 'example@mail.com';
        usernameInput.type = 'email';
        passwordGroup.style.display = 'block';
        passwordLabel.textContent = 'كلمة المرور';
        passwordInput.placeholder = '••••••••';

        if (role === 'teacher') {
            loginForm.style.display = 'block';
            usernameInput.parentElement.style.display = 'block';
            studentNameInput.parentElement.style.display = 'none';

            loginTitle.innerHTML = 'مرحبًا بكم<br>نظام الاستعلام عن درجات الطالب';
            loginSubtitle.textContent = 'سجل دخولك كـ مدرس للمتابعة';

            if (settingsBtn) settingsBtn.style.display = 'flex';
            if (roleBadge) { roleBadge.textContent = 'Admin'; roleBadge.className = 'badge-admin'; }
        }
    }
}

// --- Navigation & Role Management ---

function switchTab(tabId) {
    // Security: Secondary check to prevent students from accessing settings/stats
    if (userRole !== 'teacher' && (tabId === 'settings' || tabId === 'stats')) {
        alert('ليس لديك صلاحية للوصول إلى هذا القسم');
        return;
    }

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        if (btn.dataset.tab === tabId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Robustly hide all views/modals first
    const views = ['grades-container', 'attendance-container', 'announcements-container', 'settings-container', 'stats-container'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Also ensuring modal is closed when switching tabs
    const modal = document.getElementById('course-modal');
    if (modal) modal.style.display = 'none';

    // Toggle Course Controls (Hide in Stats, show elsewhere)
    const courseControls = document.querySelector('.course-controls');
    if (courseControls) {
        courseControls.style.display = (tabId === 'stats') ? 'none' : 'block';
    }

    // Show active view
    if (tabId === 'grades') {
        const el = document.getElementById('grades-container');
        if (el) el.style.display = 'block';
        currentView = 'grades';
        renderTable(courseSelect.value);
    } else if (tabId === 'attendance') {
        const el = document.getElementById('attendance-container');
        if (el) el.style.display = 'block';
        currentView = 'attendance';
        renderAttendanceTable(courseSelect.value);
    } else if (tabId === 'announcements') {
        const el = document.getElementById('announcements-container');
        if (el) el.style.display = 'block'; // using block for grid container, grid defined in CSS
        currentView = 'announcements';
        renderAnnouncements(courseSelect.value);
    } else if (tabId === 'settings') {
        const el = document.getElementById('settings-container');
        if (el) el.style.display = 'flex';
        currentView = 'settings';
        renderSettingsView();
    } else if (tabId === 'stats') {
        const el = document.getElementById('stats-container');
        if (el) el.style.display = 'flex';
        currentView = 'stats';
        renderStatsView();
    }

    renderActionBar(tabId);
}

function renderActionBar(tabId) {
    const bar = document.getElementById('action-bar');
    if (!bar) return;
    bar.innerHTML = '';

    if (userRole === 'student') return; // Students get no actions

    if (tabId === 'grades') {
        bar.innerHTML = `
            <label for="grades-upload" class="upload-btn">
                <i class="fa-solid fa-cloud-arrow-up"></i> رفع درجات
            </label>
        `;
    } else if (tabId === 'attendance') {
        bar.innerHTML = `
            <label for="attendance-upload" class="upload-btn" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                <i class="fa-solid fa-calendar-days"></i> رفع حضور
            </label>
        `;
    } else if (tabId === 'announcements') {
        bar.innerHTML = `
            <button onclick="showAddAnnouncementForm()" class="upload-btn" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
                <i class="fa-solid fa-bullhorn"></i> إضافة إعلان
            </button>
        `;
    } else if (tabId === 'settings') {
        bar.innerHTML = ''; // No action buttons for Settings
    }
}

async function processExcelFile(e, type) {
    if (userRole === 'student') return;

    const file = e.target.files[0];
    if (!file) return;

    const confirmMsg = type === 'grades'
        ? `هل أنت متأكد من رفع ملف الدرجات؟\nسيؤدي هذا لتحديث درجات الطلاب في المقرر الحالي.`
        : `هل أنت متأكد من رفع ملف الحضور؟\nسيؤدي هذا لتحديث سجلات الحضور في المقرر الحالي.`;

    if (!confirm(confirmMsg)) {
        e.target.value = ''; // Reset input to allow re-selecting same file
        return;
    }

    const reader = new FileReader();

    reader.onload = async function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!jsonData || jsonData.length === 0) {
            alert('الملف فارغ أو غير صالح');
            return;
        }

        const headers = jsonData[0] || [];
        const courseKey = courseSelect.value;
        const course = COURSE_DATA[courseKey];

        // Strict Detection Logic
        const isAttendanceContent = headers.length >= 10 && !headers.some(h => String(h).includes('أعمال') || String(h).includes('نهائي'));

        if (type === 'attendance') {
            if (!isAttendanceContent) {
                alert('خطأ: يبدو أنك تحاول رفع ملف "درجات" في خانة "الحضور". يرجى اختيار الملف الصحيح.');
                return;
            }

            // Smart Detection Strategy
            // 1. Try to find a header that looks like "1", "Week 1", "الأسبوع 1", etc.
            let startWeekIndex = -1;

            for (let c = 1; c < headers.length; c++) {
                const h = String(headers[c]).trim();
                // Check for "1" alone, or "Week 1", "W1", "أسبوع 1"
                // Regex: matches "1" at start or entries containing "1" and "week"/"Week"/"أسبوع"
                if (h === '1' || /^(week|w|أسبوع).*\s*1$/i.test(h) || h.includes('1')) {
                    // Double check: subsequent header should probably be '2'
                    const nextH = String(headers[c + 1] || '').trim();
                    if (nextH.includes('2')) {
                        startWeekIndex = c;
                        console.log("Header-based detection found start:", c);
                        break;
                    }
                }
            }

            // 2. Fallback: Check data columns (1 to 20) if header detection failed
            if (startWeekIndex === -1) {
                for (let c = 1; c < 20; c++) {
                    let matchCount = 0;
                    // Deep Scan: Check up to 50 rows
                    for (let r = 1; r < Math.min(jsonData.length, 50); r++) {
                        const row = jsonData[r];
                        if (!row) continue;
                        const val = String(row[c]).trim();
                        if (['1', '0', 'm'].includes(val)) matchCount++;
                    }
                    // Lower threshold based on deeper scan
                    if (matchCount > 0) {
                        startWeekIndex = c;
                        console.log("Data-based detection found start:", c);
                        break;
                    }
                }
            }

            // Default to 1 if completely lost
            if (startWeekIndex === -1) startWeekIndex = 1;

            // alert(`debug: Data starts at column ${startWeekIndex}`);

            // Process Attendance
            const attendanceData = [];
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || !row[0]) continue;

                const name = String(row[0]).trim();
                const sessionFlags = [];
                for (let k = 0; k < 14; k++) {
                    // Map visual week (k) to excel column (startWeekIndex + k)
                    let colIdx = startWeekIndex + k;
                    let val = row[colIdx];

                    if (val === undefined || val === null || String(val).trim() === "") {
                        sessionFlags.push("N"); // Undefined
                    } else {
                        sessionFlags.push(String(val).trim());
                    }
                }
                attendanceData.push({ name, sessions: sessionFlags });
            }
            course.attendance = attendanceData;
            alert(`تم رفع كشف الحضور بنجاح لمقرر (${course.title})`);

        } else if (type === 'grades') {
            if (isAttendanceContent) {
                alert('خطأ: يبدو أنك تحاول رفع ملف "حضور" في خانة "الدرجات". يرجى اختيار الملف الصحيح.');
                return;
            }

            // Process Grades
            // Initialize with -1 to properly detect missing columns
            let idxId = -1, idxName = -1, idxClass = -1, idxFinal = -1, idxTotal = -1;

            // Try to find indices dynamically
            headers.forEach((h, i) => {
                const txt = String(h).trim().toLowerCase();
                if (txt.includes('id')) idxId = i;
                else if (txt.includes('اسم') || txt.includes('name')) idxName = i;
                else if (txt.includes('اعمال') || txt.includes('أعمال')) idxClass = i;
                else if (txt.includes('نهائي') || txt.includes('final')) idxFinal = i;
                else if (txt.includes('مجموع') || txt.includes('total')) idxTotal = i;
            });

            // Fallback if index 0 is not name (rare but safe)
            // If name column is still -1, try checking column 0 or 1
            if (idxName === -1) {
                if (String(headers[0]).includes('اسم')) idxName = 0;
                else idxName = 1;
            }

            const students = [];
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row) continue;

                // If name index is missing or valid, try to extract name
                const rawName = idxName > -1 ? row[idxName] : null;
                if (!rawName) continue;

                const cw = (idxClass > -1 && row[idxClass]) ? row[idxClass] : 0;
                const fn = (idxFinal > -1 && row[idxFinal]) ? row[idxFinal] : 0;

                // Use explicit total if found, otherwise calculate it
                let totalVal = (idxTotal > -1 && row[idxTotal]) ? row[idxTotal] : (Number(cw) + Number(fn));

                students.push({
                    id: (idxId > -1 ? row[idxId] : ''),
                    name: String(rawName).trim(),
                    classwork: cw,
                    final: fn,
                    total: totalVal
                });
            }

            if (students.length > 0) {
                course.students = students;
                alert(`تم تحديث درجات مقرر (${course.title}) بنجاح`);
            } else {
                alert('لم يتم العثور على بيانات درجات صالحة.');
                return;
            }
        }

        if (db) await saveToFirestore(courseKey);
        else saveToLocalStorage();

        if (currentView === 'grades') renderTable(courseKey);
        else renderAttendanceTable(courseKey);
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
}


async function handleLogin(e) {
    e.preventDefault();
    console.log('Login attempt started...', userRole);

    let inputVal;
    if (userRole === 'teacher') {
        inputVal = usernameInput.value.trim();
        if (!inputVal) {
            showError('الرجاء إدخال البريد الإلكتروني');
            return;
        }
    } else {
        inputVal = studentNameInput.value.trim();
        if (!inputVal || inputVal === "") {
            showError('الرجاء كتابة اسمك الثلاثي');
            return;
        }
    }

    const password = passwordInput.value.trim();
    if (!password) {
        showError('الرجاء إدخال كلمة المرور');
        return;
    }

    if (password.length < 4) {
        showError('كلمة المرور يجب أن تكون 4 خانات على الأقل');
        return;
    }

    const originalBtnText = loginBtn.innerHTML;
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';

    try {
        if (userRole === 'teacher') {
            if (!auth) throw new Error('يرجى تهيئة Firebase أولاً');
            await auth.signInWithEmailAndPassword(inputVal, password);
        } else {
            console.log('Student logic executing...');
            if (db) await fetchFromFirestore();

            // Find all courses for this student
            const studentCourses = [];
            for (const [key, data] of Object.entries(COURSE_DATA)) {
                if (data.students.some(s => s.name.trim() === inputVal)) {
                    studentCourses.push(key);
                }
            }

            if (studentCourses.length === 0) {
                showError(`عذراً، لم يتم العثور على اسمك في سجلاتنا`);
                return;
            }

            const storedPass = await getStudentPassword(inputVal);
            if (storedPass === null) {
                // Register
                await setStudentPassword(inputVal, password);
                alert(`أهلاً بك يا ${inputVal.split(' ')[0]}! تم حفظ كلمة سرك بنجاح. يمكنك الآن الدخول.`);
            } else {
                // Login
                if (password !== storedPass) {
                    showError('كلمة المرور غير صحيحة لهذا الاسم');
                    return;
                }
            }

            // Authenticate anonymously for Firestore access
            if (auth) {
                try {
                    await auth.signInAnonymously();
                } catch (authError) {
                    console.error('Anonymous auth failed:', authError);
                }
            }

            isAuthenticated = true;
            currentStudentName = inputVal;
            currentUserSpan.textContent = inputVal;
            currentUserSpan.nextElementSibling.textContent = 'طالب';

            // Default to the first course they are enrolled in
            courseSelect.value = studentCourses[0];

            // Increment visit count for student
            await incrementStudentVisit();

            showDashboard();
        }
    } catch (error) {
        console.error('Error in login:', error);
        let msg = 'تعذر تسجيل الدخول، يرجى المحاولة لاحقاً';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            msg = 'البيانات غير صحيحة';
        } else if (error.code === 'permission-denied' || error.message.includes('permission')) {
            msg = 'خطأ في الصلاحيات. تأكد من إعدادات Firestore Rules';
        }
        showError(msg);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalBtnText;
    }
}


function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'flex';
    usernameInput.value = '';
    passwordInput.value = '';
    if (errorMsg) errorMsg.style.display = 'none';

    const navLinks = document.querySelector('.nav-links');
    let settingsBtn = document.getElementById('nav-settings-btn');
    let statsBtn = document.getElementById('nav-stats-btn');

    populateCourseDropdown(); // Refresh dropdown for the current user (role check inside)

    if (userRole === 'teacher') {
        thControls.style.display = 'table-cell';
        currentUserSpan.nextElementSibling.textContent = 'مدرس المادة';

        // Re-create buttons if missing
        if (navLinks) {
            if (!statsBtn) {
                statsBtn = document.createElement('button');
                statsBtn.className = 'nav-btn';
                statsBtn.id = 'nav-stats-btn';
                statsBtn.dataset.tab = 'stats';
                statsBtn.innerHTML = '<i class="fa-solid fa-chart-simple"></i> الإحصائيات';
                statsBtn.addEventListener('click', () => switchTab('stats'));
                // Insert before settings if possible
                if (settingsBtn) navLinks.insertBefore(statsBtn, settingsBtn);
                else navLinks.appendChild(statsBtn);
            }
            if (!settingsBtn) {
                settingsBtn = document.createElement('button');
                settingsBtn.className = 'nav-btn';
                settingsBtn.id = 'nav-settings-btn';
                settingsBtn.dataset.tab = 'settings';
                settingsBtn.innerHTML = '<i class="fa-solid fa-gears"></i> الإدارة';
                settingsBtn.addEventListener('click', () => switchTab('settings'));
                navLinks.appendChild(settingsBtn);
            }
        }
        if (settingsBtn) settingsBtn.style.display = 'flex';
        if (statsBtn) statsBtn.style.display = 'flex';
    } else {
        thControls.style.display = 'none';
        currentUserSpan.nextElementSibling.textContent = 'طالب';

        // Physically remove admin/stats buttons for students
        if (settingsBtn) settingsBtn.remove();
        if (statsBtn) statsBtn.remove();

        // Ensure student is not on restricted tabs
        if (currentView === 'settings' || currentView === 'stats') switchTab('grades');
    }

    if (currentView === 'grades') renderTable(courseSelect.value);
    else renderAttendanceTable(courseSelect.value);
}

async function handleLogout() {
    try {
        if (userRole === 'teacher' && auth) {
            await auth.signOut();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }

    isAuthenticated = false;
    currentStudentName = '';

    // Reset UI to login state
    dashboardSection.style.display = 'none';
    loginSection.style.display = 'block';

    // Reset role to teacher by default for next login
    switchRole('teacher');

    // Clear sensitive data from view
    tableBody.innerHTML = '';
    attendanceBody.innerHTML = '';
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
    errorMsg.style.background = 'rgba(239, 68, 68, 0.1)'; // Reset to error color
    errorMsg.style.color = 'var(--error)';
    errorMsg.parentElement.classList.add('shake');
    setTimeout(() => errorMsg.parentElement.classList.remove('shake'), 500);
}

function renderTable(courseKey) {
    const course = COURSE_DATA[courseKey];
    if (!course) return;

    tableBody.innerHTML = '';

    let studentsToRender = course.students;
    if (userRole === 'student') {
        studentsToRender = course.students.filter(s => s.name.trim() === currentStudentName);
    }

    if (studentsToRender.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">لا توجد بيانات مسجلة</td></tr>';
        return;
    }

    studentsToRender.forEach(student => {
        const tr = document.createElement('tr');

        let gradeClass = 'grade-low';
        const t = parseFloat(student.total);
        if (t >= 85) gradeClass = 'grade-high';
        else if (t >= 65) gradeClass = 'grade-med';

        const cw = student.classwork !== undefined ? student.classwork : '-';
        const fin = student.final !== undefined ? student.final : '-';

        let controlCell = '';
        if (userRole === 'teacher') {
            controlCell = `
                <td style="text-align:center; min-width: 100px;">
                    <button onclick="shareGrade('${student.name.trim()}', '${cw}', '${fin}', '${student.total}')" class="btn-reset-small" style="color: var(--success); border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.1); margin-left: 5px;" title="مشاركة عبر واتساب">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                    <button onclick="resetStudentPassword('${student.name.trim()}')" class="btn-reset-small" title="تصفير كلمة سر الطالب">
                        <i class="fa-solid fa-unlock-keyhole"></i>
                    </button>
                </td>`;
        }

        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--text-primary); text-align: right;">${student.name}</td>
            <td style="color: var(--text-primary);">${cw}</td>
            <td style="color: var(--text-primary);">${fin}</td>
            <td>
                <span class="grade-badge ${gradeClass}">${student.total}</span>
            </td>
            ${controlCell}
        `;
        tableBody.appendChild(tr);
    });
}

function renderAttendanceTable(courseKey) {
    const course = COURSE_DATA[courseKey];
    if (!course) return;

    // Build Header
    let headHtml = '<tr><th style="min-width: 200px;">اسم الطالب</th>';
    for (let i = 1; i <= 14; i++) {
        headHtml += `<th>أسبوع ${i}</th>`;
    }
    if (userRole === 'teacher') headHtml += `<th>إجراءات</th>`;
    headHtml += '</tr>';
    attendanceHead.innerHTML = headHtml;

    // Build Body
    attendanceBody.innerHTML = '';
    let studentsToRender = course.attendance || [];

    if (userRole === 'student') {
        studentsToRender = studentsToRender.filter(s => s.name.trim() === currentStudentName);
    }

    if (studentsToRender.length === 0) {
        attendanceBody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding: 2rem;">لا توجد بيانات حضور مسجلة</td></tr>`;
        return;
    }

    studentsToRender.forEach(row => {
        const tr = document.createElement('tr');
        let cells = `<td style="font-weight: bold; color: var(--text-primary); text-align: right;">${row.name}</td>`;

        row.sessions.forEach(s => {
            let content = '';
            if (s === '1') content = '<span class="att-icon att-present" title="حاضر">✔️</span>';
            else if (s === '0') content = '<span class="att-icon att-absent" title="غائب بدون عذر">❌</span>';
            else if (s === 'م') content = '<span class="att-icon att-excused" title="غائب معذور">م</span>';
            else content = '<span class="att-icon att-undefined" title="غير معرف">N</span>';

            cells += `<td>${content}</td>`;
        });

        // Fill empty cells if less than 14
        for (let i = row.sessions.length; i < 14; i++) {
            cells += `<td><span class="att-icon att-undefined">N</span></td>`;
        }

        if (userRole === 'teacher') {
            const sessionsData = JSON.stringify(row.sessions).replace(/"/g, '&quot;');
            const safeName = row.name.trim().replace(/'/g, "\\'");

            cells += `
                <td style="text-align:center;">
                    <button onclick="shareAttendance('${safeName}', ${sessionsData})" class="btn-reset-small" style="color: var(--success); border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.1);" title="مشاركة الحضور واتساب">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                </td>`;
        }

        tr.innerHTML = cells;
        attendanceBody.appendChild(tr);
    });
}

function shareGrade(name, cw, final, total) {
    const text = `*نتائج الطالب:* ${name}\n` +
        `*أعمال الفصل:* ${cw}\n` +
        `*النهائي:* ${final}\n` +
        `*المجموع:* ${total}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareAttendance(name, sessions) {
    let weekDetails = '';
    const arabicWeeks = [
        "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع",
        "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر"
    ];

    const checkMark = '\u2714\uFE0F'; // Robust Unicode escape for ✔️
    const crossMark = '\u274C';     // Robust Unicode escape for ❌

    for (let i = 0; i < 14; i++) {
        const s = sessions[i] || 'N';
        let status = s;
        if (s === '1') status = checkMark;
        else if (s === '0') status = crossMark;
        else if (s === 'م') status = 'م';
        else status = 'N';

        weekDetails += `\nالأسبوع ${arabicWeeks[i]}: ${status}`;
    }

    const text = `*تقرير حضور الطالب:* ${name}${weekDetails}\n\n` +
        `*ملحوظة:*\n` +
        `${checkMark} حاضر\n` +
        `${crossMark} غائب دون عذر\n` +
        `م غائب بعذر\n` +
        `N غير معرف`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}


// --- Dynamic Course Management ---
function populateCourseDropdown() {
    courseSelect.innerHTML = '';
    // loginCourseSelect.innerHTML = ''; // No longer used for login

    for (const [key, data] of Object.entries(COURSE_DATA)) {
        if (data.hidden) continue;

        // If student is logged in, only show THEIR courses
        if (userRole === 'student' && isAuthenticated) {
            const isEnrolled = data.students.some(s => s.name.trim() === currentStudentName);
            if (!isEnrolled) continue;
        }

        const option = document.createElement('option');
        option.value = key;
        option.textContent = data.title;
        courseSelect.appendChild(option);
    }
}



function renderSettingsView() {
    const list = document.getElementById('settings-course-list');
    if (!list) return;
    list.innerHTML = '';

    for (const [key, data] of Object.entries(COURSE_DATA)) {
        const item = document.createElement('div');
        item.className = `course-card ${data.hidden ? 'hidden' : ''}`;
        item.innerHTML = `
            <div class="course-info">
                <span class="course-title">${data.title}</span>
                <span class="course-status">${data.hidden ? '(مخفي)' : '(نشط)'}</span>
            </div>
            <div class="course-actions">
                <button class="course-toggle-btn" onclick="toggleCourseVisibility('${key}')" title="${data.hidden ? 'إظهار' : 'إخفاء'}">
                    ${data.hidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>'}
                </button>
            </div>
        `;
        list.appendChild(item);
    }
}

async function addNewCourseFromSettings() {
    const input = document.getElementById('settings-new-course');
    const courseName = input.value.trim();
    if (!courseName) return;

    if (COURSE_DATA[courseName]) {
        alert('هذا المقرر موجود بالفعل');
        return;
    }

    const newKey = courseName;
    COURSE_DATA[newKey] = {
        title: courseName,
        students: [],
        attendance: [],
        announcements: [],
        hidden: false
    };

    // Optimistic UI Update
    input.value = '';
    renderSettingsView();
    populateCourseDropdown();

    try {
        // Save to BOTH for extra persistence/local fallback
        saveToLocalStorage();
        if (db) await saveToFirestore(newKey);
        alert(`تم إضافة مقرر (${courseName}) بنجاح`);
    } catch (e) {
        console.error('Persistence failed:', e);
        alert('حدثت مشكلة في حفظ المقرر الجديد سحابياً');
    }
}

function toggleCourseVisibility(key) {
    const course = COURSE_DATA[key];
    if (course) {
        const isCurrentlyHidden = course.hidden;
        const confirmMsg = isCurrentlyHidden
            ? `هل أنت متأكد من إظهار مقرر (${course.title})؟\nسيكون متاحاً للطلاب للبحث وتسجيل الدخول.`
            : `هل أنت متأكد من إخفاء مقرر (${course.title})؟\nلن يتمكن الطلاب من رؤيته أو تسجيل الدخول إليه.`;

        if (confirm(confirmMsg)) {
            course.hidden = !course.hidden;
            if (db) saveToFirestore(key);
            else saveToLocalStorage();
            populateCourseDropdown();
            renderSettingsView(); // Refresh list
        }
    }
}


// --- Printing System ---

// --- Final Initialization ---
// --- Announcements Logic ---

function renderAnnouncements(courseKey) {
    const container = document.getElementById('announcements-container');
    const course = COURSE_DATA[courseKey];

    // Ensure announcements array exists
    if (!course.announcements) course.announcements = [];

    // Header / Form Container
    let html = `
        <div id="ann-form-container" style="display: none;">
            <div class="add-ann-form">
                <h3 id="ann-form-title">إضافة إعلان جديد</h3>
                <input type="hidden" id="ann-edit-id" value="">
                <div class="form-row">
                    <div class="form-group">
                        <label>عنوان الإعلان</label>
                        <input type="text" id="ann-title-input" placeholder="مثال: موعد اختبار المنتصف">
                    </div>
                     <div class="form-group" style="flex: 0 0 150px;">
                        <label>النوع</label>
                        <select id="ann-type-input">
                            <option value="info">معلومة عامة ℹ️</option>
                            <option value="alert">تنبيه هام ⚠️</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>نص الإعلان</label>
                    <textarea id="ann-content-input" placeholder="اكتب تفاصيل الإعلان هنا..."></textarea>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 10px;">
                    <button onclick="saveNewAnnouncement()" class="btn-primary" style="width: auto;">حفظ الإعلان</button>
                    <button onclick="cancelAddAnnouncement()" class="logout-btn" style="background: rgba(255,255,255,0.05);">إلغاء</button>
                </div>
            </div>
        </div>
    `;

    // Grid Container
    html += '<div class="announcements-grid" id="ann-grid">';
    html += generateAnnouncementCards(course.announcements);
    html += '</div>';

    container.innerHTML = html;
}

function generateAnnouncementCards(list) {
    if (!list || list.length === 0) {
        return `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); margin-top: 2rem;">لا توجد إعلانات حالياً في هذا المقرر.</p>`;
    }

    // Sort by date (newest first)
    const sortedList = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));

    return sortedList.map(ann => {
        const isAlert = ann.type === 'alert';
        const typeClass = isAlert ? 'type-alert' : 'type-info';

        let actionsHtml = '';
        if (userRole === 'teacher') {
            actionsHtml = `
                <div class="ann-actions">
                    <button class="ann-btn edit" onclick="editAnnouncement('${ann.id}')" title="تعديل">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="ann-btn delete" onclick="deleteAnnouncement('${ann.id}')" title="حذف">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        }

        return `
            <div class="announcement-card ${typeClass}">
                <div class="ann-header">
                    <h4 class="ann-title">${ann.title}</h4>
                    <span class="ann-date">${new Date(ann.date).toLocaleDateString('ar-SA')}</span>
                </div>
                <div class="ann-content">${formatContent(ann.content)}</div>
                ${actionsHtml}
            </div>
        `;
    }).join('');
}

function formatContent(text) {
    return text ? text.replace(/\n/g, '<br>') : '';
}

function showAddAnnouncementForm() {
    const form = document.getElementById('ann-form-container');
    if (form) {
        // Reset form for "New" mode
        document.getElementById('ann-form-title').textContent = 'إضافة إعلان جديد';
        document.getElementById('ann-edit-id').value = '';
        document.getElementById('ann-title-input').value = '';
        document.getElementById('ann-content-input').value = '';
        document.getElementById('ann-type-input').value = 'info';

        form.style.display = 'block';
        // Hide grid while editing/adding? No, better to keep it visible but maybe scroll to form
        // document.getElementById('ann-grid').style.display = 'none'; 
        // Just scroll top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function editAnnouncement(annId) {
    const courseKey = courseSelect.value;
    const course = COURSE_DATA[courseKey];
    const ann = course.announcements.find(a => a.id === annId);

    if (!ann) return;

    showAddAnnouncementForm(); // Open the form first

    // Populate with data
    document.getElementById('ann-form-title').textContent = 'تعديل الإعلان';
    document.getElementById('ann-edit-id').value = ann.id;
    document.getElementById('ann-title-input').value = ann.title;
    document.getElementById('ann-content-input').value = ann.content;
    document.getElementById('ann-type-input').value = ann.type;
}

function cancelAddAnnouncement() {
    const form = document.getElementById('ann-form-container');
    if (form) form.style.display = 'none';
}

async function saveNewAnnouncement() {
    const title = document.getElementById('ann-title-input').value.trim();
    const content = document.getElementById('ann-content-input').value.trim();
    const type = document.getElementById('ann-type-input').value;
    const editId = document.getElementById('ann-edit-id').value;

    const courseKey = courseSelect.value;
    const course = COURSE_DATA[courseKey];

    if (!title || !content) {
        alert('يرجى تعبئة العنوان ونص الإعلان');
        return;
    }

    if (!course.announcements) course.announcements = [];

    if (editId) {
        // Update existing
        const index = course.announcements.findIndex(a => a.id === editId);
        if (index !== -1) {
            course.announcements[index] = {
                ...course.announcements[index],
                title,
                content,
                type,
                // Optional: Update date or keep original? Usually keep original creation date OR add updated date.
                // For simplicity, let's keep original date unless user explicitly wants to "bump" it.
                // Let's NOT update date to preserve history, or maybe update it?
                // Use case: fixing a typo shouldn't change the date.
            };
        }
    } else {
        // Create new
        const newAnn = {
            id: Date.now().toString(),
            title,
            content,
            type,
            date: new Date().toISOString()
        };
        course.announcements.push(newAnn);
    }

    try {
        if (db) await saveToFirestore(courseKey);
        else saveToLocalStorage();

        // Refresh View
        renderAnnouncements(courseKey);
        // Close form
        cancelAddAnnouncement();
    } catch (e) {
        console.error('Error saving announcement:', e);
        alert('حدث خطأ أثناء الحفظ');
    }
}

async function deleteAnnouncement(annId) {
    if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;

    const courseKey = courseSelect.value;
    const course = COURSE_DATA[courseKey];

    if (course.announcements) {
        course.announcements = course.announcements.filter(a => a.id !== annId);

        try {
            if (db) await saveToFirestore(courseKey);
            else saveToLocalStorage();
            renderAnnouncements(courseKey);
        } catch (e) {
            console.error('Error deleting announcement:', e);
        }
    }
}

init();
