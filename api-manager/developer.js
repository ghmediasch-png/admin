// api-manager/developer.js

// Configuration
const PROJECT_REF = 'fyriapqeztevzkcaaiqw'; 
const URL_VERIFY  = `https://${PROJECT_REF}.supabase.co/functions/v1/bank-gateway`;
const URL_PAYMENT = `https://${PROJECT_REF}.supabase.co/functions/v1/payment-webhook`;

document.addEventListener('DOMContentLoaded', () => {
    // Default Init
    toggleMode();
});

// UI: Tab Switching (Docs vs Sandbox)
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${tab}`).classList.add('active');

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

// UI: Mode Switching (Verify vs Payment)
function toggleMode() {
    const mode = document.querySelector('input[name="reqMode"]:checked').value;
    const urlInput = document.getElementById('sandboxUrl');
    const payFields = document.getElementById('paymentFields');

    if (mode === 'verify') {
        urlInput.value = URL_VERIFY;
        payFields.classList.add('hidden');
    } else {
        urlInput.value = URL_PAYMENT;
        payFields.classList.remove('hidden');
        // Auto-generate a ref if empty to be helpful
        if(!document.getElementById('sandboxRef').value) generateRef();
    }
}

// Helper: Generate Random Transaction Ref
function generateRef() {
    const random = Math.floor(Math.random() * 1000000);
    document.getElementById('sandboxRef').value = `TXN-${random}`;
}

// Logic: Execute API Call
async function runTest() {
    const btn = document.getElementById('testBtn');
    const output = document.getElementById('sandboxOutput');
    const mode = document.querySelector('input[name="reqMode"]:checked').value;
    
    // Common Inputs
    const rawKey = document.getElementById('sandboxKey').value;
    const key = rawKey ? rawKey.trim() : '';
    const id = document.getElementById('sandboxId').value.trim();

    // Validation
    if (!key || !id) {
        output.textContent = "Error: Please provide API Key and Student ID.";
        output.style.color = "#f87171";
        return;
    }

    // Construct Payload & Select URL
    let targetUrl = '';
    let payload = {};

    if (mode === 'verify') {
        targetUrl = URL_VERIFY;
        payload = { 
            action: 'verify_student', 
            student_id: id 
        };
    } else {
        targetUrl = URL_PAYMENT;
        const amount = document.getElementById('sandboxAmount').value;
        const ref = document.getElementById('sandboxRef').value;
        const feeType = document.getElementById('sandboxFeeType').value;

        if (!amount || !ref) {
            output.textContent = "Error: Amount and Transaction Ref required for payments.";
            output.style.color = "#f87171";
            return;
        }

        payload = {
            student_id: id,
            amount: parseFloat(amount),
            transaction_ref: ref,
            fee_type: feeType,
            payment_date: new Date().toISOString()
        };
    }

    // Reset UI
    output.textContent = "Sending request...";
    output.style.color = "#a5b4fc";
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    btn.disabled = true;

    const startTime = Date.now();

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        const duration = Date.now() - startTime;

        const statusLine = `HTTP ${response.status} ${response.statusText} (${duration}ms)\n\n`;
        output.textContent = statusLine + JSON.stringify(data, null, 2);

        if (response.ok) {
            output.style.color = "#4ade80"; // Green
        } else {
            output.style.color = "#f87171"; // Red
        }

    } catch (err) {
        console.error("Network Error:", err);
        output.textContent = "Network Error: " + err.message;
        output.style.color = "#f87171";
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Request';
        btn.disabled = false;
    }
}