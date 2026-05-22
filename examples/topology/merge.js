const resultsEl = document.getElementById('results');
const mergeBtn = document.getElementById('mergeBtn');
const resetBtn = document.getElementById('resetBtn');

resultsEl.textContent = 'Chargement des parcelles depuis le Feature Service…';

const map = new lux.Map({
  target: 'mapContainer',
  position: [77334, 74814],
  zoom: 14,
  bgLayer: 'basemap_2015_global'
});

const selectedFeatures = new ol.Collection();
let features = [];
let initialFeatures = [];

const vectorSource = new ol.source.Vector();
const vectorLayer = new ol.layer.Vector({
  source: vectorSource,
  style: function (feature) {
    const isSelected = selectedFeatures.getArray().indexOf(feature) !== -1;
    return new ol.style.Style({
      fill: new ol.style.Fill({
        color: isSelected ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 150, 255, 0.3)'
      }),
      stroke: new ol.style.Stroke({
        color: isSelected ? 'rgba(200, 0, 0, 1)' : 'rgba(50, 100, 200, 0.8)',
        width: isSelected ? 3 : 2
      })
    });
  }
});

map.addLayer(vectorLayer);

function label(feature) {
  return topologyExamplesData.featureLabel(feature, features.indexOf(feature));
}

function updateUI(prefix) {
  const count = selectedFeatures.getArray().length;
  mergeBtn.disabled = count < 2;

  let output = prefix ? prefix + '\n\n' : '';
  output += 'Selected: ' + count + ' feature(s)\n';
  if (count > 0) {
    selectedFeatures.forEach(function (f) {
      output += '  - ' + label(f) + '\n';
    });
  }
  resultsEl.textContent = output;
}

topologyExamplesData.loadFeatures(map).then(function (data) {
  features = data.features;
  initialFeatures = features.map(topologyExamplesData.cloneFeature);
  vectorSource.clear();
  vectorSource.addFeatures(features);

  const extent = vectorSource.getExtent();
  if (extent && isFinite(extent[0])) {
    map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 17 });
  }

  updateUI((data.source === 'ogc' ? '✅' : '⚠') + ' ' + features.length + ' features chargées');
});

map.on('click', function (evt) {
  const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
    return feature;
  });

  if (clickedFeature && features.indexOf(clickedFeature) !== -1) {
    if (selectedFeatures.getArray().indexOf(clickedFeature) !== -1) {
      selectedFeatures.remove(clickedFeature);
    } else {
      selectedFeatures.push(clickedFeature);
    }

    vectorLayer.changed();
    updateUI();
  }
});

mergeBtn.addEventListener('click', function () {
  const toMerge = selectedFeatures.getArray();
  if (toMerge.length < 2) {
    alert('Please select at least 2 features to merge');
    return;
  }

  try {
    const mergeResult = lux.topology.mergeFeatures(toMerge);
    const primaryFeature = mergeResult.primaryFeature;
    const removedFeatures = mergeResult.removedFeatures;

    primaryFeature.set('name', 'Merged Parcel');

    removedFeatures.forEach(function (f) {
      vectorSource.removeFeature(f);
    });

    selectedFeatures.clear();
    features = vectorSource.getFeatures().slice();
    vectorLayer.changed();

    let output = '✅ Merge successful!\n\n';
    output += 'Merged ' + toMerge.length + ' features into 1.\n';
    output += 'Result area (approx): ' + primaryFeature.getGeometry().getArea().toFixed(0) + ' m²';
    updateUI(output);
  } catch (e) {
    updateUI('❌ Merge failed:\n' + e.message);
  }
});

resetBtn.addEventListener('click', function () {
  selectedFeatures.clear();
  vectorSource.clear();
  features = initialFeatures.map(topologyExamplesData.cloneFeature);
  vectorSource.addFeatures(features);
  vectorLayer.changed();
  updateUI('🔄 Initial dataset restored.');
});
