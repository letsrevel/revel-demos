// Rope choreography for s3-care (39.271 – 57.124 s): "Some rooms need care" + the questionnaire gate.
//
// One strand. It enters from the left (s2's rope has left right by 39.3), runs along the floor toward the
// workshop door, and — on the questions — ties an overhand knot (trefoil) that tightens with each answer.
// The knot is drawn as ONE strand with z, so the 3D renderer can lift the three crossings over/under.
// At 56.3 the camera whips right; at 56.72 ONE straight rope [[-200,540],[2120,540]] with camera {960,540,1,0}.
//
// Shared with compositions/s3-care.html through window.S3 (timing constants, camera, door position).
(function () {
  const F = FILM, { clamp, lerp, prog, E } = F;
  const FROM = 39.271, TO = 57.124;

  // ---- the beats (film seconds, all from data/timing.json via FILM.wordAt)
  // word indexes per language (never English words in lookups); EN values reproduce the original beats exactly
  const lang = F.T.lang === 'de' ? 'de' : 'en';
  const IX = { en: { vienna: 5, experience: 1, consent: 3, why: 6 }, de: { vienna: 4, experience: 1, consent: 4, why: 6 } }[lang];
  const T = {
    from: FROM,
    vienna: F.wordAt('v11', IX.vienna),
    experience: F.wordAt('v13', IX.experience),
    consent: F.wordAt('v13', IX.consent),
    why: F.wordAt('v13', IX.why),
    f8end: 45.8,            // end of frame 8
    knot0: 46.0,            // the knot starts to form
    whip0: 56.30, whipMid: 56.52, seam: 56.724,
  };
  T.typeOut = Math.max(T.f8end, F.line('v11').end + 0.15) + 0.05;   // the type clears after v11 has finished
  // answers (picked / ticked / typed) — each lands just after its spoken phrase begins
  T.pick1 = T.experience + 0.42;     // first answer
  T.card2 = T.consent - 0.18;        // question 2 rises to the front
  T.pick2 = T.consent + 0.95;        // tick
  T.card3 = T.why - 0.2;             // question 3 rises to the front
  T.type0 = T.why + 0.55; T.type1 = T.type0 + 1.75;
  T.submit = T.type1 + 0.35;
  window.S3 = { T };

  // ---- world geometry
  const DOOR = { x: 1420, y: 590 };          // the workshop door (event card centre, practical light)
  const KNOT = { x: 560, y: 770 };            // where the knot is tied
  window.S3.DOOR = DOOR; window.S3.KNOT = KNOT;
  const W_ROPE = 20;

  // the quiet path: from far left, over the floor, to the foot of the door
  const SCTRL = [[-760, 800], [-300, 790], [120, 730], [KNOT.x, 670], [900, 650], [1130, 780], [1300, 905], [1420, 945]];
  const N = 360;

  function resampleN(pts3, n) {
    const m = F.measure(pts3), out = [];
    for (let i = 0; i < n; i++) { const p = F.pointAt(m, m.L * i / (n - 1)); out.push([p.x, p.y, p.z]); }
    return out;
  }
  const STRAIGHT = resampleN(F.spline(SCTRL, 14).map(p => [p[0], p[1], 0]), N);

  // Overhand knot = the trefoil diagram P(u) = (sin u + 2 sin 2u, cos u - 2 cos 2u), z = -A sin 3u (alternating
  // over/under at its three crossings). It is "cut open" at the crossing on its symmetry axis (cos u = -1/4,
  // i.e. u = +-104.48 deg) and traversed with u decreasing from +255.52 deg to -255.52 deg: the lead enters that
  // crossing from the lower left, the tail leaves it to the lower right, and the two end strands cross there
  // (one over, one under) exactly as the free ends of a real overhand knot do.
  // f (0..1) scales the knot out of the line, k tightens it.
  const UC = Math.acos(-0.25), U_START = 2 * Math.PI - UC, U_END = -(2 * Math.PI - UC);
  const sm = x => x * x * (3 - 2 * x);
  function knotPts(f, k) {
    const s = lerp(70, 46, k) * Math.max(f, 0.001), A = 15 * f;
    const px = u => Math.sin(u) + 2 * Math.sin(2 * u), py = u => Math.cos(u) - 2 * Math.cos(2 * u);
    const Pk = KNOT, y0 = py(U_START);
    const core = [], zc = [];
    for (let i = 0; i <= 200; i++) {
      const u = lerp(U_START, U_END, i / 200);
      core.push([Pk.x + px(u) * s, Pk.y + (py(u) - y0) * s]); zc.push((1 - Math.sin(3 * u)) * A);
    }
    const nrm = v => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
    const dL = nrm([lerp(1, 0.79, f), lerp(0, -0.61, f)]), dT = nrm([lerp(1, 0.79, f), lerp(0, 0.61, f)]);
    const hl = 230, Ly = Pk.y + 90 * f;
    const lead = F.spline([[-760, Ly + 20], [-300, Ly + 30], [Pk.x - dL[0] * hl, Pk.y - dL[1] * hl], [Pk.x, Pk.y]], 24);
    const tail = F.spline([[Pk.x, Pk.y], [Pk.x + dT[0] * hl, Pk.y + dT[1] * hl], [1000, 850], [1200, 880], [1320, 915], [1420, 945]], 24);
    lead.pop(); tail.shift();
    const lz = zc[0], tz = zc[zc.length - 1];
    const lm = F.measure(lead);
    const all = [
      ...lead.map((p, i) => [p[0], p[1], lz * sm(clamp((lm.cum[i] / lm.L - 0.55) / 0.45))]),
      ...core.map((p, i) => [p[0], p[1], zc[i]]),
      ...tail.map((p, i) => [p[0], p[1], tz * (1 - sm(clamp(i / (tail.length * 0.3))))]),
    ];
    return resampleN(all, N);
  }

  // how formed the knot is (0 straight rope … 1 knot) and how tight (0 loose … 1 cinched)
  const formed = t => E.inOutCubic(prog(T.knot0, T.knot0 + 1.5, t));
  const tight = t => clamp(0.1 + 0.3 * E.outBack(prog(T.pick1, T.pick1 + 0.6, t), 2.2) + 0.28 * E.outBack(prog(T.pick2, T.pick2 + 0.6, t), 2.2)
    + 0.26 * E.outBack(prog(T.submit, T.submit + 0.6, t), 2.2), 0, 1);

  // ---- camera
  const CAM8a = { x: 330, y: 650, zoom: 1.0 }, CAM8b = { x: 1150, y: 600, zoom: 1.2 }, REST = { x: 960, y: 540, zoom: 1 };
  function camera(t) {
    // after the whip passes the door the camera returns from the left to exactly {960,540,1,0}
    if (t >= T.whipMid) {
      const u = E.outCubic(prog(T.whipMid, T.seam, t));
      return { x: lerp(-1500, 960, u), y: 540, zoom: 1, rot: 0 };
    }
    if (t >= T.whip0) {
      const u = E.inCubic(prog(T.whip0, T.whipMid, t));
      const base = camRest(T.whip0);
      return { x: lerp(base.x, 3200, u), y: lerp(base.y, 540, u), zoom: lerp(base.zoom, 1, u), rot: 0 };
    }
    return camRest(t);
  }
  function camRest(t) {
    if (t < T.f8end) {
      const u = E.inOutSine(prog(FROM, T.f8end, t));
      const sway = Math.sin((t - FROM) * 0.9) * 0.004;
      return { x: lerp(CAM8a.x, CAM8b.x, u), y: lerp(CAM8a.y, CAM8b.y, u) + Math.sin((t - FROM) * 0.7) * 6, zoom: lerp(CAM8a.zoom, CAM8b.zoom, u), rot: sway };
    }
    const pull = E.inOutCubic(prog(T.f8end, T.f8end + 1.9, t));
    const d = prog(T.f8end + 1.9, T.whip0, t);
    const sway = Math.sin((t - FROM) * 0.9) * 0.004 * (1 - pull);
    return {
      x: lerp(CAM8b.x, REST.x, pull) + d * 22, y: lerp(CAM8b.y, REST.y, pull),
      zoom: lerp(CAM8b.zoom, REST.zoom, pull) + d * 0.035, rot: sway,
    };
  }
  window.S3.camera = camera;

  FILM.rope.section({
    id: 's3-care', from: FROM, to: TO,
    camera,
    frame(t) {
      const dusk = E.inOutSine(prog(FROM, FROM + 1.4, t));
      const lamp = E.inOutSine(prog(40.2, 43.6, t)) * (1 - 0.15 * prog(T.f8end, 55, t));
      // before the whip the world shows the knotted rope; after the camera has jumped, the straight seam rope
      const env = { surface: 'night', surfaceMix: 1 /* straight to night: s2 hands over on plum; a mix from the table default flashed pale */, practical: { x: DOOR.x, y: DOOR.y, color: FILM.C.amber, intensity: lamp } };
      if (t >= T.whipMid) {
        const lift = E.inOutSine(prog(T.whipMid, T.seam, t));
        return { env, strands: [{ pts: [[-200, 540, 0], [2120, 540, 0]], w: 18, from: 0, to: 1, colA: FILM.C.purple, colB: FILM.C.crimson, smooth: false }] };
      }
      const f = formed(t), k = tight(t);
      
      const pts = knotPts(f, k);
      // the rope runs out from the left alongside the camera, then rests
      const head = lerp(0.2, 1, E.inOutSine(prog(FROM + 0.1, 44.6, t)));
      return { env, strands: [{ pts, w: W_ROPE, from: 0, to: head, colA: FILM.C.purple, colB: FILM.C.crimson, smooth: true }] };
    },
  });
})();
