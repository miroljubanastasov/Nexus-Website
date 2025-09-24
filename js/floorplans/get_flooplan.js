import rhino3dm from 'rhino3dm'
import { RhinoCompute } from 'rhinocompute'
import SvgManager from './svg-manager.js'

// Configure RhinoCompute to use local server
RhinoCompute.url = 'http://localhost:5000/'

// Initialize SVG Manager
const svgManager = new SvgManager('svgContainer');

function loadSvgIntoCarousel(level, svgContent, displayTitle) {
    console.log(`Attempting to parse SVG for    // Attach event listener only if the generateBtn exists (for backward compatibility)
    const legacyGenerateBtn = document.getElementById('generateBtn');
    if (legacyGenerateBtn) {
        legacyGenerateBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
                if (definition) {
                    await compute();
                } else {
                    showStatus('Grasshopper definition not loaded. Please refresh the page.', 'danger');
                }
            } catch (error) {
                showStatus('Error generating floor plan: ' + (error.message || error), 'danger');
            }
        });
    }le}, content length: ${svgContent.length}`);
    console.log(`First 200 chars of SVG:`, svgContent.substring(0, 200));

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');

    // Check for parsing errors
    const parseError = svgDoc.querySelector('parsererror');
    if (parseError) {
        console.error(`SVG parsing error for ${displayTitle}:`, parseError.textContent);
        showStatus(`Error: Invalid SVG content for ${displayTitle}`, 'warning');
        return;
    }

    const svgElement = svgDoc.querySelector('svg');

    if (svgElement) {
        console.log(`SVG element found for ${displayTitle}`);
        console.log(`SVG viewBox:`, svgElement.getAttribute('viewBox'));
        console.log(`SVG dimensions:`, svgElement.getAttribute('width'), 'x', svgElement.getAttribute('height'));
        console.log(`SVG has ${svgElement.children.length} child elements`);

        // Clone the SVG element to ensure it's properly imported
        const clonedSvg = svgElement.cloneNode(true);
        console.log(`Cloned SVG created, calling addLevelToCarousel...`);

        // Create the level data object that addLevelToCarousel expects
        const levelData = {
            level: level,
            title: displayTitle,
            svgContent: svgContent  // Pass the original string, not the parsed element
        };

        const success = svgManager.addLevelToCarousel(levelData);
        console.log(`addLevelToCarousel result:`, success);
    } else {
        console.error(`No SVG element found in parsed document for ${displayTitle}`);
        console.log('Parsed document content:', svgDoc.documentElement);
        showStatus(`Warning: No SVG element found for ${displayTitle}`, 'warning');
    }
}// Configuration
let data = {}
//data.GH_definition = "assets/grasshopper/Configurator_Element_Debug.gh"
data.GH_definition = "assets/grasshopper/Configurator_Element_Drawings.gh"
data.inputs = {
    'SOLUTION_JSON': "e:/ARCH/Nexus/Website/Nexus-Website/assets/data/NX_ELEMENT_28_SOLUTION.json",
    'PLOT_JSON': "e:/ARCH/Nexus/Website/Nexus-Website/assets/data/NX_ELEMENT_28_PLOT.json",
    'MODULES_FILE_PATH': "e:/ARCH/Nexus/Website/Nexus-Website/assets/rhino/NX_ELEMENT_MODULES.3dm"
}

let definition;
let solutionData = null; // Will store the parsed SOLUTION_JSON
let totalLevels = 1; // Default to 1 level

async function testRhinoComputeConnection() {
    try {
        const response = await fetch(RhinoCompute.url + 'version');
        if (response.ok) {
            const version = await response.text();
            showStatus(`Connected to Rhino Compute server (version: ${version})`, 'success');
            return true;
        }
        return false;
    } catch (error) {
        showStatus(`Cannot connect to Rhino Compute server.`, 'danger');
        return false;
    }
}

async function initializeDefinition() {
    try {
        let url = data.GH_definition
        let res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        let buffer = await res.arrayBuffer()
        definition = new Uint8Array(buffer)
        return true;
    } catch (error) {
        showStatus('Error loading Grasshopper definition', 'danger');
        return false;
    }
}

