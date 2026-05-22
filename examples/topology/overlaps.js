const resultsEl = document.getElementById('results');
resultsEl.textContent = 'Chargement des parcelles depuis le Feature Service…';

const map = new lux.Map({
  target: 'mapContainer',
  position: [77334, 74814],
  zoom: 14,
  bgLayer: 'basemap_2015_global'
});

const vectorSource = new ol.source.Vector();
let movablePolygon = null;
let fixedFeatures = [];

const vectorLayer = new ol.layer.Vector({
  source: vectorSource,
  style: function (feature) {
    const isMovable = feature === movablePolygon;
    return new ol.style.Style({
      fill: new ol.style.Fill({
        color: isMovable ? 'rgba(255, 100, 100, 0.4)' : 'rgba(100, 150, 255, 0.3)'
      }),
      stroke: new ol.style.Stroke({
        color: isMovable ? 'rgba(200, 0, 0, 1)' : 'rgba(50, 100, 200, 0.8)',
        width: 2
      }),
      zIndex: isMovable ? 20 : 10
    });
  }
});

map.addLayer(vectorLayer);

function label(feature) {
  return topologyExamplesData.featureLabel(feature, fixedFeatures.indexOf(feature));
}

function checkForOverlaps() {
  if (!movablePolygon) {
    return;
  }

  const overlapResult = lux.topology.checkOverlapsNeighboursDetailed(movablePolygon, fixedFeatures, 0.01);
  const overlaps = overlapResult.overlaps;

  let output = '';
  if (overlaps.length > 0) {
    output = '<span class="overlap">⚠ OVERLAP DETECTED!</span>\n';
    output += 'The movable parcel overlaps with:\n';
    overlaps.forEach(function (feature) {
      output += '  - ' + label(feature) + '\n';
    });
  } else {
    output = '<span class="clean">✅ No overlap detected</span>\n';
    output += 'Movable parcel is clear of other features.';
  }

  if (overlapResult.selfIntersectionDetected || overlapResult.invalidGeometryDetected) {
    output += '\n\n<span class="overlap">Geometry warning:</span> invalid/self-intersecting geometry detected on input.';
  }

  resultsEl.innerHTML = output;
}

topologyExamplesData.loadFeatures(map).then(function (data) {
  const loadedFeatures = data.features;
  const polygonFeatures = loadedFeatures.filter(function (feature) {
    const geometry = feature.getGeometry();
    if (!geometry) {
      return false;
    }
    const type = geometry.getType();
    return type === 'Polygon' || type === 'MultiPolygon';
  });

  if (polygonFeatures.length < 2) {
    resultsEl.innerHTML = '<span class="overlap">Not enough features loaded to test overlaps.</span>';
    return;
  }

  movablePolygon = polygonFeatures[0];
  fixedFeatures = polygonFeatures.slice(1);

  vectorSource.clear();
  vectorSource.addFeatures(fixedFeatures);
  vectorSource.addFeature(movablePolygon);

  const movableExtent = movablePolygon.getGeometry() && movablePolygon.getGeometry().getExtent();
  if (movableExtent && isFinite(movableExtent[0])) {
    map.getView().fit(movableExtent, { padding: [80, 80, 80, 80], maxZoom: 18 });
  }

  const editCollection = new ol.Collection([movablePolygon]);
  const modifyInteraction = new ol.interaction.Modify({
    features: editCollection,
    pixelTolerance: 10
  });

  modifyInteraction.on('modifyend', function () {
    checkForOverlaps();
  });

  map.addInteraction(modifyInteraction);
  resultsEl.innerHTML =
    (data.source === 'ogc' ? '<span class="clean">✅ Feature Service loaded.</span>\n' : '<span class="overlap">⚠ Fallback dataset loaded.</span>\n') +
    'Drag the red polygon to test overlap detection.';

  checkForOverlaps();
});
