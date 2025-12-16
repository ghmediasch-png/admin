class ListController {
    constructor(config) {
        this.pageSize = 10;
        this.currentPage = 1;
        this.totalItems = 0;
        
        // Configuration
        this.tableId = config.tableId; // The ID of the <table> 
        this.toolbarId = config.toolbarId; // Where to put Search/Date
        this.paginationId = config.paginationId; // Where to put Next/Prev
        this.fetchData = config.fetchData; // Function that queries Supabase
        this.renderRow = config.renderRow; // Function that returns HTML for a single row

        // State
        this.searchQuery = '';
        this.dateFilter = '';
        this.debounceTimer = null;

        // Initialize
        this.init();
    }

    init() {
        this.renderControls();
        this.loadData();
    }

    // 1. Draw the Search Bar and Date Picker
    renderControls() {
        const toolbar = document.getElementById(this.toolbarId);
        if(!toolbar) return;

        toolbar.className = 'list-toolbar';
        toolbar.innerHTML = `
            <div class="search-group">
                <i class="fas fa-search search-icon"></i>
                <input type="text" class="search-input" placeholder="Search name, phone, or reference..." 
                       onkeyup="window.activeListController.handleSearch(this.value)">
            </div>
            <div class="date-group">
                <input type="date" class="date-input" 
                       onchange="window.activeListController.handleDate(this.value)">
            </div>
        `;
    }

    // 2. Handle Inputs
    handleSearch(value) {
        // Debounce: Wait 500ms after typing stops before searching
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.searchQuery = value.trim();
            this.currentPage = 1; // Reset to page 1
            this.loadData();
        }, 500);
    }

    handleDate(value) {
        this.dateFilter = value;
        this.currentPage = 1;
        this.loadData();
    }

    handlePage(direction) {
        if (direction === 'next' && this.currentPage * this.pageSize < this.totalItems) {
            this.currentPage++;
        } else if (direction === 'prev' && this.currentPage > 1) {
            this.currentPage--;
        }
        this.loadData();
    }

    // 3. Core Data Loading Logic
    async loadData() {
        const tbody = document.querySelector(`#${this.tableId} tbody`);
        const paginationContainer = document.getElementById(this.paginationId);
        
        // Show Loading State
        if(tbody) tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading data...</td></tr>';
        if(paginationContainer) paginationContainer.innerHTML = '<span style="font-size:0.9rem; color:#64748b;"><i class="fas fa-sync fa-spin"></i> Updating...</span>';

        // Calculate Supabase Range (0-9, 10-19, etc)
        const from = (this.currentPage - 1) * this.pageSize;
        const to = from + this.pageSize - 1;

        // Call the specific page's fetch function
        const { data, count, error } = await this.fetchData({
            from, 
            to, 
            search: this.searchQuery, 
            date: this.dateFilter
        });

        if (error) {
            if(tbody) tbody.innerHTML = `<tr><td colspan="100%" style="color:red; text-align:center;"><i class="fas fa-exclamation-triangle"></i> Error: ${error.message}</td></tr>`;
            return;
        }

        this.totalItems = count || 0;

        // Render Rows
        if (this.totalItems === 0) {
            if(tbody) tbody.innerHTML = '<tr><td colspan="100%" style="text-align:center; padding: 20px;"><i class="fas fa-inbox"></i> No results found.</td></tr>';
        } else {
            if(tbody) tbody.innerHTML = data.map(item => this.renderRow(item)).join('');
        }

        this.renderPagination();
    }

    // 4. Draw Pagination Buttons
    renderPagination() {
        const container = document.getElementById(this.paginationId);
        if (!container) return;

        const totalPages = Math.ceil(this.totalItems / this.pageSize) || 1;
        const startItem = this.totalItems === 0 ? 0 : ((this.currentPage - 1) * this.pageSize) + 1;
        const endItem = Math.min(this.currentPage * this.pageSize, this.totalItems);

        container.className = 'pagination-container';
        container.innerHTML = `
            <div class="pagination-info">
                Showing <strong>${startItem}-${endItem}</strong> of <strong>${this.totalItems}</strong> results
            </div>
            <div class="pagination-controls">
                <button class="btn-page" ${this.currentPage === 1 ? 'disabled' : ''} 
                        onclick="window.activeListController.handlePage('prev')">
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
                <button class="btn-page" disabled style="border:none; background:transparent;">
                    Page ${this.currentPage} of ${totalPages}
                </button>
                <button class="btn-page" ${this.currentPage >= totalPages ? 'disabled' : ''} 
                        onclick="window.activeListController.handlePage('next')">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
    }
}