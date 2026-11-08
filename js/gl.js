// Small WebGL helper (from DV84, grown from the round-6 _shared_a/gl.js): WebGL2 when available, WebGL1 otherwise.
// One full-screen triangle shared by every program; render targets; float targets when the GPU can render them.

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

export function createGL(canvas, over = {}) {
  const opts = { alpha: false, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: true, powerPreference: 'high-performance', ...over };
  const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
  if (!gl) return null;
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!gl.webgl2) gl.getExtension('OES_standard_derivatives');
  return gl;
}

export function program(gl, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    return s;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(pr, 0, 'p');
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(pr) || 'link failed');
  const locs = {};
  const U = (n) => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(pr, n)));
  const api = {
    use() { gl.useProgram(pr); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); return api; },
    f(n, ...v) {
      const l = U(n); if (l === null) return api;
      if (v.length === 1) gl.uniform1f(l, v[0]); else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]); else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
      return api;
    },
    v4(n, arr) { const l = U(n); if (l !== null) gl.uniform4fv(l, arr); return api; },
    i(n, v) { const l = U(n); if (l !== null) gl.uniform1i(l, v); return api; },
    tex(n, unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); return api.i(n, unit); },
    draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); return api; },
  };
  return api;
}

// can this context render into half-float textures? returns { internal, type } or null
export function halfFloat(gl) {
  if (gl.webgl2) {
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
  }
  const ext = gl.getExtension('OES_texture_half_float');
  if (!ext || !gl.getExtension('EXT_color_buffer_half_float')) return null;
  gl.getExtension('OES_texture_half_float_linear');
  return { internal: gl.RGBA, format: gl.RGBA, type: ext.HALF_FLOAT_OES };
}

// a colour render target; fmt from halfFloat() or null for RGBA8. Returns null if the GPU refuses it.
export function target(gl, w, h, fmt = null, { repeat = false, linear = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (fmt) gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const f = linear ? gl.LINEAR : gl.NEAREST, wr = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const okFb = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!okFb) { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return null; }
  return { tex, fb, w, h, free() { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); } };
}

export function bind(gl, t, x = 0, y = 0, w = null, h = null) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
  const W = t ? t.w : gl.drawingBufferWidth, H = t ? t.h : gl.drawingBufferHeight;
  gl.viewport(0, 0, W, H);
  if (w === null) { gl.disable(gl.SCISSOR_TEST); return; }
  gl.enable(gl.SCISSOR_TEST); gl.scissor(x, y, w, h);
}
