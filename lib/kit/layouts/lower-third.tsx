'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  computeProgress,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import { KitBadge, KitIcon, KitText } from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import {
  getStyleSurfaceCardProps,
  minTextPx,
  readSlotString,
  type LayoutProps,
} from './types';

export function LowerThirdLayout({
  slots,
  theme,
  format,
  width,
  height,
  motion,
}: LayoutProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const safe = SAFE_AREAS[format];
  const u = sizingUnit(width, height);
  const contentWidth = width - safe.left - safe.right;
  const isVertical = format === '9:16';

  const name = readSlotString(slots, 'name', 'Speaker Name');
  const role = readSlotString(slots, 'role', 'Founder & Host');
  const org = readSlotString(slots, 'org');
  const tag = readSlotString(slots, 'tag');
  const icon = readSlotString(slots, 'icon');

  const cardWidth = isVertical
    ? contentWidth
    : format === '1:1'
      ? Math.round(contentWidth * 0.88)
      : Math.round(contentWidth * 0.64);

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);

  const barProgress = computeProgress({
    frame: entranceFrame,
    fps,
    delayFrames: beat0,
    durationFrames: 12,
    ease: 'snappy',
  });

  const cardIn = computeEntranceStyle({
    preset: 'slide-right',
    frame: entranceFrame,
    fps,
    delayFrames: 2,
    durationFrames: 16,
    ease: motion.ease,
    distancePx: 54,
  });

  const cardOut = computeExitStyle({
    preset: 'slide',
    frame,
    durationInFrames,
    exitFrames: 10,
    distancePx: 28,
  });

  const cardMotion = mergeMotionStyles(cardIn, cardOut);
  const cardSurface = getStyleSurfaceCardProps(theme, false);

  const subtitle = org ? `${role} · ${org}` : role;
  const radius = Math.round(14 * theme.mood.radiusScale);

  const nameMin = Math.round(px(u, 3.6));
  const nameMax = Math.round(px(u, isVertical ? 4.8 : 4.4));
  const subMin = minTextPx(u, 3.2);
  const subMax = Math.round(px(u, isVertical ? 3.5 : 3.3));
  const tagSize = minTextPx(u, 3.2);

  // Variant B: Floating minimal broadcast pill bar
  if (variant === 'b') {
    return (
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            left: safe.left,
            bottom: safe.bottom,
            width: cardWidth,
            display: 'flex',
            alignItems: 'center',
            gap: Math.round(px(u, 2.0)),
            borderRadius: 9999,
            paddingLeft: Math.round(px(u, 2.2)),
            paddingRight: Math.round(px(u, 3.4)),
            paddingTop: Math.round(px(u, 1.6)),
            paddingBottom: Math.round(px(u, 1.6)),
            ...cardSurface,
            ...cardMotion,
          }}
        >
          <div
            style={{
              width: Math.round(px(u, 6.2)),
              height: Math.round(px(u, 6.2)),
              borderRadius: '9999px',
              backgroundColor: theme.palette.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <KitIcon
              name={icon || 'mic'}
              size={Math.round(px(u, 3.2))}
              color={theme.palette.onAccent}
            />
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: Math.round(px(u, 0.3)),
            }}
          >
            <KitText
              text={name}
              maxWidth={cardWidth - Math.round(px(u, 14))}
              maxHeight={Math.round(px(u, 7.6))}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={nameMin}
              maxSize={nameMax}
              maxLines={1}
              lineHeight={1.1}
              color={theme.palette.text}
              animIn="none"
              animOut="none"
            />
            <KitText
              text={subtitle}
              maxWidth={cardWidth - Math.round(px(u, 14))}
              maxHeight={Math.round(px(u, 6.2))}
              fontFamily={theme.bodyFontFamily}
              fontWeight={500}
              minSize={subMin}
              maxSize={subMax}
              maxLines={1}
              lineHeight={1.18}
              color={theme.palette.muted}
              animIn="none"
              animOut="none"
            />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant C: Stacked two-tone accent tag bar + dark surface name bar
  if (variant === 'c') {
    const bar2In = computeEntranceStyle({
      preset: 'wipe',
      frame: entranceFrame,
      fps,
      delayFrames: beat1,
      durationFrames: 16,
      ease: 'snappy',
    });
    const bar2Motion = mergeMotionStyles(bar2In, cardOut);

    return (
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            left: safe.left,
            bottom: safe.bottom,
            width: cardWidth,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: Math.round(px(u, 0.8)),
          }}
        >
          <div
            style={{
              backgroundColor: theme.palette.accent,
              color: theme.palette.onAccent,
              borderRadius: Math.round(8 * theme.mood.radiusScale),
              paddingLeft: Math.round(px(u, 2.4)),
              paddingRight: Math.round(px(u, 2.8)),
              paddingTop: Math.round(px(u, 1.1)),
              paddingBottom: Math.round(px(u, 1.1)),
              maxWidth: cardWidth,
              ...cardMotion,
            }}
          >
            <KitText
              text={name}
              maxWidth={cardWidth - Math.round(px(u, 6))}
              maxHeight={Math.round(px(u, 7.6))}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={nameMin}
              maxSize={nameMax}
              maxLines={1}
              lineHeight={1.1}
              color={theme.palette.onAccent}
              animIn="none"
              animOut="none"
              style={{ width: 'auto' }}
            />
          </div>

          <div
            style={{
              backgroundColor: theme.palette.surface,
              border: `1.5px solid ${hexToRgba(theme.palette.text, 0.16)}`,
              borderRadius: Math.round(8 * theme.mood.radiusScale),
              paddingLeft: Math.round(px(u, 2.4)),
              paddingRight: Math.round(px(u, 2.8)),
              paddingTop: Math.round(px(u, 0.9)),
              paddingBottom: Math.round(px(u, 0.9)),
              maxWidth: cardWidth,
              ...bar2Motion,
            }}
          >
            <KitText
              text={tag ? `${tag} · ${subtitle}` : subtitle}
              maxWidth={cardWidth - Math.round(px(u, 6))}
              maxHeight={Math.round(px(u, 6.2))}
              fontFamily={theme.bodyFontFamily}
              fontWeight={600}
              minSize={subMin}
              maxSize={subMax}
              maxLines={1}
              lineHeight={1.18}
              color={theme.palette.text}
              animIn="none"
              animOut="none"
              style={{ width: 'auto' }}
            />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A (Default): Accent bar + card
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: safe.left,
          bottom: safe.bottom,
          width: cardWidth,
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(px(u, 1.2)),
        }}
      >
        {tag ? (
          <div style={{ alignSelf: 'flex-start' }}>
            <KitBadge
              text={tag}
              icon={icon || undefined}
              bgColor={theme.palette.accent}
              textColor={theme.palette.onAccent}
              radius={Math.round(8 * theme.mood.radiusScale)}
              fontFamily={theme.bodyFontFamily}
              fontSize={tagSize}
              paddingX={Math.round(px(u, 2.0))}
              paddingY={Math.round(px(u, 0.8))}
              animIn="pop"
              animOut={motion.animOut}
              delayFrames={beat1}
            />
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            borderRadius: radius,
            overflow: 'hidden',
            ...cardSurface,
            backgroundColor: theme.palette.surface,
            ...cardMotion,
          }}
        >
          <div
            style={{
              width: Math.max(8, Math.round(px(u, 1.2))),
              background: `linear-gradient(180deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
              transform: `scaleY(${barProgress.toFixed(4)})`,
              transformOrigin: 'bottom center',
              flexShrink: 0,
            }}
          />

          <div
            style={{
              flex: 1,
              minWidth: 0,
              paddingLeft: Math.round(px(u, 2.6)),
              paddingRight: Math.round(px(u, 2.8)),
              paddingTop: Math.round(px(u, 2.0)),
              paddingBottom: Math.round(px(u, 2.0)),
              display: 'flex',
              alignItems: 'center',
              gap: Math.round(px(u, 2.0)),
            }}
          >
            {icon && !tag ? (
              <div
                style={{
                  width: Math.round(px(u, 6.2)),
                  height: Math.round(px(u, 6.2)),
                  borderRadius: Math.round(10 * theme.mood.radiusScale),
                  backgroundColor: hexToRgba(theme.palette.accent, 0.18),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <KitIcon
                  name={icon}
                  size={Math.round(px(u, 3.4))}
                  color={theme.palette.accent}
                />
              </div>
            ) : null}

            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: Math.round(px(u, 0.5)),
              }}
            >
              <KitText
                text={name}
                maxWidth={cardWidth - Math.round(px(u, 12))}
                maxHeight={Math.round(px(u, 7.8))}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={nameMin}
                maxSize={nameMax}
                maxLines={1}
                lineHeight={1.12}
                letterSpacing={theme.mood.tracking}
                color={theme.palette.text}
                animIn="none"
                animOut="none"
              />

              <KitText
                text={subtitle}
                maxWidth={cardWidth - Math.round(px(u, 12))}
                maxHeight={Math.round(px(u, 6.2))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={500}
                minSize={subMin}
                maxSize={subMax}
                maxLines={1}
                lineHeight={1.2}
                color={theme.palette.muted}
                animIn="none"
                animOut="none"
              />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
