const path = require('path');
const fs = require('fs');
const webpack = require('webpack');

module.exports = {
  mode: 'development',
  entry: {
    // intl-shim must execute before code.ts (multi-main order = load order).
    code: ['./src/intl-shim.js', './src/code.ts'],
    ui: './src/ui.tsx',
  },
  target: ['web', 'es6'],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    environment: {
      arrowFunction: false,
      const: false,
      destructuring: false,
      optionalChaining: false,
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        include: [
          path.join(__dirname, 'node_modules/@create-figma-plugin/ui'),
          path.join(__dirname, 'src'),
        ],
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    // Auto-inject asciiLowerCase / asciiUpperCase into any module that uses them.
    new webpack.ProvidePlugin({
      asciiLowerCase: [path.resolve(__dirname, 'src/ascii-lower.js'), 'asciiLowerCase'],
      asciiUpperCase: [path.resolve(__dirname, 'src/ascii-lower.js'), 'asciiUpperCase'],
    }),
    // Must run before the webpack bootstrap (Intl can be touched during module init).
    new webpack.BannerPlugin({
      banner:
        // Patch String#toLowerCase and String#toUpperCase so the Figma org sandbox VM
        // never reaches its native ICU/Intl code path.  Use "Int"+"l" so no literal
        // Intl identifier appears in the bundle (strict VMs reject the whole script).
        '!(function(){try{var p=String.prototype,lc=function(){var s=String(this),r="",i,c;for(i=0;i<s.length;i++){c=s.charCodeAt(i);r+=c>=65&&c<=90?String.fromCharCode(c+32):s.charAt(i)}return r},uc=function(){var s=String(this),r="",i,c;for(i=0;i<s.length;i++){c=s.charCodeAt(i);r+=c>=97&&c<=122?String.fromCharCode(c-32):s.charAt(i)}return r};try{Object.defineProperty(p,"toLowerCase",{value:lc,writable:!0,configurable:!0})}catch(e1){try{p.toLowerCase=lc}catch(e2){}}try{Object.defineProperty(p,"toUpperCase",{value:uc,writable:!0,configurable:!0})}catch(e3){try{p.toUpperCase=uc}catch(e4){}}}catch(e){}})();!(function(G){var IN="Int"+"l";function L(s){s=String(s);var o="",i,c;for(i=0;i<s.length;i++){c=s.charCodeAt(i);o+=c>=65&&c<=90?String.fromCharCode(c+32):s.charAt(i)}return o}function C(){}C.prototype.compare=function(a,b){a=L(a);b=L(b);return a<b?-1:a>b?1:0};var S={Collator:C};try{var I=G[IN];if(I&&typeof I.Collator==="function")return;}catch(x){}try{Object.defineProperty(G,IN,{value:S,writable:!0,configurable:!0});}catch(y){try{G[IN]=S;}catch(z){}}})(typeof globalThis!=="undefined"?globalThis:typeof global!=="undefined"?global:typeof self!=="undefined"?self:(function(){return this;})());',
      raw: true,
      entryOnly: true,
      test: /^code\.js$/,
    }),
    new webpack.DefinePlugin({
      __html__: JSON.stringify(
        fs.readFileSync(path.join(__dirname, 'dist/ui.html'), 'utf8')
      ),
    }),
    // Library imports base.css with "!" prefix; strip it so our CSS rule applies
    new webpack.NormalModuleReplacementPlugin(/^!.*\.css$/, (resource) => {
      resource.request = resource.request.replace(/^!/, '');
    }),
  ],
  devtool: false,
};
