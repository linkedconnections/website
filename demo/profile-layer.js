// Planner progress uses GeoJSON coordinate order (longitude, latitude).
export function profileCoordinates(edge) {
  const valid = point => Array.isArray(point) && point.length === 2
    && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
  if (!valid(edge?.from) || !valid(edge?.to)) return null;
  if (edge.from[0] === edge.to[0] && edge.from[1] === edge.to[1]) return null;
  return [[edge.from[1], edge.from[0]], [edge.to[1], edge.to[0]]];
}

// One canvas keeps streamed profile edges out of Leaflet's SVG layer tree.
export function createProfileLayer(map, L) {
  const canvas = L.DomUtil.create('canvas', 'lc-profile-overlay');
  canvas.setAttribute('aria-hidden', 'true');
  map.getPanes().overlayPane.appendChild(canvas);
  const segments = new Map();
  let frame;

  function draw() {
    frame = undefined;
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.x * ratio);
    canvas.height = Math.round(size.y * ratio);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.x, size.y);
    context.strokeStyle = 'rgba(217, 119, 6, 0.8)';
    context.lineWidth = 1.75;
    context.beginPath();
    for (const [from, to] of segments.values()) {
      const a = map.latLngToContainerPoint(from), b = map.latLngToContainerPoint(to);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
    }
    context.stroke();
    canvas.dataset.edgeCount = String(segments.size);
  }

  function schedule() {
    if (frame === undefined) frame = requestAnimationFrame(draw);
  }
  map.on('moveend viewreset resize', schedule);

  return {
    add(edges) {
      for (const edge of edges) {
        const points = profileCoordinates(edge);
        if (!points) continue;
        // Opposite directions occupy the same line on the map.
        const ends = points.map(point => point.join(',')).sort();
        segments.set(ends.join('/'), points);
      }
      schedule();
      return segments.size;
    },
    clear() {
      segments.clear();
      canvas.dataset.edgeCount = '0';
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      schedule();
    }
  };
}
