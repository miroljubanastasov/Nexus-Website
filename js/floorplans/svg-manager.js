/**
 * SVG Management Module
 * Handles SVG scaling and canvas fitting (styling managed via CSS)
 */

class SvgManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentSvg = null;
        this.originalWidth = null;
        this.originalHeight = null;
    }

    /**
     * Load and display SVG in the container
     * @param {string} svgContent - SVG content as string
     */
    loadSvg(svgContent) {
        try {
            // Clear existing content
            this.container.innerHTML = '';

            // Parse SVG string
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgContent, 'image/svg+xml');
            const svgElement = doc.documentElement;

            if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
                return false;
            }

            // Store references and attach
            this.currentSvg = svgElement;
            this.originalWidth = svgElement.getAttribute('width');
            this.originalHeight = svgElement.getAttribute('height');
            this.container.appendChild(svgElement);

            // Apply desired drawing order after SVG is in the DOM
            this.applyLayerOrder();
            return true;

        } catch (_e) {
            return false;
        }
    }

    /**
     * Show error message in container
     * @param {string} message - Error message to display
     */
    showError(message) {
        this.container.innerHTML = `
            <div class="text-center text-danger p-4">
                <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                <h5>Error Loading Floor Plan</h5>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.container.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p>Processing floor plan...</p>
            </div>
        `;
    }

    /**
     * Clear container
     */
    clear() {
        this.container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-home fa-3x mb-3"></i>
                <p class="mb-0">Floor plan will appear here after generation</p>
                <small>Configure parameters above and click "Generate Floor Plan"</small>
            </div>
        `;
        this.currentSvg = null;
        this.originalWidth = null;
        this.originalHeight = null;
    }

    /**
     * Load multiple SVGs into a carousel
     * @param {Array} levelData - Array of level objects with svgContent, title, level
     */
    loadCarousel(levelData) {
        if (!levelData || levelData.length === 0) return false;

        // Store carousel data
        this.carouselData = levelData;
        this.currentCarouselIndex = 0;

        // Clear container and create carousel structure
        this.container.innerHTML = '';

        // Create carousel container
        const carouselContainer = document.createElement('div');
        carouselContainer.className = 'position-relative w-100 h-100';

        // Create level indicator/title
        const levelTitle = document.createElement('div');
        levelTitle.className = 'level-title text-center mb-3';
        levelTitle.innerHTML = `<h5 class="mb-0">${levelData[0].title}</h5>`;
        carouselContainer.appendChild(levelTitle);

        // Create SVG display area
        const svgDisplayArea = document.createElement('div');
        svgDisplayArea.className = 'svg-display-area position-relative';
        svgDisplayArea.style.height = 'calc(100% - 100px)'; // Leave space for controls
        carouselContainer.appendChild(svgDisplayArea);

        // Create navigation controls if more than one level
        if (levelData.length > 1) {
            const navControls = document.createElement('div');
            navControls.className = 'carousel-nav d-flex justify-content-between align-items-center mt-3';

            // Previous button
            const prevBtn = document.createElement('button');
            prevBtn.className = 'btn btn-outline-primary btn-sm';
            prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> Previous Level';
            prevBtn.onclick = () => this.previousLevel();

            // Level indicator
            const levelIndicator = document.createElement('div');
            levelIndicator.className = 'level-indicator';
            const initialLevel = levelData.length > 0 && levelData[0].level === 0 ? "Ground" : "Level 1";
            levelIndicator.innerHTML = `<small><span class="current-level">${initialLevel}</span> of ${levelData.length} levels</small>`;

            // Next button
            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn btn-outline-primary btn-sm';
            nextBtn.innerHTML = 'Next Level <i class="fas fa-chevron-right"></i>';
            nextBtn.onclick = () => this.nextLevel();

            navControls.appendChild(prevBtn);
            navControls.appendChild(levelIndicator);
            navControls.appendChild(nextBtn);
            carouselContainer.appendChild(navControls);
        }

        this.container.appendChild(carouselContainer);

        // Load the first SVG
        this.loadCarouselLevel(0);

        return true;
    }

    /**
     * Load a specific level in the carousel
     * @param {number} index - Index of the level to load
     */
    loadCarouselLevel(index) {
        if (!this.carouselData || index < 0 || index >= this.carouselData.length) return;

        const levelData = this.carouselData[index];
        this.currentCarouselIndex = index;

        // Update title
        const titleElement = this.container.querySelector('.level-title h5');
        if (titleElement) {
            titleElement.textContent = levelData.title;
        }

        // Update level indicator
        const currentLevelSpan = this.container.querySelector('.current-level');
        if (currentLevelSpan) {
            const displayPosition = index === 0 ? "Ground" : `Level ${index}`;
            currentLevelSpan.textContent = displayPosition;
        }

        // Load SVG into display area
        const displayArea = this.container.querySelector('.svg-display-area');
        if (displayArea) {
            displayArea.innerHTML = '';

            // Parse and load SVG
            const parser = new DOMParser();
            const doc = parser.parseFromString(levelData.svgContent, 'image/svg+xml');
            const svgElement = doc.documentElement;

            if (svgElement && svgElement.tagName.toLowerCase() === 'svg') {
                this.currentSvg = svgElement;
                this.originalWidth = svgElement.getAttribute('width');
                this.originalHeight = svgElement.getAttribute('height');

                // Just append SVG as-is - Grasshopper controls all dimensions
                svgElement.style.display = 'block';
                svgElement.style.margin = 'auto';

                displayArea.appendChild(svgElement);

                // Reorder layers after inserting
                this.applyLayerOrder();
            }
        }
    }

    /**
     * Navigate to next level
     */
    nextLevel() {
        if (!this.carouselData) return;
        const nextIndex = (this.currentCarouselIndex + 1) % this.carouselData.length;
        this.loadCarouselLevel(nextIndex);
    }

    /**
     * Navigate to previous level
     */
    previousLevel() {
        if (!this.carouselData) return;
        const prevIndex = (this.currentCarouselIndex - 1 + this.carouselData.length) % this.carouselData.length;
        this.loadCarouselLevel(prevIndex);
    }

    /**
     * Get current SVG element
     * @returns {Element|null} Current SVG element
     */
    getCurrentSvg() {
        return this.currentSvg;
    }

    /**
     * Check if SVG is loaded
     * @returns {boolean} True if SVG is loaded
     */
    hasSvg() {
        return this.currentSvg !== null;
    }

    /**
     * Initialize an empty carousel that can have levels added progressively
     * @param {number} totalLevels - Total number of levels expected
     */
    initializeProgressiveCarousel(totalLevels) {
        // Initialize carousel data storage
        this.carouselData = [];
        this.totalExpectedLevels = totalLevels;
        this.currentCarouselIndex = 0;

        // Clear container and create carousel structure
        this.container.innerHTML = '';

        // Create carousel container
        const carouselContainer = document.createElement('div');
        carouselContainer.className = 'position-relative w-100 h-100';

        // Create level indicator/title
        const levelTitle = document.createElement('div');
        levelTitle.className = 'level-title text-center mb-3';
        levelTitle.innerHTML = `<h5 class="mb-0">Generating floor plans...</h5>`;
        carouselContainer.appendChild(levelTitle);

        // Create SVG display area with loading spinner
        const svgDisplayArea = document.createElement('div');
        svgDisplayArea.className = 'svg-display-area position-relative d-flex align-items-center justify-content-center';
        svgDisplayArea.style.height = 'calc(100% - 100px)'; // Leave space for controls
        svgDisplayArea.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted">Generating level 1 of ${totalLevels}...</p>
            </div>
        `;
        carouselContainer.appendChild(svgDisplayArea);

        // Create navigation controls (disabled initially)
        if (totalLevels > 1) {
            const navControls = document.createElement('div');
            navControls.className = 'carousel-nav d-flex justify-content-between align-items-center mt-3';

            // Previous button
            const prevBtn = document.createElement('button');
            prevBtn.className = 'btn btn-outline-primary btn-sm';
            prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> Previous Level';
            prevBtn.onclick = () => this.previousLevel();
            prevBtn.disabled = true;

            // Level indicator
            const levelIndicator = document.createElement('div');
            levelIndicator.className = 'level-indicator';
            levelIndicator.innerHTML = `<small><span class="current-level">Generating...</span> of ${totalLevels} levels</small>`;

            // Next button
            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn btn-outline-primary btn-sm';
            nextBtn.innerHTML = 'Next Level <i class="fas fa-chevron-right"></i>';
            nextBtn.onclick = () => this.nextLevel();
            nextBtn.disabled = true;

            navControls.appendChild(prevBtn);
            navControls.appendChild(levelIndicator);
            navControls.appendChild(nextBtn);
            carouselContainer.appendChild(navControls);
        }

        this.container.appendChild(carouselContainer);
        return true;
    }

    /**
     * Add a single level to the progressive carousel
     * @param {Object} levelData - Level object with svgContent, title, level
     */
    addLevelToCarousel(levelData) {
        if (!levelData || !this.carouselData) return false;

        // Add to carousel data
        this.carouselData.push(levelData);
        const currentCount = this.carouselData.length;

        // Update progress in the display area if this is the first level
        if (currentCount === 1) {
            // Load the first level immediately
            this.loadCarouselLevel(0);

            // Enable navigation if multiple levels expected
            if (this.totalExpectedLevels > 1) {
                const navButtons = this.container.querySelectorAll('.carousel-nav button');
                navButtons.forEach(btn => btn.disabled = false);
            }
        }

        // Update level indicator with current progress
        const currentLevelSpan = this.container.querySelector('.current-level');
        if (currentLevelSpan && currentCount === this.currentCarouselIndex + 1) {
            // Update indicator for current level being viewed
            const displayPosition = this.currentCarouselIndex === 0 ? "Ground" : `Level ${this.currentCarouselIndex}`;
            currentLevelSpan.textContent = displayPosition;
        }

        // Update generation status if still generating
        if (currentCount < this.totalExpectedLevels) {
            const nextLevelNum = currentCount + 1;
            const statusText = this.container.querySelector('.svg-display-area p');
            if (statusText && statusText.textContent.includes('Generating')) {
                statusText.textContent = `Generating level ${nextLevelNum} of ${this.totalExpectedLevels}...`;
            }
        }

        return true;
    }

    /**
     * Enforce a specific SVG layer stacking order.
     * The user requested top-down order (visual top first):
     *  1. 200_MODULE_MARKERS (topmost)
     *  2. 200_GRID
     *  3. 300_WALL_CUT
     *  4. 200_HIGHLIGHT (also hover-highlighted)
     *  5. The rest (below these)
     *
     * DOM painting draws later nodes on top, so we append in bottom-to-top order.
     * If the interpretation needs inversion (i.e. list provided is bottom-up), change the logic below.
     */
    applyLayerOrder() {
        if (!this.currentSvg) return;

        const desiredIds = [
            '200_MODULE_MARKERS',
            '200_GRID',
            '300_WALL_CUT',
            '200_HIGHLIGHT'
        ];

        let layerEls = Array.from(this.currentSvg.children).filter(el => el.id);

        // Promote nested desired IDs (if any) to root level
        const missingDesired = desiredIds.filter(id => !layerEls.some(el => el.id === id));
        if (missingDesired.length) {
            missingDesired.forEach(mId => {
                const deep = this.currentSvg.querySelector(`[id="${mId}"]`);
                if (deep && deep.parentNode !== this.currentSvg) {
                    this.currentSvg.appendChild(deep);
                }
            });
            layerEls = Array.from(this.currentSvg.children).filter(el => el.id);
        }

        if (!layerEls.length) return;

        const resolveElement = (targetId) => {
            return layerEls.find(el => el.id === targetId)
                || layerEls.find(el => el.id && el.id.trim && el.id.trim() === targetId)
                || layerEls.find(el => el.id && el.id.startsWith(targetId))
                || null;
        };

        const specified = desiredIds.map(id => resolveElement(id)).filter(Boolean);
        const specifiedSet = new Set(specified);
        const remaining = layerEls.filter(el => !specifiedSet.has(el));

        const bottomToTop = [...remaining, ...specified.slice().reverse()];
        bottomToTop.forEach(el => this.currentSvg.appendChild(el));
    }
}

// Export for use in other modules
export default SvgManager;