/*
 * DONUT TOWER balance model
 *
 * This file intentionally has no DOM, Canvas, timer, or game-state
 * dependencies.  It is a small deterministic model that a game loop can
 * choose to call after a real landing has already been resolved.
 */
(function exposeBalanceModel(root, factory) {
  const balance = factory();

  // Browser use: load this file before the code that wants to consume it.
  if (root && typeof root === 'object') root.DonutTowerBalance = balance;

  // CommonJS is deliberately optional so the same unbundled file can be
  // evaluated in Node or a VM-based validator without a build step.
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = balance;
  }
}(typeof window !== 'undefined'
  ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this), () => {
  'use strict';

  const DEFAULT_CONFIG = Object.freeze({
    // A landing is measured from the support donut's centre to the player
    // contact point.  The default is the 172px art width minus its 7px body
    // inset on each side: (172 / 2) - 7 = 79px.
    supportHalfWidth: 79,
    // Landings this close to the centre add no lean at all.
    deadZone: 0.10,
    // Each higher donut makes an equally off-centre landing slightly riskier.
    heightSensitivity: 0.025,
    heightMultiplierCap: 1.75,
    // Base load from a fully edge-biased landing before streak and height.
    // Deliberately forgiving at low height: three visibly one-sided landings
    // warn the player, but do not instantly end an early-stage run.
    landingWeight: 0.16,
    // Repeating the same side compounds the next landing's load.
    sameSideStreakWeight: 0.11,
    // An opposite-side landing removes this fraction of existing lean first.
    oppositeSideRecovery: 0.60,
    // A centred landing gently settles an already leaning tower.
    centerRecovery: 0.08,
    // Balance is normalized; either signed edge reaching this limit falls.
    collapseThreshold: 1.15,
    maxNormalizedOffset: 1,
    // Rendering consumers may turn the signed balance into this visual lean.
    maxTiltRadians: 0.28,
  });

  const CONFIG_KEYS = Object.freeze([
    'supportHalfWidth',
    'deadZone',
    'heightSensitivity',
    'heightMultiplierCap',
    'landingWeight',
    'sameSideStreakWeight',
    'oppositeSideRecovery',
    'centerRecovery',
    'collapseThreshold',
    'maxNormalizedOffset',
    'maxTiltRadians',
  ]);

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function firstFinite(...values) {
    return values.find(isFiniteNumber);
  }

  function sideFromSignedValue(value) {
    if (value < 0) return 'left';
    if (value > 0) return 'right';
    return 'center';
  }

  function directionFrom(value) {
    if (value === 'left' || value === -1 || value < 0) return -1;
    if (value === 'right' || value === 1 || value > 0) return 1;
    return 0;
  }

  function configValue(value, fallback, minimum, maximum) {
    if (!isFiniteNumber(value)) return fallback;
    return clamp(value, minimum, maximum);
  }

  function makeConfig(...sources) {
    const values = { ...DEFAULT_CONFIG };
    sources.forEach((source) => {
      if (!source || typeof source !== 'object') return;
      const nested = source.config && typeof source.config === 'object' ? source.config : null;
      CONFIG_KEYS.forEach((key) => {
        if (isFiniteNumber(nested?.[key])) values[key] = nested[key];
        if (isFiniteNumber(source[key])) values[key] = source[key];
      });
    });

    values.supportHalfWidth = configValue(values.supportHalfWidth, DEFAULT_CONFIG.supportHalfWidth, 1, 100000);
    values.deadZone = configValue(values.deadZone, DEFAULT_CONFIG.deadZone, 0, 0.95);
    values.heightSensitivity = configValue(values.heightSensitivity, DEFAULT_CONFIG.heightSensitivity, 0, 10);
    values.heightMultiplierCap = configValue(values.heightMultiplierCap, DEFAULT_CONFIG.heightMultiplierCap, 1, 1000);
    values.landingWeight = configValue(values.landingWeight, DEFAULT_CONFIG.landingWeight, 0, 1000);
    values.sameSideStreakWeight = configValue(values.sameSideStreakWeight, DEFAULT_CONFIG.sameSideStreakWeight, 0, 1000);
    values.oppositeSideRecovery = configValue(values.oppositeSideRecovery, DEFAULT_CONFIG.oppositeSideRecovery, 0, 1);
    values.centerRecovery = configValue(values.centerRecovery, DEFAULT_CONFIG.centerRecovery, 0, 1);
    values.collapseThreshold = configValue(values.collapseThreshold, DEFAULT_CONFIG.collapseThreshold, 0.000001, 100000);
    values.maxNormalizedOffset = configValue(values.maxNormalizedOffset, DEFAULT_CONFIG.maxNormalizedOffset, 0.000001, 1);
    values.maxTiltRadians = configValue(values.maxTiltRadians, DEFAULT_CONFIG.maxTiltRadians, 0, Math.PI / 2);

    return Object.freeze(values);
  }

  function actualOffsetPx(landing) {
    if (isFiniteNumber(landing)) return landing;
    if (!landing || typeof landing !== 'object') return 0;

    const explicitOffset = firstFinite(
      landing.actualOffsetPx,
      landing.actualOffset,
      landing.landingOffsetPx,
      landing.landingOffset,
      landing.offsetPx,
      landing.offset,
    );
    if (isFiniteNumber(explicitOffset)) return explicitOffset;

    const contactX = firstFinite(
      landing.playerX,
      landing.characterX,
      landing.contactX,
      landing.landingX,
    );
    const supportX = firstFinite(
      landing.donutX,
      landing.platformX,
      landing.landingCenterX,
      landing.supportX,
    );
    return isFiniteNumber(contactX) && isFiniteNumber(supportX) ? contactX - supportX : 0;
  }

  function supportHalfWidthFor(landing, config) {
    if (!landing || typeof landing !== 'object') return config.supportHalfWidth;
    const explicitHalfWidth = firstFinite(
      landing.supportHalfWidth,
      landing.platformHalfWidth,
      landing.halfWidth,
    );
    if (isFiniteNumber(explicitHalfWidth) && explicitHalfWidth > 0) return explicitHalfWidth;
    if (isFiniteNumber(landing.donutWidth) && landing.donutWidth > 0) return landing.donutWidth / 2;
    if (isFiniteNumber(landing.platformWidth) && landing.platformWidth > 0) return landing.platformWidth / 2;
    if (isFiniteNumber(landing.width) && landing.width > 0) return landing.width / 2;
    return config.supportHalfWidth;
  }

  /**
   * Converts a real signed contact offset in pixels to [-1, 1].
   * Negative means left of the support centre; positive means right.
   *
   * A number is treated as pixels.  The canonical coordinate shape is
   * `{ landingX, supportX, centerX, width }`; `centerX` is the common world
   * origin and makes an omitted support resolve to the tower centre.  The
   * subtract-then-normalize formulation preserves the actual contact offset
   * even when the whole tower is shifted on screen.
   */
  function normalizeLandingOffset(landing, options) {
    const config = makeConfig(options);
    if (landing && typeof landing === 'object' && isFiniteNumber(landing.normalizedOffset)) {
      return clamp(landing.normalizedOffset, -config.maxNormalizedOffset, config.maxNormalizedOffset);
    }
    if (landing && typeof landing === 'object' && isFiniteNumber(landing.landingX)) {
      const centerX = isFiniteNumber(landing.centerX) ? landing.centerX : 0;
      const supportX = isFiniteNumber(landing.supportX) ? landing.supportX : centerX;
      const actualOffset = (landing.landingX - centerX) - (supportX - centerX);
      const width = supportHalfWidthFor(landing, config);
      return clamp(actualOffset / width, -config.maxNormalizedOffset, config.maxNormalizedOffset);
    }
    const width = supportHalfWidthFor(landing, config);
    const offset = actualOffsetPx(landing);
    return clamp(offset / width, -config.maxNormalizedOffset, config.maxNormalizedOffset);
  }

  function createBalanceState(options = {}) {
    const config = makeConfig(options);
    const balance = clamp(
      isFiniteNumber(options.balance) ? options.balance : 0,
      -config.collapseThreshold,
      config.collapseThreshold,
    );
    const collapsed = Boolean(options.collapsed ?? options.collapse) || Math.abs(balance) >= config.collapseThreshold;
    const direction = directionFrom(options.lastDirection ?? options.lastSide);
    const collapseDirection = collapsed
      ? (options.collapseDirection === 'left' || options.collapseDirection === 'right'
        ? options.collapseDirection
        : sideFromSignedValue(balance))
      : null;
    const dangerRatio = Math.abs(balance) / config.collapseThreshold;
    const tiltRadians = clamp(balance / config.collapseThreshold, -1, 1) * config.maxTiltRadians;

    return {
      height: Math.max(0, Math.floor(isFiniteNumber(options.height) ? options.height : 0)),
      balance,
      lastDirection: direction === 0 ? null : sideFromSignedValue(direction),
      lastSide: sideFromSignedValue(direction),
      sameSideStreak: Math.max(0, Math.floor(isFiniteNumber(options.sameSideStreak) ? options.sameSideStreak : 0)),
      collapsed,
      collapse: collapsed,
      collapseLimit: config.collapseThreshold,
      dangerRatio,
      collapseDirection,
      tiltRadians,
      lastLanding: null,
      config,
    };
  }

  function stateFrom(previous, config) {
    if (!previous || typeof previous !== 'object') return createBalanceState({ config });
    return createBalanceState({
      config,
      height: previous.height,
      balance: previous.balance,
      lastDirection: previous.lastDirection ?? previous.lastSide,
      sameSideStreak: previous.sameSideStreak,
      collapsed: previous.collapsed ?? previous.collapse,
      collapseDirection: previous.collapseDirection,
    });
  }

  /**
   * Advances one resolved landing without mutating `previousState`.
   *
   * The result includes `lastLanding` diagnostics so integration code can
   * render a lean or explain a collapse without reimplementing the math.
   */
  function advanceBalance(previousState, landing, options = {}) {
    const config = makeConfig(previousState?.config, options);
    const previous = stateFrom(previousState, config);
    if (previous.collapsed) {
      return {
        ...previous,
        ignoredLanding: true,
      };
    }

    const requestedStep = landing && typeof landing === 'object' && isFiniteNumber(landing.step)
      ? Math.floor(landing.step)
      : null;
    const height = requestedStep && requestedStep > 0 ? requestedStep : previous.height + 1;
    const rawOffsetPx = actualOffsetPx(landing);
    const supportHalfWidth = supportHalfWidthFor(landing, config);
    const normalizedOffset = normalizeLandingOffset(landing, config);
    const magnitude = Math.abs(normalizedOffset);
    const effectiveMagnitude = magnitude <= config.deadZone
      ? 0
      : (magnitude - config.deadZone) / (config.maxNormalizedOffset - config.deadZone);
    const direction = effectiveMagnitude === 0 ? 0 : (normalizedOffset < 0 ? -1 : 1);
    const previousDirection = directionFrom(previous.lastDirection);
    const sameSideStreak = direction === 0
      ? 0
      : (direction === previousDirection ? previous.sameSideStreak + 1 : 1);
    const isOppositeSide = direction !== 0
      && previousDirection !== 0
      && direction !== previousDirection;
    const heightMultiplier = Math.min(
      config.heightMultiplierCap,
      1 + ((height - 1) * config.heightSensitivity),
    );
    const streakMultiplier = direction === 0
      ? 1
      : 1 + ((sameSideStreak - 1) * config.sameSideStreakWeight);
    const recoveryApplied = isOppositeSide ? Math.abs(previous.balance) * config.oppositeSideRecovery : 0;

    let balance = previous.balance;
    if (direction === 0) {
      balance *= 1 - config.centerRecovery;
    } else {
      if (isOppositeSide) balance *= 1 - config.oppositeSideRecovery;
      balance += direction * config.landingWeight * effectiveMagnitude * heightMultiplier * streakMultiplier;
    }

    const collapsed = Math.abs(balance) >= config.collapseThreshold;
    const collapseDirection = collapsed ? sideFromSignedValue(balance) : null;
    const dangerRatio = Math.abs(balance) / config.collapseThreshold;
    const tiltRadians = clamp(balance / config.collapseThreshold, -1, 1) * config.maxTiltRadians;
    const contribution = balance - (isOppositeSide
      ? previous.balance * (1 - config.oppositeSideRecovery)
      : (direction === 0 ? previous.balance * (1 - config.centerRecovery) : previous.balance));

    return {
      height,
      balance,
      lastDirection: direction === 0 ? null : sideFromSignedValue(direction),
      lastSide: sideFromSignedValue(direction),
      sameSideStreak,
      collapsed,
      collapse: collapsed,
      collapseLimit: config.collapseThreshold,
      dangerRatio,
      collapseDirection,
      tiltRadians,
      lastLanding: {
        actualOffsetPx: rawOffsetPx,
        supportHalfWidth,
        normalizedOffset,
        effectiveMagnitude,
        direction: sideFromSignedValue(direction),
        sameSideStreak,
        heightMultiplier,
        streakMultiplier,
        recoveryApplied,
        contribution,
      },
      config,
    };
  }

  function collapseDirection(state) {
    if (!state || !state.collapsed) return null;
    return state.collapseDirection || sideFromSignedValue(state.balance);
  }

  /**
   * Integration-friendly reducer.  `landingOffset` is the normalized result
   * of `normalizeLandingOffset`; `step` is the newly landed stack step.
   */
  function advance(previous, landing = {}, options = {}) {
    const normalizedOffset = isFiniteNumber(landing?.landingOffset)
      ? landing.landingOffset
      : 0;
    return advanceBalance(previous, {
      normalizedOffset,
      step: landing?.step,
    }, options);
  }

  function classifyOffset(normalizedOffset, options) {
    const config = makeConfig(options);
    const offset = clamp(
      isFiniteNumber(normalizedOffset) ? normalizedOffset : 0,
      -config.maxNormalizedOffset,
      config.maxNormalizedOffset,
    );
    return Math.abs(offset) <= config.deadZone ? 'center' : sideFromSignedValue(offset);
  }

  function isCollapsed(state) {
    return Boolean(state?.collapse ?? state?.collapsed);
  }

  return Object.freeze({
    DEFAULT_CONFIG,
    createBalanceState,
    createState: createBalanceState,
    normalizeLandingOffset,
    normalizeActualLandingOffset: normalizeLandingOffset,
    normaliseLandingOffset: normalizeLandingOffset,
    normaliseActualLandingOffset: normalizeLandingOffset,
    advanceBalance,
    advance,
    applyLanding: advance,
    classifyOffset,
    isCollapsed,
    collapseDirection,
  });
}));
