// queue-manager/queue-monitor.js

// 1. Get Queue ID
const urlParams = new URLSearchParams(window.location.search);
const queueId = urlParams.get('id');

if (!queueId) {
    alert("No Queue ID provided");
    window.location.href = 'dashboard.html';
}

let queueData = null;
let entries = [];

// 2. Init
document.addEventListener('DOMContentLoaded', () => {
    initMonitor();
});

async function initMonitor() {
    // Fetch Queue Name
    const { data: q } = await supabase
        .from('queue_events')
        .select('name, status, settings')
        .eq('id', queueId)
        .single();

    if (q) {
        queueData = q;
        document.getElementById('queueTitle').textContent = q.name;
        document.title = `Monitor: ${q.name}`;
    }

    // Load Data
    loadEntries();

    // Start Realtime
    supabase
        .channel('public:queue_entries')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter: `queue_id=eq.${queueId}` },
            () => {
                loadEntries(); // Refresh on any change
            })
        .subscribe();
}

// 3. Fetch Entries
async function loadEntries() {
    const { data, error } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('queue_id', queueId)
        .in('status', ['WAITING', 'SERVING']) // Only active ones
        .order('position', { ascending: true }); // Strict Order

    if (error) {
        console.error("Error loading entries:", error);
        return;
    }

    entries = data;
    render(data);

    processReminders(data);
}

