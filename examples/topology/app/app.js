// ============================================================
// CONFIG
// ============================================================
// OGC API Features – Parcelles FLIK
const OGC_BASE_URL   = 'https://features.geoportail.lu/collections/1637/items';
const OGC_LIMIT      = 200;   // items par requête
const OGC_DATA_PROJ  = 'EPSG:4326'; // le serveur renvoie du CRS84 (lon/lat)
// Zoom initial sur la ville de luxembourg
const INIT_POS     = [77334, 74814]; // EPSG:2169, Luxembourg ~
const INIT_ZOOM    = 14;
const SNAP_TOL_PX  = 10;

// ============================================================
// VARIABLES D'ÉTAT
// ============================================================
let map;
let wfsVectorSource;
let wfsLayer;
let selectInteraction;
let modifyInteraction;
let snapInteraction;
let drawInteraction;
let splitInteraction;
let selectedFeatures = [];
let allFeatures = [];
let currentMode = 'select';
let newFeatureCounter = 0; // Pour générer des IDs temporaires
let showNeighbours = true; // Affichage des géométries adjacentes
let currentNeighbours = []; // Voisins détectés lors de la dernière sélection

// ============================================================
// DEBUG / NOTIFICATIONS
// ============================================================
const DBG_MAX_LINES = 200;

/** Durée d'affichage automatique des notifications (ms). 0 = pas d'auto-dismiss. */
const NOTIF_DURATION = { error: 0, warn: 8000 };

function dbg(msg, level) {
  level = level || 'info';

  // Mirror en console
  if (level === 'error') console.error('[ERROR]', msg);
  else if (level === 'warn') console.warn('[WARN]', msg);
  else console.log('[' + level.toUpperCase() + ']', msg);

  // Afficher les erreurs et avertissements dans le panneau de notifications
  if (level === 'error' || level === 'warn') {
    showNotif(msg, level);
  }
}

/**
 * Affiche une notification dans #notif-panel.
 * @param {string} msg   Texte du message
 * @param {string} level 'error' | 'warn'
 */
function showNotif(msg, level) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;

  const icon = level === 'error' ? '⛔' : '⚠';
  const div = document.createElement('div');
  div.className = 'notif notif-' + level;
  div.innerHTML =
    '<span class="notif-icon">' + icon + '</span>' +
    '<span class="notif-msg">' + msg + '</span>' +
    '<button class="notif-close" title="Fermer">✕</button>';

  div.querySelector('.notif-close').addEventListener('click', function () {
    dismissNotif(div);
  });

  panel.style.display = 'flex';
  panel.appendChild(div);

  // Auto-dismiss
  const duration = NOTIF_DURATION[level];
  if (duration > 0) {
    setTimeout(function () { dismissNotif(div); }, duration);
  }
}

function dismissNotif(div) {
  const panel = document.getElementById('notif-panel');
  if (!panel || !div.parentNode) return;
  div.style.transition = 'opacity 0.2s';
  div.style.opacity = '0';
  setTimeout(function () {
    if (div.parentNode) div.parentNode.removeChild(div);
    if (panel.children.length === 0) panel.style.display = 'none';
  }, 200);
}

function clearDebug() {
  const panel = document.getElementById('notif-panel');
  if (panel) {
    panel.innerHTML = '';
    panel.style.display = 'none';
  }
}

// ============================================================
// STYLES
// ============================================================
const styleNormal = new ol.style.Style({
  fill:   new ol.style.Fill({ color: 'rgba(255,251,230,0.6)' }),
  stroke: new ol.style.Stroke({ color: '#f5a623', width: 1.5 }),
});

const styleSelected = new ol.style.Style({
  fill:   new ol.style.Fill({ color: 'rgba(255,208,208,0.75)' }),
  stroke: new ol.style.Stroke({ color: '#cc0000', width: 2.5 }),
  zIndex: 10
});

const styleNeighbour = new ol.style.Style({
  fill:   new ol.style.Fill({ color: 'rgba(208,232,255,0.75)' }),
  stroke: new ol.style.Stroke({ color: '#0033cc', width: 2, lineDash: [5, 3] }),
  zIndex: 9
});

const styleOverlap = new ol.style.Style({
  fill:   new ol.style.Fill({ color: 'rgba(255,80,0,0.35)' }),
  stroke: new ol.style.Stroke({ color: '#ff4400', width: 2.5, lineDash: [8, 4] }),
  zIndex: 11
});

const styleVertex = new ol.style.Style({
  image: new ol.style.Circle({
    radius: 4,
    fill:   new ol.style.Fill({ color: '#ffffff' }),
    stroke: new ol.style.Stroke({ color: '#cc0000', width: 1.5 }),
  }),
  zIndex: 20
});

// Overlay layer for vertex display during edit modes
let vertexOverlaySource = null;
let vertexOverlayLayer  = null;

