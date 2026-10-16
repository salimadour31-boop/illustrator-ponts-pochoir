// Tests du cœur géométrique de PontsPochoir.jsx (node). / Geometry core tests (node).
// Vérification booléenne facultative avec polygon-clipping (npm i polygon-clipping) :
// les ponts sont réellement soustraits/ajoutés et on compte les pièces obtenues.
// Optional boolean check with polygon-clipping: bridges are really subtracted/added and pieces counted.
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "PontsPochoir.jsx"), "utf8");
var ctx = { Math: Math, String: String, Number: Number, Infinity: Infinity, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt, PP_NO_MAIN: true };
vm.createContext(ctx); vm.runInContext(src, ctx);
var C = ctx.PP_CORE, pc = null;
try { pc = require("polygon-clipping"); } catch (e) { console.log("(polygon-clipping absent : vérification booléenne sautée / boolean check skipped)"); }
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + e : "")); } }
var MM = 72 / 25.4, K = 0.5522847498;

function circle(cx, cy, r, cw) {
    var a = [[cx + r, cy, cx + r, cy - K * r, cx + r, cy + K * r], [cx, cy + r, cx + K * r, cy + r, cx - K * r, cy + r],
             [cx - r, cy, cx - r, cy + K * r, cx - r, cy - K * r], [cx, cy - r, cx - K * r, cy - r, cx + K * r, cy - r]];
    if (cw) { a.reverse(); a = a.map(function (p) { return [p[0], p[1], p[4], p[5], p[2], p[3]]; }); }
    return a;
}
function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(function (p) { return [p[0], p[1], p[0], p[1], p[0], p[1]]; }); }
function poly(pts) { return pts.map(function (p) { return [p[0], p[1], p[0], p[1], p[0], p[1]]; }); }
function flat(list, w) { return list.map(function (pts, i) { var f = C.flatten(pts, true, Math.max(w / 2, 1), Math.min(0.08, w / 40)); f.src = i; return f; }); }
function opt(o) { var d = { mode: "stencil", w: 1.5 * MM, maxLen: 15 * MM, per: 1, orient: 0, direct: false }; for (var k in o) d[k] = o[k]; return d; }

// Ensemble pair/impair -> multipolygone / even-odd set -> multipolygon (via XOR)
function toMP(fl) { var r = []; fl.forEach(function (f) { var ring = f.xs.map(function (x, i) { return [x, f.ys[i]]; }); ring.push(ring[0]); r = r.length ? pc.xor(r, [[ring]]) : [[ring]]; }); return r; }
function rectMP(b) { var ring = b.pts.map(function (p) { return [p[0], p[1]]; }); ring.push(ring[0]); return [[ring]]; }
// Pochoir : pièces de feuille après découpe / stencil: sheet pieces after cutting
function sheetPieces(fl, res) {
    var design = toMP(fl), i;
    for (i = 0; i < res.bridges.length; i++) design = pc.difference(design, rectMP(res.bridges[i]));
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    fl.forEach(function (f) { f.xs.forEach(function (x) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); }); f.ys.forEach(function (y) { miny = Math.min(miny, y); maxy = Math.max(maxy, y); }); });
    var m = 50, frame = [[[[minx - m, miny - m], [maxx + m, miny - m], [maxx + m, maxy + m], [minx - m, maxy + m], [minx - m, miny - m]]]];
    return pc.difference(frame, design).length;
}
function pieceCount(fl, res) { var d = toMP(fl), i; for (i = 0; i < res.bridges.length; i++) d = pc.union(d, rectMP(res.bridges[i])); return d.length; }

// 1. Aplatissement d'un cercle / circle flattening
var f0 = C.flatten(circle(0, 0, 50), true, 2, 0.05), dev = 0;
for (var i = 0; i < f0.xs.length; i++) dev = Math.max(dev, Math.abs(Math.sqrt(f0.xs[i] * f0.xs[i] + f0.ys[i] * f0.ys[i]) - 50));
ok("cercle aplati à moins de 0,1 pt du vrai cercle (Bézier)", dev < 0.1, dev);
ok("premier point non répété", !(f0.xs[0] === f0.xs[f0.xs.length - 1] && f0.ys[0] === f0.ys[f0.ys.length - 1]));

