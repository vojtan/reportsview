"use strict";

// Coordinates in the bundled extract are stored as integer ten-thousandths of
// a degree offset from 14° E and 50° N.
const mapStyles = {
  green: { fill: "#dce8d5" },
  stream: { stroke: "#a6cfdf", width: 1 },
  river: { stroke: "#a9cedf", width: 2.6 },
  waterArea: { fill: "#b4d6e6" },
  rail: { stroke: "#8a9494", width: 1, dash: [4, 3] },
  service: { stroke: "#ffffff", width: 1, minZoom: 1.8, labelZoom: 8 },
  local: { stroke: "#ffffff", width: 1.6, casing: "#d0d4ca", labelZoom: 4 },
  collector: { stroke: "#fffcf0", width: 2.4, casing: "#c8c4ae", labelZoom: 3 },
  main: { stroke: "#f9df9b", width: 3.3, casing: "#cfb477", labelZoom: 2.4 }
};

function prepareBasemap(data) {
  return Object.entries(mapStyles).map(([name, style]) => {
    const features = (data.layers[name] || []).map(([label, points]) => {
      let left = Infinity;
      let right = -Infinity;
      let bottom = Infinity;
      let top = -Infinity;
      for (let i = 0; i < points.length; i += 2) {
        left = Math.min(left, points[i]);
        right = Math.max(right, points[i]);
        bottom = Math.min(bottom, points[i + 1]);
        top = Math.max(top, points[i + 1]);
      }
      return { label, points, left, right, bottom, top };
    });
    return { style, features };
  });
}

let basemapLayers;

function paintBasemap(canvas, view) {
  const data = window.DECIN_BASEMAP;
  const ctx = canvas.getContext("2d");
  if (!data || !ctx) return false;
  basemapLayers ||= prepareBasemap(data);
  const { width, height, camera, scale } = view;
  const density = Math.min(window.devicePixelRatio || 1, 2.5);
  const pixelsWide = Math.round(width * density);
  const pixelsHigh = Math.round(height * density);
  if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
    canvas.width = pixelsWide;
    canvas.height = pixelsHigh;
  }

  const xScale = scale.x / 10000;
  const yScale = scale.y / 10000;
  const x0 = width / 2 - (camera.lon - 14) * scale.x;
  const y0 = height / 2 + (camera.lat - 50) * scale.y;
  const xAt = x => x0 + x * xScale;
  const yAt = y => y0 - y * yScale;
  const margin = 8;
  const left = (-margin - x0) / xScale;
  const right = (width + margin - x0) / xScale;
  const bottom = (y0 - height - margin) / yScale;
  const top = (y0 + margin) / yScale;
  const [south, west, north, east] = data.bounds;
  const innerLeft = Math.max(0, xAt(west));
  const innerRight = Math.min(width, xAt(east));
  const innerTop = Math.max(0, yAt(north));
  const innerBottom = Math.min(height, yAt(south));

  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (innerRight <= innerLeft || innerBottom <= innerTop) return true;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, innerTop, innerRight - innerLeft, innerBottom - innerTop);
  ctx.clip();
  ctx.fillStyle = "#f2f1e9";
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const labels = [];
  const widthFactor = Math.min(2.4, 0.76 + Math.log2(camera.zoom) * 0.38);
  for (const { style, features } of basemapLayers) {
    if (camera.zoom < (style.minZoom || 1)) continue;
    const lineWidth = style.width * widthFactor;
    const labelRoads = camera.zoom >= style.labelZoom;
    ctx.beginPath();
    for (const feature of features) {
      if (feature.left > right || feature.right < left || feature.bottom > top || feature.top < bottom) continue;
      const { points, label } = feature;
      let x = xAt(points[0]);
      let y = yAt(points[1]);
      ctx.moveTo(x, y);
      let candidate;
      let longest = 0;
      for (let i = 2; i < points.length; i += 2) {
        const nextX = xAt(points[i]);
        const nextY = yAt(points[i + 1]);
        ctx.lineTo(nextX, nextY);
        if (labelRoads && label) {
          const midpointX = (x + nextX) / 2;
          const midpointY = (y + nextY) / 2;
          const length = Math.hypot(nextX - x, nextY - y);
          if (length > longest && length > 24 && midpointX > innerLeft && midpointX < innerRight && midpointY > innerTop && midpointY < innerBottom) {
            candidate = { label, x: midpointX, y: midpointY, priority: style.labelZoom };
            longest = length;
          }
        }
        x = nextX;
        y = nextY;
      }
      if (style.fill) ctx.closePath();
      if (candidate) labels.push(candidate);
    }
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
      continue;
    }
    if (style.casing) {
      ctx.strokeStyle = style.casing;
      ctx.lineWidth = lineWidth + 0.85;
      ctx.stroke();
    }
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(style.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const [label, kind, x, y] of data.places) {
    if (kind === "neighbourhood" && camera.zoom < 2.5) continue;
    const priority = kind === "town" ? 0 : 1;
    labels.push({ label, x: xAt(x), y: yAt(y), priority });
  }
  const placed = [];
  const names = new Set();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { label, x, y, priority } of labels.sort((a, b) => a.priority - b.priority)) {
    if (names.has(label) || x < innerLeft || x > innerRight || y < innerTop || y > innerBottom) continue;
    const size = priority === 0 ? 16 : priority === 1 ? 12 : 11;
    ctx.font = priority === 0 ? "700 16px system-ui" : `${size}px system-ui`;
    const halfWidth = ctx.measureText(label).width / 2 + 4;
    const box = { left: x - halfWidth, right: x + halfWidth, top: y - size / 2 - 3, bottom: y + size / 2 + 3 };
    if (box.left < innerLeft || box.right > innerRight || box.top < innerTop || box.bottom > innerBottom) continue;
    if (placed.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
    names.add(label);
    placed.push(box);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#f9f8f1";
    ctx.strokeText(label, x, y);
    ctx.fillStyle = priority <= 1 ? "#374943" : "#595c54";
    ctx.fillText(label, x, y);
  }
  ctx.restore();
  return true;
}
