This directory contains NekoClaw Desktop tray and app icons.

Required files (generate from the NekoClaw logo PNG):
  32x32.png          — Tray icon (Windows/Linux standard)
  128x128.png        — App icon
  128x128@2x.png     — App icon @2x (HiDPI)
  icon.icns          — macOS app icon bundle
  icon.ico           — Windows .ico (multi-size: 16, 32, 48, 256)
  icon.png           — Generic PNG (used as tray icon on Linux/macOS template)

Generation command (requires ImageMagick):
  convert logo.png -resize 32x32 32x32.png
  convert logo.png -resize 128x128 128x128.png
  convert logo.png -resize 256x256 128x128@2x.png
  convert logo.png icon.ico  # auto multi-size
  # For .icns, use iconutil on macOS or png2icns on Linux

Tauri will fail to build if these files are missing.
Place the NekoClaw cat-paw logo PNG here as the source.
