'use client';

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeEntranceStyle,
  computeExitStyle,
  mergeMotionStyles,
  resolveBeatDelay,
} from '../anim';
import { KitBadge, KitButton, KitDivider, KitStack, KitText } from '../elements';
import { SAFE_AREAS, hexToRgba, px, sizingUnit } from '../tokens';
import {
  getStyleSurfaceCardProps,
  minBodyPx,
  minTextPx,
  readSlotString,
  type LayoutProps,
} from './types';

export function OfferLayout({
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

  const badge = readSlotString(slots, 'badge', 'Limited Offer');
  const headline = readSlotString(slots, 'headline', 'Save 40% Today');
  const price = readSlotString(slots, 'price', '$29');
  const originalPrice = readSlotString(slots, 'originalPrice');
  const details = readSlotString(slots, 'details');
  const code = readSlotString(slots, 'code');
  const cta = readSlotString(slots, 'cta', 'Claim Offer');

  const variant = motion.variant ?? 'a';
  const entranceFrame = frame + motion.preRollFrames;
  const beat0 = 0;
  const beat1 = resolveBeatDelay(1, fps, motion.intensity, 0);
  const beat2 = resolveBeatDelay(2, fps, motion.intensity, 0);
  const beat3 = resolveBeatDelay(3, fps, motion.intensity, 0);

  const cardIn = computeEntranceStyle({
    preset: 'pop',
    frame: entranceFrame,
    fps,
    delayFrames: beat0,
    durationFrames: 18,
    ease: motion.ease,
  });
  const cardOut = computeExitStyle({
    preset: motion.animOut,
    frame,
    durationInFrames,
  });
  const cardMotion = mergeMotionStyles(cardIn, cardOut);
  const cardSurface = getStyleSurfaceCardProps(theme, true);

  const cardWidth = isVertical ? contentWidth : Math.round(contentWidth * 0.86);
  const badgeMin = minTextPx(u, 3.2);
  const titleMin = Math.round(px(u, isVertical ? 5.2 : 4.2));
  const titleMax = Math.round(px(u, isVertical ? 7.6 : 6.0));
  const detailsMin = minBodyPx(u, 3.4);
  const detailsMax = Math.round(px(u, 3.8));

  // Variant B: Top full-width ribbon banner + giant diagonal tilted badge
  if (variant === 'b') {
    const ribbonIn = computeEntranceStyle({
      preset: 'slide-right',
      frame: entranceFrame,
      fps,
      delayFrames: beat0,
      durationFrames: 14,
      ease: motion.ease,
    });
    const ribbonMotion = mergeMotionStyles(ribbonIn, cardOut);
    return (
      <AbsoluteFill>
        {/* Top promotional ribbon */}
        <div
          style={{
            position: 'absolute',
            top: Math.max(28, safe.top - Math.round(px(u, 10))),
            left: safe.left,
            right: safe.right,
            backgroundColor: theme.palette.accent,
            color: theme.palette.onAccent,
            borderRadius: Math.round(12 * theme.mood.radiusScale),
            paddingTop: Math.round(px(u, 1.4)),
            paddingBottom: Math.round(px(u, 1.4)),
            paddingLeft: Math.round(px(u, 2.8)),
            paddingRight: Math.round(px(u, 2.8)),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: cardSurface.boxShadow,
            ...ribbonMotion,
          }}
        >
          <span
            style={{
              fontFamily: theme.titleFontFamily,
              fontSize: Math.round(px(u, 3.6)),
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {badge}
          </span>
          {code ? (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: Math.round(px(u, 3.4)),
                fontWeight: 800,
              }}
            >
              {code}
            </span>
          ) : null}
        </div>

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
              position: 'relative',
              width: cardWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.6) : undefined,
              borderRadius: Math.round(24 * theme.mood.radiusScale),
              padding: Math.round(px(u, isVertical ? 4.4 : 3.6)),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Math.round(px(u, 2.4)),
              ...cardSurface,
              ...cardMotion,
            }}
          >
            {/* Tilted hero price stamp */}
            <div
              style={{
                backgroundColor: theme.palette.accent2,
                color: theme.palette.onAccent2,
                borderRadius: Math.round(18 * theme.mood.radiusScale),
                paddingLeft: Math.round(px(u, 4.4)),
                paddingRight: Math.round(px(u, 4.4)),
                paddingTop: Math.round(px(u, 2.0)),
                paddingBottom: Math.round(px(u, 2.0)),
                transform: 'rotate(-3deg)',
                boxShadow: '6px 6px 0px rgba(0,0,0,0.28)',
              }}
            >
              <KitText
                text={price}
                maxWidth={Math.round(cardWidth * 0.72)}
                maxHeight={Math.round(px(u, 15))}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={Math.round(px(u, 6.0))}
                maxSize={Math.round(px(u, isVertical ? 11.4 : 9.6))}
                maxLines={1}
                color={theme.palette.onAccent2}
                align="center"
                animIn="pop"
                animOut="none"
                delayFrames={beat1}
                style={{ width: 'auto' }}
              />
            </div>

            <KitText
              text={headline}
              maxWidth={cardWidth - Math.round(px(u, 6))}
              maxHeight={Math.round(px(u, 20))}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={titleMax}
              maxLines={2}
              lineHeight={1.1}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut="none"
              delayFrames={beat1}
            />

            {originalPrice ? (
              <span
                style={{
                  fontFamily: theme.bodyFontFamily,
                  fontSize: Math.round(px(u, 3.8)),
                  fontWeight: 700,
                  color: theme.palette.muted,
                  textDecoration: 'line-through',
                }}
              >
                Was {originalPrice}
              </span>
            ) : null}

            {details ? (
              <KitText
                text={details}
                maxWidth={cardWidth - Math.round(px(u, 8))}
                maxHeight={Math.round(px(u, 12))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={detailsMin}
                maxSize={detailsMax}
                maxLines={2}
                lineHeight={1.3}
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut="none"
                delayFrames={beat2}
              />
            ) : null}

            <KitButton
              text={cta}
              icon="arrow-right"
              bgColor={theme.palette.accent}
              textColor={theme.palette.onAccent}
              radius={Math.round(14 * theme.mood.radiusScale)}
              fontFamily={theme.bodyFontFamily}
              fontSize={Math.round(px(u, 3.6))}
              paddingX={Math.round(px(u, 4.4))}
              paddingY={Math.round(px(u, 2.0))}
              animIn="pop"
              animOut="none"
              delayFrames={beat3}
            />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant C: Clean split old price / new price comparison
  if (variant === 'c') {
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
              width: cardWidth,
              minHeight: isVertical ? Math.round(contentHeight * 0.6) : undefined,
              borderRadius: Math.round(24 * theme.mood.radiusScale),
              padding: Math.round(px(u, isVertical ? 4.4 : 3.4)),
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: Math.round(px(u, 2.4)),
              ...cardSurface,
              ...cardMotion,
            }}
          >
            <KitBadge
              text={badge}
              icon="tag"
              bgColor={theme.palette.accent}
              textColor={theme.palette.onAccent}
              radius={Math.round(10 * theme.mood.radiusScale)}
              fontFamily={theme.bodyFontFamily}
              fontSize={badgeMin}
              paddingX={Math.round(px(u, 2.4))}
              paddingY={Math.round(px(u, 1.0))}
              animIn="pop"
              animOut="none"
              delayFrames={beat0}
            />

            <KitText
              text={headline}
              maxWidth={cardWidth - Math.round(px(u, 6))}
              maxHeight={Math.round(px(u, 18))}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={titleMax}
              maxLines={2}
              lineHeight={1.1}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut="none"
              delayFrames={beat1}
            />

            {/* Two-column Old vs Now comparison box */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                gap: Math.round(px(u, 2.0)),
              }}
            >
              {originalPrice ? (
                <div
                  style={{
                    flex: 1,
                    borderRadius: Math.round(16 * theme.mood.radiusScale),
                    backgroundColor: hexToRgba(theme.palette.bg, 0.5),
                    border: `1.5px solid ${hexToRgba(theme.palette.text, 0.14)}`,
                    padding: Math.round(px(u, 2.4)),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: Math.round(px(u, 0.8)),
                  }}
                >
                  <span
                    style={{
                      fontFamily: theme.bodyFontFamily,
                      fontSize: Math.round(px(u, 3.2)),
                      fontWeight: 700,
                      color: theme.palette.muted,
                    }}
                  >
                    Before
                  </span>
                  <span
                    style={{
                      fontFamily: theme.titleFontFamily,
                      fontSize: Math.round(px(u, isVertical ? 6.2 : 5.4)),
                      fontWeight: 700,
                      color: theme.palette.muted,
                      textDecoration: 'line-through',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {originalPrice}
                  </span>
                </div>
              ) : null}

              <div
                style={{
                  flex: 1.25,
                  borderRadius: Math.round(16 * theme.mood.radiusScale),
                  backgroundColor: hexToRgba(theme.palette.accent, 0.18),
                  border: `2px solid ${theme.palette.accent}`,
                  padding: Math.round(px(u, 2.4)),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: Math.round(px(u, 0.8)),
                }}
              >
                <span
                  style={{
                    fontFamily: theme.bodyFontFamily,
                    fontSize: Math.round(px(u, 3.2)),
                    fontWeight: 700,
                    color: theme.palette.accent,
                  }}
                >
                  Now
                </span>
                <KitText
                  text={price}
                  maxWidth={Math.round(cardWidth * 0.5)}
                  maxHeight={Math.round(px(u, 13))}
                  fontFamily={theme.titleFontFamily}
                  fontWeight={800}
                  minSize={Math.round(px(u, 5.4))}
                  maxSize={Math.round(px(u, isVertical ? 9.4 : 8.2))}
                  maxLines={1}
                  color={theme.palette.accent2}
                  align="center"
                  animIn="pop"
                  animOut="none"
                  delayFrames={beat2}
                  style={{ width: 'auto' }}
                />
              </div>
            </div>

            {code ? (
              <div
                style={{
                  border: `2px dashed ${theme.palette.accent2}`,
                  backgroundColor: hexToRgba(theme.palette.bg, 0.55),
                  borderRadius: Math.round(10 * theme.mood.radiusScale),
                  paddingLeft: Math.round(px(u, 2.8)),
                  paddingRight: Math.round(px(u, 2.8)),
                  paddingTop: Math.round(px(u, 1.0)),
                  paddingBottom: Math.round(px(u, 1.0)),
                  fontFamily: theme.bodyFontFamily,
                  fontSize: Math.round(px(u, 3.3)),
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: theme.palette.text,
                }}
              >
                {code}
              </div>
            ) : null}

            <KitButton
              text={cta}
              icon="arrow-right"
              bgColor={theme.palette.accent}
              textColor={theme.palette.onAccent}
              radius={Math.round(14 * theme.mood.radiusScale)}
              fontFamily={theme.bodyFontFamily}
              fontSize={Math.round(px(u, 3.5))}
              paddingX={Math.round(px(u, 4.2))}
              paddingY={Math.round(px(u, 1.9))}
              animIn="pop"
              animOut="none"
              delayFrames={beat3}
            />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Variant A (Default): Card with hero price
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
            width: cardWidth,
            minHeight: isVertical ? Math.round(contentHeight * 0.58) : undefined,
            borderRadius: Math.round(24 * theme.mood.radiusScale),
            padding: Math.round(px(u, isVertical ? 4.4 : 3.6)),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            ...cardSurface,
            ...cardMotion,
          }}
        >
          <KitStack
            direction="column"
            gap={Math.round(px(u, isVertical ? 2.6 : 2.0))}
            align="center"
            width="100%"
          >
            <KitBadge
              text={badge}
              icon="tag"
              bgColor={theme.palette.accent}
              textColor={theme.palette.onAccent}
              radius={Math.round(10 * theme.mood.radiusScale)}
              fontFamily={theme.bodyFontFamily}
              fontSize={badgeMin}
              paddingX={Math.round(px(u, 2.4))}
              paddingY={Math.round(px(u, 1.0))}
              animIn="pop"
              animOut="none"
              delayFrames={beat0}
            />

            <KitText
              text={headline}
              maxWidth={cardWidth - Math.round(px(u, 6))}
              maxHeight={Math.round(px(u, 20))}
              fontFamily={theme.titleFontFamily}
              fontWeight={theme.mood.titleWeight}
              minSize={titleMin}
              maxSize={titleMax}
              maxLines={2}
              lineHeight={1.12}
              letterSpacing={theme.mood.tracking}
              uppercase={theme.style.uppercaseHeadings}
              color={theme.palette.text}
              align="center"
              animIn={motion.animIn}
              animOut="none"
              delayFrames={beat1}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'center',
                gap: Math.round(px(u, 2.0)),
                flexWrap: 'wrap',
              }}
            >
              <KitText
                text={price}
                maxWidth={Math.round(cardWidth * 0.65)}
                maxHeight={Math.round(px(u, 16))}
                fontFamily={theme.titleFontFamily}
                fontWeight={800}
                minSize={Math.round(px(u, 5.6))}
                maxSize={Math.round(px(u, isVertical ? 11.4 : 9.8))}
                maxLines={1}
                color={theme.palette.accent2}
                align="center"
                animIn="pop"
                animOut="none"
                delayFrames={beat2}
                style={{ width: 'auto' }}
              />
              {originalPrice ? (
                <span
                  style={{
                    fontFamily: theme.bodyFontFamily,
                    fontSize: Math.round(px(u, 3.8)),
                    fontWeight: 600,
                    color: theme.palette.muted,
                    textDecoration: 'line-through',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {originalPrice}
                </span>
              ) : null}
            </div>

            {details ? (
              <KitText
                text={details}
                maxWidth={cardWidth - Math.round(px(u, 8))}
                maxHeight={Math.round(px(u, 12))}
                fontFamily={theme.bodyFontFamily}
                fontWeight={theme.mood.bodyWeight}
                minSize={detailsMin}
                maxSize={detailsMax}
                maxLines={2}
                lineHeight={1.3}
                color={theme.palette.muted}
                align="center"
                animIn="fade-up"
                animOut="none"
                delayFrames={beat2}
              />
            ) : null}

            {code ? (
              <div
                style={{
                  border: `2px dashed ${theme.palette.accent2}`,
                  backgroundColor: hexToRgba(theme.palette.bg, 0.55),
                  borderRadius: Math.round(10 * theme.mood.radiusScale),
                  paddingLeft: Math.round(px(u, 2.6)),
                  paddingRight: Math.round(px(u, 2.6)),
                  paddingTop: Math.round(px(u, 1.0)),
                  paddingBottom: Math.round(px(u, 1.0)),
                  fontFamily: theme.bodyFontFamily,
                  fontSize: Math.round(px(u, 3.3)),
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: theme.palette.text,
                }}
              >
                {code}
              </div>
            ) : (
              <KitDivider
                width={Math.round(px(u, 12))}
                thickness={3}
                color={theme.palette.accent}
                animOut="none"
                delayFrames={beat2}
              />
            )}

            <KitButton
              text={cta}
              icon="arrow-right"
              bgColor={theme.palette.accent}
              textColor={theme.palette.onAccent}
              radius={Math.round(14 * theme.mood.radiusScale)}
              fontFamily={theme.bodyFontFamily}
              fontSize={Math.round(px(u, 3.5))}
              paddingX={Math.round(px(u, 4.2))}
              paddingY={Math.round(px(u, 1.9))}
              animIn="pop"
              animOut="none"
              delayFrames={beat3}
            />
          </KitStack>
        </div>
      </div>
    </AbsoluteFill>
  );
}