// 2. Lettre O : un anneau / letter O: a ring
var O = flat([circle(0, 0, 20 * MM), circle(0, 0, 12 * MM, true)], 1.5 * MM);
var r = C.analyse(O, opt({}));
ok("O : 2 contours, 1 île", r.contours === 2 && r.islands === 1, JSON.stringify([r.contours, r.islands]));
ok("O : 1 pont", r.bridges.length === 1, r.bridges.length);
ok("O : pont ≈ épaisseur de l'anneau (8 mm)", Math.abs(r.bridges[0].len / MM - 8) < 0.15, r.bridges[0].len / MM);
var c = r.bridges[0].pts, inner = 0, outer = 0;
c.forEach(function (p) { var d = Math.sqrt(p[0] * p[0] + p[1] * p[1]) / MM; if (d < 12) inner++; if (d > 20) outer++; });
ok("O : rectangle qui franchit les deux bords sur toute sa largeur", inner === 2 && outer === 2, inner + "/" + outer);
var wv = Math.sqrt(Math.pow(c[0][0] - c[3][0], 2) + Math.pow(c[0][1] - c[3][1], 2)) / MM;
ok("O : largeur du pont = 1,5 mm", Math.abs(wv - 1.5) < 1e-6, wv);
if (pc) ok("O : après découpe, la feuille est d'un seul tenant", sheetPieces(O, r) === 1, sheetPieces(O, r));
if (pc) ok("O sans pont : 2 morceaux de feuille (contrôle du test)", sheetPieces(O, { bridges: [] }) === 2);

// 3. Deux ponts par île / two bridges per island
var r2 = C.analyse(O, opt({ per: 2 }));
ok("O ×2 : 2 ponts", r2.bridges.length === 2, r2.bridges.length);
var sep = Math.sqrt(Math.pow(r2.bridges[0].mx - r2.bridges[1].mx, 2) + Math.pow(r2.bridges[0].my - r2.bridges[1].my, 2)) / MM;
ok("O ×2 : ponts éloignés l'un de l'autre (> 10 mm)", sep > 10, sep);
if (pc) ok("O ×2 : feuille d'un seul tenant, lettre en 2 morceaux", sheetPieces(O, r2) === 1);

// 4. Orientation imposée / forced orientation
var rv = C.analyse(O, opt({ orient: 1 })), bv = rv.bridges[0];
ok("O vertical : pont vertical", rv.bridges.length === 1 && Math.abs(bv.p[0] - bv.q[0]) < 1e-6, JSON.stringify([bv.p, bv.q]));
ok("O vertical : longueur 8 mm (haut ou bas de l'anneau)", Math.abs(bv.len / MM - 8) < 0.3, bv.len / MM);
var rh = C.analyse(O, opt({ orient: 2 })), bh = rh.bridges[0];
ok("O horizontal : pont horizontal", rh.bridges.length === 1 && Math.abs(bh.p[1] - bh.q[1]) < 1e-6);
if (pc) ok("O vertical : feuille d'un seul tenant", sheetPieces(O, rv) === 1);

// 5. Lettre 8 à taille fine : arbre minimal / thin-waisted 8: minimum tree
var E8 = flat([rect(0, 0, 40, 80), rect(10, 10, 20, 28), rect(10, 42, 20, 28)], 4);
var r8 = C.analyse(E8, opt({ w: 4, maxLen: 50 }));
ok("8 : 2 îles, 2 ponts", r8.islands === 2 && r8.bridges.length === 2, r8.islands + "/" + r8.bridges.length);
var lens = r8.bridges.map(function (b) { return Math.round(b.len * 100) / 100; }).sort(function (a, b) { return a - b; });
ok("8 : pont de 4 pt à la taille + pont de 10 pt vers l'extérieur", lens[0] === 4 && lens[1] === 10, lens.join(","));
if (pc) ok("8 : feuille d'un seul tenant", sheetPieces(E8, r8) === 1);
var r8d = C.analyse(E8, opt({ w: 4, maxLen: 50, direct: true }));
var allOut = r8d.bridges.every(function (b) { return b.ra === -1 || b.rb === -1; });
ok("8 direct : chaque île reliée à l'extérieur (pas de pont entre îles)", r8d.bridges.length === 2 && allOut);
if (pc) ok("8 direct : feuille d'un seul tenant", sheetPieces(E8, r8d) === 1);

// 6. ® imbriqué : pièce dans un trou, avec son propre trou / nested ®
var RG = flat([circle(0, 0, 40), circle(0, 0, 34, true), circle(0, 0, 20), circle(0, 0, 12, true)], 3);
var rr = C.analyse(RG, opt({ w: 3, maxLen: 30 }));
ok("® : profondeur 3, 2 îles", rr.maxDepth === 3 && rr.islands === 2, rr.maxDepth + "/" + rr.islands);
var l2 = rr.bridges.map(function (b) { return Math.round(b.len); }).sort(function (a, b) { return a - b; });
ok("® : ponts de 6 et 8 pt", l2.join(",") === "6,8", l2.join(","));
if (pc) ok("® : feuille d'un seul tenant", sheetPieces(RG, rr) === 1);

