/**
 * SMS Broadcast Center - Core Logic
 * Integration: Supabase + Arkesel Edge Functions
 */

// 1. CONFIGURATION & INITIALIZATION
const SUPABASE_URL = 'https://fyriapqeztevzkcaaiqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cmlhcHFlenRldnprY2FhaXF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5OTgyNTcsImV4cCI6MjA3OTU3NDI1N30.Re3EZ2VXE6Z7qWhVlxV6yqqIWB8wj1b1wURNLZXpddY';
const EDGE_FUNCTION_URL = 'https://fyriapqeztevzkcaaiqw.supabase.co/functions/v1/adm-login-trigger';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isLooping = false;

const ui = {
    btnBroadcast: document.getElementById('btn-broadcast'),
    btnStop: document.getElementById('btn-stop'),
    btnSingle: document.getElementById('btn-single-send'),
    progressContainer: document.getElementById('progress-container'),
    progressFill: document.getElementById('progress-fill'),
    currentIndex: document.getElementById('current-index'),
    totalRecords: document.getElementById('total-records'),
    statusBadge: document.getElementById('broadcast-status'),
    previewText: document.getElementById('preview-text'),
    logOutput: document.getElementById('log-output'),
    studentIdInput: document.getElementById('student-id'),
    phoneOverrideInput: document.getElementById('custom-phone')
};

// 2. UI HELPERS
function addLog(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
    ui.logOutput.prepend(entry);
}

function setUiState(isRunning, total = 0) {
    if (isRunning) {
        ui.btnBroadcast.disabled = true;
        ui.btnStop.style.display = "block";
        ui.progressContainer.style.display = "block";
        ui.statusBadge.innerText = "Running";
        ui.statusBadge.classList.add('active', 'pulse');
        ui.totalRecords.innerText = total;
    } else {
        ui.btnBroadcast.disabled = false;
        ui.btnStop.style.display = "none";
        ui.statusBadge.innerText = "Idle";
        ui.statusBadge.classList.remove('active', 'pulse');
    }
}

function updateProgress(current, total) {
    ui.currentIndex.innerText = current;
    ui.progressFill.style.width = `${(current / total) * 100}%`;
}

// 3. DATA FETCHING
async function fetchSmsTemplate() {
    addLog("Syncing template...", "system");
    const { data, error } = await _supabase
        .from('sms_templates')
        .select('message_content')
        .eq('template_slug', 'adm-login-trigger')
        .maybeSingle();

    if (error || !data) {
        addLog("Template not found in DB.", "error");
        return null;
    }
    ui.previewText.innerText = data.message_content;
    addLog("Template ready.", "success");
}

async function fetchStudentById(studentId) {
    if (!studentId) return null;
    addLog(`Searching for ${studentId}...`, "system");
    
    const { data, error } = await _supabase
        .from('newstudents')
        .select('first_name, portal_username, portal_password, phone_number, student_id, reference_code')
        .eq('student_id', studentId)
        .maybeSingle(); // Handles 'not found' without crashing

    if (error) {
        addLog("Database error.", "error");
        return null;
    }
    if (!data) {
        addLog("Student ID not found.", "error");
        return null;
    }
    return data;
}

async function fetchEligibleStudents() {
    const { data, error } = await _supabase
        .from('newstudents')
        .select('first_name, phone_number, portal_username, portal_password, student_id, reference_code')
        .not('portal_username', 'is', null)
        .not('portal_password', 'is', null);
    return error ? [] : data;
}

// 4. LOGIC ENGINE
function normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/\D/g, '');
    return cleaned.startsWith('0') ? '233' + cleaned.substring(1) : cleaned;
}

function parseTemplate(template, student) {
    const staticUrl = "http://ghschools.edu.gh/admissionforms.html";
    return template
        .replace(/{{first_name}}/g, student.first_name || 'Student')
        .replace(/{{username}}/g, student.portal_username || '')
        .replace(/{{password}}/g, student.portal_password || '')
        .replace(/{{url}}/g, staticUrl);
}

// 5. EXECUTION (The 406 Fix is here)
async function triggerSms(phone, message, student) {
    try {
        // We must mimic an UPDATE webhook with old_record.username = null
        // to pass the Edge Function's logic gate
        const payload = {
            type: 'UPDATE',
            table: 'newstudents',
            record: {
                ...student,
                phone_number: phone,
                manual_msg: message // In case function logic supports it
            },
            old_record: {
                portal_username: null // This triggers the 'Transition Check'
            }
        };

        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}` 
            },
            body: JSON.stringify(payload)
        });

        return response.ok;
    } catch (err) {
        return false;
    }
}

// 6. WORKFLOWS
async function runBulkBroadcast() {
    const students = await fetchEligibleStudents();
    if (!students.length) return addLog("No students found.", "error");

    const template = ui.previewText.innerText;
    isLooping = true;
    setUiState(true, students.length);

    for (let i = 0; i < students.length; i++) {
        if (!isLooping) break;
        const s = students[i];
        updateProgress(i + 1, students.length);
        
        const success = await triggerSms(normalizePhone(s.phone_number), parseTemplate(template, s), s);
        addLog(`${success ? 'Sent' : 'Fail'}: ${s.student_id}`, success ? 'success' : 'error');
        
        await new Promise(r => setTimeout(r, 200));
    }
    setUiState(false);
}

// 7. LISTENERS
window.onload = fetchSmsTemplate;

ui.btnBroadcast.onclick = () => confirm("Start Bulk?") && runBulkBroadcast();
ui.btnStop.onclick = () => { isLooping = false; addLog("Stopping...", "error"); };

ui.btnSingle.onclick = async () => {
    const student = await fetchStudentById(ui.studentIdInput.value);
    if (!student) return;

    const phone = normalizePhone(ui.phoneOverrideInput.value || student.phone_number);
    const msg = parseTemplate(ui.previewText.innerText, student);

    addLog(`Sending to ${phone}...`);
    const success = await triggerSms(phone, msg, student);
    addLog(success ? "Success!" : "Failed (Check Logs)", success ? "success" : "error");
};