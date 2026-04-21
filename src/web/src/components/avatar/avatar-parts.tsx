// Avatar parts library — original illustrations by Jacky
// Each part is an SVG path/fragment. Rendered in a 200x200 viewBox.
// Layers (z-order, bottom -> top):
//   background, face, beard, mouth, nose, eyes, eyebrows, hair, glasses, earrings, hat, collar

import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────
// PALETTES
// ─────────────────────────────────────────────────────────────
export interface ColorOption {
  id: string;
  fill: string;
  name: string;
}

export const SKIN_TONES: ColorOption[] = [
  { id: "s1", fill: "#f5dcc4", name: "象牙" },
  { id: "s2", fill: "#ebc8a6", name: "杏白" },
  { id: "s3", fill: "#d9a87c", name: "蜜栗" },
  { id: "s4", fill: "#b48155", name: "栗棕" },
  { id: "s5", fill: "#7a5233", name: "深栗" },
  { id: "s6", fill: "#c9a594", name: "粉杏" },
];

export const HAIR_COLORS: ColorOption[] = [
  { id: "h1", fill: "#2a241e", name: "墨黑" },
  { id: "h2", fill: "#6b4a32", name: "深棕" },
  { id: "h3", fill: "#a87a4f", name: "栗金" },
  { id: "h4", fill: "#d4a574", name: "浅金" },
  { id: "h5", fill: "#c96442", name: "赤铜" },
  { id: "h6", fill: "#8a8478", name: "烟灰" },
  { id: "h7", fill: "#e8ddd0", name: "亚麻" },
  { id: "h8", fill: "#4a5568", name: "冷墨" },
];

export const BG_COLORS: ColorOption[] = [
  { id: "b1", fill: "#f0eee9", name: "米白" },
  { id: "b2", fill: "#e8e2d4", name: "奶油" },
  { id: "b3", fill: "#d8d4c8", name: "灰米" },
  { id: "b4", fill: "#c9cfd8", name: "雾蓝" },
  { id: "b5", fill: "#b8c2c9", name: "烟青" },
  { id: "b6", fill: "#d8c4b0", name: "沙棕" },
  { id: "b7", fill: "#c4b8a4", name: "灰褐" },
  { id: "b8", fill: "#2a251f", name: "墨夜" },
];

export const CLOTHING_COLORS: ColorOption[] = [
  { id: "c1", fill: "#c96442", name: "赤陶" },
  { id: "c2", fill: "#6b8a9a", name: "雾蓝" },
  { id: "c3", fill: "#8a7a5c", name: "橄榄" },
  { id: "c4", fill: "#2a251f", name: "墨黑" },
  { id: "c5", fill: "#e8ddd0", name: "米白" },
  { id: "c6", fill: "#7a5c4a", name: "栗褐" },
];

export const INK = "#2a251f";

// ─────────────────────────────────────────────────────────────
// PART TYPES
// ─────────────────────────────────────────────────────────────
export interface FacePart {
  id: string;
  name: string;
  render: (color: string, ink: string) => ReactNode;
}

export interface SingleColorPart {
  id: string;
  name: string;
  render: (ink: string) => ReactNode;
}

export interface DualColorPart {
  id: string;
  name: string;
  render: (color: string, ink: string) => ReactNode;
}