// 7. Mode pièce : « i » (point détaché) + pièce trop loin / piece mode: "i" + far piece
var I = flat([rect(0, 0, 5, 30), rect(0, 34, 5, 5), rect(200, 0, 5, 5)], 3);
var ri = C.analyse(I, opt({ mode: "piece", w: 3, maxLen: 20 }));
ok("i : 3 pièces, 2 liaisons nécessaires", ri.regions === 3 && ri.islands === 2);
ok("i : 1 pont de 4 pt entre le point et la barre", ri.bridges.length === 1 && Math.abs(ri.bridges[0].len - 4) < 1e-6, ri.bridges.length);
ok("i : pièce lointaine signalée non reliée", ri.unconnected.length === 1 && ri.unconnected[0].box[0] === 200);
if (pc) ok("i : point + barre soudés (2 pièces restantes dont la lointaine)", pieceCount(I, ri) === 2, pieceCount(I, ri));
var rif = C.analyse(I, opt({ mode: "piece", w: 3, maxLen: 300 }));
ok("i, longueur maxi 300 : tout est relié", rif.unconnected.length === 0 && rif.bridges.length === 2);
if (pc) ok("i : une seule pièce après soudure", pieceCount(I, rif) === 1);

// 8. Mode pièce : pièce dans le trou d'un O / piece inside an O counter
var OD = flat([circle(0, 0, 30), circle(0, 0, 20, true), circle(0, 0, 5)], 2);
var rod = C.analyse(OD, opt({ mode: "piece", w: 2, maxLen: 40 }));
ok("O + point central (pièce) : 1 pont de 15 pt", rod.bridges.length === 1 && Math.abs(rod.bridges[0].len - 15) < 0.1, rod.bridges.length && rod.bridges[0].len);
if (pc) ok("O + point : une seule pièce", pieceCount(OD, rod) === 1);

// 9. Trou en C (concave) : aucun pont ne traverse le trou lui-même / C-shaped hole: no bridge crosses the hole
var Cshape = poly([[10, 10], [50, 10], [50, 20], [20, 20], [20, 40], [50, 40], [50, 50], [10, 50]]);
var CH = flat([rect(0, 0, 60, 60), Cshape.reverse()], 2);
var rc = C.analyse(CH, opt({ w: 2, maxLen: 30 }));
ok("trou en C : 1 pont de 10 pt", rc.bridges.length === 1 && Math.abs(rc.bridges[0].len - 10) < 1e-6, rc.bridges[0] && rc.bridges[0].len);
if (pc) ok("trou en C : feuille d'un seul tenant", sheetPieces(CH, rc) === 1);

// 10. Pas d'île / no island
var rn = C.analyse(flat([rect(0, 0, 10, 10), rect(20, 0, 10, 10)], 2), opt({}));
ok("pochoir sans contre-forme : 0 pont", rn.islands === 0 && rn.bridges.length === 0);

// 11. Trou plus étroit que le pont / hole narrower than the bridge
var NH = flat([rect(0, 0, 40, 40), rect(19, 10, 2, 20).reverse()], 6);
var rnh = C.analyse(NH, opt({ w: 6, maxLen: 40 }));
ok("trou étroit (2 pt) avec pont de 6 pt : pont créé", rnh.bridges.length === 1);
if (pc) ok("trou étroit : feuille d'un seul tenant", sheetPieces(NH, rnh) === 1);

// 12. Comptage après découpe / post-cut count
ok("countIslands : O = 1, ® = 2, i (pièce) = 2", C.countIslands(O, "stencil") === 1 && C.countIslands(RG, "stencil") === 2 && C.countIslands(I, "piece") === 2);

// 13. Charge : 80 lettres O / load: 80 O letters
var many = [], t0 = Date.now();
for (var gx = 0; gx < 10; gx++) for (var gy = 0; gy < 8; gy++) { many.push(circle(gx * 60, gy * 60, 25)); many.push(circle(gx * 60, gy * 60, 15, true)); }
var rm = C.analyse(flat(many, 4), opt({ w: 4, maxLen: 30 }));
var dt = Date.now() - t0;
ok("80 O : 80 ponts, aucune île oubliée", rm.bridges.length === 80 && rm.unconnected.length === 0, rm.bridges.length);
console.log("     (80 O analysés en " + dt + " ms sous node ; ExtendScript est bien plus lent)");


