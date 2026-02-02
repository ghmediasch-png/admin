class ListController {
    constructor(config) {
        this.pageSize = 10;
        this.currentPage = 1;
        this.totalItems = 0;
        
        // Configuration
        this.tableId = config.tableId; 
        this.toolbarId = config.toolbarId; 
        this.paginationId = config.paginationId; 
        this.fetchData = config.fetchData; 
        this.renderRow = config.renderRow; 

        // State
        this.searchQuery = '';
        this.dateFilter = '';
        this.debounceTimer = null;

        this.init();
    }

    init() {
        this.renderControls();
        this.loadData();
    }

    renderControls() {
        if (!this.toolbarId) return; 
        
        const toolbar = document.getElementById(this.toolbarId);
        if(!toolbar) return;

        toolbar.className = 'list-toolbar';
        toolbar.innerHTML = `
            <div class="search-group">
                <i class="fas fa-search search-icon"></i>
                <input type="text" class="search-input" placeholder="Search..." 
                       onkeyup="window.activeListController.handleSearch(this.value)">
            </div>
            <div class="date-group">
                <input type="date" class="date-input" 
                       onchange="window.activeListController.handleDate(this.value)">
            </div>
        `;
    }

    handleSearch(value) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.searchQuery = value.trim();
            this.currentPage = 1; 
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

    async loadData() {
        // --- HYBRID FIX: Support Table (tbody) OR Grid (div) ---
        let container = document.querySelector(`#${this.tableId} tbody`);
        if (!container) {
            container = document.getElementById(this.tableId);
        }

        const paginationContainer = this.paginationId ? document.getElementById(this.paginationId) : null;
        
        if (!container) {
            console.error(`ListController: Container #${this.tableId} not found.`);
            return;
        }

        // Loading State
        container.innerHTML = `<div style="text-align:center; padding: 20px; width:100%; grid-column: 1/-1;">
                                <i class="fas fa-spinner fa-spin"></i> Loading data...
                               </div>`;
        if(paginationContainer) paginationContainer.innerHTML = '<span>Updating...</span>';

        const from = (this.currentPage - 1) * this.pageSize;
        const to = from + this.pageSize - 1;

        const { data, count, error } = await this.fetchData({
            from, to, search: this.searchQuery, date: this.dateFilter
        });

        if (error) {
            container.innerHTML = `<div style="color:red; text-align:center;">Error: ${error.message}</div>`;
            return;
        }

        this.totalItems = count || 0;

        if (this.totalItems === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 20px; width:100%; grid-column: 1/-1; color:#64748b;">
                                    No results found.
                                   </div>`;
        } else {
            container.innerHTML = data.map(item => this.renderRow(item)).join('');
        }

        this.renderPagination();
    }

    renderPagination() {
        if (!this.paginationId) return;
        
        const container = document.getElementById(this.paginationId);
        if (!container) return;

        const totalPages = Math.ceil(this.totalItems / this.pageSize) || 1;
        const startItem = this.totalItems === 0 ? 0 : ((this.currentPage - 1) * this.pageSize) + 1;
        const endItem = Math.min(this.currentPage * this.pageSize, this.totalItems);

        container.className = 'pagination-container';
        container.innerHTML = `
            <div class="pagination-info">
                Showing <strong>${startItem}-${endItem}</strong> of <strong>${this.totalItems}</strong>
            </div>
            <div class="pagination-controls">
                <button class="btn-page" ${this.currentPage === 1 ? 'disabled' : ''} 
                        onclick="window.activeListController.handlePage('prev')">
                    Previous
                </button>
                <button class="btn-page" disabled style="border:none; background:transparent;">
                    Page ${this.currentPage}
                </button>
                <button class="btn-page" ${this.currentPage >= totalPages ? 'disabled' : ''} 
                        onclick="window.activeListController.handlePage('next')">
                    Next
                </button>
            </div>
        `;
    }
}