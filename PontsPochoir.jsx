//@target illustrator
/*
 * PontsPochoir.jsx — v1.0.0
 * Ponts automatiques pour pochoir et découpe / Automatic stencil & cut bridges
 *
 * FR : Trouve les « îles » qui tomberaient à la découpe (intérieur des O, A, B, ه, و, ق…,
 *      ou pièces détachées d'un logo découpé) et pose les ponts les plus courts pour
 *      qu'elles restent attachées : pochoir, découpe laser, plasma, jet d'eau, CNC.
 *      Les îles sont reliées par un arbre de ponts minimal (ou chacune vers l'extérieur),
 *      avec largeur, orientation, longueur maximale et 1 ou 2 ponts par île. Les ponts
 *      sont soit appliqués tout de suite (Pathfinder), soit posés en rectangles modifiables
 *      que le script applique ensuite. L'original est conservé (masqué).
 * EN : Finds the "islands" that would fall out when cutting (counters of O, A, B, ه, و, ق…,
 *      or loose parts of a cut-out logo) and adds the shortest bridges that keep them
 *      attached: stencils, laser, plasma, water-jet, CNC. Islands are linked by a minimal
 *      tree of bridges (or each one outwards), with width, orientation, maximum length and
 *      1 or 2 bridges per island. Bridges are either applied at once (Pathfinder) or placed
 *      as editable rectangles that the script applies later. The original is kept (hidden).
 *
 * Auteur / Author : Amirouche Amwanes — Licence MIT / MIT License
 * Cible / Target : Adobe Illustrator CC 2018+ (ExtendScript ES3). Non testé dans Illustrator.
 * Aucun appel réseau, aucune collecte de données. / No network calls, no data collection.
 */

/* ===================================================================== */
/*  1. CŒUR GÉOMÉTRIQUE (pur, sans Illustrator) / PURE GEOMETRY CORE      */
/* ===================================================================== */

