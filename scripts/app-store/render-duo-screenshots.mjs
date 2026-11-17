/** Render the six approved store stories with UI crops from the native iPhone Duo. */
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const sharp = require("sharp");
const store = resolve(import.meta.dirname, "../../apps/mobile/store/1.0.0");
const dest = resolve(store, "build-7-duo");
const out = resolve(dest, "screenshots");
await mkdir(out, { recursive: true });
const { screenshots: copy } = JSON.parse(await readFile(resolve(store,"creative-v3/copy.json")));
const colors = { terra:"#b03a25", cream:"#faf6ef", ink:"#292217", muted:"#746957", paper:"#fffdf9", pink:"#f0ded1" };
const esc = (s) => s.replaceAll("&","&amp;").replaceAll("<","&lt;");
const svg = (body,w,h,view) => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="'+view+'">'+body+'</svg>');
const text = (s,x,y,size,fill,weight=700) => '<text x="'+x+'" y="'+y+'" font-family="Helvetica Neue, Arial, sans-serif" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" letter-spacing="'+(size>40?-1.9:0)+'">'+esc(s)+'</text>';
// Rectangles use a 500-pixel-long-edge view of the original as a coordinate reference.
// Extraction happens at native resolution, with one uniform scale, before compositing.
const inputs = {
  scan: ["outer-live", 344,500,[12,162,257,122]],
  fish: ["outer-itemized",344,500,[12,172,257,128]],
  items: ["inner-dinner",351,500,[8,335,335,138]],
  live: ["inner-live",500,352,[16,81,424,79]],
  shares: ["inner-live",500,352,[234,207,205,83]],
  settle: ["inner-settle",351,500,[18,55,315,429]],
  groups: ["inner-groups",500,352,[0,0,500,352]],
  balances: ["outer-balances",344,500,[12,255,257,211]],
};
const output = [];
for (const [i,slide] of copy.entries()) {
  const outer = i===0 || i===5, wide=i===4;
  const [W,H] = outer ? [1398,2034] : wide ? [2853,2007] : [2007,2853];
  const vw=wide?1000:700, scale=W/vw, vh=H/scale;
  const dark=[0,2,4].includes(i), bg=dark?colors.terra:colors.cream, fg=dark?colors.cream:colors.ink;
  let base='<rect width="100%" height="100%" fill="'+bg+'"/>';
  const layers=[];
  const put=(input,x,y)=>layers.push({input, left:Math.round(x*scale),top:Math.round(y*scale)});
  async function crop(key,x,y,width,radius=15) {
    const [file,cw,ch,rect]=inputs[key], path=resolve(dest,"native",file+".png");
    const meta=await sharp(path).metadata();
    const [l,t,w,h]=rect, left=Math.round(l*meta.width/cw), top=Math.round(t*meta.height/ch);
    const right=Math.min(meta.width,Math.round((l+w)*meta.width/cw)), bottom=Math.min(meta.height,Math.round((t+h)*meta.height/ch));
    const buf=await sharp(path).extract({left,top,width:right-left,height:bottom-top}).resize(Math.round(width*scale)).png().toBuffer();
    const m=await sharp(buf).metadata();
    const rounded=svg('<rect width="100%" height="100%" rx="'+Math.round(radius*scale)+'" fill="white"/>',m.width,m.height,'0 0 '+m.width+' '+m.height);
    put(await sharp(buf).ensureAlpha().composite([{input:rounded,blend:"dest-in"}]).png().toBuffer(),x,y);
  }
  base+=text(i===0?"HaalKhata":slide.label,42,52,18,fg);
  if(wide) {
    base+=text(slide.title.join(" "),40,124,58,fg);
    base+=text(slide.detail,43,167,23,fg,400);
    await crop("groups",156,188,688,16);
  } else {
    const size=slide.title.some(s=>s.length>16)?60:67;
    base+=text(slide.title[0],39,143,size,fg)+text(slide.title[1],39,215,size,fg);
    base+=text(slide.detail,42,266,23,dark?fg:colors.muted,400);
    if(slide.secondDetail)base+=text(slide.secondDetail,42,299,23,colors.muted,400);
    if(i===0) {
      base+=text("AI RECEIPT SCANNING",42,337,18,fg);
      const receipt=await sharp(resolve(store,"creative-v2/california-receipt.png")).trim().resize(Math.round(143*scale)).rotate(-6,{background:"#00000000"}).png().toBuffer();
      put(receipt,53,435);
      await crop("scan",261,366,399);
      base+='<path d="M459 583 v44 m-13 -14 13 14 13-14" stroke="'+fg+'" stroke-width="4" fill="none" stroke-linecap="round"/>';
      await crop("fish",187,657,472);
    } else if(i===1) {
      base+='<circle cx="682" cy="977" r="320" fill="'+colors.pink+'"/>';
      base+=text("Pasta for Pezanne.",42,385,35,colors.ink)+text("Dessert for everyone.",42,431,35,colors.terra);
      await crop("items",40,475,620);
      base+=text("Tap a name. Make it theirs.",42,845,32,colors.terra)+text("Tax and tip follow each person’s items.",42,893,23,colors.muted,400);
    } else if(i===2) {
      base+=text("A shared bill, on everyone’s phone.",42,371,28,fg);
      await crop("live",42,411,616);
      base+=text("Everyone can see their share.",42,633,30,fg);
      await crop("shares",42,675,505);
      base+=text("Dinner in San Francisco · $108.15",42,934,22,fg,400);
    } else if(i===3) {
      await crop("settle",119,333,462);
    } else {
      await crop("balances",42,362,615);
      base+=text("Tahoe weekend",43,946,27,colors.terra);
    }
  }
  const file=String(i+1).padStart(2,"0")+"-"+slide.key+".png";
  await sharp(svg(base,W,H,"0 0 "+vw+" "+vh)).composite(layers).flatten({background:bg}).removeAlpha().toColourspace("srgb").png().toFile(resolve(out,file));
  const bytes=await readFile(resolve(out,file));const info=await sharp(bytes).metadata();
  if(info.width!==W||info.height!==H||info.hasAlpha)throw new Error("Invalid export: "+file);
  output.push({file,width:W,height:H,display:outer?"outer":"inner",sha256:createHash("sha256").update(bytes).digest("hex")});
}
const layers=[];
for (const [i,{file}] of output.entries()) {
  const pic=await sharp(resolve(out,file)).resize(304,444,{fit:"contain",background:colors.pink}).png().toBuffer();
  layers.push({input:pic,left:(i%3)*316,top:Math.floor(i/3)*456});
}
await sharp({create:{width:936,height:900,channels:3,background:colors.pink}}).composite(layers).removeAlpha().png().toFile(resolve(dest,"preview.png"));
await writeFile(resolve(dest,"manifest.json"),JSON.stringify({version:"1.0.0",build:"7",locale:"en-US",device:"iPhone Duo",screenshots:output},null,2)+"\n");
console.log("Verified six opaque native-size Duo PNGs.");
