// Simulation des objets Illustrator (préparation, ponts, Pathfinder simulé par polygon-clipping).
// Ne remplace pas un essai réel dans Illustrator. / Simulated Illustrator objects — not a real test.
// Prérequis / requires: npm i polygon-clipping
var fs = require("fs"), vm = require("vm"), path = require("path"), pc = require("polygon-clipping");
var src = fs.readFileSync(path.join(__dirname, "..", "PontsPochoir.jsx"), "utf8");
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + e : "")); } }
var MM = 72 / 25.4, SEL = [], alerts = [], menu = [];

function detach(it) { if (it.parent) { var a = it.parent.pageItems, i = a.indexOf(it); if (i >= 0) a.splice(i, 1); } }
function attach(it, target, where) {
    detach(it); it.parent = target; it.layer = target.typename === "Layer" ? target : target.layer;
    if (where === "END") target.pageItems.push(it); else target.pageItems.unshift(it);
    (it.pathItems && it.typename === "CompoundPathItem" ? it.pathItems : []).forEach(function (p) { p.layer = it.layer; });
}
function base(o) {
    o.hidden = false; o.locked = false; o.note = ""; o.name = "";
    Object.defineProperty(o, "selected", { get: function () { return SEL.indexOf(o) >= 0; }, set: function (v) { if (v && SEL.indexOf(o) < 0) SEL.push(o); if (!v) SEL = SEL.filter(function (x) { return x !== o; }); } });
    o.remove = function () { detach(o); SEL = SEL.filter(function (x) { return x !== o; }); };
    o.move = function (t, w) { attach(o, t, w === "PLACEATEND" ? "END" : "BEGIN"); return o; };
    o.duplicate = function (t, w) { var c = clone(o); attach(c, t, w === "PLACEATEND" ? "END" : "BEGIN"); return c; };
    return o;
}
function mkPath(pts, o) {
    o = o || {};
    var p = base({ typename: "PathItem", closed: o.closed !== false, filled: o.filled !== false, stroked: !!o.stroked, strokeWidth: o.sw || 1,
        fillColor: { tag: o.fillTag || "noir" }, strokeColor: { tag: "trait" }, guides: false, clipping: false, evenodd: false });
    p.pathPoints = pts.map(function (q) { return { anchor: q, leftDirection: q, rightDirection: q }; });
    p.setEntirePath = function (a) { p.pathPoints = a.map(function (q) { return { anchor: q, leftDirection: q, rightDirection: q }; }); };
    return p;
}
function containerMethods(g) {
    g.pageItems = [];
    g.groupItems = { add: function () { var n = mkGroup(); attach(n, g, "BEGIN"); return n; } };
    g.pathItems = { add: function () { var p = mkPath([]); attach(p, g, "BEGIN"); return p; },
                    ellipse: function (t, l, w, h) { var p = mkPath([[l, t], [l + w, t], [l + w, t - h], [l, t - h]]); attach(p, g, "BEGIN"); return p; } };
    return g;
}
function mkGroup() { return containerMethods(base({ typename: "GroupItem", clipped: false })); }
function mkCompound(paths) { var c = base({ typename: "CompoundPathItem" }); c.pathItems = paths; paths.forEach(function (p) { p.parent = c; }); return c; }
function clone(o) {
    var c;
    if (o.typename === "PathItem") { c = mkPath(o.pathPoints.map(function (q) { return q.anchor.slice(); }), { closed: o.closed, filled: o.filled, stroked: o.stroked, sw: o.strokeWidth }); c.fillColor = o.fillColor; c.strokeColor = o.strokeColor; c.evenodd = o.evenodd; }
    else if (o.typename === "CompoundPathItem") c = mkCompound(o.pathItems.map(clone));
    else if (o.typename === "GroupItem") { c = mkGroup(); c.clipped = o.clipped; o.pageItems.forEach(function (x) { var y = clone(x); y.parent = c; c.pageItems.push(y); }); }
    else if (o.typename === "TextFrame") c = mkText(o.ring);
    else c = base({ typename: o.typename });
    return c;
}
function mkText(ring) {
    var t = base({ typename: "TextFrame", ring: ring });
    t.createOutline = function () { var g = mkGroup(), par = t.parent, i = par.pageItems.indexOf(t); var p = mkPath(ring); p.parent = g; g.pageItems.push(p); par.pageItems[i] = g; g.parent = par; return g; };
    return t;
}
function allPaths(it, out) {
    out = out || [];
    if (it.typename === "PathItem") out.push(it);
    else if (it.typename === "CompoundPathItem") it.pathItems.forEach(function (p) { out.push(p); });
    else if (it.typename === "GroupItem") it.pageItems.forEach(function (x) { allPaths(x, out); });
    return out;
}
function ringOf(p) { var r = p.pathPoints.map(function (q) { return [q.anchor[0], q.anchor[1]]; }); r.push(r[0]); return r; }
function mpOf(it) { var r = []; allPaths(it).forEach(function (p) { if (p.pathPoints.length < 3) return; r = r.length ? pc.xor(r, [[ringOf(p)]]) : [[ringOf(p)]]; }); return r; }
function fromMP(mp, paint) {
    var paths = [];
    mp.forEach(function (pg) { pg.forEach(function (ring) { var p = mkPath(ring.slice(0, -1)); paths.push(p); }); });
    var c = mkCompound(paths);
    paths.forEach(function (p) { p.filled = paint.filled; p.fillColor = paint.fillColor; p.stroked = paint.stroked; });
    return c;
}
function replaceSel(n) { var o = SEL[0], par = o.parent, i = par.pageItems.indexOf(o); par.pageItems[i] = n; n.parent = par; n.layer = o.layer; SEL = [n]; }
var app = {
    locale: "fr_FR", documents: [], activeDocument: null,
    executeMenuCommand: function (cmd) {
        menu.push(cmd);
        var o = SEL[0]; if (!o) return;
        if (cmd === "Live Pathfinder Add") {
            var ps = allPaths(o), u = [];
            o.pageItems.forEach(function (x) { var m = mpOf(x); if (m.length) u = u.length ? pc.union(u, m) : m; });
            replaceSel(fromMP(u, ps[0]));
        } else if (cmd === "Live Pathfinder Subtract") {
            var back = o.pageItems[o.pageItems.length - 1], d = mpOf(back), bp = allPaths(back)[0];
            o.pageItems.slice(0, -1).forEach(function (x) { d = pc.difference(d, mpOf(x)); });
            replaceSel(fromMP(d, bp));
        } else if (cmd === "compoundPath") {
            var ps2 = allPaths(o).map(clone); replaceSel(mkCompound(ps2));
        }
    }
};
function mkDoc() {
    var layers = [], doc = { documentColorSpace: "RGB", layers: layers };
    Object.defineProperty(doc, "selection", { get: function () { return SEL.slice(); }, set: function (v) { SEL = []; } });
    layers.add = function () {
        var L = containerMethods({ typename: "Layer", name: "", visible: true, locked: false, printable: true });
        L.layer = L; L.remove = function () { layers.splice(layers.indexOf(L), 1); };
        layers.unshift(L); return L;
    };
    var L1 = layers.add(); L1.name = "Calque 1";
    return doc;
}
function circ(cx, cy, r, n, rev) { var a = []; for (var i = 0; i < n; i++) { var t = 2 * Math.PI * i / n; a.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return rev ? a.reverse() : a; }
function rectP(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }

var ctx = { Math: Math, String: String, Number: Number, Infinity: Infinity, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt,
    PP_NO_MAIN: true, app: app, $: { locale: "fr_FR" }, alert: function (m) { alerts.push(String(m)); },
    DocumentColorSpace: { CMYK: "CMYK", RGB: "RGB" }, ElementPlacement: { PLACEATEND: "PLACEATEND", PLACEATBEGINNING: "PLACEATBEGINNING" },
    RGBColor: function () {}, CMYKColor: function () {}, Folder: { userData: "/tmp" },
    File: function () { return { exists: false, open: function () { return false; } }; } };
vm.createContext(ctx); vm.runInContext(src, ctx);
ok("textes en français (locale fr_FR)", ctx.PP_FR === true);
var baseOpt = { mode: "stencil", interp: "0", w: "1.5", maxLen: "15", per: "1", orient: "0", direct: "0", outline: "0", hide: "1", act: "apply" };
function O(c) { var o = {}, k; for (k in baseOpt) o[k] = baseOpt[k]; for (k in c) o[k] = c[k]; return ctx.PP_opts(o); }
function letterO(doc, x) { var cp = mkCompound([mkPath(circ(x, 0, 20 * MM, 72)), mkPath(circ(x, 0, 12 * MM, 72, true))]); attach(cp, doc.layers[0], "BEGIN"); return cp; }
function layerNamed(doc, pre) { return doc.layers.filter(function (L) { return L.name.indexOf(pre) === 0; }); }

// A. Analyse seule / analysis only
var d1 = mkDoc(), o1 = letterO(d1, 0), o2 = letterO(d1, 200);
var msg = ctx.PP_run(d1, [o1, o2], O({}), true);
ok("Analyser : 2 îles, 2 ponts proposés", /îles à relier : 2/.test(msg) && /Ponts proposés : 2/.test(msg), msg);
ok("Analyser : aucun calque laissé, original visible", d1.layers.length === 1 && !o1.hidden);

// B. Créer et appliquer (pochoir) / create and apply (stencil)
menu = [];
msg = ctx.PP_run(d1, [o1, o2], O({}), false);
ok("Créer : Pathfinder Ajouter puis Soustraire", menu.indexOf("Live Pathfinder Add") >= 0 && menu.indexOf("Live Pathfinder Subtract") >= 0, menu.join(","));
ok("Créer : 2 ponts appliqués, 0 île restante", /2 pont\(s\) appliqué/.test(msg) && /îles restantes : 0/.test(msg), msg);
ok("Créer : original masqué", o1.hidden && o2.hidden);
var res = layerNamed(d1, "Pochoir – résultat #1");
ok("Créer : calque « Pochoir – résultat #1 », calque de ponts vide retiré", res.length === 1 && layerNamed(d1, "Pochoir – ponts").length === 0);
var outItem = res[0].pageItems[0];
ok("Créer : peinture d'origine reprise", allPaths(outItem)[0].fillColor.tag === "noir");
ok("Créer : note du dessin marquée « fait »", /PP_DESIGN\|stencil\|done/.test(outItem.note), outItem.note);

// C. Poser seulement puis appliquer les ponts posés / place only then apply placed
var d2 = mkDoc(), o3 = letterO(d2, 0);
msg = ctx.PP_run(d2, [o3], O({ act: "place", per: "2" }), false);
var br = layerNamed(d2, "Pochoir – ponts #1");
ok("Poser : calque de ponts non imprimable avec 2 rectangles", br.length === 1 && !br[0].printable && br[0].pageItems.length === 2, br.length && br[0].pageItems.length);
ok("Poser : rectangles nommés avec la longueur", /^Pont 1 \(8,0 mm\)$/.test(br[0].pageItems[1].name) || /^Pont \d \(8,0 mm\)$/.test(br[0].pageItems[0].name), br[0].pageItems[0].name);
ok("Poser : message d'aide pour appliquer ensuite", /Appliquer les ponts posés/.test(msg));
br[0].pageItems[0].remove(); // l'utilisateur retire un pont / user deletes one bridge
msg = ctx.PP_applyPlaced(d2, O({}));
ok("Appliquer les ponts posés : 1 pont, 0 île restante, calque de ponts retiré", /1 pont\(s\) appliqué/.test(msg) && /îles restantes : 0/.test(msg) && layerNamed(d2, "Pochoir – ponts").length === 0, msg);
ok("Appliquer les ponts posés : rien à refaire ensuite", /Aucun calque de ponts/.test(ctx.PP_applyPlaced(d2, O({}))));

// D. Texte, image ignorée, verrouillé / text, ignored image, locked item
var d3 = mkDoc(), L = d3.layers[0];
var tx = mkText(rectP(0, 0, 30, 30)); attach(tx, L, "BEGIN");
var g = mkGroup(); attach(g, L, "BEGIN");
var outer = mkPath(rectP(100, 0, 40, 40)), hole = mkPath(rectP(110, 10, 20, 20).reverse()), img = base({ typename: "PlacedItem" });
var cpx = mkCompound([outer, hole]); cpx.parent = g; g.pageItems.push(cpx); img.parent = g; g.pageItems.push(img);
var lk = letterO(d3, 400); lk.locked = true;
msg = ctx.PP_run(d3, [tx, g, lk], O({}), true);
ok("Texte vectorisé + image et objet verrouillé ignorés (2)", /Objets ignorés[^:]*: 2/.test(msg) && /îles à relier : 1/.test(msg), msg);

// E. Lignes de coupe (traits seuls) détectées automatiquement / cut lines auto-detected
var d4 = mkDoc(), L4 = d4.layers[0];
var c1 = mkPath(circ(0, 0, 50, 72), { filled: false, stroked: true, sw: 0.1 }), c2 = mkPath(circ(0, 0, 35, 72), { filled: false, stroked: true, sw: 0.1 });
attach(c1, L4, "BEGIN"); attach(c2, L4, "BEGIN");
menu = [];
msg = ctx.PP_run(d4, [c1, c2], O({}), false);
ok("Lignes de coupe : lecture pair/impair (Tracé transparent, pas d'Ajouter)", /lignes de coupe/.test(msg) && menu.indexOf("compoundPath") >= 0 && menu[0] !== "Live Pathfinder Add", menu.join(","));
var r4 = layerNamed(d4, "Pochoir – résultat")[0].pageItems[0], p4 = allPaths(r4)[0];
ok("Lignes de coupe : 0 île restante et traits d'origine rendus (non rempli)", /îles restantes : 0/.test(msg) && p4.filled === false && p4.stroked === true, msg);

// F. Pièce découpée : « i » / cut-out piece: "i"
var d5 = mkDoc(), L5 = d5.layers[0];
var st = mkPath(rectP(0, 0, 15, 90)), dot = mkPath(rectP(0, 100, 15, 15));
attach(st, L5, "BEGIN"); attach(dot, L5, "BEGIN");
msg = ctx.PP_run(d5, [st, dot], O({ mode: "piece", w: "2", maxLen: "10" }), false);
ok("Pièce : point soudé à la barre, 0 pièce séparée en trop", /1 pont\(s\) appliqué/.test(msg) && /pièces séparées en trop : 0/.test(msg), msg);

// G. Île impossible : longueur maxi trop courte / unreachable island
var d6 = mkDoc(), o6 = letterO(d6, 0);
msg = ctx.PP_run(d6, [o6], O({ maxLen: "3" }), false);
var br6 = layerNamed(d6, "Pochoir – ponts");
ok("Longueur maxi 3 mm < 8 mm : île signalée et entourée sur le calque de ponts", /impossibles à relier[^:]*: 1/.test(msg) && br6.length === 1 && br6[0].pageItems[0].note === "PP_MARK", msg);

// H. Lancement sans document, sans sélection / no document, no selection
alerts = []; ctx.app.documents = []; ctx.PP_main();
ok("Sans document : message clair", alerts[0] === "Ouvrez un document avant de lancer le script.", alerts[0]);
var d7 = mkDoc(); ctx.app.documents = [d7]; ctx.app.activeDocument = d7; SEL = []; alerts = [];
ctx.PP_dialog = function () { var o = {}, k; for (k in baseOpt) o[k] = baseOpt[k]; o.action = "create"; return o; };
ctx.PP_main();
ok("Sans sélection : message clair", /Sélectionnez le dessin/.test(alerts[0]), alerts[0]);
ctx.PP_dialog = function () { return null; }; alerts = []; ctx.PP_main();
ok("Annuler : rien ne se passe", alerts.length === 0 && d7.layers.length === 1);

console.log("\n" + pass + " ok, " + fail + " échec(s)");
process.exit(fail ? 1 : 0);