var PP_CORE = (function () {

    function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }

    // Distance d'un point à une droite (planéité des courbes) / point-to-line distance (flatness)
    function lineDev(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy);
        if (L < 1e-12) return dist(px, py, ax, ay);
        return Math.abs((px - ax) * dy - (py - ay) * dx) / L;
    }

    // Coordonnée d'une cubique de Bézier / cubic Bézier coordinate
    function bez(p0, p1, p2, p3, t) {
        var u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }

    /*
     * Aplatit un tracé en polygone. / Flattens a path into a polygon.
     * pts : [[ax, ay, lx, ly, rx, ry], ...] — ancre, poignée gauche (entrante), poignée droite (sortante)
     *       anchor, left (incoming) handle, right (outgoing) handle
     * Retour / returns { xs:[], ys:[] } sans répéter le premier point / first point not repeated.
     */
    function flatten(pts, closed, maxSeg, tol) {
        var xs = [], ys = [], n = pts.length, i, j;
        if (n < 2) return null;
        xs.push(pts[0][0]); ys.push(pts[0][1]);
        var segs = closed ? n : n - 1;
        for (i = 0; i < segs; i++) {
            var A = pts[i], B = pts[(i + 1) % n];
            var x0 = A[0], y0 = A[1], x1 = A[4], y1 = A[5], x2 = B[2], y2 = B[3], x3 = B[0], y3 = B[1];
            var dev = Math.max(lineDev(x1, y1, x0, y0, x3, y3), lineDev(x2, y2, x0, y0, x3, y3));
            var poly = dist(x0, y0, x1, y1) + dist(x1, y1, x2, y2) + dist(x2, y2, x3, y3);
            var k = 1;
            if (dev > 1e-9) k = Math.max(Math.ceil(Math.sqrt(dev / tol)), Math.ceil(poly / maxSeg));
            if (k > 300) k = 300;
            for (j = 1; j <= k; j++) {
                var t = j / k;
                if (dev <= 1e-9) { xs.push(x0 + (x3 - x0) * t); ys.push(y0 + (y3 - y0) * t); }
                else { xs.push(bez(x0, x1, x2, x3, t)); ys.push(bez(y0, y1, y2, y3, t)); }
            }
        }
        if (closed && xs.length > 1) {
            var m = xs.length - 1;
            if (Math.abs(xs[m] - xs[0]) < 1e-9 && Math.abs(ys[m] - ys[0]) < 1e-9) { xs.pop(); ys.pop(); }
        }
        return { xs: xs, ys: ys };
    }

    // Contour fermé : boîte, aire signée, périmètre cumulé / closed contour: box, signed area, cumulative length
    function makeContour(xs, ys, src) {
        var n = xs.length, i, a = 0, minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, cum = [0], s = 0;
        for (i = 0; i < n; i++) {
            var x = xs[i], y = ys[i], k = (i + 1) % n;
            if (x < minx) minx = x; if (x > maxx) maxx = x;
            if (y < miny) miny = y; if (y > maxy) maxy = y;
            a += x * ys[k] - xs[k] * y;
            s += dist(x, y, xs[k], ys[k]);
            cum.push(s);
        }
        return { xs: xs, ys: ys, n: n, area: a / 2, absArea: Math.abs(a / 2), per: s, cum: cum,
                 minx: minx, miny: miny, maxx: maxx, maxy: maxy, src: src, parent: -1, depth: 0 };
    }

    // Point dans le polygone (pair/impair) / point in polygon (even-odd)
    function inside(c, x, y) {
        if (x < c.minx || x > c.maxx || y < c.miny || y > c.maxy) return false;
        var xs = c.xs, ys = c.ys, n = c.n, i, j = n - 1, r = false;
        for (i = 0; i < n; i++) {
            if (((ys[i] > y) !== (ys[j] > y)) && (x < (xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i]) + xs[i])) r = !r;
            j = i;
        }
        return r;
    }

    function boxIn(o, c) { return c.minx >= o.minx - 1e-6 && c.maxx <= o.maxx + 1e-6 && c.miny >= o.miny - 1e-6 && c.maxy <= o.maxy + 1e-6; }

    function boxDist(a, b) {
        var dx = Math.max(0, Math.max(a.minx, b.minx) - Math.min(a.maxx, b.maxx));
        var dy = Math.max(0, Math.max(a.miny, b.miny) - Math.min(a.maxy, b.maxy));
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Points d'essai au milieu de trois arêtes / test points in the middle of three edges
    function testPoints(c) {
        var r = [], k, idx = [0, Math.floor(c.n / 3), Math.floor(2 * c.n / 3)];
        for (k = 0; k < 3; k++) {
            var i = idx[k], j = (i + 1) % c.n;
            r.push([(c.xs[i] + c.xs[j]) / 2, (c.ys[i] + c.ys[j]) / 2]);
        }
        return r;
    }

    /*
     * Imbrication des contours : parent = plus petit contour qui le contient.
     * Nesting: parent = smallest contour that contains it. Profondeur paire = bord extérieur
     * d'une partie pleine, impaire = trou. / Even depth = outer edge of a solid part, odd = hole.
     */
    function hierarchy(cs) {
        var order = [], i, oi, oj;
        for (i = 0; i < cs.length; i++) order.push(i);
        order.sort(function (p, q) { return cs[q].absArea - cs[p].absArea; });
        for (oi = 0; oi < order.length; oi++) {
            var c = cs[order[oi]], tp = testPoints(c);
            c.parent = -1; c.depth = 0;
            for (oj = oi - 1; oj >= 0; oj--) {
                var d = cs[order[oj]];
                if (d.absArea <= c.absArea) continue; // un parent est plus grand / a parent is larger
                if (!boxIn(d, c)) continue;
                var v = 0, k;
                for (k = 0; k < 3; k++) if (inside(d, tp[k][0], tp[k][1])) v++;
                if (v >= 2) { c.parent = order[oj]; c.depth = d.depth + 1; break; }
            }
        }
    }

    /*
     * Espaces : l'intérieur du contour c porte l'identifiant c, l'extérieur de tout porte -1.
     * Spaces: the inside of contour c has id c, the outside of everything has id -1.
     * Pochoir : matière = vide (la feuille), passage = dessin. Pièce : matière = dessin.
     * Stencil: material = empty space (the sheet), gap = design. Piece: material = design.
     */
    function classify(cs, mode) {
        var i, gaps = {}, gapList = [];
        for (i = 0; i < cs.length; i++) {
            var c = cs[i], insideDesign = (c.depth % 2 === 0);
            var insideIsMaterial = (mode === "piece") ? insideDesign : !insideDesign;
            if (insideIsMaterial) { c.region = i; c.gap = c.parent; }
            else { c.region = c.parent; c.gap = i; }
            var key = "g" + c.gap;
            if (!gaps[key]) { gaps[key] = { id: c.gap, list: [] }; gapList.push(gaps[key]); }
            gaps[key].list.push(i);
        }
        return gapList;
    }

    // Point dans l'espace g (dans g, hors de ses enfants) / point in space g (inside g, outside its children)
    function inGap(cs, gap, x, y) {
        if (gap.id >= 0 && !inside(cs[gap.id], x, y)) return false;
        var k;
        for (k = 0; k < gap.list.length; k++) {
            var ci = gap.list[k];
            if (ci === gap.id) continue;
            if (inside(cs[ci], x, y)) return false;
        }
        return true;
    }

    // Point à l'abscisse s du contour / point at arc length s on the contour
    function pointAt(c, s) {
        var lo = 0, hi = c.n, cum = c.cum;
        s = s % c.per; if (s < 0) s += c.per;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
        var i = lo, j = (i + 1) % c.n, L = cum[i + 1] - cum[i], t = L > 1e-12 ? (s - cum[i]) / L : 0;
        return [c.xs[i] + (c.xs[j] - c.xs[i]) * t, c.ys[i] + (c.ys[j] - c.ys[i]) * t];
    }

    function samples(c, step, maxN) {
        var N = Math.ceil(c.per / step), r = [], k;
        if (N < 12) N = 12; if (N > maxN) N = maxN;
        for (k = 0; k < N; k++) r.push(pointAt(c, c.per * (k + 0.5) / N));
        return r;
    }

    // Point le plus proche du contour / nearest point on the contour
    function nearest(c, x, y) {
        var best = Infinity, bx = 0, by = 0, i, n = c.n, xs = c.xs, ys = c.ys;
        for (i = 0; i < n; i++) {
            var j = (i + 1) % n, ax = xs[i], ay = ys[i], dx = xs[j] - ax, dy = ys[j] - ay, L2 = dx * dx + dy * dy, t = 0;
            if (L2 > 1e-18) { t = ((x - ax) * dx + (y - ay) * dy) / L2; if (t < 0) t = 0; else if (t > 1) t = 1; }
            var qx = ax + dx * t, qy = ay + dy * t, d2 = (qx - x) * (qx - x) + (qy - y) * (qy - y);
            if (d2 < best) { best = d2; bx = qx; by = qy; }
        }
        return [bx, by, Math.sqrt(best)];
    }

    // Intersection de [p,q] avec [c,d] : paramètre t sur [p,q] ou -1 / segment intersection: t on [p,q] or -1
    function segHit(px, py, qx, qy, cx, cy, dx, dy) {
        var rx = qx - px, ry = qy - py, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-14) return -1;
        var wx = cx - px, wy = cy - py, t = (wx * sy - wy * sx) / den, u = (wx * ry - wy * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) return -1;
        return t;
    }

    // Le segment reste-t-il dans l'espace g sans traverser de contour ? / does the segment stay inside space g?
    function validSeg(cs, gap, px, py, qx, qy) {
        var L = dist(px, py, qx, qy);
        if (L < 1e-4) return false;
        if (!inGap(cs, gap, (px + qx) / 2, (py + qy) / 2)) return false;
        var minx = Math.min(px, qx), maxx = Math.max(px, qx), miny = Math.min(py, qy), maxy = Math.max(py, qy), k, i;
        var eps = 1e-4;
        for (k = 0; k < gap.list.length; k++) {
            var c = cs[gap.list[k]];
            if (c.maxx < minx || c.minx > maxx || c.maxy < miny || c.miny > maxy) continue;
            for (i = 0; i < c.n; i++) {
                var j = (i + 1) % c.n;
                var ex1 = c.xs[i], ey1 = c.ys[i], ex2 = c.xs[j], ey2 = c.ys[j];
                if (Math.max(ex1, ex2) < minx || Math.min(ex1, ex2) > maxx || Math.max(ey1, ey2) < miny || Math.min(ey1, ey2) > maxy) continue;
                var t = segHit(px, py, qx, qy, ex1, ey1, ex2, ey2);
                if (t > eps && t < 1 - eps) return false;
            }
        }
        return true;
    }

    // Croisements d'une droite avec un contour (paramètres t) / line crossings with a contour (t values)
    function lineHits(c, ox, oy, dx, dy) {
        var r = [], i;
        for (i = 0; i < c.n; i++) {
            var j = (i + 1) % c.n, x1 = c.xs[i], y1 = c.ys[i], ex = c.xs[j] - x1, ey = c.ys[j] - y1;
            var den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-14) continue;
            var wx = x1 - ox, wy = y1 - oy, t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
            if (u >= 0 && u < 1) r.push(t);
        }
        return r;
    }

    function ufFind(uf, k) { while (uf[k] !== k) { uf[k] = uf[uf[k]]; k = uf[k]; } return k; }
    function rk(r) { return "r" + r; }

    /*
     * Rectangle du pont : prolongé juste assez pour franchir les deux bords sur toute sa largeur.
     * Bridge rectangle: extended just enough to cross both edges over its whole width.
     */
    function bridgeRect(cs, cand, w) {
        var a = cs[cand.a], b = cs[cand.b], px = cand.px, py = cand.py, L = cand.len;
        var dx = (cand.qx - px) / L, dy = (cand.qy - py) / L, nx = -dy, ny = dx, h = w / 2;
        var margin = Math.max(0.1, 0.05 * w), cap = Math.max(w, 1), k, m;
        var tS = -margin, tE = L + margin;
        for (k = -3; k <= 3; k++) {
            var s = h * k / 3, ox = px + nx * s, oy = py + ny * s;
            var ha = lineHits(a, ox, oy, dx, dy), hb = lineHits(b, ox, oy, dx, dy), ba = null, bb = null;
            for (m = 0; m < ha.length; m++) if (ha[m] < L / 2 && (ba === null || Math.abs(ha[m]) < Math.abs(ba))) ba = ha[m];
            for (m = 0; m < hb.length; m++) if (hb[m] > L / 2 && (bb === null || Math.abs(hb[m] - L) < Math.abs(bb - L))) bb = hb[m];
            if (ba === null) ba = -cap;
            if (bb === null) bb = L + cap;
            if (ba - margin < tS) tS = ba - margin;
            if (bb + margin > tE) tE = bb + margin;
        }
        if (tS < -cap) tS = -cap;
        if (tE > L + cap) tE = L + cap;
        var sx = px + dx * tS, sy = py + dy * tS, ex = px + dx * tE, ey = py + dy * tE;
        return [[sx + nx * h, sy + ny * h], [ex + nx * h, ey + ny * h], [ex - nx * h, ey - ny * h], [sx - nx * h, sy - ny * h]];
    }

    /*
     * Analyse complète. / Full analysis.
     * raw : [{ xs, ys, src }] polygones fermés / closed polygons
     * opt : { mode:"stencil"|"piece", w, maxLen, per:1|2, orient:0 libre/free|1 vertical|2 horizontal, direct:Boolean }
     */
    function analyse(raw, opt) {
        var cs = [], i, j, k;
        for (i = 0; i < raw.length; i++) {
            if (!raw[i] || raw[i].xs.length < 3) continue;
            var c0 = makeContour(raw[i].xs, raw[i].ys, raw[i].src);
            if (c0.absArea < 1e-4) continue;
            cs.push(c0);
        }
        hierarchy(cs);
        var gapList = classify(cs, opt.mode);
        var w = opt.w, maxLen = opt.maxLen, step = Math.max(w / 3, 0.5), maxN = opt.maxSamples || 240;

        // Régions de matière / material regions
        var regs = {}, regList = [], rootKey = null, rootArea = -1;
        function addReg(r, area) { var key = rk(r); if (!regs[key]) { regs[key] = { id: r, area: area }; regList.push(regs[key]); } }
        if (opt.mode !== "piece") addReg(-1, Infinity);
        for (i = 0; i < cs.length; i++) if (cs[i].region === i) addReg(i, cs[i].absArea);
        for (i = 0; i < regList.length; i++) if (regList[i].area > rootArea) { rootArea = regList[i].area; rootKey = rk(regList[i].id); }

        // Candidats par paire de régions / candidates per region pair
        var pairs = {}, pairList = [];
        function pushCand(gap, ai, bi, px, py, qx, qy) {
            var ra = cs[ai].region, rb = cs[bi].region;
            if (ra === rb) return;
            var key = ra < rb ? ra + "|" + rb : rb + "|" + ra;
            if (!pairs[key]) { pairs[key] = { key: key, ra: ra, rb: rb, cands: [] }; pairList.push(pairs[key]); }
            pairs[key].cands.push({ a: ai, b: bi, px: px, py: py, qx: qx, qy: qy, len: dist(px, py, qx, qy), gap: gap });
        }
        function allowed(ai, bi) {
            if (!opt.direct || opt.mode === "piece") return true;
            return cs[ai].parent === bi || cs[bi].parent === ai;
        }
        var dirs = opt.orient === 1 ? [[0, 1], [0, -1]] : (opt.orient === 2 ? [[1, 0], [-1, 0]] : null);

        for (var g = 0; g < gapList.length; g++) {
            var gap = gapList[g], B = gap.list;
            if (B.length < 2) continue;
            if (!dirs) {
                for (i = 0; i < B.length; i++) for (j = i + 1; j < B.length; j++) {
                    var ai = B[i], bi = B[j];
                    if (cs[ai].region === cs[bi].region || !allowed(ai, bi)) continue;
                    if (boxDist(cs[ai], cs[bi]) > maxLen) continue;
                    var sa = samples(cs[ai], step, maxN), sb = samples(cs[bi], step, maxN), q;
                    for (k = 0; k < sa.length; k++) { q = nearest(cs[bi], sa[k][0], sa[k][1]); if (q[2] <= maxLen) pushCand(gap, ai, bi, sa[k][0], sa[k][1], q[0], q[1]); }
                    for (k = 0; k < sb.length; k++) { q = nearest(cs[ai], sb[k][0], sb[k][1]); if (q[2] <= maxLen) pushCand(gap, ai, bi, q[0], q[1], sb[k][0], sb[k][1]); }
                }
            } else {
                for (i = 0; i < B.length; i++) {
                    var a = B[i], sp = samples(cs[a], step, maxN);
                    for (k = 0; k < sp.length; k++) for (var d = 0; d < 2; d++) {
                        var ox = sp[k][0], oy = sp[k][1], ddx = dirs[d][0], ddy = dirs[d][1];
                        var ex = ox + ddx * maxLen, ey = oy + ddy * maxLen, bestT = Infinity, bestC = -1;
                        var rminx = Math.min(ox, ex), rmaxx = Math.max(ox, ex), rminy = Math.min(oy, ey), rmaxy = Math.max(oy, ey);
                        for (j = 0; j < B.length; j++) {
                            var cc = cs[B[j]];
                            if (cc.maxx < rminx || cc.minx > rmaxx || cc.maxy < rminy || cc.miny > rmaxy) continue;
                            var hs = lineHits(cc, ox, oy, ddx, ddy);
                            for (var m = 0; m < hs.length; m++) if (hs[m] > 1e-6 && hs[m] <= maxLen && hs[m] < bestT) { bestT = hs[m]; bestC = B[j]; }
                        }
                        if (bestC >= 0 && cs[bestC].region !== cs[a].region && allowed(a, bestC))
                            pushCand(gap, a, bestC, ox, oy, ox + ddx * bestT, oy + ddy * bestT);
                    }
                }
            }
        }

        // Meilleur candidat valide de chaque paire / best valid candidate of each pair
        var edges = [];
        for (i = 0; i < pairList.length; i++) {
            var P = pairList[i];
            P.cands.sort(function (u, v) { return u.len - v.len; });
            P.tested = 0; P.best = null;
            for (k = 0; k < P.cands.length && k < 120; k++) {
                var cd = P.cands[k];
                if (validSeg(cs, cd.gap, cd.px, cd.py, cd.qx, cd.qy)) { P.best = cd; P.bestIdx = k; break; }
            }
            if (P.best) edges.push(P);
        }
        edges.sort(function (u, v) { return u.best.len - v.best.len; });

        // Arbre minimal (Kruskal) / minimum spanning tree (Kruskal)
        var uf = {};
        for (i = 0; i < regList.length; i++) uf[rk(regList[i].id)] = rk(regList[i].id);
        var bridges = [];
        function addBridge(cd, P, second) {
            bridges.push({ len: cd.len, a: cd.a, b: cd.b, ra: P.ra, rb: P.rb, second: !!second,
                           mx: (cd.px + cd.qx) / 2, my: (cd.py + cd.qy) / 2, pts: bridgeRect(cs, cd, w),
                           p: [cd.px, cd.py], q: [cd.qx, cd.qy] });
        }
        for (i = 0; i < edges.length; i++) {
            var E = edges[i], fa = ufFind(uf, rk(E.ra)), fb = ufFind(uf, rk(E.rb));
            if (fa === fb) continue;
            uf[fa] = fb;
            addBridge(E.best, E, false);
            if (opt.per === 2) {
                var A0 = cs[E.best.a], B0 = cs[E.best.b];
                var diag = Math.min(dist(A0.minx, A0.miny, A0.maxx, A0.maxy), dist(B0.minx, B0.miny, B0.maxx, B0.maxy));
                var sep = Math.max(2 * w, 0.3 * diag), mx0 = (E.best.px + E.best.qx) / 2, my0 = (E.best.py + E.best.qy) / 2;
                for (k = E.bestIdx + 1; k < E.cands.length && k < 600; k++) {
                    var c2 = E.cands[k];
                    if (dist((c2.px + c2.qx) / 2, (c2.py + c2.qy) / 2, mx0, my0) < sep) continue;
                    if (validSeg(cs, c2.gap, c2.px, c2.py, c2.qx, c2.qy)) { addBridge(c2, E, true); break; }
                }
            }
        }

        // Îles restées seules / islands left unconnected
        var unconnected = [], rootF = rootKey ? ufFind(uf, rootKey) : null;
        for (i = 0; i < regList.length; i++) {
            var R = regList[i];
            if (R.id < 0) continue;
            if (ufFind(uf, rk(R.id)) !== rootF) {
                var cR = cs[R.id];
                unconnected.push({ id: R.id, box: [cR.minx, cR.miny, cR.maxx, cR.maxy] });
            }
        }
        var maxDepth = 0, holes = 0;
        for (i = 0; i < cs.length; i++) { if (cs[i].depth > maxDepth) maxDepth = cs[i].depth; if (cs[i].depth % 2 === 1) holes++; }
        return { contours: cs.length, regions: regList.length, islands: regList.length - 1, holes: holes,
                 bridges: bridges, unconnected: unconnected, maxDepth: maxDepth };
    }

    // Compte les îles sans rien relier (vérification après découpe) / counts islands only (post-check)
    function countIslands(raw, mode) {
        var cs = [], i, n = 0;
        for (i = 0; i < raw.length; i++) {
            if (!raw[i] || raw[i].xs.length < 3) continue;
            var c = makeContour(raw[i].xs, raw[i].ys, raw[i].src);
            if (c.absArea >= 1e-4) cs.push(c);
        }
        hierarchy(cs);
        for (i = 0; i < cs.length; i++) {
            if (mode === "piece") { if (cs[i].depth % 2 === 0) n++; }
            else if (cs[i].depth % 2 === 1) n++;
        }
        return mode === "piece" ? Math.max(0, n - 1) : n;
    }

    return { flatten: flatten, makeContour: makeContour, inside: inside, hierarchy: hierarchy, classify: classify,
             nearest: nearest, segHit: segHit, lineHits: lineHits, bridgeRect: bridgeRect, analyse: analyse,
             countIslands: countIslands };
})();

