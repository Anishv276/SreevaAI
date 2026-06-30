"use client";
import React from 'react';
import ReactShaderToy from './react-shader-toy';
import { useAgentVisualizer } from '../../hooks/agents-ui/use-visualizer';
import type { AgentState } from '@livekit/components-react';
import { cn } from '@/lib/utils';
export interface AuraVisualizerProps {
  state?: AgentState;
  audioTrack?: unknown;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  color?: [number, number, number]; // RGB normalized 0-1
  className?: string;
}
const AURA_SHADER = `
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
    float d = length(uv);
    float angle = atan(uv.y, uv.x);
    // Organic noise-like movement
    float noise = sin(angle * 3.0 + iTime * uSpeed) * 0.1 
                + sin(angle * 7.0 - iTime * uSpeed * 0.5) * 0.05;
    float radius = 0.35 + noise * uIntensity;
    // Smooth glow gradient
    float glow = 0.015 / abs(d - radius);
    glow = pow(glow, 1.2) * uIntensity;
    // Internal soft glow
    float innerGlow = smoothstep(radius + 0.1, radius - 0.2, d) * 0.15 * uIntensity;
    // Color with orange/amber tint
    vec3 baseColor = uColor;
    vec3 finalColor = baseColor * (glow + innerGlow);
    // Alpha falloff
    float alpha = glow + innerGlow;
    alpha = clamp(alpha, 0.0, 1.0) * smoothstep(0.5, 0.2, d);
    fragColor = vec4(finalColor, alpha);
  }
`;
const SIZES = {
  sm: 'h-32 w-32',
  md: 'h-48 w-48',
  lg: 'h-96 w-96',
  xl: 'h-[32rem] w-[32rem]',
  full: 'h-full w-full',
};
export function AuraVisualizer({
  state = 'idle',
  audioTrack,
  size = 'lg',
  color = [0.97, 0.45, 0.08], // #7C3AED (Orange 500)
  className,
}: AuraVisualizerProps) {
  const { intensity, speed } = useAgentVisualizer(state, audioTrack);
  return (
    <div className={cn("relative flex items-center justify-center", SIZES[size], className)}>
      <ReactShaderToy
        fs={AURA_SHADER}
        uniforms={{
          uIntensity: { type: '1f', value: intensity },
          uSpeed: { type: '1f', value: speed },
          uColor: { type: '3fv', value: color },
        }}
        className="w-full h-full"
      />
    </div>
  );
}
