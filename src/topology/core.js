/**
 * @fileoverview Topology helper functions reused by applications.
 */

import {register as registerProj4} from 'ol/proj/proj4';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import LinearRing from 'ol/geom/LinearRing';
import Polygon from 'ol/geom/Polygon';
import MultiPoint from 'ol/geom/MultiPoint';
import MultiLineString from 'ol/geom/MultiLineString';
import MultiPolygon from 'ol/geom/MultiPolygon';
import GeometryCollection from 'ol/geom/GeometryCollection';

/**
 * Default precision used to compare vertex coordinates.
 * @type {number}
 */
export const DEFAULT_VERTEX_PRECISION = 2;

/**
 * Official EPSG:2169 projection definition string.
 * @type {string}
 */
export const EPSG2169_DEF =
  '+proj=tmerc +lat_0=49.83333333333334 +lon_0=6.166666666666667 ' +
  '+k=1 +x_0=80000 +y_0=100000 +ellps=intl ' +
  '+towgs84=-189.681,18.3463,-42.7695,-0.33746,-3.09264,2.53861,0.4598 ' +
  '+units=m +no_defs';

/** Module-level JSTS parser instance, initialised lazily on first use. */
let _parser = null;

/**
 * Return the global scope object when available.
 * @return {Object|undefined}
 */
