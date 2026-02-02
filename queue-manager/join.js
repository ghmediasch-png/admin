// queue-manager/join.js

// 1. Get Queue Slug
const urlParams = new URLSearchParams(window.location.search);
const queueSlug = urlParams.get('q');
let currentQueue = null;

// 2. Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (!queueSlug) {
        showError('No queue specified.', 'Please check the link and try again.');
        return;
    }
    fetchQueueDetails();
});

// 3. Fetch Queue Info
async function fetchQueueDetails() {
    const { data, error } = await supabase
        .from('queue_events')
        .select('*')
        .eq('slug', queueSlug)
        .single();

    if (error || !data) {
        showError('Queue not found.', 'The queue link may be incorrect or expired.');
        return;
    }

    // 1. Check Manual Status (Open/Closed/Paused)
    if (data.status !== 'OPEN') {
        showClosedState(data);
        return;
    }

    // 2. NEW: Check Expiry Date (Time Validation)
    if (data.expires_at) {
        const now = new Date();
        const expiry = new Date(data.expires_at);

        if (now > expiry) {
            // Queue is expired
            showClosedState(data, "This queue has expired.");
            return;
        }
    }

    currentQueue = data;
    renderJoinForm(data);
}

// 4. Render Form
function renderJoinForm(queue) {
    const card = document.getElementById('cardContent');

    // Render Inputs
    card.innerHTML = `
        <div class="queue-header">
            <span class="status-badge-lg" style="background:#dcfce7; color:#166534;">
                <span class="queue-status-dot dot-active"></span> Open
            </span>
            <h1 class="queue-title">${queue.name}</h1>
            <div class="queue-meta">Enter your ID to join the line.</div>
        </div>

        <div id="formError" class="error-msg"></div>

        <form id="joinForm">
            <!-- 1. Student ID Input (Replaces Name) -->
            <div class="form-group">
                <label>Student ID <span style="color:red">*</span></label>
                <input type="text" id="sID" required placeholder="e.g. GHMS25101" style="text-transform: uppercase;">
                <small style="color:#64748b; font-size:0.8rem;">Enter your Index Number.</small>
            </div>

            <!-- 2. Phone Input -->
            <div class="form-group">
                <label>Active Phone Number <span style="color:red">*</span></label>
                <input type="tel" id="sPhone" required placeholder="0xxxxxxxxx" maxlength="10">
                <small style="color:#64748b; font-size:0.8rem;">We will send your queue ticket to this number.</small>
            </div>

            <button type="submit" class="btn-primary" style="margin-top:10px;">
                Verify & Join Queue <i class="fas fa-arrow-right" style="margin-left:5px;"></i>
            </button>
        </form>
    `;

    document.getElementById('joinForm').addEventListener('submit', handleJoinSubmit);
}

// 5. Handle Submission
async function handleJoinSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const errorDiv = document.getElementById('formError');

    // Get Values
    const rawID = document.getElementById('sID').value.trim();
    const phone = document.getElementById('sPhone').value.trim();
    const studentID = rawID.toUpperCase(); // Normalize ID

    // Reset UI
    errorDiv.style.display = 'none';
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    btn.disabled = true;

    // A. Validation: Phone Format
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(phone)) {
        showFormError('Invalid Phone Number. Must be 10 digits starting with 0.');
        resetBtn();
        return;
    }

    try {
        // B. Validation: Check Master DB
        // We use ilike for case-insensitive match
        const { data: studentRecord, error: masterError } = await supabase
            .from('student_master_db')
            .select('*')
            .ilike('student_id', studentID)
            .single();

        if (masterError || !studentRecord) {
            showFormError(`Student ID "${studentID}" not found in our records.`);
            resetBtn();
            return;
        }

        // C. Construct Student Name from Master DB
        const fullName = `${studentRecord.first_name} ${studentRecord.surname}`;

        // D. Insert into Queue Entries
        const { data: entry, error: insertError } = await supabase
            .from('queue_entries')
            .insert({
                queue_id: currentQueue.id,
                student_identifier: fullName,
                student_phone: phone,
                student_master_id: studentRecord.id,
                is_verified: true,
                status: 'WAITING'
            })
            .select('token, position')
            .single();

        if (insertError) throw insertError;

        // --- NEW: Calculate Actual Line Position ---
        const { count: linePosition } = await supabase
            .from('queue_entries')
            .select('*', { count: 'exact', head: true }) // head:true means "just count, don't return rows"
            .eq('queue_id', currentQueue.id)
            .eq('status', 'WAITING');

        // Fallback: If count fails for some reason, use 1 or the ticket number
        const smsPosition = linePosition || entry.position;
        // -------------------------------------------

        // TRIGGER SMS (Conditional)
        const smsConfig = currentQueue.settings?.sms_config;

        if (smsConfig && smsConfig.enabled_join === true && typeof sendJoinSMS === 'function') {
            // PASS THE CALCULATED 'smsPosition' INSTEAD OF 'entry.position'
            await sendJoinSMS(phone, fullName, smsPosition, entry.token, currentQueue.name);
        }

        // E. Success -> Redirect
        saveTokenLocally(entry.token);
        window.location.href = `status.html?token=${entry.token}`;

    } catch (err) {
        console.error(err);
        showFormError('System Error: ' + err.message);
        resetBtn();
    }

    // Helpers
    function resetBtn() {
        btn.innerHTML = 'Verify & Join Queue <i class="fas fa-arrow-right" style="margin-left:5px;"></i>';
        btn.disabled = false;
    }

    function showFormError(msg) {
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
        errorDiv.style.display = 'block';
    }
}

