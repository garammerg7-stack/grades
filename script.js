// Mock Data mimicking Excel files
const COURSE_DATA = {
    "arch": {
        title: "معمارية حاسوب",
        students: [
            { id: 1, studentId: "1001", name: "أحمد محمد علي", classwork: 35, final: 45, total: 80 },
            { id: 2, studentId: "1002", name: "سارة خالد عمر", classwork: 38, final: 50, total: 88 },
            { id: 3, studentId: "1003", name: "عمر يوسف حسن", classwork: 25, final: 30, total: 55 },
            { id: 4, studentId: "1004", name: "ليلى محمود يحيى", classwork: 39, final: 55, total: 94 },
            { id: 5, studentId: "1005", name: "خالد عبدالله سعيد", classwork: 32, final: 40, total: 72 },
            { id: 6, studentId: "1006", name: "ريم أحمد كمال", classwork: 40, final: 58, total: 98 },
            { id: 7, studentId: "1007", name: "محمد إبراهيم عادل", classwork: 28, final: 35, total: 63 },
            { id: 8, studentId: "1008", name: "نور علي حسين", classwork: 36, final: 48, total: 84 },
            { id: 9, studentId: "1009", name: "ياسر فهد سالم", classwork: 25, final: 30, total: 55 },
            { id: 10, studentId: "1010", name: "منى سعيد جابر", classwork: 37, final: 52, total: 89 },
        ]
    },
    "fund": {
        title: "أساسيات حاسوب",
        students: [
            { id: 1, studentId: "2001", name: "أحمد محمد علي", classwork: 40, final: 55, total: 95 },
            { id: 2, studentId: "2002", name: "سارة خالد عمر", classwork: 39, final: 53, total: 92 },
            { id: 3, studentId: "2003", name: "عمر يوسف حسن", classwork: 30, final: 40, total: 70 },
            { id: 4, studentId: "2004", name: "ليلى محمود يحيى", classwork: 38, final: 50, total: 88 },
            { id: 5, studentId: "2005", name: "خالد عبدالله سعيد", classwork: 35, final: 45, total: 80 },
            { id: 6, studentId: "2006", name: "ريم أحمد كمال", classwork: 39, final: 54, total: 93 },
            { id: 7, studentId: "2007", name: "محمد إبراهيم عادل", classwork: 32, final: 38, total: 70 },
        ]
    },
    "comm": {
        title: "مبادئ اتصالات",
        students: [
            { id: 1, studentId: "3001", name: "أحمد محمد علي", classwork: 28, final: 32, total: 60 },
            { id: 2, studentId: "3002", name: "سارة خالد عمر", classwork: 32, final: 40, total: 72 },
            { id: 3, studentId: "3003", name: "عمر يوسف حسن", classwork: 18, final: 24, total: 42 },
            { id: 4, studentId: "3004", name: "ليلى محمود يحيى", classwork: 35, final: 48, total: 83 },
            { id: 5, studentId: "3005", name: "خالد عبدالله سعيد", classwork: 30, final: 35, total: 65 },
            { id: 6, studentId: "3006", name: "ريم أحمد كمال", classwork: 36, final: 50, total: 86 },
        ]
    },
    "digit": {
        title: "إلكترونيات رقمية",
        students: [
            { id: 1, studentId: "4001", name: "أحمد محمد علي", classwork: 34, final: 46, total: 80 },
            { id: 2, studentId: "4002", name: "سارة خالد عمر", classwork: 36, final: 48, total: 84 },
            { id: 3, studentId: "4003", name: "عمر يوسف حسن", classwork: 29, final: 35, total: 64 },
            { id: 4, studentId: "4004", name: "ليلى محمود يحيى", classwork: 38, final: 52, total: 90 },
            { id: 5, studentId: "4005", name: "خالد عبدالله سعيد", classwork: 31, final: 39, total: 70 },
            { id: 6, studentId: "4006", name: "ريم أحمد كمال", classwork: 39, final: 55, total: 94 },
            { id: 7, studentId: "4007", name: "محمد إبراهيم عادل", classwork: 20, final: 30, total: 50 },
            { id: 8, studentId: "4008", name: "نور علي حسين", classwork: 33, final: 42, total: 75 },
        ]
    }
};

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
const uploadContainer = document.querySelector('.upload-btn').parentElement;
const tabBtns = document.querySelectorAll('.tab-btn');
const usernameLabel = document.getElementById('username-label');
const passwordGroup = document.getElementById('password-group');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');
const loginCourseGroup = document.getElementById('login-course-group');
const loginCourseSelect = document.getElementById('login-course');