// ============================================================
// INITIALISATION DE LA CARTE
// ============================================================
window.addEventListener('load', function () {
  map = new lux.Map({
    target: 'map',
    bgLayer: 'streets_jpeg',
    zoom: INIT_ZOOM,
    position: INIT_POS
  });

  map.getMapReadyPromise().then(function () {
    dbg('Carte prête.', 'ok');

    wfsVectorSource = new ol.source.Vector({ wrapX: false });

    wfsLayer = new ol.layer.Vector({
      source: wfsVectorSource,
      style: function (feature) {
        const state = feature.get('_selectionState');
        if (state === 'selected')  return styleSelected;
        if (state === 'neighbour') return styleNeighbour;
        if (state === 'overlap')   return styleOverlap;
        return styleNormal;
      }
    });

    map.addLayer(wfsLayer);

    vertexOverlaySource = new ol.source.Vector();
    vertexOverlayLayer  = new ol.layer.Vector({
      source: vertexOverlaySource,
      style:  styleVertex,
      zIndex: 20,
    });
    map.addLayer(vertexOverlayLayer);

    setupSelectInteraction();
    setStatus('Carte prête. Cliquez sur "Charger les parcelles".');
  });
});

// ============================================================
// CHARGEMENT OGC API FEATURES
// ============================================================
function loadParcelles() {
  const view     = map.getView();
  const extent3857 = view.calculateExtent(map.getSize());

  // L'OGC API attend un bbox en CRS84 : minLon,minLat,maxLon,maxLat
  const bboxLonLat = ol.proj.transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
  const bbox = [
    bboxLonLat[0].toFixed(6),
    bboxLonLat[1].toFixed(6),
    bboxLonLat[2].toFixed(6),
    bboxLonLat[3].toFixed(6)
  ].join(',');

  document.getElementById('loading').style.display = 'block';
  setStatus('Chargement OGC API Features en cours…');

  const params = new URLSearchParams({
    f:      'json',
    limit:  OGC_LIMIT,
    bbox:   bbox
  });

  dbg('OGC API bbox : ' + bbox, 'info');
  dbg('URL : ' + OGC_BASE_URL + '?' + params.toString(), 'dim');

  fetch(OGC_BASE_URL + '?' + params.toString())
    .then(function (resp) {
      if (!resp.ok) throw new Error('OGC API HTTP ' + resp.status);
      return resp.json();
    })
    .then(function (geojson) {
      const total = geojson.numberMatched || '?';
      dbg('OGC réponse OK | numberReturned=' + (geojson.numberReturned || '?') + ' | numberMatched=' + total, 'ok');
      loadFeaturesFromGeoJSON(geojson, OGC_DATA_PROJ);
      setStatus(
        allFeatures.length + ' parcelles chargées' +
        (total !== '?' ? ' (sur ' + total + ' au total).' : '.')
      );
    })
    .catch(function (err) {
      document.getElementById('loading').style.display = 'none';
      dbg('ERREUR OGC API : ' + err.message, 'error');
      setStatus('⚠ Erreur OGC API : ' + err.message + ' → données de démo chargées.');
      loadDemoFeatures();
    });
}

function loadFeaturesFromGeoJSON(geojson, dataProjection) {
  wfsVectorSource.clear();
  clearSelectionState();

  const format   = new ol.format.GeoJSON();
  const features = format.readFeatures(geojson, {
    featureProjection: 'EPSG:3857',
    dataProjection:    dataProjection
  });

  features.forEach(function (f) {
    f.set('_originalGeom', f.getGeometry().clone());
    f.set('_selectionState', 'normal');
  });

  wfsVectorSource.addFeatures(features);
  allFeatures = features;

  dbg(features.length + ' features chargées (projection: ' + dataProjection + ' → EPSG:3857)', 'ok');
  if (features.length > 0) {
    const sample = getFlatCoords(features[0].getGeometry());
    dbg('Ex. premier sommet: [' + (sample[0] ? sample[0].map(function(v){return v.toFixed(2);}).join(', ') : '?') + ']', 'dim');
  }

  document.getElementById('loading').style.display = 'none';
  setStatus(features.length + ' parcelles chargées.');
  document.getElementById('count-badge').textContent = features.length;
  updateFeatureList();
  refreshSnapInteraction();
}

// ============================================================
// DONNÉES DE DÉMONSTRATION
// ============================================================
function loadDemoFeatures() {
  // 3 parcelles en EPSG:3857 — parcelle 1 et 2 partagent le segment
  // [681900, 6384800] → [681900, 6384900]
  // parcelle 2 et 3 partagent le segment
  // [681900, 6384900] → [682020, 6384900]
  const demoGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature', id: 'parcels.1',
        properties: { id_parcelle: '061C00204000100', surface: 1245.3, commune: 'Luxembourg', section: 'C' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[681800, 6384800], [681900, 6384800], [681900, 6384900], [681800, 6384900], [681800, 6384800]]]
        }
      },
      {
        type: 'Feature', id: 'parcels.2',
        properties: { id_parcelle: '061C00204000200', surface: 987.6, commune: 'Luxembourg', section: 'C' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[681900, 6384800], [682020, 6384800], [682020, 6384900], [681900, 6384900], [681900, 6384800]]]
        }
      },
      {
        type: 'Feature', id: 'parcels.3',
        properties: { id_parcelle: '061C00204000300', surface: 1560.0, commune: 'Luxembourg', section: 'C' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[681800, 6384900], [682020, 6384900], [682020, 6385050], [681800, 6385050], [681800, 6384900]]]
        }
      }
    ]
  };

  loadFeaturesFromGeoJSON(demoGeoJSON, 'EPSG:3857');

  map.getView().fit(wfsVectorSource.getExtent(), {
    padding: [60, 320, 60, 60],
    maxZoom: 18
  });

  setStatus('3 parcelles FLIK de démo chargées (frontières communes via JSTS).');
}