// 5. Proxy Joining Helper (Store multiple tokens)
function saveTokenLocally(newToken) {
    let tokens = JSON.parse(localStorage.getItem('my_queue_tokens') || '[]');
    if (!tokens.includes(newToken)) {
        tokens.push(newToken);
        localStorage.setItem('my_queue_tokens', JSON.stringify(tokens));
    }
}

// 6. UI Helpers
function showError(title, msg) {
    const card = document.getElementById('cardContent');
    card.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <div style="font-size:3rem; color:#ef4444; margin-bottom:15px;"><i class="fas fa-times-circle"></i></div>
            <h3 style="color:#334155;">${title}</h3>
            <p style="color:#64748b;">${msg}</p>
        </div>
    `;
}

function showClosedState(queue, customMsg) {
    const message = customMsg || `${queue.name} is currently not accepting new entries.`;
    const card = document.getElementById('cardContent');

    card.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:3rem; color:#cbd5e1; margin-bottom:20px;"><i class="fas fa-store-slash"></i></div>
            <h2 style="color:#334155; margin-bottom:10px;">Queue Closed</h2>
            <p style="color:#64748b;">${message}</p>
            <button onclick="location.reload()" class="btn-retry" style="margin-top:20px;">Check Again</button>
        </div>
    `;
}

// 7. SMS Trigger (Debug Version)
async function sendJoinSMS(phone, name, position, token, queueName) {
    console.log("🚀 Starting SMS Trigger...");

    // 1. Check Global Switch
    const { data: globalSetting, error: settingError } = await supabase
        .from('system_settings_admin')
        .select('setting_value')
        .eq('setting_key', 'GLOBAL_SMS_ENABLED')
        .single();

    if (settingError) {
        console.warn("⚠️ Could not read Global Switch (RLS issue?):", settingError);
        // We continue anyway, assuming ON if we can't check
    }

    if (globalSetting && globalSetting.setting_value === false) {
        console.warn("🛑 SMS blocked: Global Switch is OFF.");
        return;
    }

    // 2. Format Phone
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '233' + formattedPhone.substring(1);
    }
    console.log("📱 Formatting Phone:", phone, "->", formattedPhone);

    // 3. Insert
    const payload = {
        phone: formattedPhone,
        first_name: name,
        reference_code: token,
        fee_type: queueName,
        amount: position,
        template_slug: 'queue_join',
        source_table: 'queue_entries',
        sms_status: 'pending'
    };

    console.log("📤 Payload:", payload);

    const { data, error } = await supabase
        .from('sms_trigger_master')
        .insert(payload)
        .select();

    if (error) {
        console.error("❌ SMS Trigger Failed DB Insert:", error);
        alert("SMS Failed: " + error.message); // Visible alert for debugging
    } else {
        console.log("✅ SMS Triggered Successfully:", data);
    }
}