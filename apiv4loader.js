(function () {
  function appendToHead(element) {
    (document.head || document.getElementsByTagName('head')[0] || document.documentElement).appendChild(element);
  }

  function loadScriptSync(src) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', src, false);
    try {
      xhr.send(null);
    } catch (e) {
      throw new Error('Échec réseau pour ' + src + ' : ' + e.message);
    }

    if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
      var code = xhr.responseText || '';
      (0, eval)(code + '\n//# sourceURL=' + src);
      return;
    }

    throw new Error('HTTP ' + xhr.status + ' pour ' + src);
  }

  function writeScriptSync(src) {
    document.write('<script src="' + src + '"><\/script>');
  }

  function loadScripts(srcList, useDocumentWrite) {
    srcList.forEach(function (src) {
      try {
        if (useDocumentWrite) {
          writeScriptSync(src);
        } else {
          loadScriptSync(src);
        }
      } catch (e) {
        console.error('[apiv4loader] ' + e.message);
        throw e;
      }
    });
  }

  function appendStyle(href) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    appendToHead(link);
  }

  var EPSG2169_DEF = '+proj=tmerc +lat_0=49.83333333333334 +lon_0=6.166666666666667 +k=1 +x_0=80000 +y_0=100000 +ellps=intl +towgs84=-189.681,18.3463,-42.7695,-0.33746,-3.09264,2.53861,0.4598 +units=m +no_defs';

  var projection2169Registered = false;
  function ensureProjection2169Registered() {
    if (projection2169Registered) {
      return;
    }

    if (typeof proj4 === 'undefined') {
      return;
    }

    // Always define in proj4 first.
    proj4.defs('EPSG:2169', EPSG2169_DEF);

    // Register in the bundled OL instance (inside apiv4.js) via the API helper.
    if (typeof lux !== 'undefined' && lux.topology && typeof lux.topology.registerProjection2169 === 'function') {
      try { lux.topology.registerProjection2169({proj4Lib: proj4}); } catch(e) {}
    }

    projection2169Registered = true;
  }

  var loaderUrl = (document.currentScript && document.currentScript.src) || window.location.href;
  var loaderBase = new URL('.', loaderUrl).href;
  var loaderOrigin = new URL(loaderUrl, window.location.href).origin;
  var isInApiDoc = loaderBase.indexOf('/apidoc/') !== -1;
  var buildRoot = isInApiDoc ? new URL('../build/', loaderBase).href : new URL('build/', loaderBase).href;
  var isCrossOrigin = new URL(loaderUrl, window.location.href).origin !== window.location.origin;

  function postInit() {
    ensureProjection2169Registered();

    if (typeof lux !== 'undefined') {
      // Expose the bundled OL classes as the global `ol` — single instance, no duplicate.
      if (lux.ol && typeof window.ol === 'undefined') {
        window.ol = lux.ol;
      }

      lux.setBaseUrl(loaderOrigin + '/', window.location.protocol.replace(':', ''));
      lux.setI18nUrl(loaderOrigin + '/static-ngeo/build/fr.json');

      var hasSC = new URLSearchParams(window.location.search).has('sc');
      if (hasSC) {
        lux.setWmtsCrossOrigin(null);
      }
    }

    window.luxLoaderReady = true;
    window.dispatchEvent(new Event('luxloaderready'));
  }

  window.__luxLoaderPostInit = postInit;

  appendStyle(buildRoot + 'apiv4.css');

  loadScripts([
    buildRoot + 'ol.js',
    buildRoot + 'proj4.js',
    buildRoot + 'jsts.min.js',
    buildRoot + 'auto-complete.min.js',
    buildRoot + 'apiv4.js'
  ], isCrossOrigin);

  if (isCrossOrigin) {
    document.write('<script>window.__luxLoaderPostInit && window.__luxLoaderPostInit();<\/script>');
  } else {
    postInit();
  }
})();
