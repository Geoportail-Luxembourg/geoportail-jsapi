const resultsEl = document.getElementById('results');
resultsEl.textContent = 'Loading parcels from Feature Service…';

const map = new lux.Map({
  target: 'mapContainer',
  position: [77334, 74814],
  zoom: 14,
  bgLayer: 'basemap_2015_global'
});

const vectorSource = new ol.source.Vector();
let editableFeature = null;
let allFeatures = [];

const vectorLayer = new ol.layer.Vector({
  source: vectorSource,
  style: function (feature) {
    const isEditable = feature === editableFeature;
    return new ol.style.Style({
      fill: new ol.style.Fill({
        color: isEditable ? 'rgba(255, 100, 100, 0.4)' : 'rgba(100, 150, 255, 0.3)'
      }),
      stroke: new ol.style.Stroke({
        color: isEditable ? 'rgba(200, 0, 0, 1)' : 'rgba(50, 100, 200, 0.8)',
        width: isEditable ? 3 : 2
      }),
      zIndex: isEditable ? 20 : 10
    });
  }
});

map.addLayer(vectorLayer);

function renderValidationMessage(prefixHtml) {
  if (!editableFeature) {
    resultsEl.innerHTML = '<span class="warn">No editable parcel available.</span>';
    return;
  }

  const geomValidation = lux.topology.validateGeometry(editableFeature.getGeometry(), {
    attemptFix: true
  });

  const overlapResult = lux.topology.checkOverlapsNeighboursDetailed(
    editableFeature,
    allFeatures,
    0.01
  );

  let html = '';
  if (prefixHtml) {
    html += prefixHtml + '\n';
  }

  if (geomValidation.isValid) {
    html += '<span class="ok">✅ Geometry is valid.</span>\n';
  } else {
    html += '<span class="error">⛔ Geometry error detected.</span>\n';
    html += 'message: ' + geomValidation.message + '\n';
    html += 'selfIntersection: ' + geomValidation.hasSelfIntersection + '\n';
    html += 'fixAvailable: ' + geomValidation.fixed + '\n';
  }

  html += '\nOverlap diagnostics:\n';
  html += 'selfIntersectionDetected: ' + overlapResult.selfIntersectionDetected + '\n';
  html += 'invalidGeometryDetected: ' + overlapResult.invalidGeometryDetected + '\n';
  html += 'overlapCount: ' + overlapResult.overlaps.length + '\n';

  if (overlapResult.overlaps.length > 0) {
    html += 'overlapsWith:\n';
    overlapResult.overlaps.forEach(function (feature, index) {
      const label = topologyExamplesData.featureLabel(feature, index);
      html += '  - ' + label + '\n';
    });
  }

  resultsEl.innerHTML = html;
}

topologyExamplesData.loadFeatures(map).then(function (data) {
  const polygonFeatures = data.features.filter(function (feature) {
    const geometry = feature.getGeometry();
    if (!geometry) {
      return false;
    }
    const type = geometry.getType();
    return type === 'Polygon' || type === 'MultiPolygon';
  });

  if (polygonFeatures.length === 0) {
    resultsEl.innerHTML = '<span class="error">No polygon parcel loaded.</span>';
    return;
  }

  editableFeature = polygonFeatures[0];
  allFeatures = polygonFeatures;

  vectorSource.clear();
  vectorSource.addFeatures(polygonFeatures.slice(1));
  vectorSource.addFeature(editableFeature);

  const extent = editableFeature.getGeometry() && editableFeature.getGeometry().getExtent();
  if (extent && isFinite(extent[0])) {
    map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18 });
  }

  const modifyInteraction = new ol.interaction.Modify({
    features: new ol.Collection([editableFeature]),
    pixelTolerance: 10
  });

  modifyInteraction.on('modifyend', function () {
    renderValidationMessage('<span class="warn">Geometry changed. Validation executed.</span>');
  });

  map.addInteraction(modifyInteraction);

  const loadMsg = data.source === 'ogc'
    ? '<span class="ok">✅ Feature Service loaded.</span>'
    : '<span class="warn">⚠ Fallback dataset loaded.</span>';

  renderValidationMessage(loadMsg + '\nDrag vertices on the red parcel to validate geometry.');
});
