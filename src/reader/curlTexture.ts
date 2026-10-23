// A single textured mesh avoids antialiased seams between Canvas clip strips.
export function createCurlTexture(texture: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = texture.width;
  canvas.height = texture.height;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const value = gl.createShader(type)!;
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
      gl.deleteShader(value);
      throw Error("Page texture shader failed");
    }
    return value;
  };
  let program: WebGLProgram | null = null,
    buffer: WebGLBuffer | null = null,
    image: WebGLTexture | null = null;
  try {
    const vert = shader(
      gl.VERTEX_SHADER,
      `attribute vec2 position;attribute vec2 uv;attribute float along;uniform vec2 size;varying vec2 tex;varying float q;void main(){gl_Position=vec4(position.x/size.x*2.0-1.0,1.0-position.y/size.y*2.0,0.0,1.0);tex=uv;q=along;}`,
    );
    const frag = shader(
      gl.FRAGMENT_SHADER,
      `precision highp float;uniform sampler2D page;uniform vec3 paper;uniform float back;uniform float strength;uniform float opacity;varying vec2 tex;varying float q;void main(){vec4 c=texture2D(page,tex);c.rgb=mix(c.rgb,paper,back*.94);c.rgb*=1.0-strength*(.035+.085*sin(q*3.14159265));gl_FragColor=vec4(c.rgb*opacity,c.a*opacity);}`,
    );
    program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error("Page texture program failed");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, dimensions, offset] of [
      ["position", 2, 0],
      ["uv", 2, 8],
      ["along", 1, 16],
    ] as const) {
      const attribute = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(
        attribute,
        dimensions,
        gl.FLOAT,
        false,
        20,
        offset,
      );
    }
    image = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      texture,
    );
    gl.uniform2f(
      gl.getUniformLocation(program, "size"),
      canvas.width,
      canvas.height,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    return {
      draw(points: number[][], p: number, hinge: number, paper: string) {
        const count = points.length - 1,
          w = canvas.width,
          h = canvas.height,
          leaf = w - hinge,
          back = p > 0.5,
          vertices: number[] = [];
        const vertex = (i: number, bottom: boolean) =>
          vertices.push(
            points[i][0],
            points[i][bottom ? 2 : 1],
            (back ? w - (i / count) * leaf : hinge + (i / count) * leaf) / w,
            bottom ? 1 : 0,
            i / count,
          );
        for (let i = 0; i < count; i++) {
          vertex(i, false);
          vertex(i + 1, false);
          vertex(i + 1, true);
          vertex(i, false);
          vertex(i + 1, true);
          vertex(i, true);
        }
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array(vertices),
          gl.DYNAMIC_DRAW,
        );
        const rgb = [1, 3, 5].map(
          (i) => parseInt(paper.slice(i, i + 2), 16) / 255,
        );
        gl.uniform3f(
          gl.getUniformLocation(program!, "paper"),
          rgb[0],
          rgb[1],
          rgb[2],
        );
        gl.uniform1f(gl.getUniformLocation(program!, "back"), back ? 1 : 0);
        gl.uniform1f(
          gl.getUniformLocation(program!, "strength"),
          Math.sin(Math.PI * p),
        );
        gl.uniform1f(
          gl.getUniformLocation(program!, "opacity"),
          back ? Math.min(1, (1 - p) / 0.18) : 1,
        );
        gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 5);
        return canvas;
      },
      dispose() {
        gl.deleteTexture(image);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      },
    };
  } catch {
    gl.deleteTexture(image);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
}
