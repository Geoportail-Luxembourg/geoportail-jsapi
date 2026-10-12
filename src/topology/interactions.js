/**
 * @fileoverview Factory functions that create and wire OL interactions with
 * topology-aware event handlers.  Each factory adds the interaction to the
 * map and returns it so the caller can remove it later.
 */

import Select from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Draw from 'ol/interaction/Draw';
import Collection from 'ol/Collection';
import {click} from 'ol/events/condition';

import {
  DEFAULT_VERTEX_PRECISION,
  getAllCoords,
  deepCloneCoords,
  findTopologicalNeighbours,
  checkOverlapsNeighbours,
} from './core.js';
import {propagateSharedVertices} from './editing.js';

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

/**
 * Create an `ol/interaction/Select` wired with topological neighbour
 * detection.
 *
 * After each selection the `onSelect` callback is called with:
 *   `{ selected, neighbours, allFeatures }`
 *
 * @param {ol.Map} map
 * @param {ol.layer.Vector} layer  Layer to restrict selection to.
 * @param {Array<ol.Feature>} allFeatures  Full feature list used for neighbour search.
 * @param {Object=} opt_options
 * @param {string=}   opt_options.stateProperty       Default `'_selectionState'`.
 * @param {string=}   opt_options.selectedState       Default `'selected'`.
 * @param {string=}   opt_options.neighbourState      Default `'neighbour'`.
 * @param {string=}   opt_options.normalState         Default `'normal'`.
 * @param {number=}   opt_options.vertexPrecision     Default `DEFAULT_VERTEX_PRECISION`.
 * @param {function=} opt_options.onSelect            Callback after selection.
 * @return {ol.interaction.Select}
 * @api stable
 * @memberof lux.topology
 */
export function createSelectInteraction(map, layer, allFeaturesOrGetter, opt_options) {
  const options = opt_options || {};
  const stateProperty = options.stateProperty || '_selectionState';
  const selectedState = options.selectedState || 'selected';
  const neighbourState = options.neighbourState || 'neighbour';
  const normalState = options.normalState || 'normal';
  const precision = options.vertexPrecision !== undefined
    ? options.vertexPrecision : DEFAULT_VERTEX_PRECISION;
  const onSelect = options.onSelect || null;

  // Accept either a direct array OR a getter function () => Array.
  // A getter avoids stale-reference issues when the caller reassigns allFeatures.
  const getAll = typeof allFeaturesOrGetter === 'function'
    ? allFeaturesOrGetter
    : function() { return allFeaturesOrGetter; };

  console.log('[createSelectInteraction] interaction created, initial allFeatures.length =', getAll().length);

  const interaction = new Select({
    condition: click,
    layers: [layer],
    style: null,
  });

  interaction.on('select', function(evt) {
    const allFeatures = getAll();
    console.log('[Select] event fired | evt.selected.length =', evt.selected.length,
      '| evt.deselected.length =', evt.deselected.length,
      '| allFeatures.length =', allFeatures.length);

    // Reset all states
    allFeatures.forEach(function(f) { f.set(stateProperty, normalState); });

    const selected = evt.selected.concat(
      interaction.getFeatures().getArray()
        .filter(function(f) { return evt.selected.indexOf(f) === -1; })
    ).filter(function(f) { return allFeatures.indexOf(f) !== -1; });

    console.log('[Select] selected after filter =', selected.length,
      '(before filter:', evt.selected.length + interaction.getFeatures().getLength(), ')');

    selected.forEach(function(f) { f.set(stateProperty, selectedState); });

    // Detect topological neighbours for each selected feature
    const allNeighbours = [];
    selected.forEach(function(f) {
      const neighbours = findTopologicalNeighbours(f, allFeatures, {
        markNeighbours: true,
        stateProperty: stateProperty,
        neighbourState: neighbourState,
        selectedState: selectedState,
        vertexPrecision: precision,
      });
      neighbours.forEach(function(n) {
        if (allNeighbours.indexOf(n) === -1) allNeighbours.push(n);
      });
    });

    console.log('[Select] neighbours found =', allNeighbours.length);

    if (onSelect) {
      onSelect({selected: selected, neighbours: allNeighbours, allFeatures: allFeatures});
    }
  });

  map.addInteraction(interaction);
  return interaction;
}

// ---------------------------------------------------------------------------
// Snap
// ---------------------------------------------------------------------------

/**
 * Create an `ol/interaction/Snap` and add it to the map.
 *
 * @param {ol.Map} map
 * @param {ol.source.Vector} source
 * @param {Object=} opt_options  Passed through to `ol/interaction/Snap`.
 * @return {ol.interaction.Snap}
 * @api stable
 * @memberof lux.topology
 */
export function createSnapInteraction(map, source, opt_options) {
  const options = Object.assign({pixelTolerance: 10}, opt_options || {}, {source: source});
  const interaction = new Snap(options);
  map.addInteraction(interaction);
  return interaction;
}

