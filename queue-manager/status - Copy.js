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
let currentSlug = ''; // For Profile Switcher

// 2. Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadMyStatus();
    loadAllProfiles(); // <--- Critical: Loads the Switcher
});

// 3. Initial Load
async function loadMyStatus() {
    // A. Get My Entry
    const { data: entry, error } = await supabase
        .from('queue_entries')
        .select('*, queue_events(name, settings)') // settings included
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

    // WhatsApp Logic
    const waNumber = entry.queue_events.settings?.support_phone;
    if (waNumber) {
        const waLink = document.getElementById('waLink');
        waLink.style.display = 'block';
        waLink.href = `https://wa.me/${waNumber}?text=Hello, I am ${entry.student_identifier} (Ticket: ${entry.token}). I need help with the queue.`;
    }

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
        // WAITING
        label.textContent = "Current Position";
        icon.innerHTML = '<i class="fas fa-clock" style="color:#f59e0b;"></i>';
        posDisplay.style.color = "#2563eb";
    }
}


// 5. Fetch "Up Next" List (Dynamic Numbering)
async function fetchUpNextList() {
    // Fetch ALL waiting/serving people to calculate exact positions
    // Ordered by Created Time (FIFO)
    const { data, error } = await supabase
        .from('queue_entries')
        .select('student_identifier, status, token, created_at')
        .eq('queue_id', queueId)
        .in('status', ['WAITING', 'SERVING'])
        .order('created_at', { ascending: true }); // Oldest first

    if (error) return;

    const listContainer = document.getElementById('listContainer');
    listContainer.innerHTML = '';

    // Calculate My Position dynamically
    // The Array index is the "True Position"
    let peopleAhead = 0;
    let foundMe = false;

    // We only want to show Top 5 in the list to keep UI clean
    const top5 = data.slice(0, 5);

    data.forEach((item, index) => {
        const isMe = item.token === token;
        const isServing = item.status === 'SERVING';

        // Dynamic Position Number (1, 2, 3...)
        const displayPosition = index + 1;

        if (!foundMe && item.status === 'WAITING') {
            if (isMe) {
                foundMe = true;
            } else {
                peopleAhead++;
            }
        }

        // Only render if in Top 5
        if (index < 5) {
            let displayName = isMe ? `${item.student_identifier} (YOU)` : `Student ${item.student_identifier.substring(0, 2)}**`;
            if (isServing) displayName += " - Serving Now";

            listContainer.innerHTML += `
                <div class="list-item ${isMe ? 'is-me' : ''} ${isServing ? 'is-serving' : ''}">
                    <span style="font-weight:600; color:#334155;">
                        <!-- Dynamic Numbering: #1, #2, #3 -->
                        <span style="color:#94a3b8; margin-right:10px;">#${displayPosition}</span>
                        ${displayName}
                    </span>
                    ${isServing ? '<i class="fas fa-bullhorn" style="color:#22c55e;"></i>' : ''}
                </div>
            `;
        }
    });

    // Update Big Number (Blue Box)
    if (myEntry.status === 'WAITING') {
        document.getElementById('positionDisplay').textContent = peopleAhead;
        document.getElementById('statusLabel').textContent = "People ahead of you";
    }
}

// 6. Multi-Profile Logic
async function loadAllProfiles() {
    const tokens = JSON.parse(localStorage.getItem('my_queue_tokens') || '[]');

    // Only show switcher if we have tokens
    if (tokens.length === 0) return;

    const switcher = document.getElementById('profileSwitcher');
    const list = document.getElementById('tokenList');
    const countSpan = document.getElementById('profileCount');

    switcher.style.display = 'block';
    countSpan.textContent = tokens.length;
    list.innerHTML = '<div style="text-align:center; font-size:0.8rem; color:#94a3b8;">Loading profiles...</div>';

    // Fetch details for ALL tokens
    const { data: profiles, error } = await supabase
        .from('queue_entries')
        .select('token, student_identifier, status, position, queue_events(slug)')
        .in('token', tokens);

    if (error || !profiles) return;

    list.innerHTML = ''; // Clear loading

    profiles.forEach(p => {
        const isCurrent = p.token === token;
        const statusColor = p.status === 'SERVING' ? '#22c55e' : (p.status === 'WAITING' ? '#2563eb' : '#64748b');

        // Save slug for the "Join Another" button
        if (isCurrent) currentSlug = p.queue_events.slug;

        list.innerHTML += `
            <div onclick="window.location.href='status.html?token=${p.token}'" 
                 style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-radius:8px; cursor:pointer; border:1px solid ${isCurrent ? '#2563eb' : '#f1f5f9'}; background: ${isCurrent ? '#eff6ff' : '#f8fafc'};">
                <div style="width:100%;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="font-weight:600; font-size:0.9rem; color:#334155;">${p.student_identifier}</span>
                        <span style="font-size:0.75rem; background:#e2e8f0; padding:2px 6px; border-radius:4px;">#${p.position}</span>
                    </div>
                    <div style="font-size:0.75rem; color:${statusColor}; font-weight:bold; margin-top:2px;">
                        ${p.status} 
                    </div>
                </div>
            </div>
        `;
    });

    // Fallback: If currentSlug is empty (current token invalid/archived), use the first valid one
    if (!currentSlug && profiles.length > 0) {
        currentSlug = profiles[0].queue_events.slug;
    }
}

// 7. Realtime Listener
function setupRealtime() {
    supabase
        .channel('public:queue_entries')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'queue_entries', filter: `queue_id=eq.${queueId}` },
            (payload) => {
                if (payload.new.token === token) {
                    myEntry = payload.new;
                    updateUI(payload.new);
                }
                fetchUpNextList();
                // Refresh switcher too in case statuses change for friends
                loadAllProfiles();
            })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_entries', filter: `queue_id=eq.${queueId}` },
            () => {
                fetchUpNextList();
            })
        .subscribe();
}

function playNotification() {
    if ("vibrate" in navigator) navigator.vibrate(200);
}