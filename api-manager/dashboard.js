// api-manager/dashboard.js

document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
});

let trafficChart = null;

async function loadDashboardData() {
    console.log("Loading Analytics...");
    
    // 1. Load Active Banks Count
    const { count: bankCount } = await supabase
        .from('bank_api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
    
    document.getElementById('metricBanks').textContent = bankCount || 0;

    // 2. Load Recent Logs (Last 24 Hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: logs, error } = await supabase
        .from('api_request_logs')
        .select('request_timestamp, response_status, response_time_ms, bank_name')
        .gte('request_timestamp', yesterday)
        .order('request_timestamp', { ascending: true }); // Ascending for Chart

    if (error) {
        console.error("Stats Error:", error);
        return;
    }

    // 3. Load Total All Time Count
    const { count: totalAllTime } = await supabase
        .from('api_request_logs')
        .select('*', { count: 'exact', head: true });
    
    document.getElementById('metricTotal').textContent = formatNumber(totalAllTime || 0);

    // 4. Calculate 24h Metrics
    if (logs.length > 0) {
        const total24 = logs.length;
        const successCount = logs.filter(l => l.response_status === 'success').length;
        const totalLatency = logs.reduce((sum, l) => sum + (l.response_time_ms || 0), 0);
        
        // Success Rate
        const rate = Math.round((successCount / total24) * 100);
        const rateEl = document.getElementById('metricSuccess');
        rateEl.textContent = rate + '%';
        rateEl.style.color = rate > 95 ? '#166534' : (rate > 80 ? '#f59e0b' : '#991b1b');

        // Avg Latency
        const avgLat = Math.round(totalLatency / total24);
        document.getElementById('metricLatency').textContent = avgLat + 'ms';
    }

    // 5. Render Chart
    renderChart(logs);

    // 6. Render Recent Table (Take last 5)
    renderRecentTable(logs.slice().reverse().slice(0, 5));
}

function renderChart(logs) {
    const ctx = document.getElementById('trafficChart').getContext('2d');
    
    // Group logs by Hour
    const hours = {};
    logs.forEach(log => {
        const d = new Date(log.request_timestamp);
        // Key format: "14:00"
        const key = d.getHours() + ':00';
        if (!hours[key]) hours[key] = 0;
        hours[key]++;
    });

    const labels = Object.keys(hours);
    const dataPoints = Object.values(hours);

    if (trafficChart) trafficChart.destroy();

    trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'API Requests',
                data: dataPoints,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [5, 5] } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderRecentTable(recentLogs) {
    const tbody = document.getElementById('recentLogsBody');
    if (recentLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No activity in 24h</td></tr>';
        return;
    }

    tbody.innerHTML = recentLogs.map(log => {
        const time = new Date(log.request_timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let dot = 'dot-error';
        if (log.response_status === 'success') dot = 'dot-success';
        if (log.response_status === 'rate_limited') dot = 'dot-rate';

        return `
            <tr>
                <td><span style="font-family:monospace; color:#64748b;">${time}</span></td>
                <td style="font-weight:600;">${log.bank_name || 'System'}</td>
                <td><span class="status-dot ${dot}"></span> ${log.response_status}</td>
                <td>${log.response_time_ms}ms</td>
            </tr>
        `;
    }).join('');
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}