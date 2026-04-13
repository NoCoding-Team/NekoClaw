const sharp = require("sharp");
const path = require("path");
const sizes = [16,32,48,64,128,256,512,1024];
async function run() {
  await sharp("assets/NekoClaw.png").resize(1024,1024).toFile("build/icon.png");
  console.log("icon.png OK");
  for (const s of sizes) {
    await sharp("assets/NekoClaw.png").resize(s,s).toFile("build/icon_"+s+".png");
    console.log("icon_"+s+".png OK");
  }
}
run().catch(e => { console.error(e); process.exit(1); });
