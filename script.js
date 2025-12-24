// Mock Data mimicking Excel files (Initial load only if Firestore is empty)
let COURSE_DATA = {
    "arch": { title: "معمارية حاسوب", students: [] },
    "fund": { title: "أساسيات حاسوب", students: [] },
    "comm": { title: "مبادئ اتصالات", students: [] },
    "digit": { title: "إلكترونيات رقمية", students: [] }
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
function initFirebase() {
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("Firebase not configured. Using LocalStorage fallback.");
        return false;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    return true;
}

const STORAGE_KEY = 'teacherPortalData';

// DOM Elements
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMsg = document.getElementById('error-msg');
const courseSelect = document.getElementById('course-select');
const tableBody = document.getElementById('grades-body');
const currentUserSpan = document.getElementById('current-user');
const uploadContainer = document.getElementById('teacher-actions');
const tabBtns = document.querySelectorAll('.tab-btn');
const usernameLabel = document.getElementById('username-label');
const passwordGroup = document.getElementById('password-group');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');
const loginCourseGroup = document.getElementById('login-course-group');
const loginCourseSelect = document.getElementById('login-course');

let isAuthenticated = false;
let userRole = 'teacher';
let currentStudentId = '';

// Initialize
async function init() {
    const isFirebaseActive = initFirebase();

    if (isFirebaseActive) {
        await fetchFromFirestore();
    } else {
        loadDataFromLocalStorage();
    }

    loginForm.addEventListener('submit', handleLogin);
    courseSelect.addEventListener('change', (e) => renderTable(e.target.value));
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('excel-upload').addEventListener('change', handleFileUpload);

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchRole(btn.dataset.role));
    });
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
                COURSE_DATA[courseKey].students = doc.data().students || [];
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
            students: COURSE_DATA[courseKey].students
        });
        console.log('Data saved to cloud.');
    } catch (e) {
        console.error('Error saving to Firestore:', e);
        alert('حدث خطأ أثناء الحفظ السحابي');
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

function switchRole(role) {
    userRole = role;
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.role === role));

    errorMsg.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';

    if (role === 'student') {
        usernameLabel.textContent = 'رقم الطالب';
        usernameInput.placeholder = 'مثال: 1001';
        usernameInput.type = 'text';
        usernameInput.inputMode = 'numeric';
        passwordGroup.style.display = 'none';
        loginCourseGroup.style.display = 'block';
        passwordInput.removeAttribute('required');
        loginSubtitle.textContent = 'أختر المقرر وأدخل رقمك (ID) للاطلاع على النتيجة';
    } else {
        usernameLabel.textContent = 'اسم المستخدم';
        usernameInput.placeholder = 'مثال: Ayad';
        usernameInput.type = 'text';
        passwordGroup.style.display = 'block';
        loginCourseGroup.style.display = 'none';
        passwordInput.setAttribute('required', 'true');
        loginSubtitle.textContent = 'سجل دخولك كـ مدرس للمتابعة';
    }
}

async function handleFileUpload(e) {
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

        let idxId = 0;
        let idxName = 1;
        let idxClass = 2;
        let idxFinal = 3;
        let idxTotal = 4;

        headers.forEach((h, i) => {
            if (typeof h !== 'string') return;
            const txt = h.trim().toLowerCase();

            if (txt.includes('رقم') || txt.includes('id') || txt.includes('student id')) { idxId = i; }
            else if (txt.includes('اسم') || txt.includes('name')) { idxName = i; }
            else if (txt.includes('اعمال') || txt.includes('أعمال') || txt.includes('class')) { idxClass = i; }
            else if (txt.includes('نهائي') || txt.includes('final')) { idxFinal = i; }
            else if (txt.includes('مجموع') || txt.includes('total')) { idxTotal = i; }
        });

        const newStudents = [];

        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            const rawId = row[idxId];
            const rawName = row[idxName];

            if (!rawId) continue;

            let classwork = row[idxClass];
            let final = row[idxFinal];

            if (classwork === undefined || classwork === null || classwork === '') classwork = 0;
            if (final === undefined || final === null || final === '') final = 0;

            const computedTotal = (parseFloat(classwork) || 0) + (parseFloat(final) || 0);

            let total = row[idxTotal];
            if (total === undefined || total === null || total === '') total = computedTotal;

            newStudents.push({
                id: i,
                studentId: String(rawId).trim(),
                name: rawName ? String(rawName).trim() : "غير معروف",
                classwork: classwork,
                final: final,
                total: total
            });
        }

        if (newStudents.length > 0) {
            const currentCourseKey = courseSelect.value;
            COURSE_DATA[currentCourseKey].students = newStudents;

            if (db) {
                await saveToFirestore(currentCourseKey);
            } else {
                saveToLocalStorage();
            }

            renderTable(currentCourseKey);
            alert(`تم رفع الدرجات بنجاح! (${newStudents.length} طالب)`);
        } else {
            alert('لم يتم العثور على بيانات صالحة. تأكد من وجود صف عناوين.');
        }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

async function handleLogin(e) {
    e.preventDefault();
    const inputVal = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (userRole === 'teacher') {
        if (inputVal === 'Ayad' && password === 'Snagra6@') {
            isAuthenticated = true;
            currentUserSpan.textContent = inputVal;
            showDashboard();
        } else {
            showError('اسم المستخدم أو كلمة المرور غير صحيحة');
        }
    } else {
        if (inputVal.length < 1) {
            showError('الرجاء إدخال رقم صحيح');
            return;
        }

        const selectedCourseKey = loginCourseSelect.value;

        // Refresh from cloud before searching if cloud is active
        if (db) {
            await fetchFromFirestore();
        }

        const selectedCourse = COURSE_DATA[selectedCourseKey];
        const student = selectedCourse.students.find(s => String(s.studentId) === inputVal);

        if (student) {
            isAuthenticated = true;
            currentStudentId = String(student.studentId);
            currentUserSpan.textContent = student.name;
            currentUserSpan.nextElementSibling.textContent = 'طالب';

            courseSelect.value = selectedCourseKey;
            showDashboard();
        } else {
            showError(`عذراً، لم يتم العثور على طالب برقم "${inputVal}" في مقرر ${selectedCourse.title}`);
        }
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
    } else {
        uploadContainer.style.display = 'flex';
        currentUserSpan.nextElementSibling.textContent = 'مدرس المادة';
    }

    renderTable(courseSelect.value);
}

function handleLogout() {
    isAuthenticated = false;
    currentStudentId = '';
    switchRole('teacher');

    dashboardSection.style.display = 'none';
    loginSection.style.display = 'block';
    tableBody.innerHTML = '';
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
    errorMsg.parentElement.classList.add('shake');
    setTimeout(() => errorMsg.parentElement.classList.remove('shake'), 500);
}

function renderTable(courseKey) {
    const course = COURSE_DATA[courseKey];
    if (!course) return;

    tableBody.innerHTML = '';

    let studentsToRender = course.students;
    if (userRole === 'student') {
        studentsToRender = course.students.filter(s => String(s.studentId) === currentStudentId);
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

        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--text-primary);">${student.name}</td>
            <td style="color: var(--text-primary);">${cw}</td>
            <td style="color: var(--text-primary);">${fin}</td>
            <td>
                <span class="grade-badge ${gradeClass}">${student.total}</span>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

init();
