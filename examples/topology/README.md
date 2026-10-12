# Topology API Examples

This directory contains interactive examples demonstrating the Topology API capabilities for polygon geometry operations.

## Examples

### 1. **Shared Boundaries Detection** (`boundaries.html`)
Demonstrates how to find which features share a boundary with a selected polygon.
- Uses `lux.topology.findTopologicalNeighbours()`
- Click on features to see their topological neighbors
- Useful for identifying adjacent parcels

### 2. **Feature Merging** (`merge.html`)
Shows how to merge multiple adjacent features into a single feature.
- Uses `lux.topology.mergeFeatures()`
- Select multiple features (Ctrl+click) and merge them
- Combines geometries using JSTS union operation
- Automatically removes merged features

### 3. **Overlap Detection** (`overlaps.html`)
Demonstrates real-time overlap detection when modifying features.
- Uses `lux.topology.checkOverlapsNeighbours()`
- Drag the red polygon to detect overlaps with other features
- Shows which features are overlapping
- Useful for validation during editing

### 4. **Vertex Propagation** (`vertices.html`)
Shows how to maintain topological consistency by propagating vertex changes across boundaries.
- Uses `lux.topology.propagateSharedVertices()`
- Edit vertices on one polygon
- Automatically updates adjacent features that share the boundary
- Ensures seamless topology maintenance

## Core API Functions

```javascript
// Find topological neighbors (shared boundaries)
const neighbours = lux.topology.findTopologicalNeighbours(
  jstsParser,
  feature,
  allFeatures,
  { vertexPrecision: 2 }
);

// Merge features
const result = lux.topology.mergeFeatures(jstsParser, [feature1, feature2]);

// Detect overlaps
const overlaps = lux.topology.checkOverlapsNeighbours(
  jstsParser,
  feature,
  allFeatures,
  0.01
);

// Check shared boundary
const hasSharedBoundary = lux.topology.sharesBoundary(
  jstsParser,
  featureA,
  featureB,
  2
);

// Propagate shared vertices
const changed = lux.topology.propagateSharedVertices(
  modifiedFeature,
  allFeatures,
  { vertexPrecision: 2 }
);

// Split feature with line
const splitResult = lux.topology.splitFeatureWithLine(
  jstsParser,
  feature,
  splitLineGeometry
);

// Insert hole in polygon
const success = lux.topology.insertHole(
  jstsParser,
  feature,
  holePolygonGeometry,
  { coverRatioMin: 0.99 }
);
```

## Integration with Your App

1. **Import the API:**
   ```javascript
   import lux from 'lux-jsapi';
   import OL3Parser from 'jsts/io/OL3Parser.js';
   import 'jsts/monkey.js';
   ```

2. **Create JSTS parser:**
   ```javascript
   const jstsParser = new OL3Parser();
   ```

3. **Use topology operations:**
   ```javascript
   const neighbours = lux.topology.findTopologicalNeighbours(
     jstsParser,
     feature,
     allFeatures
   );
   ```

## Dependencies

- **OpenLayers (ol)**: For geometry and feature management
- **JSTS**: For advanced topology operations (boundary intersections, unions, polygonization)
- **proj4**: For coordinate system transformations (already in lux-jsapi)

## Running the Examples

The examples are part of the jsapi build and can be accessed from:
- Development server: `npm run start`
- Built documentation: `npm run build-jsdoc` (in `dist/apidoc/examples/topology/`)

## Notes

- All examples use EPSG:2169 (Luxembourg National Grid) by default
- Vertex precision is set to 2 decimal places (~1cm in EPSG:2169)
- JSTS operations are CPU-intensive for large feature sets; consider performance implications
- All geometry operations work with OL Feature objects

## Further Reading

- [JSTS Documentation](https://github.com/locationtech/jts)
- [OpenLayers Documentation](https://openlayers.org)
- [Topology Concepts in GIS](https://en.wikipedia.org/wiki/Topology_(geometry))
