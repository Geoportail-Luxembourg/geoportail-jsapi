/**
 * @fileoverview Topology editing operations reused by applications.
 */

import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import {
  DEFAULT_VERTEX_PRECISION,
  getAllCoords,
  vertexKey,
  getParser,
  readGeom,
} from './core.js';

/**
 * Propagate shared vertex updates from a modified feature to neighbours.
 *
 * The source feature is expected to contain pre-modification coordinates in
 * `opt_options.preModifyCoordsProperty`.
 *
 * @param {ol.Feature} modifiedFeature Edited feature.
 * @param {Array<ol.Feature>} allFeatures All candidate neighbour features.
 * @param {Object=} opt_options Options.
 * @param {string=} opt_options.preModifyCoordsProperty Property holding pre-modify coords.
 * @param {number=} opt_options.vertexPrecision Vertex precision.
 * @param {function(ol.Feature): void=} opt_options.onFeatureChanged Callback for changed neighbours.
 * @return {Array<ol.Feature>} Neighbours updated by propagation.
 * @memberof lux.topology
 */
export function propagateSharedVertices(modifiedFeature, allFeatures, opt_options) {
  const options = opt_options || {};
  const preModifyCoordsProperty = options.preModifyCoordsProperty || '_preModifyCoords';
  const precision = (options.vertexPrecision === undefined) ? DEFAULT_VERTEX_PRECISION : options.vertexPrecision;
  const onFeatureChanged = options.onFeatureChanged;

  const preCoords = modifiedFeature.get(preModifyCoordsProperty);
  if (!preCoords) {
    return [];
  }

  const postCoords = getAllCoords(modifiedFeature.getGeometry());

  const preKeys = {};
  preCoords.forEach(function(coord) { preKeys[vertexKey(coord, precision)] = coord; });
  const postKeys = {};
  postCoords.forEach(function(coord) { postKeys[vertexKey(coord, precision)] = coord; });

  const missingPre = preCoords.filter(function(coord) {
    return !postKeys[vertexKey(coord, precision)];
  });
  const missingPost = postCoords.filter(function(coord) {
    return !preKeys[vertexKey(coord, precision)];
  });

  const moved = [];
  missingPre.forEach(function(preCoord, index) {
    const postCoord = missingPost[index];
    if (!postCoord) {
      return;
    }
    moved.push({
      oldKey: vertexKey(preCoord, precision),
      newCoord: postCoord,
    });
  });

  const movedNewKeys = {};
  moved.forEach(function(move) {
    movedNewKeys[vertexKey(move.newCoord, precision)] = true;
  });

  const inserted = [];
  postCoords.forEach(function(postCoord, postIndex) {
    const postKey = vertexKey(postCoord, precision);
    if (preKeys[postKey] || movedNewKeys[postKey]) {
      return;
    }

    const prevPost = postCoords[postIndex - 1];
    const nextPost = postCoords[postIndex + 1];
    if (!prevPost || !nextPost) {
      return;
    }

    const prevKey = vertexKey(prevPost, precision);
    const nextKey = vertexKey(nextPost, precision);
    if (!preKeys[prevKey] || !preKeys[nextKey]) {
      return;
    }

    inserted.push({
      newCoord: postCoord,
      prevKey: prevKey,
      nextKey: nextKey,
    });
  });

  if (moved.length === 0 && inserted.length === 0) {
    return [];
  }

  const changedFeatures = [];

  allFeatures.forEach(function(neighbour) {
    if (neighbour === modifiedFeature) {
      return;
    }

    const geometry = neighbour.getGeometry();
    const type = geometry.getType();
    if (type !== 'Polygon' && type !== 'MultiPolygon') {
      return;
    }

    const coords = geometry.getCoordinates();
    const polygons = (type === 'Polygon') ? [coords] : coords;
    let changed = false;

    moved.forEach(function(move) {
      polygons.forEach(function(polygon) {
        polygon.forEach(function(ring) {
          ring.forEach(function(coord, coordIndex) {
            if (vertexKey(coord, precision) === move.oldKey) {
              ring[coordIndex] = move.newCoord.slice();
              if (coordIndex === 0) {
                ring[ring.length - 1] = move.newCoord.slice();
              }
              if (coordIndex === ring.length - 1) {
                ring[0] = move.newCoord.slice();
              }
              changed = true;
            }
          });
        });
      });
    });

    inserted.forEach(function(insert) {
      polygons.forEach(function(polygon) {
        polygon.forEach(function(ring) {
          for (let i = 0; i < ring.length - 1; i++) {
            const keyA = vertexKey(ring[i], precision);
            const keyB = vertexKey(ring[i + 1], precision);
            if ((keyA === insert.prevKey && keyB === insert.nextKey) ||
                (keyA === insert.nextKey && keyB === insert.prevKey)) {
              ring.splice(i + 1, 0, insert.newCoord.slice());
              changed = true;
              break;
            }
          }
        });
      });
    });

    if (changed) {
      geometry.setCoordinates(coords);
      changedFeatures.push(neighbour);
      if (onFeatureChanged) {
        onFeatureChanged(neighbour);
      }
    }
  });

  return changedFeatures;
}

