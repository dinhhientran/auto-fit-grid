(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but only CommonJS-like environments that support module.exports, like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.AutoFitGrid = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    class AutoFitGrid {
        constructor(options = {}) {
            this.container = options.container;
            this.debugContainer = options.debugContainer;
            this.distributeRemainingSpace = options.distributeRemainingSpace !== false; // Default to true
            this.showDebug = options.showDebug || false;
            this.adjustmentThreshold = options.adjustmentThreshold || 200;

            if (!this.container) {
                throw new Error("Container is required.");
            }

            if (!document.getElementById('textMeasure')) {
                this.measureElement = document.createElement('div');
                this.measureElement.id = 'textMeasure';
                this.measureElement.style.position = 'absolute';
                this.measureElement.style.visibility = 'hidden';
                this.measureElement.style.height = 'auto';
                this.measureElement.style.width = 'fit-content';
                document.body.appendChild(this.measureElement);
            } else {
                this.measureElement = document.getElementById('textMeasure');
            }

            this.headerSelector = options.headerSelector || '.grid-header';
            this.columnSelector = options.columnSelector || '.grid-item';
            this.headers = this.container.querySelectorAll(this.headerSelector);
            this.items = this.container.querySelectorAll(this.columnSelector);
            this.columns = this.headers.length;

            this.defaultWrapRatios = {
                'text': options.defaultWrapRatios?.text || 4.5,
                'date': options.defaultWrapRatios?.date || 8.0,
                'datetime': options.defaultWrapRatios?.datetime || 7.0,
                'number': options.defaultWrapRatios?.number || 7.0,
                'email': options.defaultWrapRatios?.email || 12.0,
                ...options.defaultWrapRatios
            };

            this.defaultMinWidth = options.defaultMinWidth || 50;
            this.defaultMaxWidth = options.defaultMaxWidth || Infinity;

            this.actualMaxWidths = new Array(this.columns).fill(0);

            this.init();
        }

        init() {
            this.detectColumnTypes();
            this.calculateColumnWidths();
            window.addEventListener('resize', this.debounce(() => this.calculateColumnWidths(), 100));
        }

        debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }

        getTextWidthHeight(text, font, fontSize, fontWeight, paddingLeft, paddingRight, borderStyle, width) {
            this.measureElement.style.fontFamily = font;
            this.measureElement.style.fontSize = fontSize;
            this.measureElement.style.fontWeight = fontWeight;
            this.measureElement.style.paddingLeft = paddingLeft;
            this.measureElement.style.paddingRight = paddingRight;
            this.measureElement.style.border = borderStyle;
            this.measureElement.style.width = width ? `${width}px` : 'fit-content';
            this.measureElement.style.height = 'auto';
            this.measureElement.textContent = text;
            const rect = this.measureElement.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height
            };
        }

        findOptimalWidth(text, font, fontSize, fontWeight, paddingLeft, paddingRight, borderStyle, wrapRatio, minWidth, step = 10, forceSingleLine = false) {
            const wordCount = text.split(' ').length;

            if (wordCount <= 2 || forceSingleLine) {
                const maxWidthDimensions = this.getTextWidthHeight(text, font, fontSize, fontWeight, paddingLeft, paddingRight, borderStyle);
                this.debug(`Header with ${wordCount} word(s) or force single line, setting width to ${Math.ceil(maxWidthDimensions.width)}px to keep in one line`);
                this.debug(`Actual max width before ceiling: ${maxWidthDimensions.width}px`);
                return Math.ceil(maxWidthDimensions.width);
            }

            const maxWidthDimensions = this.getTextWidthHeight(text, font, fontSize, fontWeight, paddingLeft, paddingRight, borderStyle);
            const actualMaxWidth = maxWidthDimensions.width;
            this.debug(`Actual max width of the text: ${actualMaxWidth}px`);

            let width = minWidth;
            let bestWidth = width;

            while (width <= actualMaxWidth) {
                const dimensions = this.getTextWidthHeight(text, font, fontSize, fontWeight, paddingLeft, paddingRight, borderStyle, width);
                const ratio = dimensions.width / dimensions.height;
                this.debug(`Width: ${width}px, Height: ${dimensions.height}px, Calculated Ratio: ${ratio}`);
                if (ratio >= wrapRatio) {
                    bestWidth = width;
                    break;
                }
                width += step;
            }

            this.debug(`Optimal width before ceiling: ${bestWidth}px`);
            return Math.ceil(bestWidth);
        }

        calculateColumnWidth(index) {
            const header = this.headers[index];
            const fixedWidth = header.getAttribute('data-fixed-width');
            if (fixedWidth) {
                this.debug(`Fixed width for column ${index}: ${fixedWidth}px`);
                return parseFloat(fixedWidth);
            }

            const type = header.getAttribute('data-type') || this.detectedColumnTypes[index];
            const customWrapRatio = header.getAttribute('data-wrap-ratio');
            const wrapRatio = customWrapRatio ? parseFloat(customWrapRatio) : this.defaultWrapRatios[type];
            const font = window.getComputedStyle(header).fontFamily;
            const fontSize = window.getComputedStyle(header).fontSize;
            const fontWeight = window.getComputedStyle(header).fontWeight;
            const paddingLeft = window.getComputedStyle(header).paddingLeft;
            const paddingRight = window.getComputedStyle(header).paddingRight;
            const borderStyle = window.getComputedStyle(header).border;
            const minWidth = this.defaultMinWidth;
            const maxWidth = this.defaultMaxWidth;

            this.debug(`Calculating optimal width for header: "${header.textContent}" with type "${type}", wrap ratio ${wrapRatio}`);
            let forceSingleLine = type === 'date' || type === 'datetime' || type === 'number';
            let optimalWidth = this.findOptimalWidth(header.textContent, font, fontSize, fontWeight, paddingLeft, paddingRight, borderStyle, wrapRatio, minWidth, 10, forceSingleLine);
            optimalWidth = Math.max(optimalWidth, minWidth);
            optimalWidth = Math.min(optimalWidth, maxWidth);
            this.actualMaxWidths[index] = this.getTextWidthHeight(header.textContent, font, fontSize, fontWeight, paddingLeft, paddingRight, borderStyle).width;
            this.debug(`Optimal width for header: ${optimalWidth}px`);

            this.items.forEach((item, itemIndex) => {
                if (itemIndex % this.columns === index) {
                    const itemFont = window.getComputedStyle(item).fontFamily;
                    const itemFontSize = window.getComputedStyle(item).fontSize;
                    const itemFontWeight = window.getComputedStyle(item).fontWeight;
                    const itemPaddingLeft = window.getComputedStyle(item).paddingLeft;
                    const itemPaddingRight = window.getComputedStyle(item).paddingRight;
                    const itemBorderStyle = window.getComputedStyle(item).border;
                    let itemWidth = this.findOptimalWidth(item.textContent, itemFont, itemFontSize, itemFontWeight, itemPaddingLeft, itemPaddingRight, itemBorderStyle, wrapRatio, minWidth, 10, forceSingleLine);
                    itemWidth = Math.max(itemWidth, minWidth);
                    itemWidth = Math.min(itemWidth, maxWidth);
                    if (itemWidth > optimalWidth) {
                        optimalWidth = itemWidth;
                    }
                    const maxWidthItem = this.getTextWidthHeight(item.textContent, itemFont, itemFontSize, itemFontWeight, itemPaddingLeft, itemPaddingRight, itemBorderStyle).width;
                    if (maxWidthItem > this.actualMaxWidths[index]) {
                        this.actualMaxWidths[index] = maxWidthItem;
                    }
                    this.debug(`Checked item: "${item.textContent}" - width: ${itemWidth}px, current optimal width: ${optimalWidth}px`);
                }
            });

            this.debug(`Final optimal width for column ${index}: ${optimalWidth}px`);
            return optimalWidth;
        }

        getPaddingAndGap(element) {
            const style = window.getComputedStyle(element);
            const paddingLeft = parseFloat(style.paddingLeft) || 0;
            const paddingRight = parseFloat(style.paddingRight) || 0;
            const borderLeft = parseFloat(style.borderLeftWidth) || 0;
            const borderRight = parseFloat(style.borderRightWidth) || 0;
            const padding = paddingLeft + paddingRight + borderLeft + borderRight;
            const gap = parseFloat(style.gap) || 0;

            this.debug(`Padding: ${padding}px (Padding Left: ${paddingLeft}px, Padding Right: ${paddingRight}px, Border Left: ${borderLeft}px, Border Right: ${borderRight}px), Gap: ${gap}px`);
            return { padding, gap };
        }

        distributeSpareSpace(columnWidths, availableWidth) {
            if (!this.distributeRemainingSpace) {
                this.debug(`Skipping distribution of remaining space as distributeRemainingSpace is set to false.`);
                return columnWidths;
            }

            const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
            let remainingSpace = availableWidth - totalWidth;

            this.debug(`Total width: ${totalWidth}px, Available width: ${availableWidth}px, Remaining space: ${remainingSpace}px`);

            const prioritizeColumns = [];
            const otherColumns = [];
            const exceedingMaxWidthColumns = [];

            this.headers.forEach((header, index) => {
                const fixedWidth = header.getAttribute('data-fixed-width');
                if (fixedWidth) return;
                if (header.getAttribute('data-prioritize-spare-space') === 'true') {
                    prioritizeColumns.push(index);
                } else {
                    otherColumns.push(index);
                }
                if (columnWidths[index] >= this.defaultMaxWidth) {
                    exceedingMaxWidthColumns.push(index);
                }
            });

            const distributeSpaceEqually = (columns) => {
                let hasRemainingSpace = true;

                while (remainingSpace > 0 && hasRemainingSpace) {
                    hasRemainingSpace = false;
                    const spareSpacePerColumn = remainingSpace / columns.length;

                    columns.forEach(index => {
                        if (columnWidths[index] < this.actualMaxWidths[index]) {
                            const spaceToAdd = Math.min(spareSpacePerColumn, this.actualMaxWidths[index] - columnWidths[index]);
                            columnWidths[index] += spaceToAdd;
                            remainingSpace -= spaceToAdd;
                            if (spaceToAdd > 0) hasRemainingSpace = true;
                        }
                    });
                }
            };

            distributeSpaceEqually(prioritizeColumns);
            distributeSpaceEqually(otherColumns);

            this.debug(`Column widths after distributing spare space: ${columnWidths.join(', ')}`);
            this.debug(`Remaining spare space after distribution: ${remainingSpace}px`);

            if (remainingSpace > 0) {
                const columnsToDistribute = exceedingMaxWidthColumns.length > 0 ? exceedingMaxWidthColumns : Array.from({ length: this.columns }, (_, i) => i).filter(index => !this.headers[index].getAttribute('data-fixed-width'));
                const spareSpacePerColumn = remainingSpace / columnsToDistribute.length;
                columnsToDistribute.forEach(index => {
                    columnWidths[index] += spareSpacePerColumn;
                });
                this.debug(`Distributed remaining spare space equally to exceeding max width columns. Column widths: ${columnWidths.join(', ')}`);
            }

            return columnWidths;
        }

        adjustWidthsToFit(columnWidths, availableWidth) {
            let totalWidth = columnWidths.reduce((a, b) => a + b, 0);

            if (totalWidth > availableWidth && (totalWidth - availableWidth) < this.adjustmentThreshold) {
                this.debug(`Total width (${totalWidth}px) exceeds available width (${availableWidth}px) by less than ${this.adjustmentThreshold}px. Adjusting widths...`);
                let remainingSpace = totalWidth - availableWidth;
                let totalAdjustment = 0;

                let minHeaderWidths = columnWidths.map((width, i) => {
                    const headerText = this.headers[i].textContent.trim();
                    const wordCount = headerText.split(' ').length;
                    if (wordCount <= 2) {
                        const dimensions = this.getTextWidthHeight(headerText, window.getComputedStyle(this.headers[i]).fontFamily, window.getComputedStyle(this.headers[i]).fontSize, window.getComputedStyle(this.headers[i]).fontWeight, window.getComputedStyle(this.headers[i]).paddingLeft, window.getComputedStyle(this.headers[i]).paddingRight, window.getComputedStyle(this.headers[i]).border, null);
                        return dimensions.width;
                    }
                    return this.defaultMinWidth;
                });

                let adjustableColumns = [];
                let totalWeight = 0;

                for (let i = 0; i < columnWidths.length; i++) {
                    const fixedWidth = this.headers[i].getAttribute('data-fixed-width');
                    if (fixedWidth) continue;

                    const type = this.headers[i].getAttribute('data-type') || this.detectedColumnTypes[i];
                    const isAdjustable = type === 'text';

                    if (isAdjustable) {
                        const minWidth = this.headers[i].getAttribute('data-min-width') ? parseFloat(this.headers[i].getAttribute('data-min-width')) : this.defaultMinWidth;
                        const minHeaderWidth = minHeaderWidths[i];
                        const effectiveMinWidth = Math.max(minWidth, minHeaderWidth);

                        if (columnWidths[i] > effectiveMinWidth) {
                            const wrapRatio = this.defaultWrapRatios[type];
                            const textLength = Math.max(...Array.from(this.items)
                                .filter((_, index) => index % this.columns === i)
                                .map(item => item.textContent.trim().length));
                            const weight = wrapRatio * textLength;
                            adjustableColumns.push({ index: i, weight: weight, effectiveMinWidth: effectiveMinWidth });
                            totalWeight += weight;
                            this.debug(`Column ${i} is adjustable with wrap ratio ${wrapRatio} and text length ${textLength}. Calculated weight: ${weight}`);
                        } else {
                            this.debug(`Column ${i} cannot be adjusted further. Current width: ${columnWidths[i]}px, Effective min width: ${effectiveMinWidth}px`);
                        }
                    }
                }

                this.debug(`Total weight of all adjustable columns: ${totalWeight}`);

                adjustableColumns.forEach(column => {
                    column.adjustmentPercentage = column.weight / totalWeight;
                    this.debug(`Column ${column.index} adjustment percentage: ${column.adjustmentPercentage * 100}%`);
                });

                for (let { index, weight, effectiveMinWidth, adjustmentPercentage } of adjustableColumns) {
                    if (remainingSpace <= 0) break;

                    let maxPossibleAdjustment = columnWidths[index] - effectiveMinWidth;
                    let adjustment = Math.min(remainingSpace, maxPossibleAdjustment * adjustmentPercentage);
                    this.debug(`Before adjustment, width of column ${index}: ${columnWidths[index]}px`);
                    columnWidths[index] -= adjustment;
                    remainingSpace -= adjustment;
                    totalAdjustment += adjustment;
                    this.debug(`Adjusted width of column ${index} by ${adjustment}px (weight: ${weight}, adjustment percentage: ${adjustmentPercentage * 100}%). Remaining space to adjust: ${remainingSpace}px`);
                    this.debug(`After adjustment, width of column ${index}: ${columnWidths[index]}px`);
                    this.debug(`Adjust width of column ${index} by ${adjustment}px`);
                }

                let adjustedTotalWidth = columnWidths.reduce((a, b) => a + b, 0);
                this.debug(`Total width after adjustment: ${adjustedTotalWidth}px`);
                this.debug(`Total adjustment made: ${totalAdjustment}px`);
                this.debug(`Remaining spare space after adjustment: ${remainingSpace}px`);
            }

            return columnWidths;
        }

        calculateColumnWidths() {
            if (this.showDebug && this.debugContainer) {
                this.debugContainer.innerHTML += '<br /><br /><br />';
            }

            let columnWidths = new Array(this.columns).fill(0);

            for (let i = 0; i < this.columns; i++) {
                columnWidths[i] = this.calculateColumnWidth(i);
            }

            const containerWidth = this.container.clientWidth;
            const { padding, gap } = this.getPaddingAndGap(this.container);
            const totalGap = gap * (this.columns - 1);
            const availableWidth = containerWidth - padding - totalGap;

            if (this.showDebug) {
                this.debug(`Container width: ${containerWidth}px, Container padding: ${padding}px, Total gap: ${totalGap}px, Available width: ${availableWidth}px`);
                this.debug(`Column widths before distributing spare space: ${columnWidths.join(', ')}`);
            }

            if (this.distributeRemainingSpace) {
                columnWidths = this.distributeSpareSpace(columnWidths, availableWidth);
            }
            columnWidths = this.adjustWidthsToFit(columnWidths, availableWidth);

            if (this.showDebug) {
                this.debug(`Column widths after adjustment: ${columnWidths.join(', ')}`);
            }

            let gridTemplateColumns = columnWidths.map(width => `${width}px`).join(' ');
            this.container.style.gridTemplateColumns = gridTemplateColumns;

            if (this.showDebug) {
                this.debug(`Final grid template columns: ${gridTemplateColumns}`);
            }

            this.updateHeaderGroupWidths(columnWidths);
        }

        updateHeaderGroupWidths(columnWidths) {
            const headerGroups = this.container.parentElement.querySelectorAll('.header-group-container .header-group');
            headerGroups.forEach(headerGroup => {
                const groupName = headerGroup.getAttribute('data-group');
                const columns = Array.from(this.headers).filter(header => header.getAttribute('data-for') === groupName);
                const groupWidth = columns.map(col => columnWidths[this.getColumnIndexByName(col)]).reduce((a, b) => a + b, 0);

                const headerStyle = window.getComputedStyle(columns[0]);
                const headerPadding = (parseFloat(headerStyle.paddingLeft) || 0) + (parseFloat(headerStyle.paddingRight) || 0);
                const headerBorder = (parseFloat(headerStyle.borderLeftWidth) || 0) + (parseFloat(headerStyle.borderRightWidth) || 0);
                const gap = parseFloat(headerStyle.gap) || 0;

                const groupStyle = window.getComputedStyle(headerGroup);
                const groupPadding = (parseFloat(groupStyle.paddingLeft) || 0) + (parseFloat(groupStyle.paddingRight) || 0);
                const groupBorder = (parseFloat(groupStyle.borderLeftWidth) || 0) + (parseFloat(groupStyle.borderRightWidth) || 0);

                const totalGroupWidth = groupWidth + headerPadding * columns.length + headerBorder * columns.length + gap * (columns.length - 1) + groupPadding + groupBorder;

                headerGroup.style.width = `${totalGroupWidth}px`;
                this.debug(`Updated header group width: ${headerGroup.textContent} - width: ${totalGroupWidth}px`);
            });
        }

        getColumnIndexByName(header) {
            return Array.from(this.headers).findIndex(h => h === header);
        }

        detectColumnTypes() {
            this.detectedColumnTypes = new Array(this.columns).fill('text');

            this.headers.forEach((header, index) => {
                if (!header.getAttribute('data-type')) {
                    const type = this.inferColumnType(index);
                    this.detectedColumnTypes[index] = type;
                    header.setAttribute('data-type', type);
                    if (this.showDebug) {
                        this.debug(`Inferred type for column ${index}: ${type}`);
                    }
                }
            });
        }

        inferColumnType(columnIndex) {
            const sampleSize = Math.min(10, this.items.length / this.columns);
            let textCount = 0, numberCount = 0, dateCount = 0, datetimeCount = 0, emailCount = 0;

            for (let i = 0; i < sampleSize; i++) {
                const item = this.items[i * this.columns + columnIndex];
                const text = item.textContent.trim();
                if (this.isDateTime(text)) datetimeCount++;
                else if (this.isDate(text)) dateCount++;
                else if (this.isNumber(text)) numberCount++;
                else if (this.isEmail(text)) emailCount++;
                else textCount++;
            }

            if (datetimeCount > dateCount && datetimeCount > numberCount && datetimeCount > textCount && datetimeCount > emailCount) return 'datetime';
            if (dateCount > numberCount && dateCount > textCount && dateCount > emailCount) return 'date';
            if (numberCount > dateCount && numberCount > textCount && numberCount > emailCount) return 'number';
            if (emailCount > dateCount && emailCount > numberCount && emailCount > textCount) return 'email';
            return 'text';
        }

        isDate(text) {
            return !isNaN(Date.parse(text)) && text.indexOf(':') === -1;
        }

        isDateTime(text) {
            return !isNaN(Date.parse(text)) && text.indexOf(':') !== -1;
        }

        isNumber(text) {
            return !isNaN(parseFloat(text)) && isFinite(text);
        }

        isEmail(text) {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailPattern.test(text);
        }

        setDebugMode(enabled) {
            this.showDebug = enabled;
            if (this.debugContainer) {
                this.debugContainer.style.display = enabled ? 'block' : 'none';
            }
        }

        debug(message) {
            if (this.showDebug) {
                if (this.debugContainer) {
                    const debugItem = document.createElement('div');
                    debugItem.className = 'debug-item';
                    debugItem.textContent = message;
                    this.debugContainer.appendChild(debugItem);
                }
            }
        }
    }

    return AutoFitGrid;
}));
