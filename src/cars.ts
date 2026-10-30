/** Little isometric cars on the ring road. True 3D boxes projected with the scene's
 *  oblique camera (ground y is squashed by 0.5), so they turn correctly through every curve. */
const NS = 'http://www.w3.org/2000/svg';
type V = [number, number];
const C = { x: 506, y: 356 }, R = { x: 186, y: 86 };
const LIGHT: V = [-0.55, 0.83];

interface Car { g: SVGGElement; polys: SVGPolygonElement[]; lights: SVGCircleElement[]; tail: SVGCircleElement[]; shadow: SVGEllipseElement; a: number; v: number; lane: number; color: string }
const COLORS = ['#f2c14e', '#f4f1ea', '#6f9be8', '#e2745f', '#7fc8a9'];

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function mountCars(root: SVGGElement, count = 5) {
  const cars: Car[] = [];
  for (let i = 0; i < count; i++) {
    const g = document.createElementNS(NS, 'g') as SVGGElement;
    const shadow = document.createElementNS(NS, 'ellipse') as SVGEllipseElement;
    shadow.setAttribute('fill', '#2a2040'); shadow.setAttribute('opacity', '.22'); g.appendChild(shadow);
    const polys = Array.from({ length: 9 }, () => { const p = document.createElementNS(NS, 'polygon') as SVGPolygonElement; p.setAttribute('stroke-linejoin', 'round'); g.appendChild(p); return p; });
    const mk = (fill: string, r: number) => { const c = document.createElementNS(NS, 'circle') as SVGCircleElement; c.setAttribute('r', String(r)); c.setAttribute('fill', fill); c.classList.add('carlight'); g.appendChild(c); return c; };
    const lights = [mk('url(#headlight)', 9), mk('url(#headlight)', 9)];
    const tail = [mk('#ff5a5a', 0.9), mk('#ff5a5a', 0.9)];
    root.appendChild(g);
    const dir = i % 2 ? -1 : 1;
    cars.push({ g, polys, lights, tail, shadow, a: (i / count) * Math.PI * 2, v: dir * (0.22 + (i % 3) * 0.04), lane: dir > 0 ? 7 : -7, color: COLORS[i % COLORS.length] });
  }
  return {
    step(dt: number) { for (const c of cars) { c.a = (c.a + c.v * dt) % (Math.PI * 2); draw(c); } },
    draw() { cars.forEach(draw); },
  };
}

function draw(c: Car) {
  // position on the ellipse in ground space (y doubled), with a lane offset along the normal
  const ca = Math.cos(c.a), sa = Math.sin(c.a);
  const gx = C.x + (R.x + c.lane) * ca, gy = 2 * C.y + 2 * (R.y + c.lane / 2) * sa;
  let fx = -(R.x) * sa * Math.sign(c.v), fy = 2 * R.y * ca * Math.sign(c.v);
  const L = Math.hypot(fx, fy); fx /= L; fy /= L;
  const sx = -fy, sy = fx; // side axis
  const P = (f: number, s: number, h: number): V => [gx + fx * f + sx * s, (gy + fy * f + sy * s) / 2 - h];
  const pts = (a: V[]) => a.map((p) => p.join(',')).join(' ');
  type Face = { p: V[]; n: V | null; col: string; z: number };
  const box = (f0: number, f1: number, w: number, h0: number, h1: number, col: string, glass = false): Face[] => {
    const corners = [[f0, -w], [f1, -w], [f1, w], [f0, w]] as V[];
    const faces: Face[] = [];
    for (let i = 0; i < 4; i++) {
      const [a, b] = [corners[i], corners[(i + 1) % 4]];
      const mf = (a[0] + b[0]) / 2, ms = (a[1] + b[1]) / 2;
      const nlen = Math.hypot(mf, ms) || 1;
      const nx = (fx * mf + sx * ms) / nlen, ny = (fy * mf + sy * ms) / nlen; // outward normal (ground)
      if (ny <= 0.02) continue; // faces pointing away from camera
      const k = 0.72 + 0.28 * (nx * LIGHT[0] + ny * LIGHT[1]);
      faces.push({ p: [P(a[0], a[1], h0), P(b[0], b[1], h0), P(b[0], b[1], h1), P(a[0], a[1], h1)], n: [nx, ny], col: glass ? shade('#2b3150', k + 0.2) : shade(col, k), z: ny });
    }
    faces.sort((x, y) => x.z - y.z);
    faces.push({ p: corners.map(([f, s]) => P(f, s, h1)), n: null, col: glass ? '#3a4266' : shade(col, 1.08), z: 9 });
    return faces;
  };
  const faces = [...box(-7, 7, 3.4, 0.8, 3.6, c.color), ...box(-3.6, 2.6, 2.8, 3.6, 6, c.color, true)];
  c.polys.forEach((p, i) => {
    const f = faces[i];
    if (!f) { p.setAttribute('points', ''); return; }
    p.setAttribute('points', pts(f.p)); p.setAttribute('fill', f.col);
    p.setAttribute('stroke', 'rgba(30,20,50,.25)'); p.setAttribute('stroke-width', '.35');
  });
  const [shx, shy] = P(0, 0, -0.6);
  c.shadow.setAttribute('cx', String(shx + 1.5)); c.shadow.setAttribute('cy', String(shy + 1));
  c.shadow.setAttribute('rx', '9'); c.shadow.setAttribute('ry', '4.2');
  const front = [P(7.2, -2.2, 2), P(7.2, 2.2, 2)], back = [P(-7.2, -2.4, 2.4), P(-7.2, 2.4, 2.4)];
  c.lights.forEach((l, i) => { const [x, y] = P(12, (i ? 1 : -1) * 2.4, 1); l.setAttribute('cx', String(x)); l.setAttribute('cy', String(y)); });
  c.tail.forEach((l, i) => { l.setAttribute('cx', String(back[i][0])); l.setAttribute('cy', String(back[i][1])); l.style.display = fy < 0 ? '' : 'none'; });
  void front;
}