/* ===================================================================== */
/*  2. TEXTES FR / EN  —  UI STRINGS                                      */
/* ===================================================================== */

var PP_FR = (function () {
    var l = "";
    try { l = String(app.locale || $.locale || ""); } catch (e) { try { l = String($.locale); } catch (e2) {} }
    return l.toLowerCase().indexOf("fr") === 0;
})();

var PP_T = PP_FR ? {
    title: "Ponts de pochoir et de découpe — v1.0.0",
    noDoc: "Ouvrez un document avant de lancer le script.",
    noSel: "Sélectionnez le dessin à préparer (texte, tracés, tracés transparents, groupes).",
    pType: "Type de découpe",
    mStencil: "Pochoir : le dessin est évidé, la feuille autour doit tenir (intérieur des lettres)",
    mPiece: "Pièce découpée : le dessin est gardé, toutes ses parties doivent tenir ensemble",
    interp: "Lecture du dessin :", iAuto: "Auto", iFill: "Formes pleines (fusionnées)", iCut: "Lignes de coupe (pair / impair)",
    pBridge: "Ponts", width: "Largeur (mm) :", maxLen: "Longueur maxi (mm) :", per: "Ponts par île :",
    orient: "Orientation :", oFree: "La plus courte", oVert: "Verticale", oHorz: "Horizontale",
    direct: "Relier chaque île à la forme qui l'entoure (pas de pont entre deux îles)",
    pOpt: "Options", outline: "Vectoriser les traits (traits = matière du dessin)",
    hide: "Masquer l'original (Objet > Tout afficher pour le revoir)",
    pAct: "Action", aApply: "Créer et appliquer les ponts (Pathfinder)",
    aPlace: "Poser seulement les ponts (rectangles à ajuster, puis « Appliquer les ponts posés »)",
    tip: "Conseil : travaillez sur une copie du fichier. L'original est conservé, masqué ; le résultat va sur de nouveaux calques.",
    analyse: "Analyser", applyPlaced: "Appliquer les ponts posés", cancel: "Annuler", ok: "Créer",
    badNum: "Entrez une largeur et une longueur maximale supérieures à 0.",
    layRes: "Pochoir – résultat", layBr: "Pochoir – ponts",
    nothing: "Aucun tracé fermé exploitable dans la sélection.",
    ignored: "Objets ignorés (images, symboles, maillages, tracés ouverts, non peints…) : {n}.",
    clipWarn: "Masques d'écrêtage présents : vérifiez le résultat (ou Pathfinder > Recadrer avant).",
    pfFail: "La fusion Pathfinder n'a pas abouti ; analyse faite sur les tracés bruts.",
    rep: "{lec}\nContours : {c} — îles à relier : {i}\nPonts proposés : {b} (longueur {min} à {max} mm)",
    repNone: "{lec}\nContours : {c} — aucune île : rien à relier.",
    lecFill: "Lecture : formes pleines fusionnées.", lecCut: "Lecture : lignes de coupe (pair / impair).",
    uncon: "Îles impossibles à relier (longueur maxi trop courte ou orientation imposée) : {n} — entourées en rouge.",
    placed: "{b} pont(s) posé(s) sur le calque « {l} » (non imprimable).\nDéplacez, élargissez, ajoutez ou supprimez des rectangles, puis relancez le script et cliquez sur « Appliquer les ponts posés ».",
    applied: "{b} pont(s) appliqué(s).",
    remain: "Vérification : îles restantes : {n}.",
    remainPiece: "Vérification : pièces séparées en trop : {n}.",
    undo: "Annuler : Ctrl+Z / Cmd+Z (plusieurs fois si besoin, Pathfinder crée ses propres étapes) ou supprimez les calques « Pochoir – … » puis Objet > Tout afficher.",
    noPlaced: "Aucun calque de ponts posés trouvé (« Pochoir – ponts #… »).",
    noDesign: "Le dessin associé (calque « Pochoir – résultat #… ») est introuvable.",
    noBridges: "Le calque de ponts ne contient aucun rectangle.",
    analyseTitle: "Analyse (rien n'a été modifié)",
    island: "Île non reliée", bridge: "Pont"
} : {
    title: "Stencil & cut bridges — v1.0.0",
    noDoc: "Open a document before running the script.",
    noSel: "Select the artwork to prepare (text, paths, compound paths, groups).",
    pType: "Cut type",
    mStencil: "Stencil: the artwork is cut away, the sheet around it must hold (letter counters)",
    mPiece: "Cut-out piece: the artwork is kept, all its parts must hold together",
    interp: "Read artwork as:", iAuto: "Auto", iFill: "Filled shapes (united)", iCut: "Cut lines (even / odd)",
    pBridge: "Bridges", width: "Width (mm):", maxLen: "Max length (mm):", per: "Bridges per island:",
    orient: "Orientation:", oFree: "Shortest", oVert: "Vertical", oHorz: "Horizontal",
    direct: "Link each island to the shape around it (no bridge between two islands)",
    pOpt: "Options", outline: "Outline strokes (strokes are part of the artwork)",
    hide: "Hide the original (Object > Show All to see it again)",
    pAct: "Action", aApply: "Create and apply bridges (Pathfinder)",
    aPlace: "Only place bridges (rectangles to adjust, then \"Apply placed bridges\")",
    tip: "Tip: work on a copy of the file. The original is kept, hidden; the result goes on new layers.",
    analyse: "Analyze", applyPlaced: "Apply placed bridges", cancel: "Cancel", ok: "Create",
    badNum: "Enter a width and a maximum length greater than 0.",
    layRes: "Stencil – result", layBr: "Stencil – bridges",
    nothing: "No usable closed path in the selection.",
    ignored: "Ignored objects (images, symbols, meshes, open or unpainted paths…): {n}.",
    clipWarn: "Clipping masks found: check the result (or Pathfinder > Crop first).",
    pfFail: "The Pathfinder union failed; analysis done on raw paths.",
    rep: "{lec}\nContours: {c} — islands to link: {i}\nProposed bridges: {b} (length {min} to {max} mm)",
    repNone: "{lec}\nContours: {c} — no island: nothing to link.",
    lecFill: "Read as: united filled shapes.", lecCut: "Read as: cut lines (even / odd).",
    uncon: "Islands that cannot be linked (max length too short or forced orientation): {n} — circled in red.",
    placed: "{b} bridge(s) placed on layer \"{l}\" (non-printing).\nMove, widen, add or delete rectangles, then run the script again and click \"Apply placed bridges\".",
    applied: "{b} bridge(s) applied.",
    remain: "Check: islands left: {n}.",
    remainPiece: "Check: extra separate pieces: {n}.",
    undo: "Undo: Ctrl+Z / Cmd+Z (several times if needed, Pathfinder adds its own steps) or delete the \"Stencil – …\" layers then Object > Show All.",
    noPlaced: "No placed-bridges layer found (\"Stencil – bridges #…\").",
    noDesign: "The matching artwork (layer \"Stencil – result #…\") was not found.",
    noBridges: "The bridges layer contains no rectangle.",
    analyseTitle: "Analysis (nothing was changed)",
    island: "Unlinked island", bridge: "Bridge"
};

