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
let storage;
function initFirebase() {
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("Firebase not configured. Using LocalStorage fallback.");
        return false;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    storage = firebase.storage();
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
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);

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

    // Load Theme
    const savedTheme = localStorage.getItem('portalTheme') || 'original';
    setTheme(savedTheme);

    // Initial config load
    await loadAssistantConfig();
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

function setTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem('portalTheme', theme);

    // Update button states
    const btns = document.querySelectorAll('.theme-opt-btn');
    btns.forEach(btn => {
        if (btn.classList.contains(`theme-${theme}`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
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
    const views = ['grades-container', 'attendance-container', 'files-container', 'exams-container', 'announcements-container', 'settings-container', 'stats-container'];
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
    } else if (tabId === 'files') {
        const el = document.getElementById('files-container');
        if (el) el.style.display = 'block';
        currentView = 'files';
        renderFiles(courseSelect.value);
    } else if (tabId === 'exams') {
        const el = document.getElementById('exams-container');
        if (el) el.style.display = 'block';
        currentView = 'exams';
        renderExams(courseSelect.value);
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

    // Always refresh student bar visibility on tab switch
    if (userRole === 'student') {
        renderStudentAnnouncementsBar(courseSelect.value);
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
    } else if (tabId === 'files') {
        bar.innerHTML = `
            <button onclick="document.getElementById('file-upload').click()" class="upload-btn" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                <i class="fa-solid fa-cloud-arrow-up"></i> رفع ملف
            </button>
        `;
    } else if (tabId === 'exams') {
        bar.innerHTML = `
            <button onclick="showExamCreator()" class="upload-btn" style="background: linear-gradient(135deg, #10b981, #059669);">
                <i class="fa-solid fa-plus"></i> إنشاء امتحان تفاعلي
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

    // AI Assistant Visibility check
    if (typeof updateAIAssistantVisibility === 'function') updateAIAssistantVisibility();
    updateAIAssistantVisibility();
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

    if (typeof updateAIAssistantVisibility === 'function') updateAIAssistantVisibility();
    updateAIAssistantVisibility();
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

    // Update Announcement Bar for Students
    if (userRole === 'student') renderStudentAnnouncementsBar(courseKey);
    else {
        const bar = document.getElementById('student-announcements-bar');
        if (bar) bar.style.display = 'none';
    }
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

    // Update Announcement Bar for Students
    if (userRole === 'student') renderStudentAnnouncementsBar(courseKey);
    else {
        const bar = document.getElementById('student-announcements-bar');
        if (bar) bar.style.display = 'none';
    }
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

    let displayList = sortedList;
    // Deduplicate for students: The top 2 are already in the bar, so show the rest here
    if (userRole === 'student') {
        displayList = sortedList.slice(2);
        if (displayList.length === 0) {
            return `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); margin-top: 2rem;">الإعلانات الأحدث تظهر في الشريط أعلاه.</p>`;
        }
    }

    return displayList.map(ann => {
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

function renderStudentAnnouncementsBar(courseKey) {
    const bar = document.getElementById('student-announcements-bar');
    if (!bar) return;

    // Only for students
    if (userRole !== 'student') {
        bar.style.display = 'none';
        return;
    }

    // Allow bar in announcements view now, as we deduplicate the list
    /*
    if (currentView === 'announcements') {
        bar.style.display = 'none';
        return;
    }
    */

    const course = COURSE_DATA[courseKey];
    if (!course || !course.announcements || course.announcements.length === 0) {
        bar.style.display = 'none';
        return;
    }

    // Get last 2
    const sortedList = [...course.announcements].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = sortedList.slice(0, 2);

    if (recent.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.innerHTML = recent.map(ann => {
        const isAlert = ann.type === 'alert';
        const icon = isAlert ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-circle-info"></i>';
        const typeClass = isAlert ? 'alert' : 'info';

        return `
            <div class="student-ann-item ${typeClass}">
                <div class="student-ann-icon">${icon}</div>
                <div class="student-ann-content">
                    <span class="student-ann-title">${ann.title}</span>
                    <span class="student-ann-text">${ann.content}</span>
                </div>
                <span class="student-ann-date">${new Date(ann.date).toLocaleDateString('ar-SA')}</span>
            </div>
        `;
    }).join('');

    bar.style.display = 'flex';
}

// --- Files Management Functions ---

async function renderFiles(courseKey) {
    const container = document.getElementById('files-container');
    if (!container) return;

    const course = COURSE_DATA[courseKey];
    if (!course) return;

    if (!course.files) course.files = [];

    const lectures = course.files.filter(f => f.category === 'lecture');
    const assignments = course.files.filter(f => f.category === 'assignment');

    let html = '';

    const renderSection = (title, files, emptyMsg) => {
        let sectionHtml = `
            <div class="settings-section" style="margin-bottom: 2rem;">
                <h3 style="border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
                    <i class="fa-solid ${title === 'المحاضرات' ? 'fa-book-open' : 'fa-file-signature'}"></i> ${title}
                </h3>
        `;

        if (files.length === 0) {
            sectionHtml += `<p style="text-align: center; padding: 2rem; color: var(--text-secondary); opacity: 0.6;">${emptyMsg}</p>`;
        } else {
            sectionHtml += '<div class="files-grid">';
            files.forEach((file) => {
                const icon = file.name.toLowerCase().endsWith('.pdf') ? 'fa-file-pdf' :
                    (file.name.toLowerCase().includes('ppt') ? 'fa-file-powerpoint' : 'fa-file-word');

                // Find actual index in source array for deletion
                const sourceIndex = course.files.indexOf(file);

                sectionHtml += `
                    <div class="file-card">
                        <div class="file-icon">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="file-info">
                            <span class="file-name">${file.name}</span>
                            <span class="file-meta">${file.date || ''}</span>
                        </div>
                        <div class="file-actions">
                            <a href="${file.url}" target="_blank" class="file-btn btn-download">
                                <i class="fa-solid fa-download"></i> تحميل
                            </a>
                            ${userRole === 'teacher' ? `
                                <button onclick="deleteFile('${courseKey}', ${sourceIndex})" class="file-btn btn-delete">
                                    <i class="fa-solid fa-trash"></i> حذف
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            sectionHtml += '</div>';
        }
        sectionHtml += '</div>';
        return sectionHtml;
    };

    html += renderSection('المحاضرات', lectures, 'لا توجد محاضرات مرفوعة بعد.');
    html += renderSection('الواجبات', assignments, 'لا توجد واجبات مرفوعة بعد.');

    container.innerHTML = html;
}

async function handleFileUpload(e) {
    console.log("File selection event triggered.");
    if (userRole !== 'teacher') {
        console.warn("Upload aborted: User is not a teacher.");
        return;
    }

    const file = e.target.files[0];
    if (!file) {
        console.log("No file selected.");
        return;
    }

    console.log("File selected:", file.name, "Size:", file.size, "Type:", file.type);

    const MAX_SIZE = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_SIZE) {
        alert("الملف كبير جداً. الحد الأقصى هو 25 ميجابايت.");
        e.target.value = '';
        return;
    }

    const courseKey = courseSelect.value;
    const course = COURSE_DATA[courseKey];
    console.log("Target Course:", courseKey);

    if (!courseKey) {
        alert("يرجى اختيار مقرر أولاً.");
        e.target.value = '';
        return;
    }

    const typeMsg = "اختر نوع الملف لرفعه:\n1 - محاضرة\n2 - واجب\nأدخل الرقم المقابل:";
    const res = prompt(typeMsg);

    let category = '';
    if (res === '1') category = 'lecture';
    else if (res === '2') category = 'assignment';
    else {
        alert("إلغاء الرفع: يجب اختيار نوع صحيح (1 أو 2).");
        e.target.value = '';
        return;
    }

    if (!confirm(`هل أنت متأكد من رفع الملف (${category === 'lecture' ? 'محاضرة' : 'واجب'}): ${file.name}؟`)) {
        e.target.value = '';
        return;
    }

    const uploadBtn = document.querySelector('#action-bar .upload-btn');
    const originalText = uploadBtn ? uploadBtn.innerHTML : '';

    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحضير...';
    }

    try {
        console.log("Checking storage initialization...");
        if (!storage) {
            console.log("Storage not initialized, trying manually...");
            storage = firebase.storage();
        }

        if (!storage) throw new Error('Firebase Storage could not be initialized.');

        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `courses/${courseKey}/files/${timestamp}_${safeName}`;
        console.log("Upload path:", filePath);

        const storageRef = storage.ref(filePath);
        console.log("Storage reference created. Starting put(file)...");

        // Use uploadTask for better control and monitoring
        const uploadTask = storageRef.put(file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload is ' + progress + '% done');
                if (uploadBtn) {
                    uploadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${Math.round(progress)}%`;
                }
            },
            (error) => {
                console.error("Firebase Storage Upload Error:", error);
                let msg = 'فشل الرفع: ';
                if (error.code === 'storage/unauthorized') {
                    msg += 'لا تملك صلاحية الرفع. يرجى مراجعة القواعد (Rules) في متجر فيربيز لتسمح بالرفع.';
                } else if (error.code === 'storage/retry-limit-exceeded') {
                    msg += 'انتهى الوقت المسموح به للرفع. تأكد من جودة الاتصال.';
                } else {
                    msg += error.message;
                }
                alert(msg);
                if (uploadBtn) {
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = originalText;
                }
            },
            async () => {
                console.log("Upload task completed successfully.");
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                console.log("Download URL obtained:", downloadURL);

                if (!course.files) course.files = [];

                const fileMetadata = {
                    name: file.name,
                    url: downloadURL,
                    path: filePath,
                    size: file.size,
                    type: file.type,
                    category: category,
                    date: new Date().toLocaleDateString('ar-EG')
                };

                course.files.push(fileMetadata);

                console.log("Saving metadata to database...");
                if (db) {
                    await saveToFirestore(courseKey);
                } else {
                    saveToLocalStorage();
                }

                alert('تم رفع الملف بنجاح ✅');
                renderFiles(courseKey);

                if (uploadBtn) {
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = originalText;
                }
            }
        );

    } catch (error) {
        console.error('Fatal Upload Error:', error);
        alert('حدث خطأ فادح أثناء تهيئة الرفع: ' + error.message);
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalText;
        }
    } finally {
        e.target.value = '';
    }
}

async function deleteFile(courseKey, index) {
    if (userRole !== 'teacher') return;

    const course = COURSE_DATA[courseKey];
    if (!course || !course.files || !course.files[index]) return;

    const file = course.files[index];

    if (!confirm(`هل أنت متأكد من حذف الملف: ${file.name}؟`)) return;

    try {
        if (file.path && storage) {
            await storage.ref(file.path).delete();
        }

        course.files.splice(index, 1);

        if (db) await saveToFirestore(courseKey);
        else saveToLocalStorage();

        alert('تم حذف الملف بنجاح.');
        renderFiles(courseKey);
    } catch (error) {
        console.error('File deletion failed:', error);
        alert('حدث خطأ أثناء حذف الملف.');
    }
}

// --- Interactive Exams Functions ---

async function renderExams(courseKey) {
    const container = document.getElementById('exams-container');
    if (!container) return;

    const course = COURSE_DATA[courseKey];
    if (!course) return;

    if (!course.exams) course.exams = [];

    if (course.exams.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 4rem; color: var(--text-secondary);">
                <i class="fa-solid fa-graduation-cap" style="font-size: 4rem; opacity: 0.2; margin-bottom: 1.5rem;"></i>
                <p>لا توجد امتحانات تفاعلية متاحة لهذا المقرر حالياً.</p>
            </div>
        `;
        return;
    }

    let html = '<div class="exam-grid">';
    course.exams.forEach((exam, index) => {
        html += `
            <div class="exam-card" onclick="startExam('${courseKey}', ${index})">
                <div class="exam-badge">20 سؤال</div>
                <div class="exam-icon">
                    <i class="fa-solid fa-file-invoice"></i>
                </div>
                <div class="exam-name">${exam.title}</div>
                <div style="text-align: center; font-size: 0.8rem; opacity: 0.6;">
                    ${exam.createdAt || ''}
                </div>
                ${userRole === 'teacher' ? `
                    <button onclick="event.stopPropagation(); deleteExam('${courseKey}', ${index})" 
                            style="margin-top: 1rem; padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1); color: #ef4444; cursor: pointer;">
                        <i class="fa-solid fa-trash"></i> حذف الامتحان
                    </button>
                ` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function showExamCreator() {
    const container = document.getElementById('exams-container');
    if (!container) return;

    let html = `
        <div class="exam-creator-container">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <h2><i class="fa-solid fa-magic-wand-sparkles"></i> إنشاء امتحان جديد</h2>
                <button onclick="renderExams(courseSelect.value)" class="nav-btn" style="padding: 0.5rem 1rem;">إلغاء</button>
            </div>
            
            <div class="settings-section">
                <label>عنوان الامتحان (مثلاً: امتحان الشهر الأول)</label>
                <input type="text" id="exam-title-input" placeholder="أدخل عنواناً جذاباً..." style="margin-bottom: 2rem;">
                
                <p style="margin-bottom: 1.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                    <i class="fa-solid fa-circle-info"></i> الامتحان الموحد يحتوي على 20 سؤال (10 صح/خطأ و 10 اختيارات).
                </p>

                <div id="questions-inputs">
    `;

    // 10 True/False Questions
    for (let i = 1; i <= 10; i++) {
        html += `
            <div class="question-input-card" data-type="tf">
                <div class="question-header">السؤال ${i} (صح / خطأ)</div>
                <textarea placeholder="اكتب نص السؤال هنا..." class="q-text"></textarea>
                <div class="opt-grid">
                    <label class="radio-label"><input type="radio" name="q${i}-ans" value="true"> صح</label>
                    <label class="radio-label"><input type="radio" name="q${i}-ans" value="false"> خطأ</label>
                </div>
            </div>
        `;
    }

    // 10 Multiple Choice Questions
    for (let i = 11; i <= 20; i++) {
        html += `
            <div class="question-input-card" data-type="mc">
                <div class="question-header">السؤال ${i} (اختيار من متعدد)</div>
                <textarea placeholder="اكتب نص السؤال هنا..." class="q-text"></textarea>
                <div class="opt-grid">
                    <div class="opt-input">
                        <input type="radio" name="q${i}-ans" value="0">
                        <input type="text" placeholder="الخيار الأول" class="q-opt">
                    </div>
                    <div class="opt-input">
                        <input type="radio" name="q${i}-ans" value="1">
                        <input type="text" placeholder="الخيار الثاني" class="q-opt">
                    </div>
                    <div class="opt-input">
                        <input type="radio" name="q${i}-ans" value="2">
                        <input type="text" placeholder="الخيار الثالث" class="q-opt">
                    </div>
                    <div class="opt-input">
                        <input type="radio" name="q${i}-ans" value="3">
                        <input type="text" placeholder="الخيار الرابع" class="q-opt">
                    </div>
                </div>
            </div>
        `;
    }

    html += `
                </div>
                <button onclick="saveNewExam()" class="upload-btn" style="width: 100%; margin-top: 2rem; background: linear-gradient(135deg, #10b981, #059669);">
                    <i class="fa-solid fa-floppy-disk"></i> حفظ ونشر الامتحان
                </button>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

async function saveNewExam() {
    const title = document.getElementById('exam-title-input').value;
    if (!title) return alert("يرجى إدخال عنوان للامتحان.");

    const questionCards = document.querySelectorAll('.question-input-card');
    const questions = [];

    for (let card of questionCards) {
        const text = card.querySelector('.q-text').value;
        const type = card.dataset.type;
        const ansInput = card.querySelector('input[name="' + card.querySelector('input, textarea').name + '"]:checked');

        if (!text) return alert("يرجى ملء جميع نصوص الأسئلة.");
        if (!ansInput) return alert("يرجى تحديد الإجابة الصحيحة لكل سؤال.");

        const qData = { text, type, correctAnswer: ansInput.value };

        if (type === 'mc') {
            const options = Array.from(card.querySelectorAll('.q-opt')).map(opt => opt.value);
            if (options.some(o => !o)) return alert("يرجى ملء جميع خيارات السؤال المتعدد.");
            qData.options = options;
        }

        questions.push(qData);
    }

    const courseKey = courseSelect.value;
    const newExam = {
        id: Date.now(),
        title: title,
        questions: questions,
        createdAt: new Date().toLocaleDateString('ar-EG')
    };

    if (!COURSE_DATA[courseKey].exams) COURSE_DATA[courseKey].exams = [];
    COURSE_DATA[courseKey].exams.push(newExam);

    try {
        if (db) await saveToFirestore(courseKey);
        else saveToLocalStorage();
        alert("تم حفظ الامتحان بنجاح ✅");
        renderExams(courseKey);
    } catch (e) {
        alert("فشل الحفظ: " + e.message);
    }
}

async function deleteExam(courseKey, index) {
    if (!confirm("هل أنت متأكد من حذف هذا الامتحان؟")) return;
    COURSE_DATA[courseKey].exams.splice(index, 1);
    if (db) await saveToFirestore(courseKey);
    else saveToLocalStorage();
    renderExams(courseKey);
}

// --- Exam Player Logic ---

let activeExam = null;
let currentQuestionIndex = 0;
let studentAnswers = [];

function startExam(courseKey, examIndex) {
    const exam = COURSE_DATA[courseKey].exams[examIndex];
    if (!exam) return;

    if (userRole === 'teacher') {
        if (!confirm("أنت مسجل كمدرب. هل تريد معاينة الامتحان؟")) return;
    }

    activeExam = exam;
    currentQuestionIndex = 0;
    studentAnswers = new Array(exam.questions.length).fill(null);

    renderPlayer();
}

function renderPlayer() {
    const container = document.getElementById('exams-container');
    if (!container || !activeExam) return;

    const q = activeExam.questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / activeExam.questions.length) * 100;

    let html = `
        <div class="exam-player">
            <div class="player-header">
                <h2>${activeExam.title}</h2>
                <p>السؤال ${currentQuestionIndex + 1} من ${activeExam.questions.length}</p>
            </div>
            
            <div class="player-progress">
                <div class="progress-bar" style="width: ${progress}%"></div>
            </div>

            <div class="player-question-card">
                <h3 style="line-height: 1.6;">${q.text}</h3>
                <div class="player-options">
    `;

    if (q.type === 'tf') {
        const options = [{ val: 'true', label: 'صح' }, { val: 'false', label: 'خطأ' }];
        options.forEach(opt => {
            const isSelected = studentAnswers[currentQuestionIndex] === opt.val;
            html += `
                <div class="player-option ${isSelected ? 'selected' : ''}" onclick="saveAnswer('${opt.val}')">
                    ${opt.label}
                </div>
            `;
        });
    } else {
        q.options.forEach((optText, i) => {
            const isSelected = studentAnswers[currentQuestionIndex] === i.toString();
            html += `
                <div class="player-option ${isSelected ? 'selected' : ''}" onclick="saveAnswer('${i}')">
                    <span style="width: 30px; height: 30px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center;">${String.fromCharCode(65 + i)}</span>
                    ${optText}
                </div>
            `;
        });
    }

    html += `
                </div>
            </div>

            <div class="player-controls">
                <button onclick="prevQuestion()" ${currentQuestionIndex === 0 ? 'disabled' : ''} class="nav-btn" style="padding: 0.8rem 1.5rem;">
                    السابق
                </button>
                
                ${currentQuestionIndex === activeExam.questions.length - 1 ? `
                    <button onclick="finishExam()" class="upload-btn" style="background: linear-gradient(135deg, #10b981, #059669); padding: 0.8rem 2rem;">
                        إنهاء الامتحان
                    </button>
                ` : `
                    <button onclick="nextQuestion()" class="upload-btn" style="padding: 0.8rem 2rem;">
                        التالي
                    </button>
                `}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function saveAnswer(val) {
    studentAnswers[currentQuestionIndex] = val;
    renderPlayer();
}

function nextQuestion() {
    if (studentAnswers[currentQuestionIndex] === null) return alert("يرجى اختيار إجابة للمتابعة.");
    if (currentQuestionIndex < activeExam.questions.length - 1) {
        currentQuestionIndex++;
        renderPlayer();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderPlayer();
    }
}

function finishExam() {
    if (studentAnswers[currentQuestionIndex] === null) return alert("يرجى اختيار إجابة للمتابعة.");
    if (!confirm("هل أنت متأكد من إنهاء الامتحان وتسليمه؟")) return;

    let score = 0;
    activeExam.questions.forEach((q, i) => {
        if (studentAnswers[i] === q.correctAnswer) score++;
    });

    const container = document.getElementById('exams-container');
    container.innerHTML = `
        <div class="results-screen">
            <i class="fa-solid fa-trophy" style="font-size: 4rem; color: #fbbf24;"></i>
            <h2 style="margin-top: 1.5rem;">انتهى الامتحان!</h2>
            <p>لقد أتممت ${activeExam.title} بنجاح.</p>
            
            <div class="score-circle">
                <span class="score-num">${score}</span>
                <span class="score-total">من 20</span>
            </div>

            <p style="margin-bottom: 2rem; opacity: 0.8;">تم تسجيل درجتك في النظام.</p>
            
            <button onclick="renderExams(courseSelect.value)" class="upload-btn" style="padding: 1rem 3rem;">
                العودة لقائمة الامتحانات
            </button>
        </div>
    `;

    // In a real system, we'd save this score to the student's record here.
    console.log(`Student Score: ${score}/20`);
}

// --- AI Assistant Logic ---
let ASSISTANT_CONFIG = {
    apiKey: '',
    knowledgeBase: ''
};

async function saveAssistantConfig() {
    const apiKey = document.getElementById('ai-api-key').value.trim();
    const knowledgeBase = document.getElementById('ai-knowledge-base').value.trim();

    if (!apiKey) {
        alert('يرجى إدخال مفتاح الـ API');
        return;
    }

    ASSISTANT_CONFIG.apiKey = apiKey;
    ASSISTANT_CONFIG.knowledgeBase = knowledgeBase;

    try {
        if (db) {
            await db.collection('settings').doc('assistant_config').set(ASSISTANT_CONFIG);
            alert('تم حفظ إعدادات المساعد في السحابة بنجاح.');
        } else {
            localStorage.setItem('assistantConfig', JSON.stringify(ASSISTANT_CONFIG));
            alert('تم حفظ الإعدادات محلياً.');
        }
    } catch (e) {
        console.error('Error saving assistant config:', e);
        alert('حدث خطأ أثناء حفظ الإعدادات.');
    }
}

async function loadAssistantConfig() {
    try {
        if (db) {
            const doc = await db.collection('settings').doc('assistant_config').get();
            if (doc.exists) {
                ASSISTANT_CONFIG = doc.data();
                const apiKeyEl = document.getElementById('ai-api-key');
                const kbEl = document.getElementById('ai-knowledge-base');
                if (apiKeyEl) apiKeyEl.value = ASSISTANT_CONFIG.apiKey || '';
                if (kbEl) kbEl.value = ASSISTANT_CONFIG.knowledgeBase || '';
            }
        } else {
            const saved = localStorage.getItem('assistantConfig');
            if (saved) {
                ASSISTANT_CONFIG = JSON.parse(saved);
                const apiKeyEl = document.getElementById('ai-api-key');
                const kbEl = document.getElementById('ai-knowledge-base');
                if (apiKeyEl) apiKeyEl.value = ASSISTANT_CONFIG.apiKey || '';
                if (kbEl) kbEl.value = ASSISTANT_CONFIG.knowledgeBase || '';
            }
        }
    } catch (e) {
        console.error('Error loading assistant config:', e);
    }
}

function renderSettingsView() {
    loadAssistantConfig();
}

function toggleAIAssistant() {
    const modal = document.getElementById('ai-modal');
    const btn = document.getElementById('ai-btn');
    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
        btn.style.display = 'none';
    } else {
        modal.style.display = 'none';
        btn.style.display = 'flex';
    }
}

function updateAIAssistantVisibility() {
    const btn = document.getElementById('ai-btn');
    const modal = document.getElementById('ai-modal');
    if (btn) btn.style.display = (isAuthenticated && userRole === 'student') ? 'flex' : 'none';
    if (modal && (!isAuthenticated || userRole !== 'student')) modal.style.display = 'none';
}

let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        const query = event.results[0][0].transcript;
        addAIMessage(query, 'user');
        processAIQuery(query);
    };

    recognition.onstart = () => {
        updateAIStatus('جاري الاستماع...', true);
    };

    recognition.onend = () => {
        updateAIStatus('اضغط على الميكروفون للتحدث', false);
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        updateAIStatus('حدث خطأ في التعرف على الصوت', false);
    };
}

function updateAIStatus(text, listening) {
    const statusText = document.getElementById('ai-status-text');
    const micBtn = document.getElementById('ai-mic-trigger');
    const wave = document.getElementById('mic-wave');

    if (statusText) statusText.textContent = text;
    if (micBtn) micBtn.classList.toggle('listening', listening);
    if (wave) wave.style.display = listening ? 'flex' : 'none';
}

function startVoiceInquiry() {
    if (!recognition) {
        alert('عذراً، متصفحك لا يدعم التعرف على الصوت');
        return;
    }
    recognition.start();
}

function addAIMessage(text, sender) {
    const container = document.getElementById('ai-convo-container');
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ${sender}`;
    msgDiv.textContent = text;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

async function processAIQuery(query) {
    if (!ASSISTANT_CONFIG.apiKey) {
        addAIMessage('يرجى تهيئة مفتاح الـ API في الإعدادات من قبل المدرس.', 'assistant');
        return;
    }

    updateAIStatus('جاري التفكير...', false);

    try {
        // Collect Student Context
        const studentData = Object.values(COURSE_DATA).map(course => {
            const student = course.students.find(s => s.name.trim() === currentStudentName);
            if (student) {
                return {
                    course: course.title,
                    grades: {
                        classwork: student.classwork,
                        final: student.final,
                        total: student.total
                    },
                    attendance: course.attendance.find(a => a.name.trim() === currentStudentName)?.sessions || []
                };
            }
            return null;
        }).filter(item => item !== null);

        // Collect Announcements
        const announcements = Object.values(COURSE_DATA)
            .flatMap(c => c.announcements || [])
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3);

        const context = `
            بيانات الطالب الحالية: ${JSON.stringify(studentData)}
            آخر الإعلانات: ${JSON.stringify(announcements)}
            صندوق المعرفة للمدرس: ${ASSISTANT_CONFIG.knowledgeBase}
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${ASSISTANT_CONFIG.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `أنت مساعد تعليمي ذكي لموقع الأستاذ. أجب بذكاء وبناءً على السياق التالي فقط. 
                        صغ الإجابة بأسلوب ودي وبليغ وباللغة العربية. لا تذكر أنك ذكاء اصطناعي إلا إذا سُئلت.
                        لا تقم بتعديل أي بيانات. إذا لم تجد الإجابة في السياق، اعتذر بلباقة.
                        
                        السياق: ${context}
                        
                        سؤال الطالب: ${query}`
                    }]
                }]
            })
        });

        const result = await response.json();
        const aiText = result.candidates[0].content.parts[0].text;

        addAIMessage(aiText, 'assistant');
        speakResponse(aiText);
    } catch (e) {
        console.error('AI Processing error:', e);
        addAIMessage('عذراً، حدث خطأ أثناء الاتصال بالمساعد الذكي.', 'assistant');
    } finally {
        updateAIStatus('اضغط على الميكروفون للتحدث', false);
    }
}

function speakResponse(text) {
    if ('speechSynthesis' in window) {
        const synth = window.speechSynthesis;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'ar-SA';
        const voices = synth.getVoices();
        const arVoice = voices.find(v => v.lang.includes('ar'));
        if (arVoice) utter.voice = arVoice;
        synth.speak(utter);
    }
}

init();
