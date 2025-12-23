// api-manager/developer.js

// Configuration
// Dynamic extraction based on current hostname if needed, or hardcoded
const PROJECT_REF = 'fyriapqeztevzkcaaiqw'; 
const EDGE_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/verify-student`;

document.addEventListener('DOMContentLoaded', () => {
    // Populate URL in docs and sandbox
    const docUrl = document.getElementById('docUrl');
    const sandboxUrl = document.getElementById('sandboxUrl');
    
    if(docUrl) docUrl.textContent = EDGE_URL;
    if(sandboxUrl) sandboxUrl.value = EDGE_URL;
});

function switchTab(tab) {
    // UI Toggles
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${tab}`).classList.add('active');

    // View Toggles via CSS classes
    const docsView = document.getElementById('view-docs');
    const sandboxView = document.getElementById('view-sandbox');

    if (tab === 'docs') {
        docsView.classList.remove('hidden');
        sandboxView.classList.add('hidden');
    } else {
        docsView.classList.add('hidden');
        sandboxView.classList.remove('hidden');
    }
}

async function runTest() {
    const btn = document.getElementById('testBtn');
    const output = document.getElementById('sandboxOutput');
    const key = document.getElementById('sandboxKey').value.trim();
    const id = document.getElementById('sandboxId').value.trim();

    if (!key || !id) {
        output.textContent = "Error: Please provide API Key and Student ID.";
        output.style.color = "#f87171";
        return;
    }

    // Reset UI
    output.textContent = "Sending request...";
    output.style.color = "#a5b4fc";
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    btn.disabled = true;

    const startTime = Date.now();

    try {
        const response = await fetch(EDGE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': key
            },
            body: JSON.stringify({ student_id: id })
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        // Formatting Output
        const statusLine = `HTTP ${response.status} ${response.statusText} (${duration}ms)\n\n`;
        output.textContent = statusLine + JSON.stringify(data, null, 2);

        // Color coding
        if (response.ok) {
            output.style.color = "#4ade80"; // Green
        } else {
            output.style.color = "#f87171"; // Red
        }

    } catch (err) {
        output.textContent = "Network Error: " + err.message;
        output.style.color = "#f87171";
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Request';
        btn.disabled = false;
    }
}