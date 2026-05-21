import './style.css'
import * as d3 from 'd3';

// Globals
let data = null;
let categories = null;
let nodes_data = null;
let links_data = null;
let svg = null;
let currentHash = 'scatter';
let width = 900;
let height = 500;
const chartDiv = document.getElementById('chart');

// Configuration
// Chart coordiantes
const chartCoordinates = {
    xMin: -123.025, xMax: -122.78,
    yMin: 37.96, yMax: 38.07,
    centroid: { x: -122.9, y: 38.01 }  // center of your data space
};

// D3 chart dimensions
const margin = { top: 12, right: 12, bottom: 12, left: 12 };

// Aspect ratio configuration for each chart type
const aspectRatios = {
    scatter: 16 / 9,   // landscape
    packed: 16 / 9,         // square
    web: 16 / 9,         // slightly wider
    graph: 16 / 9
};

// Animation config
const animationProperties = {
    duration: 2500,
    delay: 2500
};

// Taxon category colours
const categoryColors = {
    'Actinopterygii': '#66b3ff',
    'Amphibia': '#3377ff',
    'Arachnida': '#000000',
    'Aves': '#f2df61',
    'Fungi': '#52cba3',
    'Insecta': '#aa8631',
    'Mammalia': '#bb5465',
    'Mollusca': '#8a560e',
    'Plantae': '#0f9954',
    'Protozoa': '#a1e6e6',
    'Reptilia': '#d9c194',
    'Other': '#d4d4d4'
};

// Species images configuration
const speciesImages = {
    'Ochre Sea Star': 'assets/starfish.jpeg'
};

// Load and process data
async function loadData() {
    data = await d3.csv('assets/iNat_TidalSample.csv');
    categories = [...new Set(data.map(d => d.taxon_category_name).filter(c => c))];

    console.log('Categories:', categories);
    console.log('Data sample:', data.slice(0, 5));

    // Load food web data
    nodes_data = await d3.csv('assets/foodWeb_nodes.csv');
    links_data = await d3.csv('assets/foodWeb_links.csv');
    console.log('Food web nodes:', nodes_data);
    console.log('Food web links:', links_data);


    // Initialize chart and setup listeners
    initSVG();
    redraw();
    window.addEventListener('hashchange', () => redraw());
    window.addEventListener('resize', () => redraw());
}

// Initialize SVG container
function initSVG() {
    svg = d3.select(chartDiv).append('svg');
}

// Extract container dimensions and redraw
function redraw() {
    // Get the container dimensions from CSS
    const containerWidth = chartDiv.clientWidth;
    const containerHeight = chartDiv.clientHeight;

    // Calculate dimensions maintaining aspect ratio
    const aspectRatio = aspectRatios[currentHash] || 16 / 9;
    let newWidth, newHeight;

    if (containerWidth / aspectRatio < containerHeight) {
        // Width is limiting
        newWidth = containerWidth;
        newHeight = newWidth / aspectRatio;
    } else {
        // Height is limiting
        newHeight = containerHeight;
        newWidth = newHeight * aspectRatio;
    }

    width = Math.floor(newWidth);
    height = Math.floor(newHeight);

    // Set SVG dimensions
    svg
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);

    // Get current and new hash
    const newHash = window.location.hash.slice(1) || 'scatter';
    const previousHash = currentHash;

    // Determine transition type and render accordingly
    const transition = `${previousHash}-${newHash}`;

    if (transition === 'packed-web') {
        // packed -> web transition: preserve animation
        svg.selectAll('*').remove();
        currentHash = newHash;
        renderPackedToWeb();
    } else if (transition === 'web-packed') {
        // web -> packed transition: preserve animation
        // svg.selectAll('*').remove();
        currentHash = newHash;
        renderWebToPacked();
    } else if (transition === 'graph-packed') {
        // graph -> packed transition: preserve animation
        // svg.selectAll('*').remove();
        currentHash = newHash;
        renderGraphToPacked();
    } else {
        // All other transitions: clear and render based on new hash
        svg.selectAll('*').remove();
        currentHash = newHash;

        if (newHash === 'scatter') renderScatter();
        else if (newHash === 'packed') renderScatterToPacked();
        else if (newHash === 'web') renderPackedToWeb();
        else if (newHash === 'graph') renderPackedToGraph();
    }
}

// Helper functions
function createColorScale() {
    return d3.scaleOrdinal()
        .domain(categories)
        .range(categories.map(c => categoryColors[c] || '#999'));
}

