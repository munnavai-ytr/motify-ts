'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  computeCameraState,
  computeIncomingTransition,
  computeParallaxTransform,
} from './anim';
import {
  KitBackground,
  KitDecor,
  KitSceneProvider,
  resolveKitTheme,
} from './elements';
import { clearFitTextCache } from './fit';
import { ensureFonts } from './fonts';
import { getLayoutDefinition } from './layouts/registry';
import { TitleLayout } from './layouts/title';
import { buildCentralAvoidZone } from './layouts/types';
import {
  computeSceneTimings,
  type NormalizedSceneSpec,
  type VideoSpec,
} from './spec';
import { SAFE_AREAS, containsBengali, type FontRole } from './tokens';

export interface VideoFromSpecProps {
  spec: VideoSpec;
}

interface SceneRendererProps {
  scene: NormalizedSceneSpec;
  sceneIndex: number;
  spec: VideoSpec;
  durationInFrames: number;
  overlapInFrames: number;
}

const SCENE_ZERO_PRE_ROLL_FRAMES = 8;

function SceneRenderer({
  scene,
  sceneIndex,
  spec,
  durationInFrames,
  overlapInFrames,
}: SceneRendererProps) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const resolvedTheme = resolveKitTheme({
    palette: spec.theme.palette,
    mood: spec.theme.mood,
    style: spec.style,
    intensity: spec.intensity,
    seed: spec.seed,
  });

  const layoutDef = getLayoutDefinition(scene.layout);
  const LayoutComponent = layoutDef?.component ?? TitleLayout;
  const preRollFrames = sceneIndex === 0 ? SCENE_ZERO_PRE_ROLL_FRAMES : 0;

  // Incoming scene owns transition; outgoing scene remains opaque underneath (no black dip).
  const incomingTransition =
    sceneIndex > 0
      ? computeIncomingTransition({
          transition: scene.transition,
          frame,
          overlapInFrames,
          width,
          height,
          accentColor: resolvedTheme.palette.accent,
        })
      : { containerStyle: {}, colorBlockOverlay: null };

  const cameraState = computeCameraState({
    camera: scene.camera,
    frame,
    durationInFrames,
    intensity: spec.intensity,
    width,
  });

  const bgParallax = computeParallaxTransform({
    cameraState,
    depth: 0.15,
    width,
  });

  const safe = SAFE_AREAS[spec.format];
  const avoidZones = buildCentralAvoidZone(
    safe,
    width,
    height,
    scene.layout === 'lower-third' ? 0.35 : 0.62
  );
  const sceneSeed = `${spec.seed}-${spec.title}-${scene.id}-${sceneIndex}`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor:
          scene.bg === 'chroma' ? '#00FF00' : resolvedTheme.palette.bg,
        overflow: 'hidden',
        ...incomingTransition.containerStyle,
      }}
    >
      <KitSceneProvider
        value={{
          preRollFrames,
          style: resolvedTheme.style,
          palette: resolvedTheme.palette,
          intensity: spec.intensity,
          sceneIndex,
          numerals: spec.numerals,
        }}
      >
        <KitBackground
          kind={scene.bg}
          palette={resolvedTheme.palette}
          seed={sceneSeed}
          parallaxTransform={bgParallax}
        />

        {scene.bg !== 'chroma' && scene.layout !== 'lower-third' ? (
          <KitDecor
            kinds={resolvedTheme.style.decorPieces}
            palette={resolvedTheme.palette}
            styleDef={resolvedTheme.style}
            width={width}
            height={height}
            safe={safe}
            seed={sceneSeed}
            avoid={avoidZones}
            depth={0.45}
            cameraState={cameraState}
            sceneIndex={sceneIndex}
          />
        ) : null}

        <AbsoluteFill
          style={{
            transform:
              cameraState.transform !== 'none' ? cameraState.transform : undefined,
            transformOrigin: 'center center',
          }}
        >
          <ErrorBoundary
            resetKey={`${scene.id}-${scene.layout}-${scene.variant}-${sceneIndex}`}
            fallback={(err) => (
              <AbsoluteFill
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 48,
                  color: resolvedTheme.palette.text,
                  fontFamily: resolvedTheme.bodyFontFamily,
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>
                    Scene render error ({scene.layout})
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      marginTop: 12,
                      color: resolvedTheme.palette.muted,
                    }}
                  >
                    {err.message}
                  </div>
                </div>
              </AbsoluteFill>
            )}
          >
            <LayoutComponent
              slots={scene.slots}
              theme={resolvedTheme}
              format={spec.format}
              width={width}
              height={height}
              fps={fps}
              durationInFrames={durationInFrames}
              motion={{
                animIn: scene.animIn,
                animOut: scene.animOut,
                ease: scene.ease,
                bg: scene.bg,
                variant: scene.variant,
                camera: scene.camera,
                transition: scene.transition,
                intensity: spec.intensity,
                seed: spec.seed,
                preRollFrames,
              }}
              sceneIndex={sceneIndex}
            />
          </ErrorBoundary>
        </AbsoluteFill>

        {incomingTransition.colorBlockOverlay?.active ? (
          <AbsoluteFill
            style={{
              backgroundColor: incomingTransition.colorBlockOverlay.color,
              clipPath: incomingTransition.colorBlockOverlay.clipPath,
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </KitSceneProvider>
    </AbsoluteFill>
  );
}

export function VideoFromSpec({ spec }: VideoFromSpecProps) {
  const { delayRender, continueRender } = useDelayRender();
  const [fontGateHandle] = useState(() =>
    delayRender('Waiting for Motion Kit fonts')
  );
  const [, setFontsReadyTick] = useState(0);

  const fontNeedKey = useMemo(() => {
    const theme = resolveKitTheme({
      palette: spec.theme.palette,
      mood: spec.theme.mood,
      style: spec.style,
      intensity: spec.intensity,
      seed: spec.seed,
    });
    const roles: FontRole[] = Array.from(
      new Set([
        theme.style.titleFontRole,
        theme.style.bodyFontRole,
        theme.mood.titleFontRole,
        theme.mood.bodyFontRole,
      ])
    ).sort();
    const hasBengali = containsBengali(JSON.stringify(spec.scenes));
    return `${roles.join(',')}:${hasBengali ? 'bn' : 'en'}`;
  }, [spec]);

  useEffect(() => {
    let active = true;
    const [rolesPart, bnPart] = fontNeedKey.split(':');
    const roles = (rolesPart ? rolesPart.split(',') : []) as FontRole[];
    const hasBengali = bnPart === 'bn';

    ensureFonts({ timeoutMs: 4500, roles, hasBengali })
      .then(() => {
        if (!active) {
          return;
        }
        clearFitTextCache();
        setFontsReadyTick((n) => n + 1);
      })
      .finally(() => {
        continueRender(fontGateHandle);
      });

    return () => {
      active = false;
    };
  }, [continueRender, fontGateHandle, fontNeedKey]);

  const timings = computeSceneTimings(spec);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: spec.theme.palette.bg,
      }}
    >
      {timings.map((timing) => (
        <Sequence
          key={`${timing.scene.id}-${timing.index}`}
          from={timing.startFrame}
          durationInFrames={timing.durationInFrames}
        >
          <SceneRenderer
            scene={timing.scene}
            sceneIndex={timing.index}
            spec={spec}
            durationInFrames={timing.durationInFrames}
            overlapInFrames={timing.overlapInFrames}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
