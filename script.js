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

let isAuthenticated = false;
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
    document.getElementById('excel-upload').addEventListener('change', handleFileUpload);

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
        loginSubtitle.textContent = 'سجل دخولك كـ مدرس للمتابعة';
        loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول';
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
    } else {
        uploadContainer.style.display = 'flex';
        currentUserSpan.nextElementSibling.textContent = 'مدرس المادة';
    }

    renderTable(courseSelect.value);
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

        // Add Reset Password button for Teacher
        const nameCellContent = userRole === 'teacher'
            ? `<div style="display:flex; align-items:center; gap:8px;">
                <span title="تصفير كلمة سر الطالب" onclick="resetStudentPassword('${student.name.trim()}')" style="cursor:pointer; font-size: 0.8rem; color: var(--text-secondary); opacity: 0.6;"><i class="fa-solid fa-lock-open"></i></span>
                ${student.name}
               </div>`
            : student.name;

        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--text-primary);">${nameCellContent}</td>
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
