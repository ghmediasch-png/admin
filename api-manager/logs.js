// api-manager/logs.js

// 1. Initialize List Controller
window.activeListController = new ListController({
    tableId: 'logsTable',
    toolbarId: 'logsToolbar',
    paginationId: 'logsPagination',
    fetchData: fetchLogs,
    renderRow: renderLogRow
});

// 2. Fetch Data (Supabase)
async function fetchLogs({ from, to, search, date }) {
    let query = supabase
        .from('api_request_logs')
        .select('*', { count: 'exact' })
        .order('request_timestamp', { ascending: false })
        .range(from, to);

    if (search) {
        query = query.or(`bank_name.ilike.%${search}%,student_id_queried.ilike.%${search}%`);
    }
    if (date) {
        const start = `${date}T00:00:00`;
        const end = `${date}T23:59:59`;
        query = query.gte('request_timestamp', start).lte('request_timestamp', end);
    }

    const { data, error, count } = await query;
    return { data, count, error };
}

// 3. Render Row
function renderLogRow(log) {
    const time = new Date(log.request_timestamp).toLocaleTimeString();
    const date = new Date(log.request_timestamp).toLocaleDateString();
    
    let badgeClass = 'log-error';
    if (log.response_status === 'success') badgeClass = 'log-success';
    if (log.response_status === 'rate_limited') badgeClass = 'log-rate_limited';
    if (log.response_status === 'auth_failed') badgeClass = 'log-auth_failed';

    return `
        <tr>
            <td>
                <div style="font-weight:bold;">${time}</div>
                <div style="font-size:0.75rem; color:#64748b;">${date}</div>
            </td>
            <td>${log.bank_name || 'Unknown'}</td>
            <td style="font-family:monospace;">${log.student_id_queried}</td>
            <td><span class="log-badge ${badgeClass}">${log.response_status}</span></td>
            <td>${log.response_time_ms}ms</td>
            <td>
                <button onclick='viewLogDetails(${JSON.stringify(log)})' class="btn-icon" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `;
}

// 4. Dynamic Modal Injection (THE FIX)
function ensureDetailModalExists() {
    if (document.getElementById('detailModal')) return;

    const modalHTML = `
    <!-- Detail Modal -->
    <div id="detailModal" class="sidebar-overlay" style="z-index: 9999;">
        <div class="auth-card modal-card-default" style="max-width: 600px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
                <h3 style="margin:0;">Request Details</h3>
                <button onclick="closeDetailModal()" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">&times;</button>
            </div>
            
            <div id="modalContent">
                <!-- Injected by JS -->
            </div>

            <div style="text-align:right; margin-top:20px;">
                <button onclick="closeDetailModal()" class="btn-primary" style="width:auto;">Close</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// 5. Modal Logic
function viewLogDetails(log) {
    ensureDetailModalExists(); // <-- This guarantees the modal exists
    
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('modalContent');
    
    const bank = log.bank_name || 'N/A';
    const ip = log.ip_address || 'Hidden';
    const error = log.error_code ? `<span style="color:#ef4444;">${log.error_code}</span>` : 'None';

    content.innerHTML = `
        <div class="detail-grid">
            <div class="detail-item"><label>Request ID</label> <div>${log.request_id}</div></div>
            <div class="detail-item"><label>Bank</label> <div>${bank}</div></div>
            <div class="detail-item"><label>Student ID</label> <div>${log.student_id_queried}</div></div>
            <div class="detail-item"><label>HTTP Status</label> <div>${log.http_status_code}</div></div>
            <div class="detail-item"><label>Latency</label> <div>${log.response_time_ms}ms</div></div>
            <div class="detail-item"><label>Client IP</label> <div>${ip}</div></div>
            <div class="detail-item"><label>Error Code</label> <div>${error}</div></div>
            <div class="detail-item"><label>Timestamp</label> <div>${new Date(log.request_timestamp).toLocaleString()}</div></div>
        </div>
        
        <div class="detail-item">
            <label>Raw Metadata (User Agent etc)</label>
            <div class="code-block">${log.user_agent || 'No user agent captured'}</div>
        </div>
    `;

    // Show
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    setTimeout(() => {
        modal.classList.add('open');
        modal.style.opacity = '1';
    }, 10);
}

function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if(modal) {
        modal.classList.remove('open');
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// Export for HTML
window.viewLogDetails = viewLogDetails;
window.closeDetailModal = closeDetailModal;