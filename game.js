(() => {
  'use strict';

  const WIDTH = 390;
  let HEIGHT = 844;
  const CENTER_X = WIDTH / 2;
  const BASE_TOP = 92;
  // These values are shared by the renderer and the collision code. A donut
  // never has a visually thin body but a different, invisible collision body.
  const STACK_RISE = 54;
  const DONUT_WIDTH = 172;
  const DONUT_HEIGHT = 56;
  // Visual only: give the alpha-trimmed artwork enough paint bleed to keep
  // adjacent donuts visually connected while their presentation-only landing
  // sway is active. Collision height, jump height, and stage layout stay
  // exactly as authored.
  const DONUT_RENDER_HEIGHT = 64;
  const DONUT_RENDER_TOP_OFFSET = 0;
  // Every platform type shares this small paint/collision overlap.  Keeping
  // it as an explicit contact value means a taller donut changes the next
  // platform's real upper surface instead of relying on a fixed stage pitch.
  const DONUT_STACK_OVERLAP = DONUT_HEIGHT - STACK_RISE;
  // A type owns geometry and future preview metadata; flavour remains a
  // separate visual choice.  Normal deliberately preserves the existing
  // 172×56 collision footprint and 172×59 paint box exactly.
  const DONUT_TYPES = Object.freeze({
    normal: Object.freeze({
      id: 'normal', width: DONUT_WIDTH, height: DONUT_HEIGHT,
      renderHeight: DONUT_RENDER_HEIGHT, preview: 'none',
    }),
    mini: Object.freeze({
      id: 'mini', width: Math.round(DONUT_WIDTH * 0.65), height: DONUT_HEIGHT,
      renderHeight: DONUT_RENDER_HEIGHT, preview: 'mini-outline',
    }),
  });
  // Stage data expresses incoming donut speed as a multiplier of this value.
  // Keeping the reference speed here makes the 1.0–1.3x course bands exact.
  const BASE_DONUT_SPEED = 300;
  const PLAYER_WIDTH = 40;
  const PLAYER_HEIGHT = 58;
  // Keep the physics foot anchor unchanged and tuck the grounded artwork by
  // three pixels. The handoff to and from this visual-only anchor is blended
  // below, so it cannot pop at takeoff or landing.
  const PLAYER_GROUNDED_CONTACT_OFFSET = 3;
  // Keep the established rounded-end landing width so the jump feel does not
  // change.  The refreshed pastry art fills the same 172×56 footprint, while
  // its vertical collision surface sits just one pixel inside the visible top
  // and bottom to prevent a perceived floating gap between stacked donuts.
  const DONUT_BODY_INSET_X = 7;
  const DONUT_BODY_INSET_Y = 1;
  const PLAYER_BODY_INSET_X = 4;
  const PLAYER_BODY_INSET_BOTTOM = 2;
  const PLAYER_BODY_INSET_TOP = 3;
  // The supplied Unity player has three colliders: a narrow central Player
  // collider that successfully catches a platform, plus two wider/taller
  // PlayerGameOver side sensors. Preserve those proportions in Canvas.
  const PLAYER_CORE_HALF_WIDTH = 6.625;
  const PLAYER_CORE_BOTTOM = 2;
  const PLAYER_CORE_TOP = 30.8;
  const PLAYER_SIDE_HALF_WIDTH = 4.845;
  const PLAYER_SIDE_CENTER_OFFSET = 11.16;
  const PLAYER_SIDE_BOTTOM = 6.5;
  const PLAYER_SIDE_TOP = 55;
  // A fixed-step arc keeps each jump readable: immediate launch, a brief
  // apex, then a slightly quicker fall. The rise gravity preserves the
  // requested ~98px reach; the fall gravity only removes the impression of
  // lingering at the top. No part of this trajectory references a donut,
  // so it cannot pull the player toward a moving target in midair.
  const PHYSICS_STEP = 1 / 120;
  const JUMP_VELOCITY = 695.5;
  const JUMP_RISE_GRAVITY = 2457;
  const JUMP_FALL_GRAVITY = 2990;
  const MAX_FALL_SPEED = 936;
  const TAKEOFF_POSE_TIME = 0.07;
  const APEX_VELOCITY_THRESHOLD = 106.6;
  const LANDING_POSE_TIME = 0.12;
  // Presentation-only landing values. They never feed back into y, vy,
  // collision, timing, or platform state.
  const TAKEOFF_SQUASH = -0.10;
  const LANDING_IMPACT_PORTION = 0.58;
  const LANDING_OVERSHOOT_SQUASH = -0.032;
  const LANDING_REJUMP_BLEND_TIME = 0.06;
  // Short presentation-only rewards for edge saves and PERFECT landings.
  // They never take part in collision, platform placement, or jump physics.
  const EDGE_LANDING_FACE_DURATION = 0.62;
  const EDGE_LANDING_FACE_THRESHOLD = 0.76;
  const EDGE_LANDING_OUTWARD_TILT = (5.5 * Math.PI) / 180;
  const EDGE_LANDING_TILT = (12 * Math.PI) / 180;
  const EDGE_LANDING_SWAY_TILT = (3 * Math.PI) / 180;
  const PERFECT_PLATFORM_REACTION_DURATION = 0.30;
  const PERFECT_PLATFORM_REACTION_SINK = 6;
  const PERFECT_PLATFORM_REACTION_REBOUND = 8;
  const PERFECT_PLAYER_SPIN_DELAY = 0.03;
  const PERFECT_PLAYER_SPIN_DURATION = 0.42;
  const PERFECT_PLAYER_SMILE_DURATION = 0.14;
  const PERFECT_PLAYER_HOP_HEIGHT = 22;
  // Keep a support donut's paint-only movement from appearing to pull the
  // mascot by a few pixels when the player lands or immediately jumps again.
  // This never changes the collision body, jump arc, or tower physics.
  const SUPPORT_VISUAL_BLEND_TIME = 0.075;
  // Per-platform landing response. These are canvas-only values: platform
  // top/x and the collision body are never updated from this animation.
  const PLATFORM_REACTION_PEAK_TIME = 0.06;
  const PLATFORM_REACTION_DURATION = 0.46;
  const PLATFORM_REACTION_MAX_SINK = 6;
  const PLATFORM_REACTION_MAX_ANGLE = (4.5 * Math.PI) / 180;
  const PLATFORM_REACTION_DAMPING = 12;
  const PLATFORM_REACTION_FREQUENCY = 22;
  // A landing can send a very small, delayed visual pulse through the three
  // donuts directly below it. These values are paint-only: they never alter a
  // platform's x/top, its collision body, the jump arc, or balance values.
  const TOWER_PULSE_MAX_DEPTH = 3;
  const TOWER_PULSE_DELAY_START = 0.012;
  const TOWER_PULSE_DELAY_STEP = 0.014;
  const TOWER_PULSE_DURATION = 0.54;
  const TOWER_PULSE_DAMPING = 7.5;
  const TOWER_PULSE_FREQUENCY = 26;
  const TOWER_PULSE_MAX_OFFSET_X = 2.2;
  const TOWER_PULSE_MAX_OFFSET_Y = 1.8;
  const TOWER_PULSE_MAX_ANGLE = (2.2 * Math.PI) / 180;
  const FAILURE_GRAVITY = 1950;
  const CADENCE_READ_BUFFER = 0.10;
  // Shorten only the quiet gap before the next donut enters. Its authored
  // horizontal speed, route, collision body, and stage data remain intact.
const DONUT_APPEARANCE_WAIT_REDUCTION = 1.40;
  const LAND_SETTLE_TIME = 0.10;
  const LAND_IMPACT_TIME = 0.48;
  const FAILURE_IMPACT_TIME = 0.88;
  // Balance is deliberately a light, readable game system rather than a
  // full physics simulation.  These values only affect the visual tower and
  // the collapse threshold; platform collision and the jump arc stay fixed.
  const TOWER_MAX_TILT_RADIANS = (13 * Math.PI) / 180;
  const TOWER_COLLAPSE_TIME = 1.15;
  const MAX_STAGE = 600;
  const STORAGE_KEY = 'donut-tower-progress-v1';
  // Audio is deliberately stored separately from game progress.  This keeps
  // a player's sound choice local to the device without changing saved stages
  // or the later GameBlox progress bridge payload.
  const AUDIO_STORAGE_KEY = 'donut-tower-audio-v1';
  const AUDIO_BUTTON_RECT = Object.freeze({ x: 328, y: 14, width: 48, height: 32 });
  const PLAY_AUDIO_BUTTON_RECT = Object.freeze({ x: 290, y: 14, width: 40, height: 42 });
  const PAUSE_BUTTON_RECT = Object.freeze({ x: 337, y: 14, width: 40, height: 42 });
  // This opt-in URL is deliberately separate from the normal game.  It lets
  // the owner compare course speeds without unlocking stages, rewriting a
  // save, or changing the authored course data seen by regular players.
  const SPEED_TEST_QUERY = new URLSearchParams('');
  // Local and file-based builds are for course QA, so developers can open
  // every stage without first replaying earlier ones. Public play always
  // follows the player's saved, sequential unlock progress.
  const LOCAL_STAGE_TEST_ENABLED = false;
  const ALL_STAGES_TEST_ENABLED = LOCAL_STAGE_TEST_ENABLED;
  const SPEED_TEST_ENABLED = SPEED_TEST_QUERY.get('speed-test') === '1';
  // This opt-in lab lives entirely outside the authored 600 stages.  It is
  // intentionally URL-gated so new mechanics can be tested without touching
  // player progress, stage data, or the normal game loop.
  const GIMMICK_TEST_ENABLED = SPEED_TEST_QUERY.get('gimmick-test') === '1';
  // A deliberately isolated visual/mechanics sample. It never participates
  // in the authored 600-stage table or the normal flavour rotation.
  const SLIPPERY_TEST_ENABLED = SPEED_TEST_QUERY.get('slippery-test') === '1';
  // This comparison route is deliberately separate from every authored
  // stage: normal, slippery, and squishy platforms can be judged side by
  // side without changing the live 600-stage sequence.
  const SURFACE_TEST_ENABLED = SPEED_TEST_QUERY.get('surface-test') === '1';
  // This is a private type-comparison lab.  Its six beats are intentionally
  // kept out of the authored 600-stage table while platform geometry is
  // verified in the real game loop.
  const DONUT_TYPES_TEST_ENABLED = SPEED_TEST_QUERY.get('donut-types-test') === '1';
  // A separate private course for the next two landing mechanics. It never
  // enters the authored 600-stage data or the regular flavour rotation.
  const LANDING_GIMMICK_TEST_ENABLED = SPEED_TEST_QUERY.get('landing-gimmick-test') === '1';
  // This private visual lab verifies special-donut telegraphs without adding
  // anything to the authored 600-stage sequence.
  const SPECIAL_DONUT_PREVIEW_TEST_ENABLED = SPEED_TEST_QUERY.get('special-donut-preview-test') === '1';
  const SPEED_TEST_PRESETS = Object.freeze({
    low: { label: '低速', multiplier: 1.00, color: '#7ba485' },
    standard: { label: '標準', multiplier: 1.15, color: '#c76a78' },
    high: { label: '高速', multiplier: 1.30, color: '#d58d4a' },
  });
  const SPEED_TEST_INITIAL_STAGE = clamp(Number(SPEED_TEST_QUERY.get('test-stage')) || 1, 1, MAX_STAGE);
  const SPEED_TEST_INITIAL_PRESET = SPEED_TEST_PRESETS[SPEED_TEST_QUERY.get('test-speed')]
    ? SPEED_TEST_QUERY.get('test-speed')
    : 'standard';
  // This link starts one authored course exactly as it plays in the normal
  // game, including its mixed per-donut speed profile. It is intentionally
  // separate from the comparison screen above, where one test speed applies
  // to every donut.
  const AUTHORED_STAGE_QUERY_VALUE = Number(SPEED_TEST_QUERY.get('play-stage'));
  const AUTHORED_STAGE_PREVIEW_ID = LOCAL_STAGE_TEST_ENABLED && !SPEED_TEST_ENABLED && !GIMMICK_TEST_ENABLED && !SLIPPERY_TEST_ENABLED && !SURFACE_TEST_ENABLED && !DONUT_TYPES_TEST_ENABLED && !LANDING_GIMMICK_TEST_ENABLED && !SPECIAL_DONUT_PREVIEW_TEST_ENABLED
    && Number.isInteger(AUTHORED_STAGE_QUERY_VALUE)
    && AUTHORED_STAGE_QUERY_VALUE >= 1
    && AUTHORED_STAGE_QUERY_VALUE <= MAX_STAGE
    ? AUTHORED_STAGE_QUERY_VALUE
    : null;
  const COLORS = ['#ef8aa2', '#f2b365', '#a782d7', '#65b9b0', '#e77f68', '#d99a50'];
  const FLAVOR_COLORS = {
    vanilla: '#f0bd61',
    strawberry: '#ef8aa2',
    cocoa: '#9b6959',
    matcha: '#75a77e',
    caramel: '#dc9b58',
  };
  // Visual palette only.  The platform dimensions and all collision data stay
  // separate below; this collection lets every frosting colour keep the same
  // clear, side-on 2D silhouette.
  const BAKERY = {
    ink: '#593941',
    inkSoft: '#81535a',
    wall: '#ffe9cb',
    wallShade: '#f6d3ac',
    trim: '#d88977',
    wood: '#c9825d',
    woodDark: '#8b5141',
    cream: '#fff6e5',
    dough: '#e6a15b',
    doughLight: '#ffc978',
    doughShadow: '#a75e41',
  };
  // These are visual-only, supplied reference backgrounds.  Their stage band
  // mapping deliberately stays separate from platforms, player physics, and
  // camera/gameplay data.
  const BACKGROUND_THEMES = Object.freeze([
    Object.freeze({
      id: 'night-shop', minStage: 1, maxStage: 100,
      asset: 'assets/background-stage-001-100-r1.png?v=background-reference-r1',
      top: '#171217', middle: '#282027', bottom: '#4b2b25', lane: '#14151e',
      accent: '#f3a34e', accentSoft: '#d0656b', counterTop: '#efb77e', counterFront: '#a95d45',
    }),
    Object.freeze({
      id: 'neon-street', minStage: 101, maxStage: 200,
      asset: 'assets/background-stage-101-200-r1.png?v=background-reference-r1',
      top: '#101126', middle: '#171733', bottom: '#21172b', lane: '#10131f',
      accent: '#5aa7d5', accentSoft: '#bb608c', counterTop: '#504050', counterFront: '#292537',
    }),
    Object.freeze({
      id: 'moonlit-wa-modern', minStage: 201, maxStage: 300,
      asset: 'assets/background-stage-201-300-r1.png?v=background-reference-r1',
      top: '#15151b', middle: '#202028', bottom: '#33231f', lane: '#161820',
      accent: '#d4a85a', accentSoft: '#8f3e45', counterTop: '#766052', counterFront: '#382d2c',
    }),
    Object.freeze({
      id: 'midnight-cafe', minStage: 301, maxStage: 400,
      asset: 'assets/background-stage-301-400-r1.png?v=background-reference-r1',
      top: '#161318', middle: '#2b2021', bottom: '#483126', lane: '#1a171b',
      accent: '#d59a57', accentSoft: '#a36b4c', counterTop: '#79533a', counterFront: '#38251f',
    }),
    Object.freeze({
      id: 'dreamy-night-sweets', minStage: 401, maxStage: 500,
      asset: 'assets/background-stage-401-500-r1.png?v=background-reference-r1',
      top: '#20213d', middle: '#343455', bottom: '#4a3956', lane: '#252642',
      accent: '#a8b8ed', accentSoft: '#c987b4', counterTop: '#6d5a72', counterFront: '#373044',
    }),
    Object.freeze({
      id: 'night-sweets-castle', minStage: 501, maxStage: 600,
      asset: 'assets/background-stage-501-600-r1.png?v=background-reference-r1',
      top: '#171222', middle: '#2a1936', bottom: '#3f2835', lane: '#181421',
      accent: '#d6ad5f', accentSoft: '#c26890', counterTop: '#6b4e54', counterFront: '#312331',
    }),
  ]);
  // Presentation-only framing adjustments. They deliberately do not move the
  // goal or base platform in game space.
  const GOAL_SIGN_VISUAL_DROP = 32;
  const COUNTER_VISUAL_RAISE = 18;
  const FROSTING = {
    strawberry: { base: '#f18aa6', shade: '#c85b78', highlight: '#ffd6df' },
    vanilla: { base: '#fff0c8', shade: '#e6c384', highlight: '#fffaf0' },
    cocoa: { base: '#9a6254', shade: '#68413e', highlight: '#d8a58a' },
    matcha: { base: '#8eb56f', shade: '#638a58', highlight: '#d9efad' },
    caramel: { base: '#eea25a', shade: '#bd6741', highlight: '#ffd28b' },
  };
  const DONUT_FLAVORS = Object.freeze(['vanilla', 'strawberry', 'cocoa', 'matcha', 'caramel']);
  const GIMMICK_TEST_BEATS = Object.freeze([
    // A single familiar approach makes the first jump a safe calibration.
    { side: 'left', delayMs: 1600, speedMultiplier: 0.82, flavor: 'vanilla' },
    // A straightforward fast donut is kept separate from the feint samples
    // so its constant, high-speed rhythm can be judged on its own.
    { side: 'right', delayMs: 1650, speedMultiplier: 1.30, flavor: 'cocoa', gimmick: 'speed' },
    // Slide: the player is carried a short, clearly visible distance.
    { side: 'right', delayMs: 1700, speedMultiplier: 0.84, flavor: 'strawberry', gimmick: 'slide', slideDistance: -24 },
    { side: 'left', delayMs: 1700, speedMultiplier: 0.88, flavor: 'matcha', gimmick: 'slide', slideDistance: 24 },
    { side: 'right', delayMs: 1700, speedMultiplier: 0.92, flavor: 'caramel', gimmick: 'slide', slideDistance: -24 },
    // Crack: each sample is readable, but rewards jumping once the next
    // donut arrives rather than waiting on the old one.
    { side: 'left', delayMs: 1600, speedMultiplier: 0.78, flavor: 'cocoa', gimmick: 'crack', crackDuration: 2.70 },
    { side: 'right', delayMs: 1500, speedMultiplier: 0.78, flavor: 'vanilla', gimmick: 'crack', crackDuration: 2.40 },
    { side: 'left', delayMs: 1500, speedMultiplier: 0.80, flavor: 'strawberry', gimmick: 'crack', crackDuration: 2.15 },
    // Feint speed: only the horizontal velocity changes mid-approach; the
    // landing point and the player's established jump physics stay intact.
    { side: 'right', delayMs: 1700, speedMultiplier: 0.75, flavor: 'matcha', gimmick: 'feint-accelerate', feintAt: 0.55, feintMultiplier: 1.30 },
    { side: 'left', delayMs: 1700, speedMultiplier: 1.10, flavor: 'caramel', gimmick: 'feint-decelerate', feintAt: 0.48, feintMultiplier: 0.65 },
    { side: 'right', delayMs: 1700, speedMultiplier: 0.82, flavor: 'cocoa', gimmick: 'feint-accelerate', feintAt: 0.45, feintMultiplier: 1.30 },
  ]);
  // This two-step course is private to `?slippery-test=1`. Its first moving
  // platform lands slightly off-centre so the small outward drift is readable;
  // the second is a normal donut for an immediate comparison.
  const SLIPPERY_TEST_BEATS = Object.freeze([
    { side: 'left', delayMs: 1800, offset: 20, speedMultiplier: 0.90, flavor: 'vanilla' },
    { side: 'right', delayMs: 1800, offset: 0, speedMultiplier: 0.90, flavor: 'strawberry' },
  ]);
  // Private only: a calm normal → slippery → squishy → normal route. The
  // slippery target is deliberately offset enough to show its grounded drift
  // without putting the player near the collision edge.
  const SURFACE_TEST_BEATS = Object.freeze([
    { side: 'left', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'vanilla' },
    { side: 'left', delayMs: 1950, offset: -25, speedMultiplier: 0.90, flavor: 'strawberry' },
    { side: 'left', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'matcha' },
    { side: 'right', delayMs: 1950, offset: 0, speedMultiplier: 0.90, flavor: 'cocoa' },
  ]);
  // Private only: the type lab keeps the regular jump route intact while
  // comparing the remaining platform silhouettes.
  const DONUT_TYPES_TEST_BEATS = Object.freeze([
    { side: 'left', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'vanilla', donutType: 'normal' },
    { side: 'right', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'strawberry', donutType: 'normal' },
    { side: 'left', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'cocoa', donutType: 'normal' },
    { side: 'right', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'matcha', donutType: 'normal' },
    { side: 'left', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'caramel', donutType: 'normal' },
    { side: 'right', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'strawberry', donutType: 'mini' },
  ]);
  // Private only: the first two moving platforms are ordinary donuts. The
  // second is marked consecutive so its landing-to-landing cadence is 75% of
  // the normal read interval. The third is the one squishy test platform;
  // the final ordinary donut verifies that jumping while it settles remains
  // unchanged.
  const LANDING_GIMMICK_TEST_BEATS = Object.freeze([
    { side: 'left', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'vanilla' },
    { side: 'right', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'strawberry', consecutive: true },
    { side: 'left', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'matcha', squishy: true },
    { side: 'right', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'cocoa' },
  ]);
  // A visual-only test route.  The repeated mini platform lets the lab check
  // that its first-use explanation does not return on a second appearance.
  // The pair marker is deliberately attached to the first ordinary donut;
  // its following beat retains the existing consecutive timing unchanged.
  const SPECIAL_DONUT_PREVIEW_TEST_BEATS = Object.freeze([
    { side: 'left', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'strawberry', donutType: 'mini' },
    { side: 'right', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'vanilla' },
    { side: 'left', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'caramel', donutType: 'mini' },
    { side: 'right', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'matcha', donutType: 'normal' },
    { side: 'left', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'cocoa', donutType: 'mini' },
    { side: 'right', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'vanilla', previewSpecial: 'consecutive' },
    { side: 'left', delayMs: 1900, offset: 0, speedMultiplier: 0.90, flavor: 'strawberry', consecutive: true },
    { side: 'right', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'matcha', squishy: true },
    { side: 'left', delayMs: 2050, offset: 0, speedMultiplier: 0.90, flavor: 'cocoa' },
  ]);
  const SPECIAL_DONUT_PREVIEW_INFO = Object.freeze({
    mini: { label: 'ミニ', hint: '小さな足場に注意！' },
    consecutive: { label: '連続', hint: 'すぐ次のドーナツが来るよ！' },
    squishy: { label: 'ぷるぷる', hint: '乗ると少し沈むよ！' },
  });
  const SPECIAL_DONUT_PREVIEW_LEAD_TIME = 0.8;
  const SPECIAL_DONUT_CUE_DURATION = 0.72;
  const SPECIAL_DONUT_INTRO_DURATION = 1.35;
  const SQUISHY_SINK_RATIO = 0.20;
  const SQUISHY_RETURN_DURATION = 0.58;
  // The slippery platform is deliberately forgiving at the centre, then
  // becomes more readable toward its sides.  These values remain visual /
  // grounded-player only: the platform's collision and landing range stay
  // exactly as they are for every other donut.
  const SLIPPERY_DRIFT_DEAD_ZONE = 5;
  const SLIPPERY_DRIFT_REFERENCE_OFFSET = DONUT_WIDTH * 0.34;
  const SLIPPERY_DRIFT_MAX_DISTANCE = 26;
  const SLIPPERY_DRIFT_MAX_SPEED = 225;
  const SLIPPERY_DRIFT_MIN_DURATION = 0.24;
  const SLIPPERY_DRIFT_MAX_DURATION = 0.44;
  const SLIPPERY_DRIFT_START_DELAY = 0.01;
  const SLIPPERY_SHEEN_DURATION = 0.40;

  const canvas = document.getElementById('game');
  const tapTarget = document.getElementById('tap-target');
  const ctx = canvas.getContext('2d', { alpha: false });
  // This game now uses illustrated high-resolution art rather than pixel-art
  // sprites. Keep every image pass smoothly interpolated on mobile displays.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // The visual layer deliberately loads real game art independently from the
  // stage and collision data below.  If an image cannot load, the existing
  // Canvas drawing remains as a safe fallback instead of affecting a run.
  const ARTWORK_SOURCES = Object.freeze({
    // Test-only visual swap: the same donut mascot artwork is used in both
    // states so the established jump physics and timing remain untouched.
    mascotIdle: 'assets/donut-mascot-test-r1.png?v=donut-stack-test-r2',
    mascotJump: 'assets/donut-mascot-test-r1.png?v=donut-stack-test-r2',
    // The five platform sprites share one normalized visible box and pivot.
    // They are paint only: the established 172×57 render rectangle, collision
    // body, stack rise, and player landing coordinates stay exactly as-is.
    donutStrawberry: 'assets/donut-strawberry-platform-r4.png?v=platform-proportions-r1',
    donutVanilla: 'assets/donut-vanilla-platform-r4.png?v=platform-proportions-r1',
    donutCocoa: 'assets/donut-cocoa-platform-r4.png?v=platform-proportions-r1',
    donutMatcha: 'assets/donut-mint-platform-r4.png?v=platform-proportions-r1',
    donutCaramel: 'assets/donut-lavender-platform-r4.png?v=platform-proportions-r1',
    // Test-only source. It is clipped through the normal platform alpha mask
    // before drawing, so its gloss changes without changing any visible bounds.
    donutSlippery: 'assets/donut-slippery-platform-test-r1.png?v=slippery-test-r1',
  });
  const artwork = Object.create(null);
  const backgroundArtwork = Object.create(null);
  let slipperyArtwork = null;

  const fallbackProgress = { unlocked: 1, selected: 1, completed: [] };
  const state = {
    screen: 'home',
    selectedStage: 1,
    chapterPage: 1,
    progress: loadProgress(),
    stage: null,
    player: null,
    platforms: [],
    nextBeatIndex: 0,
    spawnWait: 0,
    activeDonut: null,
    elapsed: 0,
    cameraY: 0,
    cameraTargetY: 0,
    hintPulse: 0,
    transitionDelay: 0,
    resultReason: '',
    playPaused: false,
    // Display-only run feedback for the result screen. It never changes the
    // landing rule, stage progress, or score.
    perfectLandings: 0,
    physicsAccumulator: 0,
    effects: [],
    message: null,
    // This is separate from the normal landing/feedback message so the test
    // telegraph cannot be replaced by a landing result in the same frame.
    specialDonutPreview: {
      cue: null,
      intro: null,
      announcedSteps: new Set(),
      seenKinds: new Set(),
    },
    cameraShake: 0,
    failure: null,
    tower: null,
    flavorBag: [],
    flavorBagCycle: 0,
    lastFlavor: null,
    lastFrame: performance.now(),
    assetsReady: false,
    speedTest: {
      enabled: SPEED_TEST_ENABLED,
      running: false,
      selectedStage: SPEED_TEST_INITIAL_STAGE,
      selectedPreset: SPEED_TEST_INITIAL_PRESET,
    },
    authoredStagePreview: {
      enabled: AUTHORED_STAGE_PREVIEW_ID !== null,
      running: false,
      stageId: AUTHORED_STAGE_PREVIEW_ID,
    },
    gimmickTest: {
      enabled: GIMMICK_TEST_ENABLED,
      running: false,
    },
    slipperyTest: {
      enabled: SLIPPERY_TEST_ENABLED,
      running: false,
    },
    surfaceTest: {
      enabled: SURFACE_TEST_ENABLED,
      running: false,
    },
    donutTypesTest: {
      enabled: DONUT_TYPES_TEST_ENABLED,
      running: false,
    },
    landingGimmickTest: {
      enabled: LANDING_GIMMICK_TEST_ENABLED,
      running: false,
    },
    specialDonutPreviewTest: {
      enabled: SPECIAL_DONUT_PREVIEW_TEST_ENABLED,
      running: false,
    },
  };

  // Create the controller before URL-gated stages can call startStage().
  // It does not create an AudioContext or play anything until a real input.
  const audio = createAudioController();

  function loadArtwork() {
    const entries = Object.entries(ARTWORK_SOURCES);
    let settled = 0;
    const markSettled = () => {
      settled += 1;
      if (settled === entries.length) state.assetsReady = true;
    };
    entries.forEach(([key, source]) => {
      const image = new Image();
      image.decoding = 'async';
      image.addEventListener('load', markSettled, { once: true });
      image.addEventListener('error', markSettled, { once: true });
      image.src = new URL(source, document.baseURI).href;
      artwork[key] = image;
    });
  }

  function getArtwork(key) {
    const image = artwork[key];
    return image && image.complete && image.naturalWidth > 0 ? image : null;
  }

  function getSlipperyPlatformArtwork() {
    if (slipperyArtwork) return slipperyArtwork;
    const glaze = getArtwork('donutSlippery');
    const normalMask = getArtwork('donutVanilla');
    if (!normalMask) return null;
    if (!glaze) return normalMask;

    // The generated glaze is deliberately kept as a source illustration. Its
    // pixels are remapped into the normal 688×228 platform frame, then masked
    // by an existing normal donut. That gives this test art the exact same
    // outer silhouette, transparent padding, top/bottom and stack overlap as
    // every production platform without touching collision data.
    const surface = document.createElement('canvas');
    surface.width = normalMask.naturalWidth;
    surface.height = normalMask.naturalHeight;
    const surfaceContext = surface.getContext('2d');
    if (!surfaceContext) return glaze;
    surfaceContext.imageSmoothingEnabled = true;
    surfaceContext.imageSmoothingQuality = 'high';
    surfaceContext.drawImage(glaze, 0, 1, 661, 222, 0, 0, surface.width, surface.height);
    surfaceContext.globalCompositeOperation = 'destination-in';
    surfaceContext.drawImage(normalMask, 0, 0, surface.width, surface.height);
    slipperyArtwork = surface;
    return slipperyArtwork;
  }

  function getBackgroundTheme(stageId = state.stage?.id) {
    const id = clamp(Number(stageId) || 1, 1, MAX_STAGE);
    return BACKGROUND_THEMES.find((theme) => id >= theme.minStage && id <= theme.maxStage)
      || BACKGROUND_THEMES[0];
  }

  function preloadBackgroundTheme(theme) {
    if (!theme?.asset || backgroundArtwork[theme.id]) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = new URL(theme.asset, document.baseURI).href;
    backgroundArtwork[theme.id] = image;
  }

  function preloadBackgroundThemesForStage(stageId) {
    const id = clamp(Number(stageId) || 1, 1, MAX_STAGE);
    const current = getBackgroundTheme(id);
    preloadBackgroundTheme(current);
    // Near a world boundary, quietly load only the next background. This is
    // deliberately visual-only and prevents a six-image startup download.
    const nextWorldStart = Math.floor((id - 1) / 100) * 100 + 101;
    if (id >= nextWorldStart - 6 && nextWorldStart <= MAX_STAGE) {
      const next = getBackgroundTheme(nextWorldStart);
      if (next.id !== current.id) preloadBackgroundTheme(next);
    }
  }

  function getBackgroundArtwork(theme) {
    const image = backgroundArtwork[theme?.id];
    return image && image.complete && image.naturalWidth > 0 ? image : null;
  }

  loadArtwork();

  state.selectedStage = clamp(state.progress.selected || state.progress.unlocked || 1, 1, MAX_STAGE);
  state.chapterPage = Math.ceil(state.selectedStage / 30);
  // The menu always uses the first world's shop, regardless of saved progress.
  preloadBackgroundTheme(BACKGROUND_THEMES[0]);
  preloadBackgroundThemesForStage(state.selectedStage);
  if (state.specialDonutPreviewTest.enabled) {
    // Keep this forecast check private until special donuts are deliberately
    // placed in the authored stage table.
    startStage(0, { specialDonutPreviewTest: true });
  } else if (state.landingGimmickTest.enabled) {
    // Keep this landing-mechanics check isolated from both the type lab and
    // every authored course.
    startStage(0, { landingGimmickTest: true });
  } else if (state.donutTypesTest.enabled) {
    // A deliberately private, six-platform geometry lab. It exercises the
    // shared type system without changing any authored stage or player save.
    startStage(0, { donutTypesTest: true });
  } else if (state.surfaceTest.enabled) {
    // Keep this side-by-side surface check isolated from the two older,
    // single-purpose labs and from every authored course.
    startStage(0, { surfaceTest: true });
  } else if (state.slipperyTest.enabled) {
    // This starts a disposable two-platform comparison course. It never writes
    // normal stage progress, unlocks, selection, or authored stage data.
    startStage(0, { slipperyTest: true });
  } else if (state.gimmickTest.enabled) {
    // Start the lab directly from its private URL.  This does not unlock a
    // stage, update the selected level, or alter the player's saved progress.
    startStage(0, { gimmickTest: true });
  } else if (state.speedTest.enabled) {
    state.selectedStage = state.speedTest.selectedStage;
    state.screen = 'speed-test';
  } else if (state.authoredStagePreview.enabled) {
    // Start immediately so the owner can play an otherwise locked, real
    // course without changing normal unlocks or the saved selected stage.
    startStage(state.authoredStagePreview.stageId, { authoredStagePreview: true });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - clamp(value, 0, 1), 3);
  }

  function normaliseDonutType(value) {
    return typeof value === 'string' && DONUT_TYPES[value] ? value : 'normal';
  }

  function donutProfile(platformOrType) {
    const type = typeof platformOrType === 'string'
      ? platformOrType
      : (platformOrType?.donutType ?? platformOrType?.id);
    return DONUT_TYPES[normaliseDonutType(type)];
  }

  function platformBodyInsetX(platformOrType) {
    const profile = donutProfile(platformOrType);
    // Keep the same proportional transparent margin on every silhouette so
    // mini art never gains a mismatched invisible landing envelope.
    return DONUT_BODY_INSET_X * (profile.width / DONUT_WIDTH);
  }

  function platformCollisionWidth(platformOrType) {
    const profile = donutProfile(platformOrType);
    return profile.width - platformBodyInsetX(profile) * 2;
  }

  function platformTargetX(beat) {
    const profile = donutProfile(beat);
    // This reproduces the existing normal range (92–298) exactly, while a
    // mini donut can use its genuinely narrower, but still safe, placement
    // range.
    const edgePadding = 13;
    const minimum = profile.width / 2 - platformBodyInsetX(profile) + edgePadding;
    return clamp(CENTER_X + (Number(beat?.offset) || 0), minimum, WIDTH - minimum);
  }

  function platformStartX(side, profile) {
    return side === 'left'
      ? -profile.width / 2 - 18
      : WIDTH + profile.width / 2 + 18;
  }

  function highestStackPlatform() {
    return state.platforms
      .filter((platform) => !platform.collapsed)
      .reduce((highest, platform) => (!highest || platform.top > highest.top ? platform : highest), null);
  }

  function stackedPlatformTop(profile) {
    const support = highestStackPlatform();
    const supportTop = support?.top ?? BASE_TOP;
    // The new donut's lower collision boundary sits on the support's upper
    // collision boundary. No fixed y increment is used, so every supported
    // platform profile keeps a flush contact surface.
    return supportTop + profile.height - DONUT_STACK_OVERLAP;
  }

  function stageGoalTop(stage = state.stage) {
    if (!stage) return BASE_TOP + 76;
    const top = stage.beats.slice(0, stage.targetSteps).reduce(
      (currentTop, beat) => currentTop + donutProfile(beat).height - DONUT_STACK_OVERLAP,
      BASE_TOP,
    );
    // Normal-only authored stages reduce to the old BASE_TOP + steps * 54.
    return top + 76;
  }

  function roundRect(x, y, width, height, radius, fill, stroke) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function font(size, weight = 800) {
    ctx.font = `${weight} ${size}px ui-rounded, "Hiragino Maru Gothic ProN", system-ui, sans-serif`;
  }

  function text(value, x, y, size, color = '#3e2730', align = 'center', weight = 800) {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    font(size, weight);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function cuteFeedbackText(value, x, y, size, color) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `900 ${size}px "Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Arial Rounded MT Bold", ui-rounded, system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff8ea';
    ctx.strokeText(value, x, y);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function tinyText(value, x, y, color = '#5c3d3d', align = 'center') {
    text(value, x, y, 11, color, align, 800);
  }

  // The front-of-house screens use their own type treatment so the more
  // practical in-game HUD can stay exactly as it is during play.
  function menuFont(size, weight = 700) {
    ctx.font = `${weight} ${size}px "Avenir Next", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Noto Sans JP", system-ui, sans-serif`;
  }

  function menuText(value, x, y, size, color = '#fff5e6', align = 'center', weight = 700) {
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    menuFont(size, weight);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function menuCaption(value, x, y, color = '#dfc9aa', align = 'center') {
    menuText(value, x, y, 10, color, align, 700);
  }

  function menuTitle(value, x, y, size, color = '#fff3df') {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(11, 9, 25, .55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    menuFont(size, 800);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function drawMenuPanel(x, y, width, height, radius, fill = 'rgba(23, 23, 43, .78)', stroke = 'rgba(244, 208, 148, .68)') {
    ctx.save();
    ctx.shadowColor = 'rgba(7, 7, 18, .28)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    roundRect(x, y, width, height, radius, fill, null);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 1.4;
    roundRect(x, y, width, height, radius, null, stroke);
    ctx.restore();
  }

  function drawMenuButton(x, y, width, height, label, tone = 'secondary') {
    const primary = tone === 'primary';
    const base = primary ? '#c96d78' : '#f5dfbc';
    const border = primary ? '#ffe8bf' : '#9b665a';
    const labelColor = primary ? '#fffaf0' : '#54363f';
    ctx.save();
    ctx.shadowColor = primary ? 'rgba(68, 28, 42, .48)' : 'rgba(30, 20, 29, .32)';
    ctx.shadowBlur = primary ? 12 : 8;
    ctx.shadowOffsetY = primary ? 6 : 4;
    roundRect(x, y + 3, width, height - 1, 18, primary ? '#763f4b' : '#8d615d', null);
    ctx.restore();
    roundRect(x, y, width, height - 4, 18, base, border);
    ctx.save();
    ctx.globalAlpha = primary ? 0.26 : 0.38;
    roundRect(x + 7, y + 6, width - 14, Math.min(15, height - 12), 10, '#fffdf5', null);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = primary ? 2.2 : 1.6;
    roundRect(x, y, width, height - 4, 18, null, border);
    ctx.restore();
    menuText(label, x + width / 2, y + (height - 4) / 2 + 1, primary ? 21 : 16, labelColor, 'center', primary ? 800 : 750);
    if (primary) menuText('›', x + width - 25, y + (height - 4) / 2 + 1, 25, '#fff7e7', 'center', 800);
  }

  function loadProgress() {
    const allStagesProgress = (parsed) => ({
      unlocked: MAX_STAGE,
      selected: clamp(Number(parsed?.selected) || 1, 1, MAX_STAGE),
      completed: Array.isArray(parsed?.completed) ? parsed.completed.filter(Number.isFinite) : [],
    });
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (ALL_STAGES_TEST_ENABLED) return allStagesProgress(parsed);
      if (!parsed || typeof parsed !== 'object') return { ...fallbackProgress };
      const unlocked = clamp(Number(parsed.unlocked) || 1, 1, MAX_STAGE);
      return {
        unlocked,
        // Never let an old or malformed local save open a locked course.
        selected: clamp(Number(parsed.selected) || 1, 1, unlocked),
        completed: Array.isArray(parsed.completed) ? parsed.completed.filter(Number.isFinite) : [],
      };
    } catch {
      if (ALL_STAGES_TEST_ENABLED) return allStagesProgress(null);
      return { ...fallbackProgress };
    }
  }

  function saveProgress() {
    const payload = {
      unlocked: state.progress.unlocked,
      selected: state.selectedStage,
      completed: state.progress.completed,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // The game remains playable when private-mode storage is unavailable.
    }
    // GameBlox can later provide this bridge without changing game logic.
    const bridge = window.GameBloxProgressBridge;
    if (bridge && typeof bridge.saveProgress === 'function') {
      Promise.resolve(bridge.saveProgress(payload)).catch(() => {});
    }
  }

  function loadAudioEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY));
      return typeof saved?.enabled === 'boolean' ? saved.enabled : true;
    } catch {
      // A missing or unavailable local store should never silence the game.
      return true;
    }
  }

  function saveAudioEnabled(enabled) {
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ enabled: Boolean(enabled) }));
    } catch {
      // Sound remains switchable for this visit when private-mode storage is
      // unavailable.
    }
  }

  function createAudioController() {
    const masterVolume = 0.46;
    // A bright D-major game tune that runs for exactly 30 seconds at 128 BPM:
    // A section, a small variation, a bridge, and a return to the opening
    // hook. `null` leaves breathing room between phrases and at the loop.
    const bgmMelodyPhrases = [
      [587.33, 739.99, 880.0, 739.99, 659.25, 739.99, 880.0, null, 987.77, 880.0, 739.99, 659.25, 587.33, null, 659.25, 739.99],
      [880.0, 987.77, 1174.66, 987.77, 880.0, 739.99, 659.25, null, 739.99, 880.0, 987.77, 880.0, 739.99, 659.25, 587.33, null],
      [739.99, 880.0, 987.77, 880.0, 739.99, 880.0, 987.77, null, 1174.66, 987.77, 880.0, 739.99, 659.25, null, 739.99, 880.0],
      [987.77, 880.0, 739.99, 659.25, 739.99, 880.0, 987.77, null, 880.0, 739.99, 659.25, 587.33, 659.25, 587.33, 587.33, null],
      [987.77, 1174.66, 1318.51, 1174.66, 987.77, 880.0, 739.99, null, 880.0, 987.77, 1174.66, 987.77, 880.0, 739.99, 659.25, null],
      [659.25, 739.99, 880.0, 987.77, 880.0, 739.99, 659.25, null, 739.99, 880.0, 987.77, 880.0, 739.99, 659.25, 587.33, null],
      [587.33, 739.99, 880.0, 739.99, 659.25, 739.99, 880.0, null, 987.77, 880.0, 739.99, 659.25, 587.33, null, 659.25, 739.99],
      [880.0, 987.77, 1174.66, 987.77, 880.0, 739.99, 659.25, null, 739.99, 880.0, 987.77, 1174.66, 987.77, 880.0, 739.99, 587.33],
    ];
    const bgmRootPhrases = [
      [146.83, 110.0, 123.47, 98.0],
      [146.83, 110.0, 98.0, 110.0],
      [146.83, 123.47, 98.0, 110.0],
      [146.83, 110.0, 98.0, 146.83],
      [123.47, 98.0, 146.83, 110.0],
      [123.47, 110.0, 98.0, 110.0],
      [146.83, 110.0, 123.47, 98.0],
      [146.83, 110.0, 98.0, 146.83],
    ];
    const bgmStepSeconds = 60 / 128 / 2;
    const bgmGainLevel = 0.40;
    let enabled = loadAudioEnabled();
    let context = null;
    let masterGain = null;
    let bgmGain = null;
    let unlocked = false;
    let bgmTimer = null;
    let nextBgmTime = 0;
    let bgmStep = 0;
    let perfectSoundChain = 0;
    let pendingEffects = [];
    const activeVoices = new Set();
    const eventCounts = {
      jump: 0,
      landing: 0,
      centeredLanding: 0,
      failure: 0,
      collapse: 0,
      clear: 0,
    };

    function contextConstructor() {
      return window.AudioContext || window.webkitAudioContext || null;
    }

    function forgetClosedContext() {
      if (context?.state !== 'closed') return;
      context = null;
      masterGain = null;
      bgmGain = null;
      unlocked = false;
      activeVoices.clear();
      bgmTimer = null;
    }

    function ensureGraph() {
      if (!enabled) return null;
      forgetClosedContext();
      if (context) return context;
      const AudioContextConstructor = contextConstructor();
      if (!AudioContextConstructor) return null;
      try {
        context = new AudioContextConstructor();
        masterGain = context.createGain();
        masterGain.gain.value = masterVolume;
        masterGain.connect(context.destination);
        bgmGain = context.createGain();
        bgmGain.gain.value = bgmGainLevel;
        bgmGain.connect(masterGain);
      } catch {
        context = null;
        masterGain = null;
        bgmGain = null;
      }
      return context;
    }

    function setGain(gainNode, value, duration = 0.08) {
      if (!context || !gainNode) return;
      const now = context.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(value, now + duration);
    }

    function stopVoices(kind = null) {
      Array.from(activeVoices).forEach((voice) => {
        if (kind && voice.kind !== kind) return;
        try {
          voice.oscillator.stop();
        } catch {
          // A short voice may already have ended before an ON/OFF change.
        }
        activeVoices.delete(voice);
      });
    }

    function playVoice({
      frequency,
      glideTo = null,
      duration,
      volume,
      type = 'sine',
      when = null,
      destination = null,
      kind = 'effect',
    }) {
      if (!enabled || !context || context.state !== 'running') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = Number.isFinite(when) ? when : context.currentTime;
      const attack = Math.min(0.022, Math.max(0.008, duration * 0.18));
      const release = Math.max(start + attack + 0.012, start + duration);
      const voice = { oscillator, kind };
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (Number.isFinite(glideTo)) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), release);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, release);
      oscillator.connect(gain);
      gain.connect(destination || masterGain);
      activeVoices.add(voice);
      oscillator.addEventListener('ended', () => activeVoices.delete(voice), { once: true });
      oscillator.start(start);
      oscillator.stop(release + 0.025);
    }

    function scheduleBgm() {
      if (!enabled || !context || context.state !== 'running' || bgmTimer === null) return;
      const now = context.currentTime;
      if (nextBgmTime < now) nextBgmTime = now + 0.025;
      while (nextBgmTime < now + 0.52) {
        const phraseLength = bgmMelodyPhrases[0].length;
        const phraseIndex = Math.floor(bgmStep / phraseLength) % bgmMelodyPhrases.length;
        const stepInPhrase = bgmStep % phraseLength;
        const note = bgmMelodyPhrases[phraseIndex][stepInPhrase];
        const isBridge = phraseIndex >= 4 && phraseIndex <= 5;
        const isReprise = phraseIndex >= 6;

        if (note) {
          playVoice({
            frequency: note,
            duration: bgmStepSeconds * 0.72,
            volume: isBridge ? 0.023 : 0.026,
            type: 'triangle',
            when: nextBgmTime,
            destination: bgmGain,
            kind: 'bgm',
          });
        }

        // The bridge gets a light synth reply, which becomes a much softer
        // layer on the reprise to make the return feel satisfying.
        if (note && (isBridge || isReprise) && stepInPhrase % 4 === 0) {
          playVoice({
            frequency: note / 2,
            duration: bgmStepSeconds * 1.34,
            volume: isBridge ? 0.009 : 0.006,
            type: 'sine',
            when: nextBgmTime + 0.018,
            destination: bgmGain,
            kind: 'bgm',
          });
        }

        // Compact marimba-like bass and a quiet fifth keep the rhythm springy
        // without covering the game's landing and success effects.
        if (stepInPhrase % 4 === 0) {
          const root = bgmRootPhrases[phraseIndex][Math.floor(stepInPhrase / 4)];
          playVoice({
            frequency: root,
            glideTo: root * 0.96,
            duration: bgmStepSeconds * 1.65,
            volume: 0.021,
            type: 'triangle',
            when: nextBgmTime,
            destination: bgmGain,
            kind: 'bgm',
          });
          playVoice({
            frequency: root * 1.5,
            duration: bgmStepSeconds * 0.88,
            volume: 0.007,
            type: 'sine',
            when: nextBgmTime + 0.008,
            destination: bgmGain,
            kind: 'bgm',
          });
        }

        if (stepInPhrase % 4 === 2) {
          const root = bgmRootPhrases[phraseIndex][Math.floor(stepInPhrase / 4)];
          playVoice({
            frequency: root * 1.5,
            duration: bgmStepSeconds * 0.52,
            volume: 0.008,
            type: 'triangle',
            when: nextBgmTime,
            destination: bgmGain,
            kind: 'bgm',
          });
        }

        // A tiny kick, wood-tick, and hat pattern completes the pop rhythm.
        // All three sit below the game SFX in both level and spectrum.
        if (stepInPhrase % 8 === 0 || stepInPhrase % 8 === 4) {
          playVoice({
            frequency: 84,
            glideTo: 58,
            duration: bgmStepSeconds * 0.46,
            volume: 0.012,
            type: 'sine',
            when: nextBgmTime,
            destination: bgmGain,
            kind: 'bgm',
          });
        }
        if (stepInPhrase % 8 === 2 || stepInPhrase % 8 === 6) {
          playVoice({
            frequency: 900,
            glideTo: 520,
            duration: bgmStepSeconds * 0.27,
            volume: 0.0045,
            type: 'triangle',
            when: nextBgmTime,
            destination: bgmGain,
            kind: 'bgm',
          });
        }
        if (stepInPhrase % 2 === 1) {
          playVoice({
            frequency: 2150,
            glideTo: 1500,
            duration: bgmStepSeconds * 0.18,
            volume: 0.0035,
            type: 'triangle',
            when: nextBgmTime,
            destination: bgmGain,
            kind: 'bgm',
          });
        }
        bgmStep += 1;
        nextBgmTime += bgmStepSeconds;
      }
    }

    function startBgm() {
      if (!enabled || !unlocked || !context || context.state !== 'running' || bgmTimer !== null) return;
      nextBgmTime = context.currentTime + 0.035;
      bgmTimer = window.setInterval(scheduleBgm, 180);
      scheduleBgm();
    }

    function stopBgm() {
      if (bgmTimer !== null) window.clearInterval(bgmTimer);
      bgmTimer = null;
      stopVoices('bgm');
    }

    function runWhenReady(callback) {
      const current = ensureGraph();
      if (!current) return;
      if (current.state === 'running') {
        callback(current);
        return;
      }
      // The first tap can arrive while the browser is still resuming the
      // AudioContext. Queue only a handful of very short effects so that the
      // first jump still feels responsive without retaining stale sounds.
      if (pendingEffects.length < 8) pendingEffects.push(callback);
    }

    function flushPendingEffects() {
      const queued = pendingEffects;
      pendingEffects = [];
      queued.forEach((callback) => callback(context));
    }

    function unlock() {
      const current = ensureGraph();
      if (!current) return Promise.resolve(false);
      const ready = () => {
        if (!enabled || context !== current || current.state !== 'running') return false;
        unlocked = true;
        setGain(masterGain, masterVolume, 0.06);
        flushPendingEffects();
        startBgm();
        return true;
      };
      if (current.state === 'running') return Promise.resolve(ready());
      return current.resume().then(ready).catch(() => false);
    }

    function setEnabled(value) {
      const next = Boolean(value);
      if (enabled === next) return;
      enabled = next;
      saveAudioEnabled(enabled);
      if (!enabled) {
        pendingEffects = [];
        stopBgm();
        stopVoices();
        setGain(masterGain, 0, 0.06);
        return;
      }
      const current = ensureGraph();
      if (current) setGain(masterGain, masterVolume, 0.08);
    }

    function playJump() {
      runWhenReady(() => {
        eventCounts.jump += 1;
        // A compact two-part "pop" gives the takeoff an immediate, readable
        // response without touching the background music's notes or level.
        const start = context.currentTime;
        playVoice({ frequency: 430, glideTo: 630, duration: 0.105, volume: 0.20, type: 'triangle', when: start });
        playVoice({ frequency: 235, glideTo: 310, duration: 0.060, volume: 0.050, type: 'sine', when: start + 0.008 });
      });
    }

    function playLanding(perfect = false) {
      runWhenReady(() => {
        eventCounts.landing += 1;
        if (!perfect) perfectSoundChain = 0;
        // The low tap gives each successful platform contact a little weight;
        // the short bright layer keeps it from being lost under the BGM.
        const start = context.currentTime;
        playVoice({ frequency: 185, glideTo: 126, duration: 0.125, volume: 0.19, type: 'sine', when: start });
        playVoice({ frequency: 360, glideTo: 248, duration: 0.065, volume: 0.055, type: 'triangle', when: start + 0.010 });
      });
    }

    function playCenteredLanding() {
      runWhenReady(() => {
        eventCounts.centeredLanding += 1;
        perfectSoundChain = Math.min(perfectSoundChain + 1, 4);
        const pitch = [1, 1.059463, 1.122462, 1.122462][perfectSoundChain - 1];
        const start = context.currentTime;
        // The normal landing stays beneath this short pop-and-bell flourish.
        // Its pitch rises for the second and third consecutive PERFECT only.
        playVoice({ frequency: 620 * pitch, glideTo: 690 * pitch, duration: 0.10, volume: 0.065, type: 'triangle', when: start });
        playVoice({ frequency: 1046.5 * pitch, glideTo: 1174.66 * pitch, duration: 0.18, volume: 0.090, type: 'sine', when: start + 0.060 });
        playVoice({ frequency: 1318.51 * pitch, glideTo: 1396.91 * pitch, duration: 0.14, volume: 0.035, type: 'sine', when: start + 0.130 });
      });
    }

    function playFailure() {
      runWhenReady(() => {
        eventCounts.failure += 1;
        perfectSoundChain = 0;
        const start = context.currentTime;
        playVoice({ frequency: 523.25, glideTo: 440.0, duration: 0.15, volume: 0.11, type: 'triangle', when: start });
        playVoice({ frequency: 392.0, glideTo: 329.63, duration: 0.18, volume: 0.085, type: 'sine', when: start + 0.16 });
        playVoice({ frequency: 329.63, glideTo: 293.66, duration: 0.30, volume: 0.075, type: 'triangle', when: start + 0.36 });
      });
    }

    function playCollapse() {
      runWhenReady(() => {
        eventCounts.collapse += 1;
        perfectSoundChain = 0;
        const start = context.currentTime;
        playVoice({ frequency: 493.88, glideTo: 415.3, duration: 0.17, volume: 0.12, type: 'triangle', when: start });
        playVoice({ frequency: 369.99, glideTo: 311.13, duration: 0.20, volume: 0.090, type: 'sine', when: start + 0.18 });
        playVoice({ frequency: 311.13, glideTo: 261.63, duration: 0.32, volume: 0.080, type: 'triangle', when: start + 0.40 });
      });
    }

    function playClear() {
      runWhenReady(() => {
        eventCounts.clear += 1;
        perfectSoundChain = 0;
        const start = context.currentTime;
        // A short, rising continuation of the PERFECT colour: soft wood
        // attack, a bright middle note, then one lingering bell-like finish.
        playVoice({ frequency: 587.33, glideTo: 622.25, duration: 0.16, volume: 0.055, type: 'triangle', when: start });
        playVoice({ frequency: 783.99, glideTo: 830.61, duration: 0.24, volume: 0.065, type: 'sine', when: start + 0.16 });
        playVoice({ frequency: 1046.5, glideTo: 1174.66, duration: 0.58, volume: 0.075, type: 'sine', when: start + 0.34 });
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopBgm();
      } else if (enabled && unlocked && context?.state === 'running') {
        startBgm();
      }
    });

    return {
      isEnabled: () => enabled,
      setEnabled,
      unlock,
      startBgm,
      playJump,
      playLanding,
      playCenteredLanding,
      playFailure,
      playCollapse,
      playClear,
      getState: () => ({
        enabled,
        available: Boolean(contextConstructor()),
        unlocked,
        contextState: context?.state || 'not-created',
        bgmRunning: bgmTimer !== null,
        eventCounts: { ...eventCounts },
      }),
    };
  }

  function allStages() {
    return Array.isArray(window.DONUT_STAGES) ? window.DONUT_STAGES : [];
  }

  function stageFor(id) {
    return allStages().find((stage) => Number(stage.id) === id) || null;
  }

  function gimmickTestStage() {
    return {
      id: 0,
      chapter: 0,
      title: 'GIMMICK LAB',
      targetSteps: GIMMICK_TEST_BEATS.length,
      expectedSeconds: 40,
      beats: GIMMICK_TEST_BEATS.map((beat) => ({ ...beat })),
    };
  }

  function slipperyTestStage() {
    return {
      id: 0,
      chapter: 0,
      title: 'SLIPPERY TEST',
      targetSteps: SLIPPERY_TEST_BEATS.length,
      expectedSeconds: 10,
      beats: SLIPPERY_TEST_BEATS.map((beat) => ({ ...beat })),
    };
  }

  function surfaceTestStage() {
    return {
      id: 0,
      chapter: 0,
      title: 'SURFACE TEST',
      targetSteps: SURFACE_TEST_BEATS.length,
      expectedSeconds: 24,
      beats: SURFACE_TEST_BEATS.map((beat) => ({ ...beat })),
    };
  }

  function donutTypesTestStage() {
    return {
      id: 0,
      chapter: 0,
      title: 'DONUT TYPES TEST',
      targetSteps: DONUT_TYPES_TEST_BEATS.length,
      expectedSeconds: 26,
      beats: DONUT_TYPES_TEST_BEATS.map((beat) => ({ ...beat })),
    };
  }

  function landingGimmickTestStage() {
    return {
      id: 0,
      chapter: 0,
      title: 'LANDING GIMMICK TEST',
      targetSteps: LANDING_GIMMICK_TEST_BEATS.length,
      expectedSeconds: 18,
      beats: LANDING_GIMMICK_TEST_BEATS.map((beat) => ({ ...beat })),
    };
  }

  function specialDonutPreviewTestStage() {
    return {
      id: 0,
      chapter: 0,
      title: 'SPECIAL PREVIEW TEST',
      targetSteps: SPECIAL_DONUT_PREVIEW_TEST_BEATS.length,
      expectedSeconds: 40,
      beats: SPECIAL_DONUT_PREVIEW_TEST_BEATS.map((beat) => ({ ...beat })),
    };
  }

  function parseBeat(raw, index, stage) {
    if (typeof raw === 'string') {
      const parts = raw.split('|');
      const speedMultiplier = Number(parts[4]);
      return {
        side: parts[0] === 'R' ? 'right' : 'left',
        delayMs: Number(parts[1]) || 1320,
        offset: Number(parts[2]) || 0,
        speed: Number(parts[3]) || 142,
        speedMultiplier: Number.isFinite(speedMultiplier) ? speedMultiplier : 1,
        flavor: parts[5] || COLORS[(stage.id + index) % COLORS.length],
        donutType: 'normal',
        gimmick: null,
        consecutive: false,
        slippery: false,
        squishy: false,
        previewSpecial: null,
      };
    }
    const beat = raw || {};
    const center = Number.isFinite(beat.landingCenterX) ? beat.landingCenterX : CENTER_X;
    const speedMultiplier = Number(beat.speedMultiplier);
    return {
      side: beat.side === 'right' || beat.incomingSide === 'right' ? 'right' : 'left',
      delayMs: Number(beat.delayMs ?? beat.spawnDelayMs ?? beat.delay ?? 1320),
      offset: Number(beat.offset ?? beat.landingOffset ?? (center - CENTER_X) ?? 0),
      speed: Number(beat.speed ?? beat.travelSpeed ?? 142),
      speedMultiplier: Number.isFinite(speedMultiplier) ? speedMultiplier : 1,
      flavor: FLAVOR_COLORS[beat.flavor] || beat.flavor || COLORS[(stage.id + index) % COLORS.length],
      donutType: normaliseDonutType(beat.donutType ?? beat.donut_type ?? beat.platformType),
      gimmick: typeof beat.gimmick === 'string' ? beat.gimmick : null,
      consecutive: Boolean(beat.consecutive),
      slippery: Boolean(beat.slippery),
      squishy: Boolean(beat.squishy),
      previewSpecial: typeof beat.previewSpecial === 'string' ? beat.previewSpecial : null,
      slideDistance: Number(beat.slideDistance) || 0,
      crackDuration: Number(beat.crackDuration) || 0,
      feintAt: Number.isFinite(Number(beat.feintAt)) ? Number(beat.feintAt) : 0.5,
      feintMultiplier: Number.isFinite(Number(beat.feintMultiplier)) ? Number(beat.feintMultiplier) : 1,
    };
  }

  function selectedSpeedTestPreset() {
    if (!state.speedTest.enabled) return null;
    return SPEED_TEST_PRESETS[state.speedTest.selectedPreset] || SPEED_TEST_PRESETS.standard;
  }

  function activeSpeedTestMultiplier() {
    const preset = state.speedTest.enabled && state.speedTest.running ? selectedSpeedTestPreset() : null;
    return preset ? preset.multiplier : null;
  }

  function waitBeforeBeat(beat, speedOverride = activeSpeedTestMultiplier()) {
    // Each authored beat is a landing-to-landing rhythm. Movement speed and
    // spawn wait stay separate: slowing a donut gives it more readable screen
    // time rather than silently lengthening all 600 courses.
    const profile = donutProfile(beat);
    const startingX = platformStartX(beat.side, profile);
    const targetX = platformTargetX(beat);
    const travelSeconds = Math.abs(startingX - targetX) / donutSpeedFor(beat, speedOverride);
    const cadenceSeconds = (beat.consecutive ? beat.delayMs * 0.75 : beat.delayMs) / 1000;
    // Only the private consecutive-pair marker may begin almost immediately
    // after the previous landing. Authored courses keep their established
    // read-time floor, while this preserves the same travel speed at roughly
    // 75% of an equivalent ordinary pair's catch-to-catch cadence.
    const minimumWait = beat.consecutive ? 0.06 : 0.25;
    return clamp(
      cadenceSeconds - travelSeconds + CADENCE_READ_BUFFER - DONUT_APPEARANCE_WAIT_REDUCTION,
      minimumWait,
      2.4,
    );
  }

  function donutSpeedFor(beat, speedOverride = activeSpeedTestMultiplier()) {
    // A test run uses one explicit, screen-disclosed speed for comparison.
    // The authored multiplier stays untouched and remains active everywhere
    // outside the `?speed-test=1` URL.
    if (Number.isFinite(speedOverride)) return BASE_DONUT_SPEED * speedOverride;
    // Course data deliberately keeps slow, normal, and fast donuts mixed.
    // Do not clamp the multiplier here: that would erase the authored
    // 1.0–1.3x difficulty range.
    if (Number.isFinite(beat.speedMultiplier)) {
      return BASE_DONUT_SPEED * beat.speedMultiplier;
    }
    return clamp(beat.speed, 300, 390);
  }

  function normaliseStage(raw) {
    if (!raw) return null;
    let decoded = raw;
    try {
      if (typeof window.decodeDonutStage === 'function' && typeof raw.beats === 'string') {
        decoded = window.decodeDonutStage(raw);
      }
    } catch {
      return null;
    }
    const rawBeats = Array.isArray(decoded.beats) ? decoded.beats : [];
    const targetSteps = clamp(Number(decoded.targetSteps ?? decoded.goal?.requiredStackSteps ?? rawBeats.length), 1, 100);
    const beats = rawBeats.slice(0, targetSteps).map((beat, index) => parseBeat(beat, index, decoded));
    return {
      id: Number(decoded.id),
      chapter: Number(decoded.chapter) || Math.ceil(Number(decoded.id) / 30),
      title: decoded.title || `DONUT RUN ${String(decoded.id).padStart(3, '0')}`,
      targetSteps: Math.min(targetSteps, beats.length),
      expectedSeconds: Number(decoded.expectedSeconds) || 60,
      beats,
    };
  }

  function toScreenY(worldY) {
    return HEIGHT - (worldY - state.cameraY);
  }

  function createTowerState() {
    return {
      balance: 0,
      angle: 0,
      angularVelocity: 0,
      targetAngle: 0,
      lastDirection: 0,
      sameSideStreak: 0,
      lastLandingOffset: 0,
      danger: 0,
      collapseLimit: Infinity,
      collapsing: false,
      collapseDirection: 0,
    };
  }

  function startStage(stageId, {
    speedTest = false,
    authoredStagePreview = false,
    gimmickTest = false,
    slipperyTest = false,
    surfaceTest = false,
    donutTypesTest = false,
    landingGimmickTest = false,
    specialDonutPreviewTest = false,
  } = {}) {
    const raw = specialDonutPreviewTest
      ? specialDonutPreviewTestStage()
      : (surfaceTest
        ? surfaceTestStage()
        : (landingGimmickTest
        ? landingGimmickTestStage()
        : (donutTypesTest
          ? donutTypesTestStage()
          : (slipperyTest
            ? slipperyTestStage()
            : (gimmickTest ? gimmickTestStage() : stageFor(stageId))))));
    const stage = normaliseStage(raw);
    if (!stage || !stage.beats.length) {
      state.screen = 'missing';
      return;
    }
    state.stage = stage;
    state.selectedStage = stage.id;
    preloadBackgroundThemesForStage(stage.id);
    state.speedTest.running = Boolean(state.speedTest.enabled && speedTest);
    state.authoredStagePreview.running = Boolean(
      state.authoredStagePreview.enabled && authoredStagePreview,
    );
    state.gimmickTest.running = Boolean(state.gimmickTest.enabled && gimmickTest);
    state.slipperyTest.running = Boolean(state.slipperyTest.enabled && slipperyTest);
    state.surfaceTest.running = Boolean(state.surfaceTest.enabled && surfaceTest);
    state.donutTypesTest.running = Boolean(state.donutTypesTest.enabled && donutTypesTest);
    state.landingGimmickTest.running = Boolean(
      state.landingGimmickTest.enabled && landingGimmickTest,
    );
    state.specialDonutPreviewTest.running = Boolean(
      state.specialDonutPreviewTest.enabled && specialDonutPreviewTest,
    );
    if (state.speedTest.running) {
      state.speedTest.selectedStage = stage.id;
    } else if (!state.authoredStagePreview.running && !state.gimmickTest.running
      && !state.slipperyTest.running && !state.surfaceTest.running && !state.donutTypesTest.running && !state.landingGimmickTest.running
      && !state.specialDonutPreviewTest.running) {
      state.progress.selected = stage.id;
      saveProgress();
    }
    state.screen = 'play';
    state.playPaused = false;
    state.player = {
      x: CENTER_X,
      y: BASE_TOP,
      previousY: BASE_TOP,
      vy: 0,
      grounded: true,
      jumpStartX: CENTER_X,
      currentPlatform: 0,
      standingPlatformId: 0,
      squash: 0,
      // Presentation-only state. Physics continues to use x/y/vy and the
      // existing collision body; these values never change a landing result.
      jumpPhase: 'grounded',
      jumpElapsed: 0,
      landingPoseTimer: 0,
      landingPoseDuration: LANDING_POSE_TIME,
      landingRebound: 0,
      landingSquash: 0,
      edgeLandingTimer: 0,
      edgeLandingDuration: EDGE_LANDING_FACE_DURATION,
      edgeLandingDirection: 0,
      perfectSpinTimer: 0,
      perfectSpinDuration: PERFECT_PLAYER_SPIN_DURATION,
      perfectPendingSpawnWait: null,
      landingCarryTimer: 0,
      landingCarryDuration: LANDING_REJUMP_BLEND_TIME,
      landingCarryStartX: 1,
      landingCarryStartY: 1,
      landingCarryX: 1,
      landingCarryY: 1,
      supportVisualMode: 'none',
      supportVisualTimer: 0,
      supportVisualDuration: SUPPORT_VISUAL_BLEND_TIME,
      supportVisualOffsetX: 0,
      supportVisualOffsetY: 0,
      supportVisualRotation: 0,
      // When the player leaves a visually tilted tower, retain the exact
      // painted world-X anchor for the airborne sprite.  The collision body
      // keeps its normal physics X throughout; this only prevents the
      // former support transform from being released as a sideways slide.
      supportVisualAnchorX: 0,
      supportVisualAnchorActive: false,
      // Test-only and grounded-only. This has no route into jump velocity,
      // gravity, the platform body, or any normal stage.
      slipperyDrift: null,
    };
    state.platforms = [{
      id: 0, step: 0, x: CENTER_X, top: BASE_TOP, flavor: '#d59a54', donutType: 'normal', base: true, impact: 0, variant: 'normal',
    }];
    state.nextBeatIndex = 0;
    // Match the source game's first-beat read time before the first platform
    // enters from the side.
    state.spawnWait = 1.0;
    state.activeDonut = null;
    state.elapsed = 0;
    state.cameraY = 0;
    state.cameraTargetY = 0;
    state.hintPulse = 0;
    state.transitionDelay = 0;
    state.resultReason = '';
    state.perfectLandings = 0;
    state.physicsAccumulator = 0;
    state.effects = [];
    state.message = null;
    state.specialDonutPreview.cue = null;
    state.specialDonutPreview.intro = null;
    state.specialDonutPreview.announcedSteps = new Set();
    state.specialDonutPreview.seenKinds = new Set();
    state.cameraShake = 0;
    state.failure = null;
    state.tower = createTowerState();
    state.flavorBag = [];
    state.flavorBagCycle = 0;
    state.lastFlavor = null;
    // This is a no-op until the page has received a real user gesture. It
    // simply resumes a previously unlocked BGM loop on retries/next stages.
    audio.startBgm();
  }

  function returnHome() {
    const wasPrivateTest = state.slipperyTest.running || state.surfaceTest.running || state.donutTypesTest.running || state.landingGimmickTest.running || state.specialDonutPreviewTest.running;
    state.screen = state.speedTest.enabled && !state.gimmickTest.enabled && !state.slipperyTest.enabled && !state.surfaceTest.enabled && !state.donutTypesTest.enabled && !state.landingGimmickTest.enabled && !state.specialDonutPreviewTest.enabled
      ? 'speed-test'
      : 'home';
    state.speedTest.running = false;
    state.authoredStagePreview.running = false;
    state.gimmickTest.running = false;
    state.slipperyTest.running = false;
    state.surfaceTest.running = false;
    state.donutTypesTest.running = false;
    state.landingGimmickTest.running = false;
    state.specialDonutPreviewTest.running = false;
    state.stage = null;
    state.activeDonut = null;
    state.player = null;
    state.transitionDelay = 0;
    state.physicsAccumulator = 0;
    state.effects = [];
    state.message = null;
    state.specialDonutPreview.cue = null;
    state.specialDonutPreview.intro = null;
    state.specialDonutPreview.announcedSteps = new Set();
    state.specialDonutPreview.seenKinds = new Set();
    state.failure = null;
    state.tower = null;
    // The private course uses id 0. Do not let that temporary id leak into
    // the normal home screen if the tester leaves the lab.
    if (wasPrivateTest) {
      state.selectedStage = clamp(state.progress.selected || state.progress.unlocked || 1, 1, MAX_STAGE);
      state.chapterPage = Math.ceil(state.selectedStage / 30);
    }
  }

  function openStageSelect() {
    state.chapterPage = Math.ceil(state.selectedStage / 30);
    state.screen = 'select';
  }

  function specialDonutKind(beat) {
    const explicit = typeof beat?.previewSpecial === 'string' ? beat.previewSpecial : null;
    if (explicit && SPECIAL_DONUT_PREVIEW_INFO[explicit]) return explicit;
    if (beat?.squishy) return 'squishy';
    const profile = donutProfile(beat);
    return profile.id !== 'normal' ? profile.id : null;
  }

  function spawnDonut() {
    if (!state.stage || state.nextBeatIndex >= state.stage.targetSteps || state.activeDonut) return;
    const index = state.nextBeatIndex;
    const beat = state.stage.beats[index];
    const side = beat.side;
    const profile = donutProfile(beat);
    const targetX = platformTargetX(beat);
    const startX = platformStartX(side, profile);
    const baseSpeed = donutSpeedFor(beat);
    const isSlipperyPlatform = beat.slippery
      || (state.slipperyTest.running && index === 0)
      || (state.surfaceTest.running && index === 1);
    const isSquishyPlatform = beat.squishy
      || (state.landingGimmickTest.running && beat.squishy)
      || (state.surfaceTest.running && index === 2);
    state.activeDonut = {
      id: index + 1,
      step: index + 1,
      side,
      x: startX,
      startX,
      targetX,
      top: stackedPlatformTop(profile),
      donutType: profile.id,
      speed: baseSpeed,
      baseSpeed,
      travelDistance: Math.abs(targetX - startX),
      // Flavor selection is intentionally visual-only. Shuffle all five
      // designs before repeating one so a run feels varied without changing
      // authored timing, speed, position, collision, or stage difficulty.
      flavor: isSlipperyPlatform || beat.gimmick ? beat.flavor : nextDonutFlavor(),
      variant: isSlipperyPlatform ? 'slippery' : (isSquishyPlatform ? 'squishy' : 'normal'),
      specialKind: state.specialDonutPreviewTest.running ? specialDonutKind(beat) : null,
      gimmick: beat.gimmick,
      slideDistance: beat.slideDistance,
      crackDuration: beat.crackDuration,
      feintAt: beat.feintAt,
      feintMultiplier: beat.feintMultiplier,
      feintApplied: false,
      atTarget: false,
      phase: 'incoming',
      settleTimer: 0,
      impact: 0,
    };
  }

  function nextDonutFlavor() {
    if (!state.flavorBag.length) {
      const bag = [...DONUT_FLAVORS];
      // A stage-specific shuffle looks random while keeping a retry fair:
      // the same handcrafted stage always uses the same visual order.
      let seed = ((state.stage?.id || 1) * 0x9e3779b1 + (state.flavorBagCycle + 1) * 0x85ebca6b) >>> 0;
      const nextSeededValue = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      for (let index = bag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(nextSeededValue() * (index + 1));
        [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
      }
      // `pop()` is the next flavor. Avoid a duplicate across the boundary
      // between two five-flavor bags while leaving every flavor in the bag.
      if (bag[bag.length - 1] === state.lastFlavor) {
        [bag[bag.length - 1], bag[bag.length - 2]] = [bag[bag.length - 2], bag[bag.length - 1]];
      }
      state.flavorBag = bag;
      state.flavorBagCycle += 1;
    }
    const flavor = state.flavorBag.pop();
    state.lastFlavor = flavor;
    return FLAVOR_COLORS[flavor];
  }

  function platformForId(id) {
    return state.platforms.find((platform) => platform.id === id) || null;
  }

  function balanceDirection(value) {
    if (value === 'left') return -1;
    if (value === 'right') return 1;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.sign(numeric) : 0;
  }

  function registerTowerLanding(platform, supportX, supportWidth) {
    const model = window.DonutTowerBalance;
    if (!platform || !model || typeof model.normalizeLandingOffset !== 'function'
      || typeof model.advance !== 'function') {
      return { collapse: false, collapseDirection: 0 };
    }
    const tower = state.tower || (state.tower = createTowerState());
    const landingOffset = model.normalizeLandingOffset({
      landingX: platform.x,
      supportX: Number.isFinite(supportX) ? supportX : CENTER_X,
      centerX: CENTER_X,
      // A new donut's imbalance is measured against the platform holding it,
      // not against its own upcoming silhouette. That keeps mixed-size
      // contact intuitive without changing the normal model.
      width: Number.isFinite(supportWidth) ? supportWidth : platformCollisionWidth(platform),
    });
    const next = model.advance({
      balance: tower.balance,
      lastDirection: tower.lastDirection,
      sameSideStreak: tower.sameSideStreak,
    }, {
      landingOffset,
      step: platform.step,
    });

    tower.balance = next.balance;
    tower.lastDirection = balanceDirection(next.lastDirection);
    tower.sameSideStreak = next.sameSideStreak;
    tower.lastLandingOffset = landingOffset;
    tower.collapseLimit = next.collapseLimit;
    tower.danger = next.dangerRatio;
    tower.targetAngle = clamp(next.tiltRadians, -TOWER_MAX_TILT_RADIANS, TOWER_MAX_TILT_RADIANS);

    // A landing initially nudges the stack away from the new weight, then the
    // spring returns it to the new centre of mass. This is paint-only and
    // lasts roughly a half second rather than creating unpredictable motion.
    const landingDirection = Math.sign(landingOffset) || Math.sign(next.balance);
    if (landingDirection) {
      const heightFactor = clamp((platform.step - 8) / 68, 0, 1);
      const wobble = 0.17 + Math.abs(landingOffset) * 0.32 + heightFactor * 0.16;
      tower.angularVelocity -= landingDirection * wobble;
    }
    return next;
  }

  function updateTowerBalance(dt) {
    const tower = state.tower;
    if (!tower) return;
    const limit = tower.collapsing
      ? TOWER_MAX_TILT_RADIANS * 1.06
      : TOWER_MAX_TILT_RADIANS;
    if (tower.collapsing) {
      tower.targetAngle = tower.collapseDirection * limit;
    }
    // A damped spring reads as a small, recoverable stack wobble without
    // moving any collision geometry or the camera.
    const stiffness = tower.collapsing ? 26 : 54;
    const damping = tower.collapsing ? 7.5 : 9.4;
    tower.angularVelocity += (tower.targetAngle - tower.angle) * stiffness * dt;
    tower.angularVelocity *= Math.exp(-damping * dt);
    tower.angle += tower.angularVelocity * dt;
    tower.angle = clamp(tower.angle, -limit, limit);
  }

  function beginTowerCollapse(direction) {
    if (state.screen !== 'play') return;
    const tower = state.tower || (state.tower = createTowerState());
    const collapseDirection = balanceDirection(direction) || Math.sign(tower.balance) || tower.lastDirection || 1;
    const highestStep = Math.max(1, ...state.platforms.map((platform) => platform.step || 0));
    tower.collapsing = true;
    tower.collapseDirection = collapseDirection;
    tower.targetAngle = collapseDirection * TOWER_MAX_TILT_RADIANS * 1.06;
    tower.angularVelocity += collapseDirection * 0.36;

    state.resultReason = 'タワーがくずれた！';
    state.screen = 'impact';
    audio.playCollapse();
    state.failure = {
      kind: 'tower-collapse',
      timer: TOWER_COLLAPSE_TIME,
      total: TOWER_COLLAPSE_TIME,
      direction: collapseDirection,
    };
    state.spawnWait = Infinity;
    state.transitionDelay = 0;
    state.message = null;

    state.platforms.forEach((platform) => {
      if (platform.base) return;
      const upperRatio = clamp((platform.step || 0) / highestStep, 0, 1);
      // The high pieces start first and travel farther. The base remains on
      // the plate, avoiding a single, uniform "all objects disappear" fall.
      platform.collapseMotion = {
        delay: 0.03 + (1 - upperRatio) * 0.20,
        offsetX: 0,
        offsetY: 0,
        velocityX: collapseDirection * (48 + upperRatio * 108),
        velocityY: 14 + upperRatio * 28,
        rotation: 0,
        angularVelocity: collapseDirection * (0.75 + upperRatio * 1.45),
      };
    });

    const player = state.player;
    if (player) {
      player.grounded = false;
      player.standingPlatformId = null;
      player.vy = 82;
      player.failVX = collapseDirection * 102;
      player.visualRotation = 0;
      player.fallAngularVelocity = collapseDirection * 0.54;
      player.squash = -0.08;
      addBurst(player.x, player.y + 20, '#d98b67', collapseDirection, 8, 128);
    }
    state.cameraShake = Math.max(state.cameraShake, 0.12);
  }

  function updateTowerCollapse(dt, failure) {
    const player = state.player;
    const direction = failure.direction;
    updateTowerBalance(dt);
    state.platforms.forEach((platform) => {
      const motion = platform.collapseMotion;
      if (!motion) return;
      motion.delay -= dt;
      if (motion.delay > 0) return;
      motion.velocityY += 680 * dt;
      motion.offsetX += motion.velocityX * dt;
      motion.offsetY += motion.velocityY * dt;
      motion.rotation += motion.angularVelocity * dt;
      motion.angularVelocity += direction * 0.34 * dt;
    });
    if (!player) return;
    player.previousY = player.y;
    player.vy -= FAILURE_GRAVITY * 0.70 * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x + (player.failVX || 0) * dt, -40, WIDTH + 40);
    player.visualRotation = clamp(
      (player.visualRotation || 0) + (player.fallAngularVelocity || direction * 0.54) * dt,
      -(30 * Math.PI) / 180,
      (30 * Math.PI) / 180,
    );
    player.squash = lerp(player.squash, 0.05, Math.min(1, dt * 5));
  }

  function donutBodyBounds(donut) {
    const profile = donutProfile(donut);
    const insetX = platformBodyInsetX(profile);
    return {
      left: donut.x - (profile.width / 2 - insetX),
      right: donut.x + (profile.width / 2 - insetX),
      bottom: donut.top - profile.height + DONUT_BODY_INSET_Y,
      top: donut.top - DONUT_BODY_INSET_Y,
    };
  }

  function rectOverlapsDonut(left, right, bottom, top, donut) {
    const body = donutBodyBounds(donut);
    return right > body.left && left < body.right && top > body.bottom && bottom < body.top;
  }

  function playerCoreTouchesIncomingDonut(player, donut) {
    if (!player || !donut) return false;
    return rectOverlapsDonut(
      player.x - PLAYER_CORE_HALF_WIDTH,
      player.x + PLAYER_CORE_HALF_WIDTH,
      player.y + PLAYER_CORE_BOTTOM,
      player.y + PLAYER_CORE_TOP,
      donut,
    );
  }

  function playerSideTouchesIncomingDonut(player, donut) {
    if (!player || !donut) return false;
    const sideBottom = player.y + PLAYER_SIDE_BOTTOM;
    const sideTop = player.y + PLAYER_SIDE_TOP;
    const leftCenter = player.x - PLAYER_SIDE_CENTER_OFFSET;
    const rightCenter = player.x + PLAYER_SIDE_CENTER_OFFSET;
    return rectOverlapsDonut(
      leftCenter - PLAYER_SIDE_HALF_WIDTH,
      leftCenter + PLAYER_SIDE_HALF_WIDTH,
      sideBottom,
      sideTop,
      donut,
    ) || rectOverlapsDonut(
      rightCenter - PLAYER_SIDE_HALF_WIDTH,
      rightCenter + PLAYER_SIDE_HALF_WIDTH,
      sideBottom,
      sideTop,
      donut,
    );
  }

  function beginSlipperyLandingDrift(player, platform) {
    if (!player || platform?.variant !== 'slippery') return;
    const offset = player.x - platform.x;
    const excess = Math.max(0, Math.abs(offset) - SLIPPERY_DRIFT_DEAD_ZONE);
    const progress = clamp(
      excess / Math.max(1, SLIPPERY_DRIFT_REFERENCE_OFFSET - SLIPPERY_DRIFT_DEAD_ZONE),
      0,
      1,
    );
    // The glaze response is shown even for a centred, stable landing.  It is
    // owned by the platform instead of a generic particle so it stays clipped
    // to the existing donut artwork and disappears on its own.
    platform.slipperySheen = {
      elapsed: 0,
      duration: SLIPPERY_SHEEN_DURATION,
      landingOffset: clamp(offset, -DONUT_WIDTH * 0.32, DONUT_WIDTH * 0.32),
      strength: 0.28 + progress * 0.72,
    };
    if (excess <= 0) {
      player.slipperyDrift = null;
      return;
    }
    // A square-root ramp makes the movement clear near the sides while the
    // same established body envelope still clamps the player before it can
    // manufacture a new edge-fall condition.
    const strength = Math.sqrt(progress);
    player.slipperyDrift = {
      elapsed: 0,
      delay: SLIPPERY_DRIFT_START_DELAY,
      duration: lerp(SLIPPERY_DRIFT_MIN_DURATION, SLIPPERY_DRIFT_MAX_DURATION, strength),
      distance: Math.sign(offset) * SLIPPERY_DRIFT_MAX_DISTANCE * strength,
      direction: Math.sign(offset),
      strength,
      velocity: 0,
    };
  }

  function updateSlipperyLandingDrift(player, dt) {
    const drift = player?.slipperyDrift;
    if (!drift) return;
    const platform = standingSupportPlatform();
    if (!platform || platform.variant !== 'slippery') {
      player.slipperyDrift = null;
      return;
    }
    const previous = clamp((drift.elapsed - drift.delay) / drift.duration, 0, 1);
    drift.elapsed = Math.min(drift.delay + drift.duration, drift.elapsed + dt);
    const current = clamp((drift.elapsed - drift.delay) / drift.duration, 0, 1);
    const requestedDelta = drift.distance * (easeOutCubic(current) - easeOutCubic(previous));
    // The ease curve is already below this cap in the authored range; keeping
    // the bound explicit prevents a long frame from turning the visual slide
    // into a surprise horizontal jump.
    const delta = clamp(
      requestedDelta,
      -SLIPPERY_DRIFT_MAX_SPEED * dt,
      SLIPPERY_DRIFT_MAX_SPEED * dt,
    );
    drift.velocity = delta / Math.max(dt, 0.0001);
    // Keep the same, pre-existing platform body as the safety envelope. This
    // only shifts the grounded player a few pixels; it cannot alter collision
    // dimensions, platform coordinates, or trigger a new fall condition.
    const safeHalfWidth = DONUT_WIDTH / 2 - DONUT_BODY_INSET_X + PLAYER_CORE_HALF_WIDTH - 3;
    player.x = clamp(player.x + delta, platform.x - safeHalfWidth, platform.x + safeHalfWidth);
    if (current >= 1) player.slipperyDrift = null;
  }

  function landOnIncomingDonut(donut) {
    const player = state.player;
    if (!player || state.activeDonut !== donut || donut.phase !== 'incoming') return;
    // Capture the actual support before the new donut becomes the current
    // foothold.  Balance is based on this visible contact, never on authored
    // target coordinates or a hidden random value.
    const support = platformForId(player.standingPlatformId) || state.platforms[0];
    donut.balanceSupportX = support?.x ?? CENTER_X;
    donut.balanceSupportWidth = platformCollisionWidth(support);
    // This mirrors the supplied source's successful Player-to-platform
    // contact: the moving object stops and becomes the next stable foothold.
    const landingSpeed = Math.max(0, -player.vy);
    player.y = donut.top;
    player.previousY = donut.top;
    player.vy = 0;
    player.grounded = true;
    player.currentPlatform = Math.max(player.currentPlatform, donut.step);
    player.standingPlatformId = donut.id;
    beginSlipperyLandingDrift(player, donut);
    const centred = Math.abs(donut.x - donut.targetX) <= 10;
    applyLandingPresentation(player, donut, landingSpeed, centred);
    // The source stops the moving cube immediately, then promotes it out of
    // collision/scoring duty shortly afterwards.  Keeping this tiny settled
    // phase makes a single landing unable to score or collide twice.
    donut.phase = 'stopped';
    donut.atTarget = true;
    donut.speed = 0;
    donut.settleTimer = LAND_SETTLE_TIME;
    donut.impact = Math.max(donut.impact || 0, LAND_IMPACT_TIME);
    donut.perfectLanding = centred;
    state.nextBeatIndex += 1;
    if (centred) {
      state.perfectLandings += 1;
      audio.playCenteredLanding();
    }
    state.message = {
      text: centred ? 'ぴったり！' : 'いいね！',
      timer: 0.62,
      total: 0.62,
      color: centred ? '#f4a647' : '#c76a78',
    };
    state.cameraShake = Math.max(state.cameraShake, centred ? 0.16 : 0.10);
  }

  function settleIncomingDonut(donut) {
    if (state.activeDonut !== donut || donut.phase !== 'stopped') return;
    const settledPlatform = {
      id: donut.id,
      step: donut.step,
      x: donut.x,
      top: donut.top,
      flavor: donut.flavor,
      donutType: donutProfile(donut).id,
      variant: donut.variant || 'normal',
      base: false,
      impact: donut.impact,
      gimmick: donut.gimmick,
      slideAnchorX: donut.x,
      slideDistance: donut.slideDistance || 0,
      slideTimer: 0,
      crackTimer: donut.gimmick === 'crack' ? donut.crackDuration : 0,
      crackTotal: donut.gimmick === 'crack' ? donut.crackDuration : 0,
      collapsed: false,
      slipperySheen: donut.slipperySheen ? { ...donut.slipperySheen } : null,
      landingReaction: donut.landingReaction ? { ...donut.landingReaction } : null,
      towerPulses: Array.isArray(donut.towerPulses)
        ? donut.towerPulses.map((pulse) => ({ ...pulse }))
        : [],
    };
    state.platforms.push(settledPlatform);
    state.activeDonut = null;
    const towerResult = registerTowerLanding(
      settledPlatform,
      donut.balanceSupportX,
      donut.balanceSupportWidth,
    );
    if (towerResult.collapse) {
      beginTowerCollapse(towerResult.collapseDirection);
      return;
    }
    if (state.player.currentPlatform >= state.stage.targetSteps) {
      state.transitionDelay = 0.55;
    } else {
      const nextBeat = state.stage.beats[state.nextBeatIndex];
      const nextWait = nextBeat ? waitBeforeBeat(nextBeat) : 0.5;
      // A PERFECT's miniature hop must visibly finish on the support before
      // the next arrival countdown begins. The normal landing cadence stays
      // exactly as authored, and the player has no physical movement here.
      if (donut.perfectLanding && state.player?.perfectSpinTimer > 0) {
        state.player.perfectPendingSpawnWait = nextWait;
        state.spawnWait = Infinity;
      } else {
        state.spawnWait = nextWait;
      }
    }
  }

  function updateActiveDonut(dt) {
    const donut = state.activeDonut;
    if (!donut) return;
    donut.impact = Math.max(0, (donut.impact || 0) - dt);
    if (donut.phase === 'incoming' && !donut.atTarget) {
      const direction = Math.sign(donut.targetX - donut.x);
      donut.x += direction * donut.speed * dt;
      const travelled = Math.abs(donut.x - donut.startX);
      const progress = donut.travelDistance > 0 ? travelled / donut.travelDistance : 1;
      if (donut.gimmick?.startsWith('feint-') && !donut.feintApplied && progress >= donut.feintAt) {
        donut.feintApplied = true;
        donut.speed = donut.baseSpeed * donut.feintMultiplier;
        state.message = {
          text: donut.gimmick === 'feint-accelerate' ? 'SPEED UP!' : 'SLOW DOWN!',
          timer: 0.62,
          total: 0.62,
          color: donut.gimmick === 'feint-accelerate' ? '#d56a55' : '#5e9a90',
        };
      }
      const reached = direction >= 0 ? donut.x >= donut.targetX : donut.x <= donut.targetX;
      if (reached) {
        donut.x = donut.targetX;
        donut.atTarget = true;
      }
    }
    if (donut.phase === 'stopped') {
      donut.settleTimer -= dt;
      if (donut.settleTimer <= 0) settleIncomingDonut(donut);
    }
  }

  function updateSpecialDonutPreview(dt) {
    const preview = state.specialDonutPreview;
    if (preview.cue) {
      preview.cue.timer = Math.max(0, preview.cue.timer - dt);
      if (preview.cue.timer === 0) preview.cue = null;
    }
    if (preview.intro) {
      preview.intro.timer = Math.max(0, preview.intro.timer - dt);
      if (preview.intro.timer === 0) preview.intro = null;
    }
    // This visual is deliberately exclusive to the private lab. It never
    // changes ordinary stage timing, platform state, or input handling.
    if (!state.specialDonutPreviewTest.running) return;
    const donut = state.activeDonut;
    if (!donut || donut.phase !== 'incoming' || !donut.specialKind
      || preview.announcedSteps.has(donut.id)) return;
    const speed = Math.max(1, Math.abs(donut.speed || donut.baseSpeed || 0));
    const secondsToArrival = Math.abs(donut.targetX - donut.x) / speed;
    if (secondsToArrival > SPECIAL_DONUT_PREVIEW_LEAD_TIME) return;
    const info = SPECIAL_DONUT_PREVIEW_INFO[donut.specialKind];
    if (!info) return;
    preview.announcedSteps.add(donut.id);
    preview.cue = {
      kind: donut.specialKind,
      timer: SPECIAL_DONUT_CUE_DURATION,
      total: SPECIAL_DONUT_CUE_DURATION,
    };
    if (!preview.seenKinds.has(donut.specialKind)) {
      preview.seenKinds.add(donut.specialKind);
      preview.intro = {
        kind: donut.specialKind,
        text: info.hint,
        timer: SPECIAL_DONUT_INTRO_DURATION,
        total: SPECIAL_DONUT_INTRO_DURATION,
      };
    }
  }

  function updateGimmickPlatforms(dt) {
    if (!state.gimmickTest.running || !state.player) return;
    const player = state.player;
    state.platforms.forEach((platform) => {
      if (platform.collapsed) return;
      const playerIsStandingHere = player.grounded && player.standingPlatformId === platform.id;
      if (platform.gimmick === 'slide' && platform.slideDistance) {
        const previousX = platform.x;
        platform.slideTimer += dt;
        // A short pause makes the takeoff readable, then the whole footing
        // glides once. The player is carried only while truly standing on it.
        const travelProgress = clamp((platform.slideTimer - 0.45) / 0.65, 0, 1);
        platform.x = platform.slideAnchorX + platform.slideDistance * easeOutCubic(travelProgress);
        if (playerIsStandingHere) player.x = clamp(player.x + (platform.x - previousX), 28, WIDTH - 28);
      }
      if (platform.gimmick === 'crack' && platform.crackTimer > 0 && playerIsStandingHere) {
        platform.crackTimer = Math.max(0, platform.crackTimer - dt);
        if (platform.crackTimer === 0) {
          platform.collapsed = true;
          addBurst(platform.x, platform.top + 4, '#b96b53', 0, 10, 180);
          finishGame(false, 'ひび割れドーナツがくずれた！');
        }
      }
    });
  }

  function addBurst(x, y, color, direction = 0, count = 7, power = 140) {
    for (let index = 0; index < count; index += 1) {
      const angle = (-Math.PI * 0.9) + ((Math.PI * 0.8) * index) / Math.max(1, count - 1);
      const variance = 0.72 + ((index * 17) % 5) * 0.07;
      state.effects.push({
        x,
        y,
        vx: Math.cos(angle) * power * variance + direction * power * 0.34,
        vy: Math.abs(Math.sin(angle) * power * variance) + power * 0.12,
        gravity: power * 3.4,
        size: index % 3 === 0 ? 6 : 4,
        color,
        timer: 0.44 + (index % 3) * 0.07,
        total: 0.44 + (index % 3) * 0.07,
      });
    }
  }

  function addLightRing(x, y, options = {}) {
    const total = options.total ?? 0.22;
    state.effects.push({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      gravity: 0,
      radiusXStart: options.radiusXStart ?? 8,
      radiusXEnd: options.radiusXEnd ?? 20,
      radiusYStart: options.radiusYStart ?? 2,
      radiusYEnd: options.radiusYEnd ?? 5,
      lineWidth: options.lineWidth ?? 1.15,
      color: options.color ?? '#fff7dd',
      timer: total,
      total,
    });
  }

  function addPowderSpecks(x, y, count = 3, perfect = false) {
    for (let index = 0; index < count; index += 1) {
      const spread = count <= 1 ? 0 : (index / (count - 1) - 0.5);
      const total = perfect ? 0.34 : 0.22;
      state.effects.push({
        kind: perfect ? 'star' : 'powder',
        x: x + spread * (perfect ? 20 : 12),
        y: y + (perfect ? 5 : 2),
        vx: spread * (perfect ? 30 : 20),
        vy: (perfect ? 42 : 28) + (index % 2) * 9,
        gravity: perfect ? 126 : 94,
        size: perfect ? (index % 2 === 0 ? 4.2 : 3.1) : (index % 2 === 0 ? 2.0 : 1.55),
        rotation: spread * 0.35,
        color: perfect ? (index % 2 === 0 ? '#fff3bf' : '#ffe0ef') : '#fff8e7',
        timer: total,
        total,
      });
    }
  }

  function startJumpEffect(player) {
    const footY = player.y + 1;
    addLightRing(player.x, footY, {
      total: 0.20,
      radiusXStart: 7,
      radiusXEnd: 19,
      radiusYStart: 2,
      radiusYEnd: 4.5,
      lineWidth: 1.05,
      color: '#fff7df',
    });
    addPowderSpecks(player.x, footY, 3);
  }

  function startLandingEffect(player, platform, perfect) {
    if (!player || !platform) return;
    const contactY = platform.top + 1;
    if (!perfect) {
      addLightRing(player.x, contactY, {
        total: 0.20,
        radiusXStart: 8,
        radiusXEnd: 18,
        radiusYStart: 2,
        radiusYEnd: 4,
        lineWidth: 1.05,
        color: '#fff5de',
      });
      return;
    }
    addLightRing(player.x, contactY, {
      total: 0.36,
      radiusXStart: 10,
      radiusXEnd: 29,
      radiusYStart: 2.5,
      radiusYEnd: 7,
      lineWidth: 1.35,
      color: '#ffe19a',
    });
    addLightRing(player.x, contactY + 2, {
      total: 0.32,
      radiusXStart: 22,
      radiusXEnd: 37,
      radiusYStart: 4,
      radiusYEnd: 8,
      lineWidth: 0.9,
      color: '#fff8df',
    });
    addPowderSpecks(player.x, contactY, 3, true);
    const total = 0.28;
    state.effects.push({
      kind: 'glow',
      x: player.x,
      y: player.y + 31,
      vx: 0,
      vy: 0,
      gravity: 0,
      radius: 33,
      color: '#fff4c9',
      timer: total,
      total,
    });
  }

  function updateEffects(dt) {
    state.effects = state.effects.filter((effect) => {
      effect.timer -= dt;
      effect.x += effect.vx * dt;
      effect.vy -= effect.gravity * dt;
      effect.y += effect.vy * dt;
      return effect.timer > 0;
    });
    state.platforms.forEach((platform) => {
      platform.impact = Math.max(0, (platform.impact || 0) - dt);
    });
    if (state.message) {
      state.message.timer -= dt;
      if (state.message.timer <= 0) state.message = null;
    }
    state.cameraShake = Math.max(0, state.cameraShake - dt * 0.9);
  }

  function updateSlipperyPlatformVisuals(dt) {
    const updateSheen = (platform) => {
      const sheen = platform?.slipperySheen;
      if (!sheen) return;
      sheen.elapsed = Math.min(sheen.duration, sheen.elapsed + dt);
      if (sheen.elapsed >= sheen.duration) platform.slipperySheen = null;
    };
    updateSheen(state.activeDonut);
    state.platforms.forEach(updateSheen);
  }

  function startJump() {
    const player = state.player;
    if (!player || state.screen !== 'play') return;

    // The PERFECT hop is a short paint-only reward, not a player jump. Keep
    // its landing and delayed next-donut cadence intact until it finishes.
    if (player.perfectSpinTimer > 0) return;

    // Airborne taps are intentionally ignored: each platform permits exactly
    // one grounded launch, keeping timing and landing choice meaningful.
    if (!player.grounded) return;

    // The original project separates the main player collision (a successful
    // platform stop while airborne) from side contact. Standing in an
    // approaching donut is the latter: it is never treated as a jump.
    if (state.activeDonut?.phase === 'incoming' && (playerSideTouchesIncomingDonut(player, state.activeDonut)
      || playerCoreTouchesIncomingDonut(player, state.activeDonut))) {
      finishGame(false, 'ドーナツにぶつかった！', state.activeDonut.side === 'left' ? 1 : -1);
      return;
    }
    // Capture the visual-only support transform before removing the grounded
    // state. Without this, a reacting or tilted donut drops its small paint
    // offset in one frame even though the physics foot has not moved yet.
    beginTakeoffSupportVisualBlend(player);
    player.jumpStartX = player.x;
    player.grounded = false;
    player.standingPlatformId = null;
    player.slipperyDrift = null;
    beginLandingRejumpBlend(player);
    player.jumpPhase = 'takeoff';
    player.jumpElapsed = 0;
    player.landingPoseTimer = 0;
    player.edgeLandingTimer = 0;
    player.edgeLandingDirection = 0;
    player.perfectSpinTimer = 0;
    player.perfectPendingSpawnWait = null;
    player.vy = JUMP_VELOCITY;
    startJumpEffect(player);
    audio.playJump();
    // A very short visual stretch sells the immediate, powered takeoff
    // without adding a pre-launch crouch or changing the collision body.
    player.squash = TAKEOFF_SQUASH;
  }

  function horizontalOverlap(playerX, platform) {
    if (!platform) return false;
    const left = playerX - PLAYER_CORE_HALF_WIDTH;
    const right = playerX + PLAYER_CORE_HALF_WIDTH;
    const donutHalf = platformCollisionWidth(platform) / 2;
    return right > platform.x - donutHalf && left < platform.x + donutHalf;
  }

  function platformLandingVisual(platform) {
    const reaction = platform?.landingReaction;
    if (!reaction || reaction.elapsed >= reaction.duration || platform?.collapseMotion) {
      return { offsetY: 0, rotation: 0 };
    }
    if (reaction.kind === 'perfect') {
      const progress = clamp(reaction.elapsed / reaction.duration, 0, 1);
      if (progress < 0.18) {
        const eased = 0.5 - Math.cos((progress / 0.18) * Math.PI) * 0.5;
        return { offsetY: reaction.sink * eased, rotation: 0 };
      }
      if (progress < 0.46) {
        const eased = 0.5 - Math.cos(((progress - 0.18) / 0.28) * Math.PI) * 0.5;
        return {
          offsetY: lerp(reaction.sink, -reaction.rebound, eased),
          rotation: 0,
        };
      }
      const eased = 0.5 - Math.cos(((progress - 0.46) / 0.54) * Math.PI) * 0.5;
      return {
        offsetY: lerp(-reaction.rebound, 0, eased),
        rotation: 0,
      };
    }
    if (reaction.kind === 'squishy') {
      // One deliberate compression, a single soft rebound, then rest. This
      // remains paint-only, so neither collision nor the jump arc move.
      const progress = clamp(reaction.elapsed / reaction.duration, 0, 1);
      const bounce = reaction.sink * 0.18;
      if (progress < 0.22) {
        return {
          offsetY: reaction.sink * Math.sin((progress / 0.22) * Math.PI * 0.5),
          rotation: 0,
        };
      }
      if (progress < 0.48) {
        return { offsetY: reaction.sink, rotation: 0 };
      }
      if (progress < 0.76) {
        const reboundProgress = (progress - 0.48) / 0.28;
        const eased = 0.5 - Math.cos(reboundProgress * Math.PI) * 0.5;
        return {
          offsetY: lerp(reaction.sink, -bounce, eased),
          rotation: 0,
        };
      }
      const settleProgress = (progress - 0.76) / 0.24;
      const eased = 0.5 - Math.cos(settleProgress * Math.PI) * 0.5;
      return {
        offsetY: lerp(-bounce, 0, eased),
        rotation: 0,
      };
    }
    if (reaction.elapsed < reaction.peakTime) {
      const progress = reaction.elapsed / reaction.peakTime;
      const eased = Math.sin(progress * Math.PI * 0.5);
      return {
        offsetY: clamp(lerp(reaction.startOffsetY, reaction.sink, eased), -1.25, PLATFORM_REACTION_MAX_SINK),
        rotation: clamp(lerp(reaction.startRotation, reaction.rotation, eased), -PLATFORM_REACTION_MAX_ANGLE, PLATFORM_REACTION_MAX_ANGLE),
      };
    }
    const settleTime = reaction.elapsed - reaction.peakTime;
    const response = Math.exp(-PLATFORM_REACTION_DAMPING * settleTime)
      * Math.cos(PLATFORM_REACTION_FREQUENCY * settleTime);
    return {
      offsetY: clamp(reaction.sink * response, -1.25, PLATFORM_REACTION_MAX_SINK),
      rotation: clamp(reaction.rotation * response, -PLATFORM_REACTION_MAX_ANGLE, PLATFORM_REACTION_MAX_ANGLE),
    };
  }

  function towerPulseVisual(pulse) {
    if (!pulse) return { offsetX: 0, offsetY: 0, rotation: 0 };
    const elapsed = pulse.elapsed - pulse.delay;
    if (elapsed < 0 || elapsed >= pulse.duration) {
      return { offsetX: 0, offsetY: 0, rotation: 0 };
    }
    // Ease into the first compression so the lower donut does not pop to a
    // new position on the first painted frame. The damped sine gives it one
    // small return sway before it settles.
    const attack = Math.sin(clamp(elapsed / 0.028, 0, 1) * Math.PI * 0.5);
    const response = attack
      * Math.exp(-pulse.damping * elapsed)
      * Math.sin(pulse.frequency * elapsed);
    return {
      offsetX: pulse.offsetX * response,
      offsetY: pulse.offsetY * response,
      rotation: pulse.rotation * response,
    };
  }

  function towerTransmissionVisual(platform) {
    if (!platform || platform.collapseMotion || !Array.isArray(platform.towerPulses)) {
      return { offsetX: 0, offsetY: 0, rotation: 0 };
    }
    const combined = platform.towerPulses.reduce((visual, pulse) => {
      const current = towerPulseVisual(pulse);
      visual.offsetX += current.offsetX;
      visual.offsetY += current.offsetY;
      visual.rotation += current.rotation;
      return visual;
    }, { offsetX: 0, offsetY: 0, rotation: 0 });
    return {
      offsetX: clamp(combined.offsetX, -TOWER_PULSE_MAX_OFFSET_X, TOWER_PULSE_MAX_OFFSET_X),
      offsetY: clamp(combined.offsetY, -TOWER_PULSE_MAX_OFFSET_Y, TOWER_PULSE_MAX_OFFSET_Y),
      rotation: clamp(combined.rotation, -TOWER_PULSE_MAX_ANGLE, TOWER_PULSE_MAX_ANGLE),
    };
  }

  function startTowerTransmission(landingPlatform, landingX) {
    if (!landingPlatform || landingPlatform.base || landingPlatform.collapseMotion) return;
    // The current platform keeps its existing direct landing reaction. Only
    // the one-to-three settled donuts below receive this delayed local pulse.
    const lowerPlatforms = state.platforms
      .filter((platform) => !platform.base && !platform.collapsed && !platform.collapseMotion)
      .filter((platform) => platform.step < landingPlatform.step)
      .sort((a, b) => b.step - a.step)
      .slice(0, TOWER_PULSE_MAX_DEPTH);
    if (!lowerPlatforms.length) return;

    const landingOffset = clamp(
      (landingX - landingPlatform.x) / (platformCollisionWidth(landingPlatform) * 0.38),
      -1,
      1,
    );
    // A short tower remains very steady. Near twenty layers, the visible
    // upper structure receives the full but still deliberately mild response.
    const heightProgress = clamp((landingPlatform.step - 2) / 18, 0, 1);
    const heightFactor = lerp(0.16, 1, heightProgress);
    const depthAttenuation = [0.58, 0.34, 0.16];
    const lateralAmount = Math.abs(landingOffset);

    lowerPlatforms.forEach((platform, index) => {
      const depth = index + 1;
      const strength = depthAttenuation[index] * heightFactor;
      const pulse = {
        elapsed: 0,
        delay: TOWER_PULSE_DELAY_START + (depth - 1) * TOWER_PULSE_DELAY_STEP,
        duration: TOWER_PULSE_DURATION + depth * 0.012,
        damping: TOWER_PULSE_DAMPING + depth * 0.35,
        frequency: TOWER_PULSE_FREQUENCY - depth * 0.55,
        // Centre landings read mainly as a small compression. Horizontal
        // push and local tilt appear only when the landing is offset.
        offsetX: clamp(landingOffset * 2.8 * strength, -TOWER_PULSE_MAX_OFFSET_X, TOWER_PULSE_MAX_OFFSET_X),
        offsetY: clamp((2.75 + lateralAmount * 0.35) * strength, 0, TOWER_PULSE_MAX_OFFSET_Y),
        rotation: clamp(
          landingOffset * ((3.3 * Math.PI) / 180) * strength,
          -TOWER_PULSE_MAX_ANGLE,
          TOWER_PULSE_MAX_ANGLE,
        ),
      };
      const activePulses = Array.isArray(platform.towerPulses) ? platform.towerPulses : [];
      // Retain a short overlapping echo if the player lands again quickly;
      // this avoids replacing an in-progress lower-layer reaction.
      platform.towerPulses = [...activePulses, pulse]
        .filter((entry) => entry.elapsed < entry.delay + entry.duration)
        .slice(-4);
    });
  }

  function startPlatformLandingReaction(platform, landingX, landingSpeed, perfect = false) {
    // Keep the serving plate/base stable.  Only a donut that the player has
    // actually landed on gets this small, visual-only response.
    if (!platform || platform.base || platform.collapseMotion) return;
    const current = platformLandingVisual(platform);
    if (perfect) {
      platform.landingReaction = {
        kind: 'perfect',
        elapsed: 0,
        duration: PERFECT_PLATFORM_REACTION_DURATION,
        sink: PERFECT_PLATFORM_REACTION_SINK,
        rebound: PERFECT_PLATFORM_REACTION_REBOUND,
      };
      return;
    }
    if (platform.variant === 'squishy') {
      platform.landingReaction = {
        kind: 'squishy',
        elapsed: 0,
        duration: SQUISHY_RETURN_DURATION,
        sink: donutProfile(platform).height * SQUISHY_SINK_RATIO,
      };
      return;
    }
    const speedFactor = clamp(landingSpeed / MAX_FALL_SPEED, 0, 1);
    const landingOffset = clamp(
      (landingX - platform.x) / (platformCollisionWidth(platform) * 0.38),
      -1,
      1,
    );
    const sink = 2 + speedFactor * 4;
    const rotation = landingOffset * ((3.8 * Math.PI) / 180);
    platform.landingReaction = {
      elapsed: 0,
      peakTime: PLATFORM_REACTION_PEAK_TIME,
      duration: PLATFORM_REACTION_DURATION,
      startOffsetY: current.offsetY,
      startRotation: current.rotation,
      sink: clamp(Math.max(sink, current.offsetY + sink * 0.45), 2, PLATFORM_REACTION_MAX_SINK),
      rotation: clamp(rotation + current.rotation * 0.35, -PLATFORM_REACTION_MAX_ANGLE, PLATFORM_REACTION_MAX_ANGLE),
    };
  }

  function updatePlatformLandingReactions(dt) {
    const advance = (platform) => {
      const reaction = platform?.landingReaction;
      if (reaction) {
        reaction.elapsed = Math.min(reaction.duration, reaction.elapsed + dt);
        if (reaction.elapsed >= reaction.duration) platform.landingReaction = null;
      }
      if (!Array.isArray(platform?.towerPulses)) return;
      platform.towerPulses.forEach((pulse) => {
        pulse.elapsed = Math.min(pulse.delay + pulse.duration, pulse.elapsed + dt);
      });
      platform.towerPulses = platform.towerPulses
        .filter((pulse) => pulse.elapsed < pulse.delay + pulse.duration);
    };
    state.platforms.forEach(advance);
    if (state.activeDonut?.phase === 'stopped') advance(state.activeDonut);
  }

  function platformRenderVisual(platform) {
    const reaction = platformLandingVisual(platform);
    const transmission = towerTransmissionVisual(platform);
    const perfectReaction = platform?.landingReaction?.kind === 'perfect';
    const maximumSink = platform?.landingReaction?.kind === 'squishy'
      ? donutProfile(platform).height * SQUISHY_SINK_RATIO + TOWER_PULSE_MAX_OFFSET_Y
      : PLATFORM_REACTION_MAX_SINK;
    // Preserve the normalized pastry silhouette. Landing feedback uses only
    // its existing position/rotation response; it never stretches the new
    // donut art or its apparent platform footprint.
    return {
      offsetX: transmission.offsetX,
      offsetY: clamp(
        reaction.offsetY + transmission.offsetY,
        perfectReaction ? -PERFECT_PLATFORM_REACTION_REBOUND : -1.25,
        maximumSink,
      ),
      rotation: clamp(
        reaction.rotation + transmission.rotation,
        -PLATFORM_REACTION_MAX_ANGLE,
        PLATFORM_REACTION_MAX_ANGLE,
      ),
      scaleX: 1,
      scaleY: 1,
    };
  }

  function landingVisualTransform(player) {
    if (!player || player.landingPoseTimer <= 0 || player.landingPoseDuration <= 0) {
      return { scaleX: 1, scaleY: 1 };
    }
    const elapsed = player.landingPoseDuration - player.landingPoseTimer;
    const progress = clamp(elapsed / player.landingPoseDuration, 0, 1);
    let squash;
    if (progress < LANDING_IMPACT_PORTION) {
      const impactProgress = progress / LANDING_IMPACT_PORTION;
      squash = (player.landingSquash || 0) * (1 - impactProgress);
    } else {
      const overshootProgress = (progress - LANDING_IMPACT_PORTION) / (1 - LANDING_IMPACT_PORTION);
      squash = LANDING_OVERSHOOT_SQUASH * Math.sin(overshootProgress * Math.PI);
    }
    return {
      scaleX: 1 + squash * 0.36,
      scaleY: 1 - squash * 0.48,
    };
  }

  function beginLandingRejumpBlend(player) {
    const landing = landingVisualTransform(player);
    // Preserve the existing takeoff pose, but use a brief visual-only blend
    // if the player taps while the landing compression is still visible.
    const takeoffScaleX = (1 + TAKEOFF_SQUASH * 0.36) * 0.992;
    const takeoffScaleY = (1 - TAKEOFF_SQUASH * 0.48) * 1.035;
    const hasLandingPose = player.landingPoseTimer > 0;
    player.landingCarryDuration = LANDING_REJUMP_BLEND_TIME;
    player.landingCarryTimer = hasLandingPose ? LANDING_REJUMP_BLEND_TIME : 0;
    player.landingCarryStartX = hasLandingPose ? landing.scaleX / takeoffScaleX : 1;
    player.landingCarryStartY = hasLandingPose ? landing.scaleY / takeoffScaleY : 1;
    player.landingCarryX = player.landingCarryStartX;
    player.landingCarryY = player.landingCarryStartY;
  }

  function updateLandingRejumpBlend(player, dt) {
    if (player.landingCarryTimer <= 0 || player.landingCarryDuration <= 0) {
      player.landingCarryTimer = 0;
      player.landingCarryX = 1;
      player.landingCarryY = 1;
      return;
    }
    player.landingCarryTimer = Math.max(0, player.landingCarryTimer - dt);
    const progress = 1 - (player.landingCarryTimer / player.landingCarryDuration);
    player.landingCarryX = lerp(player.landingCarryStartX, 1, progress);
    player.landingCarryY = lerp(player.landingCarryStartY, 1, progress);
  }

  function clearSupportVisualBlend(player) {
    if (!player) return;
    player.supportVisualMode = 'none';
    player.supportVisualTimer = 0;
    player.supportVisualOffsetX = 0;
    player.supportVisualOffsetY = 0;
    player.supportVisualRotation = 0;
    player.supportVisualAnchorX = 0;
    player.supportVisualAnchorActive = false;
  }

  function smoothSupportBlend(progress) {
    const clamped = clamp(progress, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
  }

  function playerTowerVisualTransform(player, platform) {
    if (!player || !platform || platform.base) {
      return { xOffset: 0, yOffset: 0, rotation: 0 };
    }
    const supportOffset = playerSupportVisualOffset(platform);
    const supportRotation = playerSupportVisualRotation(platform);
    const pose = playerVisualPose(player);
    const baseX = player.x;
    // Measure from the airborne (untucked) foot anchor. This lets the
    // transition include both the three-pixel contact tuck and the tower's
    // reacting/tilted position, then fade it in or out as paint only.
    const baseY = toScreenY(player.y) + pose.offsetY;
    const localX = baseX + supportOffset.xOffset;
    const localY = baseY + PLAYER_GROUNDED_CONTACT_OFFSET + supportOffset.yOffset;
    const rotation = state.tower?.angle || 0;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const pivotY = toScreenY(BASE_TOP);
    const relativeX = localX - CENTER_X;
    const relativeY = localY - pivotY;
    const transformedX = CENTER_X + relativeX * cosine - relativeY * sine;
    const transformedY = pivotY + relativeX * sine + relativeY * cosine;
    return {
      xOffset: transformedX - baseX,
      yOffset: transformedY - baseY,
      rotation: rotation + supportRotation,
    };
  }

  function beginLandingSupportVisualBlend(player, platform) {
    if (!player || !platform || platform.base) {
      clearSupportVisualBlend(player);
      return;
    }
    // Land from the untransformed airborne position, then blend only the
    // drawing into the donut/tower presentation. The physical landing is
    // already final before this function runs.
    // If the jump began from a tilted stack, start this blend from the same
    // screen-X anchor that was used in the air.  This avoids a second visual
    // snap at contact while preserving the existing landing reaction.
    const anchoredAirX = player.supportVisualAnchorActive
      ? player.supportVisualAnchorX
      : 0;
    player.supportVisualMode = 'landing';
    player.supportVisualDuration = SUPPORT_VISUAL_BLEND_TIME;
    player.supportVisualTimer = SUPPORT_VISUAL_BLEND_TIME;
    player.supportVisualOffsetX = anchoredAirX;
    player.supportVisualOffsetY = 0;
    player.supportVisualRotation = 0;
  }

  function beginTakeoffSupportVisualBlend(player) {
    const support = standingSupportPlatform();
    // A player can re-jump while the short landing blend is still active.
    // Capture the position that is actually being drawn, not the final
    // platform transform it is settling toward.
    const current = playerSupportTransitionVisual(player, support)
      || playerTowerVisualTransform(player, support);
    const hasSupportShift = Math.abs(current.xOffset) > 0.01
      || Math.abs(current.yOffset) > 0.01
      || Math.abs(current.rotation) > 0.0001;
    if (!hasSupportShift) {
      clearSupportVisualBlend(player);
      return;
    }
    // Preserve the exact visual location at takeoff. The small vertical
    // reaction and lean can settle over a few frames, but the detached
    // screen-X stays fixed for this jump instead of sliding away from the
    // support's high-tower transform.
    player.supportVisualMode = 'takeoff';
    player.supportVisualDuration = SUPPORT_VISUAL_BLEND_TIME;
    player.supportVisualTimer = SUPPORT_VISUAL_BLEND_TIME;
    player.supportVisualOffsetX = current.xOffset;
    player.supportVisualOffsetY = current.yOffset;
    player.supportVisualRotation = current.rotation;
    player.supportVisualAnchorX = current.xOffset;
    player.supportVisualAnchorActive = true;
  }

  function updateSupportVisualBlend(player, dt) {
    if (!player || player.supportVisualMode === 'none'
      || player.supportVisualMode === 'airborne-anchor'
      || player.supportVisualTimer <= 0) {
      return;
    }
    player.supportVisualTimer = Math.max(0, player.supportVisualTimer - dt);
    if (player.supportVisualTimer <= 0) {
      // The vertical/reaction part of the support handoff is now done. Keep
      // only the detached world-X paint anchor for the rest of this jump;
      // changing it here was the high-tower sideways hop.
      if (player.supportVisualMode === 'takeoff'
        && player.supportVisualAnchorActive && !player.grounded) {
        player.supportVisualMode = 'airborne-anchor';
        player.supportVisualOffsetY = 0;
        player.supportVisualRotation = 0;
        return;
      }
      clearSupportVisualBlend(player);
    }
  }

  function playerSupportTransitionVisual(player, platform) {
    if (!player || state.failure || player.supportVisualMode === 'none') {
      return null;
    }
    if (player.supportVisualMode === 'landing') {
      if (!player.grounded || !platform || platform.base || player.supportVisualDuration <= 0) return null;
      const transform = playerTowerVisualTransform(player, platform);
      const elapsed = player.supportVisualDuration - player.supportVisualTimer;
      const progress = smoothSupportBlend(elapsed / player.supportVisualDuration);
      return {
        xOffset: lerp(player.supportVisualOffsetX, transform.xOffset, progress),
        yOffset: transform.yOffset * progress,
        rotation: transform.rotation * progress,
      };
    }
    if (player.supportVisualMode === 'takeoff') {
      if (player.grounded || player.supportVisualDuration <= 0) return null;
      const progress = smoothSupportBlend(player.supportVisualTimer / player.supportVisualDuration);
      return {
        // Do not release the tower's screen-space X transform over the first
        // few airborne frames.  It is an anchor, not horizontal momentum.
        xOffset: player.supportVisualAnchorActive
          ? player.supportVisualAnchorX
          : player.supportVisualOffsetX * progress,
        yOffset: player.supportVisualOffsetY * progress,
        rotation: player.supportVisualRotation * progress,
      };
    }
    if (player.supportVisualMode === 'airborne-anchor') {
      if (player.grounded || !player.supportVisualAnchorActive) return null;
      return {
        xOffset: player.supportVisualAnchorX,
        yOffset: 0,
        rotation: 0,
      };
    }
    return null;
  }

  function applyLandingPresentation(player, platform, landingSpeed, perfect = false) {
    // This is deliberately paint-only. A harder descent or taller support
    // makes the small read of contact a touch stronger, without moving any
    // collision surface, changing balance, or altering the next jump.
    const speedFactor = clamp(landingSpeed / JUMP_VELOCITY, 0, 1);
    const heightFactor = clamp((platform?.step || 0) / 70, 0, 1);
    const visualImpact = 0.13 + speedFactor * 0.035 + heightFactor * 0.025;
    player.jumpPhase = 'landing';
    player.landingPoseDuration = LANDING_POSE_TIME;
    player.landingPoseTimer = LANDING_POSE_TIME;
    player.landingRebound = 0;
    // Final painted result: X 1.050–1.068 and Y 0.933–0.909.  This is
    // visual-only and begins only after a successful landing is resolved.
    player.landingSquash = 0.14 + speedFactor * 0.05 + (perfect ? 0.022 : 0);
    player.squash = 0;
    player.landingCarryTimer = 0;
    player.landingCarryX = 1;
    player.landingCarryY = 1;
    if (perfect) {
      player.perfectSpinDuration = PERFECT_PLAYER_SPIN_DURATION;
      player.perfectSpinTimer = PERFECT_PLAYER_SPIN_DELAY
        + PERFECT_PLAYER_SPIN_DURATION + PERFECT_PLAYER_SMILE_DURATION;
      player.perfectPendingSpawnWait = null;
      // A centered success should read as a celebration, never as a panic.
      player.edgeLandingTimer = 0;
      player.edgeLandingDirection = 0;
    } else {
      player.perfectSpinTimer = 0;
      player.perfectPendingSpawnWait = null;
    }
    if (platform) {
      platform.impact = Math.max(platform.impact || 0, visualImpact);
      // The support response is drawing-only.  Keeping it beside the shared
      // successful-landing presentation makes both incoming and already
      // settled platforms react through the same path.
      startPlatformLandingReaction(platform, player.x, landingSpeed, perfect);
      // Send only a small, delayed visual echo into the settled donuts below.
      // This intentionally has no route into collision, balance, or gameplay.
      startTowerTransmission(platform, player.x);
    }
    if (!perfect) beginEdgeLandingVisual(player, platform);
    beginLandingSupportVisualBlend(player, platform);
    startLandingEffect(player, platform, perfect);
    audio.playLanding(perfect);
  }

  function beginEdgeLandingVisual(player, platform) {
    if (!player || !platform) return;
    const contactHalfWidth = Math.max(
      1,
      platformCollisionWidth(platform) / 2 + PLAYER_CORE_HALF_WIDTH,
    );
    const landingOffset = player.x - platform.x;
    const edgeRatio = Math.abs(landingOffset) / contactHalfWidth;
    if (edgeRatio < EDGE_LANDING_FACE_THRESHOLD) {
      player.edgeLandingTimer = 0;
      player.edgeLandingDirection = 0;
      return;
    }
    player.edgeLandingDuration = EDGE_LANDING_FACE_DURATION;
    player.edgeLandingTimer = EDGE_LANDING_FACE_DURATION;
    player.edgeLandingDirection = Math.sign(landingOffset) || 0;
  }

  function updateEdgeLandingVisual(player, dt) {
    if (!player || player.edgeLandingTimer <= 0) return;
    player.edgeLandingTimer = Math.max(0, player.edgeLandingTimer - dt);
    if (player.edgeLandingTimer <= 0) player.edgeLandingDirection = 0;
  }

  function updatePerfectSpinVisual(player, dt) {
    if (!player || player.perfectSpinTimer <= 0) return;
    player.perfectSpinTimer = Math.max(0, player.perfectSpinTimer - dt);
    if (player.perfectSpinTimer <= 0 && Number.isFinite(player.perfectPendingSpawnWait)) {
      // Start the usual arrival countdown only after the visual hop has
      // returned to the same donut. No jump/collision state is touched.
      state.spawnWait = player.perfectPendingSpawnWait;
      player.perfectPendingSpawnWait = null;
    }
  }

  function updateAirbornePose(player, dt) {
    player.jumpElapsed += dt;
    if (player.jumpElapsed <= TAKEOFF_POSE_TIME) {
      player.jumpPhase = 'takeoff';
    } else if (player.vy > APEX_VELOCITY_THRESHOLD) {
      player.jumpPhase = 'rising';
    } else if (player.vy < -APEX_VELOCITY_THRESHOLD) {
      player.jumpPhase = 'falling';
    } else {
      player.jumpPhase = 'apex';
    }
  }

  function updateGroundedPose(player, dt) {
    if (player.landingPoseTimer > 0) {
      player.landingPoseTimer = Math.max(0, player.landingPoseTimer - dt);
      player.jumpPhase = 'landing';
    } else {
      player.jumpPhase = 'grounded';
      player.landingRebound = 0;
      player.landingSquash = 0;
    }
  }

  function updatePlayer(dt) {
    const player = state.player;
    if (!player) return;
    updateEdgeLandingVisual(player, dt);
    updatePerfectSpinVisual(player, dt);
    player.squash = lerp(player.squash, 0, Math.min(1, dt * 12));
    updateLandingRejumpBlend(player, dt);
    updateSupportVisualBlend(player, dt);
    if (player.grounded) {
      updateGroundedPose(player, dt);
      updateSlipperyLandingDrift(player, dt);
      // A grounded side/body hit is a miss. This check lives here (rather than
      // only in the tap handler) so standing still cannot let a donut pass
      // invisibly through the player.
      if (state.activeDonut?.phase === 'incoming' && (playerSideTouchesIncomingDonut(player, state.activeDonut)
        || playerCoreTouchesIncomingDonut(player, state.activeDonut))) {
        finishGame(false, 'ドーナツにぶつかった！', state.activeDonut.side === 'left' ? 1 : -1);
      }
      return;
    }
    player.previousY = player.y;
    // Vertical and horizontal movement remain separate. Normal play has no
    // horizontal player input—the incoming donut provides the lateral read—so
    // x is intentionally left untouched here. This rules out air steering,
    // target attraction, and a last-moment landing snap.
    let remainingTime = dt;
    let verticalVelocity = player.vy;
    let verticalPosition = player.y;
    // Split the one fixed step when it crosses the apex. That keeps the
    // rise/fall handoff smooth at every display frame instead of delaying the
    // stronger descent until the following 120 Hz substep.
    if (verticalVelocity > 0) {
      const riseTime = Math.min(remainingTime, verticalVelocity / JUMP_RISE_GRAVITY);
      verticalPosition += verticalVelocity * riseTime
        - 0.5 * JUMP_RISE_GRAVITY * riseTime * riseTime;
      verticalVelocity -= JUMP_RISE_GRAVITY * riseTime;
      remainingTime -= riseTime;
    }
    if (remainingTime > 0) {
      const nextVelocity = Math.max(
        -MAX_FALL_SPEED,
        verticalVelocity - JUMP_FALL_GRAVITY * remainingTime,
      );
      verticalPosition += (verticalVelocity + nextVelocity) * 0.5 * remainingTime;
      verticalVelocity = nextVelocity;
    }
    player.y = verticalPosition;
    player.vy = verticalVelocity;
    updateAirbornePose(player, dt);
    const active = state.activeDonut;
    // Mirror the original's two side sensors: a side/body hit ends the run.
    if (active?.phase === 'incoming' && playerSideTouchesIncomingDonut(player, active)) {
      finishGame(false, 'ドーナツにぶつかった！', active.side === 'left' ? 1 : -1);
      return;
    }
    // A centre collision is a landing only when the player is descending
    // through the donut's upper surface. This avoids the old web bug where
    // an upward or underside contact teleported the player onto the donut.
    const landsOnActive = active?.phase === 'incoming' && player.vy <= 0
      && horizontalOverlap(player.x, active)
      && player.previousY >= active.top
      && player.y <= active.top;
    if (landsOnActive) {
      landOnIncomingDonut(active);
      return;
    }
    // Any other centre overlap is a body hit: this includes entering from
    // below or passing through a donut while rising. It must never be treated
    // as a delayed landing or leave an extra jump opportunity.
    if (active?.phase === 'incoming' && playerCoreTouchesIncomingDonut(player, active)) {
      finishGame(false, 'ドーナツにぶつかった！', active.side === 'left' ? 1 : -1);
      return;
    }
    if (player.vy > 0) return;

    const possible = state.platforms
      .filter((platform) => !platform.collapsed)
      .filter((platform) => horizontalOverlap(player.x, platform))
      .filter((platform) => player.previousY >= platform.top && player.y <= platform.top)
      .sort((a, b) => b.top - a.top);
    const landing = possible[0];
    if (landing) {
      // Foot-surface contact resolution only. At 120 Hz this correction is
      // sub-step sized; it is not a target-position interpolation.
      const landingSpeed = Math.max(0, -player.vy);
      player.y = landing.top;
      player.previousY = landing.top;
      player.vy = 0;
      player.grounded = true;
      player.currentPlatform = Math.max(player.currentPlatform, landing.step);
      player.standingPlatformId = landing.id;
      beginSlipperyLandingDrift(player, landing);
      applyLandingPresentation(player, landing, landingSpeed);
    }
  }

  function updateCamera(dt) {
    const follow = Math.max(0, (state.player?.y || 0) - 310);
    state.cameraTargetY = follow;
    // A clean version of the source's delayed follow: it trails a rising
    // stack just enough to feel physical but never snaps on a landing.
    state.cameraY = lerp(state.cameraY, state.cameraTargetY, Math.min(1, dt * 5.4));
  }

  function finishGame(cleared, reason = '', direction = 0) {
    if (state.screen !== 'play') return;
    state.resultReason = reason;
    if (!cleared) {
      const player = state.player;
      const fallbackDirection = state.activeDonut?.side === 'left' ? 1 : -1;
      const hitDirection = direction || fallbackDirection;
      state.screen = 'impact';
      state.failure = {
        timer: FAILURE_IMPACT_TIME,
        total: FAILURE_IMPACT_TIME,
        direction: hitDirection,
      };
      state.spawnWait = Infinity;
      if (state.activeDonut) {
        state.activeDonut.phase = 'failed';
        state.activeDonut.speed = 0;
        state.activeDonut.impact = Math.max(state.activeDonut.impact || 0, 0.26);
      }
      if (player) {
        player.grounded = false;
        player.vy = 98;
        player.failVX = hitDirection * 132;
        player.squash = -0.12;
        addBurst(player.x, player.y + 30, '#e86b74', hitDirection, 11, 190);
      }
      state.message = { text: 'あぶない！', timer: 0.78, total: 0.78, color: '#c9545c' };
      state.cameraShake = Math.max(state.cameraShake, 0.26);
      audio.playFailure();
      return;
    }
    state.screen = 'clear';
    state.activeDonut = null;
    audio.playClear();
    if (cleared && state.stage && !state.speedTest.running && !state.authoredStagePreview.running
      && !state.gimmickTest.running && !state.slipperyTest.running && !state.surfaceTest.running && !state.donutTypesTest.running && !state.landingGimmickTest.running
      && !state.specialDonutPreviewTest.running) {
      const id = state.stage.id;
      if (!state.progress.completed.includes(id)) state.progress.completed.push(id);
      state.progress.unlocked = Math.max(state.progress.unlocked, Math.min(MAX_STAGE, id + 1));
      state.progress.selected = Math.min(MAX_STAGE, id + 1);
      saveProgress();
    }
  }

  function updatePlayStep(dt) {
    state.elapsed += dt;
    state.hintPulse += dt;
    updateEffects(dt);
    updateSlipperyPlatformVisuals(dt);
    updateTowerBalance(dt);
    if (state.transitionDelay > 0) {
      state.transitionDelay -= dt;
      if (state.transitionDelay <= 0) finishGame(true, 'GOAL!');
    } else if (!state.activeDonut && state.nextBeatIndex < state.stage.targetSteps) {
      state.spawnWait -= dt;
      if (state.spawnWait <= 0) spawnDonut();
    }
    updateActiveDonut(dt);
    updateSpecialDonutPreview(dt);
    updatePlatformLandingReactions(dt);
    if (state.screen !== 'play') return;
    updatePlayer(dt);
    if (state.screen !== 'play') return;
    updateGimmickPlatforms(dt);
    updateCamera(dt);
  }

  function updatePlay(dt) {
    state.physicsAccumulator = Math.min(0.18, state.physicsAccumulator + dt);
    while (state.physicsAccumulator >= PHYSICS_STEP) {
      state.physicsAccumulator -= PHYSICS_STEP;
      updatePlayStep(PHYSICS_STEP);
      if (state.screen !== 'play') {
        state.physicsAccumulator = 0;
        break;
      }
    }
  }

  function updateImpactStep(dt) {
    const player = state.player;
    const failure = state.failure;
    if (!player || !failure) {
      state.screen = 'gameover';
      return;
    }
    state.hintPulse += dt;
    updateEffects(dt);
    if (failure.kind === 'tower-collapse') {
      updateTowerCollapse(dt, failure);
      failure.timer -= dt;
      updateCamera(dt);
      if (failure.timer <= 0) {
        state.screen = 'gameover';
        state.failure = null;
      }
      return;
    }
    if (state.activeDonut) state.activeDonut.impact = Math.max(0, (state.activeDonut.impact || 0) - dt);
    player.previousY = player.y;
    player.vy -= FAILURE_GRAVITY * 0.72 * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x + (player.failVX || 0) * dt, -40, WIDTH + 40);
    player.squash = lerp(player.squash, 0.09, Math.min(1, dt * 5));
    failure.timer -= dt;
    updateCamera(dt);
    if (failure.timer <= 0) {
      state.screen = 'gameover';
      state.failure = null;
    }
  }

  function updateImpact(dt) {
    state.physicsAccumulator = Math.min(0.18, state.physicsAccumulator + dt);
    while (state.physicsAccumulator >= PHYSICS_STEP) {
      state.physicsAccumulator -= PHYSICS_STEP;
      updateImpactStep(PHYSICS_STEP);
      if (state.screen !== 'impact') {
        state.physicsAccumulator = 0;
        break;
      }
    }
  }

  function drawBackground() {
    const theme = getBackgroundTheme();
    const hasReferenceArtwork = drawBakeryWall(theme);

    const baseScreenY = toScreenY(BASE_TOP - 8);
    // Reference artwork already includes its finished lower scene.  Only the
    // unloaded-image fallback needs the legacy painted counter.
    if (!hasReferenceArtwork && baseScreenY < HEIGHT + 80) drawShopFloor(baseScreenY, theme);

    if (state.stage) {
      const goalY = stageGoalTop(state.stage);
      const screenY = toScreenY(goalY);
      if (screenY > -80 && screenY < HEIGHT + 100) {
        drawGoalSign(screenY + GOAL_SIGN_VISUAL_DROP);
      }
    }
  }

  function drawBakeryWall(theme = getBackgroundTheme()) {
    const backdrop = getBackgroundArtwork(theme);
    if (backdrop) {
      drawArtworkCover(backdrop);
      return true;
    }
    drawThemeFallback(theme);
    return false;
  }

  function colorWithAlpha(hex, alpha) {
    const normalized = String(hex || '#000000').replace('#', '');
    const value = Number.parseInt(normalized.length === 3
      ? normalized.split('').map((part) => part + part).join('')
      : normalized, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
  }

  function drawThemeFallback(theme) {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, theme.top);
    gradient.addColorStop(0.54, theme.middle);
    gradient.addColorStop(1, theme.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawThemeSideDecor(theme);
    // Keep the active tower lane intentionally calm and darker than the
    // decorative edges. The player, platforms and HUD remain the focal point.
    const lane = ctx.createLinearGradient(0, 0, WIDTH, 0);
    lane.addColorStop(0, colorWithAlpha(theme.lane, 0));
    lane.addColorStop(0.20, colorWithAlpha(theme.lane, 0.12));
    lane.addColorStop(0.37, colorWithAlpha(theme.lane, 0.58));
    lane.addColorStop(0.50, colorWithAlpha(theme.lane, 0.79));
    lane.addColorStop(0.63, colorWithAlpha(theme.lane, 0.58));
    lane.addColorStop(0.80, colorWithAlpha(theme.lane, 0.12));
    lane.addColorStop(1, colorWithAlpha(theme.lane, 0));
    ctx.fillStyle = lane;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = colorWithAlpha(theme.accent, 0.08);
    ctx.fillRect(0, 0, WIDTH, 3);
  }

  function drawThemeSideDecor(theme) {
    ctx.save();
    if (theme.id === 'night-shop') {
      drawBackgroundPillar(0, 62, 55, HEIGHT - 124, '#291a1c', '#6c3529');
      drawBackgroundPillar(335, 118, 55, HEIGHT - 184, '#291a1c', '#6c3529');
      drawSoftGlow(71, 132, 54, theme.accent, 0.18);
      drawSoftGlow(320, 216, 42, theme.accent, 0.15);
      drawWarmLamp(67, 112, theme.accent);
      drawWarmLamp(323, 194, theme.accent);
      drawWindowGrid(0, 246, 50, 192, '#70402d', '#1a1c26', 3, 5);
      drawWindowGrid(346, 301, 44, 170, '#70402d', '#1a1c26', 3, 4);
    } else if (theme.id === 'neon-street') {
      drawBackgroundPillar(0, 112, 74, HEIGHT - 160, '#0b1020', '#25284d');
      drawBackgroundPillar(326, 74, 64, HEIGHT - 140, '#0b1020', '#25284d');
      drawWindowGrid(8, 228, 51, 322, '#20284d', '#090d1b', 3, 7);
      drawWindowGrid(338, 182, 44, 286, '#24244b', '#090d1b', 3, 6);
      drawNeonBar(18, 176, 5, 98, theme.accentSoft);
      drawNeonBar(365, 124, 5, 105, theme.accent);
      drawNeonBar(27, 353, 34, 4, theme.accent);
      drawNeonBar(332, 302, 39, 4, theme.accentSoft);
      drawSoftGlow(37, 255, 34, theme.accentSoft, 0.16);
      drawSoftGlow(354, 205, 34, theme.accent, 0.14);
    } else if (theme.id === 'moonlit-wa-modern') {
      drawSoftGlow(52, 152, 64, '#f5e8ba', 0.17);
      ctx.fillStyle = colorWithAlpha('#fff5d8', 0.72);
      ctx.beginPath();
      ctx.arc(49, 147, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colorWithAlpha(theme.top, 0.82);
      ctx.beginPath();
      ctx.arc(58, 140, 22, 0, Math.PI * 2);
      ctx.fill();
      drawLatticePanel(0, 200, 70, 420, '#4b3632', '#b59355');
      drawLatticePanel(322, 120, 68, 450, '#4b3632', '#b59355');
      drawNeonBar(18, 496, 4, 92, theme.accentSoft);
      drawNeonBar(367, 414, 4, 92, theme.accent);
      drawSoftGlow(38, 546, 33, theme.accentSoft, 0.12);
      drawSoftGlow(352, 464, 33, theme.accent, 0.11);
    } else if (theme.id === 'midnight-cafe') {
      drawBackgroundPillar(0, 134, 65, HEIGHT - 190, '#211618', '#5d3d2b');
      drawBackgroundPillar(325, 182, 65, HEIGHT - 238, '#211618', '#5d3d2b');
      drawWarmLamp(55, 164, theme.accent);
      drawWarmLamp(337, 218, theme.accent);
      drawSoftGlow(55, 183, 55, theme.accent, 0.15);
      drawSoftGlow(337, 237, 50, theme.accent, 0.14);
      drawCafeShelf(7, 330, 60, '#4c3027', '#8f5d3b');
      drawCafeShelf(323, 384, 60, '#4c3027', '#8f5d3b');
      drawWindowGrid(0, 518, 62, 174, '#4b372f', '#151820', 3, 3);
      drawWindowGrid(329, 572, 61, 174, '#4b372f', '#151820', 3, 3);
    } else if (theme.id === 'dreamy-night-sweets') {
      drawSoftGlow(343, 158, 72, '#d5d9fa', 0.17);
      ctx.fillStyle = colorWithAlpha('#f4f0df', 0.72);
      ctx.beginPath();
      ctx.arc(346, 154, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colorWithAlpha(theme.middle, 0.80);
      ctx.beginPath();
      ctx.arc(357, 144, 29, 0, Math.PI * 2);
      ctx.fill();
      drawNightCloud(12, 292, 65, colorWithAlpha('#aebce3', 0.16));
      drawNightCloud(310, 406, 75, colorWithAlpha('#d1b8db', 0.13));
      drawNightCloud(0, 632, 86, colorWithAlpha('#aebce3', 0.11));
      drawNightCloud(327, 694, 88, colorWithAlpha('#d1b8db', 0.10));
      drawStarsAtEdges(theme.accent, theme.accentSoft);
    } else if (theme.id === 'night-sweets-castle') {
      drawSoftGlow(337, 145, 72, '#f5e8bd', 0.17);
      ctx.fillStyle = colorWithAlpha('#fff3d0', 0.65);
      ctx.beginPath();
      ctx.arc(340, 142, 27, 0, Math.PI * 2);
      ctx.fill();
      drawCastleSilhouette(0, 308, 81, '#211829', theme.accent);
      drawCastleSilhouette(309, 250, 81, '#211829', theme.accent);
      drawNeonBar(17, 466, 41, 3, theme.accentSoft);
      drawNeonBar(332, 406, 41, 3, theme.accent);
      drawLatticePanel(0, 548, 56, 220, '#352333', '#8f6a42');
      drawLatticePanel(334, 510, 56, 240, '#352333', '#8f6a42');
      drawSoftGlow(37, 467, 32, theme.accentSoft, 0.10);
      drawSoftGlow(353, 407, 32, theme.accent, 0.10);
    }
    ctx.restore();
  }

  function drawBackgroundPillar(x, y, width, height, fill, edge) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = colorWithAlpha(edge, 0.62);
    ctx.fillRect(x + (x < CENTER_X ? width - 3 : 0), y, 3, height);
    ctx.fillStyle = colorWithAlpha('#ffffff', 0.045);
    ctx.fillRect(x + 7, y, 1, height);
  }

  function drawWindowGrid(x, y, width, height, frame, pane, columns, rows) {
    ctx.fillStyle = pane;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = colorWithAlpha(frame, 0.78);
    ctx.lineWidth = 2;
    for (let column = 0; column <= columns; column += 1) {
      const paneX = x + (width / columns) * column;
      ctx.fillRect(paneX, y, 2, height);
    }
    for (let row = 0; row <= rows; row += 1) {
      const paneY = y + (height / rows) * row;
      ctx.fillRect(x, paneY, width, 2);
    }
  }

  function drawSoftGlow(x, y, radius, color, alpha) {
    const glow = ctx.createRadialGradient(x, y, 1, x, y, radius);
    glow.addColorStop(0, colorWithAlpha(color, alpha));
    glow.addColorStop(1, colorWithAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWarmLamp(x, y, color) {
    ctx.fillStyle = colorWithAlpha('#0a090c', 0.60);
    ctx.fillRect(x - 1, 0, 2, y - 13);
    ctx.fillStyle = colorWithAlpha('#38251d', 0.90);
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 12);
    ctx.lineTo(x + 18, y - 12);
    ctx.lineTo(x + 11, y + 4);
    ctx.lineTo(x - 11, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colorWithAlpha(color, 0.66);
    ctx.fillRect(x - 7, y - 8, 14, 6);
  }

  function drawNeonBar(x, y, width, height, color) {
    ctx.fillStyle = colorWithAlpha(color, 0.12);
    ctx.fillRect(x - 3, y - 3, width + 6, height + 6);
    ctx.fillStyle = colorWithAlpha(color, 0.72);
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = colorWithAlpha('#f8f7ef', 0.48);
    ctx.fillRect(x + (width > height ? 2 : 0), y + (height > width ? 2 : 0), Math.max(1, width - (width > height ? 4 : 0)), Math.max(1, height - (height > width ? 4 : 0)));
  }

  function drawLatticePanel(x, y, width, height, fill, line) {
    ctx.fillStyle = colorWithAlpha(fill, 0.56);
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = colorWithAlpha(line, 0.32);
    ctx.lineWidth = 1;
    for (let offset = -height; offset < width; offset += 18) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y + height);
      ctx.lineTo(x + offset + height, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset + height, y + height);
      ctx.stroke();
    }
  }

  function drawCafeShelf(x, y, width, wood, accent) {
    ctx.fillStyle = colorWithAlpha(wood, 0.74);
    ctx.fillRect(x, y, width, 8);
    ctx.fillRect(x + 5, y + 8, 4, 42);
    ctx.fillRect(x + width - 9, y + 8, 4, 42);
    ctx.fillStyle = colorWithAlpha(accent, 0.52);
    ctx.fillRect(x + 8, y - 18, width - 16, 17);
    ctx.fillStyle = colorWithAlpha('#f6d6ab', 0.20);
    ctx.fillRect(x + 12, y - 15, width - 24, 3);
  }

  function drawNightCloud(x, y, width, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x + width * 0.30, y, width * 0.30, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x + width * 0.53, y - 8, width * 0.31, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(x + width * 0.76, y + 2, width * 0.25, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStarsAtEdges(primary, secondary) {
    const stars = [
      [26, 166, 1.2, primary], [61, 230, 1.6, secondary], [18, 398, 1.1, primary],
      [51, 579, 1.3, secondary], [366, 272, 1.5, primary], [333, 335, 1.1, secondary],
      [369, 544, 1.4, primary], [338, 680, 1.2, secondary],
    ];
    stars.forEach(([x, y, radius, color]) => {
      ctx.fillStyle = colorWithAlpha(color, 0.62);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCastleSilhouette(x, y, width, fill, gold) {
    ctx.fillStyle = colorWithAlpha(fill, 0.88);
    ctx.fillRect(x, y + 54, width, HEIGHT - y - 54);
    ctx.fillRect(x + 10, y + 20, 22, 70);
    ctx.fillRect(x + 49, y, 20, 90);
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 20);
    ctx.lineTo(x + 21, y - 2);
    ctx.lineTo(x + 36, y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 45, y);
    ctx.lineTo(x + 59, y - 23);
    ctx.lineTo(x + 73, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colorWithAlpha(gold, 0.42);
    ctx.fillRect(x + 18, y + 49, 6, 9);
    ctx.fillRect(x + 54, y + 28, 6, 10);
  }

  function drawArtworkCover(image) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return;
    // The supplied reference art is already a portrait game composition with
    // a protected upper UI area and a clear central play lane.  Fit its full
    // height, then crop equally from the left/right only; this preserves the
    // approved vertical composition instead of zooming into it.
    const scale = HEIGHT / sourceHeight;
    const drawWidth = sourceWidth * scale;
    const drawX = (WIDTH - drawWidth) / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, drawX, 0, drawWidth, HEIGHT);
    ctx.restore();
  }

  function drawBakeryShelf(x, y, rightSide) {
    const startX = rightSide ? x - 2 : x;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#d09270';
    ctx.fillRect(startX, y, 58, 6);
    ctx.fillRect(startX + 4, y + 6, 4, 30);
    ctx.fillRect(startX + 49, y + 6, 4, 30);
    ctx.fillStyle = '#e6b186';
    ctx.fillRect(startX + 4, y - 23, 27, 23);
    ctx.fillRect(startX + 7, y - 26, 21, 4);
    ctx.fillRect(startX + 34, y - 18, 17, 18);
    ctx.fillRect(startX + 36, y - 21, 13, 4);
    ctx.fillStyle = '#fff2d4';
    ctx.fillRect(startX + 8, y - 19, 19, 15);
    ctx.fillRect(startX + 38, y - 14, 9, 10);
    ctx.restore();
  }

  function drawPendant(x, startY, length) {
    const wireBottom = startY + length - 27;
    ctx.fillStyle = BAKERY.inkSoft;
    ctx.fillRect(x - 2, startY, 4, wireBottom - startY);
    ctx.fillStyle = '#f5b48d';
    ctx.fillRect(x, startY, 1, wireBottom - startY);
    ctx.fillStyle = BAKERY.ink;
    ctx.fillRect(x - 19, wireBottom, 38, 4);
    ctx.fillRect(x - 25, wireBottom + 4, 50, 17);
    ctx.fillRect(x - 20, wireBottom + 21, 40, 4);
    ctx.fillStyle = '#d78972';
    ctx.fillRect(x - 21, wireBottom + 7, 42, 11);
    ctx.fillStyle = '#f0a377';
    ctx.fillRect(x - 16, wireBottom + 10, 32, 5);
    ctx.fillStyle = '#ffe9aa';
    ctx.fillRect(x - 11, wireBottom + 18, 22, 5);
    ctx.fillStyle = '#fff9cf';
    ctx.fillRect(x - 6, wireBottom + 20, 12, 3);
  }

  function drawShopFloor(y, theme = getBackgroundTheme()) {
    // The base donut is served on a shop counter, not placed on a tiled or
    // brick-like floor.  This is paint only: the anchor, camera movement and
    // the starting platform's collision shape remain untouched.
    const counterY = Math.round(y) - COUNTER_VISUAL_RAISE;
    // The top plane surrounds the plate and its front lip meets the lower
    // rim.  This reads as a tabletop rather than a floor while retaining the
    // exact same game-space anchor.
    const tabletopBackY = counterY + 36;
    const countertopFrontY = counterY + 60;
    ctx.save();
    // Wide, uninterrupted top plane — deliberately no staggered joints.
    ctx.fillStyle = 'rgba(89, 50, 39, .33)';
    ctx.fillRect(0, tabletopBackY - 3, WIDTH, 3);
    ctx.fillStyle = theme.counterTop || '#efb77e';
    ctx.fillRect(0, tabletopBackY, WIDTH, countertopFrontY - tabletopBackY);
    ctx.fillStyle = '#ffe0b0';
    ctx.fillRect(0, tabletopBackY + 3, WIDTH, 3);
    ctx.fillStyle = 'rgba(139, 76, 52, .20)';
    for (let grainY = tabletopBackY + 11; grainY < countertopFrontY - 3; grainY += 8) {
      ctx.fillRect(18, grainY, WIDTH - 36, 1);
    }
    // A strong lip and apron make this read as a raised shop counter instead
    // of a floor, while the plate remains drawn above it.
    ctx.fillStyle = colorWithAlpha(theme.counterFront || '#704234', 0.82);
    ctx.fillRect(0, countertopFrontY, WIDTH, 7);
    ctx.fillStyle = theme.counterFront || '#a95d45';
    ctx.fillRect(0, countertopFrontY + 7, WIDTH, HEIGHT - countertopFrontY - 7);
    ctx.fillStyle = 'rgba(255, 216, 163, .28)';
    ctx.fillRect(0, countertopFrontY + 9, WIDTH, 2);
    ctx.fillStyle = 'rgba(83, 44, 35, .20)';
    ctx.fillRect(18, countertopFrontY + 22, WIDTH - 36, 1);
    ctx.restore();
  }

  function drawGoalSign(y) {
    ctx.save();
    ctx.translate(CENTER_X, y);
    roundRect(-76, -32, 152, 40, 14, '#fff9e8', '#87504d');
    ctx.lineWidth = 3;
    text('GOAL', 0, -12, 18, '#ce6973');
    drawMiniDonut(-53, -12, '#ef8aa2', 0.62);
    drawMiniDonut(53, -12, '#f2b365', 0.62);
    ctx.restore();
  }

  function drawMiniDonut(x, y, frosting = '#ef8aa2', scale = 1) {
    const sprite = getArtwork(donutArtworkKey(frosting));
    if (sprite) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.drawImage(sprite, -20, -8, 40, 16);
      ctx.restore();
      return;
    }
    const palette = frostingPalette(frosting);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = BAKERY.ink;
    ctx.fillRect(-20, -5, 40, 10);
    ctx.fillRect(-17, -8, 34, 16);
    ctx.fillStyle = BAKERY.dough;
    ctx.fillRect(-17, -3, 34, 8);
    ctx.fillStyle = BAKERY.doughLight;
    ctx.fillRect(-12, 3, 24, 3);
    ctx.fillStyle = palette.shade;
    ctx.fillRect(-16, -6, 32, 7);
    ctx.fillStyle = palette.base;
    ctx.fillRect(-14, -6, 28, 5);
    ctx.fillRect(-7, -1, 5, 4);
    ctx.fillRect(6, -1, 4, 3);
    ctx.fillStyle = palette.highlight;
    ctx.fillRect(-9, -5, 5, 1);
    ctx.fillRect(7, -3, 4, 1);
    ctx.restore();
  }

  function frostingPalette(value) {
    if (value === '#9b6959') return FROSTING.cocoa;
    if (value === '#75a77e') return FROSTING.matcha;
    if (value === '#dc9b58') return FROSTING.caramel;
    if (value === '#f0bd61' || value === '#fff0c8') return FROSTING.vanilla;
    if (value === '#d59a54') return FROSTING.caramel;
    return FROSTING.strawberry;
  }

  function donutArtworkKey(value) {
    if (value === '#9b6959') return 'donutCocoa';
    if (value === '#75a77e') return 'donutMatcha';
    if (value === '#dc9b58' || value === '#d59a54' || value === '#f2b365') return 'donutCaramel';
    if (value === '#f0bd61' || value === '#fff0c8') return 'donutVanilla';
    return 'donutStrawberry';
  }

  function drawGimmickMark(platform, left, top) {
    if (!state.gimmickTest.running || !platform.gimmick) return;
    ctx.save();
    if (platform.gimmick === 'slide') {
      const arrowY = top - 10;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#805561';
      ctx.fillRect(left + 67, arrowY, 38, 2);
      ctx.fillRect(left + 64, arrowY - 2, 5, 6);
      ctx.fillRect(left + 103, arrowY - 2, 5, 6);
      ctx.fillStyle = '#fff7e8';
      ctx.fillRect(left + 71, arrowY, 30, 1);
    } else if (platform.gimmick === 'crack') {
      const warning = platform.crackTotal > 0
        ? clamp(1 - platform.crackTimer / platform.crackTotal, 0, 1)
        : 0;
      ctx.globalAlpha = 0.62 + warning * 0.36;
      ctx.strokeStyle = warning > 0.76 ? '#a63e4e' : '#71434b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left + 75, top + 8);
      ctx.lineTo(left + 84, top + 16);
      ctx.lineTo(left + 79, top + 23);
      ctx.lineTo(left + 93, top + 31);
      ctx.lineTo(left + 88, top + 42);
      ctx.stroke();
      if (warning > 0.76) {
        ctx.fillStyle = '#b34e57';
        ctx.fillRect(left + 107, top + 13, 5, 5);
        ctx.fillRect(left + 117, top + 24, 4, 4);
      }
    } else if (platform.gimmick === 'speed' || platform.gimmick?.startsWith('feint-')) {
      const trailWidth = platform.feintApplied ? 28 : 15;
      const trailX = platform.side === 'left' ? left - trailWidth - 7 : left + DONUT_WIDTH + 7;
      ctx.globalAlpha = 0.58;
      ctx.fillStyle = platform.gimmick === 'speed' || platform.feintApplied ? '#d66559' : '#9b7770';
      ctx.fillRect(trailX, top + 19, trailWidth, 2);
      ctx.fillRect(trailX + (platform.side === 'left' ? 6 : 0), top + 29, Math.max(8, trailWidth - 8), 2);
    }
    ctx.restore();
  }

  function drawBasePlate(x, top, profile = DONUT_TYPES.normal) {
    // This plate is rendered with the starting platform, not baked into the
    // static backdrop.  It therefore follows the base donut during camera
    // movement while leaving its collision footprint completely unchanged.
    const plateY = top + profile.renderHeight - 1;
    const plateWidth = 224;
    const plateHeight = 29;
    ctx.save();
    ctx.translate(x, plateY);
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = 'rgba(96, 56, 45, .16)';
    ctx.beginPath();
    ctx.ellipse(0, 13, plateWidth * 0.39, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b97d63';
    ctx.beginPath();
    ctx.ellipse(0, 4, plateWidth / 2, plateHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff8eb';
    ctx.beginPath();
    ctx.ellipse(0, 1, plateWidth / 2 - 4, plateHeight / 2 - 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8a98c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 1, plateWidth / 2 - 11, plateHeight / 2 - 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, .64)';
    ctx.beginPath();
    ctx.ellipse(-42, -3, 33, 4, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSlipperySurfaceSheen(platform, left, top, profile = donutProfile(platform)) {
    // This is deliberately a platform-local, short-lived paint effect.  It
    // makes the glaze read as slick without touching the platform's physical
    // size, collision envelope, or stacking coordinates.
    const sheen = platform?.variant === 'slippery' ? platform.slipperySheen : null;
    if (!sheen || sheen.duration <= 0) return;
    const progress = clamp(sheen.elapsed / sheen.duration, 0, 1);
    const pulse = Math.sin(progress * Math.PI);
    if (pulse <= 0.01) return;

    const impactX = clamp(
      left + profile.width / 2 + sheen.landingOffset,
      left + Math.min(26, profile.width * 0.22),
      left + profile.width - Math.min(26, profile.width * 0.22),
    );
    const surfaceY = top + 18;
    const spread = 9 + progress * 46;
    const alpha = pulse * sheen.strength;

    ctx.save();
    ctx.lineCap = 'round';
    [-1, 1].forEach((direction) => {
      const startX = impactX + direction * 2;
      const endX = impactX + direction * spread;
      // A warm, very thin under-glint keeps the pale highlight visible even
      // when the slippery vanilla artwork is nearly white.
      ctx.strokeStyle = '#e3ae70';
      ctx.globalAlpha = alpha * 0.36;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(startX, surfaceY + 1.2);
      ctx.quadraticCurveTo(
        impactX + direction * spread * 0.5,
        surfaceY - 2.1,
        endX,
        surfaceY - 0.4,
      );
      ctx.stroke();
      ctx.strokeStyle = '#fffced';
      ctx.globalAlpha = alpha * 0.68;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
    ctx.fillStyle = '#fff8dd';
    ctx.globalAlpha = alpha * 0.78;
    ctx.beginPath();
    ctx.ellipse(impactX, surfaceY, 4.2 + progress * 3.2, 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawThickDonut(platform, left, top, profile, palette) {
    // A compact, side-on double-layer pastry. It keeps the regular donut's
    // width and top contact while the striped cream layer makes the extra
    // depth readable at a glance.
    const width = profile.width;
    const height = profile.renderHeight;
    const right = left + width;
    const bodyTop = top + 20;
    const bodyBottom = top + height - 3;
    const creamTop = top + 45;
    const creamBottom = top + 60;
    const step = Number(platform.step || 0);

    ctx.save();
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(left + width * 0.14, bodyTop);
      ctx.quadraticCurveTo(left + width * 0.045, bodyTop + 5, left + width * 0.035, bodyTop + 20);
      ctx.lineTo(left + width * 0.035, bodyBottom - 16);
      ctx.quadraticCurveTo(left + width * 0.06, bodyBottom - 3, left + width * 0.18, bodyBottom);
      ctx.quadraticCurveTo(left + width * 0.5, bodyBottom + 4, right - width * 0.18, bodyBottom);
      ctx.quadraticCurveTo(right - width * 0.06, bodyBottom - 3, right - width * 0.035, bodyBottom - 16);
      ctx.lineTo(right - width * 0.035, bodyTop + 20);
      ctx.quadraticCurveTo(right - width * 0.045, bodyTop + 5, right - width * 0.14, bodyTop);
      ctx.closePath();
    };
    const bodyGradient = ctx.createLinearGradient(left, bodyTop, left, bodyBottom);
    bodyGradient.addColorStop(0, '#c77442');
    bodyGradient.addColorStop(0.18, '#efa354');
    bodyGradient.addColorStop(0.62, '#f6bc69');
    bodyGradient.addColorStop(1, '#c87347');
    ctx.fillStyle = bodyGradient;
    bodyPath();
    ctx.fill();
    ctx.strokeStyle = '#95513e';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // A golden upper dough band makes the frosting sit on a real first layer
    // instead of on a vertically stretched regular donut.
    const upperDough = ctx.createLinearGradient(left, top + 30, left, creamTop + 3);
    upperDough.addColorStop(0, '#f6c36d');
    upperDough.addColorStop(1, '#d98245');
    ctx.fillStyle = upperDough;
    ctx.beginPath();
    ctx.moveTo(left + width * 0.09, top + 31);
    ctx.quadraticCurveTo(left + width * 0.50, top + 37, right - width * 0.09, top + 31);
    ctx.lineTo(right - width * 0.105, creamTop + 2);
    ctx.quadraticCurveTo(left + width * 0.50, creamTop + 7, left + width * 0.105, creamTop + 2);
    ctx.closePath();
    ctx.fill();

    // The pale middle filling is a contained visual layer: it never affects
    // the stable, continuous collision surface at the top of the platform.
    const creamPath = () => {
      ctx.beginPath();
      ctx.moveTo(left + width * 0.095, creamTop);
      ctx.quadraticCurveTo(left + width * 0.50, creamTop + 5, right - width * 0.095, creamTop);
      ctx.lineTo(right - width * 0.105, creamBottom - 2);
      ctx.quadraticCurveTo(left + width * 0.50, creamBottom + 3, left + width * 0.105, creamBottom - 2);
      ctx.closePath();
    };
    creamPath();
    ctx.fillStyle = '#fff0d8';
    ctx.fill();
    ctx.strokeStyle = '#d99e82';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.save();
    creamPath();
    ctx.clip();
    ctx.strokeStyle = colorWithAlpha(palette.shade, 0.56);
    ctx.lineWidth = 5.5;
    for (let index = 0; index < 6; index += 1) {
      const stripeX = left + width * (0.08 + index * 0.17);
      ctx.beginPath();
      ctx.moveTo(stripeX - 8, creamBottom + 3);
      ctx.lineTo(stripeX + 16, creamTop - 4);
      ctx.stroke();
    }
    ctx.restore();

    // A softly shaded lower dough layer keeps the two tiers distinct without
    // widening the silhouette or moving the shared platform centre.
    const lowerDough = ctx.createLinearGradient(left, creamBottom - 1, left, bodyBottom);
    lowerDough.addColorStop(0, '#eda657');
    lowerDough.addColorStop(0.70, '#f4bd6d');
    lowerDough.addColorStop(1, '#bd6944');
    ctx.fillStyle = lowerDough;
    ctx.beginPath();
    ctx.moveTo(left + width * 0.105, creamBottom - 1);
    ctx.quadraticCurveTo(left + width * 0.50, creamBottom + 4, right - width * 0.105, creamBottom - 1);
    ctx.lineTo(right - width * 0.10, bodyBottom - 13);
    ctx.quadraticCurveTo(right - width * 0.12, bodyBottom - 4, right - width * 0.19, bodyBottom - 1);
    ctx.quadraticCurveTo(left + width * 0.50, bodyBottom + 3, left + width * 0.19, bodyBottom - 1);
    ctx.quadraticCurveTo(left + width * 0.12, bodyBottom - 4, left + width * 0.10, bodyBottom - 13);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(126, 67, 42, .28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + width * 0.12, creamBottom + 1);
    ctx.quadraticCurveTo(left + width * 0.5, creamBottom + 7, right - width * 0.12, creamBottom + 1);
    ctx.stroke();

    for (let index = 0; index < 12; index += 1) {
      const x = left + width * (0.16 + ((index * 31 + step * 7) % 66) / 100);
      const y = creamBottom + 8 + ((index * 19 + step * 11) % Math.max(10, Math.round(height - 71)));
      const radius = index % 4 === 0 ? 1.7 : 1.05;
      ctx.fillStyle = index % 3 === 0 ? 'rgba(142, 75, 42, .22)' : 'rgba(255, 229, 166, .20)';
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const frostingPath = () => {
      ctx.beginPath();
      ctx.moveTo(left + width * 0.13, top + 15);
      ctx.quadraticCurveTo(left + width * 0.29, top + 1, left + width * 0.50, top + 4);
      ctx.quadraticCurveTo(right - width * 0.29, top + 1, right - width * 0.13, top + 15);
      ctx.lineTo(right - width * 0.09, top + 27);
      ctx.quadraticCurveTo(right - width * 0.17, top + 38, right - width * 0.28, top + 31);
      ctx.quadraticCurveTo(right - width * 0.39, top + 43, right - width * 0.50, top + 32);
      ctx.quadraticCurveTo(left + width * 0.39, top + 43, left + width * 0.29, top + 31);
      ctx.quadraticCurveTo(left + width * 0.17, top + 38, left + width * 0.09, top + 27);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(0, 2.5);
    frostingPath();
    ctx.fillStyle = palette.shade;
    ctx.fill();
    ctx.restore();
    frostingPath();
    ctx.fillStyle = palette.base;
    ctx.fill();
    ctx.strokeStyle = colorWithAlpha(palette.shade, 0.46);
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.strokeStyle = colorWithAlpha(palette.highlight, 0.82);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(left + width * 0.22, top + 12);
    ctx.quadraticCurveTo(left + width * 0.31, top + 7, left + width * 0.39, top + 10);
    ctx.moveTo(left + width * 0.62, top + 10);
    ctx.quadraticCurveTo(left + width * 0.70, top + 7, left + width * 0.78, top + 13);
    ctx.stroke();
    ctx.restore();
  }

  function drawFallbackDonut(platform, left, top, profile, palette) {
    // Preserve the existing pixel-art fallback proportions for normal and
    // mini without ever changing their physical platform body.
    const scaleX = profile.width / DONUT_WIDTH;
    const scaleY = profile.renderHeight / DONUT_RENDER_HEIGHT;
    ctx.save();
    ctx.translate(left, top);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-left, -top);
    ctx.fillStyle = BAKERY.ink;
    ctx.fillRect(left + 9, top, DONUT_WIDTH - 18, 3);
    ctx.fillRect(left + 4, top + 3, DONUT_WIDTH - 8, 5);
    ctx.fillRect(left, top + 8, DONUT_WIDTH, DONUT_HEIGHT - 16);
    ctx.fillRect(left + 4, top + DONUT_HEIGHT - 8, DONUT_WIDTH - 8, 5);
    ctx.fillRect(left + 9, top + DONUT_HEIGHT - 3, DONUT_WIDTH - 18, 3);

    ctx.fillStyle = BAKERY.doughShadow;
    ctx.fillRect(left + 7, top + 8, DONUT_WIDTH - 14, DONUT_HEIGHT - 17);
    ctx.fillStyle = BAKERY.dough;
    ctx.fillRect(left + 7, top + 10, DONUT_WIDTH - 14, 32);
    ctx.fillStyle = BAKERY.doughLight;
    ctx.fillRect(left + 11, top + 38, DONUT_WIDTH - 22, 9);
    ctx.fillStyle = '#f6b866';
    ctx.fillRect(left + 16, top + 47, DONUT_WIDTH - 32, 3);
    ctx.fillStyle = '#b96843';
    ctx.fillRect(left + 11, top + 51, DONUT_WIDTH - 22, 2);

    ctx.fillStyle = palette.shade;
    ctx.fillRect(left + 9, top + 5, DONUT_WIDTH - 18, 21);
    ctx.fillRect(left + 15, top + 25, DONUT_WIDTH - 30, 5);
    ctx.fillStyle = palette.base;
    ctx.fillRect(left + 12, top + 6, DONUT_WIDTH - 24, 16);
    ctx.fillRect(left + 18, top + 22, DONUT_WIDTH - 36, 4);
    const dripPositions = [30, 64, 105, 138];
    dripPositions.forEach((offset, index) => {
      const dripHeight = 6 + ((Number(platform.step) + index) % 2) * 5;
      ctx.fillRect(left + offset, top + 23, 11, dripHeight);
      ctx.fillRect(left + offset + 2, top + 22 + dripHeight, 7, 3);
    });
    ctx.fillStyle = palette.highlight;
    ctx.fillRect(left + 24, top + 9, 36, 3);
    ctx.fillRect(left + 105, top + 11, 29, 3);
    ctx.fillRect(left + 68, top + 16, 17, 2);

    const sprinkleColors = ['#fffaf0', '#f2c74e', '#80c3ae', '#8b5f9c', '#f08b75'];
    for (let index = 0; index < 10; index += 1) {
      const sx = left + 22 + index * 14 + ((platform.step || 0) % 3) * 2;
      const sy = top + (index % 2 === 0 ? 12 : 18);
      ctx.fillStyle = sprinkleColors[(index + Number(platform.step || 0)) % sprinkleColors.length];
      if (index % 3 === 0) ctx.fillRect(sx, sy, 3, 5);
      else ctx.fillRect(sx, sy, 5, 3);
    }
    ctx.restore();
  }

  function drawDonut(platform, active = false) {
    const profile = donutProfile(platform);
    const x = Math.round(platform.x);
    const y = Math.round(toScreenY(platform.top));
    if (y < -profile.renderHeight - 22 || y > HEIGHT + 95) return;
    const left = x - profile.width / 2;
    const top = y + DONUT_RENDER_TOP_OFFSET;
    const palette = frostingPalette(platform.flavor || '#ef8aa2');
    const landingVisual = platformRenderVisual(platform);
    ctx.save();
    const collapseMotion = platform.collapseMotion;
    if (collapseMotion) {
      // These offsets are visual-only. The gameplay platform remains where it
      // landed, while a collapse can shed upper donuts at staggered speeds.
      ctx.translate(x + collapseMotion.offsetX, y + collapseMotion.offsetY);
      ctx.rotate(collapseMotion.rotation);
      ctx.translate(-x, -y);
    } else {
      const visualShift = towerVisualShift(platform);
      if (visualShift) ctx.translate(visualShift, 0);
    }
    if (landingVisual.offsetX || landingVisual.offsetY || landingVisual.rotation
      || landingVisual.scaleX !== 1 || landingVisual.scaleY !== 1) {
      // This transform is deliberately local to the artwork. `platform.top`
      // and every collision/balance coordinate remain unchanged.
      ctx.translate(x, y);
      ctx.translate(landingVisual.offsetX, landingVisual.offsetY);
      ctx.rotate(landingVisual.rotation);
      ctx.scale(landingVisual.scaleX, landingVisual.scaleY);
      ctx.translate(-x, -y);
    }
    if (active) ctx.globalAlpha = 0.98;
    if (platform.collapsed) ctx.globalAlpha *= 0.24;
    if (platform.base) drawBasePlate(x, top, profile);
    const sprite = platform.variant === 'slippery'
      ? getSlipperyPlatformArtwork()
      : getArtwork(donutArtworkKey(platform.flavor || '#ef8aa2'));
    if (sprite) {
      // The source art is placed inside the type-owned render rectangle. Its
      // collision body uses the matching profile dimensions elsewhere.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sprite, left, top, profile.width, profile.renderHeight);
      drawSlipperySurfaceSheen(platform, left, top, profile);
      drawGimmickMark(platform, left, top);
      ctx.restore();
      return;
    }
    drawFallbackDonut(platform, left, top, profile, palette);
    drawSlipperySurfaceSheen(platform, left, top, profile);
    drawGimmickMark(platform, left, top);
    ctx.restore();
  }

  function towerVisualShift(platform) {
    const tower = state.tower;
    if (!platform || platform.base || platform.collapseMotion || !tower || tower.danger < 0.58) return 0;
    const dangerProgress = clamp((tower.danger - 0.58) / 0.42, 0, 1);
    const height = clamp((platform.step || 0) / Math.max(1, state.stage?.targetSteps || 1), 0, 1);
    return Math.sin(state.hintPulse * 27 + (platform.step || 0) * 1.9)
      * dangerProgress * (0.7 + height * 2.1);
  }

  function standingSupportPlatform() {
    const supportId = state.player?.standingPlatformId;
    if (supportId === null || supportId === undefined) return null;
    return platformForId(supportId)
      || (state.activeDonut?.id === supportId ? state.activeDonut : null);
  }

  function playerSupportVisualOffset(platform) {
    const player = state.player;
    if (!player || !platform) return { xOffset: 0, yOffset: 0 };
    const visual = platformRenderVisual(platform);
    const footY = PLAYER_GROUNDED_CONTACT_OFFSET;
    const dx = player.x - platform.x;
    const cosine = Math.cos(visual.rotation);
    const sine = Math.sin(visual.rotation);
    // Transform the player's visual foot point with the same local donut
    // transform, but leave the mascot itself unscaled/unrotated. That keeps
    // the completed character landing pose intact while its feet stay flush.
    return {
      xOffset: towerVisualShift(platform)
        + visual.offsetX
        + dx * (visual.scaleX * cosine - 1)
        - footY * visual.scaleY * sine,
      yOffset: visual.offsetY
        + dx * visual.scaleX * sine
        + footY * (visual.scaleY * cosine - 1),
    };
  }

  function playerSupportVisualRotation(platform) {
    if (!platform) return 0;
    // Let the mascot lean with its current support just enough to look
    // connected, while its existing jump/landing pose remains dominant.
    return clamp(
      platformRenderVisual(platform).rotation * 0.42,
      -(2 * Math.PI) / 180,
      (2 * Math.PI) / 180,
    );
  }

  function slipperyPlayerVisual(player) {
    const drift = player?.grounded ? player.slipperyDrift : null;
    if (!drift || drift.duration <= 0) {
      return { offsetX: 0, scaleX: 1, scaleY: 1, rotation: 0, progress: 0, energy: 0 };
    }
    const progress = clamp((drift.elapsed - drift.delay) / drift.duration, 0, 1);
    // A single, tiny visual pulse reads as a controlled slide rather than a
    // second movement system.  The collision body remains entirely untouched.
    const energy = Math.sin(progress * Math.PI);
    const strength = drift.strength || 0;
    const direction = drift.direction || Math.sign(drift.distance) || 1;
    return {
      offsetX: direction * energy * (0.55 + strength * 0.85),
      scaleX: 1 - energy * (0.006 + strength * 0.007),
      scaleY: 1 + energy * (0.011 + strength * 0.014),
      rotation: direction * energy * ((5 + strength * 3) * Math.PI / 180),
      progress,
      energy,
    };
  }

  function drawSlipperyGlideTrail(
    xOffset = 0,
    yOffset = 0,
    contactOffsetOverride = null,
  ) {
    const player = state.player;
    const drift = player?.grounded ? player.slipperyDrift : null;
    if (!drift) return;
    const visual = slipperyPlayerVisual(player);
    if (visual.energy <= 0.025) return;
    const direction = drift.direction || Math.sign(drift.distance) || 1;
    const strength = drift.strength || 0;
    const contactOffset = contactOffsetOverride === null
      ? PLAYER_GROUNDED_CONTACT_OFFSET
      : contactOffsetOverride;
    const footX = player.x + xOffset + visual.offsetX;
    const footY = toScreenY(player.y) + yOffset + contactOffset + 0.5;

    ctx.save();
    ctx.lineCap = 'round';
    for (let index = 0; index < 3; index += 1) {
      const length = 13 + index * 5 + strength * 5;
      const lead = 4 + index * 4;
      // A faint warm outline makes a pale glide line readable over the
      // platform's white glaze, while the brighter inner line keeps it a
      // quick glossy streak rather than an ice/snow effect.
      ctx.globalAlpha = visual.energy * (0.48 - index * 0.075);
      ctx.strokeStyle = '#9c705f';
      ctx.lineWidth = index === 0 ? 2.65 : 2.1;
      ctx.beginPath();
      ctx.moveTo(footX - direction * lead, footY + index * 2.4);
      ctx.lineTo(footX - direction * (lead + length), footY + index * 2.4);
      ctx.stroke();
      ctx.globalAlpha = visual.energy * (0.76 - index * 0.09);
      ctx.strokeStyle = index === 0 ? '#fff6df' : '#fffdf4';
      ctx.lineWidth = index === 0 ? 1.25 : 0.95;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerWithSlipperyTrail(
    xOffset = 0,
    yOffset = 0,
    rotationOffset = 0,
    contactOffsetOverride = null,
  ) {
    drawPlayer(xOffset, yOffset, rotationOffset, contactOffsetOverride);
    // Keep the short gloss marks directly at the visible feet instead of
    // letting the mascot art obscure them.  They are still restricted to the
    // short sliding window and never affect the collision body.
    drawSlipperyGlideTrail(xOffset, yOffset, contactOffsetOverride);
  }

  function drawPlayer(xOffset = 0, yOffset = 0, rotationOffset = 0, contactOffsetOverride = null) {
    const player = state.player;
    if (!player) return;
    // Render the actual physics position. The former airborne sine bob made
    // a physically smooth arc look as though it wavered near its apex.
    const y = toScreenY(player.y);
    // The visual sprite is intentionally a little larger than its narrow
    // source-derived collision core. A short transition can opt out of the
    // grounded tuck while it blends between the two visual anchors.
    // The new mascot is nearly square. This changes only paint dimensions;
    // the existing source-derived collision body and jump arc stay intact.
    const visualWidth = 64;
    const visualHeight = 64;
    const airborne = !player.grounded;
    const pose = playerVisualPose(player);
    const edgeLanding = edgeLandingVisual(player);
    const perfectLanding = perfectLandingVisual(player);
    const fallReaction = fallReactionVisual(player);
    const contactOffset = contactOffsetOverride === null
      ? (airborne ? 0 : PLAYER_GROUNDED_CONTACT_OFFSET)
      : contactOffsetOverride;
    const visualAnchorY = y + yOffset + contactOffset + pose.offsetY
      + perfectLanding.offsetY + fallReaction.offsetY;
    const slipperyVisual = slipperyPlayerVisual(player);
    const visualX = player.x + xOffset + slipperyVisual.offsetX
      + edgeLanding.offsetX + fallReaction.offsetX;
    const left = Math.round(visualX - visualWidth / 2);
    const top = visualAnchorY - visualHeight;
    const squash = clamp(player.squash || 0, -0.22, 0.22);
    ctx.save();
    // Keep the celebration in place by spinning around the mascot's painted
    // center. This is deliberately outside the foot-anchor transform so the
    // support, collision body, and landing position stay untouched.
    if (perfectLanding.rotation) {
      const spinCenterY = visualAnchorY - visualHeight * 0.5;
      ctx.translate(visualX, spinCenterY);
      ctx.rotate(perfectLanding.rotation);
      ctx.translate(-visualX, -spinCenterY);
    }
    ctx.translate(visualX, visualAnchorY);
    // Rotate around the visual foot anchor. The collision foot remains at
    // the same coordinate, so the landing squash cannot create a hover gap.
    ctx.rotate(
      rotationOffset + (player.visualRotation || 0) + pose.rotation
      + slipperyVisual.rotation + edgeLanding.rotation + fallReaction.rotation,
    );
    const landingCarryX = state.failure ? 1 : (player.landingCarryX || 1);
    const landingCarryY = state.failure ? 1 : (player.landingCarryY || 1);
    ctx.scale(
      (1 + squash * 0.36) * pose.scaleX * landingCarryX * slipperyVisual.scaleX
        * edgeLanding.scaleX * perfectLanding.scaleX * fallReaction.scaleX,
      (1 - squash * 0.48) * pose.scaleY * landingCarryY * slipperyVisual.scaleY
        * edgeLanding.scaleY * perfectLanding.scaleY * fallReaction.scaleY,
    );
    ctx.translate(-visualX, -visualAnchorY);

    const sprite = getArtwork((airborne || perfectLanding.airborne) ? 'mascotJump' : 'mascotIdle');
    if (sprite) {
      // Both poses use the same fixed visual rectangle and foot anchor as
      // before; only the illustration changes when the clerk leaves ground.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sprite, left, top, visualWidth, visualHeight);
      drawEdgeLandingFaceOverlay(left, top, edgeLanding);
      drawPerfectLandingFaceOverlay(left, top, perfectLanding);
      drawFallFaceOverlay(left, top, fallReaction);
      ctx.restore();
      return;
    }

    // Ponytail behind the head.
    ctx.fillStyle = '#4b2e31';
    ctx.fillRect(left + 39, top + 18, 12, 29);
    ctx.fillRect(left + 46, top + 27, 8, 18);
    ctx.fillRect(left + 35, top + 35, 15, 14);
    ctx.fillStyle = '#754238';
    ctx.fillRect(left + 41, top + 21, 8, 24);
    ctx.fillRect(left + 47, top + 30, 5, 12);
    ctx.fillRect(left + 38, top + 38, 9, 8);

    // Raised arms when jumping; relaxed arms while standing. All are block
    // forms so the clerk remains the same pixel-art character in both poses.
    ctx.fillStyle = '#4e3033';
    if (airborne) {
      ctx.fillRect(left + 4, top + 33, 6, 17);
      ctx.fillRect(left + 8, top + 22, 6, 15);
      ctx.fillRect(left + 48, top + 33, 6, 17);
      ctx.fillRect(left + 44, top + 22, 6, 15);
      ctx.fillStyle = '#f7c49c';
      ctx.fillRect(left + 5, top + 31, 4, 16);
      ctx.fillRect(left + 9, top + 20, 4, 14);
      ctx.fillRect(left + 49, top + 31, 4, 16);
      ctx.fillRect(left + 45, top + 20, 4, 14);
      ctx.fillRect(left + 8, top + 18, 6, 6);
      ctx.fillRect(left + 44, top + 18, 6, 6);
    } else {
      ctx.fillRect(left + 7, top + 46, 6, 17);
      ctx.fillRect(left + 45, top + 46, 6, 17);
      ctx.fillStyle = '#f7c49c';
      ctx.fillRect(left + 9, top + 48, 3, 12);
      ctx.fillRect(left + 47, top + 48, 3, 12);
    }

    // Legs and shoes.
    ctx.fillStyle = '#4e3033';
    ctx.fillRect(left + 17, top + 64, 9, 10);
    ctx.fillRect(left + 33, top + 64, 9, 10);
    ctx.fillStyle = '#7a4c40';
    ctx.fillRect(left + 19, top + 65, 5, 10);
    ctx.fillRect(left + 35, top + 65, 5, 10);
    ctx.fillStyle = '#4e3033';
    ctx.fillRect(left + 13, top + 74, 15, 6);
    ctx.fillRect(left + 31, top + 74, 15, 6);
    ctx.fillStyle = '#f18a9d';
    ctx.fillRect(left + 15, top + 74, 11, 3);
    ctx.fillRect(left + 33, top + 74, 11, 3);

    // White shirt and pink apron.
    ctx.fillStyle = '#4e3033';
    ctx.fillRect(left + 13, top + 40, 32, 27);
    ctx.fillStyle = '#fff2dd';
    ctx.fillRect(left + 16, top + 42, 26, 13);
    ctx.fillStyle = '#ef8a9d';
    ctx.fillRect(left + 15, top + 53, 28, 12);
    ctx.fillStyle = '#d85f79';
    ctx.fillRect(left + 19, top + 57, 20, 5);
    ctx.fillStyle = '#fff1d9';
    ctx.fillRect(left + 26, top + 57, 5, 4);

    // Face, hair and uniform cap.
    ctx.fillStyle = '#4e3033';
    ctx.fillRect(left + 13, top + 15, 33, 26);
    ctx.fillStyle = '#744238';
    ctx.fillRect(left + 15, top + 17, 29, 20);
    ctx.fillRect(left + 13, top + 23, 6, 15);
    ctx.fillRect(left + 42, top + 23, 4, 15);
    ctx.fillStyle = '#f7c49c';
    ctx.fillRect(left + 20, top + 22, 21, 16);
    ctx.fillStyle = '#4e3033';
    ctx.fillRect(left + 24, top + 28, 3, 3);
    ctx.fillRect(left + 34, top + 28, 3, 3);
    ctx.fillRect(left + 28, top + 35, 6, 2);
    ctx.fillStyle = '#4e3033';
    ctx.fillRect(left + 12, top + 7, 36, 13);
    ctx.fillStyle = '#fff2db';
    ctx.fillRect(left + 15, top + 8, 30, 8);
    ctx.fillStyle = '#ef8a9d';
    ctx.fillRect(left + 15, top + 16, 33, 4);
    ctx.fillStyle = '#f9ce58';
    ctx.fillRect(left + 27, top + 10, 6, 5);
    ctx.fillStyle = '#a55255';
    ctx.fillRect(left + 29, top + 11, 3, 3);
    drawEdgeLandingFaceOverlay(left, top, edgeLanding);
    drawPerfectLandingFaceOverlay(left, top, perfectLanding);
    drawFallFaceOverlay(left, top, fallReaction);
    ctx.restore();
  }

  function edgeLandingVisual(player) {
    if (!player || state.failure || player.edgeLandingTimer <= 0
      || player.edgeLandingDuration <= 0 || !player.edgeLandingDirection) {
      return {
        alpha: 0, direction: 0, rotation: 0, offsetX: 0, scaleX: 1, scaleY: 1,
      };
    }
    const remaining = clamp(player.edgeLandingTimer / player.edgeLandingDuration, 0, 1);
    const progress = 1 - remaining;
    const ease = (value) => 0.5 - Math.cos(clamp(value, 0, 1) * Math.PI) * 0.5;
    let rotation = 0;
    let offsetX = 0;
    let scaleX = 1;
    let scaleY = 1;
    if (progress < 0.20) {
      const phase = ease(progress / 0.20);
      rotation = lerp(0, player.edgeLandingDirection * EDGE_LANDING_OUTWARD_TILT, phase);
      offsetX = lerp(0, player.edgeLandingDirection * 2.2, phase);
      scaleX = lerp(1, 0.988, phase);
      scaleY = lerp(1, 1.018, phase);
    } else if (progress < 0.50) {
      const phase = ease((progress - 0.20) / 0.30);
      rotation = lerp(
        player.edgeLandingDirection * EDGE_LANDING_OUTWARD_TILT,
        -player.edgeLandingDirection * EDGE_LANDING_TILT,
        phase,
      );
      // This short inward slide and braced body shape make the save read as
      // a deliberate recovery, rather than a single rotation value.
      offsetX = lerp(player.edgeLandingDirection * 2.2, -player.edgeLandingDirection * 3.1, phase);
      scaleX = lerp(0.988, 1.042, phase);
      scaleY = lerp(1.018, 0.968, phase);
    } else if (progress < 0.70) {
      const phase = ease((progress - 0.50) / 0.20);
      rotation = lerp(
        -player.edgeLandingDirection * EDGE_LANDING_TILT,
        player.edgeLandingDirection * EDGE_LANDING_SWAY_TILT,
        phase,
      );
      offsetX = lerp(-player.edgeLandingDirection * 3.1, player.edgeLandingDirection * 1.05, phase);
      scaleX = lerp(1.042, 1.012, phase);
      scaleY = lerp(0.968, 0.992, phase);
    } else {
      const phase = ease((progress - 0.70) / 0.30);
      rotation = lerp(
        player.edgeLandingDirection * EDGE_LANDING_SWAY_TILT,
        0,
        phase,
      );
      offsetX = lerp(player.edgeLandingDirection * 1.05, 0, phase);
      scaleX = lerp(1.012, 1, phase);
      scaleY = lerp(0.992, 1, phase);
    }
    const alpha = remaining < 0.15 ? remaining / 0.15 : 1;
    return {
      alpha,
      direction: player.edgeLandingDirection,
      rotation,
      offsetX,
      scaleX,
      scaleY,
    };
  }

  function perfectLandingVisual(player) {
    if (!player || state.failure || player.perfectSpinTimer <= 0
      || player.perfectSpinDuration <= 0) {
      return {
        rotation: 0, smileAlpha: 0, offsetY: 0, scaleX: 1, scaleY: 1, airborne: false,
      };
    }
    const total = PERFECT_PLAYER_SPIN_DELAY + player.perfectSpinDuration
      + PERFECT_PLAYER_SMILE_DURATION;
    const elapsed = total - player.perfectSpinTimer;
    const spinProgress = clamp(
      (elapsed - PERFECT_PLAYER_SPIN_DELAY) / player.perfectSpinDuration,
      0,
      1,
    );
    const easedSpin = 0.5 - Math.cos(spinProgress * Math.PI) * 0.5;
    const recoveryProgress = clamp(
      (elapsed - PERFECT_PLAYER_SPIN_DELAY - player.perfectSpinDuration)
        / PERFECT_PLAYER_SMILE_DURATION,
      0,
      1,
    );
    const smileIn = clamp((spinProgress - 0.70) / 0.18, 0, 1);
    const hop = Math.sin(Math.PI * clamp(spinProgress, 0, 1));
    const relanding = Math.sin(Math.PI * clamp((spinProgress - 0.80) / 0.20, 0, 1));
    return {
      rotation: Math.PI * 2 * easedSpin,
      smileAlpha: recoveryProgress > 0 ? 1 - recoveryProgress : smileIn,
      // This is a paint-only hop: the grounded collision foot, jump count,
      // velocity, and support remain untouched while the mascot rises and
      // returns to the very same donut.
      offsetY: -PERFECT_PLAYER_HOP_HEIGHT * hop,
      scaleX: 1 + hop * 0.024 + relanding * 0.048,
      scaleY: 1 - hop * 0.016 - relanding * 0.052,
      airborne: spinProgress > 0 && spinProgress < 1,
    };
  }

  function fallReactionVisual(player) {
    const failure = state.failure;
    if (!player || !failure || !Number.isFinite(failure.timer) || !Number.isFinite(failure.total)
      || failure.total <= 0) {
      return {
        alpha: 0, direction: 0, rotation: 0, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, tears: 0,
      };
    }
    const progress = clamp(1 - failure.timer / failure.total, 0, 1);
    const enter = clamp(progress / 0.12, 0, 1);
    const exit = clamp((1 - progress) / 0.12, 0, 1);
    const alpha = Math.min(enter * 1.25, exit * 1.5, 1);
    const direction = Math.sign(failure.direction || player.failVX || 1) || 1;
    const collapse = failure.kind === 'tower-collapse';
    const wobble = Math.sin(progress * Math.PI * (collapse ? 2.6 : 3.4));
    const wobbleStrength = collapse ? 0.58 : 1;
    // Keep this paint-only wobble apart from the actual failure velocity.
    // The fall direction and game-over timing remain exactly as before.
    const rotation = collapse
      ? wobble * ((3.2 * Math.PI) / 180)
      : direction * (-(4.2 * Math.PI) / 180) * enter + wobble * ((5.4 * Math.PI) / 180);
    const tearProgress = clamp((progress - 0.09) / 0.14, 0, 1);
    return {
      alpha,
      direction,
      rotation: rotation * wobbleStrength,
      offsetX: wobble * 1.9 * wobbleStrength,
      offsetY: 0,
      scaleX: 1 + Math.abs(wobble) * 0.014,
      scaleY: 1 - Math.abs(wobble) * 0.012,
      tears: Math.min(alpha, tearProgress),
    };
  }

  function drawEdgeLandingFaceOverlay(left, top, visual) {
    if (!visual || visual.alpha <= 0 || !visual.direction) return;
    ctx.save();
    ctx.globalAlpha = visual.alpha;
    ctx.fillStyle = '#2c1915';
    [[21, 36], [43, 36]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(left + x, top + y, 4.8, 6.3, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(132, 92, 76, .72)';
    ctx.beginPath();
    ctx.ellipse(left + 32, top + 41, 7.5, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c1915';
    ctx.beginPath();
    ctx.ellipse(left + 32, top + 41, 3.1, 4.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8f7e8';
    [[19.6, 33.6], [41.6, 33.6]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(left + x, top + y, 1.35, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    const sweatX = left + (visual.direction > 0 ? 72 : -8);
    const sweatY = top + 22;
    ctx.fillStyle = '#76d5e8';
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(sweatX, sweatY - 8.3);
    ctx.quadraticCurveTo(sweatX + 6.2, sweatY - 1.4, sweatX + 4.7, sweatY + 4.7);
    ctx.quadraticCurveTo(sweatX, sweatY + 9.3, sweatX - 4.7, sweatY + 4.7);
    ctx.quadraticCurveTo(sweatX - 6.2, sweatY - 1.4, sweatX, sweatY - 8.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, .92)';
    ctx.beginPath();
    ctx.ellipse(sweatX - 1.65, sweatY - 1.6, 1.25, 1.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPerfectLandingFaceOverlay(left, top, visual) {
    if (!visual || visual.smileAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = visual.smileAlpha;
    ctx.fillStyle = 'rgba(246, 154, 171, .54)';
    [[16.5, 43], [47.5, 43]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(left + x, top + y, 4.2, 2.25, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = '#4a2720';
    ctx.lineWidth = 2.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(left + 25, top + 40);
    ctx.quadraticCurveTo(left + 32, top + 46, left + 39, top + 40);
    ctx.stroke();
    ctx.restore();
  }

  function drawFallFaceOverlay(left, top, visual) {
    if (!visual || visual.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = visual.alpha;
    // A clear first-frame surprise reads before the tears begin.  It is
    // painted on top of the existing donut face, leaving the art untouched.
    ctx.fillStyle = '#2b1915';
    [[21, 36], [43, 36]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(left + x, top + y, 4.9, 6.3, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#fffdf5';
    [[19.5, 33.5], [41.5, 33.5]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(left + x, top + y, 1.35, 1.75, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#6b3f39';
    ctx.beginPath();
    ctx.ellipse(left + 32, top + 43.2, 3.45, 4.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(75, 39, 34, .92)';
    ctx.lineWidth = 1.35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(left + 15, top + 28);
    ctx.lineTo(left + 23, top + 30.1);
    ctx.moveTo(left + 49, top + 28);
    ctx.lineTo(left + 41, top + 30.1);
    ctx.stroke();

    if (visual.tears > 0) {
      const drop = (x, y, scale, alpha) => {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.fillStyle = '#80d9ef';
        ctx.strokeStyle = '#ebfdff';
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(x, y - 4.7 * scale);
        ctx.quadraticCurveTo(x + 3.2 * scale, y - 0.9 * scale, x + 2.6 * scale, y + 2.9 * scale);
        ctx.quadraticCurveTo(x, y + 5.8 * scale, x - 2.6 * scale, y + 2.9 * scale);
        ctx.quadraticCurveTo(x - 3.2 * scale, y - 0.9 * scale, x, y - 4.7 * scale);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      const drift = Math.sin((1 - visual.alpha) * Math.PI) * 1.1;
      drop(left + 8 + drift, top + 45, 1.02, visual.tears);
      if (visual.tears > 0.46) drop(left + 56 - drift, top + 47, 0.88, (visual.tears - 0.46) / 0.54);
    }
    ctx.restore();
  }

  function playerVisualPose(player) {
    // Failure/collapse owns its own rotation. Keep the normal jump poses out
    // of that path so the game-over motion remains unchanged.
    if (state.failure) {
      return { scaleX: 1, scaleY: 1, rotation: 0, offsetY: 0 };
    }
    const phase = player.jumpPhase || (player.grounded ? 'grounded' : 'rising');
    if (phase === 'takeoff') {
      return { scaleX: 0.992, scaleY: 1.035, rotation: 0, offsetY: 0 };
    }
    if (phase === 'rising') {
      return { scaleX: 0.996, scaleY: 1.018, rotation: 0, offsetY: 0 };
    }
    if (phase === 'apex') {
      return { scaleX: 1, scaleY: 1, rotation: 0, offsetY: 0 };
    }
    if (phase === 'falling') {
      return { scaleX: 0.997, scaleY: 1.016, rotation: 0, offsetY: 0 };
    }
    if (phase === 'landing' && player.landingPoseDuration > 0) {
      const landing = landingVisualTransform(player);
      // Keep the lower visual anchor fixed: the overshoot is a small scale
      // release, never a bounce or a movement of the collision foot.
      return { scaleX: landing.scaleX, scaleY: landing.scaleY, rotation: 0, offsetY: 0 };
    }
    return { scaleX: 1, scaleY: 1, rotation: 0, offsetY: 0 };
  }

  function drawEffects() {
    state.effects.forEach((effect) => {
      const y = toScreenY(effect.y);
      if (y < -20 || y > HEIGHT + 20) return;
      const progress = 1 - clamp(effect.timer / effect.total, 0, 1);
      const alpha = Math.sin(progress * Math.PI);
      ctx.save();
      if (effect.kind === 'ring') {
        ctx.globalAlpha = alpha * 0.82;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = effect.lineWidth;
        ctx.beginPath();
        ctx.ellipse(
          effect.x,
          y,
          lerp(effect.radiusXStart, effect.radiusXEnd, progress),
          lerp(effect.radiusYStart, effect.radiusYEnd, progress),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      } else if (effect.kind === 'arc') {
        ctx.globalAlpha = alpha * 0.86;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = effect.lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(effect.x, y, lerp(effect.radiusStart, effect.radiusEnd, progress), Math.PI * 1.14, Math.PI * 1.86);
        ctx.stroke();
      } else if (effect.kind === 'glow') {
        const radius = effect.radius * (0.72 + progress * 0.28);
        const glow = ctx.createRadialGradient(effect.x, y, 1, effect.x, y, radius);
        glow.addColorStop(0, 'rgba(255, 252, 229, .34)');
        glow.addColorStop(0.58, 'rgba(255, 238, 177, .12)');
        glow.addColorStop(1, 'rgba(255, 238, 177, 0)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(effect.x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (effect.kind === 'star') {
        const size = effect.size * (0.8 + progress * 0.2);
        ctx.globalAlpha = alpha * 0.92;
        ctx.fillStyle = effect.color;
        ctx.translate(effect.x, y);
        ctx.rotate(effect.rotation || 0);
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.34, -size * 0.34);
        ctx.lineTo(size, 0);
        ctx.lineTo(size * 0.34, size * 0.34);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.34, size * 0.34);
        ctx.lineTo(-size, 0);
        ctx.lineTo(-size * 0.34, -size * 0.34);
        ctx.closePath();
        ctx.fill();
      } else if (effect.kind === 'powder') {
        ctx.globalAlpha = alpha * 0.82;
        ctx.fillStyle = effect.color;
        ctx.beginPath();
        ctx.arc(effect.x, y, effect.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = clamp(effect.timer / effect.total, 0, 1);
        ctx.fillStyle = effect.color;
        ctx.fillRect(Math.round(effect.x - effect.size / 2), Math.round(y - effect.size / 2), effect.size, effect.size);
      }
      ctx.restore();
    });
  }

  function drawFeedbackMessage() {
    if (!state.message || !state.player) return;
    const progress = clamp(state.message.timer / state.message.total, 0, 1);
    const y = toScreenY(state.player.y + 112) - (1 - progress) * 12;
    ctx.save();
    ctx.globalAlpha = Math.min(1, progress * 1.8);
    ctx.translate(CENTER_X, y);
    const scale = 0.88 + (1 - progress) * 0.22;
    ctx.scale(scale, scale);
    cuteFeedbackText(state.message.text, 0, 0, 20, state.message.color);
    ctx.restore();
  }

  function drawHud() {
    if (!state.stage) return;
    const stageLabel = state.specialDonutPreviewTest.running
      ? 'SPECIAL PREVIEW TEST'
      : (state.surfaceTest.running
      ? 'SURFACE TEST'
      : (state.landingGimmickTest.running
      ? 'LANDING TEST'
      : (state.donutTypesTest.running
      ? 'DONUT TYPES TEST'
      : (state.slipperyTest.running
      ? 'SLIPPERY TEST'
      : (state.gimmickTest.running ? 'GIMMICK TEST' : `STAGE ${String(state.stage.id).padStart(3, '0')}`)))));
    const standardStage = !state.specialDonutPreviewTest.running
      && !state.surfaceTest.running
      && !state.landingGimmickTest.running
      && !state.donutTypesTest.running
      && !state.slipperyTest.running
      && !state.gimmickTest.running;
    roundRect(13, 13, 166, 44, 12, '#2b1e20', '#d6b178');
    ctx.lineWidth = 1.4;
    tinyText(standardStage ? 'STAGE' : stageLabel, 25, 28, '#d9bb8d', 'left');
    if (standardStage) {
      text(String(state.stage.id).padStart(3, '0'), 25, 45, 18, '#fff1d9', 'left');
      tinyText(`${state.player.currentPlatform} / ${state.stage.targetSteps}`, 166, 43, '#dcc2a4', 'right');
    } else {
      tinyText(`${state.player.currentPlatform} / ${state.stage.targetSteps}`, 166, 43, '#fff1d9', 'right');
    }
    roundRect(186, 13, 96, 44, 12, '#2b1e20', '#d6b178');
    ctx.lineWidth = 1.4;
    tinyText('GOAL', 198, 28, '#d9bb8d', 'left');
    const remaining = Math.max(0, state.stage.targetSteps - state.player.currentPlatform);
    text(`${remaining}段`, 198, 45, 17, '#fff1d9', 'left');
  }

  function audioButtonRectForScreen() {
    return state.screen === 'play' ? PLAY_AUDIO_BUTTON_RECT : AUDIO_BUTTON_RECT;
  }

  function drawAudioToggle() {
    const { x, y, width, height } = audioButtonRectForScreen();
    const enabled = audio.isEnabled();
    if (state.screen === 'play') {
      roundRect(x, y, width, height, 12, enabled ? '#2b1e20' : '#241b1d', '#d6b178');
      ctx.lineWidth = 1.4;
      ctx.save();
      ctx.fillStyle = enabled ? '#fff1d9' : '#b9a49d';
      ctx.beginPath();
      ctx.moveTo(x + 11, y + height / 2 - 4);
      ctx.lineTo(x + 16, y + height / 2 - 4);
      ctx.lineTo(x + 22, y + height / 2 - 9);
      ctx.lineTo(x + 22, y + height / 2 + 9);
      ctx.lineTo(x + 16, y + height / 2 + 4);
      ctx.lineTo(x + 11, y + height / 2 + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = enabled ? '#d9bb8d' : '#9f8b86';
      ctx.lineWidth = 1.5;
      if (enabled) {
        ctx.beginPath();
        ctx.arc(x + 22, y + height / 2, 7, -0.72, 0.72);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x + 27, y + 13);
        ctx.lineTo(x + 13, y + 29);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    roundRect(x, y, width, height, 10, enabled ? '#f3d2ad' : '#d8c4bf', '#75424c');
    ctx.lineWidth = 1.5;
    text('音', x + 15, y + height / 2 + 1, 11, enabled ? '#70424d' : '#8d6866');
    text(enabled ? 'ON' : 'OFF', x + 35, y + height / 2 + 1, 9, enabled ? '#a4515f' : '#775c5b');
  }

  function drawPauseToggle() {
    if (state.screen !== 'play') return;
    const { x, y, width, height } = PAUSE_BUTTON_RECT;
    roundRect(x, y, width, height, 12, state.playPaused ? '#75583d' : '#2b1e20', '#d6b178');
    ctx.lineWidth = 1.4;
    ctx.save();
    ctx.fillStyle = '#fff1d9';
    if (state.playPaused) {
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 12);
      ctx.lineTo(x + 15, y + 30);
      ctx.lineTo(x + 28, y + 21);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(x + 14, y + 12, 4, 18);
      ctx.fillRect(x + 23, y + 12, 4, 18);
    }
    ctx.restore();
  }

  function gimmickTestInfoForStep(step) {
    if (step === 2) {
      return { phase: '1/4', title: '高速ドーナツ', hint: '速く来るが、着地点はいつもと同じ' };
    }
    if (step >= 3 && step <= 5) {
      return { phase: '2/4', title: 'すべるドーナツ', hint: '足場が左右に動く。乗ったまま動きを見よう' };
    }
    if (step >= 6 && step <= 8) {
      return { phase: '3/4', title: 'ひび割れドーナツ', hint: 'ひびが入ったら、次が来たらすぐジャンプ' };
    }
    if (step >= 9) {
      return { phase: '4/4', title: 'フェイント速度', hint: '途中で速さが変わる。動きを見てジャンプ' };
    }
    return { phase: '準備', title: '通常ドーナツ', hint: 'まずはいつものジャンプ感を確認' };
  }

  function drawGimmickTestGuide() {
    if (!state.gimmickTest.running || !state.stage || !state.player) return;
    const focusStep = state.activeDonut?.step
      ?? Math.min(state.stage.targetSteps, Math.max(1, state.player.currentPlatform + 1));
    const info = gimmickTestInfoForStep(focusStep);
    roundRect(12, 67, 366, 48, 11, 'rgba(255, 248, 234, .93)', '#8a6264');
    ctx.lineWidth = 1.5;
    tinyText(`試遊 ${info.phase}  ${info.title}`, 24, 85, '#7a4352', 'left');
    tinyText(info.hint, 24, 104, '#98645d', 'left');
  }

  function drawSpecialDonutGlyph(kind, x, y) {
    const drawRing = (centerX, centerY, radiusX, radiusY) => {
      ctx.save();
      ctx.fillStyle = '#f0a55d';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + 2, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3d9';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 1, radiusX - 2, Math.max(3, radiusY - 4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bb6d4b';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 1, Math.max(2.5, radiusX * 0.18), Math.max(2.5, radiusY * 0.36), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    if (kind === 'mini') {
      drawRing(x, y, 12, 6);
      return;
    }
    if (kind === 'consecutive') {
      drawRing(x - 12, y, 12, 6);
      drawRing(x + 12, y, 12, 6);
      return;
    }
    if (kind === 'squishy') {
      drawRing(x, y + 1, 16, 8);
      ctx.save();
      ctx.strokeStyle = '#bd6271';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 7);
      ctx.quadraticCurveTo(x - 30, y, x - 24, y + 7);
      ctx.moveTo(x + 24, y - 7);
      ctx.quadraticCurveTo(x + 30, y, x + 24, y + 7);
      ctx.stroke();
      ctx.restore();
      return;
    }
    drawRing(x, y + 4, 16, 10);
    tinyText('↑↑', x, y - 13, '#bd6271');
  }

  function drawSpecialDonutPreview() {
    if (!state.specialDonutPreviewTest.running) return;
    const preview = state.specialDonutPreview;
    if (!preview.cue && !preview.intro) return;
    if (preview.cue) {
      const info = SPECIAL_DONUT_PREVIEW_INFO[preview.cue.kind];
      const alpha = clamp(preview.cue.timer / preview.cue.total, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha * 1.8);
      roundRect(69, 68, 250, 48, 14, 'rgba(255, 248, 234, .94)', '#8a6264');
      ctx.lineWidth = 1.5;
      drawSpecialDonutGlyph(preview.cue.kind, 96, 93);
      tinyText('まもなく', 128, 85, '#98645d', 'left');
      text(info.label, 128, 101, 16, '#70424d', 'left');
      ctx.restore();
    }
    if (preview.intro) {
      const alpha = clamp(preview.intro.timer / preview.intro.total, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha * 2.3);
      roundRect(47, 123, 290, 31, 12, 'rgba(255, 248, 234, .94)', '#ad7770');
      ctx.lineWidth = 1.25;
      tinyText(preview.intro.text, CENTER_X, 143, '#7a4352');
      ctx.restore();
    }
  }

  function withTowerTransform(draw) {
    const tower = state.tower;
    const angle = tower?.angle || 0;
    const pivotY = toScreenY(BASE_TOP);
    ctx.save();
    ctx.translate(CENTER_X, pivotY);
    ctx.rotate(angle);
    ctx.translate(-CENTER_X, -pivotY);
    draw();
    ctx.restore();
  }

  function drawSettledTower() {
    withTowerTransform(() => {
      state.platforms.forEach((platform) => {
        if (!platform.base) drawDonut(platform);
      });
      // During the short landing settle, the platform already supports the
      // player visually, so it belongs to the tilted tower rather than the
      // still-moving incoming-donut layer.
      if (state.activeDonut?.phase === 'stopped') drawDonut(state.activeDonut, true);
    });
  }

  function playerIsStandingOnTower() {
    return Boolean(
      state.player?.grounded
      && state.player.standingPlatformId !== null
      && state.player.standingPlatformId !== 0,
    );
  }

  function drawPlay() {
    const shake = state.cameraShake || 0;
    const shakeX = shake ? Math.sin(state.hintPulse * 92) * shake * 10 : 0;
    const shakeY = shake ? Math.cos(state.hintPulse * 77) * shake * 7 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground();
    const base = state.platforms.find((platform) => platform.base);
    if (base) drawDonut(base);
    drawSettledTower();
    // Keep an approaching donut in front during the upward jump. The actual
    // collision remains the source-derived central-success / side-fail split;
    // this order simply prevents a player from looking as though they pass
    // through a solid donut.
    const support = playerIsStandingOnTower() ? standingSupportPlatform() : null;
    const supportTransition = playerSupportTransitionVisual(state.player, support);
    const risingThroughIncoming = state.activeDonut?.phase === 'incoming'
      && state.player && !state.player.grounded && state.player.vy > 0;
    if (risingThroughIncoming) {
      if (supportTransition) {
        drawPlayerWithSlipperyTrail(
          supportTransition.xOffset,
          supportTransition.yOffset,
          supportTransition.rotation,
          0,
        );
      } else {
        drawPlayerWithSlipperyTrail();
      }
      drawDonut(state.activeDonut, true);
    } else {
      if (state.activeDonut?.phase === 'incoming' || state.activeDonut?.phase === 'failed') {
        drawDonut(state.activeDonut, true);
      }
      if (playerIsStandingOnTower()) {
        if (supportTransition) {
          drawPlayerWithSlipperyTrail(
            supportTransition.xOffset,
            supportTransition.yOffset,
            supportTransition.rotation,
            0,
          );
        } else {
          const visualOffset = playerSupportVisualOffset(support);
          withTowerTransform(() => drawPlayerWithSlipperyTrail(
            visualOffset.xOffset,
            visualOffset.yOffset,
            playerSupportVisualRotation(support),
          ));
        }
      } else if (supportTransition) {
        drawPlayerWithSlipperyTrail(
          supportTransition.xOffset,
          supportTransition.yOffset,
          supportTransition.rotation,
          0,
        );
      } else {
        drawPlayerWithSlipperyTrail();
      }
    }
    drawEffects();
    drawFeedbackMessage();
    ctx.restore();
    drawHud();
    drawSpeedTestHud();
    drawGimmickTestGuide();
    drawSpecialDonutPreview();
    if (state.nextBeatIndex === 0 && !state.activeDonut) {
      const alpha = 0.55 + Math.sin(state.hintPulse * 4) * 0.25;
      ctx.save();
      ctx.globalAlpha = alpha;
      roundRect(82, HEIGHT - 206, 226, 41, 16, '#fff8ea', '#80505a');
      tinyText('画面をタップしてジャンプ', CENTER_X, HEIGHT - 186, '#73434b');
      ctx.restore();
    } else if (state.activeDonut && state.player.grounded && state.player.currentPlatform < state.activeDonut.step) {
      const alpha = 0.5 + Math.sin(state.hintPulse * 5) * 0.28;
      ctx.save();
      ctx.globalAlpha = alpha;
      tinyText('近づくドーナツに飛び乗ろう！', CENTER_X, 94, '#b84f62');
      ctx.restore();
    }
  }

  function drawImpact() {
    drawPlay();
    const failure = state.failure;
    if (!failure) return;
    // Tower failures communicate risk through the staggered lean and fall,
    // rather than reusing the collision's red flash and warning text.
    if (failure.kind === 'tower-collapse') return;
    const progress = 1 - clamp(failure.timer / failure.total, 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(172, 54, 63, ${0.08 + Math.max(0, 0.24 - progress * 0.16)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = clamp(failure.timer / failure.total * 1.6, 0, 1);
    cuteFeedbackText('あぶない！', CENTER_X, 118, 21, '#c64f5e');
    ctx.restore();
  }

  function speedTestStageSummary() {
    const stage = normaliseStage(stageFor(state.speedTest.selectedStage));
    const preset = selectedSpeedTestPreset();
    if (!stage || !preset) return null;
    const waits = stage.beats.map((beat) => waitBeforeBeat(beat, preset.multiplier));
    return {
      stage,
      preset,
      speedPxPerSecond: Math.round(BASE_DONUT_SPEED * preset.multiplier),
      waitMin: Math.min(...waits),
      waitMax: Math.max(...waits),
    };
  }

  function drawSpeedTestPreset(x, y, width, presetKey) {
    const preset = SPEED_TEST_PRESETS[presetKey];
    const selected = state.speedTest.selectedPreset === presetKey;
    roundRect(x, y, width, 86, 15, selected ? preset.color : '#fff8ea', selected ? '#70424d' : '#a76c6a');
    ctx.lineWidth = selected ? 3 : 2;
    text(preset.label, x + width / 2, y + 20, 13, selected ? '#fff8ea' : '#70424d');
    text(`${preset.multiplier.toFixed(2)}×`, x + width / 2, y + 44, 18, selected ? '#fff8ea' : '#a2515f');
    tinyText(`${Math.round(BASE_DONUT_SPEED * preset.multiplier)} px/s`, x + width / 2, y + 68, selected ? '#fff8ea' : '#79504c');
  }

  function drawSpeedTestSetup() {
    drawHomeBackground();
    text('SPEED TEST', CENTER_X, 53, 27, '#70424d');
    tinyText('テスト専用：通常の進行・速度設定には保存されません', CENTER_X, 81, '#9b645e');

    const summary = speedTestStageSummary();
    const stageId = state.speedTest.selectedStage;
    roundRect(34, 112, 322, 150, 23, '#fff8ea', '#86505c');
    ctx.lineWidth = 3;
    tinyText('TEST STAGE', CENTER_X, 140, '#9a5962');
    text(`STAGE ${String(stageId).padStart(3, '0')}`, CENTER_X, 177, 29, '#50313a');
    tinyText(summary ? `${summary.stage.targetSteps}段 ・ ${summary.stage.title}` : 'ステージデータを読み込めません', CENTER_X, 210, '#7c564e');
    drawButton(54, 225, 282, 42, 'LEVEL を入力  1–600', '#f3d2ad', '#70424d');
    drawButton(54, 278, 136, 40, '− 1', '#fff8ea', '#70424d');
    drawButton(200, 278, 136, 40, '+ 1', '#fff8ea', '#70424d');

    tinyText('移動速度を選択', CENTER_X, 352, '#7a4b51');
    drawSpeedTestPreset(22, 372, 108, 'low');
    drawSpeedTestPreset(141, 372, 108, 'standard');
    drawSpeedTestPreset(260, 372, 108, 'high');

    roundRect(34, 482, 322, 108, 18, '#fff8ea', '#a76c6a');
    ctx.lineWidth = 2;
    if (summary) {
      tinyText(`選択中：${summary.preset.label}  ${summary.preset.multiplier.toFixed(2)}×  /  ${summary.speedPxPerSecond} px/s`, CENTER_X, 511, '#70424d');
      tinyText(`出現待ち：${summary.waitMin.toFixed(2)}〜${summary.waitMax.toFixed(2)} 秒`, CENTER_X, 540, '#70424d');
      tinyText('テスト中はこの速度で全ドーナツを比較します', CENTER_X, 568, '#98645d');
    }
    drawButton(42, 626, 306, 59, 'この条件でテスト開始', '#c76a78', '#fff8ea');
    tinyText('ジャンプ・当たり判定・段数・配置は通常プレイと同じです', CENTER_X, 722, '#7c564e');
    tinyText('速度変更はテスト画面内だけで、通常プレイには反映されません', CENTER_X, 744, '#7c564e');
  }

  function drawSpeedTestHud() {
    if (!state.speedTest.running || !state.stage) return;
    const preset = selectedSpeedTestPreset();
    if (!preset) return;
    roundRect(48, 64, 294, 31, 12, '#fff8ea', '#87505a');
    ctx.lineWidth = 2;
    tinyText(`TEST  STAGE ${String(state.stage.id).padStart(3, '0')}  ・  ${preset.label} ${preset.multiplier.toFixed(2)}×  ・  ${Math.round(BASE_DONUT_SPEED * preset.multiplier)} px/s`, CENTER_X, 80, '#70424d');
  }

  function drawHomeLogo() {
    drawMenuPanel(62, 54, 266, 73, 21, 'rgba(20, 22, 43, .80)', 'rgba(247, 211, 151, .72)');
    ctx.save();
    ctx.fillStyle = 'rgba(245, 208, 149, .65)';
    ctx.fillRect(82, 62, 226, 1);
    ctx.fillRect(82, 120, 226, 1);
    ctx.restore();
    menuCaption('MIDNIGHT DONUT SHOP', CENTER_X, 71, '#e8c996');
    menuTitle('DONUT TOWER', CENTER_X, 91, 27, '#fff1dc');
    menuCaption('ドーナツを積んで、空まで登ろう', CENTER_X, 111, '#f3d7ae');
  }

  function drawHomeHero() {
    ctx.save();
    const halo = ctx.createRadialGradient(CENTER_X, 221, 8, CENTER_X, 221, 142);
    halo.addColorStop(0, 'rgba(255, 213, 149, .26)');
    halo.addColorStop(0.52, 'rgba(211, 133, 126, .13)');
    halo.addColorStop(1, 'rgba(26, 24, 52, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(38, 125, 314, 177);
    ctx.restore();
    drawMenuPanel(68, 139, 254, 149, 30, 'rgba(22, 23, 46, .53)', 'rgba(246, 207, 145, .47)');
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 232, 189, .36)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(99, 156);
    ctx.lineTo(291, 156);
    ctx.stroke();
    ctx.restore();
    drawMiniDonut(CENTER_X, 263, '#75a77e', 2.35);
    drawMiniDonut(CENTER_X, 231, '#9b6959', 2.35);
    drawMiniDonut(CENTER_X, 199, '#ef8aa2', 2.35);
    menuText('✦', 108, 197, 14, '#f5d898', 'center', 700);
    menuText('✦', 283, 235, 11, '#f5d898', 'center', 700);
  }

  function drawHomeProgressCard(selected) {
    drawMenuPanel(32, 305, 326, 106, 20, 'rgba(20, 24, 45, .83)', 'rgba(244, 211, 155, .72)');
    menuCaption('NEXT CHALLENGE', 55, 326, '#e4c796', 'left');
    menuText(`STAGE ${selected}`, 55, 356, 27, '#fff4e2', 'left', 800);
    menuCaption('選択中のステージ', 56, 385, '#cab39a', 'left');
    ctx.save();
    ctx.fillStyle = 'rgba(245, 213, 162, .38)';
    ctx.fillRect(235, 327, 1, 61);
    ctx.restore();
    menuCaption('CLEAR', 292, 326, '#e4c796');
    menuText(`${state.progress.completed.length}`, 282, 355, 25, '#fff4e2', 'right', 800);
    menuCaption(`/ ${MAX_STAGE}`, 288, 356, '#d7c0a3', 'left');
    menuCaption('STAGES', 292, 385, '#cab39a');
  }

  function drawHome() {
    drawHomeBackground();
    ctx.save();
    const veil = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    veil.addColorStop(0, 'rgba(13, 14, 31, .10)');
    veil.addColorStop(0.54, 'rgba(13, 14, 31, .03)');
    veil.addColorStop(1, 'rgba(13, 14, 31, .17)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
    drawHomeLogo();
    drawHomeHero();

    const selected = String(state.selectedStage).padStart(3, '0');
    drawHomeProgressCard(selected);
    drawMenuButton(42, 436, 306, 62, 'PLAY', 'primary');
    drawMenuButton(42, 514, 306, 52, 'STAGE SELECT', 'secondary');
    menuCaption('タップだけで遊べます', CENTER_X, 604, '#f1d6ae');
    menuCaption('ミスしたら、同じステージをリトライ', CENTER_X, 625, '#d8bfa4');
    menuCaption('進行はこの端末に保存されます', CENTER_X, 778, '#d9b99b');
  }

  function drawHomeBackground() {
    const theme = getBackgroundTheme();
    const hasReferenceArtwork = drawBakeryWall(theme);
    if (!hasReferenceArtwork) drawShopFloor(670, theme);
  }

  function drawButton(x, y, width, height, label, fill, labelColor) {
    roundRect(x, y, width, height, 18, fill, '#75424c');
    ctx.lineWidth = 3;
    text(label, x + width / 2, y + height / 2 + 1, 19, labelColor);
  }

  function drawStageNavButton(x, label) {
    ctx.save();
    ctx.shadowColor = 'rgba(8, 8, 19, .36)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(x, 57, 42, 33, 15, '#754452', null);
    ctx.restore();
    roundRect(x, 54, 42, 33, 15, '#f4ddba', '#9d665c');
    ctx.save();
    ctx.globalAlpha = 0.36;
    roundRect(x + 5, 59, 32, 9, 6, '#fffdf4', null);
    ctx.restore();
    menuText(label, x + 21, 70, 24, '#593943', 'center', 800);
  }

  function drawStageCell(x, y, id, unlocked, selected, complete) {
    const fill = !unlocked
      ? 'rgba(67, 57, 76, .84)'
      : (selected ? '#c97480' : (complete ? '#f4e7cf' : '#fbf3e6'));
    const stroke = !unlocked
      ? '#887383'
      : (selected ? '#ffe7bb' : (complete ? '#a68c67' : '#d5ad83'));
    const numberColor = !unlocked ? '#b4a5a6' : (selected ? '#fff8ec' : '#4d3540');
    ctx.save();
    ctx.shadowColor = selected ? 'rgba(86, 35, 54, .46)' : 'rgba(9, 9, 23, .24)';
    ctx.shadowBlur = selected ? 10 : 6;
    ctx.shadowOffsetY = selected ? 4 : 3;
    roundRect(x, y + 2, 53, 52, 13, selected ? '#7b4653' : 'rgba(28, 25, 47, .60)', null);
    ctx.restore();
    roundRect(x, y, 53, 51, 13, fill, stroke);
    ctx.save();
    ctx.lineWidth = selected ? 2.2 : 1.2;
    roundRect(x + (selected ? 3 : 0), y + (selected ? 3 : 0), selected ? 47 : 53, selected ? 45 : 51, 10, null, stroke);
    ctx.restore();
    menuText(String(id).padStart(3, '0'), x + 26.5, y + 19, 13, numberColor, 'center', 800);
    if (selected) {
      menuCaption('NOW', x + 26.5, y + 39, '#fff1d1');
      if (complete) menuText('✓', x + 42, y + 13, 10, '#fff7df', 'center', 800);
    } else if (complete) {
      menuCaption('CLEAR', x + 26.5, y + 39, '#42775f');
      ctx.save();
      ctx.fillStyle = '#5c9270';
      ctx.beginPath();
      ctx.arc(x + 43, y + 13, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      menuText('✓', x + 43, y + 13, 7, '#fffaf0', 'center', 800);
    } else if (unlocked) {
      menuCaption('READY', x + 26.5, y + 39, '#8c675d');
    } else {
      menuCaption('LOCKED', x + 26.5, y + 39, '#c7b7b5');
    }
  }

  function drawStageSelect() {
    drawHomeBackground();
    ctx.save();
    ctx.fillStyle = 'rgba(12, 14, 31, .21)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
    menuTitle('STAGE SELECT', CENTER_X, 31, 23, '#fff2df');
    menuCaption(`CHAPTER ${state.chapterPage} / 20`, CENTER_X, 55, '#e8ca9e');
    drawStageNavButton(17, '‹');
    drawStageNavButton(331, '›');
    drawMenuPanel(17, 104, 356, 533, 25, 'rgba(21, 22, 44, .80)', 'rgba(240, 203, 146, .60)');
    menuCaption('NOW  •  CLEAR  •  READY  •  LOCKED', CENTER_X, 118, '#e9cfaa');
    const first = (state.chapterPage - 1) * 30 + 1;
    const boxW = 53;
    const boxH = 54;
    const gapX = 11;
    const gapY = 14;
    const startX = 30;
    const startY = 132;
    for (let i = 0; i < 30; i += 1) {
      const id = first + i;
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = startX + col * (boxW + gapX);
      const y = startY + row * (boxH + gapY);
      const unlocked = ALL_STAGES_TEST_ENABLED || id <= state.progress.unlocked;
      const selected = id === state.selectedStage;
      const complete = state.progress.completed.includes(id);
      drawStageCell(x, y, id, unlocked, selected, complete);
    }
    const selected = String(state.selectedStage).padStart(3, '0');
    const progressLabel = ALL_STAGES_TEST_ENABLED
      ? 'TEST ACCESS: ALL STAGES OPEN'
      : `PROGRESS ${state.progress.unlocked} / ${MAX_STAGE}`;
    drawMenuPanel(34, 552, 322, 57, 17, 'rgba(34, 31, 52, .78)', 'rgba(240, 203, 146, .55)');
    menuCaption('CURRENT SELECTION', 55, 570, '#e6c899', 'left');
    menuText(`STAGE ${selected}`, 55, 591, 17, '#fff3df', 'left', 800);
    menuCaption(progressLabel, 335, 590, '#dbc0a0', 'right');
    drawMenuButton(42, 704, 306, 54, 'BACK', 'secondary');
    menuCaption('タップしてステージを選択', CENTER_X, 786, '#efd1a8');
  }

  function drawResultMascot(cleared) {
    const mascot = getArtwork(cleared ? 'mascotJump' : 'mascotIdle') || getArtwork('mascotIdle');
    const x = CENTER_X;
    const y = 281;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(cleared ? -0.055 : 0.055);
    const scale = cleared ? 1.1 : 0.94;
    ctx.scale(scale, scale);
    ctx.fillStyle = cleared ? 'rgba(255, 220, 151, .18)' : 'rgba(235, 182, 178, .13)';
    ctx.beginPath();
    ctx.arc(0, 2, 43, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = cleared ? 'rgba(255, 211, 136, .46)' : 'rgba(28, 13, 20, .55)';
    ctx.shadowBlur = cleared ? 14 : 9;
    if (mascot) ctx.drawImage(mascot, -34, -34, 68, 68);
    else drawMiniDonut(0, 0, cleared ? '#ef8aa2' : '#b18c80', 1.7);
    ctx.restore();

    if (cleared) {
      menuText('✦', x - 53, y - 25, 17, '#f7d58c', 'center', 800);
      menuText('✦', x + 52, y - 38, 13, '#f2b7c2', 'center', 800);
      menuText('·', x + 59, y + 16, 20, '#fff0cf', 'center', 800);
    } else {
      menuText('…', x, y - 49, 20, '#d7b4aa', 'center', 800);
    }
  }

  function drawResultInfo(cleared) {
    const reached = state.player?.currentPlatform || 0;
    const target = state.stage?.targetSteps || 0;
    const stageNumber = state.stage ? String(state.stage.id).padStart(3, '0') : '---';
    const perfectLandings = state.perfectLandings || 0;
    drawMenuPanel(51, 365, 288, 62, 16, 'rgba(13, 11, 21, .52)', cleared ? 'rgba(247, 205, 135, .43)' : 'rgba(221, 164, 154, .36)');
    menuCaption('STAGE', 99, 381, '#d8bc93');
    menuText(stageNumber, 99, 404, 16, '#fff0d5', 'center', 800);
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#d8bc93';
    ctx.fillRect(146, 376, 1, 40);
    ctx.fillRect(243, 376, 1, 40);
    ctx.restore();
    menuCaption('PERFECT', CENTER_X, 381, '#f0cf92');
    menuText(String(perfectLandings), CENTER_X, 404, 16, '#fff0d5', 'center', 800);
    menuCaption(cleared ? 'GOAL' : 'REACHED', 291, 381, cleared ? '#f0cf92' : '#dcb7ac');
    menuText(`${reached} / ${target}`, 291, 404, 16, '#fff0d5', 'center', 800);
  }

  function drawResult(cleared) {
    drawPlay();
    const veil = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    veil.addColorStop(0, 'rgba(8, 8, 20, .72)');
    veil.addColorStop(1, 'rgba(28, 15, 24, .78)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawMenuPanel(
      25,
      144,
      340,
      445,
      30,
      cleared ? 'rgba(34, 28, 43, .96)' : 'rgba(37, 25, 32, .96)',
      cleared ? 'rgba(246, 204, 136, .88)' : 'rgba(206, 146, 139, .74)',
    );
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = cleared ? '#f1c67d' : '#c88b84';
    roundRect(122, 161, 146, 24, 12, ctx.fillStyle, null);
    ctx.restore();
    menuCaption(cleared ? 'GOAL REACHED' : 'ONE MORE TRY', CENTER_X, 173, cleared ? '#503b3d' : '#3d282f');
    const previewRun = state.authoredStagePreview.running;
    const gimmickRun = state.gimmickTest.running;
    const slipperyRun = state.slipperyTest.running;
    const surfaceRun = state.surfaceTest.running;
    const donutTypesRun = state.donutTypesTest.running;
    const landingGimmickRun = state.landingGimmickTest.running;
    const specialDonutPreviewRun = state.specialDonutPreviewTest.running;
    const resultTitle = cleared
      ? ((state.speedTest.running || gimmickRun || slipperyRun || surfaceRun || donutTypesRun || landingGimmickRun || specialDonutPreviewRun) ? 'TEST CLEAR!' : (previewRun ? 'STAGE CLEAR!' : 'CLEAR!'))
      : 'GAME OVER';
    menuTitle(resultTitle, CENTER_X, 215, cleared ? 36 : 31, cleared ? '#ffe4ad' : '#f1d7cd');
    drawResultMascot(cleared);
    menuText(cleared ? 'ゴールまで登れた！' : state.resultReason || 'もう一度チャレンジ！', CENTER_X, 340, 16, '#fff1df', 'center', 750);
    drawResultInfo(cleared);
    if (cleared && state.stage) {
      menuCaption(
        specialDonutPreviewRun
          ? '特殊ドーナツの予告を確認しました'
          : (surfaceRun
          ? '通常・すべる・もちもちを確認しました'
          : (landingGimmickRun
          ? '連続・ぷるぷるドーナツを確認しました'
          : (donutTypesRun
          ? '通常・ミニのドーナツ形状を確認しました'
          : (slipperyRun ? 'ツルツルドーナツを確認しました' : (gimmickRun ? '4種類のギミックを確認しました' : `STAGE ${String(state.stage.id).padStart(3, '0')}  CLEAR`))))),
        CENTER_X,
        440,
        '#dec4a1',
      );
      const clearAction = state.speedTest.running || gimmickRun || slipperyRun || surfaceRun || donutTypesRun || landingGimmickRun || specialDonutPreviewRun
        ? 'RESTART TEST'
        : (previewRun
          ? 'RESTART STAGE'
          : (state.stage.id < MAX_STAGE ? 'NEXT STAGE' : 'ALL CLEAR'));
      drawMenuButton(58, 455, 274, 55, clearAction, 'primary');
    } else {
      menuCaption('積み直せば、きっと届く。', CENTER_X, 440, '#d8bbb1');
      drawMenuButton(58, 455, 274, 55, 'RETRY', 'primary');
    }
    drawMenuButton(58, 525, 274, 40, 'HOME', 'secondary');
  }

  function drawMissing() {
    drawHomeBackground();
    text('STAGE DATA ERROR', CENTER_X, 330, 21, '#75424d');
    tinyText('600面のデータを読み込めませんでした。', CENTER_X, 365, '#75424d');
    drawButton(46, 415, 298, 55, 'HOME', '#c76a78', '#fff8ea');
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    if (state.screen === 'home') drawHome();
    else if (state.screen === 'speed-test') drawSpeedTestSetup();
    else if (state.screen === 'select') drawStageSelect();
    else if (state.screen === 'play') drawPlay();
    else if (state.screen === 'impact') drawImpact();
    else if (state.screen === 'gameover') drawResult(false);
    else if (state.screen === 'clear') drawResult(true);
    else drawMissing();
    drawAudioToggle();
    drawPauseToggle();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (WIDTH / rect.width),
      y: (event.clientY - rect.top) * (HEIGHT / rect.height),
    };
  }

  function inRect(point, x, y, width, height) {
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }

  function chooseSpeedTestStageFromPrompt() {
    const entered = window.prompt('テストするレベルを 1〜600 で入力してください。', String(state.speedTest.selectedStage));
    if (entered === null) return;
    const stageId = Number(entered);
    if (Number.isInteger(stageId) && stageId >= 1 && stageId <= MAX_STAGE) {
      state.speedTest.selectedStage = stageId;
    }
  }

  function handleSpeedTestTap(point) {
    if (inRect(point, 54, 225, 282, 42)) {
      chooseSpeedTestStageFromPrompt();
      return;
    }
    if (inRect(point, 54, 278, 136, 40)) {
      state.speedTest.selectedStage = clamp(state.speedTest.selectedStage - 1, 1, MAX_STAGE);
      return;
    }
    if (inRect(point, 200, 278, 136, 40)) {
      state.speedTest.selectedStage = clamp(state.speedTest.selectedStage + 1, 1, MAX_STAGE);
      return;
    }
    if (inRect(point, 22, 372, 108, 86)) {
      state.speedTest.selectedPreset = 'low';
      return;
    }
    if (inRect(point, 141, 372, 108, 86)) {
      state.speedTest.selectedPreset = 'standard';
      return;
    }
    if (inRect(point, 260, 372, 108, 86)) {
      state.speedTest.selectedPreset = 'high';
      return;
    }
    if (inRect(point, 42, 626, 306, 59)) {
      startStage(state.speedTest.selectedStage, { speedTest: true });
    }
  }

  function handleTap(point) {
    const audioButton = audioButtonRectForScreen();
    if (inRect(point, audioButton.x, audioButton.y, audioButton.width, audioButton.height)) {
      const willEnable = !audio.isEnabled();
      audio.setEnabled(willEnable);
      if (willEnable) audio.unlock();
      return;
    }
    if (state.screen === 'speed-test') {
      handleSpeedTestTap(point);
      return;
    }
    if (state.screen === 'play') {
      if (inRect(point, PAUSE_BUTTON_RECT.x, PAUSE_BUTTON_RECT.y, PAUSE_BUTTON_RECT.width, PAUSE_BUTTON_RECT.height)) {
        state.playPaused = !state.playPaused;
        return;
      }
      if (state.playPaused) return;
      startJump();
      return;
    }
    if (state.screen === 'home') {
      if (inRect(point, 42, 436, 306, 62)) startStage(state.selectedStage);
      else if (inRect(point, 42, 514, 306, 52)) openStageSelect();
      return;
    }
    if (state.screen === 'select') {
      if (inRect(point, 17, 54, 42, 36)) state.chapterPage = clamp(state.chapterPage - 1, 1, 20);
      else if (inRect(point, 331, 54, 42, 36)) state.chapterPage = clamp(state.chapterPage + 1, 1, 20);
      else if (inRect(point, 42, 704, 306, 54)) returnHome();
      else {
        const first = (state.chapterPage - 1) * 30 + 1;
        for (let i = 0; i < 30; i += 1) {
          const id = first + i;
          const col = i % 5;
          const row = Math.floor(i / 5);
          const x = 30 + col * 64;
          const y = 132 + row * 68;
          if (inRect(point, x, y, 53, 54) && (ALL_STAGES_TEST_ENABLED || id <= state.progress.unlocked)) {
            state.selectedStage = id;
            state.progress.selected = id;
            saveProgress();
            returnHome();
            break;
          }
        }
      }
      return;
    }
    if (state.screen === 'gameover') {
      if (inRect(point, 58, 455, 274, 55)) {
        startStage(state.stage.id, {
          speedTest: state.speedTest.running,
          authoredStagePreview: state.authoredStagePreview.running,
          gimmickTest: state.gimmickTest.running,
          slipperyTest: state.slipperyTest.running,
          surfaceTest: state.surfaceTest.running,
          donutTypesTest: state.donutTypesTest.running,
          landingGimmickTest: state.landingGimmickTest.running,
          specialDonutPreviewTest: state.specialDonutPreviewTest.running,
        });
      }
      else if (inRect(point, 58, 525, 274, 40)) returnHome();
      return;
    }
    if (state.screen === 'clear') {
      if (inRect(point, 58, 455, 274, 55)) {
        if (state.speedTest.running) {
          startStage(state.stage.id, { speedTest: true });
        } else if (state.gimmickTest.running) {
          startStage(0, { gimmickTest: true });
        } else if (state.slipperyTest.running) {
          startStage(0, { slipperyTest: true });
        } else if (state.surfaceTest.running) {
          startStage(0, { surfaceTest: true });
        } else if (state.donutTypesTest.running) {
          startStage(0, { donutTypesTest: true });
        } else if (state.landingGimmickTest.running) {
          startStage(0, { landingGimmickTest: true });
        } else if (state.specialDonutPreviewTest.running) {
          startStage(0, { specialDonutPreviewTest: true });
        } else if (state.authoredStagePreview.running) {
          startStage(state.stage.id, { authoredStagePreview: true });
        } else if (state.stage.id < MAX_STAGE) {
          state.selectedStage = state.stage.id + 1;
          startStage(state.selectedStage);
        } else returnHome();
      } else if (inRect(point, 58, 525, 274, 40)) returnHome();
      return;
    }
    if (state.screen === 'missing') returnHome();
  }

  tapTarget.addEventListener('pointerdown', (event) => {
    // A held finger emits one pointerdown, and only the primary pointer is
    // allowed to control play. This prevents a second finger or a mouse
    // button from silently spending the air jump.
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    // Do not create or resume audio when this touch turns sound off.  Every
    // other player action is a valid mobile audio-unlock gesture.
    const audioButton = audioButtonRectForScreen();
    const isPauseTarget = state.screen === 'play'
      && inRect(point, PAUSE_BUTTON_RECT.x, PAUSE_BUTTON_RECT.y, PAUSE_BUTTON_RECT.width, PAUSE_BUTTON_RECT.height);
    if (!inRect(point, audioButton.x, audioButton.y, audioButton.width, audioButton.height) && !isPauseTarget) {
      audio.unlock();
    }
    handleTap(point);
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    event.preventDefault();
    // Browser key repeat is the keyboard equivalent of a long press. It must
    // not turn one held key into a normal jump plus an air jump.
    if (event.repeat) return;
    audio.unlock();
    handleTap({ x: CENTER_X, y: HEIGHT / 2 });
  });

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - state.lastFrame) / 1000));
    state.lastFrame = now;
    if (state.screen === 'play' && !state.playPaused) updatePlay(dt);
    else if (state.screen === 'impact') updateImpact(dt);
    render();
    requestAnimationFrame(frame);
  }

  // Optional later integration: external login can call this after GameBlox is configured.
  window.DonutTower = {
    openStage: (id) => {
      if (Number.isInteger(id) && id >= 1 && id <= MAX_STAGE
        && (LOCAL_STAGE_TEST_ENABLED || id <= state.progress.unlocked)) startStage(id);
    },
    getProgress: () => ({ ...state.progress }),
    // Prediction UI comes later; this keeps its type-specific meaning in one
    // data source rather than inferring it from an artwork filename.
    getDonutTypeInfo: (type) => ({ ...donutProfile(type) }),
    getAudioState: () => audio.getState(),
    setAudioEnabled: (enabled) => {
      audio.setEnabled(Boolean(enabled));
      if (enabled) audio.unlock();
    },
    setProgress: (progress) => {
      if (!progress || typeof progress !== 'object') return;
      state.progress.unlocked = clamp(Number(progress.unlocked) || 1, 1, MAX_STAGE);
      state.progress.completed = Array.isArray(progress.completed) ? progress.completed.filter(Number.isFinite) : [];
      state.selectedStage = clamp(Number(progress.selected) || 1, 1, state.progress.unlocked);
      saveProgress();
    },
    getDebugState: () => {
      const support = standingSupportPlatform();
      const supportVisual = platformRenderVisual(support);
      const slipperyDrift = state.player?.slipperyDrift || null;
      const slipperySheen = support?.slipperySheen || null;
      const slipperyVisual = slipperyPlayerVisual(state.player);
      const activeProfile = state.activeDonut ? donutProfile(state.activeDonut) : null;
      const supportProfile = support ? donutProfile(support) : null;
      return {
      screen: state.screen,
      step: state.player?.currentPlatform ?? null,
      grounded: state.player?.grounded ?? null,
      activeStep: state.activeDonut?.step ?? null,
      activeAtTarget: state.activeDonut?.atTarget ?? null,
      activeX: state.activeDonut ? Number(state.activeDonut.x.toFixed(1)) : null,
      playerX: state.player ? Number(state.player.x.toFixed(2)) : null,
      playerY: state.player ? Number(state.player.y.toFixed(1)) : null,
      playerVY: state.player ? Number(state.player.vy.toFixed(1)) : null,
      jumpStartX: state.player ? Number(state.player.jumpStartX.toFixed(2)) : null,
      jumpStartDeltaX: state.player
        ? Number((state.player.x - state.player.jumpStartX).toFixed(2))
        : null,
      jumpPhase: state.player?.jumpPhase ?? null,
      landingPoseTimer: state.player ? Number(state.player.landingPoseTimer.toFixed(3)) : null,
      elapsed: Number(state.elapsed.toFixed(2)),
      spawnWait: Number.isFinite(state.spawnWait) ? Number(state.spawnWait.toFixed(2)) : null,
      activePhase: state.activeDonut?.phase ?? null,
      tower: state.tower ? {
        balance: Number(state.tower.balance.toFixed(3)),
        angleDeg: Number(((state.tower.angle * 180) / Math.PI).toFixed(2)),
        danger: Number(state.tower.danger.toFixed(3)),
        sameSideStreak: state.tower.sameSideStreak,
        collapseLimit: Number.isFinite(state.tower.collapseLimit)
          ? Number(state.tower.collapseLimit.toFixed(3))
          : null,
        collapsing: state.tower.collapsing,
      } : null,
      failureType: state.failure?.kind ?? null,
      failureTimer: state.failure ? Number(state.failure.timer.toFixed(3)) : null,
      supportReaction: support?.landingReaction ? {
        kind: support.landingReaction.kind ?? 'standard',
        elapsed: Number(support.landingReaction.elapsed.toFixed(3)),
        duration: Number(support.landingReaction.duration.toFixed(3)),
        offsetY: Number(supportVisual.offsetY.toFixed(3)),
        rotationDeg: Number(((supportVisual.rotation * 180) / Math.PI).toFixed(3)),
        scaleX: Number(supportVisual.scaleX.toFixed(3)),
        scaleY: Number(supportVisual.scaleY.toFixed(3)),
      } : null,
      speedTest: state.speedTest.enabled ? {
        running: state.speedTest.running,
        selectedStage: state.speedTest.selectedStage,
        selectedPreset: state.speedTest.selectedPreset,
        multiplier: selectedSpeedTestPreset()?.multiplier ?? null,
        speedPxPerSecond: selectedSpeedTestPreset()
          ? Math.round(BASE_DONUT_SPEED * selectedSpeedTestPreset().multiplier)
          : null,
      } : null,
      authoredStagePreview: state.authoredStagePreview.enabled ? {
        running: state.authoredStagePreview.running,
        stageId: state.authoredStagePreview.stageId,
      } : null,
      gimmickTest: state.gimmickTest.enabled ? {
        running: state.gimmickTest.running,
        activeGimmick: state.activeDonut?.gimmick ?? null,
        standingPlatformId: state.player?.standingPlatformId ?? null,
      } : null,
      slipperyTest: state.slipperyTest.enabled ? {
        running: state.slipperyTest.running,
        activeVariant: state.activeDonut?.variant ?? null,
        standingVariant: standingSupportPlatform()?.variant ?? null,
        driftRemaining: slipperyDrift
          ? Number(Math.max(
            0,
            slipperyDrift.delay + slipperyDrift.duration - slipperyDrift.elapsed,
          ).toFixed(3))
          : 0,
        driftDistance: slipperyDrift
          ? Number(slipperyDrift.distance.toFixed(2))
          : 0,
        drift: slipperyDrift ? {
          elapsed: Number(slipperyDrift.elapsed.toFixed(3)),
          delay: Number(slipperyDrift.delay.toFixed(3)),
          duration: Number(slipperyDrift.duration.toFixed(3)),
          direction: slipperyDrift.direction,
          strength: Number(slipperyDrift.strength.toFixed(3)),
          velocity: Number(slipperyDrift.velocity.toFixed(2)),
        } : null,
        sheen: slipperySheen ? {
          elapsed: Number(slipperySheen.elapsed.toFixed(3)),
          duration: Number(slipperySheen.duration.toFixed(3)),
          strength: Number(slipperySheen.strength.toFixed(3)),
          landingOffset: Number(slipperySheen.landingOffset.toFixed(2)),
        } : null,
        playerVisualRotationDeg: Number(((slipperyVisual.rotation * 180) / Math.PI).toFixed(2)),
      } : null,
      surfaceTest: state.surfaceTest.enabled ? {
        running: state.surfaceTest.running,
        activeVariant: state.activeDonut?.variant ?? null,
        standingVariant: support?.variant ?? null,
        driftDistance: slipperyDrift ? Number(slipperyDrift.distance.toFixed(2)) : 0,
        driftRemaining: slipperyDrift
          ? Number(Math.max(0, slipperyDrift.delay + slipperyDrift.duration - slipperyDrift.elapsed).toFixed(3))
          : 0,
        playerVisualRotationDeg: Number(((slipperyVisual.rotation * 180) / Math.PI).toFixed(2)),
      } : null,
      donutTypesTest: state.donutTypesTest.enabled ? {
        running: state.donutTypesTest.running,
        activeType: activeProfile?.id ?? null,
        standingType: supportProfile?.id ?? null,
        activeSize: activeProfile ? {
          width: activeProfile.width,
          height: activeProfile.height,
          renderHeight: activeProfile.renderHeight,
          preview: activeProfile.preview,
        } : null,
        standingSize: supportProfile ? {
          width: supportProfile.width,
          height: supportProfile.height,
          renderHeight: supportProfile.renderHeight,
          preview: supportProfile.preview,
        } : null,
      } : null,
      landingGimmickTest: state.landingGimmickTest.enabled ? {
        running: state.landingGimmickTest.running,
        activeVariant: state.activeDonut?.variant ?? null,
        standingVariant: support?.variant ?? null,
      } : null,
      specialDonutPreviewTest: state.specialDonutPreviewTest.enabled ? {
        running: state.specialDonutPreviewTest.running,
        activeKind: state.activeDonut?.specialKind ?? null,
        cueKind: state.specialDonutPreview.cue?.kind ?? null,
        cueRemaining: state.specialDonutPreview.cue
          ? Number(state.specialDonutPreview.cue.timer.toFixed(3))
          : 0,
        introKind: state.specialDonutPreview.intro?.kind ?? null,
        introRemaining: state.specialDonutPreview.intro
          ? Number(state.specialDonutPreview.intro.timer.toFixed(3))
          : 0,
        seenKinds: [...state.specialDonutPreview.seenKinds],
      } : null,
      };
    },
  };

  /* ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   * GameBull hooks. vite.gamebull.config.ts inserts this file before the last statement of their game.js, inside their
   * function, because their state is not reachable from outside it. Their function declarations are mutable bindings, so
   * wrapping one here is seen by all their callers (playbook section 22). Their game.js file itself is never edited.
   *
   * Stage Mode (gb/dt-host.js = the API): their PLAY, RETRY, NEXT STAGE and a stage from their STAGE SELECT all go through
   * their startStage(), which waits here for POST /play/plays (1 Life for the next stage; a cleared stage is free or
   * refused). Their CLEAR screen reports POST /play/stage-clears. Progress and locks are the server's.
   *
   * Display (what QA found on PONTE, PHOTO JIGSAW, Kurozumi and Himi Kiju, built in from the start):
   *  - no scaled frame and no side bars: their canvas is always 390 units wide and fills the window's width; only its
   *    height follows the window (their HEIGHT, a one-word seam). Their camera, jump and donuts do not change.
   *  - sharp on every phone: the canvas is drawn at the device's pixels (theirs was a fixed 390x844, about 2.3x upscaled on
   *    a 3x iPhone). If a phone cannot keep up, it steps down once or twice.
   *  - their fixed-position menus that need more height than the window are scaled as a block over a full-width backdrop.
   *  - the app's Done / collapse corners: in its expanded view (loader.ts infers it) their art and tower fill the whole
   *    window up to the top, behind those buttons, and only their screen's content starts below them.
   *  - no scroll, no zoom.
   * ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  const gbApi = window.DTGB;
  const gbLog = (...a) => console.log('[DT-GB]', ...a);
  const gbShell = document.querySelector('.app-shell');

  /* ── their page's frame, as CSS after theirs ── */
  const gbCss = document.createElement('style');
  gbCss.id = 'dtgb-style';
  gbCss.textContent = `
  html,body{position:fixed;inset:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;touch-action:none;-webkit-touch-callout:none;-webkit-text-size-adjust:100%}
  body{display:block;background:#171217}
  .app-shell{position:absolute;width:auto;height:auto;min-width:0;min-height:0;background:#171217;z-index:1}
  #tap-target,#tap-target:focus,#tap-target:focus-visible{outline:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
  @media (orientation:landscape) and (max-height:580px){#tap-target{pointer-events:none}}
  #dtgb-sides{position:fixed;inset:-30px;display:none;background:#171217 center/cover no-repeat;filter:blur(16px) brightness(.6);z-index:0}
  .dtgb-dialog{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,8,20,.62);touch-action:none;
    font-family:"Avenir Next","Hiragino Kaku Gothic ProN","Yu Gothic UI","Noto Sans JP",system-ui,sans-serif;color:#fff1df}
  .dtgb-dialog[hidden]{display:none}
  .dtgb-panel{width:100%;max-width:340px;max-height:100%;overflow:hidden;box-sizing:border-box;padding:20px 18px;background:rgba(34,28,43,.97);border:1.5px solid rgba(246,204,136,.88);border-radius:24px;text-align:center}
  .dtgb-panel h2{margin:0 0 10px;font-size:19px;font-weight:800;color:#ffe4ad}
  .dtgb-panel p{margin:0 0 8px;font-size:14px;font-weight:700;line-height:1.7;white-space:pre-line;text-wrap:balance}
  .dtgb-panel img{display:block;max-width:100%;max-height:130px;margin:8px auto;border-radius:10px}
  .dtgb-panel button{display:block;width:100%;margin-top:10px;min-height:46px;border-radius:16px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
    background:#f5dfbc;color:#54363f;border:1.6px solid #9b665a}
  .dtgb-panel button.dtgb-primary{background:#c96d78;color:#fffaf0;border:2.2px solid #ffe8bf}
  `;
  document.head.appendChild(gbCss);
  const gbSides = document.createElement('div');
  gbSides.id = 'dtgb-sides';
  const gbSidesArt = (stageId) => { gbSides.style.backgroundImage = 'url("' + getBackgroundTheme(stageId).asset + '")'; };
  gbSidesArt(1);
  document.body.insertBefore(gbSides, document.body.firstChild);

  /* ── no scroll, no zoom (trap W7): nothing on this page scrolls or zooms ── */
  {
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(t, stop, { passive: false });
    document.addEventListener('touchmove', stop, { passive: false });
    document.addEventListener('wheel', stop, { passive: false });
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) stop(e); });
    document.addEventListener('contextmenu', stop);
  }

  /* ── layout ── */
  const gbDlg = document.createElement('div');
  gbDlg.className = 'dtgb-dialog';
  gbDlg.hidden = true;
  const gbPanel = document.createElement('div');
  gbPanel.className = 'dtgb-panel';
  gbDlg.appendChild(gbPanel);
  gbShell.appendChild(gbDlg);
  const GB_MIN_H = 600;   // their jump, HUD and result panel (ends at 589) need this much at 390 wide
  const GB_BAND = 50;     // the app's expanded view: Done / collapse are 44 px tall, 4 px in; their content starts below this
  const GB_CORNER_W = 72; // Done's width with its margin; the collapse button is narrower
  let gbBase = 1;
  let gbBandUnits = 0;    // their y = 0 sits this far below the canvas top; their art still fills that part
  let gbRatioCap = 3;
  function gbFit() {
    const W = window.innerWidth, H = window.innerHeight;
    if (!W || !H) return;
    const widthFor = (h) => Math.min(W, Math.floor((h * WIDTH) / GB_MIN_H));
    let band = 0, w = widthFor(H);
    // Only when the game's own top corners sit under the app's buttons.
    if (window.DT_APP_CORNERS && (W - w) / 2 < GB_CORNER_W) { band = GB_BAND; w = widthFor(H - GB_BAND); }
    const left = Math.floor((W - w) / 2);
    gbShell.style.left = left + 'px';
    gbShell.style.top = '0px';
    gbShell.style.width = w + 'px';
    gbShell.style.height = H + 'px';
    gbSides.style.display = w < W ? 'block' : 'none';
    gbDlg.style.paddingTop = (18 + band) + 'px';
    const r = Math.min(gbRatioCap, window.devicePixelRatio || 1);
    const pw = Math.round(w * r), ph = Math.round(H * r);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    gbBase = pw / WIDTH;
    gbBandUnits = (band * WIDTH) / w;
    HEIGHT = ph / gbBase - gbBandUnits;
    gbLog(`Fit: window ${W}x${H}, game ${w}x${H} at +${left},0, ${pw}x${ph} px (ratio ${r}), ${HEIGHT.toFixed(1)} units tall${band ? ', content below the app corners' : ''}.`);
  }
  window.DTFit = gbFit;
  window.addEventListener('resize', gbFit);
  window.addEventListener('orientationchange', gbFit);
  gbFit();

  // Their backdrop: their art fitted to their 844 px height and cropped at the sides. On a shorter canvas that would leave
  // gaps at the sides, so it covers the width instead, kept on its bottom edge (their shop floor under their first donut).
  // It is scaled once for this canvas size and copied each frame: at a phone's full pixels, scaling a 941x1672 picture on
  // every frame is what a slow phone cannot afford.
  let gbBackdrop = null;
  drawArtworkCover = function (image) {
    const sw = image.naturalWidth || image.width, sh = image.naturalHeight || image.height;
    if (!sw || !sh) return;
    if (!gbBackdrop || gbBackdrop.image !== image || gbBackdrop.c.width !== canvas.width || gbBackdrop.c.height !== canvas.height) {
      const c = gbBackdrop && gbBackdrop.c ? gbBackdrop.c : document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      const g = c.getContext('2d', { alpha: false });
      const k = Math.max(c.height / sh, c.width / sw), dw = sw * k, dh = sh * k;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, (c.width - dw) / 2, c.height - dh, dw, dh);
      gbBackdrop = { image, c };
    }
    ctx.drawImage(gbBackdrop.c, 0, -gbBandUnits, WIDTH, HEIGHT + gbBandUnits);
  };

  /* ── their menus on a shorter canvas: scaled as a block, the backdrop and full-screen veils still fill the canvas ── */
  const GB_HOME_NEED = 650;   // their last line (the one below it is left out) ends at about 630
  const GB_SELECT_NEED = 713; // their panel ends at 637, then their BACK
  let gbMenuScale = 1;
  const gbBaseMatrix = () => ctx.setTransform(gbBase, 0, 0, gbBase, 0, gbBase * gbBandUnits);
  // Scale and top of the block. Their STAGE SELECT buttons start at 54: on a short canvas they stay below the Lives and sound
  // buttons (which end at 46 and are not scaled), so the block keeps 4 units under those.
  function gbMenuFit(screen) {
    if (screen === 'home') return { s: Math.min(1, HEIGHT / GB_HOME_NEED), dy: 0 };
    if (screen === 'select' && HEIGHT < GB_SELECT_NEED) {
      const s = (HEIGHT - 50) / (GB_SELECT_NEED - 54);
      return { s, dy: 50 - 54 * s };
    }
    return { s: 1, dy: 0 };
  }
  function gbScaled(draw, screen) {
    return function () {
      const { s, dy } = gbMenuFit(screen);
      if (s >= 1) return draw.apply(this, arguments);
      ctx.save();
      ctx.translate(CENTER_X * (1 - s), dy);
      ctx.scale(s, s);
      gbMenuScale = s;
      try { return draw.apply(this, arguments); } finally { ctx.restore(); gbMenuScale = 1; }
    };
  }
  drawHome = gbScaled(drawHome, 'home');
  drawStageSelect = gbScaled(drawStageSelect, 'select');
  const gbTheirBackground = drawHomeBackground;
  drawHomeBackground = function () {
    ctx.save();
    gbBaseMatrix();
    gbTheirBackground();
    ctx.restore();
  };
  const gbFillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = function (x, y, w, h) {
    if (x === 0 && y === 0 && w === WIDTH && h === HEIGHT) {
      // Their full-screen veils and flashes cover the whole canvas: the scaled block's sides and the part above their y = 0.
      ctx.save();
      gbBaseMatrix();
      gbFillRect(0, -gbBandUnits, WIDTH, HEIGHT + gbBandUnits);
      ctx.restore();
    } else gbFillRect(x, y, w, h);
  };
  // Their BACK sits at 704 and their hint at 786 on their 844 px screen: they close up under their panel when shorter.
  const gbBackY = () => Math.min(704, Math.max(HEIGHT, GB_SELECT_NEED) - 64);
  const gbTheirButton = drawMenuButton;
  drawMenuButton = function (x, y, width, height, label, tone) {
    return gbTheirButton(x, state.screen === 'select' && label === 'BACK' ? gbBackY() : y, width, height, label, tone);
  };
  const gbTheirCaption = menuCaption;
  menuCaption = function (value, x, y, color, align) {
    // Their "progress is saved on this device" is not true here: GameBull saves it for the player's account.
    if (value === '進行はこの端末に保存されます') return;
    if (value === 'タップしてステージを選択') {
      y = gbBackY() + 82;
      if (y > Math.max(HEIGHT, GB_SELECT_NEED) - 8) return;
    }
    gbTheirCaption(value, x, y, color, align);
  };

  /* ── GameBull messages, in the look of their result panel ── */
  const gbPara = (t) => { const p = document.createElement('p'); p.textContent = t; return p; };
  function gbDialog(nodes, buttons) {
    gbPanel.replaceChildren(...nodes);
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.label;
      if (b.primary) el.className = 'dtgb-primary';
      el.addEventListener('click', () => { gbDlg.hidden = true; if (b.run) b.run(); });
      gbPanel.appendChild(el);
    }
    gbDlg.hidden = false;
  }
  function gbCloseToApp(to) {
    if (window.parent === window) return false;
    const m = { type: 'gamebull:close' };
    if (to) m.to = to;
    window.parent.postMessage(m, location.origin); // the loading page relays it (trap W18)
    return true;
  }

  /* ── what stops their game and their taps ── */
  const gbLandscape = window.matchMedia('(orientation: landscape) and (max-height: 580px)'); // their "縦向きで遊んでね" cover
  let gbBusy = false, gbBusySince = 0;
  const gbFrozen = () => !gbDlg.hidden || gbLandscape.matches;
  const gbTheirUpdatePlay = updatePlay, gbTheirUpdateImpact = updateImpact;
  updatePlay = function (dt) { if (!gbFrozen()) gbTheirUpdatePlay(dt); };
  updateImpact = function (dt) { if (!gbFrozen()) gbTheirUpdateImpact(dt); };

  // Their tap point: the canvas now starts above their y = 0 in the app's expanded view.
  pointFromEvent = function (event) {
    const rect = canvas.getBoundingClientRect(), k = WIDTH / rect.width;
    return { x: (event.clientX - rect.left) * k, y: (event.clientY - rect.top) * k - gbBandUnits };
  };

  const gbTheirTap = handleTap;
  handleTap = function (point) {
    if (gbBusy || gbFrozen()) return;
    const a = audioButtonRectForScreen();
    if (inRect(point, a.x, a.y, a.width, a.height)) { gbTheirTap(point); return; }
    const scr = state.screen;
    if (scr !== 'home' && scr !== 'select') { gbTheirTap(point); return; }
    // Their menus check their own fixed rectangles: taps go back through the block's scale.
    const { s, dy } = gbMenuFit(scr);
    let q = { x: (point.x - CENTER_X * (1 - s)) / s, y: (point.y - dy) / s };
    if (inRect(q, a.x, a.y, a.width, a.height)) return;
    if (scr === 'select') {
      if (inRect(q, 42, gbBackY(), 306, 54)) q = { x: q.x, y: 705 };
      else if (q.y >= 640) return;
    }
    gbTheirTap(q);
  };

  /* ── Stage Mode ── */
  let gbAttempt = null;  // the running attempt on their board
  let gbClear = null;    // { stage, state: sending | ok | replay | late | failed, line, promise }
  let gbInternalStart = false;

  function gbSyncProgress() {
    const m = gbApi.context && gbApi.context.stageMode;
    if (!m) return;
    const h = m.highestCleared;
    state.progress.unlocked = clamp(h + 1, 1, MAX_STAGE);
    state.progress.completed = Array.from({ length: h }, (_, i) => i + 1);
    state.progress.selected = clamp(state.progress.selected || 1, 1, state.progress.unlocked);
    if (state.screen === 'home' || state.screen === 'select') state.selectedStage = clamp(state.selectedStage, 1, state.progress.unlocked);
  }
  window.addEventListener('dt-gb:context', gbSyncProgress);

  // Their backdrop for a stage is ready before the stage opens (their fallback drawing would flash otherwise).
  function gbThemeReady(stageId) {
    preloadBackgroundThemesForStage(stageId);
    const image = backgroundArtwork[getBackgroundTheme(stageId).id];
    if (!image || (image.complete && image.naturalWidth)) return Promise.resolve();
    return new Promise((res) => {
      image.addEventListener('load', res, { once: true });
      image.addEventListener('error', res, { once: true });
      setTimeout(res, 8000);
    });
  }

  const gbTheirStart = startStage;
  startStage = function (stageId, options) {
    if (gbInternalStart) return gbTheirStart(stageId, options);
    gbRequestStart(stageId);
    return undefined;
  };
  async function gbRequestStart(stageId) {
    if (gbBusy) return;
    gbBusy = true;
    gbBusySince = performance.now();
    try {
      if (gbClear && gbClear.promise) await gbClear.promise;
      const a = await gbApi.begin(stageId);
      await gbThemeReady(stageId);
      gbAttempt = a;
      gbClear = null;
      gbSidesArt(stageId);
      gbInternalStart = true;
      try { gbTheirStart(stageId); } finally { gbInternalStart = false; }
      gbLog(`Stage ${stageId}: their board opened (attempt ${a.attemptId}).`);
    } catch (e) {
      gbLog(`Stage ${stageId} not started: ${e.code || e.message}.`);
      gbDialog([gbPara(e.message)], [{ label: 'OK', primary: true }]);
    } finally {
      gbBusy = false;
    }
  }

  // After a clear their code selects the next stage in their save but leaves their home screen on the stage just cleared;
  // PLAY there would be a replay. Their home now shows the stage their save selected.
  const gbTheirReturnHome = returnHome;
  returnHome = function () {
    gbTheirReturnHome();
    state.selectedStage = clamp(state.progress.selected || 1, 1, state.progress.unlocked);
  };

  function gbWatchRun() {
    if (!gbAttempt) return;
    const scr = state.screen;
    if (scr === 'impact' || scr === 'gameover') {
      // A hit, a miss or their tower falling: this attempt is spent; their RETRY is a new one.
      gbApi.missed(gbAttempt.attemptId);
      gbLog(`Stage ${gbAttempt.stage}: run missed at ${state.player ? state.player.currentPlatform : '?'} / ${state.stage ? state.stage.targetSteps : '?'} (${state.resultReason || 'hit'}).`);
      gbAttempt = null;
    } else if (scr === 'clear') {
      const a = gbAttempt;
      gbAttempt = null;
      gbLog(`Stage ${a.stage}: their goal reached; reporting the clear.`);
      gbSendClear(a);
    } else if (scr === 'play' && gbDlg.hidden && gbApi.remainingMs(gbAttempt.attemptId) <= 0) {
      gbTimeUp(gbAttempt);
    }
  }

  function gbSendClear(a) {
    const r = { stage: a.stage, state: 'sending', line: 'GameBullに記録しています…', promise: null };
    gbClear = r;
    r.promise = (async () => {
      const res = await gbApi.completeStage(a.attemptId);
      r.promise = null;
      if (res.ok) {
        const d = res.result;
        if (d.status === 'CLEARED' || d.status === 'ALREADY_CLEARED') { r.state = 'ok'; r.line = 'GameBullに記録しました（' + d.highestCleared + ' / 600）'; }
        else if (d.status === 'REPLAY') { r.state = 'replay'; r.line = '再挑戦のクリア（GameBullの記録は変わりません）'; }
        else {
          r.state = 'late';
          r.line = '制限時間切れのため記録されませんでした';
          gbDialog([gbPara('制限時間切れのため、このクリアは記録されませんでした。\nもう一度挑戦すると、ライフを1つ使います。')], [
            { label: 'もう一度挑戦する', primary: true, run: () => startStage(a.stage) },
            { label: 'HOME', run: () => returnHome() }]);
        }
        gbSyncProgress();
        if (d.reward) gbShowReward(d.reward);
      } else if (res.final) {
        r.state = 'late';
        r.line = res.message;
      } else {
        r.state = 'failed';
        r.line = 'クリア記録を送信できませんでした';
        gbDialog([gbPara(res.message || 'クリア記録をGameBullに送信できませんでした。')], [
          { label: 'クリア記録を再送信', primary: true, run: () => gbSendClear(a) },
          { label: '閉じる' }]);
      }
    })();
  }

  function gbTimeUp(a) {
    gbApi.timeUp(a.attemptId);
    gbAttempt = null;
    gbLog(`Stage ${a.stage}: attempt time limit reached.`);
    gbDialog([gbPara('制限時間になりました。\nもう一度挑戦すると、ライフを1つ使います。')], [
      { label: 'もう一度挑戦する', primary: true, run: () => startStage(a.stage) },
      { label: 'HOME', run: () => returnHome() }]);
  }

  const gbSafeUrl = (v) => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u : null; } catch { return null; } };
  function gbShowReward(reward) {
    gbLog('All-clear reward: ' + reward.status + '.');
    if (reward.status === 'NONE_CONFIGURED') return;
    const text = { ISSUED: 'ギフト券が発行され、GameBullのクーポン一覧に入りました。', ALREADY_CLAIMED: 'この店舗の特典はすでに受け取り済みです。',
      OUT_OF_STOCK: '特典は一時的に在庫切れです。後でGameBullアプリのゲーム画面から受け取れます。' }[reward.status] || '特典の状態はGameBullでご確認ください。';
    const h = document.createElement('h2');
    h.textContent = reward.title || '全ステージ達成特典';
    const nodes = [h, gbPara('全600ステージ達成、おめでとうございます！'), gbPara(text)];
    if (reward.benefit) nodes.push(gbPara(reward.benefit));
    const img = gbSafeUrl(reward.imageUrl);
    if (img) { const im = new Image(); im.alt = reward.title || '全ステージ達成特典'; im.referrerPolicy = 'no-referrer'; im.src = img.href; nodes.push(im); }
    const buttons = [];
    const redeem = reward.status === 'ISSUED' && gbSafeUrl(reward.redeemUrl);
    if (redeem) buttons.push({ label: 'GameBullでギフト券を開く', primary: true, run: () => {
      // Inside the app the frame has no allow-popups: close the game and let the app open the coupon. Outside it, the link.
      const m = /^\/coupons\/[^/?#]+$/.exec(redeem.pathname);
      if (gbCloseToApp(m ? m[0] : undefined)) return;
      const l = document.createElement('a'); l.href = redeem.href; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.click();
    } });
    buttons.push({ label: '閉じる', primary: !redeem });
    gbDialog(nodes, buttons);
  }

  /* ── GameBull's few lines on their canvas, in the colours of their HUD ── */
  const gbFmt = (ms) => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function gbPill(x, y, h, label, align, color) {
    menuFont(12, 800);
    const w = Math.ceil(ctx.measureText(label).width) + 18, left = align === 'right' ? x - w : x;
    roundRect(left, y, w, h, Math.min(10, h / 2), '#2b1e20', '#d6b178');
    menuText(label, left + w / 2, y + h / 2 + 0.5, 12, color || '#fff1d9', 'center', 800);
  }
  function gbDrawLines() {
    const scr = state.screen;
    const lives = gbApi.context ? 'ライフ ' + gbApi.lives : '';
    if (scr === 'home' || scr === 'select') {
      if (lives) gbPill(14, 14, 32, lives, 'left');
    } else if (scr === 'play' || scr === 'impact') {
      if (lives) gbPill(13, 61, 22, lives, 'left');
      const left = gbAttempt ? gbApi.remainingMs(gbAttempt.attemptId) : 0;
      if (gbAttempt && left <= 600000) gbPill(377, 61, 22, '残り ' + gbFmt(left), 'right', left <= 60000 ? '#ff9a8f' : '#fff1d9');
      // Their pause stops their game, not GameBull's clock: the server measures an attempt from start to clear (Kurozumi QA).
      if (gbAttempt && state.playPaused && left <= 600000) menuCaption('GameBullの制限時間は一時停止中も進みます', CENTER_X, 110, '#fff1d9');
    } else if (scr === 'gameover') {
      if (lives) menuCaption(lives + '・RETRYでライフを1つ使います', CENTER_X, 577, '#dcb7ac');
    } else if (scr === 'clear') {
      const line = (gbClear && gbClear.line) || '';
      menuCaption(line + (lives && line ? '・' : '') + lives, CENTER_X, 577, gbClear && gbClear.state === 'failed' ? '#ff9a8f' : '#dec4a1');
    }
    if (gbBusy && performance.now() - gbBusySince > 400) {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 8, 20, .45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
      menuText('GameBullに接続しています…', CENTER_X, HEIGHT / 2, 14, '#fff1df', 'center', 800);
    }
  }

  /* ── their render: at the device's pixels, then GameBull's lines; a phone that falls behind steps down ── */
  let gbFrames = 0, gbFrameSum = 0, gbLastDraw = 0;
  function gbWatchSpeed(now) {
    const dt = now - gbLastDraw;
    gbLastDraw = now;
    if (state.screen !== 'play' || state.playPaused || dt <= 0 || dt > 1000) return;
    gbFrames += 1;
    gbFrameSum += dt;
    if (gbFrames < 45) return;
    const avg = gbFrameSum / gbFrames;
    gbFrames = 0;
    gbFrameSum = 0;
    const r = Math.min(gbRatioCap, window.devicePixelRatio || 1);
    if (avg > 24 && r > 1) {
      gbRatioCap = r > 2 ? 2 : r > 1.5 ? 1.5 : 1;
      gbLog(`Frames take ${avg.toFixed(1)} ms: drawing at ratio ${gbRatioCap}.`);
      gbFit();
    }
  }
  const gbTheirRender = render;
  render = function () {
    gbWatchRun();
    gbWatchSpeed(performance.now());
    gbBaseMatrix();
    gbTheirRender();
    gbDrawLines();
  };

  /* ── sound: their default is on; their music starts at the first tap anywhere ──
   * iPhone: only a touchend / pointerup / click / keydown counts as a tap for audio, and their page unlocks on pointerdown
   * (traps W1, W2): their own unlock() runs on those too. It stays silent once the player has turned their sound off. */
  {
    const unlockOnTap = (e) => {
      if (!e.isTrusted || !audio.isEnabled()) return;
      const st = audio.getState();
      if (st.contextState !== 'running' || !st.bgmRunning) audio.unlock();
    };
    for (const t of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(t, unlockOnTap, { capture: true });
    document.addEventListener('pointerdown', () => { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* n/a */ } }, { capture: true, once: true });
  }

  /* ── start-up: GameBull's progress, their art behind the loading page; a launch that cannot play says so ── */
  {
    const progress = (p) => { try { if (window.parent.gbLoaderProgress) window.parent.gbLoaderProgress(p); } catch { /* not in our frame */ } };
    let signalled = false;
    const done = () => {
      if (signalled) return;
      signalled = true;
      progress(1);
      try { if (window.parent.gbLoaderDone) window.parent.gbLoaderDone(); } catch { /* not in our frame */ }
    };
    setTimeout(done, 20000); // never keep the loading page up on an answer that will not come
    progress(0.05);
    const artReady = () => new Promise((res) => {
      const t0 = performance.now();
      const look = () => {
        const list = Object.values(artwork).concat(Object.values(backgroundArtwork));
        const ready = list.filter((i) => i.complete).length;
        progress(0.2 + 0.75 * (ready / Math.max(1, list.length)));
        if (ready === list.length || performance.now() - t0 > 18000) res();
        else setTimeout(look, 100);
      };
      look();
    });
    gbApi.check()
      .then((c) => {
        const m = c.stageMode;
        gbLog(`Progress ${m.highestCleared} / 600, ${gbApi.lives} Lives, next stage ${m.nextStage}.`);
        const next = m.nextStage === null ? MAX_STAGE : m.nextStage;
        state.progress.selected = next;
        state.selectedStage = next;
        state.chapterPage = Math.ceil(next / 30);
        gbSyncProgress();
        preloadBackgroundThemesForStage(next);
        return gbApi.settlePendingClears().catch(() => { /* sent again before the next start */ });
      })
      .catch((e) => {
        gbLog('Start-up message: ' + e.message);
        if (e.code === 'network') { gbDialog([gbPara(e.message)], [{ label: 'もう一度', primary: true, run: () => location.reload() }]); return; }
        const buttons = gbApi.embedded ? [{ label: 'GameBullに戻る', primary: true, run: () => gbCloseToApp() }, { label: '閉じる' }] : [{ label: 'OK', primary: true }];
        gbDialog([gbPara(e.message)], buttons);
      })
      .then(artReady)
      .finally(done);
  }

  if (window.DT_GB && window.DT_GB.dev) window.DTDev = { state, finishGame: (...a) => finishGame(...a), get height() { return HEIGHT; }, get band() { return gbBandUnits; }, menu: gbMenuFit };

  requestAnimationFrame(frame);
})();