/**
 * Pour une feature cible, trouve toutes les features voisines
 * partageant une frontière commune (via JSTS) et les marque 'neighbour'.
 */
function findTopologicalNeighbours(targetFeature) {
  const neighbours = lux.topology.findTopologicalNeighbours(targetFeature, allFeatures, {
    markNeighbours: true,
    stateProperty: '_selectionState',
    neighbourState: 'neighbour',
    selectedState: 'selected',
    vertexPrecision: VERTEX_PRECISION
  });

  currentNeighbours = neighbours.slice();

  neighbours.forEach(function (candidate) {
    if (selectedFeatures.indexOf(candidate) === -1) {
      selectedFeatures.push(candidate);
    }
  });
}

// ============================================================
// PROPAGATION TOPOLOGIQUE
// ============================================================



/**
 * Clé de sommet : arrondi à 2 décimales (~1 cm en EPSG:3857).
 */
const VERTEX_PRECISION = 2;

/**
 * Après une modification, propage les changements à toutes les features voisines.
 *
 * Deux cas traités :
 * 1. Sommet déplacé (clé pre absente de post) → mettre à jour la même clé dans le voisin.
 * 2. Sommet nouveau (clé post absente de pre) → insérer ce sommet dans le segment
 *    du voisin sur lequel il se projette orthogonalement (point de milieu OL).
 */
function propagateSharedVertices(modifiedFeature) {
  const changed = lux.topology.propagateSharedVertices(modifiedFeature, allFeatures, {
    preModifyCoordsProperty: '_preModifyCoords',
    vertexPrecision: VERTEX_PRECISION
  });

  if (changed.length > 0) {
    wfsLayer.changed();
  }
}



/** Extrait un tableau plat de [x, y] depuis le ring extérieur (compatibilité). */
function getFlatCoords(geom) {
  const coords = [];
  if (geom.getType() === 'Polygon') {
    geom.getCoordinates()[0].forEach(function (c) { coords.push(c); });
  } else if (geom.getType() === 'MultiPolygon') {
    geom.getCoordinates().forEach(function (poly) {
      poly[0].forEach(function (c) { coords.push(c); });
    });
  }
  return coords;
}
// ============================================================
// VERTEX OVERLAY
// ============================================================

/**
 * Populate the vertex overlay with Point features extracted from the given
 * features' geometries.  Call after entering an edit mode and after each
 * modifyend to keep the overlay in sync.
 * @param {Array<ol.Feature>} features
 */
function showVertices(features) {
  if (!vertexOverlaySource) return;
  vertexOverlaySource.clear();
  const points = [];
  features.forEach(function (f) {
    const geom = f.getGeometry();
    if (!geom) return;
    let rings = [];
    if (geom.getType() === 'Polygon') {
      rings = geom.getCoordinates();
    } else if (geom.getType() === 'MultiPolygon') {
      geom.getCoordinates().forEach(function (poly) {
        rings = rings.concat(poly);
      });
    }
    rings.forEach(function (ring) {
      // Skip closing duplicate
      ring.slice(0, -1).forEach(function (coord) {
        points.push(new ol.Feature(new ol.geom.Point(coord)));
      });
    });
  });
  vertexOverlaySource.addFeatures(points);
}

/** Remove all vertex overlay points. */
function clearVertices() {
  if (vertexOverlaySource) vertexOverlaySource.clear();
}

// ============================================================
function setupSelectInteraction() {
  selectInteraction = lux.topology.createSelectInteraction(map, wfsLayer, function() { return allFeatures; }, {
    stateProperty:   '_selectionState',
    selectedState:   'selected',
    neighbourState:  'neighbour',
    normalState:     'normal',
    vertexPrecision: VERTEX_PRECISION,
    onSelect: function (evt) {
      currentNeighbours = evt.neighbours.slice();
      selectedFeatures = evt.selected.concat(currentNeighbours);
      if (!showNeighbours) {
        currentNeighbours.forEach(function (n) { n.set('_selectionState', 'normal'); });
      }
      wfsLayer.changed();
      updateSidebar();
      setStatus(
        evt.selected.length + ' parcelle(s) sélectionnée(s)' +
        (evt.neighbours.length > 0 ? ', ' + evt.neighbours.length + ' voisin(s) JSTS détecté(s).' : '.')
      );
    }
  });
}

