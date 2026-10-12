const resultsEl = document.getElementById('results');
resultsEl.textContent = 'Chargement des parcelles depuis le Feature Service…';

const map = new lux.Map({
  target: 'mapContainer',
  position: [77334, 74814],
  zoom: 14,
  bgLayer: 'basemap_2015_global'
});

const vectorSource = new ol.source.Vector();
let selectedFeature = null;
let highlightedNeighbours = [];

const vectorLayer = new ol.layer.Vector({
  source: vectorSource,
  style: function (feature) {
    const isSelected = feature === selectedFeature;
    const isNeighbour = highlightedNeighbours.indexOf(feature) !== -1;

    if (isSelected) {
      return new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(255, 80, 80, 0.35)' }),
        stroke: new ol.style.Stroke({ color: 'rgba(200, 0, 0, 1)', width: 3 }),
        zIndex: 20
      });
    }

    if (isNeighbour) {
      return new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(255, 190, 80, 0.35)' }),
        stroke: new ol.style.Stroke({ color: 'rgba(230, 140, 0, 1)', width: 3 }),
        zIndex: 15
      });
    }

    return new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(100, 150, 255, 0.3)' }),
      stroke: new ol.style.Stroke({ color: 'rgba(50, 100, 200, 0.8)', width: 2 }),
      zIndex: 10
    });
  }
});

map.addLayer(vectorLayer);

let features = [];

function label(feature) {
  return topologyExamplesData.featureLabel(feature, features.indexOf(feature));
}

topologyExamplesData.loadFeatures(map).then(function (data) {
  features = data.features;
  vectorSource.clear();
  vectorSource.addFeatures(features);

  const extent = vectorSource.getExtent();
  if (extent && isFinite(extent[0])) {
    map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 17 });
  }

  resultsEl.textContent =
    (data.source === 'ogc' ? '✅ ' : '⚠ ') +
    features.length + ' features chargées. Cliquez sur une parcelle.';
});

map.on('click', function (evt) {
  const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
    return feature;
  });

  if (clickedFeature && features.indexOf(clickedFeature) !== -1) {
    const neighbours = lux.topology.findTopologicalNeighbours(clickedFeature, features, {
      vertexPrecision: 2
    });

    selectedFeature = clickedFeature;
    highlightedNeighbours = neighbours.slice();
    vectorLayer.changed();

    let output = 'Feature: ' + label(clickedFeature) + '\n';
    output += 'Shared boundaries with:\n';

    if (neighbours.length === 0) {
      output += '  (none)';
    } else {
      neighbours.forEach(function (neighbour) {
        output += '  - ' + label(neighbour) + '\n';
      });
    }

    resultsEl.textContent = output;
  } else {
    selectedFeature = null;
    highlightedNeighbours = [];
    vectorLayer.changed();
  }
});