/**
 * Merge selected features into the first one.
 *
 * @param {jsts.io.OL3Parser} parser JSTS parser.
 * @param {Array<ol.Feature>} selectedFeatures Features to merge.
 * @param {Object=} opt_options Options.
 * @param {string=} opt_options.originalGeomProperty Property name for original geometry snapshot.
 * @param {string=} opt_options.surfaceProperty Surface property name.
 * @return {{primaryFeature: ol.Feature, removedFeatures: Array<ol.Feature>, totalSurface: number}} Result object.
 * @api stable
 * @memberof lux.topology
 */
export function mergeFeatures(selectedFeatures, opt_options) {
  const options = opt_options || {};
  const originalGeomProperty = options.originalGeomProperty || '_originalGeom';
  const surfaceProperty = options.surfaceProperty || 'surface';

  if (!selectedFeatures || selectedFeatures.length < 2) {
    throw new Error('At least 2 features are required to merge.');
  }

  const parser = getParser();
  let union = readGeom(selectedFeatures[0].getGeometry());
  for (let i = 1; i < selectedFeatures.length; i++) {
    union = union.union(readGeom(selectedFeatures[i].getGeometry()));
  }

  const primaryFeature = selectedFeatures[0];
  const mergedGeometry = parser.write(union);
  primaryFeature.setGeometry(mergedGeometry);
  primaryFeature.set(originalGeomProperty, mergedGeometry.clone());

  const totalSurface = selectedFeatures.reduce(function(sum, feature) {
    return sum + (feature.get(surfaceProperty) || 0);
  }, 0);
  if (totalSurface > 0) {
    primaryFeature.set(surfaceProperty, parseFloat(totalSurface.toFixed(1)));
  }

  return {
    primaryFeature: primaryFeature,
    removedFeatures: selectedFeatures.slice(1),
    totalSurface: totalSurface,
  };
}

/**
 * Split a polygon feature with a line using JSTS polygonizer.
 *
 * @param {jsts.io.OL3Parser} parser JSTS parser.
 * @param {ol.Feature} feature Feature to split.
 * @param {ol.geom.LineString} splitLineGeom Splitting line.
 * @param {Object=} opt_options Options.
 * @param {string=} opt_options.originalGeomProperty Property name for original geometry snapshot.
 * @param {string=} opt_options.surfaceProperty Surface property name.
 * @param {string=} opt_options.idProperty Identifier property name.
 * @param {string=} opt_options.selectionStateProperty State property name.
 * @param {string=} opt_options.defaultSelectionState Default state value.
 * @param {function(number, ol.Feature): string=} opt_options.generateId ID generator for new split features.
 * @return {{updatedFeature: ol.Feature, newFeatures: Array<ol.Feature>, piecesCount: number}} Result.
 * @api stable
 * @memberof lux.topology
 */
