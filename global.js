// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://fyriapqeztevzkcaaiqw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cmlhcHFlenRldnprY2FhaXF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5OTgyNTcsImV4cCI6MjA3OTU3NDI1N30.Re3EZ2VXE6Z7qWhVlxV6yqqIWB8wj1b1wURNLZXpddY'; 

// FIX: Use 'var' instead of 'const' to prevent crashes if this file is loaded twice
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 2. AUTH FUNCTIONS ---

async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

async function logout() {
    await supabase.auth.signOut();
    const isSubdirectory = window.location.pathname.includes('/queue-manager/');
    window.location.href = isSubdirectory ? '../index.html' : 'index.html';
}

async function sendResetLink(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html',
    });
    if (error) throw error;
}

// --- 3. SESSION & ROLE CHECKER ---

async function checkSessionAndRenderLayout() {
    const { data: { session } } = await supabase.auth.getSession();
    const isSubdirectory = window.location.pathname.includes('/queue-manager/');
    
    // 1. Check Session
    if (!session) {
        window.location.href = isSubdirectory ? '../index.html' : 'index.html';
        return;
    }

    // 2. Get User Profile (Using admin_profiles table)
    const { data: profile } = await supabase
        .from('admin_profiles')
        .select('role, permissions, full_name')
        .eq('supabase_uid', session.user.id)
        .single();

    if (!profile) {
        alert("Access Denied: User profile not found.");
        await logout();
        return;
    }

    // 3. Security Check: Queue Access
    if (isSubdirectory && !profile.permissions?.access_queue) {
        alert("Access Denied: You do not have Queue Manager permissions.");
        window.location.href = '../dashboard.html';
        return;
    }

    renderLayout(session.user.email, profile);
}

// --- 4. DYNAMIC LAYOUT GENERATOR ---

function renderLayout(email, profile) {
    const layoutContainer = document.querySelector('.admin-layout');
    const mainContent = document.querySelector('.main-content');
    
    // Ensure we have the containers before trying to inject
    if (!layoutContainer || !mainContent) return;

    // A. Detect Location for Relative Paths
    const isSubdirectory = window.location.pathname.includes('/queue-manager/');
    const rootPrefix = isSubdirectory ? '../' : ''; 
    const queuePrefix = isSubdirectory ? '' : 'queue-manager/';

    // B. Define Menu Items
    const menuItems = [
        { 
            name: isSubdirectory ? '« Back to Main' : 'Admissions Dash', 
            link: rootPrefix + 'dashboard.html', 
            icon: 'fa-university', 
            permission: 'access_root' 
        },
        { 
            name: 'SMS Logs', 
            link: rootPrefix + 'sms-logs.html', 
            icon: 'fa-clipboard-list', 
            permission: 'access_root' 
        },
        { 
            name: 'SMS Templates', 
            link: rootPrefix + 'sms-templates.html', 
            icon: 'fa-cog', 
            roleReq: 'SUPER_ADMIN' 
        },
        { 
            name: 'Queue Manager', 
            link: queuePrefix + 'dashboard.html', 
            icon: 'fa-users-line', 
            permission: 'access_queue' 
        },
        { 
            name: 'QMS SMS Settings', 
            link: queuePrefix + 'sms-settings.html', 
            icon: 'fa-comment-sms', 
            roleReq: 'SUPER_ADMIN' 
        }
    ];

    // C. Build Sidebar HTML
    let navLinksHtml = menuItems
        .filter(item => {
            if (item.roleReq && profile.role !== item.roleReq) return false;
            if (item.permission && !profile.permissions?.[item.permission]) return false;
            return true;
        })
        .map(item => {
            // Robust Active Check: Compares the filename (e.g., 'dashboard.html')
            const currentFile = window.location.pathname.split('/').pop() || 'index.html';
            const linkFile = item.link.split('/').pop();
            const isActive = currentFile === linkFile ? 'active' : '';
            
            return `<a href="${item.link}" class="nav-item ${isActive}">
                        <i class="fas ${item.icon}"></i> ${item.name}
                    </a>`;
        }).join('');

    // D. Build Sidebar HTML
    const sidebarHtml = `
        <div class="sidebar-overlay" onclick="toggleSidebar()"></div>
        <div class="sidebar" id="appSidebar">
            <div class="sidebar-header">
                ${isSubdirectory ? 'Queue Portal' : 'Admissions Portal'}
                <span onclick="toggleSidebar()" class="mobile-only-close">
                    <i class="fas fa-times"></i>
                </span>
            </div>
            <div class="nav-links">
                ${navLinksHtml}
            </div>
        </div>
    `;

    // E. Build Header HTML
    const headerHtml = `
        <header class="top-bar">
            <div class="top-bar-left">
                <button class="mobile-menu-btn" onclick="toggleSidebar()">
                    <i class="fas fa-bars"></i>
                </button>
                <h3>${isSubdirectory ? 'Queue Management' : 'Admin Panel'}</h3>
            </div>
            <div class="top-bar-right">
                <span class="role-badge">${profile.role}</span>
                <span class="user-email-display" style="font-size:0.9rem;">${email}</span>
                <button onclick="logout()" class="btn-logout">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </header>
    `;

    // F. Inject into DOM (ORIGINAL METHOD - NO WRAPPERS)
    // Clear previous injections to prevent duplicates
    const existingSidebar = document.getElementById('appSidebar');
    if(existingSidebar) existingSidebar.remove();
    const existingOverlay = document.querySelector('.sidebar-overlay');
    if(existingOverlay) existingOverlay.remove();
    const existingHeader = document.querySelector('.top-bar');
    if(existingHeader) existingHeader.remove();

    // Clean injection using insertAdjacentHTML
    layoutContainer.insertAdjacentHTML('afterbegin', sidebarHtml);
    mainContent.insertAdjacentHTML('afterbegin', headerHtml);
    
    // G. Initialize Mobile Listeners
    setupMobileNavigation();
}

// --- 5. UI UTILITIES ---

// Toggle sidebar open/close
window.toggleSidebar = function() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
};

function setupMobileNavigation() {
    // Only apply on mobile devices
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    if (isMobile) {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                // Close sidebar after a short delay
                setTimeout(() => {
                    window.toggleSidebar();
                }, 150);
            });
        });
    }
}

// --- 6. RESPONSIVE HANDLER ---
let resizeTimer;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        const isDesktop = window.matchMedia('(min-width: 769px)').matches;
        
        // Auto-close sidebar when resizing to desktop
        if (isDesktop && sidebar && overlay) {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        }
    }, 250);
});