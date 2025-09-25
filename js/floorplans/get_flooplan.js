import rhino3dm from 'rhino3dm'
import { RhinoCompute } from 'rhinocompute'
import SvgManager from './svg-manager.js'

// Debug helper
function dbg(...args) {
    try { if (window.NEXUS_DEBUG) console.debug(...args); } catch (_) { }
}

// Configure RhinoCompute to use local server
RhinoCompute.url = 'http://localhost:5000/'

// Initialize SVG Manager
const svgManager = new SvgManager('svgContainer');

function loadSvgIntoCarousel(level, svgContent, displayTitle) {
    dbg(`Attempting to parse SVG for ${displayTitle}, content length: ${svgContent.length}`);
    dbg(`First 200 chars of SVG:`, svgContent.substring(0, 200));

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
        dbg(`SVG element found for ${displayTitle}`);
        dbg(`SVG viewBox:`, svgElement.getAttribute('viewBox'));
        dbg(`SVG dimensions:`, svgElement.getAttribute('width'), 'x', svgElement.getAttribute('height'));
        dbg(`SVG has ${svgElement.children.length} child elements`);

        // Clone the SVG element to ensure it's properly imported
        const clonedSvg = svgElement.cloneNode(true);
        dbg(`Cloned SVG created, calling addLevelToCarousel...`);

        // Create the level data object that addLevelToCarousel expects
        const levelData = {
            level: level,
            title: displayTitle,
            svgContent: svgContent  // Pass the original string, not the parsed element
        };

        const success = svgManager.addLevelToCarousel(levelData);
        dbg(`addLevelToCarousel result:`, success);
    } else {
        console.error(`No SVG element found in parsed document for ${displayTitle}`);
        dbg('Parsed document content:', svgDoc.documentElement);
        showStatus(`Warning: No SVG element found for ${displayTitle}`, 'warning');
    }
}

// Configuration
let data = {}
//data.GH_definition = "assets/grasshopper/Configurator_Element_Debug.gh"
data.GH_definition = "assets/grasshopper/Configurator_Element_Drawings.gh"
data.inputs = {
    'MODULES_FILE_PATH': "e:/ARCH/Nexus/Website/Nexus-Website/assets/rhino/NX_ELEMENT_MODULES.3dm"
}

let definition;

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


/**
 * Compute floor plans from solver solution (new method)
 * @param {Object} solutionData - Solution JSON from solver API
 * @param {Object} plotData - Plot JSON from configuration
 */
async function computeFromSolution(solutionData, plotData) {
    dbg('🏗️ Computing floor plans from solver solution...');

    // Prevent page unload while generation is in progress
    const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);

    // Disable generate button during processing (if it exists)
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        generateBtn.disabled = true;
    }

    try {
        // Ensure definition is loaded (lazy init for new flow)
        if (!definition) {
            const ok = await initializeDefinition();
            if (!ok) throw new Error('Grasshopper definition not loaded');
        }
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
        // Notify listeners that SVG generation is starting
        window.dispatchEvent(new CustomEvent('nexus:svgInit', { detail: { levelsCount } }));

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

                    dbg(`✅ SVG generated for ${displayTitle}`);
                    // Emit event for caching
                    window.dispatchEvent(new CustomEvent('nexus:svgLevel', { detail: { level, title: displayTitle, svgContent } }));
                    // Render into carousel
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

        // Notify completion
        window.dispatchEvent(new CustomEvent('nexus:svgDone'));
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
    // Listen for request to display already-saved SVGs from a project import
    window.addEventListener('nexus:displaySvgs', (e) => {
        const svgs = e.detail?.svgs;
        if (!Array.isArray(svgs) || svgs.length === 0) return;
        try {
            window.showCanvas?.();
            svgManager.showLoading();
            const levelsCount = svgs.length;
            svgManager.initializeProgressiveCarousel(levelsCount);
            // Render in order
            svgs
                .slice()
                .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
                .forEach(({ level, title, svgContent }) => {
                    const displayTitle = title || (level === 0 ? 'Ground Floor' : `Level ${level}`);
                    loadSvgIntoCarousel(level ?? 0, svgContent, displayTitle);
                });
            showStatus('Floor plans loaded from saved SVGs.', 'success');
        } catch (err) {
            console.error('Failed to display saved SVGs:', err);
            showStatus('Error displaying saved SVGs.', 'danger');
        }
    });
});

export { computeFromSolution, data, loadSvgIntoCarousel };