// ─────────────────────────────────────────────────────────────
// FACE SHAPES (8)
// ─────────────────────────────────────────────────────────────
export const FACES: FacePart[] = [
  { id: "f1", name: "圆", render: (c, ink) => <path d="M100 58 C70 58 55 85 55 115 C55 148 75 170 100 170 C125 170 145 148 145 115 C145 85 130 58 100 58 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "f2", name: "长", render: (c, ink) => <path d="M100 55 C75 55 60 78 60 112 C60 150 78 175 100 175 C122 175 140 150 140 112 C140 78 125 55 100 55 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "f3", name: "方", render: (c, ink) => <path d="M100 58 C72 58 58 72 58 100 L58 135 C58 158 75 170 100 170 C125 170 142 158 142 135 L142 100 C142 72 128 58 100 58 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "f4", name: "尖", render: (c, ink) => <path d="M100 58 C72 58 58 82 58 110 C58 140 78 175 100 175 C122 175 142 140 142 110 C142 82 128 58 100 58 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "f5", name: "鹅", render: (c, ink) => <path d="M100 55 C78 55 62 75 62 102 C62 115 65 128 72 145 C80 162 90 172 100 172 C110 172 120 162 128 145 C135 128 138 115 138 102 C138 75 122 55 100 55 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "f6", name: "宽", render: (c, ink) => <path d="M100 58 C68 58 52 80 52 108 C52 142 72 172 100 172 C128 172 148 142 148 108 C148 80 132 58 100 58 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "f7", name: "菱", render: (c, ink) => <path d="M100 55 L62 105 L82 165 L118 165 L138 105 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "f8", name: "心", render: (c, ink) => <path d="M100 58 C74 58 58 75 58 102 C58 125 70 145 85 160 C92 168 96 172 100 172 C104 172 108 168 115 160 C130 145 142 125 142 102 C142 75 126 58 100 58 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
];

// ─────────────────────────────────────────────────────────────
// EYES (8)
// ─────────────────────────────────────────────────────────────
export const EYES: SingleColorPart[] = [
  { id: "e1", name: "圆眼", render: (ink) => (<g fill={ink}><circle cx="80" cy="112" r="5.5" /><circle cx="120" cy="112" r="5.5" /></g>) },
  { id: "e2", name: "弯眼", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round"><path d="M73 115 Q80 108 87 115" /><path d="M113 115 Q120 108 127 115" /></g>) },
  { id: "e3", name: "杏眼", render: (ink) => (<g><ellipse cx="80" cy="113" rx="7" ry="4.5" fill="#fff" stroke={ink} strokeWidth="2.5" /><ellipse cx="120" cy="113" rx="7" ry="4.5" fill="#fff" stroke={ink} strokeWidth="2.5" /><circle cx="80" cy="113" r="2.8" fill={ink} /><circle cx="120" cy="113" r="2.8" fill={ink} /></g>) },
  { id: "e4", name: "细眼", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M72 114 L88 114" /><path d="M112 114 L128 114" /></g>) },
  { id: "e5", name: "大眼", render: (ink) => (<g><circle cx="80" cy="113" r="8" fill="#fff" stroke={ink} strokeWidth="2.8" /><circle cx="120" cy="113" r="8" fill="#fff" stroke={ink} strokeWidth="2.8" /><circle cx="81" cy="114" r="4" fill={ink} /><circle cx="121" cy="114" r="4" fill={ink} /><circle cx="82" cy="111" r="1.2" fill="#fff" /><circle cx="122" cy="111" r="1.2" fill="#fff" /></g>) },
  { id: "e6", name: "瞇眼", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M73 113 Q80 118 87 113" /><path d="M113 113 Q120 118 127 113" /></g>) },
  { id: "e7", name: "下垂", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M74 112 L82 117 L88 115" /><path d="M112 115 L118 117 L126 112" /></g>) },
  { id: "e8", name: "星星", render: (ink) => (<g fill={ink}><path d="M80 106 L82 112 L88 113 L82 114 L80 120 L78 114 L72 113 L78 112 Z" /><path d="M120 106 L122 112 L128 113 L122 114 L120 120 L118 114 L112 113 L118 112 Z" /></g>) },
];

// ─────────────────────────────────────────────────────────────
// EYEBROWS (8)
// ─────────────────────────────────────────────────────────────
export const EYEBROWS: SingleColorPart[] = [
  { id: "w0", name: "无", render: () => null },
  { id: "w1", name: "平直", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M72 95 L90 95" /><path d="M110 95 L128 95" /></g>) },
  { id: "w2", name: "弧形", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M72 97 Q81 91 90 97" /><path d="M110 97 Q119 91 128 97" /></g>) },
  { id: "w3", name: "上挑", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M72 98 L90 93" /><path d="M110 93 L128 98" /></g>) },
  { id: "w4", name: "八字", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M72 93 L90 98" /><path d="M110 98 L128 93" /></g>) },
  { id: "w5", name: "粗眉", render: (ink) => (<g fill={ink}><path d="M72 93 Q81 88 90 93 L90 98 Q81 94 72 98 Z" /><path d="M110 93 Q119 88 128 93 L128 98 Q119 94 110 98 Z" /></g>) },
  { id: "w6", name: "碎眉", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round"><path d="M73 96 L78 94" /><path d="M82 94 L88 95" /><path d="M112 95 L118 94" /><path d="M122 94 L127 96" /></g>) },
  { id: "w7", name: "皱眉", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M74 95 L90 99" /><path d="M110 99 L126 95" /></g>) },
];

// ─────────────────────────────────────────────────────────────
// NOSE (8)
// ─────────────────────────────────────────────────────────────
export const NOSES: SingleColorPart[] = [
  { id: "n0", name: "无", render: () => null },
  { id: "n1", name: "小点", render: (ink) => <circle cx="100" cy="128" r="2.2" fill={ink} /> },
  { id: "n2", name: "圆鼻", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round"><path d="M95 130 Q100 135 105 130" /></g>) },
  { id: "n3", name: "挺拔", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round"><path d="M96 118 L96 130 Q100 134 104 130 L104 118" /></g>) },
  { id: "n4", name: "钩鼻", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round"><path d="M97 118 Q94 126 97 130 Q100 132 104 130" /></g>) },
  { id: "n5", name: "三角", render: (ink) => <path d="M100 120 L94 132 L106 132 Z" fill="none" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" /> },
  { id: "n6", name: "侧影", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round"><path d="M98 118 L96 128 L100 131" /></g>) },
  { id: "n7", name: "两点", render: (ink) => (<g fill={ink}><circle cx="96" cy="130" r="1.6" /><circle cx="104" cy="130" r="1.6" /></g>) },
];

// ─────────────────────────────────────────────────────────────
// MOUTH (8)
// ─────────────────────────────────────────────────────────────
export const MOUTHS: SingleColorPart[] = [
  { id: "m1", name: "微笑", render: (ink) => <path d="M88 148 Q100 158 112 148" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" /> },
  { id: "m2", name: "一字", render: (ink) => <path d="M88 150 L112 150" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" /> },
  { id: "m3", name: "大笑", render: (ink) => <path d="M85 145 Q100 162 115 145 L85 145 Z" fill={ink} /> },
  { id: "m4", name: "嘟嘴", render: (ink) => <ellipse cx="100" cy="150" rx="5" ry="4" fill="none" stroke={ink} strokeWidth="2.5" /> },
  { id: "m5", name: "咧开", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M86 148 Q100 158 114 148" /><path d="M92 152 L108 152" /></g>) },
  { id: "m6", name: "叹气", render: (ink) => <path d="M88 152 Q100 146 112 152" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" /> },
  { id: "m7", name: "噘嘴", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round"><path d="M95 148 Q100 145 105 148" /><path d="M95 152 Q100 155 105 152" /></g>) },
  { id: "m8", name: "歪嘴", render: (ink) => <path d="M88 150 Q100 146 112 152" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" /> },
];

// ─────────────────────────────────────────────────────────────
// HAIR (14)
// ─────────────────────────────────────────────────────────────
export const HAIRS: DualColorPart[] = [
  { id: "r0", name: "光头", render: () => null },
  { id: "r1", name: "短发", render: (c, ink) => <path d="M58 95 Q58 55 100 52 Q142 55 142 95 L138 85 Q130 72 100 70 Q70 72 62 85 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "r2", name: "齐刘海", render: (c, ink) => <path d="M56 100 Q55 55 100 52 Q145 55 144 100 L138 105 L125 82 L115 105 L102 82 L92 105 L80 82 L68 105 L62 100 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "r3", name: "长发", render: (c, ink) => <path d="M55 100 Q55 55 100 52 Q145 55 145 100 L150 160 L138 162 L140 110 Q130 78 100 74 Q70 78 60 110 L62 162 L50 160 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "r4", name: "卷发", render: (c, ink) => (<g fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round"><circle cx="70" cy="70" r="14" /><circle cx="88" cy="58" r="14" /><circle cx="110" cy="58" r="14" /><circle cx="130" cy="70" r="14" /><circle cx="140" cy="88" r="12" /><circle cx="60" cy="88" r="12" /><path d="M56 95 Q60 80 75 72 Q90 64 100 62 Q110 64 125 72 Q140 80 144 95 Z" /></g>) },
  { id: "r5", name: "马尾", render: (c, ink) => (<g fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M58 98 Q58 55 100 52 Q142 55 142 98 L138 88 Q128 72 100 70 Q72 72 62 88 Z" /><path d="M138 85 Q165 95 160 140 Q155 155 148 150 Q150 120 138 100 Z" /></g>) },
  { id: "r7", name: "飞机头", render: (c, ink) => <path d="M58 100 Q56 72 78 62 Q98 54 120 58 Q138 60 144 72 Q148 82 142 92 L140 100 L135 86 Q118 74 100 74 Q78 78 64 92 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "r8", name: "长直发", render: (c, ink) => <path d="M52 100 Q50 52 100 48 Q150 52 148 100 L154 200 L136 200 L138 115 L135 95 L65 95 L62 115 L64 200 L46 200 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "r9", name: "波波头", render: (c, ink) => <path d="M54 115 Q54 55 100 50 Q146 55 146 115 Q146 135 138 140 L138 90 Q125 75 100 72 Q75 75 62 90 L62 140 Q54 135 54 115 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "r10", name: "双马尾", render: (c, ink) => (<g fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M58 98 Q58 52 100 48 Q142 52 142 98 L135 85 Q120 72 100 70 Q80 72 65 85 Z" /><path d="M50 92 Q30 105 28 150 Q35 170 46 160 Q45 130 55 105 Z" /><path d="M150 92 Q170 105 172 150 Q165 170 154 160 Q155 130 145 105 Z" /></g>) },
  { id: "r11", name: "丸子头", render: (c, ink) => (<g fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round"><circle cx="100" cy="40" r="14" /><path d="M58 98 Q58 54 100 52 Q142 54 142 98 L135 86 Q120 74 100 72 Q80 74 65 86 Z" /></g>) },
  { id: "r12", name: "侧分长", render: (c, ink) => <path d="M52 105 Q50 52 100 48 Q150 52 148 100 L145 180 L128 182 L132 110 L80 92 L62 102 L62 180 L48 180 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "r13", name: "空气刘海", render: (c, ink) => <path d="M55 100 Q55 52 100 48 Q145 52 145 100 L140 105 L128 78 L115 102 L100 78 L85 102 L72 78 L60 105 Z" fill={c} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
];

// ─────────────────────────────────────────────────────────────
// BEARD (8)
// ─────────────────────────────────────────────────────────────
export const BEARDS: DualColorPart[] = [
  { id: "d0", name: "无", render: () => null },
  { id: "d1", name: "胡渣", render: (ink) => (<g fill={ink} opacity=".5"><circle cx="85" cy="158" r="0.8" /><circle cx="92" cy="160" r="0.8" /><circle cx="100" cy="161" r="0.8" /><circle cx="108" cy="160" r="0.8" /><circle cx="115" cy="158" r="0.8" /><circle cx="88" cy="163" r="0.8" /><circle cx="96" cy="164" r="0.8" /><circle cx="104" cy="164" r="0.8" /><circle cx="112" cy="163" r="0.8" /></g>) },
  { id: "d2", name: "八字", render: (c, ink) => <path d="M85 152 Q92 148 100 150 Q108 148 115 152 Q108 155 100 154 Q92 155 85 152 Z" fill={c || ink} stroke={ink} strokeWidth="1.5" /> },
  { id: "d3", name: "山羊", render: (c, ink) => <path d="M93 157 Q100 168 107 157 Q105 165 100 170 Q95 165 93 157 Z" fill={c || ink} stroke={ink} strokeWidth="1.5" /> },
  { id: "d4", name: "络腮", render: (c, ink) => <path d="M65 130 Q68 155 82 165 Q100 172 118 165 Q132 155 135 130 Q128 158 112 162 Q100 165 88 162 Q72 158 65 130 Z" fill={c || ink} stroke={ink} strokeWidth="2" /> },
  { id: "d5", name: "圆下巴", render: (c, ink) => <path d="M82 158 Q85 170 100 172 Q115 170 118 158 Q108 164 100 163 Q92 164 82 158 Z" fill={c || ink} stroke={ink} strokeWidth="1.5" /> },
  { id: "d6", name: "连鬓", render: (c, ink) => (<g fill={c || ink} stroke={ink} strokeWidth="1.5"><path d="M58 110 L62 150 L70 145 L65 110 Z" /><path d="M142 110 L138 150 L130 145 L135 110 Z" /></g>) },
  { id: "d7", name: "小胡子", render: (c, ink) => <path d="M88 148 Q94 145 100 148 Q106 145 112 148 Q106 152 100 151 Q94 152 88 148 Z" fill={c || ink} stroke={ink} strokeWidth="1.2" /> },
];

// ─────────────────────────────────────────────────────────────
// GLASSES (8)
// ─────────────────────────────────────────────────────────────
export const GLASSES: SingleColorPart[] = [
  { id: "g0", name: "无", render: () => null },
  { id: "g1", name: "圆框", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5"><circle cx="80" cy="114" r="12" /><circle cx="120" cy="114" r="12" /><path d="M92 114 L108 114" /></g>) },
  { id: "g2", name: "方框", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5"><rect x="68" y="104" width="24" height="20" rx="3" /><rect x="108" y="104" width="24" height="20" rx="3" /><path d="M92 114 L108 114" /></g>) },
  { id: "g3", name: "半框", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round"><path d="M68 114 Q68 124 80 124 Q92 124 92 114" /><path d="M108 114 Q108 124 120 124 Q132 124 132 114" /><path d="M92 114 L108 114" /></g>) },
  { id: "g4", name: "墨镜", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2"><rect x="67" y="104" width="26" height="18" rx="4" fill={ink} /><rect x="107" y="104" width="26" height="18" rx="4" fill={ink} /><line x1="93" y1="112" x2="107" y2="112" /></g>) },
  { id: "g5", name: "细框", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="1.5"><circle cx="80" cy="114" r="11" /><circle cx="120" cy="114" r="11" /><path d="M91 114 L109 114" /></g>) },
  { id: "g6", name: "飞行员", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5"><path d="M68 108 Q68 124 80 124 Q92 124 92 108 Z" /><path d="M108 108 Q108 124 120 124 Q132 124 132 108 Z" /><path d="M92 114 L108 114" /></g>) },
  { id: "g7", name: "单片", render: (ink) => (<g fill="none" stroke={ink} strokeWidth="2.5"><circle cx="120" cy="114" r="11" /><path d="M131 110 L145 100" strokeLinecap="round" /></g>) },
];

// ─────────────────────────────────────────────────────────────
// EARRINGS (8)
// ─────────────────────────────────────────────────────────────
export const EARRINGS: DualColorPart[] = [
  { id: "a0", name: "无", render: () => null },
  { id: "a1", name: "圆钉", render: (c, ink) => (<g fill={c || "#c9a574"} stroke={ink} strokeWidth="1"><circle cx="56" cy="128" r="2.5" /><circle cx="144" cy="128" r="2.5" /></g>) },
  { id: "a2", name: "吊坠", render: (c, ink) => (<g fill={c || "#c9a574"} stroke={ink} strokeWidth="1"><circle cx="56" cy="126" r="2" /><path d="M55 128 L55 136 L57 136 L57 128" /><circle cx="144" cy="126" r="2" /><path d="M143 128 L143 136 L145 136 L145 128" /></g>) },
  { id: "a3", name: "圈环", render: (c, ink) => (<g fill="none" stroke={c || "#c9a574"} strokeWidth="1.8"><circle cx="56" cy="130" r="5" /><circle cx="144" cy="130" r="5" /></g>) },
  { id: "a4", name: "方钉", render: (c, ink) => (<g fill={c || "#c9a574"} stroke={ink} strokeWidth="1"><rect x="53" y="125" width="5" height="5" /><rect x="142" y="125" width="5" height="5" /></g>) },
  { id: "a5", name: "长吊", render: (c, ink) => (<g fill={c || "#c9a574"} stroke={ink} strokeWidth="1"><circle cx="56" cy="126" r="2" /><path d="M55 128 L55 142 L57 142 L57 128" /><circle cx="144" cy="126" r="2" /><path d="M143 128 L143 142 L145 142 L145 128" /></g>) },
  { id: "a6", name: "星形", render: (c, ink) => (<g fill={c || "#c9a574"} stroke={ink} strokeWidth="0.8"><path d="M56 124 L58 128 L62 128 L59 131 L60 135 L56 133 L52 135 L53 131 L50 128 L54 128 Z" /><path d="M144 124 L146 128 L150 128 L147 131 L148 135 L144 133 L140 135 L141 131 L138 128 L142 128 Z" /></g>) },
  { id: "a7", name: "双钉", render: (c, ink) => (<g fill={c || "#c9a574"} stroke={ink} strokeWidth="0.8"><circle cx="55" cy="125" r="1.8" /><circle cx="56" cy="132" r="1.8" /><circle cx="145" cy="125" r="1.8" /><circle cx="144" cy="132" r="1.8" /></g>) },
];

// ─────────────────────────────────────────────────────────────
// HAT (8)
// ─────────────────────────────────────────────────────────────
export const HATS: DualColorPart[] = [
  { id: "t0", name: "无", render: () => null },
  { id: "t1", name: "鸭舌帽", render: (c, ink) => (<g fill={c || "#c96442"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M58 75 Q58 45 100 42 Q142 45 142 75 L142 82 L58 82 Z" /><path d="M142 75 L165 78 L162 86 L142 83 Z" /></g>) },
  { id: "t2", name: "毛线帽", render: (c, ink) => (<g fill={c || "#c96442"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M55 85 Q55 42 100 40 Q145 42 145 85 L140 88 L60 88 Z" /><ellipse cx="100" cy="38" rx="8" ry="8" fill={ink} opacity=".3" /><path d="M55 82 L145 82 L145 90 L55 90 Z" fill={ink} opacity=".15" /></g>) },
  { id: "t3", name: "礼帽", render: (c, ink) => (<g fill={c || "#2a251f"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><rect x="65" y="40" width="70" height="45" /><ellipse cx="100" cy="85" rx="55" ry="6" /></g>) },
  { id: "t4", name: "贝雷", render: (c, ink) => (<g fill={c || "#c96442"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><ellipse cx="100" cy="62" rx="48" ry="22" /><circle cx="125" cy="48" r="4" fill={ink} /></g>) },
  { id: "t5", name: "头巾", render: (c, ink) => <path d="M55 90 Q55 55 100 48 Q145 55 145 90 L148 105 L52 105 Z" fill={c || "#6b8a9a"} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "t6", name: "皇冠", render: (c, ink) => (<g fill={c || "#d4a574"} stroke={ink} strokeWidth="2.5" strokeLinejoin="round"><path d="M60 80 L68 50 L82 72 L100 45 L118 72 L132 50 L140 80 Z" /><circle cx="100" cy="58" r="2.5" fill={ink} /></g>) },
  { id: "t7", name: "发带", render: (c, ink) => (<g fill={c || "#c96442"} stroke={ink} strokeWidth="2.5" strokeLinejoin="round"><rect x="55" y="70" width="90" height="14" rx="2" /><path d="M62 70 Q60 62 64 58 Q68 64 68 70" /></g>) },
];

// ─────────────────────────────────────────────────────────────
// COLLAR / CLOTHING (8)
// ─────────────────────────────────────────────────────────────
export const COLLARS: DualColorPart[] = [
  { id: "o1", name: "圆领", render: (c, ink) => <path d="M40 200 L40 185 Q55 170 80 168 Q100 180 120 168 Q145 170 160 185 L160 200 Z" fill={c || "#c96442"} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "o2", name: "V领", render: (c, ink) => <path d="M40 200 L40 185 Q55 172 78 170 L100 190 L122 170 Q145 172 160 185 L160 200 Z" fill={c || "#6b8a9a"} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "o3", name: "衬衫", render: (c, ink) => (<g fill={c || "#e8ddd0"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M40 200 L40 185 Q55 172 80 170 L90 178 L100 172 L110 178 L120 170 Q145 172 160 185 L160 200 Z" /><path d="M90 178 L100 200" fill="none" /><path d="M110 178 L100 200" fill="none" /></g>) },
  { id: "o4", name: "高领", render: (c, ink) => <path d="M40 200 L40 180 Q60 172 85 172 Q100 172 115 172 Q140 172 160 180 L160 200 Z M70 172 Q75 165 100 164 Q125 165 130 172" fill={c || "#8a7a5c"} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
  { id: "o5", name: "连帽", render: (c, ink) => (<g fill={c || "#2a251f"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M40 200 L40 185 Q50 172 70 170 L70 160 Q85 150 100 150 Q115 150 130 160 L130 170 Q150 172 160 185 L160 200 Z" /><path d="M70 170 Q85 175 100 175 Q115 175 130 170" fill={ink} opacity=".15" /></g>) },
  { id: "o6", name: "西装", render: (c, ink) => (<g fill={c || "#2a251f"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M40 200 L40 180 Q55 172 78 170 L100 180 L122 170 Q145 172 160 180 L160 200 Z" /><path d="M78 170 L95 200 M122 170 L105 200" fill="none" /><circle cx="100" cy="192" r="1.5" fill="#fff" /></g>) },
  { id: "o7", name: "毛衣", render: (c, ink) => (<g fill={c || "#d8c4b0"} stroke={ink} strokeWidth="3" strokeLinejoin="round"><path d="M40 200 L40 182 Q55 170 80 168 Q100 178 120 168 Q145 170 160 182 L160 200 Z" /><path d="M50 188 L60 188 M70 186 L80 186 M120 186 L130 186 M140 188 L150 188" stroke={ink} strokeWidth="1" opacity=".4" fill="none" /></g>) },
  { id: "o8", name: "裸肩", render: (c, ink) => <path d="M40 200 L40 188 Q60 175 100 175 Q140 175 160 188 L160 200 Z" fill={c || "#f5dcc4"} stroke={ink} strokeWidth="3" strokeLinejoin="round" /> },
];

// ─────────────────────────────────────────────────────────────
// AVATAR CONFIG
// ─────────────────────────────────────────────────────────────
export interface AvatarConfig {
  face: string;
  eyes: string;
  eyebrows: string;
  nose: string;
  mouth: string;
  hair: string;
  beard: string;
  glasses: string;
  earrings: string;
  hat: string;
  collar: string;
  skinTone: string;
  hairColor: string;
  bgColor: string;
  clothingColor: string;
  beardColor: string | null;
}

export const DEFAULT_CONFIG: AvatarConfig = {
  face: "f1",
  eyes: "e1",
  eyebrows: "w2",
  nose: "n2",
  mouth: "m1",
  hair: "r1",
  beard: "d0",
  glasses: "g0",
  earrings: "a0",
  hat: "t0",
  collar: "o1",
  skinTone: "s2",
  hairColor: "h2",
  bgColor: "b1",
  clothingColor: "c1",
  beardColor: null,
};

// ─────────────────────────────────────────────────────────────
// PRESETS
// ─────────────────────────────────────────────────────────────
export interface Preset {
  id: string;
  name: string;
  subtitle: string;
  config: AvatarConfig;
}

export const PRESETS: Preset[] = [
  { id: "p1", name: "诗人", subtitle: "the poet", config: { face: "f5", eyes: "e2", eyebrows: "w2", nose: "n6", mouth: "m6", hair: "r8", beard: "d0", glasses: "g0", earrings: "a0", hat: "t0", collar: "o4", skinTone: "s2", hairColor: "h2", bgColor: "b2", clothingColor: "c3", beardColor: "h2" } },
  { id: "p2", name: "学者", subtitle: "the scholar", config: { face: "f2", eyes: "e3", eyebrows: "w1", nose: "n3", mouth: "m2", hair: "r1", beard: "d4", glasses: "g2", earrings: "a0", hat: "t0", collar: "o3", skinTone: "s3", hairColor: "h6", bgColor: "b3", clothingColor: "c5", beardColor: "h6" } },
  { id: "p3", name: "画家", subtitle: "the painter", config: { face: "f8", eyes: "e3", eyebrows: "w2", nose: "n2", mouth: "m1", hair: "r11", beard: "d0", glasses: "g1", earrings: "a3", hat: "t4", collar: "o3", skinTone: "s2", hairColor: "h1", bgColor: "b6", clothingColor: "c1", beardColor: "h1" } },
  { id: "p4", name: "工程师", subtitle: "the engineer", config: { face: "f3", eyes: "e4", eyebrows: "w1", nose: "n5", mouth: "m2", hair: "r1", beard: "d1", glasses: "g5", earrings: "a0", hat: "t0", collar: "o7", skinTone: "s2", hairColor: "h2", bgColor: "b4", clothingColor: "c3", beardColor: "h2" } },
  { id: "p5", name: "舞者", subtitle: "the dancer", config: { face: "f4", eyes: "e5", eyebrows: "w3", nose: "n2", mouth: "m1", hair: "r5", beard: "d0", glasses: "g0", earrings: "a5", hat: "t0", collar: "o8", skinTone: "s4", hairColor: "h1", bgColor: "b6", clothingColor: "c1", beardColor: "h1" } },
  { id: "p6", name: "哲学家", subtitle: "the philosopher", config: { face: "f6", eyes: "e6", eyebrows: "w5", nose: "n3", mouth: "m6", hair: "r0", beard: "d4", glasses: "g1", earrings: "a0", hat: "t0", collar: "o6", skinTone: "s5", hairColor: "h1", bgColor: "b3", clothingColor: "c4", beardColor: "h1" } },
  { id: "p7", name: "朋克", subtitle: "the rebel", config: { face: "f1", eyes: "e4", eyebrows: "w3", nose: "n7", mouth: "m8", hair: "r7", beard: "d0", glasses: "g4", earrings: "a3", hat: "t0", collar: "o1", skinTone: "s1", hairColor: "h5", bgColor: "b5", clothingColor: "c4", beardColor: "h5" } },
  { id: "p8", name: "面包师", subtitle: "the baker", config: { face: "f6", eyes: "e3", eyebrows: "w2", nose: "n2", mouth: "m1", hair: "r12", beard: "d0", glasses: "g0", earrings: "a1", hat: "t7", collar: "o7", skinTone: "s2", hairColor: "h3", bgColor: "b2", clothingColor: "c5", beardColor: "h3" } },
  { id: "p9", name: "登山客", subtitle: "the climber", config: { face: "f2", eyes: "e2", eyebrows: "w2", nose: "n6", mouth: "m1", hair: "r10", beard: "d0", glasses: "g6", earrings: "a0", hat: "t2", collar: "o5", skinTone: "s3", hairColor: "h2", bgColor: "b5", clothingColor: "c2", beardColor: "h2" } },
  { id: "p10", name: "古典学者", subtitle: "the classicist", config: { face: "f5", eyes: "e3", eyebrows: "w2", nose: "n3", mouth: "m2", hair: "r9", beard: "d0", glasses: "g5", earrings: "a2", hat: "t0", collar: "o4", skinTone: "s2", hairColor: "h1", bgColor: "b3", clothingColor: "c4", beardColor: "h1" } },
];

// ─────────────────────────────────────────────────────────────
// RANDOM CONFIG
// ─────────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function randomConfig(): AvatarConfig {
  return {
    face: pick(FACES).id,
    eyes: pick(EYES).id,
    eyebrows: pick(EYEBROWS).id,
    nose: pick(NOSES).id,
    mouth: pick(MOUTHS).id,
    hair: pick(HAIRS).id,
    beard: Math.random() < 0.35 ? pick(BEARDS.filter((b) => b.id !== "d0")).id : "d0",
    glasses: Math.random() < 0.5 ? pick(GLASSES.filter((g) => g.id !== "g0")).id : "g0",
    earrings: Math.random() < 0.4 ? pick(EARRINGS.filter((a) => a.id !== "a0")).id : "a0",
    hat: Math.random() < 0.3 ? pick(HATS.filter((t) => t.id !== "t0")).id : "t0",
    collar: pick(COLLARS).id,
    skinTone: pick(SKIN_TONES).id,
    hairColor: pick(HAIR_COLORS).id,
    bgColor: pick(BG_COLORS).id,
    clothingColor: pick(CLOTHING_COLORS).id,
    beardColor: pick(HAIR_COLORS).id,
  };
}

// ─────────────────────────────────────────────────────────────
// AVATAR RENDERER
// ─────────────────────────────────────────────────────────────
interface AvatarRendererProps {
  config: AvatarConfig;
  size?: number;
  rounded?: boolean;
  showBg?: boolean;
  className?: string;
}

export function AvatarRenderer({ config, size = 280, rounded = true, showBg = true, className }: AvatarRendererProps) {
  const ink = INK;

  const skin = (SKIN_TONES.find((s) => s.id === config.skinTone) || SKIN_TONES[1]).fill;
  const hairFill = (HAIR_COLORS.find((h) => h.id === config.hairColor) || HAIR_COLORS[1]).fill;
  const bg = (BG_COLORS.find((b) => b.id === config.bgColor) || BG_COLORS[0]).fill;
  const cloth = (CLOTHING_COLORS.find((c) => c.id === config.clothingColor) || CLOTHING_COLORS[0]).fill;
  const beardFill = config.beardColor
    ? (HAIR_COLORS.find((h) => h.id === config.beardColor) || HAIR_COLORS[0]).fill
    : hairFill;

  const F = FACES.find((x) => x.id === config.face) || FACES[0];
  const E = EYES.find((x) => x.id === config.eyes) || EYES[0];
  const W = EYEBROWS.find((x) => x.id === config.eyebrows) || EYEBROWS[0];
  const N = NOSES.find((x) => x.id === config.nose) || NOSES[0];
  const M = MOUTHS.find((x) => x.id === config.mouth) || MOUTHS[0];
  const H = HAIRS.find((x) => x.id === config.hair) || HAIRS[0];
  const D = BEARDS.find((x) => x.id === config.beard) || BEARDS[0];
  const G = GLASSES.find((x) => x.id === config.glasses) || GLASSES[0];
  const A = EARRINGS.find((x) => x.id === config.earrings) || EARRINGS[0];
  const T = HATS.find((x) => x.id === config.hat) || HATS[0];
  const O = COLLARS.find((x) => x.id === config.collar) || COLLARS[0];

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", borderRadius: rounded ? "50%" : 8 }}
    >
      {showBg && <rect width="200" height="200" fill={bg} />}
      {/* ears */}
      <ellipse cx="56" cy="120" rx="7" ry="10" fill={skin} stroke={ink} strokeWidth="2.5" />
      <ellipse cx="144" cy="120" rx="7" ry="10" fill={skin} stroke={ink} strokeWidth="2.5" />
      {F.render(skin, ink)}
      {D.id === "d1" ? D.render(ink, ink) : D.render(beardFill, ink)}
      {M.render(ink)}
      {N.render(ink)}
      {E.render(ink)}
      {W.render(ink)}
      {H.render(hairFill, ink)}
      {G.render(ink)}
      {A.render("#c9a574", ink)}
      {T.render(cloth, ink)}
      {O.render(cloth, ink)}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SERIALIZE / DESERIALIZE
// ─────────────────────────────────────────────────────────────
const AVATAR_PREFIX = "avatar:";

export function serializeAvatarConfig(config: AvatarConfig): string {
  return AVATAR_PREFIX + JSON.stringify(config);
}

const AVATAR_CONFIG_KEYS: (keyof AvatarConfig)[] = [
  "face", "eyes", "eyebrows", "nose", "mouth", "hair", "beard",
  "glasses", "earrings", "hat", "collar", "skinTone", "hairColor",
  "bgColor", "clothingColor", "beardColor",
];

function isValidAvatarConfig(obj: unknown): obj is AvatarConfig {
  if (typeof obj !== "object" || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  return AVATAR_CONFIG_KEYS.every((k) =>
    k === "beardColor"
      ? rec[k] === null || typeof rec[k] === "string"
      : typeof rec[k] === "string"
  );
}

export function parseAvatarUrl(avatarUrl: string | null | undefined): AvatarConfig | null {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_PREFIX)) return null;
  try {
    const parsed = JSON.parse(avatarUrl.slice(AVATAR_PREFIX.length));
    return isValidAvatarConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