function createPackedLayout(sortOption = null) {
    // Group data by common_name and count
    const nested = d3.rollups(data, v => v.length, d => d.common_name)
        .map(([name, count]) => ({
            name,
            value: count,
            category: data.find(d => d.common_name === name).taxon_category_name
        }));

    // Sort if option provided
    if (sortOption === 'count') {
        nested.sort((a, b) => b.value - a.value);
    } else if (sortOption === 'category') {
        nested.sort((a, b) => {
            if (a.category !== b.category) {
                return a.category.localeCompare(b.category);
            }
            return b.value - a.value;
        });
    }

    const root = d3.hierarchy({ children: nested })
        .sum(d => d.value);

    const pack = d3.pack()
        .size([width, height])
        .padding(3);
    const packed = pack(root);

    return packed;
}

function getSpeciesInGraph() {
    const speciesInGraph = new Set();
    nodes_data.forEach(node => {
        if (node.common_name && node.common_name.trim()) {
            speciesInGraph.add(node.common_name);
        }
    });
    console.log('Species in graph:', speciesInGraph);
    return speciesInGraph;
}

// Tooltip helper function
function attachTooltip(selection) {
    // Create tooltip if it doesn't exist
    let tooltip = d3.select('.tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('#chart')
            .append('div')
            .attr('class', 'tooltip')
    }

    selection
        .on('mouseover', function (event, d) {
            tooltip.style('opacity', 1);
            d3.select(this)
                .style('stroke', 'black')
                .style('stroke-width', 1.5)
                .style('opacity', 1);
        })
        .on('mousemove', function (event, d) {
            const source = d.data ? d.data : d;
            const name = source.name || source.id || 'Unknown';
            const count = source.value || source.count || 'N/A';
            const category = source.category || source.taxon_category_name || 'Other';
            const tooltipText = `<strong>${name}</strong><br/>Count: ${count}<br/>Category: ${category}`;
            tooltip
                .html(tooltipText)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseleave', function (event, d) {
            tooltip.style('opacity', 0);
            d3.select(this)
                .style('stroke', 'none')
                .style('opacity', null);
        });
}

// Render scatter plot
function renderScatter() {
    const x = d3.scaleLinear()
        .domain([chartCoordinates.xMin, chartCoordinates.xMax])
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
        .domain([chartCoordinates.yMin, chartCoordinates.yMax])
        .range([height - margin.bottom, margin.top]);

    const colorScale = createColorScale();

    // Add a layer of diamonds
    const symbolGenerator = d3.symbol().type(d3.symbolDiamond).size(8);

    svg.append('g')
        .attr('class', 'points')
        .attr('fill-opacity', 1)
        .selectAll('path')
        .data(data)
        .join('path')
        .attr('transform', d => `translate(${x(+d.long)},${y(+d.lat)})`)
        .attr('d', symbolGenerator)
        .attr('fill', d => colorScale(d.taxon_category_name))
}

// Renders a scatter plot and then transitions points to packed circles
function renderScatterToPacked(sortOption) {
    // Create scatter coordinate system to get original positions
    const xScatter = d3.scaleLinear()
        .domain([chartCoordinates.xMin, chartCoordinates.xMax])
        .range([margin.left, width - margin.right]);

    const yScatter = d3.scaleLinear()
        .domain([chartCoordinates.yMin, chartCoordinates.yMax])
        .range([height - margin.bottom, margin.top]);

    const colorScale = createColorScale();
    const packed = createPackedLayout(sortOption);

    // Create a map of common_name to packed circle position
    const packedMap = new Map(
        packed.leaves().map(leaf => [leaf.data.name, { x: leaf.x, y: leaf.y, r: leaf.r }])
    );

    // Create mapping of data to packed circle positions
    const sortedData = data.map((d, i) => {
        const pos = packedMap.get(d.common_name);

        // Original positions from scatter plot
        const originalX = xScatter(+d.long);
        const originalY = yScatter(+d.lat);

        // Target position: center of packed circle with minimal jitter
        const angle = Math.random() * 2 * Math.PI;
        const sortedX = pos.x + Math.cos(angle);
        const sortedY = pos.y + Math.sin(angle);

        return {
            ...d,
            originalX,
            originalY,
            sortedX,
            sortedY
        };
    });

    // Create diamond symbols
    const symbolGenerator = d3.symbol().type(d3.symbolDiamond).size(8);

    // Render diamonds at original positions first
    svg.append('g')
        .attr('class', 'points')
        .attr('fill-opacity', 1)
        .selectAll('path')
        .data(sortedData)
        .join('path')
        .attr('d', symbolGenerator)
        .attr('transform', d => `translate(${d.originalX},${d.originalY})`)
        .attr('fill', d => colorScale(d.taxon_category_name))
        .transition()
        .duration(animationProperties.duration)
        .attr('d', d3.symbol().type(d3.symbolDiamond).size(2))
        .attr('transform', d => `translate(${d.sortedX},${d.sortedY})`)
        .remove();

    // Render circles
    const circles = svg.append('g')
        .attr('class', 'packed-circles')
        .selectAll('circle')
        .data(packed.leaves())
        .join('circle')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('fill', d => colorScale(d.data.category))
        .transition()
        .duration(animationProperties.duration * 1.5)
        .attr('r', d => d.r);

    // Attach tooltip to circles
    attachTooltip(svg.selectAll('.packed-circles circle'));
}

