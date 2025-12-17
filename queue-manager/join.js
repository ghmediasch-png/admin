// queue-manager/join.js

// 1. Get the Queue Slug from URL (e.g., join.html?q=registration-desk-a)
const urlParams = new URLSearchParams(window.location.search);
const queueSlug = urlParams.get('q');

// Global state
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

    currentQueue = data;
    renderJoinForm(data);
}

// 4. Render Form
function renderJoinForm(queue) {
    const card = document.getElementById('cardContent');
    
    // Check if Closed
    if (queue.status !== 'OPEN') {
        card.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:3rem; color:#cbd5e1; margin-bottom:20px;"><i class="fas fa-store-slash"></i></div>
                <h2 style="color:#334155; margin-bottom:10px;">Queue Closed</h2>
                <p style="color:#64748b;">${queue.name} is currently not accepting new entries.</p>
                <button onclick="location.reload()" class="btn-retry" style="margin-top:20px;">Check Again</button>
            </div>
        `;
        return;
    }

    // Render Inputs
    card.innerHTML = `
        <div class="queue-header">
            <span class="status-badge-lg" style="background:#dcfce7; color:#166534;">
                <span class="queue-status-dot dot-active"></span> Open
            </span>
            <h1 class="queue-title">${queue.name}</h1>
            <div class="queue-meta">Enter your details to join the line.</div>
        </div>

        <div id="formError" class="error-msg"></div>

        <form id="joinForm">
            <div class="form-group">
                <label>Student Name / ID <span style="color:red">*</span></label>
                <input type="text" id="sName" required placeholder="e.g. John Doe or ID-123">
            </div>

            <div class="form-group">
                <label>Phone Number <span style="color:red">*</span></label>
                <input type="tel" id="sPhone" required placeholder="0xxxxxxxxx" maxlength="10">
                <small style="color:#64748b; font-size:0.8rem;">Must start with 0 and be 10 digits.</small>
            </div>

            <!-- Future: Custom Fields from queue.form_config would go here -->

            <button type="submit" class="btn-primary" style="margin-top:10px;">
                Join Queue <i class="fas fa-arrow-right" style="margin-left:5px;"></i>
            </button>
        </form>
    `;

    // Attach Listener
    document.getElementById('joinForm').addEventListener('submit', handleJoinSubmit);
}

// 5. Handle Submission
async function handleJoinSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const errorDiv = document.getElementById('formError');
    const name = document.getElementById('sName').value.trim();
    const phone = document.getElementById('sPhone').value.trim();

    // Reset UI
    errorDiv.style.display = 'none';
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    // A. Validation
    // Phone must be 10 digits and start with 0
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(phone)) {
        showFormError('Invalid Phone Number. Must be 10 digits starting with 0.');
        resetBtn();
        return;
    }

    // B. Normalize Phone (+233)
    const normalizedPhone = '+233' + phone.substring(1);

    // C. Insert into DB
    const { data, error } = await supabase
        .from('queue_entries')
        .insert({
            queue_id: currentQueue.id,
            student_identifier: name,
            student_phone: phone, // Saving raw input for display
            // phone_normalized: normalizedPhone, // If you added this column, uncomment.
            status: 'WAITING'
        })
        .select('token')
        .single();

    if (error) {
        showFormError('System Error: ' + error.message);
        resetBtn();
    } else {
        // D. Success -> Redirect to Status Page
        // We will build status.html in Part 5
        window.location.href = `status.html?token=${data.token}`;
    }

    // Helper to reset button
    function resetBtn() {
        btn.innerHTML = 'Join Queue <i class="fas fa-arrow-right" style="margin-left:5px;"></i>';
        btn.disabled = false;
    }

    function showFormError(msg) {
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
        errorDiv.style.display = 'block';
    }
}

// Helper: Global Error Display
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