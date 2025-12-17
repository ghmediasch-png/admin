// queue-manager/queue-admin.js

// 1. Initialize List Controller (reusing your global list-controller.js)
const listController = new ListController({
    tableId: 'queueList', // We will inject cards here, not a table, but the controller handles data
    toolbarId: null,      // No search bar needed for this simple view yet
    paginationId: null,   // No pagination needed yet
    fetchData: fetchQueues,
    renderRow: renderQueueCard // We override this to render Cards instead of Table Rows
});

// 2. Fetch Function (Supabase)
async function fetchQueues({ from, to }) {
    // Select queues and count active entries
    const { data, error, count } = await supabase
        .from('queue_events')
        .select('*, queue_entries(count)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) return { data: [], error };

    // Process data to include entry count
    const processedData = data.map(q => ({
        ...q,
        active_count: q.queue_entries[0]?.count || 0
    }));

    return { data: processedData, count };
}

// 3. Render Function (Cards)
function renderQueueCard(queue) {
    const statusColor = queue.status === 'OPEN' ? 'dot-active' : (queue.status === 'PAUSED' ? 'dot-paused' : 'dot-closed');
    const joinLink = `${window.location.origin}/queue-manager/join.html?q=${queue.slug}`;
    
    return `
    <div class="queue-card" onclick="window.location.href='queue-monitor.html?id=${queue.id}'">
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
                <h3 style="margin-bottom:5px;">${queue.name}</h3>
                <span class="queue-status-dot ${statusColor}"></span>
                <span style="font-size:0.85rem; color:#64748b; font-weight:600;">${queue.status}</span>
            </div>
            <div style="text-align:right;">
                <span style="font-size:1.5rem; font-weight:bold; color:#2563eb;">${queue.active_count}</span>
                <div style="font-size:0.75rem; color:#64748b;">Waiting</div>
            </div>
        </div>
        
        <div style="margin-top:15px; padding-top:15px; border-top:1px solid #f1f5f9;">
            <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:5px;">Public Link:</div>
            <div style="display:flex; gap:5px;">
                <input type="text" value="${joinLink}" readonly 
                       style="font-size:0.8rem; padding:5px; background:#f8fafc;" onclick="event.stopPropagation(); this.select();">
                <button onclick="event.stopPropagation(); navigator.clipboard.writeText('${joinLink}'); alert('Link copied!')" 
                        class="btn-retry" style="min-height:30px;">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        </div>
    </div>
    `;
}

// 4. Modal Logic
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

// Auto-generate slug from name
nameInput.addEventListener('input', (e) => {
    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    slugInput.value = slug;
    slugPreview.textContent = slug;
});

slugInput.addEventListener('input', (e) => {
    slugPreview.textContent = e.target.value;
});

// 5. Create Queue Submission
document.getElementById('createQueueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    btn.disabled = true;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const newQueue = {
        name: nameInput.value,
        slug: slugInput.value,
        status: 'OPEN',
        created_by: user.id
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
        listController.loadData(); // Refresh list
    }
});