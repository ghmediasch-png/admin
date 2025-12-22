// queue-manager/queue-admin.js

// 1. Initialize List Controller
// CRITICAL FIX: We must assign to 'window.activeListController' so the Search/Date inputs (which use onkeyup="window.activeListController...") can find it.
window.activeListController = new ListController({
    tableId: 'queueList',
    toolbarId: 'queueToolbar',
    paginationId: 'queuePagination',
    fetchData: fetchQueues,
    renderRow: renderQueueCard
});

// 2. Fetch Function (Enhanced with Archive Filter)
async function fetchQueues({ from, to, search, date }) {
    // A. Check View Filter (Active vs Archived)
    const viewType = document.querySelector('input[name="viewFilter"]:checked')?.value || 'active';

    // B. Base Query
    let query = supabase
        .from('queue_events')
        .select('*, queue_entries(status)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    // C. Apply Status Filter based on View Type
    if (viewType === 'active') {
        // Show OPEN, CLOSED, PAUSED
        query = query.neq('status', 'ARCHIVED');
    } else {
        // Show ONLY ARCHIVED
        query = query.eq('status', 'ARCHIVED');
    }

    // D. Apply Search
    if (search) {
        query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    // E. Apply Date
    if (date) {
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;
        query = query.gte('created_at', startOfDay).lte('created_at', endOfDay);
    }

    const { data, error, count } = await query;

    if (error) return { data: [], error };

    // F. Process Data
    const processedData = data.map(q => {
        const entries = q.queue_entries || [];
        return {
            ...q,
            stats: {
                total: entries.length,
                waiting: entries.filter(e => e.status === 'WAITING').length,
                serving: entries.filter(e => e.status === 'SERVING').length,
                served: entries.filter(e => e.status === 'COMPLETED').length,
                removed: entries.filter(e => e.status === 'REMOVED').length
            }
        };
    });

    return { data: processedData, count };
}

// 3. Render Function (Detailed Cards)
function renderQueueCard(queue) {
    const statusColor = queue.status === 'OPEN' ? 'dot-active' : (queue.status === 'PAUSED' ? 'dot-paused' : 'dot-closed');
    const joinLink = `${window.location.origin}/queue-manager/join.html?q=${queue.slug}`;

    // Format Date
    const createdDate = new Date(queue.created_at).toLocaleDateString();

    return `
    <div class="queue-card" onclick="window.location.href='queue-monitor.html?id=${queue.id}'">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:15px;">
            <div>
                <h3 style="margin-bottom:5px; font-size:1.1rem;">${queue.name}</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:0.8rem; color:#64748b;">
                        <span class="queue-status-dot ${statusColor}"></span> ${queue.status}
                    </span>
                    <span style="font-size:0.75rem; color:#94a3b8;"><i class="far fa-calendar"></i> ${createdDate}</span>
                </div>
            </div>
            <div style="text-align:right;">
                <span style="font-size:1.5rem; font-weight:bold; color:#2563eb;">${queue.stats.waiting}</span>
                <div style="font-size:0.7rem; text-transform:uppercase; color:#64748b; font-weight:700;">Waiting</div>
            </div>
        </div>

        <!-- Stats Grid -->
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; background:#f8fafc; padding:10px; border-radius:6px; margin-bottom:15px;">
            <div style="text-align:center; border-right:1px solid #e2e8f0;">
                <div style="font-size:1rem; font-weight:700; color:#334155;">${queue.stats.total}</div>
                <div style="font-size:0.65rem; color:#64748b;">TOTAL</div>
            </div>
            <div style="text-align:center; border-right:1px solid #e2e8f0;">
                <div style="font-size:1rem; font-weight:700; color:#22c55e;">${queue.stats.served}</div>
                <div style="font-size:0.65rem; color:#64748b;">SERVED</div>
            </div>
            <div style="text-align:center;">
                <div style="font-size:1rem; font-weight:700; color:#f59e0b;">${queue.stats.serving}</div>
                <div style="font-size:0.65rem; color:#64748b;">ACTIVE</div>
            </div>
        </div>
        
        <div style="border-top:1px solid #f1f5f9; padding-top:10px;">
            <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:5px;">Public Link:</div>
            <div style="display:flex; gap:5px;">
                <input type="text" value="${joinLink}" readonly 
                       style="font-size:0.8rem; padding:5px; background:#f8fafc; flex:1; border:1px solid #e2e8f0; border-radius:4px;" 
                       onclick="event.stopPropagation(); this.select();">
                <button onclick="event.stopPropagation(); navigator.clipboard.writeText('${joinLink}'); alert('Link copied!')" 
                        class="btn-retry" style="min-height:30px;">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        </div>
    </div>
    `;
}

// 4. Modal Logic (Unchanged from Part 3)
const modal = document.getElementById('createModal');
const slugInput = document.getElementById('queueSlug');
const nameInput = document.getElementById('queueName');
const slugPreview = document.getElementById('slugPreview');

function openCreateModal() {
    modal.classList.add('active');
    nameInput.focus();
}

function closeCreateModal() {
    modal.classList.remove('active');
    document.getElementById('createQueueForm').reset();
}

nameInput.addEventListener('input', (e) => {
    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    slugInput.value = slug;
    slugPreview.textContent = slug;
});

slugInput.addEventListener('input', (e) => {
    slugPreview.textContent = e.target.value;
});

document.getElementById('createQueueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    btn.disabled = true;

    const { data: { user } } = await supabase.auth.getUser();

    const supportPhone = document.getElementById('queueSupport').value.trim();

    // Check Auto-Close
    const isAutoClose = document.getElementById('enableAutoClose').checked;
    const expiryDate = isAutoClose ? document.getElementById('queueExpiry').value : null;

    // Convert local datetime to UTC/ISO string if present
    const finalExpiry = expiryDate ? new Date(expiryDate).toISOString() : null;

    // NEW: SMS Logic
    const smsConfig = {
        enabled_join: document.getElementById('smsJoin').checked,         // Toggle A
        enabled_reminder: document.getElementById('smsReminder').checked, // Toggle B
        reminder_threshold: parseInt(document.getElementById('smsThreshold').value) || 3
    };

    const newQueue = {
        name: nameInput.value,
        slug: slugInput.value,
        status: 'OPEN',
        created_by: user.id,
        expires_at: finalExpiry,
        settings: {
            support_phone: supportPhone,
            sms_config: smsConfig // Saving the granular settings here
        }
    };


    const { error } = await supabase.from('queue_events').insert(newQueue);

    if (error) {
        alert("Error creating queue: " + error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    } else {
        closeCreateModal();
        btn.innerHTML = originalText;
        btn.disabled = false;
        window.activeListController.loadData();
    }
});

function toggleDateInput(isChecked) {
    const container = document.getElementById('dateInputContainer');
    container.style.display = isChecked ? 'block' : 'none';
}

function toggleReminderInput(isChecked) {
    document.getElementById('reminderConfig').style.display = isChecked ? 'block' : 'none';
}