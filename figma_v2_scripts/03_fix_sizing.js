// use_figma — fileKey: 18LO5MRi3siNwhUaf4ARV2
// Repairs auto-layout hug heights on all pages (run after any build script)
function fix(n){
  if('layoutMode' in n && n.layoutMode==='VERTICAL'){ n.primaryAxisSizingMode='AUTO'; }
  if('layoutMode' in n && n.layoutMode==='HORIZONTAL'){ n.counterAxisSizingMode='FIXED'; n.counterAxisSizingMode='AUTO'; }
  if('children' in n) for(const k of n.children) fix(k);
}
for(const p of figma.root.children){ for(const n of p.children) fix(n); }
return 'sizing repaired';
