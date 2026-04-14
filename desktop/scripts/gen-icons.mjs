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

// Build multi-size ICO from 16/32/48/64/128/256
// Use png-to-ico which accepts one PNG at a time; we'll build with 256 size and let Windows scale
// For multi-size ICO, use a manual approach with the CLI for each required size then cat them
// Actually use the programmatic API with multiple buffers
const { imagesToIco } = await import('../node_modules/png-to-ico/index.js')

const icoSizes = [16, 32, 48, 64, 128, 256]
const buffers = icoSizes.map(s => fs.readFileSync(path.join(buildDir, `icon_${s}.png`)))
const icoBuf = imagesToIco(buffers)
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf)
console.log('icon.ico generated with sizes:', icoSizes.join(', '))