// Renders food web layout as graph
function renderPackedToGraph(sortOption) {
    const colorScale = createColorScale();
    const packed = createPackedLayout(sortOption);
    const speciesInGraph = getSpeciesInGraph();
    // const allHierarchyObjects = createFoodWebHierarchy();

    // Extract links from hierarchies
    // const allLinks = allHierarchyObjects.flatMap(h => h.links());

    // Render circles (on top of links)
    const circles = svg.append('g')
        .attr('class', 'food-web-circles')
        .selectAll('circle')
        .data(packed.leaves())
        .join('circle')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', d => d.r)
        .attr('fill', d => colorScale(d.data.category))
        .attr('fill-opacity', 1);

    // Attach tooltips to food web circles
    attachTooltip(circles);

    // Transition circles not in food web to invisible and remove
    circles.filter(d => !speciesInGraph.has(d.data.name))
        .transition()
        .duration(animationProperties.duration)
        .attr('fill-opacity', 0)
        .remove();

    const graphCircles = circles.filter(d => speciesInGraph.has(d.data.name));

    // Transition remaining circles - resize and keep them visible for the graph layout
    const graphTransition = graphCircles
        .transition()
        .delay(animationProperties.duration / 2)
        .duration(animationProperties.duration)
        .attr('r', 10);

    const links = links_data.map(d => ({ ...d }));
    const nodes = nodes_data.map(d => ({ ...d }));

    const packedPositions = new Map(
        packed.leaves().map(leaf => [leaf.data.name, leaf])
    );

    // Initialize simulation nodes at their packed positions so the circles can move smoothly.
    nodes.forEach(node => {
        const packedNode = packedPositions.get(node.common_name);
        if (packedNode) {
            node.x = packedNode.x;
            node.y = packedNode.y;
        }
    });

    function startGraph() {
        // Add a line for each link.
        const link = svg.append("g")
            .attr("class", "food-web-links")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll()
            .data(links)
            .join("line")
            .attr("stroke-width", d => Math.sqrt(d.value));

        const getName = ref => typeof ref === 'string'
            ? ref
            : ref?.common_name || ref?.id || ref?.name;

        const adjacency = new Map();
        links.forEach(linkDatum => {
            const sourceName = getName(linkDatum.source);
            const targetName = getName(linkDatum.target);

            if (!adjacency.has(sourceName)) adjacency.set(sourceName, new Set());
            if (!adjacency.has(targetName)) adjacency.set(targetName, new Set());

            adjacency.get(sourceName).add(targetName);
            adjacency.get(targetName).add(sourceName);
        });

        graphCircles.on('click', function(event, d) {
            event.stopPropagation();
            const selectedName = d.data.name;
            const neighbors = adjacency.get(selectedName) || new Set();

            graphCircles
                .attr('fill-opacity', node => node.data.name === selectedName || neighbors.has(node.data.name) ? 1 : 0.2)
                .attr('stroke', node => node.data.name === selectedName ? '#000' : neighbors.has(node.data.name) ? '#666' : 'none')
                .attr('stroke-width', node => node.data.name === selectedName ? 3 : neighbors.has(node.data.name) ? 2 : 0);

            link
                .attr('stroke', linkDatum => {
                    const sourceName = getName(linkDatum.source);
                    const targetName = getName(linkDatum.target);
                    return sourceName === selectedName || targetName === selectedName ? '#000' : '#999';
                })
                .attr('stroke-opacity', linkDatum => {
                    const sourceName = getName(linkDatum.source);
                    const targetName = getName(linkDatum.target);
                    return sourceName === selectedName || targetName === selectedName ? 1 : 0.15;
                });
        });

        svg.on('click', function(event) {
            if (event.target === this || event.target.tagName === 'svg') {
                graphCircles
                    .attr('fill-opacity', 1)
                    .attr('stroke', 'none')
                    .attr('stroke-width', 0);
                link
                    .attr('stroke', '#999')
                    .attr('stroke-opacity', 0.6);
            }
        });

        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.common_name).distance(100))
            .force('charge', d3.forceManyBody().strength(-75))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide(d => d.r + 5))
            .alpha(0.5) // "energy" of the simulation - start high for more movement
            .alphaDecay(0.5) // lower decay longer animation - slower to settle
            .velocityDecay(0.5) // friction - lower nodes move more, higher movement damps faster
            .on('tick', ticked);

        function ticked() {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            const positionByName = new Map(nodes.map(d => [d.common_name, d]));

            graphCircles
                .attr('cx', d => positionByName.get(d.data.name)?.x ?? d.x)
                .attr('cy', d => positionByName.get(d.data.name)?.y ?? d.y);
        }

        svg.select('.food-web-circles').raise(); // Ensure circles are on top of links
    }

    graphTransition.end().then(startGraph);
    return svg.node();
}

