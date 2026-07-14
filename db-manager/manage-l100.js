document.addEventListener('DOMContentLoaded', () => {
    initYearDropdowns();
    loadOnboardingData();
});

// 1. UI SETUP
function initYearDropdowns() {
    const currentYear = new Date().getFullYear();
    const selects = ['admYear', 'promoYear'];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        for (let y = currentYear - 1; y <= currentYear + 5; y++) {
            const opt = new Option(y, y);
            if (y === currentYear) opt.selected = true;
            el.add(opt);
        }
    });

    const monthHtml = months.map(m => `<option value="${m}" ${m === 'August' ? 'selected' : ''}>${m}</option>`).join('');
    document.getElementById('admMonth').innerHTML = monthHtml;
    document.getElementById('promoMonth').innerHTML = monthHtml;
}

window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(tabId).classList.add('active');

    if (tabId === 'promotion') loadPromotionStats();
}

window.toggleSelectAll = function (listId, isChecked) {
    document.querySelectorAll(`#${listId} input[type="checkbox"]`).forEach(cb => cb.checked = isChecked);
}

// 2. ONBOARDING (SYNC) LOGIC
async function loadOnboardingData() {
    const list = document.getElementById('onboardList');
    list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Checking readiness and master records...</td></tr>';

    try {
        // 1. Fetch ALL existing Student IDs from Master DB (The Exhaustive Check)
        const masterRecords = await fetchAllRecords('student_master_db', 'student_id');
        const masterIds = new Set(masterRecords.map(m => m.student_id.trim().toUpperCase()));

        // 2. Fetch Admitted Students who are FULLY READY (ID + Credentials)
        // We use .not('column', 'is', null) to ensure they are NOT null
        const { data: admitted, error: admittedErr } = await supabase
            .from('newstudents')
            .select('student_id, first_name, middle_name, last_name, program_applying_for, phone_number, email, school_selected, portal_username, portal_password')
            .not('student_id', 'is', null)
            .not('portal_username', 'is', null)
            .not('portal_password', 'is', null);

        if (admittedErr) throw admittedErr;

        // 3. Differential Filter: 
        // Must be READY (already filtered by query) AND NOT already in Master
        const pending = admitted.filter(a => !masterIds.has(a.student_id.trim().toUpperCase()));

        if (pending.length === 0) {
            list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#64748b;">✅ No new fully-prepared students found to onboard.</td></tr>';
            return;
        }

        // 4. Render the table
        list.innerHTML = pending.map(stu => `
            <tr>
                <td><input type="checkbox" class="onboard-cb" value='${JSON.stringify(stu).replace(/'/g, "&apos;")}'></td>
                <td style="font-family:monospace; font-weight:600;">${stu.student_id}</td>
                <td>${stu.first_name} ${stu.last_name}</td>
                <td>${stu.program_applying_for || 'N/A'}</td>
                <td><span class="badge-level">${stu.school_selected || 'N/A'}</span></td>
            </tr>
        `).join('');

    } catch (err) {
        console.error("Onboarding Load Error:", err);
        list.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center; padding:20px;">Error: ${err.message}</td></tr>`;
    }
}

window.runOnboardingSync = async function () {
    const cbs = document.querySelectorAll('.onboard-cb:checked');
    if (cbs.length === 0) return alert("Select students first.");

    const month = document.getElementById('admMonth').value;
    const year = document.getElementById('admYear').value;
    const session = `${month} ${year}`;
    const btn = document.getElementById('btnOnboard');

    if (!confirm(`Sync ${cbs.length} students to Master for ${session}?`)) return;

    btn.disabled = true;
    btn.textContent = "Processing...";

    const payload = Array.from(cbs).map(cb => {
        const s = JSON.parse(cb.value);
        return {
            student_id: s.student_id.trim().toUpperCase(),
            first_name: s.first_name,
            middle_name: s.middle_name,
            surname: s.last_name,
            email: s.email,
            phone_number_1: s.phone_number,
            program: s.program_applying_for,
            pathway: s.school_selected,
            level: '100',
            admission_year: session,
            current_academic_year: session
        };
    });

    const { error } = await supabase.from('student_master_db').upsert(payload, { onConflict: 'student_id' });
    if (error) alert(error.message);
    else {
        alert("Sync Complete.");
        loadOnboardingData();
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync"></i> Sync Selected students';
}

// 3. PROMOTION LOGIC
async function loadPromotionStats() {
    const { data: latest } = await supabase.from('student_master_db')
        .select('current_academic_year').not('current_academic_year', 'is', null)
        .order('updated_at', { ascending: false }).limit(1);

    document.getElementById('lastTriggeredLabel').textContent = `Last Promotion Session: ${latest?.[0]?.current_academic_year || 'Never'}`;

    const { data: stats } = await supabase.from('student_master_db').select('level');
    const active = stats.filter(s => !['Graduated', 'Paused', 'Suspended'].includes(s.level));
    const levels = active.reduce((acc, s) => { acc[s.level] = (acc[s.level] || 0) + 1; return acc; }, {});

    document.getElementById('promoPreviewStats').innerHTML = `
        <div class="stat-card"><label>Active Students</label><span>${active.length}</span></div>
        <div class="stat-card"><label>Level 100</label><span>${levels['100'] || 0}</span></div>
        <div class="stat-card"><label>Level 200</label><span>${levels['200'] || 0}</span></div>
        <div class="stat-card"><label>Level 300+</label><span>${(levels['300'] || 0) + (levels['400'] || 0)}</span></div>
    `;
}

window.runGlobalPromotion = async function () {
    const session = `${document.getElementById('promoMonth').value} ${document.getElementById('promoYear').value}`;
    if (!confirm(`Trigger mass promotion for ${session}? This affects ALL active students.`)) return;

    const btn = document.getElementById('btnPromote');
    btn.disabled = true;

    const { data: students, error } = await supabase.from('student_master_db').select('id, level, pathway')
        .not('level', 'in', '("Graduated", "Paused", "Suspended")');

    if (error) { alert(error.message); btn.disabled = false; return; }

    const updates = students.map(s => {
        let nextL = s.level;
        const p = (s.pathway || '').toUpperCase();
        if (p.includes('ICC')) {
            if (s.level === '100') nextL = '200';
            else if (s.level === '200') nextL = 'Graduated';
        } else if (p.includes('TVET')) {
            if (s.level === '100') nextL = '200';
            else if (s.level === '200') nextL = '300';
            else if (s.level === '300') nextL = '400';
            else if (s.level === '400') nextL = 'Graduated';
        }
        return { id: s.id, level: nextL, current_academic_year: session };
    });

    const { error: upErr } = await supabase.from('student_master_db').upsert(updates);
    if (upErr) alert(upErr.message);
    else {
        alert(`Successfully promoted ${updates.length} students to ${session}.`);
        loadPromotionStats();
    }
    btn.disabled = false;
}

// Helper: Fetch ALL records from a table (bypassing 1000 row limit)
async function fetchAllRecords(tableName, columns) {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select(columns)
            .range(from, from + step - 1);

        if (error) throw error;

        allData = allData.concat(data);
        if (data.length < step) {
            hasMore = false;
        } else {
            from += step;
        }
    }
    return allData;
}