// ============================================================
// MODES : SÉLECTION / ÉDITION
// ============================================================
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('#toolbar button').forEach(function (b) {
    b.classList.remove('active');
  });
  document.getElementById('btn-' + mode).classList.add('active');

  if (modifyInteraction) {
    map.removeInteraction(modifyInteraction);
    modifyInteraction = null;
  }

  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }

  if (splitInteraction) {
    map.removeInteraction(splitInteraction);
    splitInteraction = null;
  }

  // Effacer les marquages 'overlap' du mode édition libre
  allFeatures.forEach(function (f) {
    if (f.get('_selectionState') === 'overlap') f.set('_selectionState', 'normal');
  });

  // Effacer l'overlay vertex en sortant d'un mode édition
  clearVertices();

  if (mode === 'split') {
    const toSplit = selectedFeatures.filter(function (f) {
      return f.get('_selectionState') === 'selected';
    });
    if (toSplit.length === 0) {
      setStatus('⚠ Sélectionnez d\'abord une parcelle à couper.');
      setMode('select');
      return;
    }

    // Source temporaire pour la ligne de coupe (non affichée dans wfsLayer)
    const splitSource = new ol.source.Vector();

    splitInteraction = lux.topology.createDrawInteraction(map, splitSource, {
      type:  'LineString',
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ff4400', width: 2, lineDash: [6, 4] })
      }),
      onDrawStart: function () {
        setStatus('Tracez la ligne de coupe… double-clic pour terminer.');
        dbg('[Split] début du tracé', 'info');
      },
      onDrawEnd: function (evt) {
        dbg('[Split] ligne tracée, découpage en cours…', 'info');
        toSplit.forEach(function (f) {
          splitFeatureWithLine(f, evt.feature.getGeometry());
        });
        setMode('select');
      }
    });

    // Snap sur le snap existant pour coller aux frontières
    refreshSnapInteraction();
    setStatus('Mode coupe : tracez une ligne à travers la parcelle, double-clic pour terminer.');
    return;
  }

  if (mode === 'hole') {
    const toHole = selectedFeatures.filter(function (f) {
      return f.get('_selectionState') === 'selected';
    });
    if (toHole.length === 0) {
      setStatus('⚠ Sélectionnez d\'abord une parcelle dans laquelle insérer un trou.');
      setMode('select');
      return;
    }
    if (toHole.length > 1) {
      setStatus('⚠ Sélectionnez une seule parcelle pour insérer un trou.');
      setMode('select');
      return;
    }

    const holeSource = new ol.source.Vector();

    drawInteraction = lux.topology.createDrawInteraction(map, holeSource, {
      type:  'Polygon',
      style: new ol.style.Style({
        fill:   new ol.style.Fill({ color: 'rgba(10,90,42,0.2)' }),
        stroke: new ol.style.Stroke({ color: '#0a5a2a', width: 2, lineDash: [6, 3] })
      }),
      onDrawStart: function () {
        setStatus('Dessinez le contour du trou… double-clic pour terminer.');
        dbg('[Hole] début du tracé', 'info');
      },
      onDrawEnd: function (evt) {
        insertHole(toHole[0], evt.feature.getGeometry());
        setMode('select');
      }
    });

    refreshSnapInteraction();
    setStatus('Mode trou : dessinez le contour du trou à l\'intérieur de la parcelle, double-clic pour terminer.');
    return;
  }

  if (mode === 'editfree') {
    if (selectedFeatures.length === 0) {
      setStatus('⚠ Sélectionnez d\'abord des parcelles avant de modifier.');
      setMode('select');
      return;
    }

    const editableFeatures = selectedFeatures.filter(function (f) {
      return f.get('_selectionState') === 'selected';
    });
    modifyInteraction = lux.topology.createFreeModifyInteraction(map, editableFeatures, allFeatures, {
      pixelTolerance:       SNAP_TOL_PX,
      stateProperty:        '_selectionState',
      overlapState:         'overlap',
      overlapAreaThreshold: 0.01,
      onModifyStart: function (evt) {
        evt.features.forEach(function (f) {
          dbg('[EditLibre] snapshot ' + (f.getId() || '?'), 'info');
        });
        showVertices(editableFeatures);
        setStatus('Modification libre en cours…');
      },
      onModifyEnd: function (evt) {
        showVertices(editableFeatures);
        if (evt.overlaps.length > 0) {
          const ids = evt.overlaps.map(function (n) {
            return n.get('id_parcelle') || n.getId() || '?';
          }).join(', ');
          dbg('[EditLibre] ⚠ chevauchement avec : ' + ids, 'warn');
          setStatus('⚠ Chevauchement avec : ' + ids + ' (parcelles marquées en orange).');
        } else {
          setStatus('Modification libre terminée — aucun chevauchement détecté.');
        }
        wfsLayer.changed();
        updateSidebar();
      }
    });

    refreshSnapInteraction();
    showVertices(editableFeatures);
    setStatus('Mode édition libre : les parcelles adjacentes ne seront PAS modifiées. Snap actif.');
    return;
  }

  if (mode === 'editstrict') {
    if (selectedFeatures.length === 0) {
      setStatus('⚠ Sélectionnez d\'abord des parcelles avant de modifier.');
      setMode('select');
      return;
    }

    const editableFeatures = selectedFeatures.filter(function (f) {
      return f.get('_selectionState') === 'selected';
    });
    modifyInteraction = lux.topology.createStrictModifyInteraction(map, editableFeatures, allFeatures, {
      pixelTolerance:       SNAP_TOL_PX,
      overlapAreaThreshold: 0.01,
      onModifyStart: function (evt) {
        evt.features.forEach(function (f) {
          dbg('[EditStrict] snapshot ' + (f.getId() || '?'), 'info');
        });
        showVertices(editableFeatures);
        setStatus('Modification stricte en cours…');
      },
      onModifyEnd: function (evt) {
        showVertices(editableFeatures);
        if (!evt.accepted) {
          const ids = evt.overlaps.map(function (n) {
            return n.get('id_parcelle') || n.getId() || '?';
          }).join(', ');
          dbg('[EditStrict] ⛔ chevauchement avec : ' + ids + ' — rejeté', 'error');
          setStatus('⛔ Chevauchement avec : ' + ids + ' — modification rejetée.');
        } else {
          evt.features.forEach(function (f) {
            dbg('[EditStrict] ✅ pas de chevauchement pour ' + (f.getId() || '?'), 'ok');
          });
          setStatus('Modification stricte terminée — aucun chevauchement détecté.');
        }
        wfsLayer.changed();
        updateSidebar();
      }
    });

    refreshSnapInteraction();
    showVertices(editableFeatures);
    setStatus('Mode édition stricte : chevauchement interdit — modification rejetée si collision. Snap actif.');
    return;
  }

  if (mode === 'draw') {
    // Désactiver la sélection pendant le dessin
    if (selectInteraction) selectInteraction.setActive(false);

    drawInteraction = lux.topology.createDrawInteraction(map, wfsVectorSource, {
      type: 'Polygon',
      onDrawStart: function () {
        setStatus('Dessin en cours… clic pour chaque sommet, double-clic pour terminer.');
        dbg('[Draw] début du dessin', 'info');
      },
      onDrawEnd: function (evt) {
        const feature = evt.feature;

      // Générer un ID temporaire
      newFeatureCounter++;
      const tmpId = 'new.' + newFeatureCounter;
      feature.setId(tmpId);

      // Propriétés par défaut
      feature.set('id_parcelle', tmpId);
      feature.set('commune', '—');
      feature.set('_selectionState', 'normal');

      // OL ajoute la feature à wfsVectorSource juste APRÈS drawend.
      // On écoute l'événement 'addfeature' de la source pour être certain
      // que la géométrie est figée avant de faire quoi que ce soit.
      wfsVectorSource.once('addfeature', function (addEvt) {
        const added = addEvt.feature;

        added.set('surface', parseFloat(added.getGeometry().getArea().toFixed(1)));
        added.set('_originalGeom', added.getGeometry().clone());

        if (allFeatures.indexOf(added) === -1) allFeatures.push(added);

        // Log des coordonnées pour debug
        const coords = lux.topology.getAllCoords(added.getGeometry());
        dbg('[Draw] ' + tmpId + ' | aire=' + added.get('surface') + ' m² | ' + coords.length + ' sommets', 'ok');
        coords.forEach(function (c) { dbg('  sommet: ' + lux.topology.vertexKey(c, VERTEX_PRECISION), 'dim'); });

        // Vérifier sommets communs avec les voisins potentiels
        allFeatures.forEach(function (other) {
          if (other === added) return;
          const otherCoords = lux.topology.getAllCoords(other.getGeometry());
          const newKeys = {};
          coords.forEach(function (c) { newKeys[lux.topology.vertexKey(c, VERTEX_PRECISION)] = true; });
          const shared = otherCoords.filter(function (c) { return newKeys[lux.topology.vertexKey(c, VERTEX_PRECISION)]; });
          if (shared.length > 0) {
            dbg('[Draw] sommets communs avec ' + (other.getId() || '?') + ' : ' + shared.length, 'snap');
          }
        });

        // Sélectionner et détecter les voisins
        allFeatures.forEach(function (f) { f.set('_selectionState', 'normal'); });
        selectedFeatures = [added];
        added.set('_selectionState', 'selected');
        findTopologicalNeighbours(added);

        // Repasser en mode sélection (réactive selectInteraction)
        setMode('select');

        if (selectInteraction) {
          selectInteraction.getFeatures().clear();
          selectInteraction.getFeatures().push(added);
        }

        wfsLayer.changed();
        updateFeatureList();
        updateSidebar();
        document.getElementById('count-badge').textContent = allFeatures.length;

        const nbNeighbours = allFeatures.filter(function (f) {
          return f.get('_selectionState') === 'neighbour';
        }).length;

        setStatus('Parcelle ' + tmpId + ' créée' +
          (nbNeighbours > 0 ? ' — ' + nbNeighbours + ' voisin(s) JSTS détecté(s).' : '.'));
      });
      }
    });

    // Le snap doit être ajouté APRÈS le Draw pour avoir la priorité
    // dans la chaîne de propagation des événements OL
    refreshSnapInteraction();
    setStatus('Mode création : cliquez pour poser les sommets, double-clic pour terminer. Snap actif.');
    return;
  }

  // Réactiver la sélection si on sort du mode draw
  if (selectInteraction) selectInteraction.setActive(true);

  if (mode === 'edit') {
    if (selectedFeatures.length === 0) {
      setStatus('⚠ Sélectionnez d\'abord des parcelles avant de modifier.');
      setMode('select');
      return;
    }

    // Seules les features explicitement sélectionnées sont éditables,
    // pas les voisins topologiques (état 'neighbour').
    const editableFeatures = selectedFeatures.filter(function (f) {
      return f.get('_selectionState') === 'selected';
    });
    modifyInteraction = lux.topology.createTopologicalModifyInteraction(map, editableFeatures, allFeatures, {
      pixelTolerance:          SNAP_TOL_PX,
      vertexPrecision:         VERTEX_PRECISION,
      preModifyCoordsProperty: '_preModifyCoords',
      onModifyStart: function (evt) {
        evt.features.forEach(function (f) {
          dbg('[ModifyStart] feature=' + (f.getId() || '?') + ' | ' + lux.topology.getAllCoords(f.getGeometry()).length + ' sommets snapshotés', 'info');
        });
        showVertices(editableFeatures);
        setStatus('Modification en cours…');
      },
      onModifyEnd: function (evt) {
        showVertices(editableFeatures);
        evt.features.forEach(function (f) {
          dbg('[ModifyEnd] feature=' + (f.getId() || '?') + ' | propagation effectuée', 'info');
          showModifiedDiff(f);
        });
        dbg('[ModifyEnd] terminé.', 'info');
        setStatus('Modification terminée — sommets partagés propagés via index topologique.');
        wfsLayer.changed();
        updateSidebar();
      }
    });

    // Le snap doit être ajouté APRÈS le Modify pour avoir la priorité
    // dans la chaîne de propagation des événements OL
    refreshSnapInteraction();

    showVertices(editableFeatures);
    setStatus('Mode édition : déplacez les sommets. Snap + synchro topologique JSTS actifs.');
  } else {
    setStatus('Mode sélection : cliquez sur une parcelle.');
  }
}