// 4. Render Logic
function render(data) {
    const servingContainer = document.getElementById('servingContainer');
    const listContainer = document.getElementById('waitingList');
    const countBadge = document.getElementById('countBadge');

    // Filter
    const serving = data.filter(e => e.status === 'SERVING');
    const waiting = data.filter(e => e.status === 'WAITING');

    // Update Counter
    countBadge.textContent = waiting.length;

    // A. Render Serving Card (Show only the FIRST person serving, usually 1 admin = 1 served)
    if (serving.length > 0) {
        const current = serving[0]; // Take top
        servingContainer.innerHTML = `
            <div class="serving-card">
                <div>
                    <div class="serving-header"><span class="queue-status-dot dot-active"></span> Now Serving</div>
                    <div class="big-name">${current.student_identifier}</div>
                    <div class="big-phone"><i class="fas fa-phone"></i> ${current.student_phone}</div>
                    
                    <div style="margin-bottom:20px;">
                        <textarea id="adminMsg-${current.id}" placeholder="Send message to student screen..." 
                            class="template-editor" style="min-height:60px;"
                            onchange="updateMessage('${current.id}', this.value)">${current.admin_message || ''}</textarea>
                    </div>
                </div>
                <div class="action-grid">
                    <button class="btn-primary" onclick="updateStatus('${current.id}', 'COMPLETED')" style="background:#22c55e;">
                        <i class="fas fa-check"></i> Complete
                    </button>
                    <button class="btn-primary" onclick="updateStatus('${current.id}', 'NO_SHOW')" style="background:#ef4444;">
                        <i class="fas fa-user-slash"></i> No Show
                    </button>
                </div>
            </div>
        `;
    } else {
        servingContainer.innerHTML = `
            <div class="serving-card" style="border-color:#e2e8f0; justify-content:center; align-items:center; text-align:center;">
                <i class="fas fa-coffee" style="font-size:3rem; color:#e2e8f0; margin-bottom:15px;"></i>
                <h3 style="color:#94a3b8;">No one is being served</h3>
                <button class="btn-retry" onclick="callNext()" style="margin-top:10px;">Call Next</button>
            </div>
        `;
    }

    // B. Render Waiting List
    if (waiting.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">The queue is empty.</div>`;
    } else {
        listContainer.innerHTML = waiting.map((item, index) => `
            <div class="wait-row">
                <div class="pos-badge">${item.position}</div>
                <div class="row-info">
                    <div class="row-name">${item.student_identifier}</div>
                    <div class="row-meta">${item.student_phone}</div>
                </div>
                <div class="row-actions">
                    <button class="btn-icon" title="Call Now" onclick="forceCall('${item.id}')">
                        <i class="fas fa-bell" style="color:#2563eb;"></i>
                    </button>
                    <button class="btn-icon" title="Move Down" onclick="moveDown('${item.id}', ${item.position})">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="btn-icon" title="Remove" onclick="updateStatus('${item.id}', 'REMOVED')">
                        <i class="fas fa-trash" style="color:#ef4444;"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

// 5. Actions

// A. Call Next (Strict FIFO)
async function callNext() {
    // 1. Find the first person waiting
    const nextPerson = entries.find(e => e.status === 'WAITING');

    if (!nextPerson) {
        alert("No one is waiting!");
        return;
    }

    // Update Status
    updateStatus(nextPerson.id, 'SERVING');

    // NEW: Trigger Manual SMS (Call)
    // This will check Global Switch -> Queue Settings inside the function
    sendAdminSMS(nextPerson.id, 'CALL');
}

// B. Force Call (Jump specific person)
function forceCall(id) {
    if (confirm("Call this person immediately?")) {
        updateStatus(id, 'SERVING');
    }
}

// C. Update Status Helper
async function updateStatus(id, newStatus) {
    const { error } = await supabase
        .from('queue_entries')
        .update({ status: newStatus })
        .eq('id', id);

    if (error) alert("Error: " + error.message);
    // Realtime will handle the refresh
}

// D. Send Message to Student
async function updateMessage(id, msg) {
    await supabase
        .from('queue_entries')
        .update({ admin_message: msg })
        .eq('id', id);
}

// E. Move Down Logic (Swap positions)
async function moveDown(id, currentPos) {
    // Find the person directly below
    // Note: 'entries' contains both WAITING and SERVING, sorted by position.
    // We only want to swap within WAITING usually, but let's just swap with next valid ID for simplicity.

    const currentIndex = entries.findIndex(e => e.id == id);
    if (currentIndex === -1 || currentIndex === entries.length - 1) return; // Already last

    const nextEntry = entries[currentIndex + 1];

    // Optimistic Update (Prevent flicker)
    // Actually, Realtime is fast enough, let's just do DB transaction logic manually
    // Swap positions

    const { error: err1 } = await supabase
        .from('queue_entries')
        .update({ position: nextEntry.position })
        .eq('id', id);

    const { error: err2 } = await supabase
        .from('queue_entries')
        .update({ position: currentPos })
        .eq('id', nextEntry.id);

    // Realtime will reload list
}

// 6. Walk-in Logic
function openWalkInModal() {
    document.getElementById('walkInModal').classList.add('active');
    document.getElementById('manualName').focus();
}

async function submitWalkIn() {
    const name = document.getElementById('manualName').value;
    const phone = document.getElementById('manualPhone').value;
    const btn = document.querySelector('#walkInModal .btn-primary');

    if (!name) { alert("Name is required"); return; }

    btn.textContent = "Adding...";
    btn.disabled = true;

    // Insert with is_manual_entry flag
    const { error } = await supabase
        .from('queue_entries')
        .insert({
            queue_id: queueId,
            student_identifier: name + " (Walk-in)",
            student_phone: phone || 'N/A',
            status: 'WAITING',
            is_manual_entry: true,
            is_verified: false
        });

    btn.textContent = "Add to Queue";
    btn.disabled = false;

    if (error) {
        alert("Error: " + error.message);
    } else {
        document.getElementById('walkInModal').classList.remove('active');
        document.getElementById('manualName').value = '';
        document.getElementById('manualPhone').value = '';
        // Realtime will update the list automatically
    }
}

// 7. Tab Switching Logic
function switchTab(tabName) {
    // UI Toggles
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // View Toggles
    document.getElementById('view-monitor').style.display = tabName === 'monitor' ? 'grid' : 'none';
    document.getElementById('view-settings').style.display = tabName === 'settings' ? 'block' : 'none';

    // If opening settings, sync the status radio button
    if (tabName === 'settings' && queueData) {
        const radio = document.querySelector(`input[name="qStatus"][value="${queueData.status}"]`);
        if (radio) radio.checked = true;
    }
}

// 8. Lifecycle Actions

// A. Update Status (Open/Close)
async function updateQueueStatus(newStatus) {
    const { error } = await supabase
        .from('queue_events')
        .update({ status: newStatus })
        .eq('id', queueId);

    if (error) alert("Error: " + error.message);
    else {
        queueData.status = newStatus; // Update local state
        // Optional: Toast notification
    }
}

// B. Archive
async function archiveQueue() {
    if (!confirm("Are you sure? This will hide the queue from the main dashboard.")) return;

    await updateQueueStatus('ARCHIVED');
    window.location.href = 'dashboard.html';
}

// C. Delete (Hard Delete)
async function deleteQueue() {
    const confirmText = prompt("Type DELETE to confirm permanent deletion of this queue and all its data.");
    if (confirmText !== 'DELETE') return;

    // Delete Entries first (Cascade usually handles this, but safer to be explicit if RLS allows)
    // Then Delete Event
    const { error } = await supabase
        .from('queue_events')
        .delete()
        .eq('id', queueId);

    if (error) {
        alert("Delete failed: " + error.message);
    } else {
        alert("Queue deleted.");
        window.location.href = 'dashboard.html';
    }
}

// 9. Automated Reminder Logic
async function processReminders(allEntries) {
    // 1. Check if feature is ON
    const config = queueData.settings?.sms_config;
    if (!config || !config.enabled_reminder) return;

    const threshold = config.reminder_threshold || 3;

    // 2. Get Waiting List (Sorted by Position)
    const waiting = allEntries.filter(e => e.status === 'WAITING');

    // 3. Iterate and Check
    for (let i = 0; i < waiting.length; i++) {
        const entry = waiting[i];
        const currentPos = i + 1; // 1-based position

        // Condition: Exactly at threshold AND hasn't been sent yet
        // We use optional chaining ?. because sms_logs might be null initially
        if (currentPos === threshold && !entry.sms_logs?.reminder_sent) {
            console.log(`Triggering Reminder for ${entry.student_identifier} at #${currentPos}`);
            await sendSystemSMS(entry, 'REMINDER', currentPos);
        }
    }
}

