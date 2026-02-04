// payments.js

// 1. Initialize List Controller
window.activeListController = new ListController({
    tableId: 'paymentTable',
    toolbarId: 'paymentToolbar',
    paginationId: 'paymentPagination',
    fetchData: fetchPayments,
    renderRow: renderPaymentRow
});

// 2. Fetch Data (Table)
async function fetchPayments({ from, to, search, date }) {
    let query = supabase
        .from('payments')
        .select('*', { count: 'exact' })
        .order('payment_date', { ascending: false })
        .range(from, to);

    if (search) {
        // UPDATED: Added fee_type to search
        query = query.or(`student_name.ilike.%${search}%,student_id.ilike.%${search}%,transaction_ref.ilike.%${search}%,fee_type.ilike.%${search}%`);
    }
    if (date) {
        const start = `${date}T00:00:00`;
        const end = `${date}T23:59:59`;
        query = query.gte('payment_date', start).lte('payment_date', end);
    }

    const { data, count, error } = await query;
    return { data, count, error };
}

// 3. Render Row
function renderPaymentRow(p) {
    const dateStr = new Date(p.payment_date).toLocaleDateString() + ' ' + new Date(p.payment_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    
    // Formatting Amount
    const amount = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(p.amount);

    // Source Badge Logic
    let sourceBadge = '';
    if (p.bank_source) {
        sourceBadge = `<span class="badge-source badge-api"><i class="fas fa-server"></i> ${p.bank_source}</span>`;
    } else {
        const lbl = p.source_table || 'Manual';
        sourceBadge = `<span class="badge-source badge-manual"><i class="fas fa-keyboard"></i> ${lbl}</span>`;
    }

    // Status Badge
    let statusClass = 'status-pending';
    if (p.status === 'success' || p.status === 'paid' || p.status === 'approved') statusClass = 'status-sent';
    else if (p.status === 'failed') statusClass = 'status-failed';

    return `
        <tr>
            <td>
                <div style="font-size:0.9rem; color:#334155;">${dateStr}</div>
            </td>
            <td>
                <div style="font-weight:600;">${p.student_name || 'Unknown'}</div>
                <div style="font-size:0.8rem; font-family:monospace; color:#64748b;">${p.student_id}</div>
            </td>
            <td style="font-weight:700; color:#0f172a;">${amount}</td>
            
            <!-- NEW COLUMN: Fee Type -->
            <td style="font-size:0.9rem; color:#475569; font-weight:500;">
                ${p.fee_type || 'Tuition Fees'}
            </td>

            <td style="font-family:monospace; color:#64748b;">${p.transaction_ref}</td>
            <td>${sourceBadge}</td>
            <td><span class="status-badge ${statusClass}">${p.status}</span></td>
        </tr>
    `;
}

// 4. Stats Logic (Calculates Today's Totals)
async function loadDailyStats() {
    const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00';
    
    const { data, error } = await supabase
        .from('payments')
        .select('amount, bank_source')
        .gte('payment_date', todayStart);

    if (error || !data) return;

    let total = 0;
    let apiTotal = 0;
    let manualTotal = 0;

    data.forEach(p => {
        const amt = parseFloat(p.amount) || 0;
        total += amt;
        if (p.bank_source) {
            apiTotal += amt;
        } else {
            manualTotal += amt;
        }
    });

    // Update UI
    const fmt = (num) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(num);
    document.getElementById('statTotal').textContent = fmt(total);
    document.getElementById('statApi').textContent = fmt(apiTotal);
    document.getElementById('statManual').textContent = fmt(manualTotal);
}

// 5. Export Function (CSV)
async function exportPayments() {
    const btn = document.querySelector('button[onclick="exportPayments()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('payment_date', { ascending: false })
        .limit(5000);

    if (error) {
        alert("Export failed: " + error.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    const csvData = data.map(p => ({
        Date: new Date(p.payment_date).toLocaleString(),
        Student_ID: p.student_id,
        Student_Name: p.student_name,
        Amount: p.amount,
        Fee_Type: p.fee_type || 'Tuition Fees', // Ensure it's in export
        Reference: p.transaction_ref,
        Source: p.bank_source || 'Manual',
        Status: p.status
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `payment_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    btn.innerHTML = originalText;
    btn.disabled = false;
}