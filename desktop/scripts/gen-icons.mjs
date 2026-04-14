import sharp from 'sharp'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(__dirname, '../../docs/assets/NekoClaw.png')
const buildDir = path.resolve(__dirname, '../build')
const opts = { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]

// Generate all PNG sizes
await Promise.all(
  sizes.map(s => sharp(src).resize(s, s, opts).png().toFile(path.join(buildDir, `icon_${s}.png`)))
)

// icon.png = 512
await sharp(src).resize(512, 512, opts).png().toFile(path.join(buildDir, 'icon.png'))
console.log('All PNGs generated')

// Build multi-size ICO from 16/32/48/64/128/256 using default export (accepts file paths)
const pngToIco = (await import('../node_modules/png-to-ico/index.js')).default

const icoSizes = [16, 32, 48, 64, 128, 256]
const icoPaths = icoSizes.map(s => path.join(buildDir, `icon_${s}.png`))
const icoBuf = await pngToIco(icoPaths)
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf)
console.log('icon.ico generated with sizes:', icoSizes.join(', '))
