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
        .select('name, status')
        .eq('id', queueId)
        .single();
    
    if(q) {
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

    updateStatus(nextPerson.id, 'SERVING');
}

// B. Force Call (Jump specific person)
function forceCall(id) {
    if(confirm("Call this person immediately?")) {
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