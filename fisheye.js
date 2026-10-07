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
    uniform vec2 u_texSize;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Map screen UV through a convex sphere (fisheye / security-mirror look)
    vec2 fisheyeUV(vec2 uv, out float mask, out float rim) {
      vec2 p = uv * 2.0 - 1.0;
      // Wide horizontal oval
      p.x *= 1.12;
      p.y *= 1.48;

      float r = length(p);
      mask = smoothstep(1.02, 0.97, r);
      rim = smoothstep(0.86, 1.0, r) * mask;

      if (r > 1.05) {
        return vec2(-1.0);
      }

      // Barrel / dome: center magnifies, rim compresses
      float z = sqrt(max(1.0 - r * r, 0.0));
      float k = 1.0 / (0.55 + z * 0.9);
      vec2 warped = p * k * 0.38;

      vec2 tex;
      tex.x = warped.x + 0.5 + u_scroll;
      // Keep text band tall and centered in the lens
      tex.y = clamp(warped.y * 0.85 + 0.5, 0.02, 0.98);
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
      p.x *= 1.15;
      p.y *= 1.55;
      float r = length(p);
      float z = sqrt(max(1.0 - r * r, 0.0));

      // LED grid denser toward rim
      float cellScale = mix(78.0, 38.0, z);
      vec2 gridUV = uv * u_res / u_res.y;
      vec2 cell = fract(gridUV * cellScale);
      float led = smoothstep(0.48, 0.18, length(cell - 0.5));

      // Sample scrolling text (manual wrap — texture is CLAMP)
      vec2 sampleUV = vec2(fract(tuv.x), tuv.y);
      vec4 src = texture2D(u_tex, sampleUV);
      float lit = clamp(max(src.r, max(src.g, src.b)) * 1.5, 0.0, 1.0);

      vec3 amberCore = vec3(1.0, 0.95, 0.62);
      vec3 amberGlow = vec3(1.0, 0.52, 0.05);

      // Base unlit matrix
      vec3 col = vec3(0.09, 0.07, 0.04) * led;

      // Lit LEDs + bloom
      col += mix(amberGlow, amberCore, lit) * lit * mix(0.35, 1.0, led) * 1.8;
      col += amberGlow * lit * 0.55; // soft bloom bleed past grid

      // Glass speculars on the dome
      vec2 hl = p - vec2(-0.15, -0.55);
      float spec1 = pow(max(1.0 - length(hl) * 1.1, 0.0), 6.0) * 0.2;
      vec2 hl2 = p - vec2(0.35, 0.4);
      float spec2 = pow(max(1.0 - length(hl2) * 1.4, 0.0), 8.0) * 0.08;
      col += vec3(spec1 + spec2);

      // Inner rim light catch
      col += vec3(0.4, 0.22, 0.05) * rim * (0.12 + lit * 0.55);

      // Fine grain
      float g = (hash(uv * u_res + u_time * 40.0) - 0.5) * 0.05;
      col += g;

      // Vignette inside the dome
      col *= mix(1.0, 0.78, smoothstep(0.4, 1.0, r));

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
    const phrase = `${text}   ${text}   ${text}   `;

    ctx.font = '700 160px "Courier New", Courier, monospace';
    const tw = Math.ceil(ctx.measureText(phrase).width) + 64;
    // WebGL1 needs POT for reliable sampling
    canvas.width = nextPow2(Math.max(2048, tw));
    canvas.height = 256;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = '700 160px "Courier New", Courier, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 22;
    ctx.fillText(phrase, 32, h / 2 + 6);
    ctx.shadowBlur = 0;
    ctx.fillText(phrase, 32, h / 2 + 6);

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
      <radialGradient id="bezelGrad" cx="50%" cy="42%" r="55%">
        <stop offset="0%" stop-color="#2a2a2a"/>
        <stop offset="70%" stop-color="#111"/>
        <stop offset="100%" stop-color="#050505"/>
      </radialGradient>
      <linearGradient id="topHighlight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="lensClip">
        <ellipse cx="500" cy="310" rx="455" ry="268"/>
      </clipPath>
    `;
    svg.appendChild(defs);

    // Ring frame only — inner hole stays transparent so the canvas shows through
    const ring = document.createElementNS(ns, 'path');
    ring.setAttribute(
      'd',
      'M500,10 A490,300 0 1,0 500,610 A490,300 0 1,0 500,10 Z M500,42 A455,268 0 1,1 500,578 A455,268 0 1,1 500,42 Z'
    );
    ring.setAttribute('fill', 'url(#bezelGrad)');
    ring.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(ring);

    // Inner lip
    const inner = document.createElementNS(ns, 'ellipse');
    inner.setAttribute('cx', '500');
    inner.setAttribute('cy', '310');
    inner.setAttribute('rx', '455');
    inner.setAttribute('ry', '268');
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', '#1a1a1a');
    inner.setAttribute('stroke-width', '6');
    svg.appendChild(inner);

    // Top specular arc
    const hi = document.createElementNS(ns, 'ellipse');
    hi.setAttribute('cx', '500');
    hi.setAttribute('cy', '310');
    hi.setAttribute('rx', '455');
    hi.setAttribute('ry', '268');
    hi.setAttribute('fill', 'none');
    hi.setAttribute('stroke', 'url(#topHighlight)');
    hi.setAttribute('stroke-width', '10');
    hi.setAttribute('opacity', '0.7');
    svg.appendChild(hi);

    // Rivets around perimeter
    const rivetCount = 18;
    for (let i = 0; i < rivetCount; i++) {
      const t = (i / rivetCount) * Math.PI * 2;
      const rx = 472;
      const ry = 284;
      const x = 500 + Math.cos(t) * rx;
      const y = 310 + Math.sin(t) * ry;
      const g = document.createElementNS(ns, 'g');
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', '5.5');
      c.setAttribute('fill', '#3a3a3a');
      c.setAttribute('stroke', '#777');
      c.setAttribute('stroke-width', '1.2');
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(x - 1.2));
      dot.setAttribute('cy', String(y - 1.2));
      dot.setAttribute('r', '1.6');
      dot.setAttribute('fill', '#bbb');
      g.appendChild(c);
      g.appendChild(dot);
      svg.appendChild(g);
    }

    // Thin glass scratch lines
    const scratches = document.createElementNS(ns, 'g');
    scratches.setAttribute('clip-path', 'url(#lensClip)');
    scratches.setAttribute('opacity', '0.12');
    scratches.innerHTML = `
      <line x1="220" y1="420" x2="780" y2="390" stroke="#fff" stroke-width="1"/>
      <line x1="260" y1="450" x2="740" y2="430" stroke="#fff" stroke-width="0.7"/>
    `;
    svg.appendChild(scratches);

    return svg;
  }

  window.startFisheye = function startFisheye(options = {}) {
    const root = document.getElementById(options.rootId || 'fisheyeStage');
    if (!root) return;

    const text = options.text || 'JOIN NOW TV';
    const canvas = document.createElement('canvas');
    canvas.className = 'fisheye-canvas';
    root.appendChild(canvas);

    const bezel = createBezelSVG();
    root.appendChild(bezel);

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
      u_texSize: gl.getUniformLocation(program, 'u_texSize'),
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
    gl.uniform2f(uniforms.u_texSize, marquee.width, marquee.height);

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
      scroll -= 0.12 * (1 / 60); // marquee speed
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

    root.classList.add('is-active');

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  };
})();
