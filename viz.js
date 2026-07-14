// ============================================
// viz.js — D3.js custom charts (donut + word cloud + bars)
// ============================================
import * as d3 from 'd3';
import cloud from 'd3-cloud';

// Color tokens (must match CSS)
const COLORS = {
    pos: '#c5f900',
    neu: '#0a0a0a',
    neg: '#c2410c',
    ink: '#0a0a0a',
    cream: '#f5f1e8',
    accent: '#c5f900',
    faint: '#8a8a8a',
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================
// Donut chart with animated arcs
// ============================================
export function renderDonut(svgEl, data, options = {}) {
    const { centerLabel = '', centerSubLabel = '' } = options;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = 200;
    const height = 200;
    const radius = Math.min(width, height) / 2;
    const innerRadius = radius * 0.62;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const total = d3.sum(data, (d) => d.value);
    if (total === 0) {
        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', COLORS.faint)
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('font-size', '11')
            .text('no data');
        return;
    }

    const pie = d3.pie().value((d) => d.value).sort(null).padAngle(0.02);
    const arc = d3.arc().innerRadius(innerRadius).outerRadius(radius).cornerRadius(4);

    const arcs = pie(data);

    const paths = g.selectAll('path')
        .data(arcs)
        .enter()
        .append('path')
        .attr('fill', (d) => d.data.color)
        .attr('stroke', COLORS.cream)
        .attr('stroke-width', 2)
        .each(function (d) { this._current = { startAngle: 0, endAngle: 0 }; });

    if (reduceMotion) {
        paths.attr('d', arc);
    } else {
        paths.transition()
            .duration(1200)
            .delay((d, i) => i * 150)
            .ease(d3.easeCubicOut)
            .attrTween('d', function (d) {
                const interp = d3.interpolate(this._current, d);
                this._current = interp(1);
                return (t) => arc(interp(t));
            });
    }

    // Center label
    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .attr('fill', COLORS.ink)
        .attr('font-family', 'Fraunces, serif')
        .attr('font-size', '32')
        .attr('font-weight', '500')
        .text(centerLabel || total);

    if (centerSubLabel) {
        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.4em')
            .attr('fill', COLORS.faint)
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('font-size', '10')
            .attr('letter-spacing', '0.08em')
            .text(centerSubLabel.toUpperCase());
    }
}

// ============================================
// Word cloud
// ============================================
export async function renderWordCloud(containerEl, words) {
    if (!words || words.length === 0) {
        d3.select(containerEl).selectAll('*').remove();
        d3.select(containerEl).append('text')
            .attr('x', '50%').attr('y', '50%')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', COLORS.faint)
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('font-size', '11')
            .text('no topics');
        return;
    }

    const width = 400;
    const height = 240;
    const maxCount = d3.max(words, (w) => w.value) || 1;
    const minCount = d3.min(words, (w) => w.value) || 1;

    const sizeScale = d3.scaleSqrt()
        .domain([minCount, maxCount])
        .range([12, 36]);

    const colorScale = d3.scaleOrdinal()
        .domain(['positive', 'neutral', 'negative'])
        .range([COLORS.pos, COLORS.ink, COLORS.neg]);

    const layout = cloud()
        .size([width, height])
        .words(words.map((w) => ({ ...w, text: w.text })))
        .padding(4)
        .rotate((d) => (Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? -30 : 30))))
        .font('Inter')
        .fontSize((d) => sizeScale(d.value))
        .spiral('archimedean')
        .random(() => 0.5);

    await new Promise((resolve) => layout.start().on('end', resolve));

    const svg = d3.select(containerEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const text = g.selectAll('text')
        .data(layout.words())
        .enter()
        .append('text')
        .style('font-family', 'Inter')
        .style('font-weight', (d) => (d.value === maxCount ? 600 : 500))
        .style('font-size', (d) => `${d.size}px`)
        .style('fill', (d) => colorScale(d.sentiment || 'neutral'))
        .attr('text-anchor', 'middle')
        .attr('transform', (d) => `translate(${d.x}, ${d.y}) rotate(${d.rotate})`)
        .text((d) => d.text);

    if (!reduceMotion) {
        text.style('opacity', 0)
            .transition()
            .delay((d, i) => i * 40)
            .duration(400)
            .style('opacity', 1);
    }
}

// ============================================
// Horizontal bar chart (for bench display if needed)
// ============================================
export function renderBars(svgEl, data, options = {}) {
    const { xMax, color = COLORS.ink } = options;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    const margin = { top: 4, right: 4, bottom: 4, left: 4 };
    const width = svgEl.clientWidth || 400;
    const height = data.length * 32 + margin.top + margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);
    svg.attr('height', height);

    const max = xMax || d3.max(data, (d) => d.value) || 1;
    const x = d3.scaleLinear().domain([0, max]).range([0, width - margin.left - margin.right]);
    const y = d3.scaleBand().domain(data.map((d) => d.label)).range([0, height - margin.top - margin.bottom]).padding(0.2);

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    const bars = g.selectAll('rect')
        .data(data)
        .enter()
        .append('rect')
        .attr('x', 0)
        .attr('y', (d) => y(d.label))
        .attr('height', y.bandwidth())
        .attr('width', 0)
        .attr('fill', color)
        .attr('rx', 4);

    if (reduceMotion) {
        bars.attr('width', (d) => x(d.value));
    } else {
        bars.transition()
            .duration(800)
            .delay((d, i) => i * 80)
            .ease(d3.easeCubicOut)
            .attr('width', (d) => x(d.value));
    }

    g.selectAll('.label')
        .data(data)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', (d) => x(d.value) + 8)
        .attr('y', (d) => y(d.label) + y.bandwidth() / 2 + 4)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '11')
        .attr('fill', COLORS.ink)
        .text((d) => d.label);
}