// api-manager/banks.js

document.addEventListener('DOMContentLoaded', () => {
    loadBanks();
});

// 1. Fetch Banks
async function loadBanks() {
    const tbody = document.getElementById('banksBody');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('bank_api_keys')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red;">Error: ${error.message}</td></tr>`;
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No banks onboarded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(bank => {
        const statusBadge = bank.is_active
            ? '<span class="status-badge status-sent">Active</span>'
            : '<span class="status-badge status-failed">Revoked</span>';

        const expiry = new Date(bank.expires_at).toLocaleDateString();

        return `
            <tr>
                <td style="font-weight:600;">${bank.bank_name}</td>
                <td style="font-family:monospace; color:#64748b;">${bank.api_key_prefix}...</td>
                <td>${statusBadge}</td>
                <td>0</td> 
                <td>${expiry}</td>
                <td>
                    <button onclick="revokeBank('${bank.id}')" class="btn-icon" title="Revoke Access" style="color:#ef4444; border-color:#fee2e2;">
                        <i class="fas fa-ban"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 2. Generate Secure Key
function generateSecureKey() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    const hexString = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return `sk_live_${hexString}`;
}

// 3. Dynamic Modal Injection (Self-Healing UI)
function ensureModalsExist() {
    if (document.getElementById('addModal')) return;

    // We add z-index: 9999 to force it above everything
    const modalsHTML = `
    <!-- 1. Add Bank Modal -->
    <div id="addModal" class="sidebar-overlay" style="z-index: 9999;">
        <div class="auth-card modal-card-default">
            <h2 style="text-align:left;">Onboard New Bank</h2>
            <form id="addBankForm" onsubmit="handleBankSubmit(event)">
                <div class="form-group">
                    <label>Bank Name</label>
                    <input type="text" id="bName" required placeholder="e.g. Ghana Commercial Bank">
                </div>
                <div class="form-group">
                    <label>Contact Email</label>
                    <input type="email" id="bEmail" required placeholder="dev@gcb.com">
                </div>
                <div class="form-group">
                    <label>Contact Phone</label>
                    <input type="tel" id="bPhone" required placeholder="024xxxxxxx">
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button type="button" class="btn-retry" onclick="closeModals()">Cancel</button>
                    <button type="submit" class="btn-primary">Generate Key</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 2. Key Reveal Modal -->
    <div id="keyModal" class="sidebar-overlay" style="z-index: 9999;">
        <div class="auth-card modal-card-success">
            <h2 class="text-success"><i class="fas fa-check-circle"></i> Bank Created</h2>
            <p style="color:#64748b; margin-bottom:20px;">
                Please copy this API Key immediately. It will <strong>never</strong> be shown again.
            </p>
            
            <div class="key-reveal-card">
                <div style="font-size:0.8rem; text-transform:uppercase; font-weight:bold; color:#15803d;">API Key</div>
                <div id="newKeyDisplay" class="api-key-display">...</div>
                <button onclick="copyKey()" class="btn-retry" style="font-size:0.8rem;">
                    <i class="fas fa-copy"></i> Copy to Clipboard
                </button>
            </div>

            <div style="text-align:right;">
                <button class="btn-primary" onclick="window.location.reload()" style="width:auto;">I have copied it</button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalsHTML);
}

// 4. Form Logic
async function handleBankSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = 'Processing...';
    btn.disabled = true;

    const name = document.getElementById('bName').value;
    const email = document.getElementById('bEmail').value;
    const phone = document.getElementById('bPhone').value;

    const fullKey = generateSecureKey();
    const prefix = fullKey.substring(0, 12);

    const { data, error } = await supabase.rpc('create_bank', {
        p_name: name,
        p_email: email,
        p_phone: phone,
        p_key_prefix: prefix,
        p_raw_key: fullKey
    });

    if (error || (data && !data.success)) {
        alert("Failed: " + (error?.message || data?.error));
        btn.innerHTML = 'Generate Key';
        btn.disabled = false;
    } else {
        // FIX: Don't use closeModals() here because it kills the next modal too.
        // Manually hide the Form Modal immediately.
        const addModal = document.getElementById('addModal');
        addModal.classList.remove('open');
        addModal.style.display = 'none';

        // Show Success
        showKeyModal(fullKey);

        // Reset form for next time
        document.getElementById('addBankForm').reset();
        btn.innerHTML = 'Generate Key';
        btn.disabled = false;

        // Reload list in background
        loadBanks();
    }
}

// 5. UI Helpers (THE FIX)
function openAddModal() {
    ensureModalsExist();
    const modal = document.getElementById('addModal');

    // FIX: Set Display AND Class for Opacity
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';

    // Small timeout to allow CSS transition to catch the display change
    setTimeout(() => {
        modal.classList.add('open');
        modal.style.opacity = '1'; // Force it visible
    }, 10);
}

function closeModals() {
    // Hide both modals
    ['addModal', 'keyModal'].forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('open');
            modal.style.opacity = '0';
            // Only set display:none if it's currently visible to avoid overriding logic
            if (modal.style.display !== 'none') {
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 300);
            }
        }
    });
}

function showKeyModal(key) {
    ensureModalsExist();
    const modal = document.getElementById('keyModal');
    document.getElementById('newKeyDisplay').textContent = key;

    // FIX: Visibility logic
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';

    setTimeout(() => {
        modal.classList.add('open');
        modal.style.opacity = '1';
    }, 10);
}

function copyKey() {
    const key = document.getElementById('newKeyDisplay').textContent;
    navigator.clipboard.writeText(key);
    alert("Key copied!");
}

async function revokeBank(id) {
    if (!confirm("Are you sure? This will immediately block all API requests from this bank.")) return;

    const { error } = await supabase
        .from('bank_api_keys')
        .update({ is_active: false })
        .eq('id', id);

    if (error) alert(error.message);
    else loadBanks();
}

// Export for HTML
window.openAddModal = openAddModal;
window.closeModals = closeModals;
window.handleBankSubmit = handleBankSubmit;
window.copyKey = copyKey;
window.revokeBank = revokeBank;