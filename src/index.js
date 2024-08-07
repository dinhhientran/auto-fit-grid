// src/index.js
import AutoFitGrid from './AutoFitGrid.js';

// Export for Node.js and ES6 import
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = AutoFitGrid;
} else if (typeof define === 'function' && define.amd) {
    // AMD support
    define([], () => AutoFitGrid);
} else {
    // Browser globals
    window.AutoFitGrid = AutoFitGrid; // Make it globally available
}
