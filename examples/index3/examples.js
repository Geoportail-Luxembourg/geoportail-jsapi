(function () {
  function ensureLayout() {
    if (document.getElementById('map') && document.getElementById('title')) {
      return;
    }

    if (!document.getElementById('index3-example-style')) {
      var style = document.createElement('style');
      style.id = 'index3-example-style';
      style.textContent = '' +
        'body{margin:0;font-family:Arial,sans-serif;background:#f5f7fb;color:#1f2937;}' +
        '.wrap{max-width:1200px;margin:0 auto;padding:18px;}' +
        '.header{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;}' +
        '.header a{text-decoration:none;color:#0b4ea2;font-weight:bold;}' +
        '.header h1{margin:8px 0 6px;font-size:22px;}' +
        '.header p{margin:0;color:#4b5563;}' +
        '#extra{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:12px;min-height:20px;}' +
        '#map{width:100%;height:520px;border-radius:12px;border:1px solid #d1d5db;background:#dbeafe;}' +
        '.panel{margin-top:10px;padding:10px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;min-height:20px;}' +
        '.profile{height:200px;overflow:auto;}' +
        '.layermanager,.bgselector{margin-top:8px;}';
      document.head.appendChild(style);
    }

    document.body.innerHTML = '' +
      '<div class="wrap">' +
        '<div class="header">' +
          '<a href="../index.html">← Back to examples home</a>' +
          '<h1 id="title">Loading…</h1>' +
          '<p id="description"></p>' +
        '</div>' +
        '<div id="extra"></div>' +
        '<div id="map"></div>' +
        '<div id="info" class="panel"></div>' +
      '</div>';
  }

  function initProjection() {
    if (window.proj4 && window.ol && ol.proj && ol.proj.proj4) {
      proj4.defs('EPSG:2169', '+proj=tmerc +lat_0=49.83333333333334 +lon_0=6.166666666666667 +k=1 +x_0=80000 +y_0=100000 +ellps=intl +towgs84=-189.681,18.3463,-42.7695,-0.33746,-3.09264,2.53861,0.4598 +units=m +no_defs');
      ol.proj.proj4.register(proj4);
    }
    if (window.lux && lux.setPopupSize) {
      lux.setPopupSize([400, 150]);
    }
  }

  function baseMap(options) {
    return new lux.Map(Object.assign({
      target: 'map',
      bgLayer: 'basemap_2015_global',
      zoom: 18,
      position: [76771, 72205]
    }, options || {}));
  }

  function setInfo(html) {
    document.getElementById('info').innerHTML = html || '';
  }

  function setExtra(html) {
    document.getElementById('extra').innerHTML = html || '';
  }

  function currentExampleId() {
    if (window.EXAMPLE_ID) {
      return String(window.EXAMPLE_ID);
    }

    var bodyExampleId = document.body && document.body.getAttribute('data-example-id');
    if (bodyExampleId) {
      return bodyExampleId;
    }

    var params = new URLSearchParams(window.location.search);
    return params.get('id') || '1';
  }

  function extractFunctionBody(fn) {
    var text = String(fn || '');
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return text;
    }
    return text.slice(start + 1, end).replace(/^\n/, '').replace(/\n\s*$/, '');
  }

  function showSourcePanel(exampleId, exampleDef) {
    var wrap = document.querySelector('.wrap') || document.body;
    var panel = document.createElement('div');
    panel.className = 'panel code-panel';
    panel.innerHTML = '<h2 style="margin:0 0 6px;font-size:16px;">Code</h2><pre id="index3-code" style="margin:0;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px;white-space:pre-wrap;overflow:visible;font-size:12px;font-family:monospace;"></pre>';
    wrap.appendChild(panel);

    var target = panel.querySelector('#index3-code');
    if (!exampleDef || typeof exampleDef.run !== 'function') {
      target.textContent = 'Unable to render example source code.';
      return;
    }

    var baseMapCode = String(baseMap || '');
    var exampleCode =
      "// Shared helper used by this example\n" +
      baseMapCode + "\n\n" +
      "// " + (exampleDef.title || ('Example ' + exampleId)) + "\n" +
      "// " + (exampleDef.description || '') + "\n" +
      "\n" +
      extractFunctionBody(exampleDef.run);

    target.textContent = exampleCode;
  }

  var examples = {
    '1': {
      title: 'Example 1 — Basic map',
      description: 'Basic map with center and zoom.',
      run: function () { baseMap(); }
    },
    '1a': {
      title: 'Example 1a — Basic map with print',
      description: 'Adds a button to print the current map.',
      run: function () {
        setExtra('<button id="printBtn">Print map</button>');
        var map = baseMap();
        document.getElementById('printBtn').addEventListener('click', function () {
          map.print();
        });
      }
    },
    '1b': {
      title: 'Example 1b — Coordinates on map',
      description: 'Displays coordinates inside the map container.',
      run: function () {
        baseMap({
          mousePosition: {
            target: 'map',
            srs: 2169
          }
        });
      }
    },
    '1c': {
      title: 'Example 1c — Coordinates in a div',
      description: 'Displays coordinates in a separate panel.',
      run: function () {
        setExtra('<div id="coord1c"></div>');
        baseMap({
          mousePosition: {
            target: 'coord1c',
            srs: 2169
          }
        });
      }
    },
    '2': {
      title: 'Example 2 — Simple marker',
      description: 'Displays a marker with popup.',
      run: function () {
        var map = baseMap();
        map.showMarker({
          positioning: 'center-center',
          iconURL: '../lion.png',
          html: '<h2>The popover</h2><p>With some content</p><ul><li>Item 1</li><li>Item 2</li></ul>'
        });
      }
    },
    '2a': {
      title: 'Example 2a — Clickable marker popup',
      description: 'Opens marker popup on click.',
      run: function () {
        var map = baseMap();
        map.showMarker({
          positioning: 'center-center',
          iconURL: '../lion.png',
          click: true,
          html: '<h2>The popover</h2><p>With some content</p><ul><li>Item 1</li><li>Item 2</li></ul>'
        });
      }
    },
    '2b': {
      title: 'Example 2b — Marker away from center',
      description: 'Map center is different from marker position.',
      run: function () {
        var map = baseMap({
          bgLayer: 'streets_jpeg',
          position: [77213, 71822]
        });
        map.showMarker({
          position: [76771, 72205],
          positioning: 'center-center',
          iconURL: '../lion.png',
          html: '<h2>The popover</h2><p>With some content</p><ul><li>Item 1</li><li>Item 2</li></ul>'
        });
      }
    },
    '2c': {
      title: 'Example 2c — Popup in a div',
      description: 'Renders popup content inside a panel.',
      run: function () {
        setInfo('');
        var map = baseMap();
        map.showMarker({
          positioning: 'center-center',
          iconURL: '../lion.png',
          click: true,
          target: 'info',
          html: '<h2>The popover</h2><p>With some content</p><ul><li>Item 1</li><li>Item 2</li></ul>'
        });
      }
    },
    '2d': {
      title: 'Example 2d — Markers in different SRS',
      description: 'Displays one marker in EPSG:2169 and one in EPSG:4326.',
      run: function () {
        var map = baseMap();
        map.showMarker({
          position: [76771, 72205],
          positioning: 'center-center',
          iconURL: '../lion.png',
          click: false,
          target: 'info'
        });
        map.showMarker({
          position: [6.11149, 49.61062],
          positionSrs: 4326,
          positioning: 'center-center',
          iconURL: '../lion.png',
          click: false,
          target: 'info'
        });
      }
    },
    '3': {
      title: 'Example 3 — Overlay, layer manager and basemap selector',
      description: 'Shows layer manager and basemap selector in separate divs.',
      run: function () {
        setExtra('<div id="layerManager3" class="layermanager"></div><div id="bgMap3" class="bgselector"></div>');
        baseMap({
          bgLayer: 'streets_jpeg',
          layers: ['149', '1386', '512'],
          layerOpacities: [0.6, 0.8, 0.8],
          layerVisibilities: [true, true, false],
          layerManager: { target: 'layerManager3' },
          bgSelector: { target: 'bgMap3' },
          zoom: 12,
          position: [76825, 75133]
        });
      }
    },
    '4': {
      title: 'Example 4 — GPX',
      description: 'Loads a GPX file with click popup.',
      run: function () {
        var map = baseMap({
          bgLayer: 'streets_jpeg',
          zoom: 12,
          position: [76825, 75133]
        });
        map.addGPX('../DemoGPX.gpx', { click: true, target: 'info' });
      }
    },
    '4b': {
      title: 'Example 4b — Styled GPX',
      description: 'Loads a GPX file with custom style.',
      run: function () {
        var map = baseMap({
          bgLayer: 'streets_jpeg',
          zoom: 12,
          position: [76825, 75133]
        });
        var style = {
          Point: new ol.style.Style({
            image: new ol.style.Circle({
              fill: new ol.style.Fill({ color: 'rgba(255,255,255,1)' }),
              radius: 10,
              stroke: new ol.style.Stroke({ color: '#FFFFFF', width: 1 })
            })
          }),
          LineString: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#FFFFFF', width: 3 })
          }),
          MultiLineString: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#FFFFFF', width: 3 })
          })
        };
        map.addGPX('../DemoGPX.gpx', {
          style: function (feature) {
            return style[feature.getGeometry().getType()];
          },
          click: true
        });
      }
    },
    '5': {
      title: 'Example 5 — KML',
      description: 'Loads a KML feed with periodic refresh.',
      run: function () {
        var map = baseMap({
          bgLayer: 'streets_jpeg',
          zoom: 12,
          position: [76825, 75133]
        });
        map.addKML('//cita.lu/kml/chantiers_actuel.kml', { reloadInterval: 60, click: true });
      }
    },
    '6': {
      title: 'Example 6 — Search in map',
      description: 'Adds the search bar directly inside the map.',
      run: function () {
        baseMap({
          bgLayer: 'topo_bw_jpeg',
          zoom: 12,
          position: [76825, 75133],
          search: { target: 'map' }
        });
      }
    },
    '7': {
      title: 'Example 7 — Search in a div',
      description: 'Adds search in a separate div and enables Coordinates dataset.',
      run: function () {
        setExtra('<div id="search7"></div>');
        baseMap({
          bgLayer: 'topo_bw_jpeg',
          zoom: 12,
          position: [76825, 75133],
          search: {
            target: 'search7',
            dataSets: ['Address', 'Coordinates']
          }
        });
      }
    },
    '8': {
      title: 'Example 8 — Basic MyMaps',
      description: 'Adds a MyMaps layer.',
      run: function () {
        var map = baseMap({
          bgLayer: 'topogr_global',
          zoom: 12,
          position: [76825, 75133]
        });
        map.addMyMapLayer({ mapId: '0416ef680fbe4cdaa2d8009262d1127c' });
      }
    },
    '9': {
      title: 'Example 9 — MyMaps + profile',
      description: 'Displays the route profile in a panel.',
      run: function () {
        setExtra('<div id="profile9" class="profile"></div>');
        var map = baseMap({
          bgLayer: 'topo_bw_jpeg',
          zoom: 12,
          position: [76825, 75133]
        });
        map.addMyMapLayer({
          mapId: '76d7d4d147c74dba89ef407598b135b6',
          profileTarget: 'profile9'
        });
      }
    },
    '10': {
      title: 'Example 10 — MyMaps + opened profile',
      description: 'Opens the profile on layer load.',
      run: function () {
        setExtra('<div id="profile10" class="profile"></div>');
        var map = baseMap({
          bgLayer: 'topo_bw_jpeg',
          zoom: 12,
          position: [76825, 75133]
        });
        map.addMyMapLayer({
          mapId: '76d7d4d147c74dba89ef407598b135b6',
          onload: function (features) {
            this.loadProfile(features[0].getGeometry(), 'profile10');
          }
        });
      }
    },
    '11': {
      title: 'Example 11 — Recenter on parcel',
      description: 'Loads parcel layers and zooms to a feature ID.',
      run: function () {
        baseMap({
          bgLayer: 'blank',
          layers: ['parcels', 'parcels_labels'],
          features: {
            ids: ['061C00204002980'],
            layer: '359'
          }
        });
      }
    },
    '11b': {
      title: 'Example 11b — Recenter + click info',
      description: 'Same principle with info shown on click.',
      run: function () {
        baseMap({
          bgLayer: 'blank',
          layers: ['parcels', 'parcels_labels'],
          features: {
            ids: ['061C00204002980'],
            layer: '359',
            click: true
          }
        });
      }
    },
    '11c': {
      title: 'Example 11c — Parcel info in a div',
      description: 'Displays parcel information in the bottom panel.',
      run: function () {
        baseMap({
          bgLayer: 'blank',
          layers: ['parcels', 'parcels_labels'],
          features: {
            ids: ['061C00204002980'],
            layer: '359',
            click: true,
            target: 'info'
          }
        });
      }
    },
    '12': {
      title: 'Example 12 — Geocoding',
      description: 'Searches an address and places a marker.',
      run: function () {
        var map = baseMap({ zoom: 17 });
        lux.geocode({
          num: 1,
          street: 'Rue Charles Darwin',
          zip: 1433,
          locality: 'luxembourg'
        }, function (position) {
          map.showMarker({
            position: position,
            autoCenter: true,
            positioning: 'center-center',
            iconURL: '../lion.png'
          });
        });
      }
    },
    '13': {
      title: 'Example 13 — Reverse geocoding',
      description: 'Click on the map to display an address.',
      run: function () {
        setInfo('<strong>Address:</strong> click on the map');
        var map = baseMap({
          zoom: 15,
          position: [76825, 75133]
        });
        map.on('click', function (evt) {
          var coordinate = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:2169');
          lux.reverseGeocode(coordinate, function (address) {
            var html = [address.number, address.street, address.postal_code + ' ' + address.locality].join(', ');
            setInfo('<strong>Address:</strong> ' + html);
          });
        });
      }
    },
    '14': {
      title: 'Example 14 — Tooltips on map',
      description: 'Enables layer information popup.',
      run: function () {
        baseMap({
          zoom: 15,
          position: [76825, 75133],
          layers: [147],
          showLayerInfoPopup: true
        });
      }
    },
    '15': {
      title: 'Example 15 — Tooltips in a div',
      description: 'Renders layer information inside the panel.',
      run: function () {
        baseMap({
          zoom: 12,
          position: [76825, 75133],
          layers: [147],
          popupTarget: 'info',
          showLayerInfoPopup: true
        });
      }
    },
    '16': {
      title: 'Example 16 — OpenLayers + GeoAPI',
      description: 'Adds an OL feature and reads its name on click.',
      run: function () {
        var map = baseMap();

        var cadastreFeature = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.transform([76771, 72205], 'EPSG:2169', 'EPSG:3857')),
          name: 'Cadastre'
        });

        cadastreFeature.setStyle(new ol.style.Style({
          image: new ol.style.Icon({
            anchor: [0.5, 46],
            anchorXUnits: 'fraction',
            anchorYUnits: 'pixels',
            src: '../lion.png'
          })
        }));

        var vectorLayer = new ol.layer.Vector({
          source: new ol.source.Vector({
            features: [cadastreFeature]
          })
        });

        map.on('click', function (evt) {
          var feature = map.forEachFeatureAtPixel(evt.pixel, function (f) { return f; });
          setInfo(feature ? ('Name : ' + feature.get('name')) : '');
        });

        map.addLayer(vectorLayer);
      }
    },
    '17': {
      title: 'Example 17 — Toggle layer info query',
      description: 'Switches info popup target between map and div with a checkbox.',
      run: function () {
        setExtra('<label><input type="checkbox" id="cbInfo17"> Enable layer query</label>');
        var map = baseMap({
          bgLayer: 'blank',
          layers: ['parcels', 'parcels_labels'],
          zoom: 14,
          showLayerInfoPopup: false,
          popupTarget: 'info'
        });
        var onInfo17 = true;

        map.on('click', function () {
          if (!document.getElementById('cbInfo17').checked) {
            return;
          }
          map.removeInfoPopup();
          if (onInfo17) {
            onInfo17 = false;
            map.setPopupTarget('info');
          } else {
            onInfo17 = true;
            map.setPopupTarget(undefined);
          }
        });

        document.getElementById('cbInfo17').addEventListener('change', function (evt) {
          map.showLayerInfoPopup(evt.target.checked);
        });
      }
    },
    '18': {
      title: 'Example 18 — External vector style',
      description: 'Applies an external JSON style to the basemap.',
      run: function () {
        baseMap({
          bgLayerStyle: 'https://vectortiles.geoportail.lu/styles/roadmap_jsapi/style.json'
        });
      }
    },
    '19': {
      title: 'Example 19 — Inline vector style',
      description: 'Applies a JSON style defined in code.',
      run: function () {
        var customJson = {
          version: 8,
          name: 'Geoportail.lu Road Map',
          sources: {
            'geoportail.lu_layers': {
              type: 'vector',
              url: 'https://vectortiles.geoportail.lu/data/omt-geoportail-lu.json'
            }
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              layout: { visibility: 'visible' },
              paint: { 'background-color': 'rgba(248, 248, 248, 1)' }
            },
            {
              id: 'lu_landcover_wood',
              type: 'fill',
              source: 'geoportail.lu_layers',
              'source-layer': 'landcover',
              filter: ['==', 'class', 'wood'],
              paint: { 'fill-color': 'rgba(115, 179, 28, 1)', 'fill-opacity': 0.55 }
            },
            {
              id: 'lu_water',
              type: 'fill',
              source: 'geoportail.lu_layers',
              'source-layer': 'water',
              filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'intermittent', 1]],
              layout: { visibility: 'visible' },
              paint: { 'fill-color': 'rgba(0, 27, 255, 1)' }
            }
          ],
          id: '+geoportail_lu_road_map'
        };

        baseMap({
          zoom: 10,
          bgLayerStyle: customJson
        });
      }
    }
  };

  ensureLayout();
  initProjection();
  setExtra('');
  setInfo('');

  var id = currentExampleId();
  var example = examples[id];

  if (!example) {
    document.getElementById('title').textContent = 'Example not found';
    document.getElementById('description').textContent = 'Use an existing id (1, 1a, 1b, ..., 19).';
    setExtra('');
    setInfo('');
    return;
  }

  document.title = example.title;
  document.getElementById('title').textContent = example.title;
  document.getElementById('description').textContent = example.description;
  example.run();
  showSourcePanel(id, example);
})();
