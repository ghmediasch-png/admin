// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://fyriapqeztevzkcaaiqw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cmlhcHFlenRldnprY2FhaXF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5OTgyNTcsImV4cCI6MjA3OTU3NDI1N30.Re3EZ2VXE6Z7qWhVlxV6yqqIWB8wj1b1wURNLZXpddY'; 
// Use 'var' to prevent crashes if loaded twice
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 2. AUTH FUNCTIONS ---

async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

async function logout() {
    await supabase.auth.signOut();
    const isSubdirectory = window.location.pathname.includes('/queue-manager/') || window.location.pathname.includes('/api-manager/');
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
    const path = window.location.pathname;
    const isSubdirectory = path.includes('/queue-manager/') || path.includes('/api-manager/');

    // 1. Check Session
    if (!session) {
        window.location.href = isSubdirectory ? '../index.html' : 'index.html';
        return;
    }

    // 2. Get User Profile & Permissions
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

    // 3. Security Gatekeepers
    
    // A. Queue Manager Access
    if (path.includes('/queue-manager/') && !profile.permissions?.access_queue) {
        alert("Access Denied: No Queue permissions.");
        window.location.href = '../dashboard.html';
        return;
    }

    // B. API Manager Access
    if (path.includes('/api-manager/')) {
        // Strict Check: Must be SUPER_ADMIN OR have explicit 'access_api' permission
        const hasApiAccess = profile.role === 'SUPER_ADMIN' || profile.permissions?.access_api;
        if (!hasApiAccess) {
            alert("Access Denied: API Area is restricted.");
            window.location.href = '../dashboard.html';
            return;
        }
    }

    // 4. Render Layout
    renderLayout(session.user.email, profile);
}

// --- 4. DYNAMIC LAYOUT GENERATOR ---

function renderLayout(email, profile) {
    const layoutContainer = document.querySelector('.admin-layout');
    const mainContent = document.querySelector('.main-content');
    
    if (!layoutContainer || !mainContent) return;

    // A. Detect Location & Prefixes
    const path = window.location.pathname;
    const isQueueSub = path.includes('/queue-manager/');
    const isApiSub   = path.includes('/api-manager/');
    
    // rootPrefix: Used to go UP to root files (e.g. ../index.html)
    const rootPrefix = (isQueueSub || isApiSub) ? '../' : ''; 
    
    // Module Prefixes: Used to link to modules from Root
    const queuePrefix = 'queue-manager/';
    const apiPrefix   = 'api-manager/';

    // Determine Header Title
    let portalTitle = 'Admissions Portal';
    let moduleTitle = 'Admin Panel';
    
    if (isQueueSub) {
        portalTitle = 'Queue Portal';
        moduleTitle = 'Queue Management';
    } else if (isApiSub) {
        portalTitle = 'Developer Portal';
        moduleTitle = 'API Console';
    }

    // B. Define Menu Items (The Dynamic Part)
    let menuItems = [];

    if (isApiSub) {
        // --- API MANAGER MENU ---
        menuItems = [
            { name: '« Back to Main', link: '../dashboard.html', icon: 'fa-arrow-left', permission: 'access_root' },
            { name: 'Overview', link: 'dashboard.html', icon: 'fa-chart-line', permission: 'access_api' },
            { name: 'Banks & Keys', link: 'banks.html', icon: 'fa-university', permission: 'access_api' }, 
            { name: 'Access Logs', link: 'logs.html', icon: 'fa-list-alt', permission: 'access_api' }, 
            { name: 'Settings', link: 'settings.html', icon: 'fa-cogs', permission: 'access_api' },
            { name: 'Developer Portal', link: 'developer.html', icon: 'fa-book', permission: 'access_api' }
        ];
    } else if (isQueueSub) {
        // --- QUEUE MANAGER MENU ---
        menuItems = [
            { name: '« Back to Main', link: '../dashboard.html', icon: 'fa-arrow-left', permission: 'access_root' },
            { name: 'Dashboard', link: 'dashboard.html', icon: 'fa-chart-pie', permission: 'access_queue' },
            { name: 'SMS Logs', link: '../sms-logs.html', icon: 'fa-clipboard-list', permission: 'access_root' }, // Points to root
            { name: 'QMS Settings', link: 'sms-settings.html', icon: 'fa-comment-sms', roleReq: 'SUPER_ADMIN' }
        ];
    } else {
        // --- MAIN ROOT MENU ---
        menuItems = [
            { name: 'Admissions Dash', link: 'dashboard.html', icon: 'fa-university', permission: 'access_root' },
            { name: 'SMS Logs', link: 'sms-logs.html', icon: 'fa-clipboard-list', permission: 'access_root' },
            { name: 'SMS Templates', link: 'sms-templates.html', icon: 'fa-cog', roleReq: 'SUPER_ADMIN' },
            { name: 'Queue Manager', link: queuePrefix + 'dashboard.html', icon: 'fa-users-line', permission: 'access_queue' },
            { name: 'API Manager', link: apiPrefix + 'dashboard.html', icon: 'fa-server', permission: 'access_api' }
        ];
    }

    // C. Build Sidebar HTML
    let navLinksHtml = menuItems
        .filter(item => {
            if (item.roleReq && profile.role !== item.roleReq) return false;
            if (item.permission && !profile.permissions?.[item.permission]) return false;
            return true;
        })
        .map(item => {
            const currentFile = path.split('/').pop() || 'index.html';
            const linkFile = item.link.split('/').pop();
            // Active check: matches filename AND ensures we aren't confusing dashboard.html in different folders
            const isActive = currentFile === linkFile ? 'active' : '';
            
            return `<a href="${item.link}" class="nav-item ${isActive}">
                        <i class="fas ${item.icon}"></i> ${item.name}
                    </a>`;
        }).join('');

    // D. Sidebar HTML
    const sidebarHtml = `
        <div class="sidebar-overlay" onclick="toggleSidebar()"></div>
        <div class="sidebar" id="appSidebar">
            <div class="sidebar-header">
                ${portalTitle}
                <span onclick="toggleSidebar()" class="mobile-only-close">
                    <i class="fas fa-times"></i>
                </span>
            </div>
            <div class="nav-links">
                ${navLinksHtml}
            </div>
        </div>
    `;

    // E. Header HTML
    const headerHtml = `
        <header class="top-bar">
            <div class="top-bar-left">
                <button class="mobile-menu-btn" onclick="toggleSidebar()">
                    <i class="fas fa-bars"></i>
                </button>
                <h3>${moduleTitle}</h3>
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

    // F. Injection
    const existingSidebar = document.getElementById('appSidebar');
    if(existingSidebar) existingSidebar.remove();
    const existingOverlay = document.querySelector('.sidebar-overlay');
    if(existingOverlay) existingOverlay.remove();
    const existingHeader = document.querySelector('.top-bar');
    if(existingHeader) existingHeader.remove();

    layoutContainer.insertAdjacentHTML('afterbegin', sidebarHtml);
    mainContent.insertAdjacentHTML('afterbegin', headerHtml);
    
    // G. Listeners
    setupMobileNavigation();
}

// --- 5. UI UTILITIES ---

window.toggleSidebar = function() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
};

function setupMobileNavigation() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', function() {
                setTimeout(() => window.toggleSidebar(), 150);
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
        if (isDesktop && sidebar && overlay) {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        }
    }, 250);
});