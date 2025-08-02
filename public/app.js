    // API Base URL - THIS IS CRUCIAL. Ensure it's correct for your backend.
    // If you are running YOUR OWN server.js locally, this should be 'http://localhost:3000/api'.
    // If you are relying on your friend's online Render.com deployment, keep it as below.
    const API_BASE = 'http://localhost:3000/api'; // Changed to local to match the server.js I provided


        // --- Helper Functions for UI and Data Handling ---

        /**
         * Generic function to display alerts (success/error/info) to the user.
         * @param {string} message - The message to display.
         * @param {string} type - 'success', 'error', or 'info' for styling.
         * @param {string} targetContainerId - ID of the element to prepend the alert to. Defaults to '.content' first child.
         */
        function showAlert(message, type = 'info', targetContainerId = null) {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${type}`;
            alertDiv.textContent = message;

            let targetContainer;
            if (targetContainerId) {
                targetContainer = document.getElementById(targetContainerId);
                targetContainer = document.querySelector('.content');
            }

            if (targetContainer) {
                // Remove any existing alerts in this container before adding a new one
                Array.from(targetContainer.children).forEach(child => {
                    if (child.classList.contains('alert')) {
                        child.remove();
                    }
                });
                targetContainer.prepend(alertDiv); // Add to the top of the container
                setTimeout(() => {
                    alertDiv.remove(); // Auto-remove after 5 seconds
                }, 5000);
            } else {
                console.error(`Alert container "${targetContainerId || '.content'}" not found for alert: ${message}`);
            }
        }

        /**
         * Formats a date string into a readable local date.
         * Handles null/invalid dates gracefully.
         * @param {string|null|undefined} dateString - The date string to format.
         * @returns {string} Formatted date or 'N/A' / 'Invalid Date'.
         */
        function formatReadableDate(dateString) {
            if (!dateString) return 'N/A';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Invalid Date'; // Check for invalid date

            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        /**
         * Truncates a long ID string for display purposes.
         * @param {string} id - The MongoDB ObjectID string.
         * @returns {string} Shortened ID with ellipsis.
         */
        function shortenId(id) {
            if (!id || id.length < 8) return id; // Don't shorten very short IDs
            return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
        }

        // --- API Communication Functions ---

        /**
         * Makes an asynchronous call to the backend API.
         * This version expects the API to return a JSON object with a 'success' boolean
         * and a 'data' array/object for successful responses, or 'error'/'message' for failures.
         * @param {string} endpoint - The API endpoint relative to API_BASE.
         * @param {string} method - HTTP method (GET, POST, PUT, DELETE).
         * @param {object|null} data - Request body data (for POST/PUT).
         * @returns {Promise<object|null>} The parsed JSON response or null on network/parsing error.
         */
        async function apiCall(endpoint, method = 'GET', data = null) {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };
            if (data) {
                options.body = JSON.stringify(data);
            }

            try {
                console.log(`Attempting ${method} ${API_BASE}${endpoint}`); // Debugging
                const response = await fetch(`${API_BASE}${endpoint}`, options);
                const result = await response.json(); // Always attempt to parse JSON

                if (!response.ok) {
                    // If the response was not OK (e.g., 400, 500 status)
                    const errorMessage = result.error || result.message || `API Error: ${response.status} ${response.statusText}`;
                    console.error('API Error Response:', result); // Log full error details
                    showAlert(errorMessage, 'error', endpoint.includes('/donors') ? 'donorModalAlert' : endpoint.includes('/inventory') ? 'bloodModalAlert' : endpoint.includes('/requests') ? 'requestModalAlert' : null);
                    return null; // Return null to indicate failure
                }
                
                return result; // For successful responses, returns { success: true, data: ... } or { success: true, message: ... }

            } catch (error) {
                console.error('Network or Parsing Error:', error);
                showAlert('Network error. Please check your internet connection or if the server is running.', 'error');
                return null;
            }
        }

        // --- Tab Management Functions ---

        /**
         * Handles switching between application tabs.
         * @param {string} tabName - The ID of the tab content to display.
         */
        function switchTab(tabName) {
            // Remove 'active' class from all tab content sections
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            // Remove 'active' class from all navigation buttons
            document.querySelectorAll('.nav-tab').forEach(navTab => navTab.classList.remove('active'));

            // Add 'active' class to the clicked tab's content and button
            document.getElementById(tabName).classList.add('active');
            document.querySelector(`.nav-tab[data-tab="${tabName}"]`).classList.add('active');

            // Load data specific to the selected tab
            loadTabData(tabName);
        }

        /**
         * Loads and displays data for the currently active tab.
         * @param {string} tabName - The name of the tab (e.g., 'dashboard', 'donors').
         */
        function loadTabData(tabName) {
            console.log(`Loading data for: ${tabName} tab.`);
            switch (tabName) {
                case 'dashboard':
                    loadDashboard();
                    break;
                case 'donors':
                    loadDonors();
                    break;
                case 'inventory':
                    loadInventory();
                    break;
                    case 'requests':
                    loadRequests();
                    break;
                case 'about':
                    // Static content, no API call needed
                    console.log('About tab activated. No dynamic data to load.');
                    break;
            }
        }

        // --- Modal Management Functions ---

        function showModal(modalId) {
            document.getElementById(modalId).style.display = 'flex'; // Use flex to center
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
            // Clear any alerts inside the modal when closing
            const modalAlertDiv = document.getElementById(`${modalId}Alert`);
            if (modalAlertDiv) modalAlertDiv.innerHTML = '';
        }

        // Close modal when clicking outside content
        window.onclick = function(event) {
            if (event.target.classList.contains('modal')) {
                event.target.style.display = 'none';
                const modalAlertDiv = event.target.querySelector('[id$="ModalAlert"]');
                if (modalAlertDiv) modalAlertDiv.innerHTML = '';
            }
        };

        // --- Specific Data Loading and Rendering Functions ---

        async function loadDashboard() {
            // Fetch all required data in parallel
            const statsRes = await apiCall('/stats');
            const inventoryRes = await apiCall('/inventory');

            // Ensure all calls were successful and have data
            const stats = statsRes ? statsRes.data : {};
            const inventory = inventoryRes ? inventoryRes.data : [];

            // Update Dashboard Stats
            document.getElementById('totalDonors').textContent = stats.totalDonors || 0;
            document.getElementById('totalUnits').textContent = stats.totalUnits || 0;
            document.getElementById('pendingRequests').textContent = stats.pendingRequests || 0;
            document.getElementById('criticalLevels').textContent = stats.criticalLevels || 0;

            // Calculate Inventory Overview Table (re-using inventory data from stats call)
            const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
            const bloodTypeUnits = {}; 

            bloodTypes.forEach(type => bloodTypeUnits[type] = 0); // Initialize

            inventory.forEach(item => {
                if (item.status === 'available' && bloodTypes.includes(item.bloodType)) {
                    bloodTypeUnits[item.bloodType] += item.units;
                }
            });

            const inventoryOverviewTbody = document.getElementById('inventoryOverview');
            inventoryOverviewTbody.innerHTML = ''; // Clear previous data

            bloodTypes.forEach(type => {
                const units = bloodTypeUnits[type];
                let status = 'Available';
                let statusClass = 'available';

                if (units <= 2) {
                    status = 'Critical';
                    statusClass = 'critical';
                } else if (units <= 5) {
                    status = 'Low';
                    statusClass = 'low';
                }

                const row = `
                    <tr>
                        <td><span class="blood-type">${type}</span></td>
                        <td>${units}</td>
                        <td><span class="status ${statusClass}">${status}</span></td>
                        <td>${formatReadableDate(new Date())}</td>
                    </tr>
                `;
                inventoryOverviewTbody.insertAdjacentHTML('beforeend', row);
            });
        }

        async function loadDonors() {
            const tbody = document.getElementById('donorsTable');
            tbody.innerHTML = '<tr><td colspan="7" class="alert alert-info" style="text-align: center;">Loading donors...</td></tr>';
            const result = await apiCall('/donors');
            if (!result || !result.success) {
                tbody.innerHTML = '<tr><td colspan="7" class="alert alert-error" style="text-align: center;">Failed to load donors. Please check the server and try again.</td></tr>';
                return;
            }
            const donors = result.data; // Access the 'data' property

            if (donors.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="alert alert-info" style="text-align: center;">No donors registered yet. Click "Add New Donor" to begin!</td></tr>';
                return;
            }

            tbody.innerHTML = donors.map(donor => `
                <tr>
                    <td><small>${shortenId(donor._id)}</small></td>
                    <td>${donor.name}</td>
                    <td><span class="blood-type">${donor.bloodType}</span></td>
                    <td>${donor.phone}</td>
                    <td>${donor.email}</td>
                    <td>${formatReadableDate(donor.lastDonation)}</td>
                    <td>
                        <button class="btn btn-danger" onclick="deleteDonor('${donor._id}')">Delete</button>
                    </td>
                </tr>
            `).join('');
        }

        async function loadInventory() {
            const tbody = document.getElementById('inventoryTable');
            tbody.innerHTML = '<tr><td colspan="7" class="alert alert-info" style="text-align: center;">Loading inventory...</td></tr>';
            const result = await apiCall('/inventory');
            if (!result || !result.success) {
                tbody.innerHTML = '<tr><td colspan="7" class="alert alert-error" style="text-align: center;">Failed to load inventory. Please check the server and try again.</td></tr>';
                return;
            }
            const inventory = result.data; // Access the 'data' property

            if (inventory.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="alert alert-info" style="text-align: center;">No blood units in inventory. Add some using "Add Blood Unit".</td></tr>';
                return;
            }

            tbody.innerHTML = inventory.map(item => `
                <tr>
                    <td><span class="blood-type">${item.bloodType}</span></td>
                    <td>${item.units}</td>
                    <td>${item.donorId ? item.donorId.name : 'N/A'}</td> <td>${formatReadableDate(item.collectionDate)}</td>
                    <td>${formatReadableDate(item.expiryDate)}</td>
                    <td><span class="status ${item.status.toLowerCase()}">${item.status}</span></td>
                    <td>
                        <button class="btn btn-danger" onclick="deleteBloodUnit('${item._id}')">Delete</button>
                    </td>
                </tr>
            `).join('');
        }

        async function loadRequests() {
            const tbody = document.getElementById('requestsTable');
            tbody.innerHTML = '<tr><td colspan="7" class="alert alert-info" style="text-align: center;">Loading requests...</td></tr>';
            const result = await apiCall('/requests');
            if (!result || !result.success) {
                tbody.innerHTML = '<tr><td colspan="7" class="alert alert-error" style="text-align: center;">Failed to load requests. Please check the server and try again.</td></tr>';
                return;
            }
            const requests = result.data; // Access the 'data' property

            if (requests.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="alert alert-info" style="text-align: center;">No pending blood requests. Click "New Request" to add one.</td></tr>';
                return;
            }

            tbody.innerHTML = requests.map(request => `
                <tr>
                    <td>${request.patientName}</td>
                    <td><span class="blood-type">${request.bloodType}</span></td>
                    <td>${request.units}</td>
                    <td>${request.hospital}</td>
                    <td><span class="status ${request.priority.toLowerCase()}">${request.priority}</span></td>
                    <td><span class="status ${request.status.toLowerCase()}">${request.status}</span></td>
                    <td>
                        ${request.status === 'pending' ?
                            `<button class="btn" onclick="fulfillRequest('${request._id}')">Fulfill</button>` :
                            ''
                        }
                        <button class="btn btn-danger" onclick="deleteRequest('${request._id}')">Delete</button>
                    </td>
                </tr>
            `).join('');
        }

        // --- Form Submission Handlers ---

        document.getElementById('donorForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const donorData = {
                name: document.getElementById('donorName').value.trim(),
                age: parseInt(document.getElementById('donorAge').value), // Added age
                bloodType: document.getElementById('donorBloodType').value,
                phone: document.getElementById('donorPhone').value.trim(),
                email: document.getElementById('donorEmail').value.trim().toLowerCase(),
                address: document.getElementById('donorAddress').value.trim()
            };
            const result = await apiCall('/donors', 'POST', donorData);
            if (result && result.success) {
                showAlert('Donor added successfully!', 'success');
                closeModal('donorModal');
                document.getElementById('donorForm').reset();
                loadDonors();
                loadDashboard();
            } else if (result && result.error) {
                showAlert(result.error, 'error', 'donorModalAlert');
            } else {
                showAlert('Failed to add donor. Please try again.', 'error', 'donorModalAlert');
            }
        });

        document.getElementById('bloodForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const bloodData = {
                bloodType: document.getElementById('bloodType').value,
                units: parseInt(document.getElementById('bloodUnits').value),
                donorId: document.getElementById('donorSelect').value,
                collectionDate: document.getElementById('collectionDate').value,
                expiryDate: document.getElementById('expiryDate').value
            };
            const result = await apiCall('/inventory', 'POST', bloodData);
            if (result && result.success) {
                showAlert('Blood unit added successfully!', 'success');
                closeModal('bloodModal');
                document.getElementById('bloodForm').reset();
                loadInventory();
                loadDashboard();
            } else if (result && result.error) {
                showAlert(result.error, 'error', 'bloodModalAlert');
            } else {
                showAlert('Failed to add blood unit. Please try again.', 'error', 'bloodModalAlert');
            }
        });

        document.getElementById('requestForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const requestData = {
                patientName: document.getElementById('patientName').value.trim(),
                bloodType: document.getElementById('requestBloodType').value,
                units: parseInt(document.getElementById('unitsNeeded').value),
                priority: document.getElementById('priority').value,
                hospital: document.getElementById('hospital').value.trim()
            };
            const result = await apiCall('/requests', 'POST', requestData);
            if (result && result.success) {
                showAlert('Request submitted successfully!', 'success');
                closeModal('requestModal');
                document.getElementById('requestForm').reset();
                loadRequests();
                loadDashboard();
            } else if (result && result.error) {
                showAlert(result.error, 'error', 'requestModalAlert');
            } else {
                showAlert('Failed to submit request. Please try again.', 'error', 'requestModalAlert');
            }
        });

        // --- Action Handlers (Delete, Fulfill) ---

        async function deleteDonor(id) {
            if (confirm('Are you sure you want to delete this donor? This action cannot be undone.')) {
                const result = await apiCall(`/donors/${id}`, 'DELETE');
                if (result && result.success) {
                    showAlert('Donor deleted successfully!', 'success');
                    loadDonors();
                    loadDashboard();
                } else if (result && result.error) {
                    showAlert(result.error, 'error');
                } else {
                    showAlert('Failed to delete donor. Please try again.', 'error');
                }
            }
        }

        async function deleteBloodUnit(id) {
            if (confirm('Are you sure you want to delete this blood unit?')) {
                const result = await apiCall(`/inventory/${id}`, 'DELETE');
                if (result && result.success) {
                    showAlert('Blood unit deleted successfully!', 'success');
                    loadInventory();
                    loadDashboard();
                } else if (result && result.error) {
                    showAlert(result.error, 'error');
                } else {
                    showAlert('Failed to delete blood unit. Please try again.', 'error');
                }
            }
        }

        async function deleteRequest(id) {
            if (confirm('Are you sure you want to delete this request? This will not revert inventory changes if already fulfilled.')) {
                const result = await apiCall(`/requests/${id}`, 'DELETE');
                if (result && result.success) {
                    showAlert('Request deleted successfully!', 'success');
                    loadRequests();
                    loadDashboard();
                } else if (result && result.error) {
                    showAlert(result.error, 'error');
                } else {
                    showAlert('Failed to delete request. Please try again.', 'error');
                }
            }
        }

        async function fulfillRequest(id) {
            if (confirm('Are you sure you want to mark this request as fulfilled? This will deduct units from inventory.')) {
                // Ensure backend has /api/requests/:id/approve endpoint
                const result = await apiCall(`/requests/${id}/approve`, 'PUT', {}); // Pass empty body if backend expects one
                if (result && result.success) {
                    showAlert('Request fulfilled successfully! Inventory updated.', 'success');
                    loadRequests();
                    loadInventory();
                    loadDashboard();
                } else if (result && result.error) {
                    showAlert(`Failed to fulfill request: ${result.error}`, 'error');
                } else {
                    showAlert('Failed to fulfill request. Please try again.', 'error');
                }
            }
        }

        // --- Search Functionality ---
        function setupSearch(inputId, tableId, columnsToSearch) {
            document.getElementById(inputId).addEventListener('keyup', function() {
                const searchTerm = this.value.toLowerCase();
                const table = document.getElementById(tableId);
                const rows = table.querySelectorAll('tbody tr');

                rows.forEach(row => {
                    let match = false;
                    if (row.querySelector('.alert')) { // Skip info/loading rows
                        row.style.display = 'none';
                        return;
                    }

                    for (const colIndex of columnsToSearch) {
                        const cell = row.children[colIndex];
                        if (cell && cell.textContent.toLowerCase().includes(searchTerm)) {
                            match = true;
                            break;
                        }
                    }
                    row.style.display = match ? '' : 'none';
                });
            });
        }

        async function loadDonorDropdown() {
            const select = document.getElementById('donorSelect');
            select.innerHTML = '<option value="">Loading Donors...</option>';
            const result = await apiCall('/donors');
            if (result && result.success) {
                const donors = result.data;
                if (donors.length > 0) {
                    select.innerHTML = '<option value="">Select Donor</option>' +
                        donors.map(donor =>
                            `<option value="${donor._id}">${donor.name} (${donor.bloodType}) - ${donor.phone}</option>`
                        ).join('');
                } else {
                    select.innerHTML = '<option value="">No donors available</option>';
                }
            } else {
                select.innerHTML = '<option value="">Failed to load donors</option>';
            }
        }


        // --- Initialization ---

        document.addEventListener('DOMContentLoaded', () => {
            // Setup navigation tab clicks
            document.querySelectorAll('.nav-tab').forEach(button => {
                button.addEventListener('click', (event) => {
                    switchTab(event.target.dataset.tab);
                });
            });

            // Setup modal trigger buttons
            document.getElementById('addDonorBtn').addEventListener('click', () => showModal('donorModal'));
            document.getElementById('addBloodUnitBtn').addEventListener('click', () => {
                showModal('bloodModal');
                loadDonorDropdown(); // Load donors when opening the blood unit modal
            });
            document.getElementById('newRequestBtn').addEventListener('click', () => showModal('requestModal'));

            // Setup modal close buttons (using data-modal-id attribute)
            document.querySelectorAll('.modal .close').forEach(closeBtn => {
                closeBtn.addEventListener('click', (event) => {
                    closeModal(event.target.dataset.modalId);
                });
            });

            // Set default date for collectionDate (today) and min for expiryDate (today)
            const today = new Date().toISOString().split('T')[0];
            const collectionDateInput = document.getElementById('collectionDate');
            if (collectionDateInput) {
                collectionDateInput.value = today;
                collectionDateInput.max = today; // Cannot select future date for collection
            }
            const expiryDateInput = document.getElementById('expiryDate');
            if (expiryDateInput) {
                expiryDateInput.min = today; // Expiry date cannot be before today
            }

            // Setup search functionality for donors table
            setupSearch('donorSearch', 'donorsTable', [1, 2, 3, 4]); // Search Name, Blood Type, Phone, Email

            // Load the initial dashboard data
            switchTab('dashboard'); // Activates dashboard and calls loadDashboard()
        });

