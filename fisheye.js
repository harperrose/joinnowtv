(() => {
  const VERT = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const FRAG = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform vec2 u_res;
    uniform float u_time;
    uniform float u_scroll;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    vec2 fisheyeUV(vec2 uv, out float mask, out float rim) {
      vec2 p = uv * 2.0 - 1.0;
      p.x *= 1.12;
      p.y *= 1.48;

      float r = length(p);
      mask = smoothstep(1.02, 0.97, r);
      rim = smoothstep(0.84, 1.0, r) * mask;

      if (r > 1.05) {
        return vec2(-1.0);
      }

      float z = sqrt(max(1.0 - r * r, 0.0));
      float k = 1.0 / (0.55 + z * 0.9);
      vec2 warped = p * k;

      vec2 tex;
      // Wider horizontal sample — glyphs stay readable when dome stretches up
      tex.x = warped.x * 0.22 + 0.5 + u_scroll;
      tex.y = clamp(warped.y * 0.48 + 0.5, 0.08, 0.92);
      return tex;
    }

    void main() {
      vec2 uv = v_uv;
      float mask;
      float rim;
      vec2 tuv = fisheyeUV(uv, mask, rim);

      if (mask <= 0.001) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec2 p = uv * 2.0 - 1.0;
      p.x *= 1.12;
      p.y *= 1.48;
      float r = length(p);
      float z = sqrt(max(1.0 - r * r, 0.0));

      float cellScale = mix(72.0, 36.0, z);
      vec2 gridUV = uv * u_res / u_res.y;
      vec2 cell = fract(gridUV * cellScale);
      float led = smoothstep(0.48, 0.16, length(cell - 0.5));

      vec2 sampleUV = vec2(fract(tuv.x), tuv.y);
      vec4 src = texture2D(u_tex, sampleUV);
      float lit = clamp(max(src.r, max(src.g, src.b)) * 1.55, 0.0, 1.0);

      vec3 amberCore = vec3(1.0, 0.96, 0.7);
      vec3 amberGlow = vec3(1.0, 0.55, 0.12);

      // Cool glass-tinted matrix under the LEDs
      vec3 col = vec3(0.08, 0.09, 0.11) * led;
      col += mix(amberGlow, amberCore, lit) * lit * mix(0.4, 1.0, led) * 1.85;
      col += amberGlow * lit * 0.5;

      // Apple-glass specular sheet across the dome
      float sheet = pow(max(1.0 - abs(p.y + 0.15) * 1.4, 0.0), 3.0) * 0.16;
      sheet *= smoothstep(1.0, 0.2, r);
      vec2 hl = p - vec2(-0.25, -0.55);
      float spec1 = pow(max(1.0 - length(hl) * 1.05, 0.0), 5.0) * 0.28;
      vec2 hl2 = p - vec2(0.4, 0.35);
      float spec2 = pow(max(1.0 - length(hl2) * 1.5, 0.0), 8.0) * 0.1;
      col += vec3(0.85, 0.9, 1.0) * (sheet + spec1 + spec2);

      // Soft frosted rim
      col += vec3(0.75, 0.82, 0.95) * rim * 0.22;
      col += vec3(0.45, 0.25, 0.08) * rim * lit * 0.35;

      float g = (hash(uv * u_res + u_time * 30.0) - 0.5) * 0.035;
      col += g;
      col *= mix(1.0, 0.82, smoothstep(0.45, 1.0, r));

      gl_FragColor = vec4(col, mask);
    }
  `;

  function createShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  function createProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p));
    }
    return p;
  }

  function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  function buildMarqueeTexture(text) {
    const canvas = document.createElement('canvas');
    const h = 256;
    const ctx = canvas.getContext('2d');
    const phrase = `${text}      ${text}      ${text}      `;

    ctx.font = '700 110px "Courier New", Courier, monospace';
    const tw = Math.ceil(ctx.measureText(phrase).width) + 80;
    // Extra width so stretched-up glyphs stay thick enough to read
    canvas.width = nextPow2(Math.max(4096, Math.ceil(tw * 1.85)));
    canvas.height = 256;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(48, h / 2);
    // Wider + shorter letterforms → survive vertical fisheye stretch
    ctx.scale(1.85, 0.62);
    ctx.font = '700 110px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 16;
    ctx.fillText(phrase, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillText(phrase, 0, 0);
    ctx.restore();

    return canvas;
  }

  function createBezelSVG() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 1000 620');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.classList.add('fisheye-bezel');

    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `
      <linearGradient id="glassRing" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="35%" stop-color="#dfe7f5" stop-opacity="0.22"/>
        <stop offset="70%" stop-color="#8a94a8" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.3"/>
      </linearGradient>
      <linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.7"/>
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.45"/>
      </linearGradient>
      <clipPath id="lensClip">
        <ellipse cx="500" cy="310" rx="455" ry="268"/>
      </clipPath>
    `;
    svg.appendChild(defs);

    // Frosted glass ring (apple-glass frame)
    const ring = document.createElementNS(ns, 'path');
    ring.setAttribute(
      'd',
      'M500,10 A490,300 0 1,0 500,610 A490,300 0 1,0 500,10 Z M500,42 A455,268 0 1,1 500,578 A455,268 0 1,1 500,42 Z'
    );
    ring.setAttribute('fill', 'url(#glassRing)');
    ring.setAttribute('fill-rule', 'evenodd');
    ring.setAttribute('opacity', '0.92');
    svg.appendChild(ring);

    const inner = document.createElementNS(ns, 'ellipse');
    inner.setAttribute('cx', '500');
    inner.setAttribute('cy', '310');
    inner.setAttribute('rx', '455');
    inner.setAttribute('ry', '268');
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', 'url(#glassEdge)');
    inner.setAttribute('stroke-width', '3.5');
    svg.appendChild(inner);

    const outer = document.createElementNS(ns, 'ellipse');
    outer.setAttribute('cx', '500');
    outer.setAttribute('cy', '310');
    outer.setAttribute('rx', '490');
    outer.setAttribute('ry', '300');
    outer.setAttribute('fill', 'none');
    outer.setAttribute('stroke', 'rgba(255,255,255,0.35)');
    outer.setAttribute('stroke-width', '2');
    svg.appendChild(outer);

    // Soft rivet-like glass dots
    const rivetCount = 16;
    for (let i = 0; i < rivetCount; i++) {
      const t = (i / rivetCount) * Math.PI * 2;
      const x = 500 + Math.cos(t) * 472;
      const y = 310 + Math.sin(t) * 284;
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', '4.2');
      c.setAttribute('fill', 'rgba(255,255,255,0.45)');
      c.setAttribute('stroke', 'rgba(255,255,255,0.65)');
      c.setAttribute('stroke-width', '1');
      svg.appendChild(c);
    }

    return svg;
  }

  function createGlassOverlay() {
    const el = document.createElement('div');
    el.className = 'fisheye-glass';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  window.startFisheye = function startFisheye(options = {}) {
    const root = document.getElementById(options.rootId || 'fisheyeStage');
    if (!root) return;

    const text = options.text || 'JOIN NOW TV';
    root.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.className = 'fisheye-canvas';
    root.appendChild(canvas);
    root.appendChild(createGlassOverlay());
    root.appendChild(createBezelSVG());

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      root.classList.add('is-fallback');
      root.textContent = text;
      return;
    }

    const program = createProgram(gl, VERT, FRAG);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      u_tex: gl.getUniformLocation(program, 'u_tex'),
      u_res: gl.getUniformLocation(program, 'u_res'),
      u_time: gl.getUniformLocation(program, 'u_time'),
      u_scroll: gl.getUniformLocation(program, 'u_scroll'),
    };

    const marquee = buildMarqueeTexture(text);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, marquee);
    gl.uniform1i(uniforms.u_tex, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uniforms.u_res, w, h);
    }

    let scroll = 0;
    let raf = 0;
    const t0 = performance.now();

    function frame(now) {
      resize();
      const t = (now - t0) / 1000;
      scroll -= 0.1 * (1 / 60);
      gl.uniform1f(uniforms.u_time, t);
      gl.uniform1f(uniforms.u_scroll, scroll);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(frame);
    requestAnimationFrame(() => root.classList.add('is-active'));

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  };
})();
