const VERTEX_PRECISION = 2;
const resultsEl = document.getElementById('results');

resultsEl.textContent = 'Chargement des parcelles depuis le Feature Service…';

const map = new lux.Map({
  target: 'mapContainer',
  position: [77334, 74814],
  zoom: 14,
  bgLayer: 'basemap_2015_global'
});

const vectorSource = new ol.source.Vector();
let features = [];
let editableFeature = null;
let neighbourFeature = null;
let modifyInteraction = null;

const styleDefault = new ol.style.Style({
  fill: new ol.style.Fill({ color: 'rgba(120, 144, 156, 0.18)' }),
  stroke: new ol.style.Stroke({ color: 'rgba(90, 120, 140, 0.55)', width: 1.5 }),
  zIndex: 5
});

const styleEditable = new ol.style.Style({
  fill: new ol.style.Fill({ color: 'rgba(244, 67, 54, 0.38)' }),
  stroke: new ol.style.Stroke({ color: 'rgba(183, 28, 28, 1)', width: 4, lineDash: [10, 6] }),
  zIndex: 30
});

const styleNeighbour = new ol.style.Style({
  fill: new ol.style.Fill({ color: 'rgba(255, 193, 7, 0.34)' }),
  stroke: new ol.style.Stroke({ color: 'rgba(245, 124, 0, 1)', width: 3 }),
  zIndex: 20
});

const vectorLayer = new ol.layer.Vector({
  source: vectorSource,
  style: function (feature) {
    if (feature === editableFeature) {
      return styleEditable;
    }
    if (feature === neighbourFeature) {
      return styleNeighbour;
    }
    return styleDefault;
  }
});

map.addLayer(vectorLayer);

function label(feature) {
  return topologyExamplesData.featureLabel(feature, features.indexOf(feature));
}

function setEditableFeature(feature) {
  editableFeature = feature;
  neighbourFeature = null;

  if (modifyInteraction) {
    map.removeInteraction(modifyInteraction);
    modifyInteraction = null;
  }

  if (editableFeature) {
    const neighbours = lux.topology.findTopologicalNeighbours(editableFeature, features, {
      vertexPrecision: VERTEX_PRECISION
    });
    neighbourFeature = neighbours.length > 0 ? neighbours[0] : null;

    modifyInteraction = lux.topology.createTopologicalModifyInteraction(
      map,
      [editableFeature],
      features,
      {
        pixelTolerance: 10,
        vertexPrecision: VERTEX_PRECISION,
        onModifyEnd: function (payload) {
          const modifiedFeature = payload.features[0];
          const coordsBefore = modifiedFeature.get('_preModifyCoords') || [];
          const coordsAfter = lux.topology.getAllCoords(modifiedFeature.getGeometry());

          let output = 'Vertex Propagation Log\n';
          output += '======================\n\n';
          output += 'Modified coordinates in: ' + label(modifiedFeature) + '\n';
          output += 'Before: ' + coordsBefore.length + ' vertices\n';
          output += 'After: ' + coordsAfter.length + ' vertices\n\n';

          output += 'Propagation Result:\n';
          output += 'Features updated: ' + payload.changed.length + '\n';
          if (payload.changed.length > 0) {
            output += 'Updated features:\n';
            payload.changed.forEach(function (updatedFeature) {
              output += '  - ' + label(updatedFeature) + '\n';
            });
            output += '\n✅ Vertices synchronized across boundaries';
          } else {
            output += 'No adjacent features updated\n';
          }

          resultsEl.textContent = output;
          vectorLayer.changed();
        }
      }
    );
  }

  vectorLayer.changed();

  if (!editableFeature) {
    resultsEl.textContent = 'Click a parcel to make it editable.';
    return;
  }

  resultsEl.textContent =
    'Editable feature: ' + label(editableFeature) + '\n' +
    'Neighbour watched: ' + (neighbourFeature ? label(neighbourFeature) : '(none)') + '\n\n' +
    'Drag vertices on the selected parcel to trigger propagation.';
}

topologyExamplesData.loadFeatures(map).then(function (data) {
  features = data.features;
  vectorSource.clear();
  vectorSource.addFeatures(features);

  const extent = vectorSource.getExtent();
  if (extent && isFinite(extent[0])) {
    map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 17 });
  }

  map.on('click', function (evt) {
    const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
      return feature;
    });

    if (!clickedFeature || features.indexOf(clickedFeature) === -1) {
      setEditableFeature(null);
      return;
    }

    setEditableFeature(clickedFeature);
  });

  setEditableFeature(null);
  resultsEl.textContent =
    (data.source === 'ogc' ? '✅ Feature Service loaded.\n' : '⚠ Fallback dataset loaded.\n') +
    'Click a parcel to make it editable.\n' +
    'Visual guide:\n' +
    '- RED dashed polygon = currently editable parcel\n' +
    '- ORANGE polygon = one adjacent neighbour\n' +
    'Then drag the red vertices to trigger propagation.';
});
