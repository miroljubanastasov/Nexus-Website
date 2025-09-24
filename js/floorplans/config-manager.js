/**
 * Configuration Manager for Floor Plan Generator
 * Handles BRIEF and PLOT JSON generation from UI inputs
 */

class ConfigManager {
    constructor() {
        this.form = document.getElementById('configForm');
        this.currentSolution = null; // Store the current solution
        this.currentPlotData = null; // Store the plot data used for the solution
        this.computeFromSolution = null; // Store the compute function reference
        this.initializeEventListeners();
    }

    /**
     * Set the compute function reference
     * @param {Function} computeFunction - The computeFromSolution function
     */
    setComputeFunction(computeFunction) {
        this.computeFromSolution = computeFunction;
    }

    initializeEventListeners() {
        // Solve house button (side panel only)
        document.getElementById('solveHouseBtn')?.addEventListener('click', () => {
            this.solveHouse();
        });

        // Generate floor plan button (side panel only)
        document.getElementById('generateFloorPlanBtn')?.addEventListener('click', () => {
            this.generateFloorPlanFromSolution();
        });

        // Legacy generate button (for backward compatibility)
        document.getElementById('generateFromConfigBtn')?.addEventListener('click', () => {
            this.generateFloorPlan();
        });

        // Export configuration
        document.getElementById('exportConfigBtn')?.addEventListener('click', () => {
            this.exportConfiguration();
        });

        // Import configuration
        document.getElementById('importConfigBtn')?.addEventListener('click', () => {
            this.importConfiguration();
        });

        // Export solution
        document.getElementById('exportSolutionBtn')?.addEventListener('click', () => {
            this.exportSolution();
        });

        // Import solution
        document.getElementById('importSolutionBtn')?.addEventListener('click', () => {
            this.importSolution();
        });

        // Export full project package
        document.getElementById('exportProjectBtn')?.addEventListener('click', () => {
            this.exportProject();
        });

        // Form change validation
        this.form?.addEventListener('change', () => {
            this.validateConfiguration();
        });
    }

    /**
     * Generate BRIEF JSON from form inputs
     * @returns {Object} BRIEF JSON object
     */
    generateBriefJson() {
        const getCheckboxValue = (id) => document.getElementById(id)?.checked || false;
        const getNumberValue = (id) => parseInt(document.getElementById(id)?.value) || 0;

        return {
            "Bedrooms": getNumberValue('bedrooms'),
            "Guest": getCheckboxValue('guest'),
            "Parents": getCheckboxValue('parents'),
            "Office": getCheckboxValue('office'),
            "Library": getCheckboxValue('library'),
            "Spa": getCheckboxValue('spa'),
            "LargeLivingRoom": getCheckboxValue('largeLivingRoom'),
            "DoubleHeightLivingRoom": getCheckboxValue('doubleHeightLivingRoom'),
            "DoubleHeightDiningRoom": getCheckboxValue('doubleHeightDiningRoom'),
            "CompactKitchen": getCheckboxValue('compactKitchen'),
            "Garden": getCheckboxValue('garden')
        };
    }

    /**
     * Generate PLOT JSON from form inputs
     * @returns {Object} PLOT JSON object
     */
    generatePlotJson() {
        const getNumberValue = (id) => parseFloat(document.getElementById(id)?.value) || 0;
        const getCheckboxValue = (id) => document.getElementById(id)?.checked || false;

        return {
            "north_angle": getNumberValue('northAngle'),
            "building_site_size": [
                getNumberValue('siteWidth'),
                getNumberValue('siteDepth')
            ],
            "max_modules_footprint": parseInt(document.getElementById('maxModulesFootprint')?.value) || 0,
            "max_modules": parseInt(document.getElementById('maxModules')?.value) || 0,
            "max_levels": parseInt(document.getElementById('maxLevels')?.value) || 0,
            "floor_height": getNumberValue('floorHeight'),
            "setbacks": {
                "S": getNumberValue('setbackS'),
                "E": getNumberValue('setbackE'),
                "N": getNumberValue('setbackN'),
                "W": getNumberValue('setbackW')
            },
            "access": {
                "S": getCheckboxValue('accessS'),
                "E": getCheckboxValue('accessE'),
                "N": getCheckboxValue('accessN'),
                "W": getCheckboxValue('accessW')
            },
            "neighbours_distance": {
                "S": getNumberValue('neighbourS'),
                "E": getNumberValue('neighbourE'),
                "N": getNumberValue('neighbourN'),
                "W": getNumberValue('neighbourW')
            }
        };
    }

