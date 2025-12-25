// Mock Data mimicking Excel files (Initial load only if Firestore is empty)
let COURSE_DATA = {
    "arch": { title: "معمارية حاسوب", students: [], attendance: [], hidden: false },
    "fund": { title: "أساسيات حاسوب", students: [], attendance: [], hidden: false },
    "comm": { title: "مبادئ اتصالات", students: [], attendance: [], hidden: false },
    "digit": { title: "إلكترونيات رقمية", students: [], attendance: [], hidden: false }
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
const uploadContainer = document.getElementById('teacher-actions');
const tabBtns = document.querySelectorAll('.tab-btn');
const usernameLabel = document.getElementById('username-label');
const passwordGroup = document.getElementById('password-group');
const passwordLabel = document.getElementById('password-label');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');
const loginCourseGroup = document.getElementById('login-course-group');
const loginCourseSelect = document.getElementById('login-course');
const resetBulkBtn = document.getElementById('reset-bulk-btn');
const thControls = document.getElementById('th-controls');
const viewBtns = document.querySelectorAll('.view-btn');
const gradesContainer = document.getElementById('grades-container');
const attendanceContainer = document.getElementById('attendance-container');
const attendanceHead = document.getElementById('attendance-head');
const attendanceBody = document.getElementById('attendance-body');

let isAuthenticated = false;
let currentView = 'grades'; // 'grades' or 'attendance'
let userRole = 'teacher';
let currentStudentName = ''; // Changed from currentStudentId to Name

// Initialize
async function init() {
    const isFirebaseActive = initFirebase();

    if (isFirebaseActive) {
        // Essential: First fetch data once, but also listen for auth state
        await fetchFromFirestore();

        auth.onAuthStateChanged(user => {
            if (user && userRole === 'teacher') {
                // Persistent logged-in state for teacher
                isAuthenticated = true;
                currentUserSpan.textContent = user.email.split('@')[0];
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
    courseSelect.addEventListener('change', (e) => renderTable(e.target.value));

    // Update student names when course changes in login screen
    loginCourseSelect.addEventListener('change', populateStudentNames);

    // Privacy-focused predictive search: Only show names AFTER 3 characters
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

    // Sync UI with initial role
    switchRole(userRole);
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
            if (COURSE_DATA[courseKey]) {
                const data = doc.data();
                COURSE_DATA[courseKey].students = data.students || [];
                COURSE_DATA[courseKey].attendance = data.attendance || [];
            }
        });
        console.log('Cloud data loaded successfully.');
    } catch (e) {
        console.error('Error fetching from Firestore:', e);
    }
}

async function saveToFirestore(courseKey) {
    if (!db) return;
    try {
        await db.collection('grades').doc(courseKey).set({
            students: COURSE_DATA[courseKey].students,
            attendance: COURSE_DATA[courseKey].attendance || []
        });
        console.log('Data saved to cloud.');
    } catch (e) {
        console.error('Error saving to Firestore:', e);
        alert('حدث خطأ أثناء الحفظ السحابي');
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
    if (!course || !course.students.length) return;

    if (confirm(`⚠️ تحذير: هل أنت متأكد من تصفير كلمات السر لجميع طلاب مقرر (${course.title})؟\nهذا الإجراء لا يمكن التراجع عنه.`)) {
        resetBulkBtn.disabled = true;
        const originalText = resetBulkBtn.innerHTML;
        resetBulkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التصفير...';

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
            resetBulkBtn.disabled = false;
            resetBulkBtn.innerHTML = originalText;
        }
    }
}

function loadDataFromLocalStorage() {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
        try {
            const parsed = JSON.parse(storedData);
            Object.keys(parsed).forEach(key => {
                if (COURSE_DATA[key]) {
                    COURSE_DATA[key].students = parsed[key].students;
                }
            });
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
    const courseKey = loginCourseSelect.value;
    const course = COURSE_DATA[courseKey];

    // Clear list if query is too short
    if (query.length < 3) {
        studentNamesDatalist.innerHTML = '';
        return;
    }

    if (!course) return;

    // Filter names that contain the query
    const matches = course.students.filter(s =>
        s.name.trim().includes(query)
    );

    // Update datalist with ONLY matched names
    studentNamesDatalist.innerHTML = '';
    matches.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name.trim();
        studentNamesDatalist.appendChild(opt);
    });
}

async function checkStudentStatus() {
    const name = studentNameInput.value.trim();
    if (!name || name.length < 3) return;

    // Only check if it's a valid student in the list
    const courseKey = loginCourseSelect.value;
    const course = COURSE_DATA[courseKey];
    if (!course) return;

    const studentExists = course.students.some(s => s.name.trim() === name);
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

    if (role === 'student') {
        usernameGroup.style.display = 'none';
        studentNameGroup.style.display = 'block';
        loginCourseGroup.style.display = 'block';
        passwordGroup.style.display = 'block';
        passwordLabel.textContent = 'كلمة المرور';
        passwordInput.placeholder = 'أدخل كلمة السر (أو اختر واحدة جديدة)';
        loginSubtitle.textContent = 'اختر اسمك الثلاثي وكلمة السر للاطلاع على النتيجة';
        populateStudentNames();
    } else {
        usernameGroup.style.display = 'block';
        studentNameGroup.style.display = 'none';
        usernameLabel.textContent = 'البريد الإلكتروني';
        usernameInput.placeholder = 'example@mail.com';
        usernameInput.type = 'email';
        loginCourseGroup.style.display = 'none';
        passwordGroup.style.display = 'block';
        passwordLabel.textContent = 'كلمة المرور';
        passwordInput.placeholder = '••••••••';
        const tabBtn = document.querySelector(`.tab-btn[data-role="${role}"]`);

        // Update Role Badges
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (tabBtn) tabBtn.classList.add('active');

        // Security: Hide Settings for Students
        const settingsBtn = document.getElementById('nav-settings-btn');
        const roleBadge = document.getElementById('user-role-badge');

        if (role === 'teacher') {
            loginForm.style.display = 'block';
            usernameInput.parentElement.style.display = 'block';
            studentNameInput.parentElement.style.display = 'none';

            loginCourseSelect.parentElement.style.display = 'none';
            loginTitle.innerHTML = 'مرحبًا بكم<br>نظام الاستعلام عن درجات الطالب';
            loginSubtitle.textContent = 'سجل دخولك كـ مدرس للمتابعة';

            if (settingsBtn) settingsBtn.style.display = 'flex';
            if (roleBadge) { roleBadge.textContent = 'Admin'; roleBadge.className = 'badge-admin'; }

        } else {
            loginForm.style.display = 'block';
            usernameInput.parentElement.style.display = 'none';
            studentNameInput.parentElement.style.display = 'block';

            loginCourseSelect.parentElement.style.display = 'block';
            populateCourseDropdown(); // Ensure student sees only public courses

            loginTitle.innerHTML = 'بوابة الطالب<br>الاستعلام عن النتائج';
            loginSubtitle.textContent = 'اختر المقرر واسمك للدخول';

            if (settingsBtn) settingsBtn.style.display = 'none';
            if (roleBadge) { roleBadge.textContent = 'Student'; roleBadge.className = 'badge-student'; }
        }
    }
}

// --- Navigation & Role Management ---

function switchTab(tabId) {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        if (btn.dataset.tab === tabId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Hide all containers first
    document.getElementById('grades-container').style.display = 'none';
    document.getElementById('attendance-container').style.display = 'none';

    // Show active
    if (tabId === 'grades') {
        document.getElementById('grades-container').style.display = 'block';
        currentView = 'grades';
        renderTable(courseSelect.value);
    } else if (tabId === 'attendance') {
        document.getElementById('attendance-container').style.display = 'block';
        currentView = 'attendance';
        renderAttendanceTable(courseSelect.value);
    } else if (tabId === 'settings') {
        // Settings/Admin view
        // Maybe show a simple "Select Action" placeholder or keep last view?
        // For now, let's keep Grades visible but show Admin Tools in Action Bar
        document.getElementById('grades-container').style.display = 'block';
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
            <button class="upload-btn" onclick="printReport('grades')">
                <i class="fa-solid fa-print"></i> طباعة
            </button>
        `;
    } else if (tabId === 'attendance') {
        bar.innerHTML = `
            <label for="attendance-upload" class="upload-btn" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                <i class="fa-solid fa-calendar-days"></i> رفع حضور
            </label>
            <button class="upload-btn" onclick="printReport('attendance')">
                <i class="fa-solid fa-print"></i> طباعة
            </button>
        `;
    } else if (tabId === 'settings') {
        bar.innerHTML = `
            <button id="manage-courses-btn" class="upload-btn" onclick="openCourseModal()" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3);">
                <i class="fa-solid fa-layer-group"></i> إدارة المقررات
            </button>
            <button id="reset-bulk-btn" class="upload-btn" onclick="resetAllCoursePasswords()" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">
                <i class="fa-solid fa-user-lock"></i> تصفير كلمات الست
            </button>
            <button class="upload-btn" onclick="printReport('combined')">
                <i class="fa-solid fa-file-pdf"></i> تقرير شامل
            </button>
        `;
    }
}

async function processExcelFile(e, type) {
    if (userRole === 'student') return;

    const file = e.target.files[0];
    if (!file) return;

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
        else saveDataToLocalStorage();

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
            const selectedCourseKey = loginCourseSelect.value;
            if (db) await fetchFromFirestore();
            const selectedCourse = COURSE_DATA[selectedCourseKey];

            const student = selectedCourse.students.find(s => s.name.trim() === inputVal);
            if (!student) {
                showError(`عذراً، لم يتم العثور على اسمك في سجلات هذا المقرر`);
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

            isAuthenticated = true;
            currentStudentName = inputVal;
            currentUserSpan.textContent = student.name;
            currentUserSpan.nextElementSibling.textContent = 'طالب';
            courseSelect.value = selectedCourseKey;
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
    errorMsg.style.display = 'none';

    if (userRole === 'student') {
        uploadContainer.style.display = 'none';
        thControls.style.display = 'none';
    } else {
        uploadContainer.style.display = 'flex';
        thControls.style.display = 'table-cell';
        currentUserSpan.nextElementSibling.textContent = 'مدرس المادة';
    }

    if (currentView === 'grades') renderTable(courseSelect.value);
    else renderAttendanceTable(courseSelect.value);
}

async function handleLogout() {
    if (userRole === 'teacher' && auth) {
        await auth.signOut();
    }

    isAuthenticated = false;
    currentStudentName = '';
    switchRole('teacher');

    dashboardSection.style.display = 'none';
    loginSection.style.display = 'block';
    tableBody.innerHTML = '';
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
            // Calculate stats for sharing
            const present = row.sessions.filter(s => s === '1').length;
            const absent = row.sessions.filter(s => s === '0').length;
            const excused = row.sessions.filter(s => s === 'م').length;

            cells += `
                <td style="text-align:center;">
                    <button onclick="shareAttendance('${row.name.trim()}', ${present}, ${absent}, ${excused})" class="btn-reset-small" style="color: var(--success); border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.1);" title="مشاركة الحضور واتساب">
                        <i class="fa-brands fa-whatsapp"></i>
                    </button>
                </td>`;
        }

        tr.innerHTML = cells;
        attendanceBody.appendChild(tr);
    });
}

function shareGrade(name, cw, final, total) {
    const text = `*نتائج الطالب:* ${name}%0a*أعمال الفصل:* ${cw}%0a*النهائي:* ${final}%0a*المجموع:* ${total}`;
    const url = `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
}

function shareAttendance(name, present, absent, excused) {
    const text = `*تقرير حضور الطالب:* ${name}%0a*حاضر:* ${present}%0a*غائب:* ${absent}%0a*معذور:* ${excused}`;
    const url = `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
}

function shareAttendance(name, present, absent, excused) {
    const text = `*تقرير حضور الطالب:* ${name}%0a*حاضر:* ${present}%0a*غائب:* ${absent}%0a*معذور:* ${excused}`;
    const url = `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
}

// --- Dynamic Course Management ---
function populateCourseDropdown() {
    courseSelect.innerHTML = '';
    loginCourseSelect.innerHTML = '';

    for (const [key, data] of Object.entries(COURSE_DATA)) {
        // Show all to teacher in modal, but filter in dropdowns if hidden?
        // Actually for simplicity: Teacher sees ALL in their dropdown to manage them.
        // Student sees ONLY non-hidden.
        if (data.hidden) continue;

        const option = document.createElement('option');
        option.value = key;
        option.textContent = data.title;
        courseSelect.appendChild(option);

        const loginOption = option.cloneNode(true);
        loginCourseSelect.appendChild(loginOption);
    }
    // If teacher, append hidden courses to teacher dropdown specially? 
    // Or simpler: Open "Manage" to unhide first.
    // Let's stick to: Hidden = invisible in dropdowns. Use Modal to unhide.
}

function openCourseModal() {
    const modal = document.getElementById('course-modal');
    const list = document.getElementById('course-list');
    list.innerHTML = '';

    for (const [key, data] of Object.entries(COURSE_DATA)) {
        const item = document.createElement('div');
        item.className = 'course-item';
        item.innerHTML = `
            <span style="color: var(--text-primary); ${data.hidden ? 'opacity: 0.5; text-decoration: line-through;' : ''}">${data.title}</span>
            <button class="course-toggle-btn" onclick="toggleCourseVisibility('${key}')" title="${data.hidden ? 'إظهار' : 'إخفاء'}">
                ${data.hidden ? '👁️‍🗨️' : '👁️'}
            </button>
        `;
        list.appendChild(item);
    }
    modal.style.display = 'flex';
}

function toggleCourseVisibility(key) {
    if (COURSE_DATA[key]) {
        COURSE_DATA[key].hidden = !COURSE_DATA[key].hidden;
        if (db) saveToFirestore(key);
        populateCourseDropdown();
        openCourseModal();
    }
}

function addNewCourse() {
    const nameInput = document.getElementById('new-course-name');
    const name = nameInput.value.trim();
    if (!name) return;

    const key = 'course_' + Date.now();
    COURSE_DATA[key] = {
        title: name,
        students: [],
        attendance: [],
        hidden: false
    };

    if (db) saveToFirestore(key);

    populateCourseDropdown();
    nameInput.value = '';
    openCourseModal();
    alert('تم إضافة المقرر بنجاح');
}

// --- Printing System ---
function printReport(type) {
    // 1. Prepare View
    const originalView = currentView;
    const gContainer = document.getElementById('grades-container');
    const aContainer = document.getElementById('attendance-container');

    // Hide controls for print
    document.body.classList.add('printing-mode');

    if (type === 'grades') {
        gContainer.style.display = 'block';
        aContainer.style.display = 'none';
        renderTable(courseSelect.value); // Ensure fresh render
    } else if (type === 'attendance') {
        gContainer.style.display = 'none';
        aContainer.style.display = 'block';
        renderAttendanceTable(courseSelect.value);
    } else if (type === 'combined') {
        gContainer.style.display = 'block';
        aContainer.style.display = 'block';
        renderTable(courseSelect.value);
        renderAttendanceTable(courseSelect.value);
    }

    // 2. Print
    setTimeout(() => {
        window.print();

        // 3. Cleanup
        document.body.classList.remove('printing-mode');
        switchView(originalView); // Restore state
    }, 500);
}

// Call init/population at start
populateCourseDropdown();
// --- Dynamic Course Management ---
function populateCourseDropdown() {
    courseSelect.innerHTML = '';
    loginCourseSelect.innerHTML = '';

    for (const [key, data] of Object.entries(COURSE_DATA)) {
        if (data.hidden) continue;

        const option = document.createElement('option');
        option.value = key;
        option.textContent = data.title;
        courseSelect.appendChild(option);

        const loginOption = option.cloneNode(true);
        loginCourseSelect.appendChild(loginOption);
    }
}

function openCourseModal() {
    const modal = document.getElementById('course-modal');
    // Re-render list on open
    const list = document.getElementById('course-list');
    list.innerHTML = '';

    for (const [key, data] of Object.entries(COURSE_DATA)) {
        const item = document.createElement('div');
        item.className = 'course-item';
        item.innerHTML = `
            <span style="color: var(--text-primary); ${data.hidden ? 'opacity: 0.5; text-decoration: line-through;' : ''}">${data.title}</span>
            <button class="course-toggle-btn" onclick="toggleCourseVisibility('${key}')" title="${data.hidden ? 'إظهار' : 'إخفاء'}">
                ${data.hidden ? '👁️‍🗨️' : '👁️'}
            </button>
        `;
        list.appendChild(item);
    }

    modal.style.display = 'flex';
}

function toggleCourseVisibility(key) {
    if (COURSE_DATA[key]) {
        COURSE_DATA[key].hidden = !COURSE_DATA[key].hidden;
        if (db) saveToFirestore(key);
        populateCourseDropdown();
        openCourseModal(); // Refresh list
    }
}

function addNewCourse() {
    const nameInput = document.getElementById('new-course-name');
    const name = nameInput.value.trim();
    if (!name) return;

    const key = 'course_' + Date.now();
    COURSE_DATA[key] = {
        title: name,
        students: [],
        attendance: [],
        hidden: false
    };

    if (db) saveToFirestore(key);

    populateCourseDropdown();
    nameInput.value = '';
    openCourseModal();
    alert('تم إضافة المقرر بنجاح');
}

// --- Printing System ---
function printReport(type) {
    const originalView = currentView;
    const gContainer = document.getElementById('grades-container');
    const aContainer = document.getElementById('attendance-container');

    document.body.classList.add('printing-mode');

    // Force show relevant containers
    if (type === 'grades') {
        gContainer.style.display = 'block';
        aContainer.style.display = 'none';
        renderTable(courseSelect.value);
    } else if (type === 'attendance') {
        gContainer.style.display = 'none';
        aContainer.style.display = 'block';
        renderAttendanceTable(courseSelect.value);
    } else if (type === 'combined') {
        gContainer.style.display = 'block';
        aContainer.style.display = 'block';
        renderTable(courseSelect.value);
        renderAttendanceTable(courseSelect.value); // Render both
    }

    setTimeout(() => {
        window.print();

        // Restore
        document.body.classList.remove('printing-mode');
        // Restore view state
        document.body.classList.remove('printing-mode');
        // Restore view state (mapped to tab)
        // Original view was likely 'grades' or 'attendance'. 
        // switchTab handles display logic.
        switchTab(originalView);
    }, 500);
}

// Call init/population at start
populateCourseDropdown();
init();