export function splitFeatureWithLine(feature, splitLineGeom, opt_options) {
  const options = opt_options || {};
  const originalGeomProperty = options.originalGeomProperty || '_originalGeom';
  const surfaceProperty = options.surfaceProperty || 'surface';
  const idProperty = options.idProperty || 'id_parcelle';
  const selectionStateProperty = options.selectionStateProperty || '_selectionState';
  const defaultSelectionState = options.defaultSelectionState || 'normal';

  const parser = getParser();
  const jstsPolygon = readGeom(feature.getGeometry());
  const jstsLine = readGeom(splitLineGeom);

  const boundary = jstsPolygon.getBoundary();
  const noded = boundary.union(jstsLine);

  const polygonizer = new window.jsts.operation.polygonize.Polygonizer();
  polygonizer.add(noded);

  const polygons = polygonizer.getPolygons();
  const pieces = [];
  const iterator = polygons.iterator();
  while (iterator.hasNext()) {
    const polygon = iterator.next();
    if (jstsPolygon.contains(polygon.getInteriorPoint())) {
      pieces.push(polygon);
    }
  }

  if (pieces.length < 2) {
    throw new Error('Split line does not fully traverse the feature.');
  }

  const firstGeometry = parser.write(pieces[0]);
  feature.setGeometry(firstGeometry);
  feature.set(originalGeomProperty, firstGeometry.clone());
  feature.set(surfaceProperty, parseFloat(firstGeometry.getArea().toFixed(1)));

  const newFeatures = [];
  pieces.slice(1).forEach(function(piece, index) {
    const geometry = parser.write(piece);
    const newFeature = new Feature({geometry: geometry});

    let newId;
    if (options.generateId) {
      newId = options.generateId(index, feature);
      if (newId !== undefined && newId !== null) {
        newFeature.setId(newId);
      }
    }

    if (newId !== undefined) {
      newFeature.set(idProperty, newId);
    }

    newFeature.set(surfaceProperty, parseFloat(geometry.getArea().toFixed(1)));
    newFeature.set(originalGeomProperty, geometry.clone());
    newFeature.set(selectionStateProperty, defaultSelectionState);

    newFeatures.push(newFeature);
  });

  return {
    updatedFeature: feature,
    newFeatures: newFeatures,
    piecesCount: pieces.length,
  };
}

/**
 * Insert a hole into a Polygon or MultiPolygon feature.
 *
 * @param {jsts.io.OL3Parser} parser JSTS parser.
 * @param {ol.Feature} feature Target feature.
 * @param {ol.geom.Polygon} holePolygonGeom Drawn hole polygon.
 * @param {Object=} opt_options Options.
 * @param {number=} opt_options.coverRatioMin Minimum covered ratio required.
 * @return {boolean} True when hole has been inserted.
 * @api stable
 * @memberof lux.topology
 */
export function insertHole(feature, holePolygonGeom, opt_options) {
  const options = opt_options || {};
  const coverRatioMin = (options.coverRatioMin === undefined) ? 0.99 : options.coverRatioMin;

  const parser = getParser();
  const jstsFeature = parser.read(feature.getGeometry());
  const jstsHole = parser.read(holePolygonGeom);

  // Use contains() to verify the hole is inside the feature.
  if (!jstsFeature.contains(jstsHole)) {
    // Partial containment check via intersection area as fallback
    let coverRatio = 0;
    try {
      const intersection = jstsFeature.intersection(jstsHole);
      if (intersection) {
        const holeArea = jstsHole.getArea();
        coverRatio = holeArea > 0 ? intersection.getArea() / holeArea : 0;
      }
    } catch (e) {
      // intersection failed — hole is outside
      coverRatio = 0;
    }
    if (coverRatio < coverRatioMin) {
      return false;
    }
  }

  const holeRing = holePolygonGeom.getLinearRing(0).getCoordinates();
  const geometry = feature.getGeometry();
  const type = geometry.getType();

  if (type === 'Polygon') {
    const coords = geometry.getCoordinates();
    coords.push(holeRing);
    geometry.setCoordinates(coords);
    return true;
  }

  if (type === 'MultiPolygon') {
    const coords = geometry.getCoordinates();
    let inserted = false;

    for (let i = 0; i < coords.length; i++) {
      const testPolygon = new Polygon(coords[i]);
      if (readGeom(testPolygon).contains(jstsHole)) {
        coords[i].push(holeRing);
        inserted = true;
        break;
      }
    }

    if (inserted) {
      geometry.setCoordinates(coords);
    }

    return inserted;
  }

  throw new Error('Unsupported geometry type for hole insertion: ' + type);
}

/**
 * Return snapshot coordinates stored before modification.
 * @param {ol.Feature} feature Feature.
 * @param {string=} opt_snapshotProperty Snapshot property name.
 * @return {Object|null} Snapshot or null.
 * @memberof lux.topology
 */
export function buildRingsFromSnapshot(feature, opt_snapshotProperty) {
  const snapshotProperty = opt_snapshotProperty || '_preModifyRings';
  return feature.get(snapshotProperty) || null;
}

export default {
  propagateSharedVertices,
  mergeFeatures,
  splitFeatureWithLine,
  insertHole,
  buildRingsFromSnapshot,
};