// 14. Trou voisin sur le chemin : le pont ne traverse pas un autre trou sans le compter
// Sibling hole in the way: a bridge never crosses another hole unnoticed
var SB = flat([rect(0, 0, 100, 40), rect(30, 10, 40, 20).reverse(), rect(5, 18, 20, 4).reverse()], 2);
var rsb = C.analyse(SB, opt({ w: 2, maxLen: 60, direct: true }));
ok("trou voisin : 2 ponts, chacun vers l'extérieur", rsb.bridges.length === 2 && rsb.bridges.every(function (b) { return b.ra === -1 || b.rb === -1; }));
if (pc) ok("trou voisin : feuille d'un seul tenant", sheetPieces(SB, rsb) === 1);

// 15. Essais aléatoires : la découpe réelle (booléens) ne laisse aucune île non signalée
// Random trials: the real boolean cut leaves no unreported island
var seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
var bad = 0, trials = 0, badP = 0;
if (pc) for (var tr = 0; tr < 40; tr++) {
    var shapes = [], W = 80 + rnd() * 120, H = 60 + rnd() * 80, holes = [], tries = 0;
    shapes.push(rect(0, 0, W, H));
    while (holes.length < 6 && tries++ < 200) {
        var hw = 6 + rnd() * 30, hh = 6 + rnd() * 30, hx = 2 + rnd() * (W - hw - 4), hy = 2 + rnd() * (H - hh - 4), clash = false;
        holes.forEach(function (h) { if (hx < h[0] + h[2] + 2 && h[0] < hx + hw + 2 && hy < h[1] + h[3] + 2 && h[1] < hy + hh + 2) clash = true; });
        if (!clash) holes.push([hx, hy, hw, hh]);
    }
    holes.forEach(function (h) {
        if (rnd() < 0.5) shapes.push(circle(h[0] + h[2] / 2, h[1] + h[3] / 2, Math.min(h[2], h[3]) / 2, true));
        else shapes.push(rect(h[0], h[1], h[2], h[3]).reverse());
        if (h[2] > 18 && h[3] > 18 && rnd() < 0.5) shapes.push(rect(h[0] + 5, h[1] + 5, h[2] - 10, h[3] - 10)); // pièce dans le trou
    });
    var FL = flat(shapes, 2), orient = tr % 3;
    var R = C.analyse(FL, opt({ w: 1.5, maxLen: 200, orient: orient, per: 1 + (tr % 2) }));
    trials++;
    var pieces = sheetPieces(FL, R);
    if (pieces !== 1 + R.unconnected.length && !(R.unconnected.length && pieces <= 1 + R.unconnected.length)) bad++;
    if (orient === 0 && R.unconnected.length) badP++;
}
if (pc) ok("40 dessins aléatoires (libre / vertical / horizontal, 1 ou 2 ponts) : feuille d'un seul tenant sauf îles signalées", bad === 0, bad);
if (pc) ok("orientation libre : aucune île laissée seule", badP === 0, badP);
var badPc = 0;
if (pc) for (var tp = 0; tp < 20; tp++) {
    var ps = [];
    for (var q = 0; q < 8; q++) ps.push(rnd() < 0.5 ? rect(rnd() * 150, rnd() * 100, 4 + rnd() * 20, 4 + rnd() * 20) : circle(rnd() * 150, rnd() * 100, 3 + rnd() * 10));
    // Fusion préalable (comme Pathfinder > Ajouter dans Illustrator) / prior union (like Pathfinder Unite)
    var U = toMP(flat([ps[0]], 2)), q2;
    for (q2 = 1; q2 < ps.length; q2++) U = pc.union(U, toMP(flat([ps[q2]], 2)));
    var FP = [];
    U.forEach(function (pg) { pg.forEach(function (ring) { var r0 = ring.slice(0, -1); FP.push({ xs: r0.map(function (v) { return v[0]; }), ys: r0.map(function (v) { return v[1]; }), src: FP.length }); }); });
    var RP = C.analyse(FP, opt({ mode: "piece", w: 2, maxLen: 400 }));
    var nP = pieceCount(FP, RP);
    if (nP !== 1) badPc++;
}
if (pc) ok("20 jeux de pièces aléatoires fusionnées (chevauchements, trous) : une seule pièce après soudure", badPc === 0, badPc);

console.log("\n" + pass + " ok, " + fail + " échec(s)");
process.exit(fail ? 1 : 0);