    /**
     * Get complete configuration object
     * @returns {Object} Configuration with BRIEF and PLOT data
     */
    getConfiguration() {
        return {
            brief: this.generateBriefJson(),
            plot: this.generatePlotJson(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Load configuration into form
     * @param {Object} config - Configuration object with brief and plot data
     */
    loadConfiguration(config) {
        if (!config) return;

        // Load BRIEF data
        if (config.brief) {
            const brief = config.brief;
            this.setFormValue('bedrooms', brief.Bedrooms);
            this.setFormValue('guest', brief.Guest);
            this.setFormValue('parents', brief.Parents);
            this.setFormValue('office', brief.Office);
            this.setFormValue('library', brief.Library);
            this.setFormValue('spa', brief.Spa);
            this.setFormValue('largeLivingRoom', brief.LargeLivingRoom);
            this.setFormValue('doubleHeightLivingRoom', brief.DoubleHeightLivingRoom);
            this.setFormValue('doubleHeightDiningRoom', brief.DoubleHeightDiningRoom);
            this.setFormValue('compactKitchen', brief.CompactKitchen);
            this.setFormValue('garden', brief.Garden);
        }

        // Load PLOT data
        if (config.plot) {
            const plot = config.plot;
            this.setFormValue('northAngle', plot.north_angle);
            this.setFormValue('siteWidth', plot.building_site_size[0]);
            this.setFormValue('siteDepth', plot.building_site_size[1]);
            this.setFormValue('maxModulesFootprint', plot.max_modules_footprint);
            this.setFormValue('maxModules', plot.max_modules);
            this.setFormValue('maxLevels', plot.max_levels);
            this.setFormValue('floorHeight', plot.floor_height);

            // Setbacks
            this.setFormValue('setbackS', plot.setbacks.S);
            this.setFormValue('setbackE', plot.setbacks.E);
            this.setFormValue('setbackN', plot.setbacks.N);
            this.setFormValue('setbackW', plot.setbacks.W);

            // Access
            this.setFormValue('accessS', plot.access.S);
            this.setFormValue('accessE', plot.access.E);
            this.setFormValue('accessN', plot.access.N);
            this.setFormValue('accessW', plot.access.W);

            // Neighbours
            this.setFormValue('neighbourS', plot.neighbours_distance.S);
            this.setFormValue('neighbourE', plot.neighbours_distance.E);
            this.setFormValue('neighbourN', plot.neighbours_distance.N);
            this.setFormValue('neighbourW', plot.neighbours_distance.W);
        }

        this.validateConfiguration();
    }

    /**
     * Set form field value (handles checkboxes and inputs)
     * @param {string} id - Element ID
     * @param {*} value - Value to set
     */
    setFormValue(id, value) {
        const element = document.getElementById(id);
        if (!element) return;

        if (element.type === 'checkbox') {
            element.checked = Boolean(value);
        } else {
            element.value = value;
        }
    }

    /**
     * Validate current configuration
     * @returns {Object} Validation result with isValid and errors
     */
    validateConfiguration() {
        const errors = [];

        // Check required numeric values
        const requiredNumbers = [
            { id: 'bedrooms', min: 1, max: 5, name: 'Bedrooms' },
            { id: 'siteWidth', min: 5, max: 50, name: 'Site Width' },
            { id: 'siteDepth', min: 5, max: 50, name: 'Site Depth' },
            { id: 'maxLevels', min: 1, max: 4, name: 'Max Levels' },
            { id: 'floorHeight', min: 2.5, max: 4.0, name: 'Floor Height' }
        ];

        requiredNumbers.forEach(field => {
            const value = parseFloat(document.getElementById(field.id)?.value);
            if (isNaN(value) || value < field.min || value > field.max) {
                errors.push(`${field.name} must be between ${field.min} and ${field.max}`);
            }
        });

        // Check that at least one access point is selected
        const hasAccess = ['accessS', 'accessE', 'accessN', 'accessW']
            .some(id => document.getElementById(id)?.checked);

        if (!hasAccess) {
            errors.push('At least one site access point must be selected');
        }

        const isValid = errors.length === 0;

        // Update UI to show validation state
        this.updateValidationUI(isValid, errors);

        return { isValid, errors };
    }

    /**
     * Update UI based on validation state
     * @param {boolean} isValid - Whether configuration is valid
     * @param {Array} errors - Array of error messages
     */
    updateValidationUI(isValid, errors) {
        const generateBtn = document.getElementById('generateFromConfigBtn');
        if (generateBtn) {
            generateBtn.disabled = !isValid;
            generateBtn.className = isValid
                ? 'btn btn-success'
                : 'btn btn-outline-danger';
        }

        // Show/hide error messages (you can enhance this)
        if (!isValid && errors.length > 0) {
            console.warn('Configuration validation errors:', errors);
        }
    }

    /**
     * Generate floor plan using current configuration
     * 1. First call solver API to get solution
     * 2. Then feed solution to floor plan generation
     */
    async generateFloorPlan() {
        // Legacy method that combines both steps for backward compatibility
        console.log('🔄 Using legacy generateFloorPlan - executing two-step workflow');

        const validation = this.validateConfiguration();
        if (!validation.isValid) {
            alert('Please fix configuration errors before generating.');
            return;
        }

        const config = this.getConfiguration();
        const briefData = config.brief;
        const plotData = config.plot;

        try {
            // Step 1: Call solver API to get house solution
            console.log('🔄 Step 1: Solving house...');
            this.showSolverStatus('Solving house with current configuration...', 'info');

            const solverResult = await this.sendToSolver(briefData, plotData);

            if (!solverResult.success) {
                console.error('❌ Solver failed:', solverResult.error);
                this.showSolverStatus(`Solver failed: ${solverResult.error}`, 'danger');
                return;
            }

            // Store solution and show it
            this.currentSolution = solverResult.solution;
            this.displaySolution(solverResult.solution);
            this.toggleGenerateButtons(true);

            console.log('✅ Step 1 complete: House solution ready for floor plan generation');

        } catch (error) {
            console.error('💥 Error in floor plan generation process:', error);
            this.showSolverStatus(`Generation failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Export configuration as JSON file
     */
    exportConfiguration() {
        const config = this.getConfiguration();
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `nexus-config-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    /**
     * Import configuration from JSON file
     */
    importConfiguration() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    this.loadConfiguration(config);
                    alert('Configuration loaded successfully!');
                } catch (error) {
                    alert('Error loading configuration file: ' + error.message);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    /**
     * Send configuration to solver API (JavaScript version of house_solver_API)
     * @param {Object} briefData - BRIEF JSON object
     * @param {Object} plotData - PLOT JSON object
     * @returns {Promise<Object>} Solution JSON from API
     */
    async sendToSolver(briefData, plotData) {
        // API Configuration - match your Python version
        const API_BASE_URL = "http://localhost:8080";  // For local testing
        // const API_BASE_URL = "https://nexus-solver-482344765452.europe-west3.run.app";  // Production

        console.log('\n🏠 Running House Solver API...');

        try {
            // Prepare request - match your Python structure
            const request = {
                brief: briefData,
                plot: plotData,
                solver_timeout: 15,
                enforce_connectivity: true
            };

            const endpoint = `${API_BASE_URL}/api/v1/solve/house-layout`;
            console.log(`📡 Sending request to ${endpoint}`);
            console.log(`⏱️ Solver timeout: ${request.solver_timeout}s`);
            console.log(`📤 Request payload:`, JSON.stringify(request, null, 2));

            // Show loading state
            this.showSolverStatus('Solving house layout...', 'info');

            // Make API call with 60 seconds timeout (match Python)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Log response status
            console.log(`📡 API Response Status: ${response.status} ${response.statusText}`);

            if (response.ok) {
                const result = await response.json();
                console.log('✅ House solver API call succeeded');
                console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
                console.log('📊 Raw API Response:', JSON.stringify(result, null, 2));

                this.showSolverStatus('House layout solved successfully!', 'success');
                return {
                    success: true,
                    solution: result,
                    brief: briefData,
                    plot: plotData
                };
            } else {
                const errorText = await response.text();
                console.error(`❌ House solver API failed`);
                console.error(`📡 Status: ${response.status} ${response.statusText}`);
                console.error(`📋 Response headers:`, Object.fromEntries(response.headers.entries()));
                console.error(`📄 Error response: ${errorText}`);

                // Try to parse error message from JSON response
                let errorDetail = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.detail) {
                        errorDetail = errorJson.detail;
                    }
                } catch (parseError) {
                    // If parsing fails, use raw text
                    errorDetail = errorText;
                }

                // More user-friendly error messages based on status code
                let userMessage = '';
                if (response.status === 404) {
                    userMessage = 'Solver API endpoint not found. Please check if the server is running.';
                } else if (response.status === 500) {
                    userMessage = `Solver error: ${errorDetail}`;
                } else if (response.status === 400) {
                    userMessage = `Invalid request: ${errorDetail}`;
                } else if (response.status === 503) {
                    userMessage = 'Solver service unavailable. Please try again later.';
                } else {
                    userMessage = `Solver API failed (${response.status}): ${errorDetail}`;
                }

                this.showSolverStatus(userMessage, 'danger');
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${errorDetail}`,
                    status: response.status,
                    userMessage: userMessage
                };
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('⏰ House solver timed out');
                this.showSolverStatus('Solver request timed out after 60 seconds. Please try again or check your configuration.', 'warning');
                return {
                    success: false,
                    error: 'Request timed out after 60 seconds',
                    userMessage: 'Request timed out. Please try again.'
                };
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error(`🌐 Network error: ${error.message}`);
                this.showSolverStatus('Cannot connect to solver API. Please check if the server is running and your network connection.', 'danger');
                return {
                    success: false,
                    error: error.message,
                    userMessage: 'Network connection error. Please check if the solver server is running.'
                };
            } else {
                console.error(`💥 House solver error: ${error.message}`);
                this.showSolverStatus(`Solver error: ${error.message}`, 'danger');
                return {
                    success: false,
                    error: error.message,
                    userMessage: error.message
                };
            }
        }
    }

    /**
     * Show solver status messages
     * @param {string} message - Status message
     * @param {string} type - Message type (success, danger, warning, info)
     */
    showSolverStatus(message, type = 'info') {
        // Show in config panel if open, otherwise show in main area
        const configPanel = document.getElementById('configPanel');
        const isPanelOpen = configPanel?.classList.contains('show');

        let statusContainer;

        if (isPanelOpen) {
            // Show in config panel
            statusContainer = document.getElementById('solverStatus');
            if (!statusContainer) {
                statusContainer = document.createElement('div');
                statusContainer.id = 'solverStatus';
                statusContainer.className = 'mt-3';
                const generateBtn = document.getElementById('generateFromConfigBtn');
                if (generateBtn && generateBtn.parentNode) {
                    generateBtn.parentNode.insertBefore(statusContainer, generateBtn.nextSibling);
                }
            }
        } else {
            // Show in main area
            statusContainer = document.getElementById('mainSolverStatus');
        }

        if (!statusContainer) return;

        const alertClass = `alert-${type}`;
        const iconClass = {
            'success': 'fa-check-circle',
            'danger': 'fa-exclamation-circle',
            'warning': 'fa-exclamation-triangle',
            'info': 'fa-info-circle'
        }[type] || 'fa-info-circle';

        statusContainer.innerHTML = `
            <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
                <i class="fas ${iconClass} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        // Auto-dismiss success/info messages
        if (type === 'info' || type === 'success') {
            setTimeout(() => {
                const alert = statusContainer.querySelector('.alert');
                if (alert) {
                    alert.classList.remove('show');
                    setTimeout(() => alert.remove(), 150);
                }
            }, 5000);
        }
    }

    /**
     * Solve house - first step of the workflow
     */
    async solveHouse() {
        try {
            this.showSolverStatus('Solving house with current configuration...', 'info');

            // Disable solve button during processing
            this.toggleSolveButtons(false);

            // Generate configuration JSONs
            const briefJson = this.generateBriefJson();
            const plotJson = this.generatePlotJson();

            // Send to solver
            const result = await this.sendToSolver(briefJson, plotJson);

            if (result.success) {
                // Log API status and solution JSON
                console.log('✅ API Status: SUCCESS');
                console.log('📊 Solution JSON:', JSON.stringify(result.solution, null, 2));

                // Store the solution and plot data for floor plan generation
                this.currentSolution = result.solution;
                this.currentPlotData = plotJson;

                // Show success and enable floor plan generation
                this.showSolverStatus('House solved successfully! You can now generate the floor plan.', 'success');
                this.displaySolution(result.solution);
                this.toggleGenerateButtons(true);
                this.toggleSolutionExport(true);
                this.toggleProjectExport(true);
                this.updateHouseSummary();
            } else {
                console.log('❌ API Status: FAILED');
                console.log('❌ Error:', result.error);
                console.log('🚫 Disabling floor plan generation button');
                this.showSolverStatus(`Solver failed: ${result.error}`, 'danger');
                this.toggleGenerateButtons(false);
                this.toggleSolutionExport(false);
                this.toggleProjectExport(false);

                // Clear any existing solution to prevent accidental generation
                this.currentSolution = null;
                this.currentPlotData = null;
                console.log('🧹 Cleared solution data to prevent floor plan generation');
            }
        } catch (error) {
            console.error('Error solving house:', error);
            this.showSolverStatus(`Error: ${error.message}`, 'danger');
            this.toggleGenerateButtons(false);
            this.toggleSolutionExport(false);
            this.toggleProjectExport(false);
        } finally {
            this.toggleSolveButtons(true);
        }
    }

    /**
     * Generate floor plan from existing solution - second step of workflow
     */
    async generateFloorPlanFromSolution() {
        console.log('📋 Generate floor plan button clicked');
        console.log('🔍 Checking for solution data...');
        console.log('📊 Current solution:', this.currentSolution);
        console.log('📍 Current plot data:', this.currentPlotData);

        if (!this.currentSolution) {
            console.log('❌ No solution available');
            this.showSolverStatus('No solution available. Please solve the house first.', 'warning');
            return;
        }

        if (!this.currentPlotData) {
            console.log('❌ No plot data available');
            this.showSolverStatus('No plot data available. Please solve the house first.', 'warning');
            return;
        }

        if (!this.computeFromSolution) {
            console.error('computeFromSolution function not available');
            this.showSolverStatus('Floor plan generation function not available', 'danger');
            return;
        }

        try {
            console.log('🔄 Generating floor plan from solution...');
            console.log('📊 Using solution:', this.currentSolution);
            console.log('📋 Using plot data:', this.currentPlotData);

            this.showSolverStatus('Generating floor plan from solution...', 'info');
            this.toggleGenerateButtons(false);

            // Call the computeFromSolution function with both solution and plot data
            await this.computeFromSolution(this.currentSolution, this.currentPlotData);

            console.log('✅ Floor plan generation completed');
            this.showSolverStatus('Floor plan generated successfully!', 'success');
            // Enable solution export if generation succeeded and solution exists
            this.toggleSolutionExport(!!this.currentSolution);

        } catch (error) {
            console.error('💥 Error generating floor plan:', error);
            this.showSolverStatus(`Floor plan generation failed: ${error.message}`, 'danger');
        } finally {
            this.toggleGenerateButtons(true);
            this.toggleProjectExport(!!this.currentSolution);
        }
    }

    /**
     * Display the solution in the UI
     * @param {Object} solution - The solution data from the solver
     */
    displaySolution(solution) {
        // UI solution display removed for clean canvas layout.
        // Keep console output for debugging.
        console.log('🔍 Solver solution (summary UI removed):', solution);
    }

    /**
     * Toggle solve buttons enabled/disabled state
     * @param {boolean} enabled 
     */
    toggleSolveButtons(enabled) {
        const btn = document.getElementById('solveHouseBtn');
        if (btn) {
            btn.disabled = !enabled;
            if (enabled) {
                btn.innerHTML = '<i class="fas fa-cog me-2"></i>Solve House';
            } else {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Solving...';
            }
        }
    }

    /**
     * Toggle generate floor plan buttons enabled/disabled state
     * @param {boolean} enabled 
     */
    toggleGenerateButtons(enabled) {
        console.log(`🔘 Setting Generate Floor Plan button to: ${enabled ? 'ENABLED' : 'DISABLED'}`);
        const btn = document.getElementById('generateFloorPlanBtn');
        if (btn) {
            btn.disabled = !enabled;
            if (enabled) {
                btn.innerHTML = '<i class="fas fa-play me-2"></i>Generate Floor Plan';
                btn.className = 'btn btn-success';
            } else {
                btn.innerHTML = '<i class="fas fa-ban me-2"></i>Generate Floor Plan';
                btn.className = 'btn btn-secondary';
            }
            console.log(`✅ Button state updated - disabled: ${btn.disabled}, className: ${btn.className}`);
        } else {
            console.log('❌ Generate Floor Plan button not found');
        }
    }

    /**
     * Enable/disable export solution button
     */
    toggleSolutionExport(enabled) {
        const btn = document.getElementById('exportSolutionBtn');
        if (btn) {
            btn.disabled = !enabled;
        }
    }

    toggleProjectExport(enabled) {
        const btn = document.getElementById('exportProjectBtn');
        if (btn) btn.disabled = !enabled;
    }

    /**
     * Export current solver solution (if available)
     */
    exportSolution() {
        if (!this.currentSolution) {
            alert('No solution available to export. Solve the house first or import a solution.');
            return;
        }
        const dataStr = JSON.stringify(this.currentSolution, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `nexus-solution-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    /**
     * Import existing solver solution (bypasses solving step)
     */
    importSolution() {
        const input = document.getElementById('solutionFileInput');
        if (!input) return;
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    // Accept raw solution or wrapped package {solution, brief, plot}
                    let solutionObj = parsed;
                    if (parsed && parsed.solution) {
                        solutionObj = parsed.solution;
                        // If brief & plot included, load them into form first
                        if (parsed.brief && parsed.plot) {
                            this.loadConfiguration({ brief: parsed.brief, plot: parsed.plot });
                        }
                    }
                    if (typeof solutionObj !== 'object') throw new Error('Invalid solution structure');
                    this.currentSolution = solutionObj;
                    // Use embedded plot if present, else regenerate from form
                    if (parsed.plot) {
                        this.currentPlotData = parsed.plot;
                    } else {
                        this.currentPlotData = this.generatePlotJson();
                    }
                    this.toggleGenerateButtons(true);
                    this.toggleSolutionExport(true);
                    this.toggleProjectExport(true);
                    this.showSolverStatus('Solution imported. You can now generate the floor plan.', 'success');
                    console.log('📥 Imported solution/package:', parsed);
                    this.updateHouseSummary();
                } catch (err) {
                    alert('Error parsing solution file: ' + err.message);
                } finally {
                    // Reset input so same file can be re-selected
                    input.value = '';
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * Export combined project (brief, plot, solution) once solution exists
     */
    exportProject() {
        if (!this.currentSolution) {
            alert('No solution available to export. Solve or import a solution first.');
            return;
        }
        const packageObj = {
            exported_at: new Date().toISOString(),
            brief: this.generateBriefJson(),
            plot: this.generatePlotJson(),
            solution: this.currentSolution
        };
        const dataStr = JSON.stringify(packageObj, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `nexus-project-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    /**
     * Format area value to nearest 0.5 and return string with one decimal
     * @param {number} value
     * @returns {string}
     */
    formatArea(value) {
        if (value === undefined || value === null) return value;
        const n = Number(value);
        if (isNaN(n)) return value;
        const rounded = Math.round(n * 2) / 2; // nearest 0.5
        return rounded.toFixed(1);
    }

    /**
     * Update / reveal House Summary accordion based on currentSolution.summary
     */
    updateHouseSummary() {
        const summaryItem = document.getElementById('houseSummaryItem');
        const summaryContainer = document.getElementById('houseSummaryContent');
        if (!summaryItem || !summaryContainer) return;

        if (!this.currentSolution || !this.currentSolution.house || !this.currentSolution.house.summary) {
            summaryContainer.innerHTML = '<em>No summary available.</em>';
            return;
        }

        // Reveal accordion item if hidden
        summaryItem.classList.remove('d-none');

        const s = this.currentSolution.house.summary;
        // Build summary table-like layout
        const rows = [];
        const push = (label, value, icon) => {
            if (value === undefined || value === null) return;
            rows.push(`
                <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span><i class="fas ${icon} me-2 text-secondary"></i>${label}</span>
                    <strong class="text-dark">${value}</strong>
                </div>`);
        };

        push('Gross Floor Area (m²)', this.formatArea(s.GFA), 'fa-layer-group');
        push('Levels', s.num_of_levels, 'fa-building');
        push('Total Modules', s.total_modules, 'fa-th-large');
        push('Bedrooms', s.bedrooms, 'fa-bed');
        push('Bathrooms', s.bathrooms, 'fa-bath');

        summaryContainer.innerHTML = `
            <div class="mb-2 small text-uppercase fw-bold text-secondary">Summary</div>
            ${rows.join('')}
        `;
    }
}

// Export for use in other modules
export default ConfigManager;