// ============================================================
// SNAP TOPOLOGIQUE
// ============================================================
function refreshSnapInteraction() {
  if (snapInteraction) map.removeInteraction(snapInteraction);
  snapInteraction = lux.topology.createSnapInteraction(map, wfsVectorSource, { pixelTolerance: SNAP_TOL_PX });
}

// ============================================================
// DIFF : LOG DES CHANGEMENTS
// ============================================================
function showModifiedDiff(f) {
  const origGeom = f.get('_originalGeom');
  if (!origGeom) return;

  try {
    const diff = lux.topology.computeGeomDiff(origGeom, f.getGeometry());
    const id   = f.getId() || f.get('id_parcelle') || '?';
    if (!diff.isEmpty) {
      console.log('[WFS-T] Feature modifiée :', id, '| Δaire JSTS :', diff.deltaArea.toFixed(2), 'm²');
    }
  } catch (e) {
    console.warn('[JSTS] Erreur diff :', e);
  }
}

// ============================================================
// DÉCOUPAGE (SPLIT)
// ============================================================
/**
 * Découpe une feature polygon selon une ligne de coupe via JSTS Polygonizer.
 * Algorithme :
 *   1. Union de la frontière du polygone avec la ligne de coupe → nœuds partagés
 *   2. Polygonizer reconstruit tous les polygones fermés
 *   3. On ne garde que les polygones contenus dans la feature originale
 *   4. La feature originale est remplacée par le premier résultat,
 *      les autres sont créées comme nouvelles features
 */
