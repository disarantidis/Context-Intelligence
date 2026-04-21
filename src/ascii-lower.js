/**
 * ASCII-only case-fold helpers. Used in the Figma plugin worker instead of
 * String#toLowerCase / String#toUpperCase, which both internally call into
 * Intl/ICU on the org Figma sandbox VM, causing ReferenceError: Intl is not defined.
 *
 * Exported as a CommonJS module so webpack ProvidePlugin can inject each
 * function as a free identifier into any module that uses it.
 */

function asciiLowerCase(s) {
  s = String(s);
  var r = '', i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    r += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.charAt(i);
  }
  return r;
}

function asciiUpperCase(s) {
  s = String(s);
  var r = '', i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    r += c >= 97 && c <= 122 ? String.fromCharCode(c - 32) : s.charAt(i);
  }
  return r;
}

module.exports = { asciiLowerCase: asciiLowerCase, asciiUpperCase: asciiUpperCase };
