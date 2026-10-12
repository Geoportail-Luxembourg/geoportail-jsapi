(function () {
  function getSourcePath() {
    var current = document.currentScript;
    if (current) {
      var explicit = current.getAttribute('data-source');
      if (explicit) {
        return explicit;
      }
    }

    var scripts = Array.prototype.slice.call(document.querySelectorAll('script[src]'));
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src') || '';
      if (!src) {
        continue;
      }
      if (src.indexOf('show-source.js') !== -1 || src.indexOf('apiv4loader.js') !== -1 || src.indexOf('topology-data.js') !== -1) {
        continue;
      }
      if (/\.js(\?.*)?$/.test(src)) {
        return src;
      }
    }

    return null;
  }

  function mountPanel() {
    var panel = document.createElement('div');
    panel.className = 'code-panel';
    panel.innerHTML = '<h2>Code</h2><pre id="codeSnippet">Loading example code…</pre>';

    var style = document.createElement('style');
    style.textContent = '' +
      '.code-panel{background:#fff;padding:10px;border:1px solid #ccc;border-radius:4px;margin-top:10px;}' +
      '.code-panel h2{font-size:14px;margin:0 0 5px 0;}' +
      '#codeSnippet{font-family:monospace;font-size:12px;color:#222;white-space:pre-wrap;overflow:visible;margin:0;background:#f8fafc;border:1px solid #e5e7eb;border-radius:4px;padding:10px;}';

    document.head.appendChild(style);
    document.body.appendChild(panel);
    return panel.querySelector('#codeSnippet');
  }

  var sourcePath = getSourcePath();
  var codeEl = mountPanel();

  if (!sourcePath) {
    codeEl.textContent = 'Unable to determine source file for this example.';
    return;
  }

  fetch(sourcePath)
    .then(function (response) { return response.text(); })
    .then(function (source) {
      codeEl.textContent = source;
    })
    .catch(function () {
      codeEl.textContent = 'Unable to load example source code.';
    });
})();