function splitFeatureWithLine(feature, splitLineGeom) {
  try {
    const origId      = feature.getId() || feature.get('id_parcelle') || '?';

    const splitResult = lux.topology.splitFeatureWithLine(feature, splitLineGeom, {
      originalGeomProperty: '_originalGeom',
      surfaceProperty: 'surface',
      idProperty: 'id_parcelle',
      selectionStateProperty: '_selectionState',
      defaultSelectionState: 'normal',
      generateId: function () {
        newFeatureCounter++;
        return 'split.' + newFeatureCounter;
      }
    });

    splitResult.newFeatures.forEach(function (newFeature) {
      newFeature.set('commune', feature.get('commune') || '—');
      wfsVectorSource.addFeature(newFeature);
      allFeatures.push(newFeature);
      dbg('[Split] nouveau morceau ' + (newFeature.get('id_parcelle') || '?') +
        ' | aire=' + newFeature.get('surface') + ' m²', 'ok');
    });

    dbg('[Split] ' + splitResult.piecesCount + ' morceaux pour ' + (feature.getId() || '?'), 'ok');

    // Rafraîchir la détection de voisins sur les morceaux
    allFeatures.forEach(function (f) { f.set('_selectionState', 'normal'); });
    selectedFeatures = [feature];
    feature.set('_selectionState', 'selected');
    findTopologicalNeighbours(feature);

    if (selectInteraction) {
      selectInteraction.getFeatures().clear();
      selectInteraction.getFeatures().push(feature);
    }

    wfsLayer.changed();
    updateFeatureList();
    updateSidebar();
    document.getElementById('count-badge').textContent = allFeatures.length;

    setStatus('Parcelle ' + origId + ' découpée en ' + splitResult.piecesCount + ' morceaux.');

  } catch (e) {
    dbg('[Split] ERREUR : ' + e.message, 'error');
    setStatus('⚠ Erreur de découpage : ' + e.message);
    console.error('[Split]', e);
  }
}

// ============================================================
// INSERTION DE TROU
// ============================================================
/**
 * Insère un trou (ring intérieur) dans la géométrie Polygon ou MultiPolygon
 * de la feature cible.
 *
 * Algorithme :
 *   1. Vérifier que le polygon dessiné est entièrement à l'intérieur de la
 *      feature via JSTS (contains).
 *   2. Ajouter le ring du polygon comme ring intérieur.
 *      OL/GML attend les trous en sens antihoraire ; OL normalise automatiquement.
 */