function PP_fill(s, o) { var k; for (k in o) s = s.split("{" + k + "}").join(o[k]); return s; }
function PP_num(n, d) { var s = n.toFixed(d); return PP_FR ? s.replace(".", ",") : s; }
function PP_parse(v) { var n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? -1 : n; }

var PP_MM = 72 / 25.4;
var PP_NOTE_DESIGN = "PP_DESIGN", PP_NOTE_BRIDGE = "PP_BRIDGE", PP_NOTE_MARK = "PP_MARK";

/* ===================================================================== */
/*  3. RÉGLAGES (fichier local) / SETTINGS (local file)                   */
/* ===================================================================== */

function PP_cfgFile() { return new File(Folder.userData + "/PontsPochoir.cfg"); }
function PP_loadCfg() {
    var c = { mode: "stencil", interp: "0", w: "1.5", maxLen: "15", per: "1", orient: "0", direct: "0", outline: "0", hide: "1", act: "apply" };
    try {
        var f = PP_cfgFile();
        if (f.exists && f.open("r")) {
            while (!f.eof) { var ln = f.readln(), p = ln.indexOf("="); if (p > 0) c[ln.substring(0, p)] = ln.substring(p + 1); }
            f.close();
        }
    } catch (e) {}
    return c;
}
function PP_saveCfg(c) {
    try { var f = PP_cfgFile(), k; if (f.open("w")) { for (k in c) if (k !== "action") f.writeln(k + "=" + c[k]); f.close(); } } catch (e) {}
}