let isAuthenticated = false;
let userRole = 'teacher';
let currentStudentId = ''; // Track by ID now

function init() {
    loadData();
    loginForm.addEventListener('submit', handleLogin);
    courseSelect.addEventListener('change', (e) => renderTable(e.target.value));
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('excel-upload').addEventListener('change', handleFileUpload);

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchRole(btn.dataset.role));
    });
}

function loadData() {
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
        usernameInput.type = 'text'; // Changed to text to allow easy pasting
        usernameInput.inputMode = 'numeric'; // Show number pad on mobile
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

function handleFileUpload(e) {
    if (userRole === 'student') return;

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
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

        // Initialize with Defaults (Col 0=ID, 1=Name, 2=CW, 3=Fin, 4=Tot)
        let idxId = 0;
        let idxName = 1;
        let idxClass = 2;
        let idxFinal = 3;
        let idxTotal = 4;
        let headersFound = false;

        // Fuzzy Header Search
        headers.forEach((h, i) => {
            if (typeof h !== 'string') return;
            const txt = h.trim().toLowerCase();

            if (txt.includes('رقم') || txt.includes('id') || txt.includes('student id')) { idxId = i; headersFound = true; }
            else if (txt.includes('اسم') || txt.includes('name')) { idxName = i; headersFound = true; }
            else if (txt.includes('اعمال') || txt.includes('أعمال') || txt.includes('class')) { idxClass = i; headersFound = true; }
            else if (txt.includes('نهائي') || txt.includes('final')) { idxFinal = i; headersFound = true; }
            else if (txt.includes('مجموع') || txt.includes('total')) { idxTotal = i; headersFound = true; }
        });

        const newStudents = [];

        // Start from row 1 (skip header)
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            // Get values using detected indices
            const rawId = row[idxId];
            const rawName = row[idxName];

            if (!rawId) continue; // ID is mandatory

            let classwork = row[idxClass];
            let final = row[idxFinal];

            // Clean numbers
            if (classwork === undefined || classwork === null || classwork === '') classwork = 0;
            if (final === undefined || final === null || final === '') final = 0;

            const computedTotal = (parseFloat(classwork) || 0) + (parseFloat(final) || 0);

            // Use Excel total if exists, otherwise computed
            // Note: If fuzzy search failed and we defaulted, idxTotal is 4. Checks if row[4] exists.
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
            saveToLocalStorage();
            renderTable(currentCourseKey);
            alert(`تم رفع الدرجات بنجاح! (${newStudents.length} طالب)\nتم التعرف على الأعمدة تلقائياً.`);
        } else {
            alert('لم يتم العثور على بيانات صالحة. تأكد من وجود صف عناوين (رقم الطالب، الاسم، اعمال السنة...).');
        }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

function handleLogin(e) {
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
        // Student Login by ID
        if (inputVal.length < 1) {
            showError('الرجاء إدخال رقم صحيح');
            return;
        }

        const selectedCourseKey = loginCourseSelect.value;
        const selectedCourse = COURSE_DATA[selectedCourseKey];

        // Search by studentId
        const student = selectedCourse.students.find(s => String(s.studentId) === inputVal);

        if (student) {
            isAuthenticated = true;
            currentStudentId = String(student.studentId); // Store ID
            currentUserSpan.textContent = student.name; // Display Name (not ID)
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
        if (uploadContainer) uploadContainer.style.display = 'none';
    } else {
        if (uploadContainer) uploadContainer.style.display = 'flex';
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
        // Filter by ID
        studentsToRender = course.students.filter(s => String(s.studentId) === currentStudentId);
    }

    if (studentsToRender.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">لا توجد بيانات</td></tr>';
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

        // NOTE: We do NOT display student.studentId here, as requested.
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