function insertHole(feature, holePolygonGeom) {
  try {
    const inserted = lux.topology.insertHole(feature, holePolygonGeom, {
      coverRatioMin: 0.99
    });
    if (!inserted) {
      dbg('[Hole] ⚠ le trou dépasse les limites de la parcelle', 'error');
      setStatus('⛔ Le trou doit être entièrement à l\'intérieur de la parcelle.');
      return;
    }

    const geom = feature.getGeometry();

    const metrics = computeMetrics(geom);
    const areaStr = metrics ? metrics.areaLuref.toFixed(1) + ' m² (LUREF)' : '';
    dbg('[Hole] ✅ trou inséré dans ' + (feature.getId() || '?') + ' | aire résultante : ' + areaStr, 'ok');
    setStatus('Trou inséré dans ' + (feature.get('id_parcelle') || feature.getId() || '?') +
      (areaStr ? ' — aire nette : ' + areaStr : '') + '.');

    wfsLayer.changed();
    updateSidebar();

  } catch (e) {
    dbg('[Hole] ERREUR : ' + e.message, 'error');
    setStatus('⚠ Erreur lors de l\'insertion du trou : ' + e.message);
    console.error('[Hole]', e);
  }
}

// ============================================================
// FUSION
// ============================================================
/**
 * Fusionne toutes les parcelles dont l'état est 'selected' en une seule
 * via lux.topology.mergeFeatures (JSTS union).
 * La première parcelle sélectionnée reçoit la géométrie fusionnée ;
 * les autres sont supprimées de la source et de allFeatures.
 */
function mergeSelectedFeatures() {
  const toMerge = selectedFeatures.filter(function (f) {
    return f.get('_selectionState') === 'selected';
  });

  if (toMerge.length < 2) {
    setStatus('⚠ Sélectionnez au moins 2 parcelles pour fusionner.');
    dbg('[Merge] pas assez de parcelles sélectionnées (' + toMerge.length + ')', 'warn');
    return;
  }

  try {
    const merged = lux.topology.mergeFeatures(toMerge, {
      originalGeomProperty: '_originalGeom',
      surfaceProperty: 'surface',
      selectionStateProperty: '_selectionState',
      defaultSelectionState: 'selected',
    });

    // merged contient la feature de base (toMerge[0]) avec la géométrie mise à jour.
    // Supprimer les autres de la source et de allFeatures.
    for (let i = 1; i < toMerge.length; i++) {
      wfsVectorSource.removeFeature(toMerge[i]);
      const idx = allFeatures.indexOf(toMerge[i]);
      if (idx !== -1) allFeatures.splice(idx, 1);
    }

    selectedFeatures = [toMerge[0]];
    toMerge[0].set('_selectionState', 'selected');

    const area = toMerge[0].get('surface') || toMerge[0].getGeometry().getArea().toFixed(1);
    dbg('[Merge] ✅ ' + toMerge.length + ' parcelles fusionnées | aire = ' + area + ' m²', 'ok');
    setStatus(toMerge.length + ' parcelles fusionnées en ' + (toMerge[0].get('id_parcelle') || toMerge[0].getId() || '?') + '.');

    wfsLayer.changed();
    updateFeatureList();
    updateSidebar();
    document.getElementById('count-badge').textContent = allFeatures.length;

  } catch (e) {
    dbg('[Merge] ERREUR : ' + e.message, 'error');
    setStatus('⚠ Erreur lors de la fusion : ' + e.message);
    console.error('[Merge]', e);
  }
}

// ============================================================
// INTERFACE
// ============================================================

function clearSelectionState() {
  allFeatures.forEach(function (f) { f.set('_selectionState', 'normal'); });
  selectedFeatures = [];
}

/** Active/désactive l'affichage des géométries voisines. */
function toggleNeighboursDisplay(enabled) {
  showNeighbours = enabled;
  if (enabled) {
    // Restaurer l'état 'neighbour' pour tous les voisins mémorisés
    currentNeighbours.forEach(function (n) {
      n.set('_selectionState', 'neighbour');
    });
  } else {
    // Masquer : repasser les voisins en 'normal'
    currentNeighbours.forEach(function (n) {
      if (n.get('_selectionState') === 'neighbour') {
        n.set('_selectionState', 'normal');
      }
    });
  }
  if (wfsLayer) wfsLayer.changed();
}