/* ===================================================================== */
/*  4. DIALOGUE ScriptUI / DIALOG                                          */
/* ===================================================================== */

function PP_dialog(cfg) {
    var T = PP_T, res = null;
    var w = new Window("dialog", T.title);
    w.orientation = "column"; w.alignChildren = "fill";

    var p1 = w.add("panel", undefined, T.pType); p1.alignChildren = "left"; p1.margins = 12;
    var rbS = p1.add("radiobutton", undefined, T.mStencil), rbP = p1.add("radiobutton", undefined, T.mPiece);
    rbS.value = cfg.mode !== "piece"; rbP.value = cfg.mode === "piece";
    var gI = p1.add("group"); gI.add("statictext", undefined, T.interp);
    var ddI = gI.add("dropdownlist", undefined, [T.iAuto, T.iFill, T.iCut]); ddI.selection = parseInt(cfg.interp, 10) || 0;

    var p2 = w.add("panel", undefined, T.pBridge); p2.alignChildren = "left"; p2.margins = 12;
    var g1 = p2.add("group");
    g1.add("statictext", undefined, T.width); var eW = g1.add("edittext", undefined, cfg.w); eW.characters = 6;
    g1.add("statictext", undefined, T.maxLen); var eL = g1.add("edittext", undefined, cfg.maxLen); eL.characters = 6;
    var g2 = p2.add("group");
    g2.add("statictext", undefined, T.per); var ddP = g2.add("dropdownlist", undefined, ["1", "2"]); ddP.selection = cfg.per === "2" ? 1 : 0;
    g2.add("statictext", undefined, T.orient); var ddO = g2.add("dropdownlist", undefined, [T.oFree, T.oVert, T.oHorz]);
    ddO.selection = parseInt(cfg.orient, 10) || 0;
    var cbD = p2.add("checkbox", undefined, T.direct); cbD.value = cfg.direct === "1";

    var p3 = w.add("panel", undefined, T.pOpt); p3.alignChildren = "left"; p3.margins = 12;
    var cbO = p3.add("checkbox", undefined, T.outline); cbO.value = cfg.outline === "1";
    var cbH = p3.add("checkbox", undefined, T.hide); cbH.value = cfg.hide !== "0";

    var p4 = w.add("panel", undefined, T.pAct); p4.alignChildren = "left"; p4.margins = 12;
    var rbA = p4.add("radiobutton", undefined, T.aApply), rbL = p4.add("radiobutton", undefined, T.aPlace);
    rbA.value = cfg.act !== "place"; rbL.value = cfg.act === "place";

    var tip = w.add("statictext", undefined, T.tip, { multiline: true }); tip.preferredSize = [520, 34];

    function syncDirect() { cbD.enabled = rbS.value; }
    rbS.onClick = syncDirect; rbP.onClick = syncDirect; syncDirect();

    var gb = w.add("group"); gb.alignment = "right";
    var bAn = gb.add("button", undefined, T.analyse), bAp = gb.add("button", undefined, T.applyPlaced);
    var bC = gb.add("button", undefined, T.cancel, { name: "cancel" }), bOk = gb.add("button", undefined, T.ok, { name: "ok" });

    function collect(action) {
        var wv = PP_parse(eW.text), lv = PP_parse(eL.text);
        if (action !== "applyPlaced" && (wv <= 0 || lv <= 0)) { alert(T.badNum); return; }
        res = {
            mode: rbP.value ? "piece" : "stencil", interp: String(ddI.selection.index), w: String(wv), maxLen: String(lv),
            per: ddP.selection.index === 1 ? "2" : "1", orient: String(ddO.selection.index), direct: cbD.value ? "1" : "0",
            outline: cbO.value ? "1" : "0", hide: cbH.value ? "1" : "0", act: rbL.value ? "place" : "apply", action: action
        };
        w.close(1);
    }
    bAn.onClick = function () { collect("analyse"); };
    bAp.onClick = function () { collect("applyPlaced"); };
    bOk.onClick = function () { collect("create"); };
    bC.onClick = function () { res = null; w.close(0); };
    w.show();
    return res;
}