// ---------------------------------------------------------------------------
// Modify — three topology modes
// ---------------------------------------------------------------------------

/**
 * Create an `ol/interaction/Modify` in **topological** mode: shared vertices
 * are automatically propagated to neighbours after each modification.
 *
 * @param {ol.Map} map
 * @param {Array<ol.Feature>} editableFeatures  Features to make editable.
 * @param {Array<ol.Feature>} allFeatures       Full list used for propagation.
 * @param {Object=} opt_options
 * @param {number=}   opt_options.pixelTolerance
 * @param {number=}   opt_options.vertexPrecision
 * @param {string=}   opt_options.preModifyCoordsProperty  Default `'_preModifyCoords'`.
 * @param {function=} opt_options.onModifyStart  Called with `{ features }`.
 * @param {function=} opt_options.onModifyEnd    Called with `{ features, changed }`.
 * @return {ol.interaction.Modify}
 * @api stable
 * @memberof lux.topology
 */
export function createTopologicalModifyInteraction(map, editableFeatures, allFeatures, opt_options) {
  const options = opt_options || {};
  const coordsProp = options.preModifyCoordsProperty || '_preModifyCoords';
  const precision = options.vertexPrecision !== undefined
    ? options.vertexPrecision : DEFAULT_VERTEX_PRECISION;
  const onStart = options.onModifyStart || null;
  const onEnd = options.onModifyEnd || null;

  const collection = new Collection(editableFeatures);
  const interaction = new Modify({
    features: collection,
    pixelTolerance: options.pixelTolerance || 10,
  });

  interaction.on('modifystart', function(evt) {
    evt.features.getArray().forEach(function(f) {
      f.set(coordsProp, getAllCoords(f.getGeometry()));
    });
    if (onStart) onStart({features: evt.features.getArray()});
  });

  interaction.on('modifyend', function(evt) {
    const changed = [];
    evt.features.getArray().forEach(function(f) {
      const propagated = propagateSharedVertices(f, allFeatures, {
        preModifyCoordsProperty: coordsProp,
        vertexPrecision: precision,
      });
      propagated.forEach(function(n) {
        if (changed.indexOf(n) === -1) changed.push(n);
      });
      f.set(coordsProp, getAllCoords(f.getGeometry()));
    });
    if (onEnd) onEnd({features: evt.features.getArray(), changed: changed});
  });

  map.addInteraction(interaction);
  return interaction;
}

/**
 * Create an `ol/interaction/Modify` in **free** mode: overlaps are detected
 * after each modification but the edit is always accepted.
 *
 * @param {ol.Map} map
 * @param {Array<ol.Feature>} editableFeatures
 * @param {Array<ol.Feature>} allFeatures
 * @param {Object=} opt_options
 * @param {number=}   opt_options.pixelTolerance
 * @param {number=}   opt_options.overlapAreaThreshold  Default `0.01`.
 * @param {string=}   opt_options.preModifyCoordsProperty
 * @param {string=}   opt_options.preModifyRingsProperty
 * @param {string=}   opt_options.overlapState  State set on overlapping neighbours. Default `'overlap'`.
 * @param {string=}   opt_options.stateProperty
 * @param {function=} opt_options.onModifyStart
 * @param {function=} opt_options.onModifyEnd   Called with `{ features, overlaps }`.
 * @return {ol.interaction.Modify}
 * @api stable
 * @memberof lux.topology
 */
export function createFreeModifyInteraction(map, editableFeatures, allFeatures, opt_options) {
  const options = opt_options || {};
  const coordsProp = options.preModifyCoordsProperty || '_preModifyCoords';
  const ringsProp = options.preModifyRingsProperty || '_preModifyRings';
  const overlapState = options.overlapState || 'overlap';
  const stateProperty = options.stateProperty || '_selectionState';
  const threshold = options.overlapAreaThreshold !== undefined
    ? options.overlapAreaThreshold : 0.01;
  const onStart = options.onModifyStart || null;
  const onEnd = options.onModifyEnd || null;

  const collection = new Collection(editableFeatures);
  const interaction = new Modify({
    features: collection,
    pixelTolerance: options.pixelTolerance || 10,
  });

  interaction.on('modifystart', function(evt) {
    evt.features.getArray().forEach(function(f) {
      f.set(coordsProp, getAllCoords(f.getGeometry()));
      f.set(ringsProp, deepCloneCoords(f.getGeometry().getCoordinates()));
    });
    if (onStart) onStart({features: evt.features.getArray()});
  });

  interaction.on('modifyend', function(evt) {
    // Clear previous overlap markers
    allFeatures.forEach(function(f) {
      if (f.get(stateProperty) === overlapState) f.set(stateProperty, 'normal');
    });

    const allOverlaps = [];
    evt.features.getArray().forEach(function(f) {
      const overlaps = checkOverlapsNeighbours(f, allFeatures, threshold);
      overlaps.forEach(function(other) {
        if (allOverlaps.indexOf(other) === -1) allOverlaps.push(other);
        other.set(stateProperty, overlapState);
      });
      // Accept edit regardless
      f.set(coordsProp, getAllCoords(f.getGeometry()));
      f.set(ringsProp, deepCloneCoords(f.getGeometry().getCoordinates()));
    });

    if (onEnd) onEnd({features: evt.features.getArray(), overlaps: allOverlaps});
  });

  map.addInteraction(interaction);
  return interaction;
}