/** Alias public appelé depuis le HTML. */
function clearSelection() {
  clearSelectionState();
  setMode('select');
  updateFeatureList();
  setStatus('Sélection effacée.');
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

function updateFeatureList() {
  const container = document.getElementById('feature-list');
  container.innerHTML = '';

  if (allFeatures.length === 0) {
    container.innerHTML = '<div style="color:#888;font-size:0.8rem;padding:12px;">Aucune parcelle chargée.</div>';
    return;
  }

  allFeatures.forEach(function (f, idx) {
    const id      = f.get('id_parcelle') || f.getId() || ('Feature ' + (idx + 1));
    const surface = f.get('surface') ? f.get('surface').toFixed(1) + ' m²' : '—';
    const commune = f.get('commune') || '—';

    const div = document.createElement('div');
    div.className = 'feature-item';
    div.dataset.featureIdx = idx;
    div.innerHTML =
      '<div class="parcelle-id">' + id + '</div>' +
      '<div class="parcelle-info">Surface : ' + surface + ' | ' + commune + '</div>';

    div.addEventListener('click', function () {
      allFeatures.forEach(function (ff) { ff.set('_selectionState', 'normal'); });
      selectedFeatures = [f];
      f.set('_selectionState', 'selected');
      findTopologicalNeighbours(f);
      if (wfsLayer) wfsLayer.changed();
      updateSidebar();

      map.getView().fit(f.getGeometry().getExtent(), {
        padding:  [60, 320, 60, 60],
        maxZoom:  19,
        duration: 400
      });
      setStatus('Parcelle ' + id + ' sélectionnée.');
    });

    container.appendChild(div);
  });
}

// ============================================================
// MÉTRIQUES GÉOMÉTRIQUES (LUREF + SRS courant)
// ============================================================
/**
 * Calcule l'aire (m²) et le périmètre (m) d'une OL geometry
 * dans les deux SRS : EPSG:2169 (LUREF) et EPSG:3857 (SRS courant).
 * Retourne { areaLuref, perimLuref, area3857, perim3857 } ou null si impossible.
 */
function computeMetrics(olGeom) {
  try {
    // --- Métriques en EPSG:3857 (SRS courant) ---
    const geom3857  = olGeom.clone();
    const area3857  = geom3857.getArea();
    const perim3857 = computePerimeter(geom3857);

    // --- Métriques en EPSG:2169 (LUREF) ---
    const geomLuref = olGeom.clone().transform('EPSG:3857', 'EPSG:2169');
    const areaLuref  = geomLuref.getArea();
    const perimLuref = computePerimeter(geomLuref);

    return { areaLuref, perimLuref, area3857, perim3857 };
  } catch (e) {
    dbg('[Metrics] Erreur : ' + e.message, 'warn');
    return null;
  }
}

/** Calcule le périmètre d'un Polygon ou MultiPolygon en parcourant les rings. */
function computePerimeter(geom) {
  let total = 0;
  function ringLength(ring) {
    let len = 0;
    for (let i = 1; i < ring.length; i++) {
      const dx = ring[i][0] - ring[i-1][0];
      const dy = ring[i][1] - ring[i-1][1];
      len += Math.sqrt(dx*dx + dy*dy);
    }
    return len;
  }
  if (geom.getType() === 'Polygon') {
    geom.getCoordinates().forEach(function(ring) { total += ringLength(ring); });
  } else if (geom.getType() === 'MultiPolygon') {
    geom.getCoordinates().forEach(function(poly) {
      poly.forEach(function(ring) { total += ringLength(ring); });
    });
  }
  return total;
}

function updateSidebar() {
  document.querySelectorAll('.feature-item').forEach(function (div) {
    const idx = parseInt(div.dataset.featureIdx);
    const f   = allFeatures[idx];
    div.classList.toggle('selected', f && f.get('_selectionState') !== 'normal');
  });

  const panel = document.getElementById('props-panel');
  const table = document.getElementById('props-table');

  if (selectedFeatures.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  table.innerHTML = '';

  const f        = selectedFeatures[0];
  const props    = f.getProperties();
  const excluded = ['geometry', '_originalGeom', '_selectionState'];

  Object.entries(props).forEach(function ([key, val]) {
    if (excluded.indexOf(key) !== -1 || typeof val === 'object') return;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + key + '</td><td>' + val + '</td>';
    table.appendChild(tr);
  });

  // --- Aire et périmètre (LUREF + EPSG:3857) ---
  const metrics = computeMetrics(f.getGeometry());
  if (metrics) {
    const fmtArea  = function(v) { return v.toFixed(1) + ' m²'; };
    const fmtPerim = function(v) { return v.toFixed(1) + ' m'; };

    const trA = document.createElement('tr');
    trA.innerHTML =
      '<td style="color:#060"><b>Aire (LUREF)</b></td>' +
      '<td style="color:#060"><b>' + fmtArea(metrics.areaLuref) + '</b>' +
      ' <span style="color:#888;font-size:0.85em">(EPSG:3857 : ' + fmtArea(metrics.area3857) + ')</span></td>';
    table.appendChild(trA);

    const trP = document.createElement('tr');
    trP.innerHTML =
      '<td style="color:#060"><b>Périmètre (LUREF)</b></td>' +
      '<td style="color:#060"><b>' + fmtPerim(metrics.perimLuref) + '</b>' +
      ' <span style="color:#888;font-size:0.85em">(EPSG:3857 : ' + fmtPerim(metrics.perim3857) + ')</span></td>';
    table.appendChild(trP);
  }

  const neighbours = allFeatures.filter(function (f) {
    return f.get('_selectionState') === 'neighbour';
  });
  if (neighbours.length > 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="color:#00c">Voisins JSTS</td><td style="color:#00c">' +
      neighbours.map(function (n) { return n.get('id_parcelle') || n.getId(); }).join(', ') +
      '</td>';
    table.appendChild(tr);
  }
}
