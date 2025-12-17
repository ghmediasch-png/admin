// queue-manager/status.js

// 1. Get Token
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (!token) {
    alert("Invalid access token. Redirecting to home.");
    window.location.href = '../index.html';
}

// State
let myEntry = null;
let queueId = null;

// 2. Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadMyStatus();
});

// 3. Initial Load
async function loadMyStatus() {
    // A. Get My Entry
    const { data: entry, error } = await supabase
        .from('queue_entries')
        .select('*, queue_events(name)')
        .eq('token', token)
        .single();

    if (error || !entry) {
        document.body.innerHTML = '<h2 style="text-align:center; padding:50px;">Invalid or Expired Token</h2>';
        return;
    }

    myEntry = entry;
    queueId = entry.queue_id;

    // B. Setup Page Details
    document.getElementById('queueName').textContent = entry.queue_events.name;
    document.title = `Status: ${entry.student_identifier}`;

    // C. Initial Render
    updateUI(entry);
    fetchUpNextList();

    // D. Start Realtime Listener
    setupRealtime();
}

// 4. Update Main UI (Big Number)
function updateUI(entry) {
    const posDisplay = document.getElementById('positionDisplay');
    const label = document.getElementById('statusLabel');
    const icon = document.getElementById('statusIcon');
    const msgBox = document.getElementById('adminMessage');

    // Admin Message Handling
    if (entry.admin_message) {
        document.getElementById('msgText').textContent = entry.admin_message;
        msgBox.style.display = 'block';
    } else {
        msgBox.style.display = 'none';
    }

    // Status Handling
    if (entry.status === 'SERVING') {
        posDisplay.textContent = "NOW";
        posDisplay.style.color = "#22c55e"; // Green
        label.textContent = "IT'S YOUR TURN!";
        icon.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e;"></i>';
        playNotification();
    } 
    else if (entry.status === 'COMPLETED') {
        posDisplay.textContent = "DONE";
        posDisplay.style.color = "#64748b";
        label.textContent = "Served";
        icon.innerHTML = '<i class="fas fa-flag-checkered" style="color:#64748b;"></i>';
    } 
    else if (entry.status === 'REMOVED') {
        posDisplay.textContent = "X";
        label.textContent = "Removed from Queue";
        posDisplay.style.color = "#ef4444";
    } 
    else {
        // WAITING: Calculate relative position logic in the List fetch, 
        // but here we just show their absolute rank or "Waiting"
        label.textContent = "Current Position";
        icon.innerHTML = '<i class="fas fa-clock" style="color:#f59e0b;"></i>';
        posDisplay.style.color = "#2563eb";
        
        // We will update the exact number in fetchUpNextList() logic
    }
}

// 5. Fetch "Up Next" List (Top 5)
async function fetchUpNextList() {
    // Get top 5 waiting or serving
    const { data, error } = await supabase
        .from('queue_entries')
        .select('student_identifier, status, position, token')
        .eq('queue_id', queueId)
        .in('status', ['WAITING', 'SERVING'])
        .order('position', { ascending: true })
        .limit(5);

    if (error) return;

    const listContainer = document.getElementById('listContainer');
    listContainer.innerHTML = '';

    let myRelativePos = -1;

    data.forEach((item, index) => {
        const isMe = item.token === token;
        const isServing = item.status === 'SERVING';
        
        if (isMe) myRelativePos = index + 1;

        // Anonymizer Logic
        let displayName = isMe ? `${item.student_identifier} (YOU)` : `Student ${item.student_identifier.substring(0,2)}**`;
        if (isServing) displayName += " - Serving Now";

        listContainer.innerHTML += `
            <div class="list-item ${isMe ? 'is-me' : ''} ${isServing ? 'is-serving' : ''}">
                <span style="font-weight:600; color:#334155;">
                    <span style="color:#94a3b8; margin-right:10px;">#${item.position}</span>
                    ${displayName}
                </span>
                ${isServing ? '<i class="fas fa-bullhorn" style="color:#22c55e;"></i>' : ''}
            </div>
        `;
    });

    // Update Big Number if waiting
    if (myEntry.status === 'WAITING') {
        if (myRelativePos > 0) {
            document.getElementById('positionDisplay').textContent = myRelativePos;
            document.getElementById('statusLabel').textContent = "People ahead of you: " + (myRelativePos - 1);
        } else {
            // I am not in the top 5, assume > 5
            document.getElementById('positionDisplay').textContent = "5+";
            document.getElementById('statusLabel').textContent = "In Queue";
        }
    }
}

// 6. Realtime Listener (The Magic)
function setupRealtime() {
    supabase
        .channel('public:queue_entries')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'queue_entries', filter: `queue_id=eq.${queueId}` }, 
        (payload) => {
            // If it's MY entry
            if (payload.new.token === token) {
                myEntry = payload.new; // Update local state
                updateUI(payload.new);
            }
            // Always refresh list if anyone in this queue changes
            fetchUpNextList();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_entries', filter: `queue_id=eq.${queueId}` },
        () => {
            fetchUpNextList();
        })
        .subscribe();
}

function playNotification() {
    // Optional: Add a 'ding' sound logic here
    if("vibrate" in navigator) navigator.vibrate(200);
}