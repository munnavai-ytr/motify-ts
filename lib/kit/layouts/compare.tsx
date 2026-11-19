'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeDrawProgress,
  computeEntranceStyle,
  computeExitStyle,
  computeProgress,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import { KitIcon, KitText } from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import {
  getStyleSurfaceCardProps,
  minBodyPx,
  readSlotString,
  readSlotStringArray,
  type LayoutProps,
} from './types';

export function CompareLayout({
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
  const contentHeight = height - safe.top - safe.bottom;
  const isVertical = format === '9:16';

  const leftTitle = readSlotString(slots, 'leftTitle', 'Before');
  const rightTitle = readSlotString(slots, 'rightTitle', 'After');
  const leftItemsRaw = readSlotStringArray(slots, 'leftItems', 4);
  const rightItemsRaw = readSlotStringArray(slots, 'rightItems', 4);

  const leftItems =
    leftItemsRaw.length > 0 ? leftItemsRaw : ['Manual layout', 'Slow edits'];
  const rightItems =
    rightItemsRaw.length > 0 ? rightItemsRaw : ['Auto-fit type', 'Instant MP4'];

  const variant = motion.variant === 'b' ? 'b' : 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);

  const exit = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });

  const colSurface = getStyleSurfaceCardProps(theme, false);
  const highlightSurface = getStyleSurfaceCardProps(theme, true);

  const colTitleMin = Math.round(px(u, isVertical ? 4.4 : 4.0));
  const colTitleMax = Math.round(px(u, isVertical ? 5.6 : 5.0));
  const itemMin = minBodyPx(u, 3.4);
  const itemMax = Math.round(px(u, 3.8));

  // Variant B: Before / After reveal wipe panel
  if (variant === 'b') {
    const wipeP = computeProgress({
      frame: entranceFrame,
      fps,
      delayFrames: 4,
      durationFrames: 26,
      ease: 'snappy',
    });
    const splitPct = Math.round(52 * wipeP);
    const clipRight = Math.max(0, 100 - wipeP * 100);

    return (
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            top: safe.top,
            left: safe.left,
            right: safe.right,
            bottom: safe.bottom,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: contentWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.62) : Math.round(contentHeight * 0.72),
              display: 'flex',
              flexDirection: isVertical ? 'column' : 'row',
              alignItems: 'stretch',
              gap: Math.round(px(u, 2.2)),
              opacity: exit.opacity,
              transform: exit.transform,
            }}
          >
            {/* Before card */}
            <div
              style={{
                flex: 1,
                borderRadius: Math.round(18 * theme.mood.radiusScale),
                padding: Math.round(px(u, isVertical ? 3.2 : 2.8)),
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: Math.round(px(u, 1.8)),
                ...colSurface,
              }}
            >
              <KitText
                text={leftTitle}
                maxWidth={
                  isVertical
                    ? contentWidth - Math.round(px(u, 6.4))
                    : Math.round(contentWidth * 0.42)
                }
                maxHeight={Math.round(px(u, 8))}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={colTitleMin}
                maxSize={colTitleMax}
                maxLines={1}
                color={theme.palette.muted}
                animIn="fade"
                animOut="none"
              />
              {leftItems.map((txt, idx) => (
                <div
                  key={`cl-b-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: Math.round(px(u, 1.4)),
                  }}
                >
                  <KitIcon
                    name="clock"
                    size={Math.round(px(u, 2.8))}
                    color={theme.palette.muted}
                  />
                  <KitText
                    text={txt}
                    maxWidth={
                      isVertical
                        ? contentWidth - Math.round(px(u, 12))
                        : Math.round(contentWidth * 0.36)
                    }
                    maxHeight={Math.round(px(u, 7))}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={500}
                    minSize={itemMin}
                    maxSize={itemMax}
                    maxLines={2}
                    color={theme.palette.muted}
                    animIn="none"
                    animOut="none"
                  />
                </div>
              ))}
            </div>

            {/* After card wiped open cleanly */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                borderRadius: Math.round(18 * theme.mood.radiusScale),
                padding: Math.round(px(u, isVertical ? 3.2 : 2.8)),
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: Math.round(px(u, 1.8)),
                clipPath: `inset(0% ${clipRight.toFixed(1)}% 0% 0%)`,
                ...highlightSurface,
                border: `2.5px solid ${theme.palette.accent}`,
              }}
            >
              <KitText
                text={rightTitle}
                maxWidth={
                  isVertical
                    ? contentWidth - Math.round(px(u, 6.4))
                    : Math.round(contentWidth * 0.42)
                }
                maxHeight={Math.round(px(u, 8))}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={colTitleMin}
                maxSize={colTitleMax}
                maxLines={1}
                color={theme.palette.accent}
                animIn="none"
                animOut="none"
              />
              {rightItems.map((txt, idx) => (
                <div
                  key={`cr-b-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: Math.round(px(u, 1.4)),
                  }}
                >
                  <KitIcon
                    name="check-circle"
                    size={Math.round(px(u, 2.8))}
                    color={theme.palette.accent2}
                  />
                  <KitText
                    text={txt}
                    maxWidth={
                      isVertical
                        ? contentWidth - Math.round(px(u, 12))
                        : Math.round(contentWidth * 0.36)
                    }
                    maxHeight={Math.round(px(u, 7))}
                    fontFamily={theme.bodyFontFamily}
                    fontWeight={700}
                    minSize={itemMin}
                    maxSize={itemMax}
                    maxLines={2}
                    color={theme.palette.text}
                    animIn="none"
                    animOut="none"
                  />
                </div>
              ))}
              {splitPct > 0 && wipeP < 0.99 ? (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: `${clipRight.toFixed(1)}%`,
                    width: 4,
                    backgroundColor: theme.palette.accent2,
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A: Two columns separated by animated drawing divider
  const dividerP = computeDrawProgress({
    frame: entranceFrame,
    fps,
    delayFrames: beat0,
    durationFrames: 18,
    ease: 'cinematic',
  });
  const colIn = computeEntranceStyle({
    preset: 'fade-up',
    frame: entranceFrame,
    fps,
    delayFrames: beat1,
    durationFrames: 14,
    ease: motion.ease,
  });
  const colMotion = mergeMotionStyles(colIn, exit);
  const colWidth = isVertical
    ? contentWidth
    : Math.round((contentWidth - px(u, 5)) / 2);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: safe.top,
          left: safe.left,
          right: safe.right,
          bottom: safe.bottom,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: contentWidth,
            minHeight: isVertical ? Math.round(contentHeight * 0.62) : undefined,
            display: 'flex',
            flexDirection: isVertical ? 'column' : 'row',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            gap: Math.round(px(u, 2.2)),
            ...colMotion,
          }}
        >
          {/* Left Column */}
          <div
            style={{
              width: colWidth,
              borderRadius: Math.round(18 * theme.mood.radiusScale),
              padding: Math.round(px(u, isVertical ? 3.2 : 2.8)),
              display: 'flex',
              flexDirection: 'column',
              gap: Math.round(px(u, 1.6)),
              ...colSurface,
            }}
          >
            <KitText
              text={leftTitle}
              maxWidth={colWidth - Math.round(px(u, 6.4))}
              maxHeight={Math.round(px(u, 8))}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={colTitleMin}
              maxSize={colTitleMax}
              maxLines={1}
              color={theme.palette.muted}
              animIn="none"
              animOut="none"
            />
            {leftItems.map((txt, idx) => (
              <div
                key={`cl-a-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: Math.round(px(u, 1.4)),
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    backgroundColor: theme.palette.muted,
                    flexShrink: 0,
                  }}
                />
                <KitText
                  text={txt}
                  maxWidth={colWidth - Math.round(px(u, 10))}
                  maxHeight={Math.round(px(u, 7))}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={500}
                  minSize={itemMin}
                  maxSize={itemMax}
                  maxLines={2}
                  color={theme.palette.muted}
                  animIn="none"
                  animOut="none"
                />
              </div>
            ))}
          </div>

          {/* Drawing Divider */}
          <div
            style={{
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: isVertical ? '100%' : 4,
                height: isVertical ? 4 : '100%',
                minHeight: isVertical ? 4 : Math.round(px(u, 22)),
                background: `linear-gradient(135deg, ${theme.palette.accent}, ${theme.palette.accent2})`,
                borderRadius: 999,
                transform: isVertical
                  ? `scaleX(${dividerP.toFixed(3)})`
                  : `scaleY(${dividerP.toFixed(3)})`,
                transformOrigin: 'center center',
              }}
            />
          </div>

          {/* Right Column */}
          <div
            style={{
              width: colWidth,
              borderRadius: Math.round(18 * theme.mood.radiusScale),
              padding: Math.round(px(u, isVertical ? 3.2 : 2.8)),
              display: 'flex',
              flexDirection: 'column',
              gap: Math.round(px(u, 1.6)),
              ...highlightSurface,
              border: `2px solid ${hexToRgba(theme.palette.accent, 0.7)}`,
            }}
          >
            <KitText
              text={rightTitle}
              maxWidth={colWidth - Math.round(px(u, 6.4))}
              maxHeight={Math.round(px(u, 8))}
              fontFamily={theme.titleFontFamily}
              fontWeight={800}
              minSize={colTitleMin}
              maxSize={colTitleMax}
              maxLines={1}
              color={theme.palette.accent}
              animIn="none"
              animOut="none"
            />
            {rightItems.map((txt, idx) => (
              <div
                key={`cr-a-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: Math.round(px(u, 1.4)),
                }}
              >
                <KitIcon
                  name="check-circle"
                  size={Math.round(px(u, 2.8))}
                  color={theme.palette.accent2}
                />
                <KitText
                  text={txt}
                  maxWidth={colWidth - Math.round(px(u, 11))}
                  maxHeight={Math.round(px(u, 7))}
                  fontFamily={theme.bodyFontFamily}
                  fontWeight={700}
                  minSize={itemMin}
                  maxSize={itemMax}
                  maxLines={2}
                  color={theme.palette.text}
                  animIn="none"
                  animOut="none"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
