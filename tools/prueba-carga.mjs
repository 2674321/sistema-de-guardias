#!/usr/bin/env node
// Prueba de carga NO abusiva del shell de la web app.
// Mide latencia de: 1 carga, 5 concurrentes, 3 consecutivas.
// Uso: node tools/prueba-carga.mjs [URL]
const url = process.argv[2] ||
  "https://script.google.com/macros/s/AKfycbxZyIlFLu7kj0kJlJsksV9D9Zy4tATlTtCQW-zYTqvYLeL1mmGK4jAx_2VWzfEmDfZ0/exec";

async function medir() {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: "follow" });
  await r.arrayBuffer();
  return { ms: Date.now() - t0, status: r.status };
}

function resumen(nombre, arr) {
  const ok = arr.filter(x => x.status === 200);
  const ms = ok.map(x => x.ms).sort((a, b) => a - b);
  console.log(`${nombre}: ${ok.length}/${arr.length} OK · min ${ms[0]}ms · prom ${Math.round(ms.reduce((a,b)=>a+b,0)/ms.length)}ms · max ${ms[ms.length-1]}ms`);
}

console.log("URL:", url.slice(0, 80) + "…\n");

const u1 = [await medir()];
resumen("1 usuario            ", u1);

await new Promise(r => setTimeout(r, 1500));
const c5 = await Promise.all(Array.from({ length: 5 }, medir));
resumen("5 usuarios simultáneos", c5);

await new Promise(r => setTimeout(r, 1500));
const seq = [];
for (let i = 0; i < 3; i++) seq.push(await medir());
resumen("3 cargas consecutivas ", seq);
