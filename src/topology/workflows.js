/**
 * @fileoverview High-level topology workflows (orchestration wrappers).
 */

import {
  DEFAULT_VERTEX_PRECISION,
  getAllCoords,
  deepCloneCoords,
  findTopologicalNeighbours,
  checkOverlapsNeighbours,
} from './core.js';
import {propagateSharedVertices} from './editing.js';

/**
 * Snapshot feature geometry before an interactive modification.
 *
 * Stores both flat coordinates and full rings on the feature.
 *
 * @param {ol.Feature} feature Feature to snapshot.
 * @param {Object=} opt_options Options.
 * @param {string=} opt_options.preModifyCoordsProperty Property for flat coords snapshot.
 * @param {string=} opt_options.preModifyRingsProperty Property for full rings snapshot.
 * @return {{coordsCount: number, ringsStored: boolean}} Snapshot metadata.
 * @memberof lux.topology
 */
export function snapshotBeforeModify(feature, opt_options) {
  const options = opt_options || {};
  const preModifyCoordsProperty = options.preModifyCoordsProperty || '_preModifyCoords';
  const preModifyRingsProperty = options.preModifyRingsProperty || '_preModifyRings';

  const geometry = feature.getGeometry();
  const coords = getAllCoords(geometry);
  feature.set(preModifyCoordsProperty, coords);

  let ringsStored = false;
  const type = geometry.getType();
  if (type === 'Polygon' || type === 'MultiPolygon') {
    feature.set(preModifyRingsProperty, deepCloneCoords(geometry.getCoordinates()));
    ringsStored = true;
  }

  return {
    coordsCount: coords.length,
    ringsStored: ringsStored,
  };
}

/**
 * Select a target and compute topological neighbours in one call.
 *
 * This wrapper can also mark feature state properties and append neighbours to
 * an existing selection array.
 *
 * @param {jsts.io.OL3Parser} parser JSTS parser.
 * @param {ol.Feature} targetFeature Selected target feature.
 * @param {Array<ol.Feature>} allFeatures All features.
 * @param {Object=} opt_options Options.
 * @param {string=} opt_options.stateProperty Feature state property.
 * @param {string=} opt_options.selectedState State value for selected target.
 * @param {string=} opt_options.neighbourState State value for neighbours.
 * @param {boolean=} opt_options.resetStates Whether to reset all features to normal first.
 * @param {string=} opt_options.normalState State value used when resetting.
 * @param {Array<ol.Feature>=} opt_options.selectionArray Optional existing selection array to update.
 * @param {number=} opt_options.vertexPrecision Vertex precision.
 * @return {{neighbours: Array<ol.Feature>, selection: Array<ol.Feature>}} Result object.
 * @memberof lux.topology
 */
export function selectWithNeighbours(targetFeature, allFeatures, opt_options) {
  const options = opt_options || {};
  const stateProperty = options.stateProperty || '_selectionState';
  const selectedState = options.selectedState || 'selected';
  const neighbourState = options.neighbourState || 'neighbour';
  const normalState = options.normalState || 'normal';
  const resetStates = options.resetStates !== false;

  if (resetStates) {
    allFeatures.forEach(function(feature) {
      feature.set(stateProperty, normalState);
    });
  }
  targetFeature.set(stateProperty, selectedState);

  const neighbours = findTopologicalNeighbours(targetFeature, allFeatures, {
    markNeighbours: true,
    stateProperty: stateProperty,
    neighbourState: neighbourState,
    selectedState: selectedState,
    vertexPrecision: options.vertexPrecision,
  });

  const selection = (options.selectionArray || []).slice();
  if (selection.indexOf(targetFeature) === -1) {
    selection.push(targetFeature);
  }
  neighbours.forEach(function(candidate) {
    if (selection.indexOf(candidate) === -1) {
      selection.push(candidate);
    }
  });

  return {
    neighbours: neighbours,
    selection: selection,
  };
}

/**
 * Run common post-modification topology workflow in one call:
 * - propagate shared vertices to neighbours
 * - compute overlaps
 *
 * @param {jsts.io.OL3Parser} parser JSTS parser.
 * @param {ol.Feature} modifiedFeature Modified feature.
 * @param {Array<ol.Feature>} allFeatures All features.
 * @param {Object=} opt_options Options.
 * @param {string=} opt_options.preModifyCoordsProperty Property name used by propagation.
 * @param {number=} opt_options.vertexPrecision Vertex precision.
 * @param {number=} opt_options.overlapAreaThreshold Overlap threshold area.
 * @return {{propagated: Array<ol.Feature>, overlaps: Array<ol.Feature>}} Result object.
 * @memberof lux.topology
 */
export function postModifyTopology(modifiedFeature, allFeatures, opt_options) {
  const options = opt_options || {};
  const propagated = propagateSharedVertices(modifiedFeature, allFeatures, {
    preModifyCoordsProperty: options.preModifyCoordsProperty || '_preModifyCoords',
    vertexPrecision: (options.vertexPrecision === undefined) ? DEFAULT_VERTEX_PRECISION : options.vertexPrecision,
    onFeatureChanged: options.onFeatureChanged,
  });

  const overlaps = checkOverlapsNeighbours(
    modifiedFeature,
    allFeatures,
    (options.overlapAreaThreshold === undefined) ? 0.01 : options.overlapAreaThreshold
  );

  return {
    propagated: propagated,
    overlaps: overlaps,
  };
}

/**
 * Strict overlap policy helper.
 *
 * If overlaps are detected, restore geometry from snapshot rings property.
 *
 * @param {jsts.io.OL3Parser} parser JSTS parser.
 * @param {ol.Feature} feature Modified feature.
 * @param {Array<ol.Feature>} allFeatures All features.
 * @param {Object=} opt_options Options.
 * @param {string=} opt_options.preModifyRingsProperty Snapshot rings property.
 * @param {number=} opt_options.overlapAreaThreshold Overlap threshold area.
 * @return {{accepted: boolean, overlaps: Array<ol.Feature>, restored: boolean}} Result object.
 * @memberof lux.topology
 */
export function enforceStrictNoOverlap(feature, allFeatures, opt_options) {
  const options = opt_options || {};
  const preModifyRingsProperty = options.preModifyRingsProperty || '_preModifyRings';
  const overlaps = checkOverlapsNeighbours(
    feature,
    allFeatures,
    (options.overlapAreaThreshold === undefined) ? 0.01 : options.overlapAreaThreshold
  );

  if (overlaps.length === 0) {
    return {
      accepted: true,
      overlaps: [],
      restored: false,
    };
  }

  const preRings = feature.get(preModifyRingsProperty);
  let restored = false;
  if (preRings) {
    feature.getGeometry().setCoordinates(preRings);
    restored = true;
  }

  return {
    accepted: false,
    overlaps: overlaps,
    restored: restored,
  };
}

export default {
  snapshotBeforeModify,
  selectWithNeighbours,
  postModifyTopology,
  enforceStrictNoOverlap,
};
