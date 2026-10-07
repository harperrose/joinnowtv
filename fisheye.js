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

    // Oval touches top/bottom of the viewport; wide enough to fill sides too
    vec2 fisheyeUV(vec2 uv, out float mask) {
      vec2 p = uv * 2.0 - 1.0;
      float aspect = u_res.x / max(u_res.y, 1.0);
      // Vertical: full height. Horizontal: scale so oval reaches left/right on typical screens
      p.x *= max(aspect * 0.42, 0.55);
      p.y *= 0.98;

      float r = length(p);
      mask = smoothstep(1.02, 0.985, r);

      if (r > 1.05) {
        return vec2(-1.0);
      }

      float z = sqrt(max(1.0 - r * r, 0.0));
      float k = 1.0 / (0.42 + z * 0.95);
      vec2 warped = p * k;

      vec2 tex;
      // Dense looping sample — text packs across the dome
      tex.x = warped.x * 0.55 + 0.5 + u_scroll;
      tex.y = clamp(warped.y * 0.72 + 0.5, 0.02, 0.98);
      return tex;
    }

    void main() {
      vec2 uv = v_uv;
      float mask;
      vec2 tuv = fisheyeUV(uv, mask);

      if (mask <= 0.001) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec2 p = uv * 2.0 - 1.0;
      float aspect = u_res.x / max(u_res.y, 1.0);
      p.x *= max(aspect * 0.42, 0.55);
      p.y *= 0.98;
      float r = length(p);
      float z = sqrt(max(1.0 - r * r, 0.0));

      float cellScale = mix(90.0, 48.0, z);
      vec2 gridUV = uv * u_res / u_res.y;
      vec2 cell = fract(gridUV * cellScale);
      float led = smoothstep(0.46, 0.14, length(cell - 0.5));

      vec2 sampleUV = vec2(fract(tuv.x), tuv.y);
      vec4 src = texture2D(u_tex, sampleUV);
      float lit = clamp(max(src.r, max(src.g, src.b)) * 1.45, 0.0, 1.0);

      vec3 amberCore = vec3(1.0, 0.96, 0.72);
      vec3 amberGlow = vec3(1.0, 0.55, 0.12);

      vec3 col = vec3(0.07, 0.07, 0.08) * led;
      col += mix(amberGlow, amberCore, lit) * lit * mix(0.35, 1.0, led) * 1.9;
      col += amberGlow * lit * 0.45;

      float sheet = pow(max(1.0 - abs(p.y + 0.1) * 1.2, 0.0), 3.0) * 0.12;
      sheet *= smoothstep(1.0, 0.15, r);
      col += vec3(0.85, 0.9, 1.0) * sheet;

      float g = (hash(uv * u_res + u_time * 30.0) - 0.5) * 0.03;
      col += g;
      col *= mix(1.0, 0.85, smoothstep(0.5, 1.0, r));

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
    const h = 512;
    const ctx = canvas.getContext('2d');
    // Repeat so the dome is packed with looping copy
    const phrase = `${text}   ${text}   ${text}   ${text}   ${text}   `;

    ctx.font = '700 220px Arial, Helvetica, sans-serif';
    const tw = Math.ceil(ctx.measureText(phrase).width) + 64;
    canvas.width = nextPow2(Math.max(4096, tw));
    canvas.height = h;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(32, h / 2);
    // Slightly wide glyphs so stretch stays readable
    ctx.scale(1.35, 0.9);
    ctx.font = '700 220px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.fillText(phrase, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillText(phrase, 0, 0);
    ctx.restore();

    return canvas;
  }

  function mapDome(uvx, uvy, aspect) {
    let px = uvx * 2 - 1;
    let py = uvy * 2 - 1;
    px *= Math.max(aspect * 0.42, 0.55);
    py *= 0.98;
    const r = Math.hypot(px, py);
    if (r > 1.02) return null;
    const z = Math.sqrt(Math.max(1 - r * r, 0));
    const k = 1 / (0.42 + z * 0.95);
    return { px, py, r, z, wx: px * k, wy: py * k };
  }

  function startFisheye2D(root, canvas, text) {
    const marquee = buildMarqueeTexture(text);
    const mctx = marquee.getContext('2d');
    const mdata = mctx.getImageData(0, 0, marquee.width, marquee.height);
    const mw = marquee.width;
    const mh = marquee.height;

    let scroll = 0;
    let raf = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr * 0.42));
      const h = Math.max(1, Math.floor(rect.height * dpr * 0.42));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    function sample(u, v) {
      const x = Math.floor((((u % 1) + 1) % 1) * (mw - 1));
      const y = Math.floor(Math.min(Math.max(v, 0), 1) * (mh - 1));
      return mdata.data[(y * mw + x) * 4];
    }

    function frame() {
      resize();
      const w = canvas.width;
      const h = canvas.height;
      const aspect = w / Math.max(h, 1);
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(w, h);
      const out = img.data;
      scroll -= 0.006;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const uvx = x / (w - 1);
          const uvy = y / (h - 1);
          const m = mapDome(uvx, uvy, aspect);
          const o = (y * w + x) * 4;
          if (!m) {
            out[o + 3] = 0;
            continue;
          }
          const tu = m.wx * 0.55 + 0.5 + scroll;
          const tv = Math.min(Math.max(m.wy * 0.72 + 0.5, 0.02), 0.98);
          const cell = 48 + m.z * 30;
          const gx = ((uvx * w) / h) * cell;
          const gy = uvy * cell;
          const cx = gx - Math.floor(gx) - 0.5;
          const cy = gy - Math.floor(gy) - 0.5;
          const led = Math.max(0, 1 - Math.hypot(cx, cy) * 2.5);
          const lit = sample(tu, tv) / 255;
          const glow = lit * (0.5 + led * 1.25);
          const base = 0.07 * led;
          out[o] = Math.min(255, (base + glow) * 255);
          out[o + 1] = Math.min(255, (base + glow * (0.55 + lit * 0.4)) * 255);
          out[o + 2] = Math.min(255, (base * 1.1 + glow * 0.15) * 255);
          out[o + 3] = Math.floor((1 - Math.max(0, (m.r - 0.97) / 0.04)) * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  window.startFisheye = function startFisheye(options = {}) {
    const root = document.getElementById(options.rootId || 'fisheyeStage');
    if (!root) return;

    const text = options.text || 'JOIN NOW TV';
    root.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.className = 'fisheye-canvas';
    root.appendChild(canvas);

    const gl =
      canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      }) ||
      canvas.getContext('experimental-webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
      });

    requestAnimationFrame(() => root.classList.add('is-active'));

    if (!gl) {
      root.classList.add('is-canvas2d');
      return startFisheye2D(root, canvas, text);
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
      scroll -= 0.085 * (1 / 60);
      gl.uniform1f(uniforms.u_time, (now - t0) / 1000);
      gl.uniform1f(uniforms.u_scroll, scroll);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  };
})();
