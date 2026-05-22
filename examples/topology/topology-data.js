(function () {
  const OGC_BASE_URL = 'https://features.geoportail.lu/collections/1637/items';
  const OGC_LIMIT = 200;
  const OGC_DATA_PROJ = 'EPSG:4326';

  function getFallbackGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'parcels.1',
          properties: { id_parcelle: '061C00204000100', surface: 1245.3, commune: 'Luxembourg', section: 'C' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[681800, 6384800], [681900, 6384800], [681900, 6384900], [681800, 6384900], [681800, 6384800]]]
          }
        },
        {
          type: 'Feature',
          id: 'parcels.2',
          properties: { id_parcelle: '061C00204000200', surface: 987.6, commune: 'Luxembourg', section: 'C' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[681900, 6384800], [682020, 6384800], [682020, 6384900], [681900, 6384900], [681900, 6384800]]]
          }
        },
        {
          type: 'Feature',
          id: 'parcels.3',
          properties: { id_parcelle: '061C00204000300', surface: 1560.0, commune: 'Luxembourg', section: 'C' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[681800, 6384900], [682020, 6384900], [682020, 6385050], [681800, 6385050], [681800, 6384900]]]
          }
        }
      ]
    };
  }

  function featureLabel(feature, index) {
    return (
      feature.get('name') ||
      feature.get('id_parcelle') ||
      feature.get('label') ||
      feature.getId() ||
      ('Feature ' + (index + 1))
    );
  }

  function cloneFeature(feature) {
    const clone = feature.clone();
    clone.setId(feature.getId());
    return clone;
  }

  function parseGeoJSONToFeatures(geojson, dataProjection) {
    const format = new ol.format.GeoJSON();
    const features = format.readFeatures(geojson, {
      featureProjection: 'EPSG:3857',
      dataProjection: dataProjection
    });

    features.forEach(function (feature, index) {
      feature.set('_originalGeom', feature.getGeometry().clone());
      feature.set('_topoLabel', featureLabel(feature, index));
    });

    return features;
  }

  function buildBboxFromMap(map) {
    const view = map.getView();
    const extent3857 = view.calculateExtent(map.getSize());
    const bboxLonLat = ol.proj.transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
    return [
      bboxLonLat[0].toFixed(6),
      bboxLonLat[1].toFixed(6),
      bboxLonLat[2].toFixed(6),
      bboxLonLat[3].toFixed(6)
    ].join(',');
  }

  function fetchOgcFeatures(map) {
    const params = new URLSearchParams({
      f: 'json',
      limit: OGC_LIMIT,
      bbox: buildBboxFromMap(map)
    });

    return fetch(OGC_BASE_URL + '?' + params.toString())
      .then(function (resp) {
        if (!resp.ok) {
          throw new Error('OGC API HTTP ' + resp.status);
        }
        return resp.json();
      })
      .then(function (geojson) {
        const features = parseGeoJSONToFeatures(geojson, OGC_DATA_PROJ);
        if (!features.length) {
          throw new Error('Aucune feature renvoyée par le service.');
        }
        return {
          features: features,
          source: 'ogc',
          count: features.length
        };
      });
  }

  function loadFeatures(map) {
    return fetchOgcFeatures(map).catch(function (error) {
      console.warn('[topology-data] OGC loading failed, using fallback data:', error.message);
      const fallbackFeatures = parseGeoJSONToFeatures(getFallbackGeoJSON(), 'EPSG:3857');
      return {
        features: fallbackFeatures,
        source: 'fallback',
        count: fallbackFeatures.length,
        error: error
      };
    });
  }

  window.topologyExamplesData = {
    loadFeatures: loadFeatures,
    featureLabel: featureLabel,
    cloneFeature: cloneFeature
  };
})();