// Renders food web layout as packed circles (reverse of renderPackedToGraph)
function renderGraphToPacked() {
    const colorScale = createColorScale();

        // Fade out and remove links
        svg.select('.food-web-links')
            .transition()
            .duration(animationProperties.duration)
            .attr('opacity', 0)
            .remove();

        // Transition circles back to packed positions
        const packed = createPackedLayout();
        const packedMap = new Map(
            packed.leaves().map(leaf => [leaf.data.name, { x: leaf.x, y: leaf.y, r: leaf.r }])
        );

        svg.selectAll('.food-web-circles circle')
            .transition()
            .duration(animationProperties.duration)
            .attr('cx', d => packedMap.get(d.data.name)?.x ?? d.x)
            .attr('cy', d => packedMap.get(d.data.name)?.y ?? d.y)
            .attr('r', d => packedMap.get(d.data.name)?.r ?? d.r);
        
        // Add back circles that were not in the food web
        const speciesInWeb = new Set(links_data.flatMap(d => [d.source, d.target]));
        const allPackedSpecies = new Set(packed.leaves().map(d => d.data.name));
        const excludedSpecies = Array.from(allPackedSpecies).filter(name => !speciesInWeb.has(name));

        if (excludedSpecies.length > 0) {
            const excludedData = excludedSpecies.map(name => {
                return packed.leaves().find(d => d.data.name === name);
            });

            svg.append('g')
                .selectAll('circle')
                .data(excludedData, d => d.data.name)
                .join('circle')
                .attr('cx', d => d.x)
                .attr('cy', d => d.y)
                .attr('r', 0)
                .attr('fill', d => colorScale(d.data.category))
                .attr('fill-opacity', 0)
                .transition()
                .duration(animationProperties.duration)
                .attr('r', d => d.r)
                .attr('fill-opacity', 1);
        }

         // Attach tooltip to all circles
         attachTooltip(svg.selectAll('.food-web-circles circle'));
}
// Renders food web to packed circles (reverse of renderPackedToWeb)
function renderWebToPacked() {
    const colorScale = createColorScale();
    const packed = createPackedLayout();
    const speciesInWeb = getSpeciesInWeb();

    // Create a map of species name to packed circle position
    const packedMap = new Map(
        packed.leaves().map(leaf => [leaf.data.name, { x: leaf.x, y: leaf.y, r: leaf.r }])
    );

    // Fade out and remove links
    svg.select('.food-web-links')
        .transition()
        .duration(animationProperties.duration)
        .attr('opacity', 0)
        .remove();

    // Fade out and remove images
    svg.select('.food-web-images')
        .transition()
        .duration(animationProperties.duration)
        .attr('opacity', 0)
        .remove();

    // Transition circles back to packed positions
    svg.selectAll('circle')
        .transition()
        .delay(animationProperties.duration)
        .duration(animationProperties.duration)
        .attr('cx', d => packedMap.get(d.data.name).x)
        .attr('cy', d => packedMap.get(d.data.name).y)
        .attr('r', d => packedMap.get(d.data.name).r);

    // Add back circles that were not in the food web
    const allPackedSpecies = new Set(packed.leaves().map(d => d.data.name));
    const excludedSpecies = Array.from(allPackedSpecies).filter(name => !speciesInWeb.has(name));

    if (excludedSpecies.length > 0) {
        const excludedData = excludedSpecies.map(name => {
            return packed.leaves().find(d => d.data.name === name);
        });

        svg.append('g')
            .selectAll('circle')
            .data(excludedData, d => d.data.name)
            .join('circle')
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .attr('r', 0)
            .attr('fill', d => colorScale(d.data.category))
            .attr('fill-opacity', 0)
            .transition()
            .delay(animationProperties.duration)
            .duration(animationProperties.duration)
            .attr('r', d => d.r)
            .attr('fill-opacity', 1);
    }
    // Attach tooltip to all circles
    attachTooltip(svg.selectAll('circle'));
}

// initialize
loadData();