async function loadSolutionData() {
    try {
        const response = await fetch('./assets/data/NX_ELEMENT_28_SOLUTION.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        solutionData = await response.json();

        // Extract number of levels from grid_shape[2]
        if (solutionData && solutionData.house && solutionData.house.grid_shape && Array.isArray(solutionData.house.grid_shape)) {
            totalLevels = solutionData.house.grid_shape[2] || 1;
        } else {
            totalLevels = 1;
        }

        return true;
    } catch (error) {
        showStatus('Error loading solution data', 'warning');
        totalLevels = 1; // Default fallback
        return false;
    }
}

/**
 * Compute floor plans from solver solution (new method)
 * @param {Object} solutionData - Solution JSON from solver API
 * @param {Object} plotData - Plot JSON from configuration
 */
async function computeFromSolution(solutionData, plotData) {
    console.log('🏗️ Computing floor plans from solver solution...');

    // Prevent page unload while generation is in progress
    const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);

    // Disable generate button during processing (if it exists)
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.disabled = true;
    }

    try {
        // Extract levels from solution data
        let levelsCount = 1;
        if (solutionData?.house?.grid_shape && Array.isArray(solutionData.house.grid_shape)) {
            levelsCount = solutionData.house.grid_shape[2] || 1;
        }

        // Show fullscreen canvas
        window.showCanvas();
        svgManager.showLoading();
        showStatus(`Generating ${levelsCount} floor plan levels...`, 'info');

        // Initialize progressive carousel
        svgManager.initializeProgressiveCarousel(levelsCount);

        // Generate SVG for each level
        for (let level = 0; level < levelsCount; level++) {
            showStatus(`Generating Level ${level} of ${levelsCount} levels...`, 'info');

            // Prepare Grasshopper DataTrees with actual data (not file paths)
            let param1 = new RhinoCompute.Grasshopper.DataTree('SOLUTION_JSON');
            param1.append([0], [JSON.stringify(solutionData)]);

            let param2 = new RhinoCompute.Grasshopper.DataTree('PLOT_JSON');
            param2.append([0], [JSON.stringify(plotData)]);

            let param3 = new RhinoCompute.Grasshopper.DataTree('LEVEL');
            param3.append([0], [level]);

            let param4 = new RhinoCompute.Grasshopper.DataTree('MODULES_FILE_PATH');
            param4.append([0], [data.inputs.MODULES_FILE_PATH]);

            let trees = [param1, param2, param3, param4];

            // Call Rhino Compute
            let res = await RhinoCompute.Grasshopper.evaluateDefinition(definition, trees);

            if (res && res.values && res.values.length > 0) {
                const displayTitle = level === 0 ? "Ground Floor" : `Level ${level}`;

                // Extract SVG string from response
                let svgParam = res.values.find(param => param.ParamName === 'SVG_STRING') ||
                    res.values.find(param => param.ParamName === 'SVG') ||
                    res.values[0];

                if (svgParam?.InnerTree?.['{0;0}']?.length > 0) {
                    const svgStringRaw = svgParam.InnerTree['{0;0}'][0].data;
                    const svgContent = svgStringRaw
                        .replace(/\\"/g, '"')
                        .replace(/^"|"$/g, '')
                        .replace(/\\r\\n/g, '\n')
                        .replace(/\\n/g, '\n')
                        .replace(/\r\n/g, '\n')
                        .replace(/\r/g, '\n');

                    console.log(`✅ SVG generated for ${displayTitle}`);
                    loadSvgIntoCarousel(level, svgContent, displayTitle);
                } else {
                    console.warn(`⚠️ No SVG data for ${displayTitle}`);
                    showStatus(`Warning: No SVG data for Level ${level}`, 'warning');
                }
            } else {
                console.warn(`⚠️ Generation failed for Level ${level}`);
                showStatus(`Warning: Level ${level} generation failed`, 'warning');
            }
        }

        showStatus(`✅ All ${levelsCount} floor plan levels generated!`, 'success');

    } catch (error) {
        console.error('💥 Error generating floor plans:', error);
        showStatus('Error generating floor plan: ' + (error.message || error), 'danger');
        svgManager.showError(error.message || String(error));
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
        }
        window.removeEventListener('beforeunload', beforeUnload);
    }
}

