// db-manager/students.js

// 1. Initialize List Controller
window.activeListController = new ListController({
    tableId: 'studentTable',
    toolbarId: 'studentToolbar',
    paginationId: 'studentPagination',
    fetchData: fetchStudents,
    renderRow: renderStudentRow
});

// 2. Fetch Data
async function fetchStudents({ from, to, search }) {
    let query = supabase
        .from('student_master_db')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (search) {
        query = query.or(`student_id.ilike.%${search}%,first_name.ilike.%${search}%,surname.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    return { data, count, error };
}

// 3. Render Row
function renderStudentRow(stu) {
    const fullName = [stu.first_name, stu.middle_name, stu.surname].filter(Boolean).join(' ');
    const contact = [stu.phone_number_1, stu.email].filter(Boolean).join('<br>');
    // Added Pathway to the display
    const academic = [stu.school, stu.program, stu.pathway, stu.level].filter(Boolean).join(' • ');

    // Safe JSON for onclick
    const safeData = JSON.stringify(stu).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    return `
        <tr>
            <td style="font-family:monospace; font-weight:600;">${stu.student_id}</td>
            <td>${fullName}</td>
            <td style="font-size:0.85rem; color:#64748b;">${contact}</td>
            <td><span class="badge-level">${academic || 'N/A'}</span></td>
            <td>
                <button onclick='openStudentModal(${safeData})' class="btn-icon" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteStudent('${stu.id}', '${stu.student_id}')" class="btn-icon" style="color:#ef4444;" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
}

// 4. Modal Logic
const modal = document.getElementById('studentModal');
const form = document.getElementById('studentForm');

window.openStudentModal = function(student = null) {
    if (!modal) {
        console.error("Critical: Modal element 'studentModal' not found.");
        return;
    }

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);

    const titleEl = document.getElementById('modalTitle');
    const recordIdEl = document.getElementById('recordId');
    const stuIdEl = document.getElementById('stuId');

    if (student) {
        // --- EDIT MODE ---
        if (titleEl) titleEl.textContent = "Edit Student";
        if (recordIdEl) recordIdEl.value = student.id;
        
        if (stuIdEl) {
            stuIdEl.value = student.student_id;
            stuIdEl.readOnly = true;
            stuIdEl.style.background = "#f1f5f9";
        }

        setVal('stuFirst', student.first_name);
        setVal('stuMid', student.middle_name);
        setVal('stuSur', student.surname);
        setVal('stuEmail', student.email);
        setVal('stuPhone1', student.phone_number_1);
        setVal('stuPhone2', student.phone_number_2);
        setVal('stuSchool', student.school);
        setVal('stuProgram', student.program);
        setVal('stuPathway', student.pathway); // <--- NEW

    } else {
        // --- CREATE MODE ---
        if (titleEl) titleEl.textContent = "Add Student";
        if (form) form.reset();
        if (recordIdEl) recordIdEl.value = '';
        
        if (stuIdEl) {
            stuIdEl.readOnly = false;
            stuIdEl.style.background = "white";
        }
    }
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

window.closeModals = function() {
    document.querySelectorAll('.sidebar-overlay').forEach(m => {
        m.classList.remove('open');
        setTimeout(() => m.style.display = 'none', 300);
    });
}

// 5. Save Logic
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Saving...';
        btn.disabled = true;

        const recordIdEl = document.getElementById('recordId');
        const id = recordIdEl ? recordIdEl.value : null;

        const payload = {
            student_id: getVal('stuId').trim().toUpperCase(),
            first_name: getVal('stuFirst').trim(),
            middle_name: getVal('stuMid').trim(),
            surname: getVal('stuSur').trim(),
            email: getVal('stuEmail').trim(),
            phone_number_1: getVal('stuPhone1').trim(),
            phone_number_2: getVal('stuPhone2').trim(),
            school: getVal('stuSchool').trim(),
            program: getVal('stuProgram').trim(),
            pathway: getVal('stuPathway').trim() // <--- NEW
        };

        let error;
        if (id) {
            const res = await supabase.from('student_master_db').update(payload).eq('id', id);
            error = res.error;
        } else {
            const res = await supabase.from('student_master_db').insert(payload);
            error = res.error;
        }

        if (error) {
            alert("Error: " + error.message);
        } else {
            closeModals();
            window.activeListController.loadData();
        }
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

// 6. Delete Logic
window.deleteStudent = async function(id, studentId) {
    if (!confirm(`⚠️ WARNING: Deleting ${studentId} will permanently remove it and all related history.\n\nAre you sure?`)) return;
    
    const { error } = await supabase.from('student_master_db').delete().eq('id', id);
    if (error) alert(error.message);
    else window.activeListController.loadData();
}

// 7. Bulk Upload Logic
let parsedData = [];

window.openBulkModal = function() {
    const m = document.getElementById('bulkModal');
    if(!m) return;
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('open'), 10);
    
    document.getElementById('csvInput').value = '';
    document.getElementById('btnUpload').disabled = true;
    document.getElementById('uploadStatus').textContent = '';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressContainer').style.display = 'none';
}

const csvInput = document.getElementById('csvInput');
if(csvInput) {
    csvInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                parsedData = results.data;
                document.getElementById('uploadStatus').textContent = `Ready to upload ${parsedData.length} records.`;
                document.getElementById('btnUpload').disabled = false;
            },
            error: function(err) {
                alert("CSV Error: " + err.message);
            }
        });
    });
}

window.processBulkUpload = async function() {
    const btn = document.getElementById('btnUpload');
    const status = document.getElementById('uploadStatus');
    const bar = document.getElementById('progressBar');
    
    btn.disabled = true;
    document.getElementById('progressContainer').style.display = 'block';
    
    const BATCH_SIZE = 50;
    const total = parsedData.length;
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = parsedData.slice(i, i + BATCH_SIZE);
        
        const dbPayload = chunk.map(row => ({
            student_id: (row.student_id || row['Student ID'] || '').trim().toUpperCase(),
            first_name: (row.first_name || row['First Name'] || '').trim(),
            middle_name: (row.middle_name || row['Middle Name'] || '').trim(),
            surname: (row.surname || row['Surname'] || '').trim(),
            email: (row.email || row.Email || '').trim(),
            phone_number_1: (row.phone_number_1 || row.Phone || '').trim(),
            school: (row.school || row.School || '').trim(),
            program: (row.program || row.Program || '').trim(),
            level: (row.level || row.Level || '').trim(),
            pathway: (row.pathway || row.Pathway || '').trim() // <--- NEW: Map from CSV
        })).filter(r => r.student_id && r.first_name && r.surname);

        if (dbPayload.length > 0) {
            const { error } = await supabase
                .from('student_master_db')
                .upsert(dbPayload, { onConflict: 'student_id' });

            if (error) {
                console.error(error);
                errors += dbPayload.length;
            }
        }

        processed += chunk.length;
        const pct = Math.min(100, Math.round((processed / total) * 100));
        bar.style.width = pct + '%';
        status.textContent = `Processing... ${processed}/${total}`;
    }

    status.textContent = `Completed! ${total} processed. ${errors} errors.`;
    window.activeListController.loadData();
    setTimeout(() => { closeModals(); }, 1500);
}

window.downloadTemplate = function() {
    // NEW: Added 'pathway' to headers
    const headers = "student_id,first_name,middle_name,surname,email,phone_number_1,phone_number_2,school,program,level,pathway";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "student_upload_template.csv";
    a.click();
}