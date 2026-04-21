/**
 * Injected by webpack ProvidePlugin from src/ascii-lower.js.
 * ASCII-only case fold (A-Z → a-z), safe in the Figma org sandbox where
 * String#toLowerCase / String#toUpperCase internally require Intl.
 */
declare function asciiLowerCase(s: string): string;
/** ASCII-only upper fold (a-z → A-Z). Same sandbox-safety rationale. */
declare function asciiUpperCase(s: string): string;
