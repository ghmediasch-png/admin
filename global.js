// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://fyriapqeztevzkcaaiqw.supabase.co'; // <--- REPLACE THIS
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cmlhcHFlenRldnprY2FhaXF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5OTgyNTcsImV4cCI6MjA3OTU3NDI1N30.Re3EZ2VXE6Z7qWhVlxV6yqqIWB8wj1b1wURNLZXpddY'; // <--- REPLACE THIS
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 2. AUTH FUNCTIONS ---

async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

async function sendResetLink(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html',
    });
    if (error) throw error;
}

// --- 3. SESSION & ROLE CHECKER ---

// Run this on every Admin Page
async function checkSessionAndRenderLayout() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Get User Role from DB
    const { data: roleData } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

    if (!roleData) {
        alert("Access Denied: You are not an Admin.");
        await logout();
        return;
    }

    // Render the Sidebar & Header
    renderLayout(session.user.email, roleData.role);
}

// --- 4. DYNAMIC LAYOUT GENERATOR ---

function renderLayout(email, role) {
    const layoutContainer = document.querySelector('.admin-layout');
    if (!layoutContainer) return;

    // A. Define Menu Items with Font Awesome icons
    const menuItems = [
        { name: 'Dashboard', link: 'dashboard.html', icon: 'fa-home', roles: ['admin', 'superadmin'] },
        { name: 'SMS Logs', link: 'sms-logs.html', icon: 'fa-clipboard-list', roles: ['admin', 'superadmin'] },
        { name: 'SMS Templates', link: 'sms-templates.html', icon: 'fa-cog', roles: ['superadmin'] }
    ];

    // B. Build Sidebar HTML
    let navLinksHtml = menuItems
        .filter(item => item.roles.includes(role))
        .map(item => {
            const isActive = window.location.pathname.includes(item.link) ? 'active' : '';
            return `<a href="${item.link}" class="nav-item ${isActive}">
                        <i class="fas ${item.icon}"></i> ${item.name}
                    </a>`;
        }).join('');

    const sidebarHtml = `
        <div class="sidebar-overlay" onclick="closeSidebar()"></div>
        <div class="sidebar" id="appSidebar">
            <div class="sidebar-header">
                Admissions Portal
                <span onclick="closeSidebar()" class="mobile-only-close">
                    <i class="fas fa-times"></i>
                </span>
            </div>
            <div class="nav-links">${navLinksHtml}</div>
        </div>
    `;

    // C. Build Header HTML
    const headerHtml = `
        <header class="top-bar">
            <div class="top-bar-left">
                <button class="mobile-menu-btn" onclick="toggleSidebar()">
                    <i class="fas fa-bars"></i>
                </button>
                <h3>Admin Panel</h3>
            </div>
            <div class="top-bar-right">
                <span class="role-badge">${role}</span>
                <span class="user-email-display" style="font-size:0.9rem;">${email}</span>
                <button onclick="logout()" class="btn-logout">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </header>
    `;

    // D. Inject into DOM
    const mainContent = document.querySelector('.main-content');
    
    // Clear previous injections to prevent duplicates
    const existingSidebar = document.getElementById('appSidebar');
    if(existingSidebar) existingSidebar.remove();
    const existingOverlay = document.querySelector('.sidebar-overlay');
    if(existingOverlay) existingOverlay.remove();
    const existingHeader = document.querySelector('.top-bar');
    if(existingHeader) existingHeader.remove();

    layoutContainer.insertAdjacentHTML('afterbegin', sidebarHtml);
    mainContent.insertAdjacentHTML('afterbegin', headerHtml);
    
    // E. Setup navigation listeners for mobile auto-close
    setupMobileNavigation();
}

// --- 5. UI UTILITIES (Mobile Menu) ---

// Toggle sidebar open/close
window.toggleSidebar = function() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
};

// Close sidebar (for overlay and close button)
window.closeSidebar = function() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
};

// Setup mobile navigation auto-close
function setupMobileNavigation() {
    // Only apply on mobile devices
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    if (isMobile) {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', function(e) {
                // Close sidebar after a short delay to allow navigation
                setTimeout(() => {
                    window.closeSidebar();
                }, 150);
            });
        });
    }
}

// --- 6. RESPONSIVE HANDLER ---

// Re-check mobile state on window resize
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