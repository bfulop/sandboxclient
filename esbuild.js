require('esbuild').build({
  entryPoints: ['./src/editorUI.ts'],
  bundle: true,
  format: 'esm',
  sourcemap: true,
  outfile: './build/editorUI.js',
  // loader: { '.js': 'jsx' },
  watch: false,
}).catch(() => process.exit(1));