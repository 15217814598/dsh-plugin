import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { writeFileSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(__dirname, 'src/client/kanban.css'), 'utf8')

const result = await build({
  entryPoints: [resolve(__dirname, 'src/client/index.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: '__dshKanban',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  jsx: 'automatic',
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    // Inline the stylesheet so the client needs no runtime CSS fetch and the
    // host module loader stays a single JS file.
    '__KB_CSS__': JSON.stringify(css),
  },
})

const code = result.outputFiles[0].text

// Wrap in __ModuleLoader__ format.
// The host only passes `require` to the factory — we must create module/exports locally.
const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-kanban",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    exports.apply = __dshKanban.apply;
    return module.exports;
  }
});
`

writeFileSync(resolve(__dirname, 'lib/client.js'), wrapped)
console.log('✅ Build complete: lib/client.js')