/* ===================================================================== */
/*  5. ILLUSTRATOR                                                        */
/* ===================================================================== */

function PP_color(doc, r, g, b, c, m, y, k) {
    var col;
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) { col = new CMYKColor(); col.cyan = c; col.magenta = m; col.yellow = y; col.black = k; }
    else { col = new RGBColor(); col.red = r; col.green = g; col.blue = b; }
    return col;
}

// Calque neuf au nom unique #n / new layer with a unique #n name
function PP_nextNumber(doc) {
    var i, n = 0;
    for (i = 0; i < doc.layers.length; i++) {
        var nm = doc.layers[i].name, p = nm.lastIndexOf("#");
        if (p > 0 && (nm.indexOf(PP_T.layRes) === 0 || nm.indexOf(PP_T.layBr) === 0)) {
            var v = parseInt(nm.substring(p + 1), 10); if (v > n) n = v;
        }
    }
    return n + 1;
}
function PP_newLayer(doc, name) { var L = doc.layers.add(); L.name = name; return L; }

// Parcourt récursivement / recursive walk
function PP_walk(it, fn) {
    fn(it);
    var ty = it.typename, i;
    if (ty === "GroupItem") { for (i = it.pageItems.length - 1; i >= 0; i--) PP_walk(it.pageItems[i], fn); }
}

function PP_paintOf(it) {
    var p = null;
    function grab(x) {
        if (p) return;
        if (x.typename === "PathItem") p = x;
        else if (x.typename === "CompoundPathItem" && x.pathItems.length) p = x.pathItems[0];
        else if (x.typename === "GroupItem") { var i; for (i = 0; i < x.pageItems.length && !p; i++) grab(x.pageItems[i]); }
    }
    grab(it);
    if (!p) return null;
    var o = { filled: p.filled, stroked: p.stroked };
    try { if (p.filled) o.fillColor = p.fillColor; } catch (e1) {}
    try { if (p.stroked) { o.strokeColor = p.strokeColor; o.strokeWidth = p.strokeWidth; } } catch (e2) {}
    return o;
}
function PP_setPaint(it, paint) {
    if (!paint) return;
    PP_eachPath(it, function (p) {
        try {
            p.filled = paint.filled; if (paint.filled && paint.fillColor) p.fillColor = paint.fillColor;
            p.stroked = paint.stroked; if (paint.stroked) { if (paint.strokeColor) p.strokeColor = paint.strokeColor; p.strokeWidth = paint.strokeWidth; }
        } catch (e) {}
    });
}
function PP_eachPath(it, fn) {
    var ty = it.typename, i;
    if (ty === "PathItem") fn(it);
    else if (ty === "CompoundPathItem") { for (i = 0; i < it.pathItems.length; i++) fn(it.pathItems[i]); }
    else if (ty === "GroupItem") { for (i = 0; i < it.pageItems.length; i++) PP_eachPath(it.pageItems[i], fn); }
}

