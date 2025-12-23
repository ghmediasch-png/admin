// api-manager/settings.js

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});

// 1. Configuration Map (Maps DB Keys to UI Labels)
const configSchema = [
    {
        key: 'maintenance_mode',
        label: 'Maintenance Mode',
        description: 'If enabled, ALL API requests will be rejected with 503 Service Unavailable.',
        type: 'boolean',
        danger: true
    },
    {
        key: 'enable_request_signing',
        label: 'Enforce Request Signing (HMAC)',
        description: 'Require banks to sign requests using their secret key.',
        type: 'boolean'
    },
    {
        key: 'global_rate_limit_per_minute',
        label: 'Global Rate Limit (Per Minute)',
        description: 'Maximum total requests allowed per minute across ALL banks.',
        type: 'number'
    },
    {
        key: 'alert_phone_primary',
        label: 'Primary Admin Alert Phone',
        description: 'This number receives critical system SMS alerts.',
        type: 'string'
    }
];

// 2. Load Settings (Debug Version)
async function loadSettings() {
    const container = document.getElementById('settingsContainer');

    // Fetch Data
    const { data, error } = await supabase
        .from('system_config')
        .select('*');

    if (error) {
        console.error("Load Error:", error);
        container.innerHTML = `<div class="setting-card" style="color:#ef4444;">Error loading settings: ${error.message}</div>`;
        return;
    }

    console.log("DB Config Data:", data); // <--- DEBUG 1

    // Convert array to object
    const currentValues = {};
    data.forEach(item => {
        // Handle potentially different formats (JSON boolean vs String "true")
        let cleanValue = item.value;
        if (typeof cleanValue === 'string') {
            // Remove quotes if they exist (sometimes JSONB returns '"true"')
            cleanValue = cleanValue.replace(/^"|"$/g, '');
        }
        currentValues[item.key] = cleanValue;
    });

    console.log("Processed Values:", currentValues); // <--- DEBUG 2

    // Render Form
    container.innerHTML = configSchema.map(field => {
        const rawValue = currentValues[field.key];
        const isBool = field.type === 'boolean';

        // Robust Boolean Check: Handle true (bool), "true" (string), "TRUE" (string)
        const isChecked = String(rawValue).toLowerCase() === 'true';
        const displayValue = rawValue !== undefined ? rawValue : '';

        let controlHtml = '';

        if (isBool) {
            const dangerClass = field.danger ? 'danger-toggle' : '';
            controlHtml = `
                <label class="toggle-switch">
                    <input type="checkbox" id="${field.key}" ${isChecked ? 'checked' : ''} class="${dangerClass}">
                    <span class="slider"></span>
                </label>
            `;
        } else {
            controlHtml = `
                <input type="text" id="${field.key}" value="${displayValue}" class="setting-input" placeholder="Enter value...">
            `;
        }

        const labelClass = field.danger ? 'setting-label danger' : 'setting-label';

        if (isBool) {
            return `
                <div class="setting-card">
                    <div class="setting-header">
                        <div class="setting-info">
                            <span class="${labelClass}">${field.label}</span>
                            <p class="setting-desc">${field.description}</p>
                        </div>
                        ${controlHtml}
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="setting-card">
                    <div class="setting-info" style="margin-bottom:10px;">
                        <span class="${labelClass}">${field.label}</span>
                        <p class="setting-desc">${field.description}</p>
                    </div>
                    ${controlHtml}
                </div>
            `;
        }
    }).join('');
}

// 3. Save Settings
async function saveSettings() {
    const btn = document.querySelector('button[onclick="saveSettings()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    const updates = configSchema.map(field => {
        let val;
        if (field.type === 'boolean') {
            val = document.getElementById(field.key).checked ? 'true' : 'false';
        } else {
            val = document.getElementById(field.key).value;
        }

        return {
            key: field.key,
            value: val,
            value_type: field.type,
            updated_at: new Date()
        };
    });

    const { error } = await supabase
        .from('system_config')
        .upsert(updates);

    if (error) {
        alert("Error saving: " + error.message);
        btn.innerHTML = originalText;
    } else {
        btn.innerHTML = '<i class="fas fa-check"></i> Saved';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 1500);
    }
}

window.saveSettings = saveSettings;