async function compute() {
    // Original compute function - kept for backward compatibility
    // Prevent page unload while generation is in progress
    const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);

    // Disable generate button during processing (if it exists)
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.disabled = true;
    }

    try {
        // Show fullscreen canvas
        window.showCanvas();

        svgManager.showLoading();
        showStatus(`Generating floor plans for ${totalLevels} levels...`, 'info');

        // Initialize progressive carousel
        svgManager.initializeProgressiveCarousel(totalLevels);

        // Generate SVG for each level (zero-indexed) with progressive loading
        for (let level = 0; level < totalLevels; level++) {
            showStatus(`Generating Level ${level} of ${totalLevels} levels...`, 'info');

            // Update data for current level (zero-indexed)
            data.inputs.LEVEL = level;

            // Prepare Grasshopper DataTrees for current level
            let param1 = new RhinoCompute.Grasshopper.DataTree('SOLUTION_JSON')
            param1.append([0], [data.inputs.SOLUTION_JSON])

            let param2 = new RhinoCompute.Grasshopper.DataTree('PLOT_JSON')
            param2.append([0], [data.inputs.PLOT_JSON])

            let param3 = new RhinoCompute.Grasshopper.DataTree('LEVEL')
            param3.append([0], [data.inputs.LEVEL])

            let param4 = new RhinoCompute.Grasshopper.DataTree('MODULES_FILE_PATH')
            param4.append([0], [data.inputs.MODULES_FILE_PATH])

            let trees = [param1, param2, param3, param4]

            let res = await RhinoCompute.Grasshopper.evaluateDefinition(definition, trees);

            if (res && res.values && res.values.length > 0) {
                const displayTitle = level === 0 ? "Ground Floor" : `Level ${level}`;

                // Extract SVG string from response - check multiple possible parameter names
                let svgParam = res.values.find(param => param.ParamName === 'SVG_STRING');
                if (!svgParam) {
                    svgParam = res.values.find(param => param.ParamName === 'SVG');
                }
                if (!svgParam) {
                    // If no named parameter found, try the first parameter
                    svgParam = res.values[0];
                }

                if (svgParam && svgParam.InnerTree && svgParam.InnerTree['{0;0}'] && svgParam.InnerTree['{0;0}'].length > 0) {
                    const svgStringRaw = svgParam.InnerTree['{0;0}'][0].data;
                    // Clean up the escaped string and line breaks
                    const svgContent = svgStringRaw
                        .replace(/\\"/g, '"')           // Unescape quotes
                        .replace(/^"|"$/g, '')          // Remove surrounding quotes
                        .replace(/\\r\\n/g, '\n')       // Convert escaped line breaks
                        .replace(/\\n/g, '\n')          // Convert escaped newlines
                        .replace(/\r\n/g, '\n')         // Normalize line endings
                        .replace(/\r/g, '\n');          // Convert remaining carriage returns

                    console.log(`SVG extracted for ${displayTitle}:`, svgContent.substring(0, 100) + '...');
                    console.log(`SVG full content for ${displayTitle}:`, svgContent);

                    // Load SVG content directly into carousel
                    loadSvgIntoCarousel(level, svgContent, displayTitle);
                } else {
                    console.log('No SVG data found in response:', res.values);
                    showStatus(`Warning: No SVG data received for Level ${level}`, 'warning');
                }
            } else {
                showStatus(`Warning: Level ${level} generation failed`, 'warning');
            }
        }

        // All levels completed
        showStatus(`All ${totalLevels} floor plan levels generated successfully!`, 'success');

    } catch (error) {
        showStatus('Error generating floor plan: ' + (error.message || error), 'danger');
        svgManager.showError(error.message || String(error));
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false; // Re-enable button
        }
        window.removeEventListener('beforeunload', beforeUnload);
    }
}

async function testSVGAccess() {
    const testPath = "./assets/output/SVG_FLOORPLAN_00.svg";
    try {
        const response = await fetch(testPath, { method: 'HEAD' });
        if (response.ok) {
            showStatus('✅ SVG file is accessible via web server', 'success');
            return true;
        } else {
            showStatus(`❌ SVG file not accessible (${response.status})`, 'warning');
            return false;
        }
    } catch (error) {
        showStatus('❌ Error testing SVG file access', 'danger');
        return false;
    }
}

async function loadLevelIntoCarousel(level, filename, title) {
    try {
        const webPath = `./assets/output/${filename}.svg`;

        const response = await fetch(webPath);
        if (response.ok) {
            const svgContent = await response.text();
            const levelData = {
                level: level,
                filename: filename,
                title: title,
                svgContent: svgContent,
                success: true
            };

            // Add to progressive carousel
            svgManager.addLevelToCarousel(levelData);
            showStatus(`${title} loaded!`, 'success');

        } else {
            showStatus(`Warning: Could not load ${title}`, 'warning');
        }
    } catch (fetchError) {
        showStatus(`Error loading ${title}`, 'warning');
    }
}

// UI Helper functions
function showStatus(message, type = 'info') {
    const statusContainer = document.getElementById('statusMessages');
    if (!statusContainer) {
        // Silently skip if status area removed (clean canvas mode)
        return;
    }
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    showStatus('Connecting to Rhino Compute server...', 'info');
    const serverConnected = await testRhinoComputeConnection();
    if (!serverConnected) return;

    showStatus('Loading Grasshopper definition...', 'info');
    const definitionLoaded = await initializeDefinition();
    if (!definitionLoaded) {
        showStatus('Failed to load Grasshopper definition.', 'danger');
        return;
    }

    showStatus('Loading project data...', 'info');
    const solutionLoaded = await loadSolutionData();
    if (solutionLoaded) {
        showStatus(`Ready to generate floor plans! Project has ${totalLevels} levels.`, 'success');
    } else {
        showStatus('Ready to generate floor plans! (Using default configuration)', 'success');
    }

    document.getElementById('generateBtn').addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            if (definition) {
                await compute();
            } else {
                showStatus('Grasshopper definition not loaded. Please refresh the page.', 'danger');
            }
        } catch (error) {
            showStatus('Error: ' + (error.message || error), 'danger');
        }
    });
});

export { compute, computeFromSolution, data, testSVGAccess, loadLevelIntoCarousel, loadSvgIntoCarousel, loadSolutionData };