// Polygones d'un objet / polygons of an item
function PP_polygons(it, wPt) {
    var out = [], maxSeg = Math.max(wPt / 2, 1), tol = Math.min(0.08, wPt / 40);
    PP_eachPath(it, function (p) {
        try {
            if (p.guides) return;
            var pp = p.pathPoints, n = pp.length, pts = [], i;
            if (n < 2) return;
            for (i = 0; i < n; i++) {
                var q = pp[i];
                pts.push([q.anchor[0], q.anchor[1], q.leftDirection[0], q.leftDirection[1], q.rightDirection[0], q.rightDirection[1]]);
            }
            var f = PP_CORE.flatten(pts, true, maxSeg, tol);
            if (f) { f.src = out.length; out.push(f); }
        } catch (e) {}
    });
    return out;
}

function PP_selectOnly(doc, it) { doc.selection = null; it.selected = true; }

/*
 * Prépare une copie unifiée du dessin sur le calque résultat.
 * Builds a unified copy of the artwork on the result layer.
 */
function PP_prepare(doc, items, opt, layer) {
    var info = { ignored: 0, clip: 0, cut: false, pfFail: false, design: null, paint: null };
    var grp = layer.groupItems.add(), i, anyFilled = false, anyPainted = false;
    for (i = 0; i < items.length; i++) {
        var it = items[i];
        try { if (it.locked || it.hidden) { info.ignored++; continue; } } catch (e0) {}
        try { it.duplicate(grp, ElementPlacement.PLACEATEND); } catch (e1) { info.ignored++; }
    }
    // Textes vectorisés, objets non vectoriels retirés / outline text, drop non-vector items
    var texts = [], drop = [];
    PP_walk(grp, function (x) {
        var ty = x.typename;
        if (ty === "TextFrame") texts.push(x);
        else if (ty === "GroupItem") { if (x.clipped) info.clip++; }
        else if (ty === "PathItem") {
            if (x.guides) drop.push(x);
            else if (!x.clipping && !x.filled && !x.stroked) drop.push(x);
            else if (x.filled) anyFilled = true;
            if (x.stroked || x.filled) anyPainted = true;
        } else if (ty === "CompoundPathItem") {
            if (x.pathItems.length && x.pathItems[0].filled) anyFilled = true;
            anyPainted = true;
        } else if (ty !== "GroupItem") drop.push(x);
    });
    for (i = 0; i < drop.length; i++) { try { drop[i].remove(); info.ignored++; } catch (e2) {} }
    for (i = 0; i < texts.length; i++) { try { texts[i].createOutline(); anyFilled = true; } catch (e3) { info.ignored++; } }

    // Lecture : auto = lignes de coupe si rien n'est rempli / auto = cut lines when nothing is filled
    info.cut = opt.interp === 2 || (opt.interp === 0 && !anyFilled && anyPainted);
    if (info.cut) {
        var open = [];
        PP_walk(grp, function (x) { if (x.typename === "PathItem" && !x.closed) open.push(x); });
        for (i = 0; i < open.length; i++) { try { open[i].remove(); info.ignored++; } catch (e4) {} }
    }
    info.paint = PP_paintOf(grp);

    if (opt.outline && !info.cut) {
        try { PP_selectOnly(doc, grp); app.executeMenuCommand("OffsetPath v22"); } catch (e5) {}
    }
    var before = grp;
    try {
        PP_selectOnly(doc, grp);
        if (info.cut) {
            app.executeMenuCommand("compoundPath");
        } else {
            app.executeMenuCommand("Live Pathfinder Add");
            app.executeMenuCommand("expandStyle");
        }
        if (doc.selection.length === 1) before = doc.selection[0];
        else if (doc.selection.length > 1) { app.executeMenuCommand("group"); if (doc.selection.length) before = doc.selection[0]; }
        else info.pfFail = true;
        if (!info.cut && before.typename === "GroupItem") {
            PP_selectOnly(doc, before); app.executeMenuCommand("compoundPath");
            if (doc.selection.length === 1) before = doc.selection[0];
        }
    } catch (e6) { info.pfFail = true; }
    if (info.cut) PP_eachPath(before, function (p) { try { p.evenodd = true; } catch (e7) {} });
    try { before.note = PP_NOTE_DESIGN + "|" + opt.mode; } catch (e8) {}
    info.design = before;
    doc.selection = null;
    return info;
}

// Pose les rectangles de ponts et les repères / draws bridge rectangles and markers
function PP_drawBridges(doc, layer, res) {
    var mag = PP_color(doc, 255, 0, 200, 0, 100, 0, 0), red = PP_color(doc, 230, 0, 0, 0, 100, 100, 0), out = [], i;
    for (i = 0; i < res.bridges.length; i++) {
        var b = res.bridges[i], p = layer.pathItems.add();
        p.setEntirePath(b.pts); p.closed = true;
        p.filled = true; p.fillColor = mag; p.stroked = false;
        p.name = PP_T.bridge + " " + (i + 1) + " (" + PP_num(b.len / PP_MM, 1) + " mm)";
        p.note = PP_NOTE_BRIDGE;
        out.push(p);
    }
    for (i = 0; i < res.unconnected.length; i++) {
        var bx = res.unconnected[i].box, pad = 4;
        var e = layer.pathItems.ellipse(bx[3] + pad, bx[0] - pad, bx[2] - bx[0] + 2 * pad, bx[3] - bx[1] + 2 * pad);
        e.filled = false; e.stroked = true; e.strokeColor = red; e.strokeWidth = 1.5;
        e.name = PP_T.island; e.note = PP_NOTE_MARK;
    }
    return out;
}

// Applique les ponts par Pathfinder / applies bridges with Pathfinder
function PP_apply(doc, design, bridges, mode) {
    var paint = PP_paintOf(design), layer = design.layer, i;
    var tmp = layer.groupItems.add();
    for (i = 0; i < bridges.length; i++) bridges[i].move(tmp, ElementPlacement.PLACEATBEGINNING);
    // Matière pleine le temps du calcul (lignes de coupe non remplies) / temporarily filled for Pathfinder
    PP_eachPath(design, function (p) { try { if (!p.filled) { p.filled = true; p.fillColor = PP_color(doc, 0, 0, 0, 0, 0, 0, 100); } } catch (e) {} });
    design.move(tmp, ElementPlacement.PLACEATEND);
    PP_selectOnly(doc, tmp);
    app.executeMenuCommand(mode === "piece" ? "Live Pathfinder Add" : "Live Pathfinder Subtract");
    app.executeMenuCommand("expandStyle");
    var r = doc.selection.length ? doc.selection[0] : null;
    if (doc.selection.length > 1) { app.executeMenuCommand("group"); r = doc.selection[0]; }
    if (r) { PP_setPaint(r, paint); try { r.note = PP_NOTE_DESIGN + "|" + mode + "|done"; } catch (e2) {} }
    return r;
}

