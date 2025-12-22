// queue-manager/sms-settings.js

document.addEventListener('DOMContentLoaded', () => {
    // RBAC Check is handled loosely by global.js, but we enforce strict Super Admin here
    enforceSuperAdmin();
    loadGlobalSetting();
    loadTemplates();
});

// 1. Strict Security Check
async function enforceSuperAdmin() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // global.js handles this

    const { data: profile } = await supabase
        .from('admin_profiles')
        .select('role')
        .eq('supabase_uid', session.user.id)
        .single();

    if (profile.role !== 'SUPER_ADMIN') {
        alert("Access Denied: Restricted to Super Admins.");
        window.location.href = 'dashboard.html';
    }
}

// 2. Load Global Switch
async function loadGlobalSetting() {
    const { data, error } = await supabase
        .from('system_settings_admin')
        .select('setting_value')
        .eq('setting_key', 'GLOBAL_SMS_ENABLED')
        .single();

    if (data) {
        // setting_value is JSONB, but simple boolean in DB is returned as boolean in JS
        document.getElementById('globalMasterSwitch').checked = data.setting_value === true;
    }
}

// 3. Toggle Global Switch
async function toggleGlobalSMS(isChecked) {
    const { error } = await supabase
        .from('system_settings_admin')
        .upsert({ 
            setting_key: 'GLOBAL_SMS_ENABLED', 
            setting_value: isChecked, // Supabase handles boolean -> jsonb
            category: 'QUEUE_MANAGER',
            description: 'Master switch for all SMS notifications'
        });

    if (error) {
        alert("Error saving setting: " + error.message);
        // Revert toggle visually if failed
        document.getElementById('globalMasterSwitch').checked = !isChecked;
    } else {
        // Optional: Toast notification
        console.log("Global SMS set to: " + isChecked);
    }
}

// 4. Load Templates
async function loadTemplates() {
    const container = document.getElementById('templatesGrid');
    
    const { data, error } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('category', 'QUEUE_MANAGER')
        .order('created_at', { ascending: true });

    if (error) {
        container.innerHTML = `<p style="color:red">Error: ${error.message}</p>`;
        return;
    }

    if (data.length === 0) {
        container.innerHTML = `<p>No templates found for Queue Manager.</p>`;
        return;
    }

    container.innerHTML = data.map(t => renderTemplateCard(t)).join('');
}

function renderTemplateCard(t) {
    return `
        <div class="template-card queue-card" style="cursor:default;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <h3 style="font-size:1.1rem;">${t.template_name}</h3>
                <span class="role-badge">${t.template_slug}</span>
            </div>
            
            <div style="margin-bottom:10px; font-size:0.8rem; color:#64748b;">
                Variables: <span class="var-badge">{name}</span> <span class="var-badge">{pos}</span> <span class="var-badge">{queue}</span> <span class="var-badge">{link}</span>
            </div>

            <textarea id="msg-${t.id}" class="template-editor" style="min-height:80px;">${t.message_content}</textarea>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
                <label class="status-toggle">
                    <input type="checkbox" id="active-${t.id}" ${t.is_active ? 'checked' : ''}> Enable
                </label>
                <button onclick="saveTemplate('${t.id}')" class="btn-primary" style="width:auto; padding:6px 15px; font-size:0.9rem;">
                    Save
                </button>
            </div>
        </div>
    `;
}

// 5. Save Template
async function saveTemplate(id) {
    const content = document.getElementById(`msg-${id}`).value;
    const isActive = document.getElementById(`active-${id}`).checked;
    
    // UI Feedback
    const btn = document.querySelector(`#msg-${id}`).parentNode.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;

    const { error } = await supabase
        .from('sms_templates')
        .update({ 
            message_content: content, 
            is_active: isActive,
            updated_at: new Date()
        })
        .eq('id', id);

    btn.disabled = false;
    if (error) {
        alert("Failed to save: " + error.message);
        btn.textContent = originalText;
    } else {
        btn.textContent = "Saved!";
        setTimeout(() => btn.textContent = originalText, 1500);
    }
}
// Make functions global for HTML onclick access
window.saveTemplate = saveTemplate;
window.toggleGlobalSMS = toggleGlobalSMS;