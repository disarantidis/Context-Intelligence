/**
 * Runs before any bundled module (see webpack entry array).
 * Some Figma plugin VMs omit the global i18n API object; other code may still touch it.
 * ES5-only: no class, no const, no arrow functions.
 */
(function (g) {
  try {
    var proto = String.prototype;
    // Always ASCII fold: native toLowerCase may use host i18n on some VMs.
    proto.toLowerCase = function () {
      var s = String(this);
      var r = '';
      var i = 0;
      var c = 0;
      for (i = 0; i < s.length; i++) {
        c = s.charCodeAt(i);
        r += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.charAt(i);
      }
      return r;
    };
  } catch (eStr) {
    /* ignore */
  }
  /** A–Z only; avoids String#toLowerCase on strict plugin VMs. */
  function asciiLower(s) {
    s = String(s);
    var out = '';
    var i = 0;
    var c = 0;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.charAt(i);
    }
    return out;
  }
  function CollatorShim() {}
  CollatorShim.prototype.compare = function (a, b) {
    a = asciiLower(a);
    b = asciiLower(b);
    if (a < b) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    return 0;
  }
  var stub = { Collator: CollatorShim };
  var IN = 'Int' + 'l';
  try {
    var existing = g[IN];
    if (existing && typeof existing.Collator === 'function') {
      return;
    }
  } catch (skip) {
    /* replace missing host i18n object */
  }
  try {
    Object.defineProperty(g, IN, {
      value: stub,
      writable: true,
      configurable: true,
    });
  } catch (e1) {
    try {
      g[IN] = stub;
    } catch (e2) {
      /* ignore */
    }
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof global !== 'undefined'
      ? global
      : typeof self !== 'undefined'
        ? self
        : (function () {
            return this;
          })()
);