function PP_report(res, info) {
    var T = PP_T, lines = [], lec = info.cut ? T.lecCut : T.lecFill, i, mn = Infinity, mx = 0;
    for (i = 0; i < res.bridges.length; i++) { if (res.bridges[i].len < mn) mn = res.bridges[i].len; if (res.bridges[i].len > mx) mx = res.bridges[i].len; }
    if (res.islands <= 0) lines.push(PP_fill(T.repNone, { lec: lec, c: res.contours }));
    else lines.push(PP_fill(T.rep, { lec: lec, c: res.contours, i: res.islands, b: res.bridges.length,
        min: res.bridges.length ? PP_num(mn / PP_MM, 1) : "–", max: res.bridges.length ? PP_num(mx / PP_MM, 1) : "–" }));
    if (res.unconnected.length) lines.push(PP_fill(T.uncon, { n: res.unconnected.length }));
    if (info.ignored) lines.push(PP_fill(T.ignored, { n: info.ignored }));
    if (info.clip) lines.push(T.clipWarn);
    if (info.pfFail) lines.push(T.pfFail);
    return lines.join("\n");
}

function PP_opts(cfg) {
    return { mode: cfg.mode === "piece" ? "piece" : "stencil", interp: parseInt(cfg.interp, 10) || 0,
             w: PP_parse(cfg.w) * PP_MM, maxLen: PP_parse(cfg.maxLen) * PP_MM, per: cfg.per === "2" ? 2 : 1,
             orient: parseInt(cfg.orient, 10) || 0, direct: cfg.direct === "1", outline: cfg.outline === "1",
             hide: cfg.hide !== "0", place: cfg.act === "place" };
}

// Analyse ou création / analysis or creation
function PP_run(doc, items, opt, dry) {
    var T = PP_T, num = PP_nextNumber(doc);
    var resLayer = PP_newLayer(doc, T.layRes + " #" + num);
    var info = PP_prepare(doc, items, opt, resLayer);
    var polys = PP_polygons(info.design, opt.w);
    if (!polys.length) { try { resLayer.remove(); } catch (e0) {} return T.nothing; }
    var res = PP_CORE.analyse(polys, opt);
    var txt = PP_report(res, info);
    if (dry) { try { resLayer.remove(); } catch (e1) {} return T.analyseTitle + "\n\n" + txt; }

    var i;
    if (opt.hide) for (i = 0; i < items.length; i++) { try { items[i].hidden = true; } catch (e2) {} }
    var brLayer = null, rects = [];
    if (res.bridges.length || res.unconnected.length) {
        brLayer = PP_newLayer(doc, T.layBr + " #" + num);
        brLayer.printable = false;
        rects = PP_drawBridges(doc, brLayer, res);
    }
    if (!opt.place && rects.length) {
        var r = PP_apply(doc, info.design, rects, opt.mode);
        txt += "\n" + PP_fill(T.applied, { b: rects.length });
        if (r) {
            var left = PP_CORE.countIslands(PP_polygons(r, opt.w), opt.mode);
            txt += "\n" + PP_fill(opt.mode === "piece" ? T.remainPiece : T.remain, { n: left });
            PP_selectOnly(doc, r);
        }
        if (brLayer && brLayer.pageItems.length === 0) { try { brLayer.remove(); } catch (e3) {} }
    } else if (rects.length) {
        txt += "\n" + PP_fill(T.placed, { b: rects.length, l: brLayer.name });
    }
    return txt + "\n\n" + T.undo;
}

// Applique les ponts posés lors d'une exécution précédente / applies bridges placed in a previous run
function PP_applyPlaced(doc, opt) {
    var T = PP_T, i, best = -1, brLayer = null, resLayer = null;
    for (i = 0; i < doc.layers.length; i++) {
        var nm = doc.layers[i].name, p = nm.lastIndexOf("#");
        if (nm.indexOf(T.layBr) === 0 && p > 0) { var v = parseInt(nm.substring(p + 1), 10); if (v > best) { best = v; brLayer = doc.layers[i]; } }
    }
    if (!brLayer) return T.noPlaced;
    for (i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === T.layRes + " #" + best) resLayer = doc.layers[i];
    if (!resLayer) return T.noDesign;
    var design = null, mode = opt.mode;
    for (i = 0; i < resLayer.pageItems.length; i++) {
        var it = resLayer.pageItems[i], note = "";
        try { note = it.note; } catch (e0) {}
        if (note && note.indexOf(PP_NOTE_DESIGN) === 0) { design = it; var parts = note.split("|"); if (parts[1]) mode = parts[1]; break; }
    }
    if (!design) return T.noDesign;
    resLayer.locked = false; resLayer.visible = true; brLayer.locked = false; brLayer.visible = true;
    var rects = [];
    for (i = 0; i < brLayer.pageItems.length; i++) {
        var b = brLayer.pageItems[i], n2 = "";
        try { n2 = b.note; } catch (e1) {}
        if (n2 === PP_NOTE_MARK) continue;
        if ((b.typename === "PathItem" && b.closed) || b.typename === "CompoundPathItem") rects.push(b);
    }
    if (!rects.length) return T.noBridges;
    var r = PP_apply(doc, design, rects, mode), txt = PP_fill(T.applied, { b: rects.length });
    if (r) {
        txt += "\n" + PP_fill(mode === "piece" ? T.remainPiece : T.remain, { n: PP_CORE.countIslands(PP_polygons(r, opt.w || 4), mode) });
        PP_selectOnly(doc, r);
    }
    if (brLayer.pageItems.length === 0) { try { brLayer.remove(); } catch (e2) {} }
    return txt + "\n\n" + T.undo;
}

function PP_main() {
    var T = PP_T;
    if (app.documents.length === 0) { alert(T.noDoc); return; }
    var doc = app.activeDocument, cfg = PP_loadCfg(), items = [], i;
    var sel = doc.selection;
    if (sel && sel.length) for (i = 0; i < sel.length; i++) items.push(sel[i]);
    while (true) {
        var r = PP_dialog(cfg);
        if (!r) return;
        cfg = r; PP_saveCfg(cfg);
        var opt = PP_opts(cfg);
        if (r.action === "applyPlaced") { alert(PP_applyPlaced(doc, opt)); return; }
        if (!items.length) { alert(T.noSel); return; }
        if (r.action === "analyse") {
            alert(PP_run(doc, items, opt, true));
            doc.selection = null; for (i = 0; i < items.length; i++) { try { items[i].selected = true; } catch (e) {} }
            continue;
        }
        alert(PP_run(doc, items, opt, false));
        return;
    }
}

if (typeof app !== "undefined" && typeof PP_NO_MAIN === "undefined") {
    try { PP_main(); } catch (err) { alert((PP_FR ? "Erreur : " : "Error: ") + err + (err.line ? " (ligne " + err.line + ")" : "")); }
}