function getRootScope() {
  if (typeof self !== 'undefined') {
    return self;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  return undefined;
}

/**
 * Build and cache the JSTS parser, injected with the bundled OL classes.
 * Called automatically on first use — no explicit initJSTS() call required.
 * @return {jsts.io.OL3Parser}
 */
function _buildParser() {
  const rootScope = getRootScope();
  const jstsLib = rootScope ? rootScope.jsts : undefined;
  if (!jstsLib || !jstsLib.io || !jstsLib.io.OL3Parser) {
    throw new Error('JSTS non disponible — assurez-vous que jsts.min.js est chargé avant apiv4.js.');
  }
  const parser = new jstsLib.io.OL3Parser();
  parser.inject(Point, LineString, LinearRing, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection);
  return parser;
}

/**
 * Return the module-level JSTS parser, creating it on first call.
 * @return {jsts.io.OL3Parser}
 * @memberof lux.topology
 */
export function getParser() {
  if (!_parser) {
    _parser = _buildParser();
  }
  return _parser;
}

/**
 * (Re-)initialize the JSTS parser explicitly.
 *
 * Calling this is **optional** — the parser is created automatically on first
 * use via {@link getParser}.  Use this only if you need to force a reset, e.g.
 * in tests.
 *
 * @param {Object=} opt_options
 * @param {Object=} opt_options.jstsLib  Explicit JSTS library (defaults to the global `jsts`).
 * @return {jsts.io.OL3Parser}
 * @memberof lux.topology
 */
export function initJSTS(opt_options) {
  const options = opt_options || {};
  const rootScope = getRootScope();
  const jstsLib = options.jstsLib || (rootScope ? rootScope.jsts : undefined);
  if (!jstsLib || !jstsLib.io || !jstsLib.io.OL3Parser) {
    throw new Error('JSTS non disponible (OL3Parser introuvable).');
  }
  const parser = new jstsLib.io.OL3Parser();
  parser.inject(Point, LineString, LinearRing, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection);
  _parser = parser;
  return parser;
}

/**
 * Read an OL geometry into a JSTS geometry.
 *
 * Since all OL classes now come from the single bundled instance (via lux.ol),
 * `parser.read()` should always succeed. The slow path (reconstruction from
 * coordinates) is kept as a safety net for edge cases.
 *
 * @param {ol.geom.Geometry} olGeom  Any OL geometry object.
 * @return {jsts.geom.Geometry}
 * @memberof lux.topology
 */
export function readGeom(olGeom) {
  const parser = getParser();

  // Fast path
  let jstsGeom = parser.read(olGeom);
  if (jstsGeom !== undefined && jstsGeom !== null) {
    return jstsGeom;
  }

  // Slow path — reconstruct from coordinates using bundled OL classes
  const type = olGeom.getType();
  let rebuilt = null;
  if (type === 'Point') rebuilt = new Point(olGeom.getCoordinates());
  else if (type === 'LineString') rebuilt = new LineString(olGeom.getCoordinates());
  else if (type === 'Polygon') rebuilt = new Polygon(olGeom.getCoordinates());
  else if (type === 'MultiPoint') rebuilt = new MultiPoint(olGeom.getCoordinates());
  else if (type === 'MultiLineString') rebuilt = new MultiLineString(olGeom.getCoordinates());
  else if (type === 'MultiPolygon') rebuilt = new MultiPolygon(olGeom.getCoordinates());
  else throw new Error('readGeom: unsupported geometry type "' + type + '"');

  jstsGeom = parser.read(rebuilt);
  if (jstsGeom === undefined || jstsGeom === null) {
    throw new Error('readGeom: parser.read() still returned undefined after geometry rebuild for type "' + type + '".');
  }
  return jstsGeom;
}

/**
 * Compute the geometric difference between two OL geometries using JSTS.
 *
 * @param {ol.geom.Geometry} origGeom Original geometry.
 * @param {ol.geom.Geometry} newGeom  New geometry.
 * @return {{isEmpty: boolean, deltaArea: number}} Difference metrics.
 * @memberof lux.topology
 */
export function computeGeomDiff(origGeom, newGeom) {
  const jstsOrig = readGeom(origGeom);
  const jstsNew = readGeom(newGeom);
  const diff = jstsNew.difference(jstsOrig);
  return {
    isEmpty: diff.isEmpty(),
    deltaArea: diff.getArea(),
  };
}

/**
 * Register EPSG:2169 in OpenLayers through proj4.
 *
 * @param {Object=} opt_options Options.
 * @param {Object=} opt_options.proj4Lib Optional explicit proj4 instance.
 * @memberof lux.topology
 */
export function registerProjection2169(opt_options) {
  const options = opt_options || {};
  const rootScope = getRootScope();
  const proj4Lib = options.proj4Lib || (rootScope ? rootScope.proj4 : undefined);
  if (!proj4Lib || !proj4Lib.defs) {
    throw new Error('proj4 non disponible.');
  }

  proj4Lib.defs('EPSG:2169', EPSG2169_DEF);
  registerProj4(proj4Lib);
}

/**
 * Iterate through all coordinates of a Polygon or MultiPolygon geometry.
 * @param {ol.geom.Geometry} geometry The geometry.
 * @param {function(Array<number>, number, number): void} callback Callback with (coord, ringIndex, coordIndex).
 * @memberof lux.topology
 */
export function iterCoords(geometry, callback) {
  const type = geometry.getType();
  if (type === 'Polygon') {
    geometry.getCoordinates().forEach(function(ring, ringIndex) {
      ring.forEach(function(coord, coordIndex) {
        callback(coord, ringIndex, coordIndex);
      });
    });
  } else if (type === 'MultiPolygon') {
    geometry.getCoordinates().forEach(function(polygon, polygonIndex) {
      polygon.forEach(function(ring, ringIndex) {
        ring.forEach(function(coord, coordIndex) {
          callback(coord, polygonIndex * 100 + ringIndex, coordIndex);
        });
      });
    });
  }
}

/**
 * Build a vertex key at a specific precision.
 * @param {Array<number>} coord Coordinate [x, y].
 * @param {number=} opt_precision Optional precision.
 * @return {string} Key.
 * @memberof lux.topology
 */
export function vertexKey(coord, opt_precision) {
  const precision = (opt_precision === undefined) ? DEFAULT_VERTEX_PRECISION : opt_precision;
  return coord[0].toFixed(precision) + ',' + coord[1].toFixed(precision);
}

/**
 * Return all coordinates of a Polygon or MultiPolygon as a flat array.
 * @param {ol.geom.Geometry} geometry Geometry.
 * @return {Array<Array<number>>} Coordinates.
 * @memberof lux.topology
 */
export function getAllCoords(geometry) {
  const coords = [];
  iterCoords(geometry, function(coord) {
    coords.push(coord.slice());
  });
  return coords;
}

/**
 * Clone coordinates deeply.
 * @param {Object|Array} coords Coordinates array.
 * @return {Object|Array} Deep clone.
 * @memberof lux.topology
 */
export function deepCloneCoords(coords) {
  return JSON.parse(JSON.stringify(coords));
}

/**
 * Returns true if two features share a linear boundary (length > 0).
 *
 * Uses JSTS boundary intersection first, then falls back to shared vertices
 * check if needed.
 *
 * @param {jsts.io.OL3Parser} parser JSTS OL parser.
 * @param {ol.Feature} featureA First feature.
 * @param {ol.Feature} featureB Second feature.
 * @param {number=} opt_vertexPrecision Optional vertex precision.
 * @return {boolean} True if the features share a boundary.
 * @memberof lux.topology
 */
export function sharesBoundary(featureA, featureB, opt_vertexPrecision) {
  const precision = (opt_vertexPrecision === undefined) ? DEFAULT_VERTEX_PRECISION : opt_vertexPrecision;
  try {
    const geomA = readGeom(featureA.getGeometry());
    const geomB = readGeom(featureB.getGeometry());

    const boundaryA = geomA.getBoundary();
    const boundaryB = geomB.getBoundary();
    const intersection = boundaryA.intersection(boundaryB);

    const type = intersection.getGeometryType();
    if (type === 'LineString' || type === 'MultiLineString' || type === 'GeometryCollection') {
      if (intersection.getLength() > 0) {
        return true;
      }
    }

    const coordsA = getAllCoords(featureA.getGeometry());
    const coordsB = getAllCoords(featureB.getGeometry());
    const keysA = {};

    coordsA.forEach(function(coord) {
      keysA[vertexKey(coord, precision)] = true;
    });

    let sharedCount = 0;
    for (let i = 0; i < coordsB.length; i++) {
      if (keysA[vertexKey(coordsB[i], precision)]) {
        sharedCount++;
        if (sharedCount >= 2) {
          return true;
        }
      }
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Find topological neighbours of a target feature from a list of features.
 *
 * By default this function is pure and only returns neighbours.
 * If `opt_options.markNeighbours` is true, neighbours are also marked using
 * `opt_options.stateProperty` and `opt_options.neighbourState`.
 *
 * @param {jsts.io.OL3Parser} parser JSTS OL parser.
 * @param {ol.Feature} targetFeature Target feature.
 * @param {Array<ol.Feature>} allFeatures Feature list to inspect.
 * @param {Object=} opt_options Optional behavior.
 * @param {boolean=} opt_options.markNeighbours Mark neighbour state on features.
 * @param {string=} opt_options.stateProperty Feature property for selection state.
 * @param {string=} opt_options.neighbourState Value used when marking neighbours.
 * @param {string=} opt_options.selectedState Value considered as selected.
 * @param {number=} opt_options.vertexPrecision Optional vertex precision.
 * @return {Array<ol.Feature>} Neighbour features.
 * @memberof lux.topology
 */
export function findTopologicalNeighbours(targetFeature, allFeatures, opt_options) {
  const options = opt_options || {};
  const markNeighbours = options.markNeighbours === true;
  const stateProperty = options.stateProperty || '_selectionState';
  const neighbourState = options.neighbourState || 'neighbour';
  const selectedState = options.selectedState || 'selected';
  const precision = options.vertexPrecision;

  return allFeatures.filter(function(candidate) {
    if (candidate === targetFeature) {
      return false;
    }
    if (candidate.get(stateProperty) === selectedState) {
      return false;
    }
    if (!sharesBoundary(targetFeature, candidate, precision)) {
      return false;
    }

    if (markNeighbours) {
      candidate.set(stateProperty, neighbourState);
    }
    return true;
  });
}

/**
 * Validate an OL geometry with JSTS and optionally attempt a repair.
 *
 * This helper is useful during interactive editing to detect invalid
 * geometries (including self-intersections) before running topology ops.
 *
 * @param {ol.geom.Geometry} geometry Geometry to validate.
 * @param {Object=} opt_options Optional behavior.
 * @param {boolean=} opt_options.attemptFix Try `buffer(0)` to build a repaired geometry.
 * @return {{
 *   isValid: boolean,
 *   hasSelfIntersection: boolean,
 *   fixed: boolean,
 *   message: string,
 *   fixedGeometry: (ol.geom.Geometry|null)
 * }} Validation result.
 * @memberof lux.topology
 */
export function validateGeometry(geometry, opt_options) {
  const options = opt_options || {};
  const attemptFix = options.attemptFix !== false;

  if (!geometry) {
    return {
      isValid: false,
      hasSelfIntersection: false,
      fixed: false,
      message: 'No geometry provided.',
      fixedGeometry: null,
    };
  }

  try {
    const jstsGeom = readGeom(geometry);
    let valid = false;
    try {
      valid = !!(jstsGeom && jstsGeom.isValid && jstsGeom.isValid());
    } catch (e) {
      valid = false;
    }

    if (valid) {
      return {
        isValid: true,
        hasSelfIntersection: false,
        fixed: false,
        message: 'Geometry is valid.',
        fixedGeometry: null,
      };
    }

    let hasSelfIntersection = false;
    try {
      const boundary = jstsGeom.getBoundary();
      if (boundary) {
        // Self-intersection heuristic: invalid boundary often intersects itself.
        hasSelfIntersection = !!boundary.intersects(boundary);
      }
    } catch (e) {
      hasSelfIntersection = true;
    }

    if (attemptFix) {
      try {
        const fixed = jstsGeom.buffer(0);
        if (fixed && fixed.isValid && fixed.isValid()) {
          const fixedOlGeom = getParser().write(fixed);
          return {
            isValid: false,
            hasSelfIntersection: hasSelfIntersection,
            fixed: true,
            message: hasSelfIntersection ? 'Geometry is invalid (self-intersection detected), but fix is available.' : 'Geometry is invalid, but fix is available.',
            fixedGeometry: fixedOlGeom,
          };
        }
      } catch (e) {
        // Keep invalid result below.
      }
    }

    return {
      isValid: false,
      hasSelfIntersection: hasSelfIntersection,
      fixed: false,
      message: hasSelfIntersection ? 'Geometry is invalid (self-intersection detected).' : 'Geometry is invalid.',
      fixedGeometry: null,
    };
  } catch (e) {
    return {
      isValid: false,
      hasSelfIntersection: false,
      fixed: false,
      message: 'Geometry validation failed: ' + e.message,
      fixedGeometry: null,
    };
  }
}

/**
 * Detailed overlap check with diagnostics.
 *
 * @param {ol.Feature} feature Target feature.
 * @param {Array<ol.Feature>} allFeatures Feature list.
 * @param {number=} opt_areaThreshold Minimum intersection area.
 * @return {{
 *   overlaps: Array<ol.Feature>,
 *   selfIntersectionDetected: boolean,
 *   invalidGeometryDetected: boolean,
 *   message: string
 * }} Detailed overlap result.
 * @memberof lux.topology
 */
export function checkOverlapsNeighboursDetailed(feature, allFeatures, opt_areaThreshold) {
  const areaThreshold = (opt_areaThreshold === undefined) ? 0.01 : opt_areaThreshold;
  const overlapping = [];
  let selfIntersectionDetected = false;
  let invalidGeometryDetected = false;

  function normalizeForOverlay(jstsGeom) {
    if (!jstsGeom) {
      return null;
    }

    try {
      if (jstsGeom.isValid && jstsGeom.isValid()) {
        return jstsGeom;
      }
      invalidGeometryDetected = true;
      selfIntersectionDetected = true;
    } catch (e) {
      // Fall through to robust fix below.
      invalidGeometryDetected = true;
    }

    // Classic JTS/JSTS trick to repair self-intersections and minor topology issues.
    try {
      const fixed = jstsGeom.buffer(0);
      if (fixed) {
        return fixed;
      }
    } catch (e) {
      // Keep original geometry as last resort.
    }

    return jstsGeom;
  }

  try {
    const jstsA = normalizeForOverlay(readGeom(feature.getGeometry()));
    allFeatures.forEach(function(other) {
      if (other === feature) {
        return;
      }
      try {
        const jstsB = normalizeForOverlay(readGeom(other.getGeometry()));
        const intersection = jstsA.intersection(jstsB);
        if (intersection && !intersection.isEmpty() && intersection.getArea() > areaThreshold) {
          overlapping.push(other);
        }
      } catch (e) {
        // Ignore invalid single-feature geometry errors and continue.
      }
    });
  } catch (e) {
    return {
      overlaps: [],
      selfIntersectionDetected: selfIntersectionDetected,
      invalidGeometryDetected: true,
      message: 'Overlap check failed: ' + e.message,
    };
  }

  return {
    overlaps: overlapping,
    selfIntersectionDetected: selfIntersectionDetected,
    invalidGeometryDetected: invalidGeometryDetected,
    message: selfIntersectionDetected ? 'Invalid/self-intersecting geometry detected; overlap computed using normalized geometry.' : 'OK',
  };
}

/**
 * Check overlaps between one feature and all others.
 *
 * Touching boundaries only are not considered overlaps.
 *
 * Backward-compatible wrapper returning only overlap features.
 * Extra diagnostic flags are attached on the returned array:
 * - `selfIntersectionDetected`
 * - `invalidGeometryDetected`
 *
 * @param {ol.Feature} feature Target feature.
 * @param {Array<ol.Feature>} allFeatures Feature list.
 * @param {number=} opt_areaThreshold Minimum intersection area.
 * @return {Array<ol.Feature>} Overlapping features.
 * @memberof lux.topology
 */
export function checkOverlapsNeighbours(feature, allFeatures, opt_areaThreshold) {
  const detailed = checkOverlapsNeighboursDetailed(feature, allFeatures, opt_areaThreshold);
  const overlaps = detailed.overlaps;
  overlaps.selfIntersectionDetected = detailed.selfIntersectionDetected;
  overlaps.invalidGeometryDetected = detailed.invalidGeometryDetected;
  return overlaps;
}

export default {
  EPSG2169_DEF,
  initJSTS,
  getParser,
  readGeom,
  computeGeomDiff,
  registerProjection2169,
  DEFAULT_VERTEX_PRECISION,
  iterCoords,
  vertexKey,
  getAllCoords,
  deepCloneCoords,
  sharesBoundary,
  validateGeometry,
  findTopologicalNeighbours,
  checkOverlapsNeighboursDetailed,
  checkOverlapsNeighbours,
};
