import ConfigManager from './config-manager.js';
import { computeFromSolution } from './get_flooplan.js';

// Canvas management functions (updated for fixed layout)
function showCanvas() {
    const container = document.querySelector('.canvas-container');
    if (container) container.classList.add('has-content');
}

function closeCanvas() {
    const container = document.querySelector('.canvas-container');
    if (container) container.classList.remove('has-content');
    const svgContainer = document.getElementById('svgContainer');
    if (svgContainer) {
        svgContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-home fa-3x mb-3"></i>
                <p class="mb-0">Floor Plan Viewer</p>
                <small>Configure and solve house to generate floor plan</small>
            </div>
        `;
    }
}

// Global function to hide solution display (legacy no-op if element absent)
function hideSolution() {
    const solutionDisplay = document.getElementById('solutionDisplay');
    if (solutionDisplay) solutionDisplay.style.display = 'none';
}

// Expose to window for other modules
window.showCanvas = showCanvas;
window.closeCanvas = closeCanvas;
window.hideSolution = hideSolution;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const configManager = new ConfigManager();
    configManager.setComputeFunction(computeFromSolution);
    // Optionally expose for debugging
    window.nexusConfigManager = configManager;
});