/**
 * Create an `ol/interaction/Modify` in **strict** mode: the edit is rolled
 * back when an overlap is detected.
 *
 * @param {ol.Map} map
 * @param {Array<ol.Feature>} editableFeatures
 * @param {Array<ol.Feature>} allFeatures
 * @param {Object=} opt_options
 * @param {number=}   opt_options.pixelTolerance
 * @param {number=}   opt_options.overlapAreaThreshold
 * @param {string=}   opt_options.preModifyCoordsProperty
 * @param {string=}   opt_options.preModifyRingsProperty
 * @param {function=} opt_options.onModifyStart
 * @param {function=} opt_options.onModifyEnd   Called with `{ features, accepted, overlaps }`.
 * @return {ol.interaction.Modify}
 * @api stable
 * @memberof lux.topology
 */
export function createStrictModifyInteraction(map, editableFeatures, allFeatures, opt_options) {
  const options = opt_options || {};
  const coordsProp = options.preModifyCoordsProperty || '_preModifyCoords';
  const ringsProp = options.preModifyRingsProperty || '_preModifyRings';
  const threshold = options.overlapAreaThreshold !== undefined
    ? options.overlapAreaThreshold : 0.01;
  const onStart = options.onModifyStart || null;
  const onEnd = options.onModifyEnd || null;

  const collection = new Collection(editableFeatures);
  const interaction = new Modify({
    features: collection,
    pixelTolerance: options.pixelTolerance || 10,
  });

  interaction.on('modifystart', function(evt) {
    evt.features.getArray().forEach(function(f) {
      f.set(coordsProp, getAllCoords(f.getGeometry()));
      f.set(ringsProp, deepCloneCoords(f.getGeometry().getCoordinates()));
    });
    if (onStart) onStart({features: evt.features.getArray()});
  });

  interaction.on('modifyend', function(evt) {
    let allAccepted = true;
    const allOverlaps = [];

    evt.features.getArray().forEach(function(f) {
      const overlaps = checkOverlapsNeighbours(f, allFeatures, threshold);
      if (overlaps.length > 0) {
        allAccepted = false;
        overlaps.forEach(function(o) {
          if (allOverlaps.indexOf(o) === -1) allOverlaps.push(o);
        });
        // Restore geometry
        const preRings = f.get(ringsProp);
        if (preRings) {
          f.getGeometry().setCoordinates(preRings);
        }
      } else {
        f.set(coordsProp, getAllCoords(f.getGeometry()));
        f.set(ringsProp, deepCloneCoords(f.getGeometry().getCoordinates()));
      }
    });

    if (onEnd) onEnd({features: evt.features.getArray(), accepted: allAccepted, overlaps: allOverlaps});
  });

  map.addInteraction(interaction);
  return interaction;
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

/**
 * Create an `ol/interaction/Draw` and add it to the map.
 *
 * @param {ol.Map} map
 * @param {ol.source.Vector} source  Target source for drawn features.
 * @param {Object=} opt_options      Passed through to `ol/interaction/Draw`.
 *                                   `type` defaults to `'Polygon'`.
 * @param {function=} opt_options.onDrawStart  Called with `{ feature }`.
 * @param {function=} opt_options.onDrawEnd    Called with `{ feature }`.
 * @return {ol.interaction.Draw}
 * @api stable
 * @memberof lux.topology
 */
export function createDrawInteraction(map, source, opt_options) {
  const options = opt_options || {};
  const onDrawStart = options.onDrawStart || null;
  const onDrawEnd = options.onDrawEnd || null;

  const olOptions = Object.assign({type: 'Polygon'}, options, {source: source});
  delete olOptions.onDrawStart;
  delete olOptions.onDrawEnd;

  const interaction = new Draw(olOptions);

  if (onDrawStart) {
    interaction.on('drawstart', function(evt) {
      onDrawStart({feature: evt.feature});
    });
  }

  if (onDrawEnd) {
    interaction.on('drawend', function(evt) {
      onDrawEnd({feature: evt.feature});
    });
  }

  map.addInteraction(interaction);
  return interaction;
}

export default {
  createSelectInteraction,
  createSnapInteraction,
  createTopologicalModifyInteraction,
  createFreeModifyInteraction,
  createStrictModifyInteraction,
  createDrawInteraction,
};
