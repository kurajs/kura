import pkg from "hnswlib-node";
const { HierarchicalNSW } = pkg;
console.log("imported", Object.keys(pkg));
const idx = new HierarchicalNSW("ip", 4);
idx.initIndex(10);
console.log("init ok");
idx.addPoint([1,0,0,0], 0);
idx.addPoint([0,1,0,0], 1);
console.log("added, count:", idx.getCurrentCount());
idx.setEf(16);
const r = idx.searchKnn([1,0,0,0], 2);
console.log("neighbors:", r.neighbors, "dist:", r.distances);
console.log("accepts Float32Array?");
try { idx.addPoint(new Float32Array([0,0,1,0]), 2); console.log("  yes"); } catch(e){ console.log("  no:", e.message); }
console.log("DONE");
