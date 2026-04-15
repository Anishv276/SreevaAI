"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

export interface ShaderToyProps {
  fs: string;
  uniforms?: Record<string, { type: string; value: any }>;
  onError?: (error: string) => void;
  onWarning?: (warning: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

export type ShaderToyHandle = {
  getCanvas: () => HTMLCanvasElement | null;
};

const ReactShaderToy = forwardRef<ShaderToyHandle, ShaderToyProps>(
  ({ fs, uniforms = {}, onError, onWarning, style, className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGL2RenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const requestRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(Date.now());

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const gl = canvas.getContext('webgl2', { alpha: true });
      if (!gl) {
        onError?.("WebGL2 not supported");
        return;
      }
      glRef.current = gl;

      // Vertex shader is standard
      const vsSource = `#version 300 es
        in vec4 position;
        void main() {
          gl_Position = position;
        }
      `;

      const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
      const fsComplete = `#version 300 es
        precision highp float;
        uniform float iTime;
        uniform vec2 iResolution;
        ${Object.entries(uniforms).map(([name, { type }]) => `uniform ${type.replace('1f', 'float').replace('2f', 'vec2').replace('3fv', 'vec3').replace('1i', 'int')} ${name};`).join('\n')}
        out vec4 fragColor;
        void mainImage(out vec4 fragColor, in vec2 fragCoord);
        void main() {
          mainImage(fragColor, gl_FragCoord.xy);
        }
        ${fs}
      `;

      const fShader = createShader(gl, gl.FRAGMENT_SHADER, fsComplete);
      if (!fShader) {
        onError?.("Fragment shader compilation failed");
        return;
      }

      const program = gl.createProgram();
      if (!program || !vs || !fShader) return;
      
      gl.attachShader(program, vs);
      gl.attachShader(program, fShader);
      gl.linkProgram(program);
      
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        onError?.(gl.getProgramInfoLog(program) || "Linking failed");
        return;
      }
      programRef.current = program;

      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

      const render = () => {
        if (!gl || !program) return;
        
        const time = (Date.now() - startTimeRef.current) / 1000.0;
        
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        const posLoc = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform1f(gl.getUniformLocation(program, "iTime"), time);
        gl.uniform2f(gl.getUniformLocation(program, "iResolution"), canvas.width, canvas.height);

        // Apply custom uniforms
        Object.entries(uniforms).forEach(([name, { type, value }]) => {
          const loc = gl.getUniformLocation(program, name);
          if (type === '1f') gl.uniform1f(loc, value);
          else if (type === '2f') gl.uniform2f(loc, value[0], value[1]);
          else if (type === '3fv') gl.uniform3fv(loc, value);
          else if (type === '1i') gl.uniform1i(loc, value);
        });

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestRef.current = requestAnimationFrame(render);
      };

      requestRef.current = requestAnimationFrame(render);

      const resizeObserver = new ResizeObserver(() => {
        if (canvas) {
          canvas.width = canvas.clientWidth * window.devicePixelRatio;
          canvas.height = canvas.clientHeight * window.devicePixelRatio;
        }
      });
      resizeObserver.observe(canvas);

      return () => {
        resizeObserver.disconnect();
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fShader);
      };
    }, [fs, JSON.stringify(uniforms)]);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', ...style }}
        className={className}
      />
    );
  }
);

ReactShaderToy.displayName = "ReactShaderToy";

export default ReactShaderToy;