// 10. System SMS Sender (Automated)
async function sendSystemSMS(entry, type, positionVal) {
    if (!await isGlobalSmsEnabled()) return;

    // Format Phone
    let formattedPhone = entry.student_phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '233' + formattedPhone.substring(1);

    // Fetch Queue Name for the message
    const qName = document.getElementById('queueTitle').textContent || "Queue";

    const { error } = await supabase
        .from('sms_trigger_master')
        .insert({
            phone: formattedPhone,
            first_name: entry.student_identifier,
            reference_code: entry.token,
            fee_type: qName,        // MAPS TO {{fee_type}}
            amount: positionVal,    // MAPS TO {{amount}} (Current Position)
            template_slug: 'queue_reminder',
            source_table: 'queue_entries',
            sms_status: 'pending'
        });

    if (!error) {
        // Update Log
        const newLogs = { ...entry.sms_logs, reminder_sent: true, reminder_time: new Date().toISOString() };
        await supabase.from('queue_entries').update({ sms_logs: newLogs }).eq('id', entry.id);
    }
}

// 11. Manual/Admin SMS Trigger
async function sendAdminSMS(entryId, type) {
    if (!await isGlobalSmsEnabled()) {
        alert("SMS Disabled Globally.");
        return;
    }

    const { data: entry } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('id', entryId)
        .single();

    let formattedPhone = entry.student_phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '233' + formattedPhone.substring(1);

    const qName = document.getElementById('queueTitle').textContent || "Queue";

    // Use 'queue_reminder' template for manual calls for now
    await supabase.from('sms_trigger_master').insert({
        phone: formattedPhone,
        first_name: entry.student_identifier,
        reference_code: entry.token,
        fee_type: qName,
        amount: 1, // "You are #1" effectively
        template_slug: 'queue_reminder',
        source_table: 'queue_entries',
        sms_status: 'pending'
    });

    // Toast
    const btn = document.querySelector('button[onclick="callNext()"]');
    if (btn) {
        const prev = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> SMS Sent';
        setTimeout(() => btn.innerHTML = prev, 2000);
    }
}

// 9. Export Data
async function exportQueueData() {
    const btn = document.querySelector('button[onclick="exportQueueData()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    // 1. Fetch ALL data for this queue (Not just active ones)
    const { data, error } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('queue_id', queueId)
        .order('created_at', { ascending: true });

    if (error) {
        alert("Export failed: " + error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    if (data.length === 0) {
        alert("No data to export.");
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    // 2. Define CSV Headers
    const headers = ['Ticket Number', 'Name', 'Phone', 'Status', 'Manual Entry?', 'Joined At', 'Notes'];

    // 3. Map Data to Rows
    const rows = data.map(row => [
        row.position,
        `"${row.student_identifier}"`, // Quote to handle commas in names
        `"${row.student_phone}"`,
        row.status,
        row.is_manual_entry ? 'Yes' : 'No',
        new Date(row.created_at).toLocaleString(),
        `"${row.admin_message || ''}"`
    ]);

    // 4. Convert to CSV String
    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');

    // 5. Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    // Filename: queue-name-date.csv
    const cleanName = document.getElementById('queueTitle').textContent.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("download", `${cleanName}_report.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Reset Button
    btn.innerHTML = originalText;
    btn.disabled = false;
}


// Helper: Check Global Switch
async function isGlobalSmsEnabled() {
    const { data } = await supabase
        .from('system_settings_admin')
        .select('setting_value')
        .eq('setting_key', 'GLOBAL_SMS_ENABLED')
        .single();

    // Return true by default if setting missing, otherwise return the value
    return data ? data.setting_value : true;
}