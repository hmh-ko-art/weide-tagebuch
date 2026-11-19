import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Offline-Modus: nach dem Build die Liste aller App-Dateien (+ Versionskennung) in dist/sw.js einsetzen,
// damit der Service Worker die komplette App-Hülle vorladen kann.
function swPrecache(): Plugin {
  return {
    name: 'flockmap-sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist')
      const swDatei = path.join(dist, 'sw.js')
      if (!fs.existsSync(swDatei)) return
      const dateien: string[] = []
      const lauf = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) lauf(p); else dateien.push('/' + path.relative(dist, p).split(path.sep).join('/')) } }
      lauf(dist)
      const liste = dateien.filter((f) => f !== '/sw.js' && !/\.map$/.test(f) && !/^\/(icon-512|icon-maskable-512)\.png$/.test(f)).sort()
      const hash = crypto.createHash('sha256')
      for (const f of liste) hash.update(f).update(fs.readFileSync(path.join(dist, f)))
      const version = hash.digest('hex').slice(0, 12)
      const sw = fs.readFileSync(swDatei, 'utf8').replace("'__VERSION__'", JSON.stringify(version))
      fs.writeFileSync(swDatei, `self.__PRECACHE__ = ${JSON.stringify(['/', ...liste])}\n` + sw)
    },
  }
}

export default defineConfig({
  plugins: [react(), swPrecache()],
  // jsPDF: optionale Module (HTML-/SVG-Rendering) nicht mitbauen
  resolve: { alias: { html2canvas: path.resolve('src/austausch/leer.ts'), canvg: path.resolve('src/austausch/leer.ts'), dompurify: path.resolve('src/austausch/leer.ts') } },
  server: { host: true, proxy: { '/api': 'http://localhost:8787' } },
  preview: { host: true, proxy: { '/api': 'http://localhost:8787' } },
})
