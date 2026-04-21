import './style.css'
import * as d3 from 'd3';

// Globals
let data = null;
let categories = null;
let svg = null;
let currentHash = 'scatter';

// Configuration
// Chart coordiantes
const chartCoordinates = {
    xMin: -123.025, xMax: -122.78,
    yMin: 37.96, yMax: 38.07,
    centroid: { x: -122.9, y: 38.01 }  // center of your data space
};

// D3 chart dimensions
const width = 900;
const height = 500;
const margin = { top: 20, right: 30, bottom: 30, left: 40 };

// Animation config
const animationProperties = {
    duration: 5000,
    delay: 5000
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

// Food web configuration
const foodWebConnections = {
    // Format: 'predator_name': ['prey_name1', 'prey_name2', ...]
    'Western Gull': ['Pacific Purple Sea Urchin', 'Purple Shore Crab', 'California Mussel', 'Wrinkled Purple Whelk'],
    'Pacific Rock Crab': [],
    'Purple Shore Crab': ['Red-striped Acorn Barnacle'],
    'California Mussel': [],
    'Wrinkled Purple Whelk': ['Red-striped Acorn Barnacle'],
    'Bull Kelp': [],
    'Pacific Purple Sea Urchin': ['Rockweed','greater periwinkle'],
    'Giant Green Anemone': ['Purple Shore Crab', 'Mosshead Sculpin'],
    'Ochre Sea Star': [],
    'Mosshead Sculpin': [],
    'Red-striped Acorn Barnacle': [],
    'Owl Limpet': ['Rockweed'],
    'Rockweed': [],
    'greater periwinkle': ['Rockweed'],
    'Giant Pacific Octopus': ['Purple Shore Crab', 'Mosshead Sculpin', ]
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

    // Initialize chart and setup hash listener
    initSVG();
    handleHasChange();
    window.addEventListener('hashchange', handleHasChange);
    // *re-render on resize?
}

// Initialize chart container
function initSVG() {
    svg = d3.create('svg')
        .attr('viewBox', [0, 0, width, height]);
    
    d3.select('#chart').append(() => svg.node());
}

// Hash change handler
function handleHasChange() {
    const previousHash = currentHash;
    const newHash = window.location.hash.slice(1) || 'scatter';
    console.log('Hash changed from:', previousHash, 'to:', newHash);

    // Determine transition and call appropriate function
    const transition = `${previousHash}-${newHash}`;
    
    if (transition === 'packed-web') {
        // packed -> web transition: clear SVG and preserve for animation
        svg.selectAll('*').remove();
        renderPackedToWeb();
    } else if (transition === 'web-packed') {
        // web -> packed transition
        renderWebToPacked();
    } else {
        // All other transitions: clear SVG and render based on new hash
        svg.selectAll('*').remove();
        if (newHash === 'scatter') renderScatter();
        else if (newHash === 'packed') renderScatterToPacked();
        else if (newHash === 'web') renderPackedToWeb();
    }
    
    currentHash = newHash;
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

function getSpeciesInWeb() {
    const speciesInWeb = new Set();
    Object.entries(foodWebConnections).forEach(([predator, preyArray]) => {
        speciesInWeb.add(predator);
        preyArray.forEach(prey => {
            speciesInWeb.add(prey);
        });
    });
    return speciesInWeb;
}

function buildFoodWebHierarchyNode(predatorName, visited = new Set()) {
    if (visited.has(predatorName)) {
        return null;
    }
    visited.add(predatorName);
    
    const speciesData = data.find(d => d.common_name === predatorName);
    const count = data.filter(d => d.common_name === predatorName).length;
    
    const node = {
        name: predatorName,
        count: count,
        category: speciesData ? speciesData.taxon_category_name : 'Other',
        children: []
    };
    
    const prey = foodWebConnections[predatorName];
    if (prey) {
        prey.forEach(preyName => {
            const child = buildFoodWebHierarchyNode(preyName, new Set(visited));
            if (child) {
                node.children.push(child);
            }
        });
    }
    
    return node;
}

function createFoodWebHierarchy() {
    const speciesInWeb = getSpeciesInWeb();
    
    // Find root nodes (species that eat but aren't eaten)
    const preySet = new Set();
    Object.entries(foodWebConnections).forEach(([predator, preyArray]) => {
        preyArray.forEach(prey => {
            preySet.add(prey);
        });
    });
    const rootNames = Array.from(speciesInWeb).filter(name => !preySet.has(name));
    
    const allHierarchies = rootNames.map(name => buildFoodWebHierarchyNode(name));
    const treeLayout = d3.tree().size([width - margin.left - margin.right, (height - margin.top - margin.bottom) / rootNames.length]);
    
    const allHierarchyObjects = allHierarchies.map((root, index) => {
        const hierarchy = d3.hierarchy(root);
        treeLayout(hierarchy);
        
        hierarchy.descendants().forEach(d => {
            d.y += index * (height - margin.top - margin.bottom) / rootNames.length;
        });
        
        return hierarchy;
    });

    return allHierarchyObjects;
}

// Tooltip helper function
function attachTooltip(selection) {
    // Create tooltip if it doesn't exist
    let tooltip = d3.select('.tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('#chart')
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background-color', 'white')
            .style('border', 'solid')
            .style('border-width', '1px')
            .style('border-radius', '2px')
            .style('padding', '5px')
            .style('pointer-events', 'none')
            .style('font-size', '12px');
    }

    selection
        .on('mouseover', function(event, d) {
            tooltip.style('opacity', 1);
            d3.select(this)
                .style('stroke', 'black')
                .style('stroke-width', 1.5)
                .style('opacity', 1);
        })
        .on('mousemove', function(event, d) {
            const tooltipText = `<strong>${d.data.name}</strong><br/>Count: ${d.data.value}<br/>Category: ${d.data.category}`;
            tooltip
                .html(tooltipText)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseleave', function(event, d) {
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
        .duration(animationProperties.duration*1.5)
        .attr('r', d => d.r);
    
    // Attach tooltip to circles
    attachTooltip(svg.selectAll('.packed-circles circle'));
}

// Renders packed circles and then transitions to a food web layout
function renderPackedToWeb(sortOption) {
    const colorScale = createColorScale();
    const packed = createPackedLayout(sortOption);
    const speciesInWeb = getSpeciesInWeb();
    const allHierarchyObjects = createFoodWebHierarchy();

    // Extract links from hierarchies
    const allLinks = allHierarchyObjects.flatMap(h => h.links());

    // Create a group for the tree with proper translation
    const treeGroup = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Draw links first (beneath circles) with initial opacity
    treeGroup.append('g')
        .attr('class', 'food-web-links')
        .attr('fill', 'none')
        .attr('stroke', '#999')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0)
        .selectAll('path')
        .data(allLinks)
        .join('path')
        .attr('d', d3.linkVertical()
            .x(d => d.x)
            .y(d => d.y));

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
    circles.filter(d => !speciesInWeb.has(d.data.name))
        .transition()
        .duration(animationProperties.duration)
        .attr('fill-opacity', 0)
        .remove();

    const allNodes = allHierarchyObjects.flatMap(h => h.descendants());
    
    // Create map of species name to web position
    const webPositions = new Map();
    allNodes.forEach(node => {
        webPositions.set(node.data.name, {
            x: margin.left + node.x,
            y: margin.top + node.y
        });
    });
    
    // Transition remaining circles to food web positions
    circles.filter(d => speciesInWeb.has(d.data.name))
        .transition()
        .delay(animationProperties.duration/2)
        .duration(animationProperties.duration)
        .attr('cx', d => webPositions.get(d.data.name).x)
        .attr('cy', d => webPositions.get(d.data.name).y)
        .attr('r', 10);

    // Fade in links after circles have moved
    treeGroup.select('.food-web-links')
        .transition()
        .delay(animationProperties.duration)
        .duration(animationProperties.duration)
        .attr('opacity', 1);
    
    // Add images for species that have them
    const imageData = packed.leaves()
        .filter(d => speciesImages[d.data.name])
        .map(d => ({
            name: d.data.name,
            imagePath: speciesImages[d.data.name]
        }));
    
    const images = treeGroup.append('g')
        .attr('class', 'food-web-images')
        .selectAll('image')
        .data(imageData, d => d.name)
        .join('image')
        .attr('x', d => {
            const pos = webPositions.get(d.name);
            return pos.x - 25;
        })
        .attr('y', d => {
            const pos = webPositions.get(d.name);
            return pos.y - 25;
        })
        .attr('width', 50)
        .attr('height', 50)
        .attr('href', d => d.imagePath)
        .attr('opacity', 0);
    
    // Fade in images after circles have finished moving
    images.transition()
        .delay(animationProperties.duration * 1.5)
        .duration(animationProperties.duration)
        .attr('opacity', 1);
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