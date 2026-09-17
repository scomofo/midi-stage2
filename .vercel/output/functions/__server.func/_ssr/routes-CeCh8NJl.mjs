import { i as __toESM } from "../_runtime.mjs";
import { L as require_react, v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Radio, c as Menu, i as RotateCcw, l as Lamp, n as Volume2, o as Play, s as Pause, t as X, u as Eye } from "../_libs/lucide-react.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CeCh8NJl.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,opacity] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none active:not-disabled:scale-[0.96]", {
	variants: {
		variant: {
			primary: "bg-accent text-accent-fg hover:brightness-110",
			secondary: "bg-elevated text-fg shadow-[0_0_0_1px_rgba(239,232,220,0.12)] hover:bg-surface",
			ghost: "bg-transparent text-muted hover:text-fg hover:bg-fg/5"
		},
		size: {
			default: "h-11 rounded-xl px-5 text-sm",
			sm: "h-9 rounded-lg px-3.5 text-xs tracking-wide",
			icon: "size-11 rounded-xl"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "default"
	}
});
function Button({ className, variant, size, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
var FEEL_PRESETS = {
	calm: {
		shake: 0,
		hitsShake: false,
		juice: .18,
		bloom: .22,
		punch: 0,
		lights: .28,
		crowd: .12,
		trails: .25,
		floaters: false,
		callouts: true
	},
	house: {
		shake: .4,
		hitsShake: false,
		juice: .85,
		bloom: .7,
		punch: .55,
		lights: .78,
		crowd: .7,
		trails: .8,
		floaters: true,
		callouts: true
	},
	arena: {
		shake: .75,
		hitsShake: true,
		juice: 1,
		bloom: 1,
		punch: 1,
		lights: 1,
		crowd: 1,
		trails: 1,
		floaters: true,
		callouts: true
	}
};
var FEEL_COPY = {
	calm: {
		label: "Calm",
		line: "Still house. Notes only."
	},
	house: {
		label: "House",
		line: "Bloom, no jolt on perfects."
	},
	arena: {
		label: "Arena",
		line: "Sparks, punch, the room moves."
	}
};
var KEY = "midi-stage-feel";
var SLIDERS = [
	"shake",
	"juice",
	"bloom",
	"punch",
	"lights",
	"crowd",
	"trails"
];
function near(a, b) {
	return Math.abs(a - b) < .03;
}
function matchFeelPreset(feel) {
	for (const name of Object.keys(FEEL_PRESETS)) {
		const p = FEEL_PRESETS[name];
		if (SLIDERS.every((k) => near(p[k], feel[k])) && p.hitsShake === feel.hitsShake && p.floaters === feel.floaters && p.callouts === feel.callouts) return name;
	}
	return "custom";
}
function withPreset(name) {
	return {
		preset: name,
		...FEEL_PRESETS[name]
	};
}
function loadFeel() {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return withPreset("house");
		const parsed = JSON.parse(raw);
		const house = FEEL_PRESETS.house;
		const next = {
			...withPreset("house"),
			...parsed,
			shake: clamp01(Number(parsed.shake)),
			juice: clamp01(Number(parsed.juice)),
			bloom: clamp01(Number(parsed.bloom)),
			punch: clamp01(Number(parsed.punch ?? house.punch)),
			lights: clamp01(Number(parsed.lights ?? house.lights)),
			crowd: clamp01(Number(parsed.crowd ?? house.crowd)),
			trails: clamp01(Number(parsed.trails ?? house.trails)),
			hitsShake: Boolean(parsed.hitsShake),
			floaters: parsed.floaters !== false,
			callouts: parsed.callouts !== false
		};
		next.preset = matchFeelPreset(next);
		return next;
	} catch {
		return withPreset("house");
	}
}
function saveFeel(feel) {
	try {
		localStorage.setItem(KEY, JSON.stringify(feel));
	} catch {}
}
function clamp01(n) {
	if (!Number.isFinite(n)) return .5;
	return Math.min(1, Math.max(0, n));
}
var PRESETS = [
	"calm",
	"house",
	"arena"
];
function SliderRow({ label, value, onChange, onPreview }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex flex-col gap-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center justify-between text-[10px] font-semibold tracking-[0.16em] text-muted",
			children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono tabular-nums text-fg",
				children: Math.round(value * 100)
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type: "range",
			min: 0,
			max: 100,
			value: Math.round(value * 100),
			"aria-label": label,
			className: "feel-range",
			onChange: (e) => onChange(Number(e.target.value) / 100),
			onPointerUp: onPreview,
			onKeyUp: onPreview,
			suppressHydrationWarning: true
		})]
	});
}
function ToggleRow({ label, hint, on, onToggle }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		"aria-pressed": on,
		onClick: onToggle,
		className: cn("flex min-h-11 items-center justify-between rounded-lg px-3 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.1)]", on ? "bg-elevated" : "bg-surface"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
			className: "block text-[13px] font-medium",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mt-0.5 block text-[11px] text-muted",
			children: hint
		})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[10px] tracking-[0.14em] text-accent",
			children: on ? "ON" : "OFF"
		})]
	});
}
function LiveMeter({ label, value, tone }) {
	const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-1.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center justify-between text-[10px] font-semibold tracking-[0.16em] text-muted",
			children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono tabular-nums text-fg",
				children: pct
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "feel-meter",
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
				className: tone === "tungsten" ? "tungsten" : void 0,
				style: { transform: `scaleX(${pct / 100})` }
			})
		})]
	});
}
function Section({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-[10px] font-semibold tracking-[0.16em] text-subtle",
			children: title
		}), children]
	});
}
function FeelPanel({ feel, reduced, tapping, live, onChange, onPreview, onToggleTap, onClose }) {
	function patch(partial) {
		const next = {
			...feel,
			...partial
		};
		onChange({
			...next,
			preset: matchFeelPreset(next)
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full min-h-0 flex-col",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3 px-5 pt-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[10px] font-semibold tracking-[0.2em] text-accent",
						children: "THE ROOM"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						id: "room-title",
						className: "font-display mt-1 text-[1.7rem] font-semibold tracking-[-0.04em]",
						children: "How the house answers."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-[34ch] text-[13px] leading-relaxed text-muted text-pretty",
						children: "Drag a fader and watch the stage. Hits keep tapping so you can hear the room without playing."
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "icon",
					variant: "ghost",
					className: "size-11 shrink-0",
					"aria-label": "Close the room",
					onClick: onClose,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-5" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-3 gap-2",
						children: PRESETS.map((name) => {
							const active = feel.preset === name;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								"aria-pressed": active,
								onClick: () => {
									onChange(withPreset(name));
									onPreview("perfect");
								},
								className: cn("rounded-xl px-2 py-3 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.1)] transition-[background,box-shadow] duration-150", active ? "bg-elevated shadow-[0_0_0_1px_rgba(143,212,196,0.45)]" : "bg-surface hover:bg-elevated"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
									className: "block text-[13px] font-medium",
									children: FEEL_COPY[name].label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mt-1 block text-[10px] leading-snug text-muted",
									children: FEEL_COPY[name].line
								})]
							}, name);
						})
					}),
					feel.preset === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-[10px] tracking-[0.16em] text-tungsten",
						children: "CUSTOM MIX"
					}) : null,
					reduced ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "rounded-lg bg-surface px-3 py-2 text-[12px] leading-relaxed text-muted shadow-[0_0_0_1px_rgba(239,232,220,0.08)]",
						children: "Your system asked for less motion. Sparks and shake stay off."
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-3 rounded-lg bg-surface px-3 py-3 shadow-[0_0_0_1px_rgba(239,232,220,0.08)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMeter, {
							label: "LIVE BLOOM",
							value: live.bloom,
							tone: "accent"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveMeter, {
							label: "LIVE SHAKE",
							value: live.trauma,
							tone: "tungsten"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
						label: "Keep tapping",
						hint: "The stage hits itself on the beat so you can watch.",
						on: tapping,
						onToggle: onToggleTap
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
						title: "THE HOUSE",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-1 gap-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRow, {
									label: "LIGHTS",
									value: feel.lights,
									onChange: (lights) => patch({ lights })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRow, {
									label: "CROWD",
									value: feel.crowd,
									onChange: (crowd) => patch({ crowd })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRow, {
									label: "TRAILS",
									value: feel.trails,
									onChange: (trails) => patch({ trails })
								})
							]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
						title: "THE HIT",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-1 gap-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRow, {
									label: "SPARKS",
									value: feel.juice,
									onChange: (juice) => patch({ juice }),
									onPreview: () => onPreview("perfect")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRow, {
									label: "BLOOM",
									value: feel.bloom,
									onChange: (bloom) => patch({ bloom }),
									onPreview: () => onPreview("perfect")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRow, {
									label: "PUNCH",
									value: feel.punch,
									onChange: (punch) => patch({ punch }),
									onPreview: () => onPreview("perfect")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRow, {
									label: "SHAKE",
									value: feel.shake,
									onChange: (shake) => patch({ shake }),
									onPreview: () => onPreview(feel.hitsShake ? "perfect" : "miss")
								})
							]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
						title: "THE HUD",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
									label: "Pocket hits shake",
									hint: "Off keeps perfects planted. On is the arena jolt.",
									on: feel.hitsShake,
									onToggle: () => {
										patch({ hitsShake: !feel.hitsShake });
										onPreview(!feel.hitsShake ? "perfect" : "miss");
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
									label: "Score floaters",
									hint: "The +n that lifts off the strike line.",
									on: feel.floaters,
									onToggle: () => {
										patch({ floaters: !feel.floaters });
										onPreview("perfect");
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
									label: "Grade callouts",
									hint: "PERFECT / GREAT sitting over the highway.",
									on: feel.callouts,
									onToggle: () => {
										patch({ callouts: !feel.callouts });
										onPreview("perfect");
									}
								})
							]
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2 border-t border-border bg-bg px-5 py-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					className: "flex-1",
					onClick: () => onPreview("perfect"),
					children: "Try a perfect"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					className: "flex-1",
					onClick: () => onPreview("miss"),
					children: "Try a miss"
				})]
			})
		]
	});
}
var START = 48;
var END = 72;
function isBlack(pc) {
	return ![
		0,
		2,
		4,
		5,
		7,
		9,
		11
	].includes(pc);
}
function whiteIndex(midi) {
	let n = 0;
	for (let m = START; m < midi; m++) if (!isBlack(m % 12)) n++;
	return n;
}
var WHITE_COUNT = (() => {
	let n = 0;
	for (let m = START; m < END; m++) if (!isBlack(m % 12)) n++;
	return n;
})();
var NAMES = [
	"C",
	"C♯",
	"D",
	"D♯",
	"E",
	"F",
	"F♯",
	"G",
	"G♯",
	"A",
	"A♯",
	"B"
];
function Key({ midi, className, style, interactive, onPlay, onRelease }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		tabIndex: interactive ? 0 : -1,
		"aria-label": `${NAMES[midi % 12]} ${Math.floor(midi / 12) - 1}`,
		className,
		style,
		onPointerDown: (e) => {
			if (!interactive) return;
			e.preventDefault();
			e.currentTarget.setPointerCapture?.(e.pointerId);
			onPlay?.(midi);
		},
		onPointerUp: () => interactive && onRelease?.(midi),
		onPointerCancel: () => interactive && onRelease?.(midi)
	});
}
function PianoGuide({ expected, sounding, wrong, approaching, interactive = false, onPlay, onRelease }) {
	const whites = [];
	const blacks = [];
	for (let m = START; m < END; m++) if (isBlack(m % 12)) blacks.push(m);
	else whites.push(m);
	const cls = (midi, black) => cn("pkey", black && "black", approaching?.has(midi) && "soon", expected.has(midi) && "expected", sounding.has(midi) && "sounding", wrong.has(midi) && "wrong", interactive && "live");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "piano w-full",
		"aria-hidden": !interactive,
		children: [whites.map((midi) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Key, {
			midi,
			className: cls(midi, false),
			interactive,
			onPlay,
			onRelease
		}, midi)), blacks.map((midi) => {
			const left = (whiteIndex(midi) + .72) / WHITE_COUNT * 100;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Key, {
				midi,
				className: cls(midi, true),
				style: { left: `${left}%` },
				interactive,
				onPlay,
				onRelease
			}, midi);
		})]
	});
}
function sourceForSafe(song, player) {
	return song.parts.find((p) => p.id === player.source) || song.parts.find((p) => p.type === player.type) || song.parts[0];
}
var AudioEngine = class {
	ctx = null;
	master = null;
	buses = {};
	nodes = /* @__PURE__ */ new Set();
	origin = 0;
	speed = 1;
	running = false;
	events = [];
	cursor = 0;
	timer = null;
	volume = .55;
	monitorVoices = /* @__PURE__ */ new Map();
	waves = {};
	noise = null;
	generation = 0;
	song = null;
	async init() {
		if (!this.ctx) {
			const AC = window.AudioContext || window.webkitAudioContext;
			if (!AC) throw new Error("Web Audio is unavailable in this browser.");
			this.ctx = new AC({ latencyHint: "interactive" });
			this.master = this.ctx.createGain();
			this.master.gain.value = this.volume * .5;
			const limiter = this.ctx.createDynamicsCompressor();
			limiter.threshold.value = -12;
			limiter.knee.value = 8;
			limiter.ratio.value = 12;
			limiter.attack.value = .003;
			limiter.release.value = .15;
			this.master.connect(limiter);
			limiter.connect(this.ctx.destination);
			for (const name of [
				"backing",
				"monitor",
				"guide"
			]) {
				const bus = this.ctx.createGain();
				bus.gain.value = name === "monitor" ? .9 : 1;
				bus.connect(this.master);
				this.buses[name] = bus;
			}
			if (this.ctx.createPeriodicWave) for (const [type, p] of Object.entries({
				keys: [
					0,
					1,
					.33,
					.16,
					.06,
					.025
				],
				guitar: [
					0,
					1,
					.65,
					.36,
					.22,
					.13,
					.08
				],
				bass: [
					0,
					1,
					.42,
					.17,
					.08
				]
			})) this.waves[type] = this.ctx.createPeriodicWave(new Float32Array(p.length), Float32Array.from(p));
			this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
			const a = this.noise.getChannelData(0);
			let seed = 12553;
			for (let i = 0; i < a.length; i++) {
				seed = Math.imul(seed, 1664525) + 1013904223 | 0;
				a[i] = (seed >>> 0) / 2147483648 - 1;
			}
		}
		if (this.ctx.state === "suspended") await this.ctx.resume();
		if (this.ctx.state !== "running") throw new Error("Audio could not start. Click Start again.");
	}
	setVolume(v) {
		this.volume = v;
		if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * .5, this.ctx.currentTime, .02);
	}
	contextAt(stamp = performance.now()) {
		if (!this.ctx) return 0;
		const ts = this.ctx.getOutputTimestamp?.();
		if (ts && typeof ts.contextTime === "number" && ts.contextTime > 0 && typeof ts.performanceTime === "number" && ts.performanceTime > 0) return ts.contextTime + (stamp - ts.performanceTime) / 1e3;
		return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0) + (stamp - performance.now()) / 1e3;
	}
	songAt(stamp = performance.now()) {
		return (this.contextAt(stamp) - this.origin) * this.speed;
	}
	track(source, gain, filter) {
		const voice = {
			source,
			gain,
			stopped: false,
			stop: () => {
				if (voice.stopped || !this.ctx) return;
				voice.stopped = true;
				try {
					gain.gain.cancelScheduledValues(this.ctx.currentTime);
					gain.gain.setTargetAtTime(1e-4, this.ctx.currentTime, .012);
					source.stop(this.ctx.currentTime + .05);
				} catch {}
			}
		};
		this.nodes.add(voice);
		source.onended = () => {
			this.nodes.delete(voice);
			try {
				source.disconnect();
				gain.disconnect();
				filter?.disconnect();
			} catch {}
		};
		return voice;
	}
	tone(type, pitch, velocity = 90, at, duration = .3, level = 1, destination) {
		const ctx = this.ctx;
		const start = Math.max(ctx.currentTime, at ?? ctx.currentTime);
		const dest = destination || this.buses.backing || this.master;
		const v = Math.max(.01, velocity / 127) * level;
		if (type === "drums") return this.drum(pitch, v, start, dest);
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		const filter = ctx.createBiquadFilter();
		const freq = 440 * Math.pow(2, (pitch - 69) / 12);
		osc.type = type === "bass" || type === "guitar" ? "sawtooth" : "triangle";
		osc.frequency.value = freq;
		const wave = this.waves[type];
		if (wave) osc.setPeriodicWave(wave);
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(type === "bass" ? 700 : type === "guitar" ? 2200 : 4e3, start);
		filter.frequency.exponentialRampToValueAtTime(type === "bass" ? 160 : 900, start + Math.min(duration, .35));
		filter.Q.value = .5;
		const sustain = Math.max(.06, Math.min(duration, 10));
		const amp = v * (type === "bass" ? .2 : type === "guitar" ? .095 : .23);
		const attack = type === "guitar" ? .003 : type === "bass" ? .008 : .005;
		const tail = type === "bass" ? .15 : .24;
		const body = type === "keys" ? .32 : type === "guitar" ? .24 : .58;
		gain.gain.setValueAtTime(1e-4, start);
		gain.gain.exponentialRampToValueAtTime(Math.max(2e-4, amp), start + attack);
		gain.gain.exponentialRampToValueAtTime(Math.max(2e-4, amp * body), start + Math.min(.12, sustain));
		gain.gain.setValueAtTime(Math.max(2e-4, amp * body * .8), start + sustain);
		gain.gain.exponentialRampToValueAtTime(1e-4, start + sustain + tail);
		osc.connect(filter);
		filter.connect(gain);
		gain.connect(dest);
		const voice = this.track(osc, gain, filter);
		osc.start(start);
		osc.stop(start + sustain + tail + .01);
		return voice;
	}
	drum(pitch, v, start, destination) {
		const ctx = this.ctx;
		let freq;
		let duration;
		let kind;
		if ([35, 36].includes(pitch)) {
			freq = 150;
			duration = .27;
			kind = "kick";
		} else if ([
			37,
			38,
			39,
			40
		].includes(pitch)) {
			freq = 1500;
			duration = .15;
			kind = "noise";
		} else if ([
			41,
			43,
			45,
			47,
			48,
			50
		].includes(pitch)) {
			freq = 95 + (pitch - 41) * 15;
			duration = .24;
			kind = "tom";
		} else {
			freq = [
				49,
				52,
				55,
				57
			].includes(pitch) ? 5e3 : 8e3;
			duration = [
				49,
				52,
				55,
				57
			].includes(pitch) ? .6 : pitch === 46 ? .28 : .075;
			kind = "metal";
		}
		const gain = ctx.createGain();
		const filter = ctx.createBiquadFilter();
		let source;
		if (kind === "kick" || kind === "tom") {
			const osc = ctx.createOscillator();
			osc.type = "sine";
			osc.frequency.setValueAtTime(freq, start);
			osc.frequency.exponentialRampToValueAtTime(kind === "kick" ? 45 : freq * .55, start + duration);
			filter.type = "lowpass";
			filter.frequency.value = 1e3;
			source = osc;
		} else {
			const buf = ctx.createBufferSource();
			buf.buffer = this.noise;
			filter.type = kind === "metal" ? "highpass" : "bandpass";
			filter.frequency.value = freq;
			filter.Q.value = .55;
			source = buf;
		}
		const amp = v * (kind === "kick" ? .65 : kind === "metal" ? .18 : .36);
		gain.gain.setValueAtTime(Math.max(2e-4, amp), start);
		gain.gain.exponentialRampToValueAtTime(1e-4, start + duration);
		source.connect(filter);
		filter.connect(gain);
		gain.connect(destination);
		const voice = this.track(source, gain, filter);
		source.start(start);
		source.stop(start + duration + .01);
		return voice;
	}
	click(at, accent = false) {
		if (!this.ctx || !this.master) return;
		const start = Math.max(at, this.ctx.currentTime);
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = "sine";
		osc.frequency.value = accent ? 1400 : 1e3;
		gain.gain.setValueAtTime(.15, start);
		gain.gain.exponentialRampToValueAtTime(1e-4, start + .045);
		osc.connect(gain);
		gain.connect(this.master);
		this.track(osc, gain);
		osc.start(start);
		osc.stop(start + .05);
	}
	async begin(opts) {
		this.stop();
		const ticket = this.generation;
		await this.init();
		if (ticket !== this.generation) return;
		const { song, players, speed } = opts;
		const seek = opts.seek ?? 0;
		const end = opts.end ?? song.duration;
		const countIn = opts.countIn !== false;
		this.speed = speed;
		this.song = song;
		const beat = 60 / song.bpm;
		const pre = countIn ? 4 * beat / speed : .12;
		this.origin = this.ctx.currentTime + .12 + pre - seek / speed;
		this.events = [];
		if (countIn) for (let i = 4; i > 0; i--) this.events.push({
			time: seek - i * beat,
			click: true,
			accent: i === 4
		});
		if (opts.metronome) {
			for (const b of song.beats) if (b.time >= seek && b.time < end) this.events.push({
				time: b.time,
				click: true,
				accent: b.bar
			});
		}
		const enabled = new Set(players.filter((p) => p.enabled).map((p) => sourceForSafe(song, p).id));
		for (const part of song.parts) {
			const selected = enabled.has(part.id);
			if (selected && !opts.guide && !opts.demo) continue;
			const type = players.find((p) => p.enabled && sourceForSafe(song, p).id === part.id)?.type || part.type;
			const destination = selected ? this.buses.guide : this.buses.backing;
			for (const n of part.notes) if (n.time >= seek - 1e-6 && n.time < end) this.events.push({
				...n,
				type,
				destination,
				level: selected ? .42 : .65,
				duration: Math.min(n.duration, end - n.time) / speed
			});
		}
		this.events.sort((a, b) => a.time - b.time);
		this.cursor = 0;
		this.running = true;
		this.schedule();
		this.timer = setInterval(() => this.schedule(), 25);
	}
	schedule() {
		if (!this.running || !this.ctx) return;
		const until = (this.ctx.currentTime + .12 - this.origin) * this.speed;
		while (this.cursor < this.events.length && this.events[this.cursor].time <= until) {
			const e = this.events[this.cursor++];
			const at = this.origin + e.time / this.speed;
			if (at < this.ctx.currentTime - .07) continue;
			if (e.click) this.click(at, e.accent);
			else if (e.type != null && e.pitch != null) this.tone(e.type, e.pitch, e.velocity, at, e.duration, e.level, e.destination);
		}
	}
	stop() {
		this.generation++;
		this.running = false;
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		for (const n of [...this.nodes]) n.stop();
		this.monitorVoices.clear();
	}
	monitor(token, type, pitch, velocity, duration = 1) {
		if (!this.ctx || this.ctx.state !== "running") return;
		this.release(token);
		const v = this.tone(type, pitch, velocity, this.ctx.currentTime, duration, .85, this.buses.monitor);
		if (type !== "drums") this.monitorVoices.set(token, v);
	}
	release(token) {
		const v = this.monitorVoices.get(token);
		if (v) {
			v.stop();
			this.monitorVoices.delete(token);
		}
	}
};
var INSTRUMENTS = [
	"drums",
	"keys",
	"guitar",
	"bass"
];
var LABELS = {
	drums: "Drums",
	keys: "Keys",
	guitar: "Guitar",
	bass: "Bass"
};
function emptyParts() {
	return INSTRUMENTS.map((type, i) => ({
		id: type,
		name: LABELS[type],
		type,
		channel: type === "drums" ? 10 : i,
		notes: []
	}));
}
function beats(duration, beat) {
	const out = [];
	for (let t = 0, i = 0; t <= duration + 1e-6; t += beat, i++) out.push({
		time: t,
		bar: i % 4 === 0
	});
	return out;
}
function makeOpenStage(difficulty = "standard") {
	const bpm = 96;
	const beat = 60 / bpm;
	const parts = emptyParts();
	const byType = Object.fromEntries(parts.map((p) => [p.type, p]));
	const add = (type, b, pitch, duration, velocity = 90) => {
		byType[type].notes.push({
			time: b * beat,
			duration: duration * beat,
			pitch,
			velocity
		});
	};
	const addChord = (b, pitches, duration) => {
		for (const pitch of pitches) add("keys", b, pitch, duration, difficulty === "expert" ? 88 : 82);
	};
	const form = [
		{
			name: "INTRO",
			style: "intro",
			chords: [
				"C",
				"G",
				"Am",
				"F"
			]
		},
		{
			name: "VERSE",
			style: "verse",
			chords: [
				"C",
				"G",
				"Am",
				"F",
				"C",
				"G",
				"Am",
				"F"
			]
		},
		{
			name: "CHORUS",
			style: "chorus",
			chords: [
				"F",
				"C",
				"G",
				"Am",
				"F",
				"C",
				"G",
				"G"
			]
		},
		{
			name: "BRIDGE",
			style: "bridge",
			chords: [
				"Dm",
				"Am",
				"F",
				"G"
			]
		},
		{
			name: "FINAL CHORUS",
			style: "chorus",
			chords: [
				"F",
				"C",
				"G",
				"Am",
				"F",
				"C",
				"G",
				"G"
			]
		},
		{
			name: "OUTRO",
			style: "outro",
			chords: [
				"F",
				"G",
				"C",
				"C"
			]
		}
	];
	const harmonyMap = {
		C: {
			root: 48,
			triad: [
				60,
				64,
				67
			],
			inversion: [
				60,
				64,
				67
			],
			rich: [
				48,
				60,
				64,
				67,
				71
			],
			roman: "I"
		},
		G: {
			root: 43,
			triad: [
				55,
				59,
				62
			],
			inversion: [
				59,
				62,
				67
			],
			rich: [
				43,
				59,
				62,
				65,
				67
			],
			roman: "V"
		},
		Am: {
			root: 45,
			triad: [
				57,
				60,
				64
			],
			inversion: [
				60,
				64,
				69
			],
			rich: [
				45,
				60,
				64,
				67,
				69
			],
			roman: "vi"
		},
		F: {
			root: 41,
			triad: [
				53,
				57,
				60
			],
			inversion: [
				57,
				60,
				65
			],
			rich: [
				41,
				57,
				60,
				64,
				65
			],
			roman: "IV"
		},
		Dm: {
			root: 50,
			triad: [
				62,
				65,
				69
			],
			inversion: [
				57,
				62,
				65
			],
			rich: [
				50,
				57,
				60,
				62,
				65
			],
			roman: "ii"
		}
	};
	const sections = [];
	const harmony = [];
	let bar = 0;
	for (const section of form) {
		sections.push({
			time: bar * 4 * beat,
			name: section.name
		});
		for (let index = 0; index < section.chords.length; index++, bar++) {
			const b = bar * 4;
			const name = section.chords[index];
			const h = harmonyMap[name];
			const finalBar = section.style === "outro" && index === 3;
			const chorus = section.style === "chorus";
			harmony.push({
				time: b * beat,
				duration: 4 * beat,
				name,
				roman: h.roman
			});
			if (finalBar) {
				add("drums", b, 36, .15, 104);
				add("drums", b, 49, 1.6, 92);
				add("bass", b, h.root - 12, 3.3, 96);
				add("guitar", b, h.root + 12, 3.3, 78);
				addChord(b, difficulty === "expert" ? [
					48,
					60,
					64,
					67
				] : [
					60,
					64,
					67
				], 3.3);
				continue;
			}
			const light = section.style === "intro" || section.style === "bridge";
			add("drums", b, 36, .12, 98);
			add("drums", b + 2, 36, .12, 94);
			add("drums", b + 1, 38, .12, light ? 68 : 96);
			add("drums", b + 3, 38, .12, light ? 72 : 99);
			for (let i = 0; i < (light ? 4 : 8); i++) add("drums", b + i * (light ? 1 : .5), chorus ? 51 : 42, .1, i % 2 ? 57 : 73);
			if (index === 0) add("drums", b, 49, .5, 85);
			if (!light && index === section.chords.length - 1) for (let i = 0; i < 3; i++) add("drums", b + 3.25 + i * .25, [
				48,
				45,
				43
			][i], .1, 82 + i * 5);
			add("bass", b, h.root - 12, 1.7, 95);
			add("bass", b + 2, h.root - 12, 1.15, 90);
			if (chorus) add("bass", b + 3.5, h.root - 5, .35, 82);
			const third = name.endsWith("m") ? 3 : 4;
			const guitarPitches = [
				h.root + 12,
				h.root + 19,
				h.root + 12 + third
			];
			(light ? [.5, 2.5] : [
				.5,
				2,
				3
			]).forEach((offset, i) => add("guitar", b + offset, guitarPitches[i], light ? .7 : .6, 74 + i * 4));
			if (difficulty === "chill") {
				const pitches = chorus ? h.triad : [h.root + 12, h.root + 19];
				for (const offset of chorus ? [0, 2] : [0]) addChord(b + offset, pitches, chorus ? 1.5 : 3.15);
			} else if (difficulty === "standard") {
				const pitches = chorus ? h.inversion : h.triad;
				const turn = index % 4 === 3 && section.style !== "intro";
				addChord(b, pitches, 1.5);
				addChord(b + 2, pitches, turn ? .7 : 1.5);
				if (turn) {
					add("keys", b + 3, h.root + 19, .32, 76);
					add("keys", b + 3.5, h.root + 21, .32, 72);
				}
			} else {
				const off = section.style === "intro" ? [0, 2.5] : chorus ? [
					0,
					.75,
					2,
					2.75
				] : [
					0,
					1.5,
					3
				];
				const turn = index % 2 === 1;
				for (let i = 0; i < off.length; i++) {
					const offset = off[i];
					const next = off[i + 1] ?? (turn ? 3.5 : 4);
					addChord(b + offset, h.rich, Math.min(1.2, next - offset - .2));
				}
				if (turn) {
					add("keys", b + 3.5, h.root + 19, .16, 80);
					add("keys", b + 3.75, h.root + 21, .16, 76);
				}
			}
		}
	}
	for (const part of parts) part.notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch);
	const duration = bar * 4 * beat;
	const description = {
		chill: "Open fifths and easy triads. One chord per bar, two in the chorus.",
		standard: "Triads, smooth inversions, and short single-note turnarounds.",
		expert: "Seventh chords, left-hand roots, syncopation, and melodic pickups."
	}[difficulty];
	return {
		id: "open-stage",
		name: "Open Stage",
		subtitle: "Your first chord set. Find the pocket, then lift the chorus.",
		tag: "CHORD ROCK",
		bpm,
		duration,
		original: true,
		parts,
		beats: beats(duration, beat),
		sections,
		harmony,
		arrangement: difficulty,
		arrangementDescription: description,
		key: "C major",
		art: "open"
	};
}
function makePocketSong(id) {
	const info = [
		{
			id: "neon-circuit",
			name: "Neon Circuit",
			subtitle: "A driving pocket. A little electricity.",
			bpm: 112,
			bars: 32,
			tag: "SYNTH ROCK",
			art: "circuit"
		},
		{
			id: "after-hours",
			name: "After Hours",
			subtitle: "Room to breathe. Space to find your groove.",
			bpm: 88,
			bars: 24,
			tag: "DOWNTEMPO",
			art: "hours"
		},
		{
			id: "voltage-run",
			name: "Voltage Run",
			subtitle: "Fast hands, tight fills, no holding back.",
			bpm: 144,
			bars: 32,
			tag: "HIGH ENERGY",
			art: "voltage"
		}
	][id];
	const beat = 60 / info.bpm;
	const parts = emptyParts();
	const add = (type, b, p, d = .18, v = 100) => {
		parts.find((x) => x.type === type).notes.push({
			time: b * beat,
			duration: d * beat,
			pitch: p,
			velocity: v
		});
	};
	const roots = [
		0,
		4,
		3,
		1
	];
	const scale = [
		60,
		62,
		64,
		67,
		69
	];
	for (let bar = 0; bar < info.bars; bar++) {
		const b = bar * 4;
		const r = roots[Math.floor(bar / 4) % 4];
		const root = scale[r];
		add("drums", b, 36);
		add("drums", b + 2, 36);
		if (bar % 2 && id !== 1) add("drums", b + 2.5, 36, .15, 87);
		add("drums", b + 1, 38);
		add("drums", b + 3, 38);
		for (let h = 0; h < 8; h++) if (id !== 1 || h % 2 === 0) add("drums", b + h / 2, bar >= 16 && bar < 24 ? 51 : 42, .12, h % 2 ? 64 : 83);
		if (bar % 8 === 0) add("drums", b, 49, .7, 95);
		if (bar % 8 === 7) for (let f = 0; f < 4; f++) add("drums", b + 3 + f * .25, [
			48,
			47,
			45,
			43
		][f], .14, 82 + f * 5);
		for (let k = 0; k < 4; k++) add("keys", b + k, scale[(r + [
			0,
			2,
			4,
			2
		][k]) % 5], k === 3 ? .75 : .65, 78);
		if (bar % 4 === 2) {
			add("keys", b, scale[(r + 2) % 5] + 12, 1.65, 61);
			add("keys", b + 2, scale[(r + 4) % 5] + 12, 1.6, 63);
		}
		for (let g = 0; g < 4; g++) add("guitar", b + g, scale[(r + (g === 3 ? 2 : 0)) % 5] - 12, g === 3 ? .7 : .5, 84);
		if (bar % 4 === 3) add("guitar", b + 3.5, scale[(r + 1) % 5] - 12, .35, 78);
		for (let k = 0; k < (id === 2 ? 4 : 2); k++) add("bass", b + k * (id === 2 ? 1 : 2), root - 24, id === 2 ? .8 : 1.7, 95);
	}
	parts.forEach((p) => p.notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch));
	const duration = info.bars * 4 * beat;
	return {
		...info,
		duration,
		original: true,
		parts,
		beats: beats(duration, beat),
		sections: [
			{
				time: 0,
				name: "INTRO"
			},
			{
				time: 32 * beat,
				name: "IN THE POCKET"
			},
			{
				time: 64 * beat,
				name: "TURN IT UP"
			},
			{
				time: 96 * beat,
				name: "BRING IT HOME"
			}
		].filter((x) => x.time < duration),
		arrangementDescription: "Difficulty changes timing windows. The arrangement stays the same."
	};
}
function makeFirstRehearsal() {
	const bpm = 96;
	const beat = 60 / bpm;
	const bars = 8;
	const parts = emptyParts();
	const add = (type, b, pitch, d = .12, velocity = 95) => {
		parts.find((p) => p.type === type).notes.push({
			time: b * beat,
			pitch,
			duration: d * beat,
			velocity
		});
	};
	for (let bar = 0; bar < bars; bar++) {
		const b = bar * 4;
		for (let i = 0; i < 4; i++) {
			add("drums", b + i, i % 2 ? 38 : 36);
			add("drums", b + i, 42, .1, 64);
		}
		add("keys", b, 64, 1.5);
		add("keys", b + 2, 67, 1.5);
		const riff = bar % 4 === 3 ? [
			40,
			40,
			43,
			40
		] : [
			40,
			43,
			45,
			47
		];
		if (bar % 4 === 2) {
			add("guitar", b, 40, 1.65);
			add("guitar", b + 2, 43, 1.65);
			add("bass", b, 28, 1.65);
			add("bass", b + 2, 31, 1.65);
		} else for (let i = 0; i < 4; i++) {
			add("guitar", b + i, riff[i], .68);
			add("bass", b + i, riff[i] - 12, .68);
		}
	}
	parts.forEach((p) => p.notes.sort((a, b) => a.time - b.time || a.pitch - b.pitch));
	const duration = 32 * beat;
	return {
		id: "first-rehearsal",
		name: "First Rehearsal",
		subtitle: "Four instruments. One clean take.",
		tag: "BAND CHECK",
		bpm,
		duration,
		original: true,
		parts,
		beats: beats(duration, beat),
		sections: [
			{
				time: 0,
				name: "SINGLE NOTES"
			},
			{
				time: 8 * beat,
				name: "HOLD THE NOTE"
			},
			{
				time: 12 * beat,
				name: "REPEATED PLUCKS"
			},
			{
				time: 16 * beat,
				name: "BRING IT TOGETHER"
			}
		],
		arrangementDescription: "A short band check. Difficulty only changes timing windows.",
		art: "rehearsal"
	};
}
function catalog(difficulty) {
	return [
		makeOpenStage(difficulty),
		makeFirstRehearsal(),
		makePocketSong(0),
		makePocketSong(1),
		makePocketSong(2)
	];
}
var PC = [
	"C",
	"C♯",
	"D",
	"D♯",
	"E",
	"F",
	"F♯",
	"G",
	"G♯",
	"A",
	"A♯",
	"B"
];
var LANE_COLORS = [
	"#e07a7a",
	"#e0b27a",
	"#7ecfc0",
	"#8aa4c4",
	"#d4c4a8",
	"#9bb0a8",
	"#c48a7a",
	"#a8c4b8"
];
var DRUMS = [
	{
		name: "KICK",
		short: "KICK",
		notes: [35, 36],
		pitch: 36,
		pc: 0,
		color: LANE_COLORS[1]
	},
	{
		name: "SNARE",
		short: "SNR",
		notes: [
			37,
			38,
			39,
			40
		],
		pitch: 38,
		pc: 2,
		color: LANE_COLORS[0]
	},
	{
		name: "HI-HAT",
		short: "HAT",
		notes: [
			42,
			44,
			46
		],
		pitch: 42,
		pc: 6,
		color: LANE_COLORS[2]
	},
	{
		name: "TOMS",
		short: "TOM",
		notes: [
			41,
			43,
			45,
			47,
			48,
			50
		],
		pitch: 45,
		pc: 9,
		color: LANE_COLORS[3]
	},
	{
		name: "CRASH",
		short: "CRSH",
		notes: [
			49,
			52,
			55,
			57
		],
		pitch: 49,
		pc: 1,
		color: LANE_COLORS[4]
	},
	{
		name: "RIDE",
		short: "RIDE",
		notes: [
			51,
			53,
			59
		],
		pitch: 51,
		pc: 3,
		color: LANE_COLORS[5]
	}
];
var WINDOWS = {
	chill: [
		.07,
		.12,
		.19
	],
	standard: [
		.045,
		.09,
		.14
	],
	expert: [
		.025,
		.055,
		.09
	]
};
var KEYS = {
	drums: [
		"Space",
		"KeyD",
		"KeyF",
		"KeyG",
		"KeyH",
		"KeyJ"
	],
	keys: [
		"KeyA",
		"KeyS",
		"KeyW",
		"KeyE",
		"KeyR",
		"KeyT",
		"KeyY",
		"KeyU",
		"KeyI",
		"KeyO",
		"KeyP",
		"BracketLeft"
	],
	guitar: [
		"KeyZ",
		"KeyX",
		"KeyC",
		"KeyV",
		"KeyB",
		"KeyN",
		"KeyM",
		"Comma",
		"Period",
		"Slash",
		"Semicolon",
		"Quote"
	],
	bass: [
		"Digit1",
		"Digit2",
		"Digit3",
		"Digit4",
		"Digit5",
		"Digit6",
		"Digit7",
		"Digit8",
		"Digit9",
		"Digit0",
		"Minus",
		"Equal"
	]
};
function keyLabel(code) {
	if (code === "Space") return "SPACE";
	return code.replace(/^Key|^Digit/, "").replace("BracketLeft", "[").replace("Comma", ",").replace("Period", ".").replace("Slash", "/").replace("Semicolon", ";").replace("Quote", "'").replace("Minus", "−").replace("Equal", "=");
}
function clamp(v, a, b) {
	return Math.min(b, Math.max(a, v));
}
function pc(n) {
	return (n % 12 + 12) % 12;
}
function defaultPlayers() {
	return INSTRUMENTS.map((type) => ({
		id: type,
		type,
		label: LABELS[type],
		enabled: type === "keys",
		source: type
	}));
}
function sourceFor(song, player) {
	return song.parts.find((p) => p.id === player.source) || song.parts.find((p) => p.type === player.type) || song.parts[0];
}
function lanesFor(song, player) {
	if (player.type === "drums") return DRUMS.map((d) => ({
		...d,
		notes: [...d.notes || []]
	}));
	const part = sourceFor(song, player);
	return [...new Set(part.notes.map((n) => pc(n.pitch)))].sort((a, b) => a - b).map((p, i) => {
		const all = part.notes.filter((n) => pc(n.pitch) === p).map((n) => n.pitch).sort((a, b) => a - b);
		const pitch = all[Math.floor(all.length / 2)] || 60 + p;
		return {
			name: PC[p],
			short: PC[p],
			pitch,
			pc: p,
			color: LANE_COLORS[i % LANE_COLORS.length]
		};
	});
}
function laneForPitch(pitch, player, lanes) {
	if (player.type === "drums") return lanes.findIndex((l) => l.notes?.includes(pitch));
	return lanes.findIndex((l) => l.pc === pc(pitch));
}
var CHORD_TEMPLATES = [
	{
		suffix: "maj7",
		ints: [
			0,
			4,
			7,
			11
		]
	},
	{
		suffix: "7",
		ints: [
			0,
			4,
			7,
			10
		]
	},
	{
		suffix: "m7",
		ints: [
			0,
			3,
			7,
			10
		]
	},
	{
		suffix: "",
		ints: [
			0,
			4,
			7
		]
	},
	{
		suffix: "m",
		ints: [
			0,
			3,
			7
		]
	},
	{
		suffix: "dim",
		ints: [
			0,
			3,
			6
		]
	},
	{
		suffix: "aug",
		ints: [
			0,
			4,
			8
		]
	},
	{
		suffix: "sus2",
		ints: [
			0,
			2,
			7
		]
	},
	{
		suffix: "sus4",
		ints: [
			0,
			5,
			7
		]
	},
	{
		suffix: "5",
		ints: [0, 7]
	}
];
function chordName(pitches) {
	const set = [...new Set(pitches.map(pc))].sort((a, b) => a - b);
	if (set.length < 2 || set.length > 4) return null;
	for (let root = 0; root < 12; root++) for (const t of CHORD_TEMPLATES) {
		const want = [...new Set(t.ints.map((i) => (root + i) % 12))].sort((a, b) => a - b);
		if (want.length === set.length && want.every((p, i) => p === set[i])) return `${PC[root]}${t.suffix}`;
	}
	return null;
}
function makeChart(song, player, start = 0, end = song.duration) {
	const lanes = lanesFor(song, player);
	const notes = sourceFor(song, player).notes.filter((n) => n.time >= start - 1e-6 && n.time < end - 1e-6).map((n, id) => ({
		...n,
		id,
		lane: laneForPitch(n.pitch, player, lanes),
		duration: Math.min(n.duration, end - n.time),
		state: 0,
		hold: null
	})).filter((n) => n.lane >= 0);
	if (player.type === "keys" || player.type === "guitar") {
		const grouped = /* @__PURE__ */ new Map();
		for (const n of notes) {
			const key = Math.round(n.time * 1e3);
			const list = grouped.get(key) || [];
			list.push(n);
			grouped.set(key, list);
		}
		for (const group of grouped.values()) {
			if (group.length < 2) continue;
			const pitches = group.map((n) => n.pitch);
			const name = chordName(pitches);
			if (!name) continue;
			const laneIds = [...new Set(group.map((n) => n.lane))];
			const roman = song.harmony?.find((h) => Math.abs(h.time - group[0].time) < .08)?.roman;
			for (const n of group) {
				n.chord = true;
				n.name = name;
				n.roman = roman;
				n.lanes = laneIds;
				n.pitches = pitches;
			}
		}
	}
	return {
		lanes,
		notes
	};
}
var Judge = class {
	notes;
	lanes;
	windows;
	speed;
	drums;
	onJudge;
	cursor = 0;
	held = /* @__PURE__ */ new Map();
	activeHolds = /* @__PURE__ */ new Set();
	stats = {
		score: 0,
		combo: 0,
		maxCombo: 0,
		perfect: 0,
		great: 0,
		good: 0,
		miss: 0,
		extra: 0,
		holdBreaks: 0,
		holds: 0,
		weight: 0,
		offsets: []
	};
	demoCursor = 0;
	demoReleases = [];
	constructor(chart, opts) {
		this.notes = chart.notes.map((n) => ({
			...n,
			state: 0,
			hold: null
		}));
		this.lanes = chart.lanes;
		this.windows = WINDOWS[opts.difficulty].map((x) => x * opts.speed);
		this.speed = opts.speed;
		this.drums = opts.drums;
		this.onJudge = opts.onJudge;
	}
	get multiplier() {
		return Math.min(4, 1 + Math.floor(this.stats.combo / 10));
	}
	get accuracy() {
		const s = this.stats;
		const n = s.perfect + s.great + s.good + s.miss + s.extra;
		return n ? 100 * s.weight / n : 100;
	}
	tick(t) {
		while (this.cursor < this.notes.length && this.notes[this.cursor].time < t - this.windows[2] - 1e-8) {
			const n = this.notes[this.cursor++];
			if (!n.state) {
				n.state = 2;
				this.stats.miss++;
				this.stats.combo = 0;
				this.onJudge({
					grade: "miss",
					note: n,
					delta: 0
				});
			}
		}
		for (const n of [...this.activeHolds]) if (t >= n.time + n.duration - .065 * this.speed) this.finishHold(n, true);
	}
	hit(t, lane, token = "keyboard") {
		this.tick(t);
		let closest = null;
		let best = Infinity;
		for (let i = this.cursor; i < this.notes.length; i++) {
			const n = this.notes[i];
			if (n.time > t + this.windows[2] + 1e-8) break;
			if (n.state || n.lane !== lane) continue;
			const d = Math.abs(n.time - t);
			if (d <= this.windows[2] + 1e-8 && d < best) {
				closest = n;
				best = d;
			}
		}
		if (!closest) {
			this.stats.extra++;
			this.stats.combo = 0;
			this.onJudge({
				grade: "extra",
				lane,
				delta: 0
			});
			return null;
		}
		const grade = best <= this.windows[0] + 1e-8 ? "perfect" : best <= this.windows[1] + 1e-8 ? "great" : "good";
		const weight = {
			perfect: 1,
			great: .75,
			good: .4
		}[grade];
		closest.state = 1;
		closest.hitAt = t;
		closest.grade = grade;
		this.stats[grade]++;
		this.stats.weight += weight;
		this.stats.combo++;
		this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
		const gained = Math.round(100 * weight * this.multiplier);
		this.stats.score += gained;
		this.stats.offsets.push((t - closest.time) / this.speed * 1e3);
		if (!this.drums && closest.duration / this.speed >= .35) {
			closest.hold = "held";
			closest.token = token;
			closest.holdMultiplier = this.multiplier;
			this.activeHolds.add(closest);
			if (!this.held.has(token)) this.held.set(token, /* @__PURE__ */ new Set());
			this.held.get(token).add(closest);
		}
		this.onJudge({
			grade,
			note: closest,
			delta: (t - closest.time) / this.speed * 1e3,
			score: gained
		});
		return closest;
	}
	finishHold(n, success) {
		if (n.hold !== "held") return;
		n.hold = success ? "complete" : "broken";
		this.activeHolds.delete(n);
		const set = this.held.get(n.token || "");
		if (set) {
			set.delete(n);
			if (!set.size) this.held.delete(n.token || "");
		}
		if (success) {
			this.stats.holds++;
			this.stats.score += 50 * (n.holdMultiplier || 1);
		} else {
			this.stats.holdBreaks++;
			this.stats.combo = 0;
			this.onJudge({
				grade: "release",
				note: n,
				delta: 0
			});
		}
	}
	release(token, t) {
		for (const n of [...this.held.get(token) || []]) this.finishHold(n, t >= n.time + n.duration - .09 * this.speed);
	}
	finish(t) {
		this.tick(t + this.windows[2] + .001);
		return {
			...this.stats,
			accuracy: this.accuracy,
			total: this.notes.length
		};
	}
	advanceDemo(t, playerId) {
		const releaseThrough = (at) => {
			for (let k = this.demoReleases.length - 1; k >= 0; k--) if (this.demoReleases[k].at <= at) {
				const r = this.demoReleases.splice(k, 1)[0];
				this.release(r.token, r.at);
			}
		};
		while (this.demoCursor < this.notes.length && this.notes[this.demoCursor].time <= t) {
			const n = this.notes[this.demoCursor++];
			releaseThrough(n.time);
			const token = `demo:${playerId}:${n.id}`;
			this.hit(n.time, n.lane, token);
			this.demoReleases.push({
				token,
				at: n.time + n.duration
			});
		}
		releaseThrough(t);
	}
};
function formatTime(t) {
	t = Math.max(0, Math.floor(t));
	return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function expectedPitches(song, t, player) {
	const part = sourceFor(song, player);
	const window = .12;
	return part.notes.filter((n) => t >= n.time - .04 && t <= n.time + Math.max(n.duration, window)).map((n) => n.pitch);
}
function approachingPitches(song, t, player, look = .55) {
	return sourceFor(song, player).notes.filter((n) => n.time > t + .04 && n.time <= t + look).map((n) => n.pitch);
}
function currentHarmony(song, t) {
	if (!song.harmony?.length) return null;
	let found = null;
	for (const h of song.harmony) if (h.time <= t) found = h;
	else break;
	return found;
}
function stars(accuracy) {
	if (accuracy >= 97) return 5;
	if (accuracy >= 90) return 4;
	if (accuracy >= 75) return 3;
	if (accuracy >= 55) return 2;
	if (accuracy >= 30) return 1;
	return 0;
}
var GRADE_COLOR = {
	perfect: "#8fd4c4",
	great: "#8aa4c4",
	good: "#e0b27a",
	miss: "#d36a6a",
	extra: "#c48a7a",
	release: "#e0b27a"
};
var GRADE_LABEL = {
	perfect: "PERFECT",
	great: "GREAT",
	good: "GOOD",
	miss: "MISS",
	extra: "EXTRA",
	release: "HOLD IT"
};
function hexA(hex, a) {
	const n = hex.replace("#", "");
	return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
}
function noise(n) {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}
var StageRenderer = class {
	canvas;
	ctx;
	w = 0;
	h = 0;
	dpr = 1;
	motes = [];
	crowd = [];
	geom = /* @__PURE__ */ new Map();
	active = [];
	constructor(canvas) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		for (let i = 0; i < 70; i++) this.motes.push({
			x: Math.random(),
			y: Math.random(),
			s: .4 + Math.random() * 1.4,
			p: Math.random() * Math.PI * 2
		});
		for (let i = 0; i < 140; i++) this.crowd.push({
			x: Math.random(),
			y: .72 + Math.random() * .26,
			s: .6 + Math.random() * 1.6,
			phase: Math.random() * Math.PI * 2
		});
	}
	resize() {
		const rect = this.canvas.getBoundingClientRect();
		this.w = rect.width;
		this.h = rect.height;
		this.dpr = Math.min(2, window.devicePixelRatio || 1);
		this.canvas.width = Math.round(this.w * this.dpr);
		this.canvas.height = Math.round(this.h * this.dpr);
	}
	hitTest(x, y) {
		for (const p of this.active) {
			const g = this.geom.get(p.id);
			if (!g) continue;
			if (y < g.hit - 64 || y > g.hit + 52) continue;
			const left = g.point(0, 1).x;
			const right = g.point(g.n, 1).x;
			if (x < left - 10 || x > right + 10) continue;
			const span = Math.max(1, right - left);
			return {
				player: p,
				lane: Math.min(g.n - 1, Math.max(0, Math.floor((x - left) / span * g.n)))
			};
		}
		return null;
	}
	draw(state) {
		const { ctx } = this;
		const { w, h, dpr } = this;
		if (!w || !h) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const shake = state.reduced ? 0 : state.trauma * state.trauma * state.feel.shake;
		const ox = shake ? (noise(state.now * 41) - .5) * 8 * shake : 0;
		const oy = shake ? (noise(state.now * 53 + 2) - .5) * 6 * shake : 0;
		const punch = state.reduced ? 0 : state.bloom * .012 * state.feel.punch;
		ctx.save();
		ctx.translate(w * .5 + ox, h * .5 + oy);
		ctx.scale(1 + punch, 1 + punch);
		ctx.translate(-w * .5, -h * .5);
		this.paintHouse(state);
		this.paintSpots(state);
		this.paintCrowd(state);
		this.paintTruss(state);
		const geom = this.paintHighways(state);
		this.paintParticles(state, geom);
		this.paintBand(state);
		this.paintCallouts(state, geom);
		this.paintVignette(state);
		ctx.restore();
	}
	paintHouse(state) {
		const { ctx, w, h } = this;
		const e = state.energy;
		const lights = state.feel.lights;
		const g = ctx.createLinearGradient(0, 0, 0, h);
		g.addColorStop(0, "#0c0a10");
		g.addColorStop(.28, `rgb(${10 + e * 8 * lights},${8 + e * 6 * lights},${14 + e * 6 * lights})`);
		g.addColorStop(.62, "#09080c");
		g.addColorStop(1, "#050407");
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
		for (let i = 0; i < 14; i++) {
			const x = i / 13 * w;
			const fold = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
			fold.addColorStop(0, "rgba(0,0,0,0)");
			fold.addColorStop(.5, "rgba(18,10,14,0.35)");
			fold.addColorStop(1, "rgba(0,0,0,0)");
			ctx.fillStyle = fold;
			ctx.fillRect(x - 40, 0, 80, h * .42);
		}
		const haze = ctx.createRadialGradient(w * .5, h * .16, 8, w * .5, h * .16, w * .62);
		haze.addColorStop(0, hexA("#c4a882", (.2 + e * .22 + state.bloom * .18) * lights));
		haze.addColorStop(.35, hexA("#8fd4c4", (.08 + e * .1 + state.bloom * .1) * lights));
		haze.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = haze;
		ctx.fillRect(0, 0, w, h);
		if (!state.reduced && lights > .04) {
			for (const m of this.motes) {
				const y = (m.y + state.now * .012 * m.s) % 1 * h;
				const x = m.x * w + Math.sin(state.now * .4 + m.p) * 12;
				ctx.globalAlpha = (.08 + e * .12 + state.bloom * .08) * lights;
				ctx.fillStyle = "#efe8dc";
				ctx.fillRect(x, y, m.s, m.s);
			}
			ctx.globalAlpha = 1;
		}
	}
	paintSpots(state) {
		const { ctx, w, h } = this;
		const e = state.energy;
		const t = state.now;
		const lights = state.feel.lights;
		const cans = [
			{
				x: w * .18,
				sway: Math.sin(t * .35) * .08,
				tint: "#c4a882"
			},
			{
				x: w * .5,
				sway: Math.sin(t * .28 + 1.2) * .05,
				tint: "#8fd4c4"
			},
			{
				x: w * .82,
				sway: Math.sin(t * .32 + 2.1) * .08,
				tint: "#8aa4c4"
			}
		];
		for (const c of cans) {
			const tipX = w * .5 + c.sway * w;
			const grd = ctx.createLinearGradient(c.x, 18, tipX, h * .92);
			grd.addColorStop(0, hexA(c.tint, (.28 + e * .22 + state.bloom * .2) * lights));
			grd.addColorStop(.55, hexA(c.tint, (.08 + e * .08) * lights));
			grd.addColorStop(1, hexA(c.tint, 0));
			ctx.fillStyle = grd;
			ctx.beginPath();
			ctx.moveTo(c.x - 10, 22);
			ctx.lineTo(c.x + 10, 22);
			ctx.lineTo(tipX + w * .22, h);
			ctx.lineTo(tipX - w * .22, h);
			ctx.closePath();
			ctx.fill();
		}
	}
	paintCrowd(state) {
		const { ctx, w, h } = this;
		const crowd = state.feel.crowd;
		if (crowd < .03) return;
		const e = state.energy;
		const pulse = .35 + .65 * (.5 + .5 * Math.sin(state.now * (state.song.bpm / 60) * Math.PI));
		const lift = 1 + state.bloom * .8;
		for (const c of this.crowd) {
			const twinkle = .25 + .75 * (.5 + .5 * Math.sin(state.now * 2.4 + c.phase));
			ctx.globalAlpha = (.08 + e * .35) * twinkle * pulse * lift * crowd;
			ctx.fillStyle = c.phase % 2 > 1 ? "#efe8dc" : "#8fd4c4";
			ctx.beginPath();
			ctx.arc(c.x * w, c.y * h - state.bloom * 6, c.s * (1 + state.bloom * .4), 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}
	paintTruss(state) {
		const { ctx, w } = this;
		ctx.fillStyle = "rgba(239,232,220,0.08)";
		ctx.fillRect(0, 14, w, 3);
		ctx.fillRect(0, 28, w, 2);
		const cans = 9;
		for (let i = 0; i < cans; i++) {
			const x = w * ((i + .5) / cans);
			const lit = .35 + .65 * Math.abs(Math.sin(state.now * 1.6 + i * .7));
			ctx.fillStyle = "rgba(20,18,24,0.9)";
			ctx.fillRect(x - 7, 8, 14, 12);
			ctx.fillStyle = hexA(i % 2 ? "#c4a882" : "#8fd4c4", .25 + lit * .45 * (.4 + state.energy + state.bloom * .5) * state.feel.lights);
			ctx.beginPath();
			ctx.ellipse(x, 28, 9, 4, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	paintBand(state) {
		const { ctx, w, h } = this;
		const y = h * .145;
		const cx = w * .5;
		const figures = [
			{
				id: "drums",
				dx: -46
			},
			{
				id: "keys",
				dx: -16
			},
			{
				id: "guitar",
				dx: 16
			},
			{
				id: "bass",
				dx: 46
			}
		];
		const bob = Math.sin(state.now * (state.song.bpm / 60) * Math.PI) * 1.6;
		for (const f of figures) {
			const on = state.players.find((p) => p.id === f.id)?.enabled;
			const struck = state.flashes.some((fl) => fl.player === f.id && fl.until > state.now);
			const jump = struck ? 5 : 0;
			const x = cx + f.dx;
			ctx.globalAlpha = on ? .85 : .28;
			ctx.fillStyle = on ? struck ? "#3a3228" : "#2a241c" : "#16141a";
			ctx.beginPath();
			ctx.ellipse(x, y + 20 + (on ? bob : 0) - jump, 12 + (struck ? 1.4 : 0), 8, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(x, y + (on ? bob : 0) - jump, 7, 0, Math.PI * 2);
			ctx.fill();
			if (on) {
				ctx.strokeStyle = hexA(struck ? "#8fd4c4" : "#c4a882", struck ? .9 : .5);
				ctx.lineWidth = struck ? 1.8 : 1;
				ctx.beginPath();
				ctx.ellipse(x, y + 18 + bob - jump, 11, 7, 0, 0, Math.PI * 2);
				ctx.stroke();
			}
		}
		ctx.globalAlpha = 1;
		ctx.fillStyle = "rgba(239,232,220,0.35)";
		ctx.font = "600 9px 'IBM Plex Sans', system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(state.demo ? "WATCHING THE HOUSE" : "THE BAND", cx, y - 16);
	}
	paintHighways(state) {
		const { ctx, w, h } = this;
		const active = state.players.filter((p) => p.enabled);
		const pw = w / Math.max(1, active.length);
		const hit = h * .78;
		const far = h * .2;
		const look = 2.7 * state.speed;
		const geom = /* @__PURE__ */ new Map();
		const t = state.t;
		this.active = active;
		active.forEach((p, pi) => {
			const judge = state.judges.get(p.id);
			if (!judge) return;
			const lanes = judge.lanes;
			const laneCount = lanes.length;
			const cx = pw * (pi + .5);
			const bw = Math.min(active.length === 1 ? w * .72 : pw * .9, active.length === 1 ? 720 : 520);
			const tw = bw * .28;
			const point = (lane, progress) => {
				const f = clamp(progress, -.08, 1.18);
				const depth = Math.pow(Math.max(0, f), 1.72);
				const railW = tw + (bw - tw) * depth;
				const gutter = Math.max(12, railW * .06);
				const width = Math.max(railW * .8, railW - gutter * 2);
				return {
					x: cx + (lane / laneCount - .5) * width,
					y: far + (hit - far) * depth,
					width,
					railW,
					scale: .22 + .78 * depth
				};
			};
			const rail = (side, progress) => {
				const p = point(0, progress);
				return {
					x: cx + (side - .5) * p.railW,
					y: p.y
				};
			};
			const progress = (nt) => 1 - (nt - t) / look;
			geom.set(p.id, {
				point,
				n: laneCount,
				hit,
				cx,
				bw
			});
			const tl = rail(0, 0);
			const tr = rail(1, 0);
			const bl = rail(0, 1.14);
			const br = rail(1, 1.14);
			const hot = state.combo >= 20;
			const track = ctx.createLinearGradient(0, far, 0, hit);
			track.addColorStop(0, "rgba(36,32,40,0.55)");
			track.addColorStop(.45, "rgba(22,24,30,0.82)");
			track.addColorStop(1, "rgba(12,14,18,0.96)");
			this.poly([
				[tl.x, tl.y],
				[tr.x, tr.y],
				[br.x, br.y],
				[bl.x, bl.y]
			], track, hexA(hot ? "#c4a882" : "#8fd4c4", .38 + state.bloom * .25), 1.6);
			ctx.strokeStyle = hexA(hot ? "#c4a882" : "#8fd4c4", .55 + state.bloom * .3);
			ctx.lineWidth = 2.2;
			ctx.beginPath();
			ctx.moveTo(tl.x, tl.y);
			ctx.lineTo(bl.x, bl.y);
			ctx.moveTo(tr.x, tr.y);
			ctx.lineTo(br.x, br.y);
			ctx.stroke();
			const nextAt = Array.from({ length: laneCount }, () => Infinity);
			for (const n of judge.notes) if (n.state === 0 && n.time >= t - .08 && n.time < nextAt[n.lane]) nextAt[n.lane] = n.time;
			const heldLanes = /* @__PURE__ */ new Set();
			for (const n of judge.activeHolds) heldLanes.add(n.lane);
			for (let i = 0; i < laneCount; i++) {
				const a = point(i, 0);
				const b = point(i + 1, 0);
				const c = point(i + 1, 1.1);
				const d = point(i, 1.1);
				this.poly([
					[a.x, a.y],
					[b.x, b.y],
					[c.x, c.y],
					[d.x, d.y]
				], i % 2 ? "rgba(143,212,196,0.07)" : "rgba(0,0,0,0.18)");
				const flash = state.flashes.find((f) => f.player === p.id && f.lane === i && f.until > state.now);
				const pressing = (state.pressed.get(`${p.id}:${i}`) || 0) > state.now || heldLanes.has(i);
				const soon = Number.isFinite(nextAt[i]) ? progress(nextAt[i]) : -1;
				if (soon > .55 && soon < 1.08) {
					const k = clamp((soon - .55) / .45, 0, 1) * state.feel.trails;
					const aa = point(i, .62);
					const bb = point(i + 1, .62);
					this.poly([
						[aa.x, aa.y],
						[bb.x, bb.y],
						[c.x, c.y],
						[d.x, d.y]
					], hexA(lanes[i].color, .08 + k * .22));
				}
				if (flash || pressing) {
					const aa = point(i, .7);
					const bb = point(i + 1, .7);
					const tint = flash?.kind === "miss" ? "#d36a6a" : lanes[i].color;
					this.poly([
						[aa.x, aa.y],
						[bb.x, bb.y],
						[c.x, c.y],
						[d.x, d.y]
					], hexA(tint, flash ? .32 : .16));
				}
			}
			for (let i = 0; i <= laneCount; i++) {
				const a = point(i, 0);
				const b = point(i, 1.14);
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.strokeStyle = i === 0 || i === laneCount ? "rgba(239,232,220,0.32)" : "rgba(239,232,220,0.1)";
				ctx.lineWidth = i === 0 || i === laneCount ? 1.8 : .9;
				ctx.stroke();
			}
			const first = Math.max(0, state.song.beats.findIndex((b) => b.time >= t - .2));
			for (let bi = first; bi < state.song.beats.length && state.song.beats[bi].time < t + look; bi++) {
				const beat = state.song.beats[bi];
				const pr = progress(beat.time);
				if (pr < 0 || pr > 1.14) continue;
				const a = rail(0, pr);
				const b = rail(1, pr);
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.strokeStyle = beat.bar ? "rgba(239,232,220,0.32)" : "rgba(239,232,220,0.12)";
				ctx.lineWidth = beat.bar ? 1.6 : .85;
				ctx.stroke();
			}
			const a = rail(0, 1);
			const b = rail(1, 1);
			ctx.save();
			ctx.shadowColor = hot ? "#c4a882" : "#8fd4c4";
			ctx.shadowBlur = (28 + state.energy * 22 + state.bloom * 36) * (.25 + .75 * state.feel.trails);
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.strokeStyle = "rgba(239,232,220,1)";
			ctx.lineWidth = 3.4 + state.bloom * 3.2 * state.feel.trails;
			ctx.stroke();
			ctx.restore();
			const beatPulse = .5 + .5 * Math.abs(Math.sin(t * (state.song.bpm / 60) * Math.PI));
			const strikeW = point(0, 1).width;
			for (let lane = 0; lane < laneCount; lane++) {
				const mid = point(lane + .5, 1);
				const lw = strikeW / laneCount;
				const rx = Math.min(lw * .34, 28);
				const flash = state.flashes.find((f) => f.player === p.id && f.lane === lane && f.until > state.now);
				const pressing = (state.pressed.get(`${p.id}:${lane}`) || 0) > state.now || heldLanes.has(lane);
				const soon = Number.isFinite(nextAt[lane]) ? progress(nextAt[lane]) : -1;
				const live = Boolean(flash || pressing);
				const squash = live ? 1.28 : soon > .88 ? 1.1 : 1 + beatPulse * .04;
				const tint = flash?.kind === "miss" ? "#d36a6a" : lanes[lane].color;
				ctx.beginPath();
				ctx.ellipse(mid.x, hit, rx * squash, 8 / squash, 0, 0, Math.PI * 2);
				ctx.fillStyle = live ? hexA(tint, .62) : soon > .82 ? hexA(tint, .22) : "rgba(8,10,14,0.92)";
				ctx.fill();
				ctx.strokeStyle = hexA(tint, live ? 1 : soon > .7 ? .9 : .75);
				ctx.lineWidth = live ? 2.6 : 1.5;
				ctx.stroke();
				if (live && !state.reduced) {
					ctx.save();
					ctx.shadowColor = tint;
					ctx.shadowBlur = 18;
					ctx.beginPath();
					ctx.ellipse(mid.x, hit, rx * .55, 4, 0, 0, Math.PI * 2);
					ctx.fillStyle = hexA("#efe8dc", .55);
					ctx.fill();
					ctx.restore();
				}
				this.text(lanes[lane].short, mid.x, hit + 22, active.length > 2 ? 8 : 10, lanes[lane].color, "700");
				if (active.length < 3) {
					const code = KEYS[p.id][lane];
					if (code) this.text(keyLabel(code), mid.x, hit + 36, 8, "rgba(239,232,220,0.45)", "500");
				}
			}
			ctx.font = "600 11px 'IBM Plex Sans', system-ui, sans-serif";
			ctx.fillStyle = "rgba(239,232,220,0.55)";
			ctx.textAlign = "center";
			ctx.fillText(`${active.length > 1 ? `P${pi + 1}  ·  ` : ""}${p.label.toUpperCase()}`, cx, far - 14);
			if (state.status === "playing") {
				ctx.fillStyle = judge.stats.combo >= 10 ? "#c4a882" : "#8fd4c4";
				ctx.font = "600 9px 'IBM Plex Mono', ui-monospace, monospace";
				ctx.fillText(`${judge.stats.combo} STREAK  ·  ${judge.multiplier}×`, cx, far - 1);
			}
			const drawNote = (n) => {
				const isHeld = n.hold === "held";
				const isPop = n.state === 1 && !isHeld && n.hitAt != null && t - n.hitAt < .14;
				const popK = isPop && n.hitAt != null ? clamp((t - n.hitAt) / .14, 0, 1) : 0;
				const pr = isHeld || isPop ? 1 : progress(n.time);
				if (pr < -.04 || pr > 1.2) return;
				if (n.state === 1 && !isHeld && !isPop) return;
				const color = lanes[n.lane].color;
				const pos = point(n.lane + .5, pr);
				const lw = pos.width / laneCount;
				if (p.type !== "drums" && n.duration / state.speed >= .35 && n.time + n.duration > t) {
					const tail = point(n.lane + .5, clamp(progress(n.time + n.duration), 0, 1));
					ctx.beginPath();
					ctx.moveTo(tail.x, tail.y);
					ctx.lineTo(pos.x, pos.y);
					ctx.strokeStyle = hexA(color, n.state === 2 ? .12 : isHeld ? .78 + .2 * Math.sin(state.now * 14) : .38);
					ctx.lineWidth = Math.max(3, lw * .16);
					ctx.lineCap = "round";
					ctx.stroke();
				}
				if (n.chord && n.lanes && n.lanes[0] === n.lane) {
					const mates = n.lanes.map((l) => point(l + .5, pr));
					if (mates.length > 1) {
						ctx.beginPath();
						ctx.moveTo(mates[0].x, mates[0].y);
						for (const m of mates.slice(1)) ctx.lineTo(m.x, m.y);
						ctx.strokeStyle = hexA("#efe8dc", n.state === 2 ? .12 : .55);
						ctx.lineWidth = Math.max(2, pos.scale * 3);
						ctx.stroke();
					}
					if (pr > .42 && n.name) {
						const center = mates.reduce((s, m) => s + m.x, 0) / mates.length;
						this.text(`${n.roman ? n.roman + "  " : ""}${n.name}`, center, mates[0].y - 16, active.length > 2 ? 11 : 14, n.state === 2 ? "rgba(211,106,106,0.55)" : "#efe8dc", "700");
					}
				}
				const alpha = n.state === 2 ? .22 : isPop ? .95 * (1 - popK) : .95;
				const grow = isPop ? 1 + popK * .55 : pr > .82 && n.state === 0 ? 1.06 : 1;
				const rw = Math.min(lw * .42, Math.max(4.5, lw * .3)) * pos.scale * grow;
				const rh = Math.max(4, 7.5 * pos.scale + pr * 3.2) * grow;
				ctx.save();
				if (n.state !== 2 && !state.reduced) {
					ctx.shadowColor = color;
					ctx.shadowBlur = (6 + (pr > .8 ? 6 : 0)) * pos.scale * state.feel.trails;
				}
				ctx.beginPath();
				ctx.ellipse(pos.x, pos.y, rw, rh, 0, 0, Math.PI * 2);
				ctx.fillStyle = hexA(color, alpha);
				ctx.fill();
				ctx.shadowBlur = 0;
				ctx.strokeStyle = hexA("#efe8dc", n.state === 2 ? .15 : isPop ? .9 * (1 - popK) : .55);
				ctx.lineWidth = isPop ? 2 : 1;
				ctx.stroke();
				ctx.beginPath();
				ctx.ellipse(pos.x - rw * .28, pos.y - rh * .35, rw * .35, rh * .28, -.4, 0, Math.PI * 2);
				ctx.fillStyle = hexA("#efe8dc", n.state === 2 ? .08 : .35);
				ctx.fill();
				ctx.restore();
			};
			const notes = judge.notes;
			const lo = Math.max(0, notes.findIndex((n) => n.time >= t - .5 * state.speed));
			const hi = notes.length;
			let drawn = 0;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(tl.x, tl.y);
			ctx.lineTo(tr.x, tr.y);
			ctx.lineTo(br.x, br.y);
			ctx.lineTo(bl.x, bl.y);
			ctx.closePath();
			ctx.clip();
			for (let i = Math.min(hi, lo + 900) - 1; i >= Math.max(0, lo - 8); i--) {
				drawNote(notes[i]);
				if (++drawn > 900) break;
			}
			for (const n of judge.activeHolds) if (n.time < t - .5 * state.speed) drawNote(n);
			ctx.restore();
		});
		this.geom = geom;
		const harm = currentHarmony(state.song, Math.max(0, t));
		if (harm && t > 0) {
			ctx.font = "700 13px Syne, sans-serif";
			ctx.fillStyle = "rgba(239,232,220,0.7)";
			ctx.textAlign = "left";
			ctx.fillText(`${harm.roman}   ${harm.name}`, 22, h * .18);
		}
		return geom;
	}
	paintParticles(state, geom) {
		const { ctx } = this;
		if (state.reduced) return;
		for (const p of state.particles) {
			const life = p.life / p.max;
			const fade = Math.max(0, 1 - life);
			ctx.globalAlpha = fade;
			if (p.kind === "ring" || p.kind === "shock" || p.kind === "burst" || p.kind === "float") {
				const g = p.player ? geom.get(p.player) : void 0;
				const hx = (g ? g.point((p.lane ?? 0) + .5, 1) : {
					x: p.x,
					y: p.y
				}).x;
				const hy = g ? g.hit : p.y;
				if (p.kind === "float") {
					ctx.globalAlpha = fade;
					this.text(p.text || "", hx, hy - 28 - life * 36, p.size, p.color, "800");
				} else if (p.kind === "burst") {
					ctx.fillStyle = hexA(p.color, .28 * fade);
					ctx.beginPath();
					ctx.ellipse(hx, hy, 8 + life * 42, 5 + life * 16, 0, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.strokeStyle = p.color;
					ctx.lineWidth = p.kind === "shock" ? 3.2 * (1 - life) : 2;
					ctx.beginPath();
					const grow = p.kind === "shock" ? 18 + life * 54 : 10 + life * 28;
					ctx.ellipse(hx, hy, grow, grow * .38, 0, 0, Math.PI * 2);
					ctx.stroke();
				}
			} else {
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * (1 - life * .4), 0, Math.PI * 2);
				ctx.fill();
			}
		}
		ctx.globalAlpha = 1;
	}
	paintCallouts(state, geom) {
		const { ctx, h } = this;
		if (!state.feel.callouts) return;
		for (const c of state.callouts) {
			if (c.until < state.now) continue;
			const g = geom.get(c.player);
			if (!g) continue;
			const k = clamp((c.until - state.now) / .7, 0, 1);
			const pop = .92 + .08 * (1 - (1 - k) * (1 - k));
			ctx.globalAlpha = k;
			const y = h * .42 - (1 - k) * 14;
			const label = c.text && c.text !== c.grade ? c.text : GRADE_LABEL[c.grade];
			ctx.save();
			ctx.translate(g.cx, y);
			ctx.scale(pop, pop);
			this.text(label, 0, 0, c.text && c.text !== c.grade ? 18 : 22, GRADE_COLOR[c.grade], "800");
			ctx.restore();
			if (c.grade === "perfect" || c.grade === "great" || c.grade === "good") {
				const late = Math.abs(c.delta) < 5 ? "RIGHT ON TIME" : `${Math.abs(Math.round(c.delta))} ms ${c.delta < 0 ? "early" : "late"}`;
				this.text(late, g.cx, y + 20, 10, "rgba(239,232,220,0.55)", "500");
			}
		}
		ctx.globalAlpha = 1;
	}
	paintVignette(state) {
		const { ctx, w, h } = this;
		const v = ctx.createRadialGradient(w * .5, h * .48, h * .2, w * .5, h * .5, h * .78);
		v.addColorStop(0, "rgba(0,0,0,0)");
		v.addColorStop(1, `rgba(5,4,7,${.28 + .27 * (1 - state.feel.lights * .35)})`);
		ctx.fillStyle = v;
		ctx.fillRect(0, 0, w, h);
		const bottom = ctx.createLinearGradient(0, h * .72, 0, h);
		bottom.addColorStop(0, "rgba(5,4,7,0)");
		bottom.addColorStop(1, "rgba(5,4,7,0.72)");
		ctx.fillStyle = bottom;
		ctx.fillRect(0, 0, w, h);
		const miss = state.callouts.find((c) => (c.grade === "miss" || c.grade === "extra") && c.until > state.now);
		if (miss) {
			ctx.fillStyle = `rgba(211,106,106,${.1 * clamp((miss.until - state.now) / .7, 0, 1)})`;
			ctx.fillRect(0, 0, w, h);
		} else if (state.bloom > .15 && !state.reduced) {
			ctx.fillStyle = `rgba(239,232,220,${state.bloom * .06})`;
			ctx.fillRect(0, 0, w, h);
		}
	}
	poly(points, fill, stroke, width = 1) {
		const { ctx } = this;
		ctx.beginPath();
		ctx.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
		ctx.closePath();
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fill();
		}
		if (stroke) {
			ctx.lineWidth = width;
			ctx.strokeStyle = stroke;
			ctx.stroke();
		}
	}
	text(s, x, y, size, color, weight = "600") {
		const { ctx } = this;
		ctx.font = `${weight} ${size}px 'IBM Plex Sans', system-ui, sans-serif`;
		ctx.fillStyle = color;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(s, x, y);
	}
};
function spawnHitJuice(particles, grade, x, y, color, reduced, player, lane, score, juice = 1, floaters = true) {
	if (reduced) return;
	const amp = Math.max(0, juice);
	const count = Math.round((grade === "perfect" ? 22 : grade === "great" ? 14 : grade === "good" ? 8 : grade === "miss" || grade === "extra" ? 6 : 0) * amp);
	if (count <= 0 && amp < .08) return;
	const sparkColor = grade === "miss" || grade === "extra" ? "#d36a6a" : color;
	for (let i = 0; i < count; i++) {
		const ang = Math.PI * 2 * i / count + Math.random() * .4;
		const sp = 50 + Math.random() * 110;
		particles.push({
			x,
			y,
			vx: Math.cos(ang) * sp,
			vy: Math.sin(ang) * sp - 50,
			life: 0,
			max: .35 + Math.random() * .28,
			color: sparkColor,
			size: 1.6 + Math.random() * 2.4,
			kind: "spark"
		});
	}
	if (amp < .08) return;
	if (grade === "perfect" || grade === "great" || grade === "good") {
		if (player != null && lane != null) {
			particles.push({
				x: lane,
				y: 0,
				vx: 0,
				vy: 0,
				life: 0,
				max: .38,
				color,
				size: 1,
				kind: "ring",
				player,
				lane
			});
			if (amp > .35) particles.push({
				x: lane,
				y: 0,
				vx: 0,
				vy: 0,
				life: 0,
				max: .22,
				color,
				size: 1,
				kind: "burst",
				player,
				lane
			});
			if (grade === "perfect" && amp > .55) particles.push({
				x: lane,
				y: 0,
				vx: 0,
				vy: 0,
				life: 0,
				max: .5,
				color: "#efe8dc",
				size: 1,
				kind: "shock",
				player,
				lane
			});
			if (score && floaters) particles.push({
				x: lane,
				y: 0,
				vx: 0,
				vy: -40,
				life: 0,
				max: .7,
				color,
				size: 16,
				kind: "float",
				player,
				lane,
				text: `+${score}`
			});
		}
		if (grade === "perfect" && amp > .45) {
			const embers = Math.round(6 * amp);
			for (let i = 0; i < embers; i++) particles.push({
				x: x + (Math.random() - .5) * 30,
				y,
				vx: (Math.random() - .5) * 24,
				vy: -40 - Math.random() * 50,
				life: 0,
				max: .55 + Math.random() * .25,
				color: i % 2 ? "#efe8dc" : color,
				size: 1.4 + Math.random() * 1.6,
				kind: "ember"
			});
		}
	}
}
function loadBest(key) {
	try {
		return Number(localStorage.getItem(key) || 0) || 0;
	} catch {
		return 0;
	}
}
function saveBest(key, n) {
	try {
		localStorage.setItem(key, String(n));
	} catch {}
}
function bestKey(song, difficulty, speed, players) {
	return `midi-stage-best/${song.id}/${difficulty}/${speed}/${players.filter((p) => p.enabled).map((p) => p.id).join(",")}`;
}
function StageApp() {
	const canvasRef = (0, import_react.useRef)(null);
	const bag = (0, import_react.useRef)(null);
	const [ready, setReady] = (0, import_react.useState)(false);
	const [songId, setSongId] = (0, import_react.useState)("open-stage");
	const [players, setPlayers] = (0, import_react.useState)(() => defaultPlayers());
	const [status, setStatus] = (0, import_react.useState)("ready");
	const [difficulty, setDifficulty] = (0, import_react.useState)("standard");
	const [speed, setSpeed] = (0, import_react.useState)(1);
	const [guide, setGuide] = (0, import_react.useState)(false);
	const [metronome, setMetronome] = (0, import_react.useState)(false);
	const [volume, setVolume] = (0, import_react.useState)(55);
	const [hud, setHud] = (0, import_react.useState)({
		score: 0,
		combo: 0,
		multiplier: 1,
		accuracy: 100,
		energy: 50,
		elapsed: 0,
		remaining: 90,
		section: "HOUSE LIGHTS",
		countdown: "",
		chord: "",
		gain: 0,
		pop: 0,
		bloom: 0,
		trauma: 0
	});
	const [overlay, setOverlay] = (0, import_react.useState)(true);
	const [results, setResults] = (0, import_react.useState)(null);
	const [midi, setMidi] = (0, import_react.useState)({
		connected: false,
		last: "Computer keys ready. MIDI is optional."
	});
	const [menu, setMenu] = (0, import_react.useState)(false);
	const [toast, setToast] = (0, import_react.useState)("");
	const [piano, setPiano] = (0, import_react.useState)({
		expected: /* @__PURE__ */ new Set(),
		sounding: /* @__PURE__ */ new Set(),
		wrong: /* @__PURE__ */ new Set(),
		approaching: /* @__PURE__ */ new Set()
	});
	const [padFlash, setPadFlash] = (0, import_react.useState)({});
	const [padApproach, setPadApproach] = (0, import_react.useState)({});
	const [padHeld, setPadHeld] = (0, import_react.useState)({});
	const [best, setBest] = (0, import_react.useState)(0);
	const [feel, setFeel] = (0, import_react.useState)(() => withPreset("house"));
	const [feelOpen, setFeelOpen] = (0, import_react.useState)(false);
	const [feelHydrated, setFeelHydrated] = (0, import_react.useState)(false);
	const [feelTap, setFeelTap] = (0, import_react.useState)(true);
	const previewFeelRef = (0, import_react.useRef)(() => {});
	const songs = (0, import_react.useMemo)(() => catalog(difficulty), [difficulty]);
	const song = songs.find((s) => s.id === songId) || songs[0];
	const initBag = (0, import_react.useCallback)(() => {
		const b = {
			audio: bag.current?.audio || new AudioEngine(),
			renderer: bag.current?.renderer || null,
			songs,
			song,
			players: players.map((p) => ({ ...p })),
			judges: /* @__PURE__ */ new Map(),
			status: "ready",
			demo: false,
			speed,
			difficulty,
			volume: volume / 100,
			guide,
			metronome,
			particles: [],
			flashes: [],
			callouts: [],
			energy: .35,
			trauma: 0,
			reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
			position: 0,
			lastFrame: performance.now(),
			sounding: /* @__PURE__ */ new Set(),
			wrong: /* @__PURE__ */ new Set(),
			padFlash: /* @__PURE__ */ new Map(),
			pressed: /* @__PURE__ */ new Map(),
			bloom: 0,
			feel: bag.current?.feel ?? feel,
			midiInputs: bag.current?.midiInputs || [],
			canvasPtrs: bag.current?.canvasPtrs || /* @__PURE__ */ new Map(),
			feelOpen: bag.current?.feelOpen ?? false,
			feelLane: bag.current?.feelLane ?? 0
		};
		bag.current = b;
		rebuild(b);
	}, [
		songs,
		song,
		players,
		speed,
		difficulty,
		volume,
		guide,
		metronome
	]);
	function rebuild(b) {
		b.judges.clear();
		for (const p of b.players.filter((p) => p.enabled)) {
			const chart = makeChart(b.song, p);
			b.judges.set(p.id, new Judge(chart, {
				difficulty: b.difficulty,
				speed: b.speed,
				drums: p.type === "drums",
				onJudge: (r) => onJudge(b, p, r.grade, r.note?.lane ?? r.lane ?? 0, r.delta, r.note?.pitch, r.score)
			}));
		}
	}
	function onJudge(b, p, grade, lane, delta, pitch, score = 0) {
		const now = performance.now() / 1e3;
		const feelNow = b.feel;
		b.callouts = b.callouts.filter((c) => c.until > now);
		if (feelNow.callouts) b.callouts.push({
			player: p.id,
			grade,
			delta,
			until: now + .7,
			text: grade
		});
		const judge = b.judges.get(p.id);
		const combo = judge?.stats.combo ?? 0;
		if (feelNow.callouts && (grade === "perfect" || grade === "great" || grade === "good") && [
			10,
			25,
			50,
			100,
			200
		].includes(combo)) b.callouts.push({
			player: p.id,
			grade: "perfect",
			delta: 0,
			until: now + .9,
			text: `${combo} STREAK`
		});
		if (grade === "perfect" || grade === "great" || grade === "good") {
			b.flashes.push({
				player: p.id,
				lane,
				until: now + .16,
				kind: "hit"
			});
			b.padFlash.set(`${p.id}:${lane}`, now + .16);
			b.energy = Math.min(1, b.energy + (grade === "perfect" ? .045 : grade === "great" ? .025 : .012));
			b.bloom = Math.max(b.bloom, (grade === "perfect" ? .42 : grade === "great" ? .28 : .16) * feelNow.bloom);
			if (feelNow.hitsShake && feelNow.shake > 0) b.trauma = Math.min(.4, b.trauma + (grade === "perfect" ? .16 : .1) * feelNow.shake);
			const rect = canvasRef.current?.getBoundingClientRect();
			const active = b.players.filter((x) => x.enabled);
			const pi = Math.max(0, active.findIndex((x) => x.id === p.id));
			const x = (rect?.width || 800) * ((pi + .5) / Math.max(1, active.length));
			const y = (rect?.height || 480) * .78;
			const color = judge?.lanes[lane]?.color || "#8fd4c4";
			spawnHitJuice(b.particles, grade, x, y, color, b.reduced, p.id, lane, feelNow.floaters ? score : 0, feelNow.juice, feelNow.floaters);
			if (pitch != null) {
				b.sounding.add(pitch);
				setTimeout(() => b.sounding.delete(pitch), 180);
			}
		} else if (grade === "miss" || grade === "extra") {
			b.energy = Math.max(.08, b.energy - .05);
			if (feelNow.shake > 0) b.trauma = Math.min(.55, b.trauma + .28 * feelNow.shake);
			b.flashes.push({
				player: p.id,
				lane,
				until: now + .12,
				kind: "miss"
			});
			const rect = canvasRef.current?.getBoundingClientRect();
			const active = b.players.filter((x) => x.enabled);
			const pi = Math.max(0, active.findIndex((x) => x.id === p.id));
			const x = (rect?.width || 800) * ((pi + .5) / Math.max(1, active.length));
			const y = (rect?.height || 480) * .78;
			spawnHitJuice(b.particles, grade, x, y, "#d36a6a", b.reduced, p.id, lane, 0, feelNow.juice, false);
			if (pitch != null) {
				b.wrong.add(pitch);
				setTimeout(() => b.wrong.delete(pitch), 280);
			}
		}
		if (b.particles.length > 280) b.particles.splice(0, b.particles.length - 280);
	}
	function hit(b, p, lane, token, velocity = 105) {
		const judge = b.judges.get(p.id);
		if (!judge || lane < 0 || lane >= judge.lanes.length) return;
		const pitch = judge.lanes[lane].pitch;
		const now = performance.now() / 1e3;
		b.padFlash.set(`${p.id}:${lane}`, now + .16);
		b.pressed.set(`${p.id}:${lane}`, now + .18);
		b.flashes.push({
			player: p.id,
			lane,
			until: now + .1,
			kind: "press"
		});
		const t = b.status === "playing" ? b.audio.songAt() : b.position;
		let matched = null;
		if (b.status === "playing" && !b.demo) matched = judge.hit(t, lane, token);
		if (!b.demo) b.audio.monitor(token, p.type, pitch, velocity, matched ? matched.duration / b.speed : 1.4);
	}
	function release(b, p, token) {
		const t = b.status === "playing" ? b.audio.songAt() : b.position;
		b.judges.get(p.id)?.release(token, t);
		b.audio.release(token);
	}
	function playPiano(midi) {
		const b = bag.current;
		if (!b) return;
		const p = b.players.find((x) => x.id === "keys" && x.enabled);
		if (!p) return;
		const lane = b.judges.get("keys")?.lanes.findIndex((l) => l.pc === (midi % 12 + 12) % 12) ?? -1;
		if (lane >= 0) hit(b, p, lane, `piano:${midi}`);
	}
	function releasePiano(midi) {
		const b = bag.current;
		if (!b) return;
		const p = b.players.find((x) => x.id === "keys" && x.enabled);
		if (!p) return;
		release(b, p, `piano:${midi}`);
	}
	function onCanvasPointerDown(e) {
		const b = bag.current;
		const renderer = b?.renderer;
		if (!b || !renderer) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const found = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top);
		if (!found) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture?.(e.pointerId);
		const token = `canvas:${found.player.id}:${found.lane}:${e.pointerId}`;
		b.canvasPtrs.set(e.pointerId, {
			player: found.player,
			lane: found.lane,
			token
		});
		hit(b, found.player, found.lane, token);
	}
	function onCanvasPointerUp(e) {
		const b = bag.current;
		if (!b) return;
		const held = b.canvasPtrs.get(e.pointerId);
		if (!held) return;
		b.canvasPtrs.delete(e.pointerId);
		release(b, held.player, held.token);
	}
	function onCanvasPointerMove(e) {
		const renderer = bag.current?.renderer;
		if (!renderer) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const found = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top);
		e.currentTarget.style.cursor = found ? "pointer" : "default";
	}
	function previewFeel(kind) {
		const b = bag.current;
		if (!b) return;
		const p = b.players.find((x) => x.enabled);
		if (!p) return;
		const judge = b.judges.get(p.id);
		const laneCount = judge?.lanes.length || 1;
		b.feelLane = (b.feelLane + 1) % laneCount;
		const lane = b.feelLane;
		const color = judge?.lanes[lane]?.color || "#8fd4c4";
		const now = performance.now() / 1e3;
		if (kind === "perfect") {
			b.bloom = Math.max(b.bloom, .5 * b.feel.bloom);
			if (b.feel.hitsShake && b.feel.shake > 0) b.trauma = Math.min(.4, b.trauma + .18 * b.feel.shake);
			b.flashes.push({
				player: p.id,
				lane,
				until: now + .16,
				kind: "hit"
			});
			b.padFlash.set(`${p.id}:${lane}`, now + .16);
			if (b.feel.callouts) b.callouts.push({
				player: p.id,
				grade: "perfect",
				delta: 0,
				until: now + .7,
				text: "perfect"
			});
			const rect = canvasRef.current?.getBoundingClientRect();
			spawnHitJuice(b.particles, "perfect", (rect?.width || 800) * .5, (rect?.height || 480) * .78, color, b.reduced, p.id, lane, b.feel.floaters ? 100 : 0, b.feel.juice, b.feel.floaters);
		} else {
			if (b.feel.shake > 0) b.trauma = Math.min(.55, b.trauma + .32 * b.feel.shake);
			b.flashes.push({
				player: p.id,
				lane,
				until: now + .12,
				kind: "miss"
			});
			if (b.feel.callouts) b.callouts.push({
				player: p.id,
				grade: "miss",
				delta: 0,
				until: now + .7,
				text: "miss"
			});
			const rect = canvasRef.current?.getBoundingClientRect();
			spawnHitJuice(b.particles, "miss", (rect?.width || 800) * .5, (rect?.height || 480) * .78, "#d36a6a", b.reduced, p.id, lane, 0, b.feel.juice, false);
		}
	}
	previewFeelRef.current = previewFeel;
	const startSession = (0, import_react.useCallback)(async (demo = false) => {
		const b = bag.current;
		if (!b) return;
		try {
			if (b.status === "paused" && !demo) {
				await b.audio.begin({
					song: b.song,
					players: b.players,
					speed: b.speed,
					seek: b.position,
					countIn: false,
					guide: b.guide,
					demo: b.demo,
					metronome: b.metronome
				});
				b.status = "playing";
				setStatus("playing");
				setOverlay(false);
				return;
			}
			b.demo = demo;
			b.position = 0;
			b.particles = [];
			b.callouts = [];
			b.flashes = [];
			b.energy = .4;
			b.bloom = 0;
			b.pressed.clear();
			rebuild(b);
			b.status = "starting";
			setStatus("starting");
			setResults(null);
			await b.audio.begin({
				song: b.song,
				players: b.players,
				speed: b.speed,
				seek: 0,
				countIn: true,
				guide: b.guide || demo,
				demo,
				metronome: b.metronome
			});
			b.status = "playing";
			setStatus("playing");
			setOverlay(false);
		} catch (e) {
			b.status = "ready";
			setStatus("ready");
			setToast(e instanceof Error ? e.message : "Could not start the set.");
		}
	}, []);
	const pauseSession = (0, import_react.useCallback)((message) => {
		const b = bag.current;
		if (!b || b.status !== "playing") return;
		b.position = b.audio.songAt();
		b.status = "paused";
		b.audio.stop();
		setStatus("paused");
		if (message) setToast(message);
	}, []);
	const resetReady = (0, import_react.useCallback)(() => {
		const b = bag.current;
		if (!b) return;
		b.audio.stop();
		b.status = "ready";
		b.demo = false;
		b.position = 0;
		b.particles = [];
		rebuild(b);
		setStatus("ready");
		setOverlay(true);
		setResults(null);
	}, []);
	function finish(b) {
		b.audio.stop();
		b.status = "ready";
		setStatus("ready");
		let score = 0;
		let perfect = 0;
		let miss = 0;
		let extra = 0;
		let combo = 0;
		let weight = 0;
		let n = 0;
		for (const j of b.judges.values()) {
			const f = j.finish(b.song.duration + 1);
			score += f.score;
			perfect += f.perfect;
			miss += f.miss;
			extra += f.extra;
			combo = Math.max(combo, f.maxCombo);
			weight += f.weight;
			n += f.perfect + f.great + f.good + f.miss + f.extra;
		}
		const accuracy = n ? 100 * weight / n : 100;
		if (!b.demo) {
			const key = bestKey(b.song, b.difficulty, b.speed, b.players);
			if (score > loadBest(key)) {
				saveBest(key, score);
				setBest(score);
			}
		}
		setResults({
			score,
			accuracy,
			perfect,
			miss,
			extra,
			combo,
			stars: stars(accuracy),
			demo: b.demo
		});
		setOverlay(true);
	}
	(0, import_react.useEffect)(() => {
		initBag();
		setReady(true);
		setBest(loadBest(bestKey(song, difficulty, speed, players)));
	}, [
		initBag,
		song,
		difficulty,
		speed,
		players
	]);
	(0, import_react.useEffect)(() => {
		setFeel(loadFeel());
		setFeelHydrated(true);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!feelHydrated) return;
		if (bag.current) bag.current.feel = feel;
		saveFeel(feel);
	}, [feel, feelHydrated]);
	(0, import_react.useEffect)(() => {
		if (bag.current) bag.current.feelOpen = feelOpen;
	}, [feelOpen]);
	(0, import_react.useEffect)(() => {
		if (!feelOpen || !feelTap) return;
		const bpm = bag.current?.song.bpm || 90;
		const ms = Math.max(640, Math.round(120 / bpm * 1e3));
		previewFeelRef.current("perfect");
		const id = window.setInterval(() => {
			const b = bag.current;
			if (!b || b.status === "playing" || b.reduced) return;
			previewFeelRef.current("perfect");
		}, ms);
		return () => window.clearInterval(id);
	}, [
		feelOpen,
		feelTap,
		song.bpm
	]);
	(0, import_react.useEffect)(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const renderer = new StageRenderer(canvas);
		renderer.resize();
		if (bag.current) bag.current.renderer = renderer;
		const ro = new ResizeObserver(() => renderer.resize());
		ro.observe(canvas);
		let raf = 0;
		let lastHud = 0;
		const loop = (stamp) => {
			const b = bag.current;
			if (!b || !b.renderer) {
				raf = requestAnimationFrame(loop);
				return;
			}
			const now = stamp / 1e3;
			const dt = Math.min(.1, (stamp - b.lastFrame) / 1e3);
			b.lastFrame = stamp;
			let t = b.status === "playing" ? b.audio.songAt() : b.status === "ready" ? now * .42 % Math.min(14, b.song.duration) : b.position;
			if (b.status === "playing") {
				if (b.audio.ctx && b.audio.ctx.state !== "running") {
					pauseSession("Audio was interrupted. Resume when ready.");
					t = b.position;
				} else {
					for (const p of b.players.filter((p) => p.enabled)) {
						const j = b.judges.get(p.id);
						if (!j) continue;
						if (b.demo) j.advanceDemo(t, p.id);
						j.tick(t);
					}
					if (t >= b.song.duration + .35 * b.speed) finish(b);
				}
			}
			b.trauma = Math.max(0, b.trauma - dt * 3.2);
			b.bloom = Math.max(0, b.bloom - dt * 4.6);
			if (b.feelOpen && b.status !== "playing") {
				const rest = .28 + .55 * b.feel.lights;
				b.energy += (rest - b.energy) * (1 - Math.exp(-2.4 * dt));
				const floor = .2 * b.feel.bloom;
				if (b.bloom < floor) b.bloom += (floor - b.bloom) * (1 - Math.exp(-3.2 * dt));
			} else b.energy += (.32 - b.energy) * (1 - Math.exp(-.35 * dt));
			for (const p of b.particles) {
				p.life += dt;
				if (p.kind === "spark") {
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					p.vy += 220 * dt;
				} else if (p.kind === "ember") {
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					p.vy += 18 * dt;
				} else if (p.kind === "float") p.y += p.vy * dt;
			}
			b.particles = b.particles.filter((p) => p.life < p.max);
			b.flashes = b.flashes.filter((f) => f.until > now);
			b.callouts = b.callouts.filter((c) => c.until > now);
			for (const [k, until] of b.pressed) if (until < now) b.pressed.delete(k);
			b.renderer.draw({
				song: b.song,
				players: b.players,
				judges: b.judges,
				status: b.status,
				demo: b.demo,
				speed: b.speed,
				t,
				now,
				energy: b.energy,
				trauma: b.trauma,
				bloom: b.bloom,
				combo: Math.max(0, ...[...b.judges.values()].map((j) => j.stats.combo)),
				particles: b.particles,
				flashes: b.flashes,
				callouts: b.callouts,
				pressed: b.pressed,
				reduced: b.reduced,
				feel: b.feel
			});
			const shell = canvas.closest(".stage-shell");
			shell?.style.setProperty("--energy", String(b.energy));
			shell?.style.setProperty("--hit", String(b.bloom));
			if (stamp - lastHud > 80) {
				lastHud = stamp;
				let score = 0;
				let combo = 0;
				let multiplier = 1;
				let weight = 0;
				let n = 0;
				for (const j of b.judges.values()) {
					score += j.stats.score;
					combo = Math.max(combo, j.stats.combo);
					multiplier = Math.max(multiplier, j.multiplier);
					weight += j.stats.weight;
					n += j.stats.perfect + j.stats.great + j.stats.good + j.stats.miss + j.stats.extra;
				}
				const section = [...b.song.sections].reverse().find((s) => s.time <= Math.max(0, t));
				const beat = 60 / b.song.bpm;
				let countdown = "";
				if (b.status === "playing" && t < 0) {
					const count = Math.ceil(-t / beat);
					countdown = String(Math.max(1, Math.min(4, count)));
				} else if (b.status === "paused") countdown = "PAUSED";
				const harm = b.song.harmony?.filter((h) => h.time <= Math.max(0, t)).at(-1);
				setHud((prev) => ({
					score,
					combo,
					multiplier,
					accuracy: n ? 100 * weight / n : 100,
					energy: Math.round(b.energy * 100),
					elapsed: Math.max(0, t),
					remaining: Math.max(0, b.song.duration - Math.max(0, t)),
					section: b.demo ? "AUTOPLAY" : section?.name || (t < 0 ? "COUNT IN" : "HOUSE LIGHTS"),
					countdown,
					chord: harm ? `${harm.roman}  ${harm.name}` : "",
					gain: b.feel.floaters && score > prev.score ? score - prev.score : b.feel.floaters ? prev.gain : 0,
					pop: score > prev.score ? prev.pop + 1 : prev.pop,
					bloom: b.bloom,
					trauma: b.trauma
				}));
				const expected = /* @__PURE__ */ new Set();
				const approaching = /* @__PURE__ */ new Set();
				for (const p of b.players.filter((x) => x.enabled && x.type === "keys")) {
					for (const pitch of expectedPitches(b.song, Math.max(0, t), p)) expected.add(pitch);
					for (const pitch of approachingPitches(b.song, Math.max(0, t), p)) approaching.add(pitch);
				}
				setPiano({
					expected,
					sounding: new Set(b.sounding),
					wrong: new Set(b.wrong),
					approaching
				});
				const flashes = {};
				const held = {};
				const approach = {};
				const look = 2.7 * b.speed;
				for (const [k, until] of b.padFlash) if (until > now) flashes[k] = true;
				for (const p of b.players.filter((x) => x.enabled)) {
					const j = b.judges.get(p.id);
					if (!j) continue;
					for (const n of j.activeHolds) {
						const key = `${p.id}:${n.lane}`;
						flashes[key] = true;
						held[key] = true;
					}
					const next = Array.from({ length: j.lanes.length }, () => Infinity);
					for (const note of j.notes) if (note.state === 0 && note.time >= t && note.time < next[note.lane]) next[note.lane] = note.time;
					for (let i = 0; i < j.lanes.length; i++) {
						if (!Number.isFinite(next[i])) continue;
						const pr = 1 - (next[i] - t) / look;
						if (pr > 0 && pr < 1) approach[`${p.id}:${i}`] = pr;
					}
				}
				setPadFlash(flashes);
				setPadHeld(held);
				setPadApproach(approach);
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, [pauseSession]);
	(0, import_react.useEffect)(() => {
		const onKey = (e) => {
			const b = bag.current;
			if (!b) return;
			const el = e.target;
			if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return;
			if (e.repeat) return;
			if (e.code === "Enter") {
				e.preventDefault();
				if (b.status === "playing") pauseSession();
				else startSession(false);
				return;
			}
			if (e.code === "Escape") {
				if (b.status === "playing") pauseSession();
				return;
			}
			if (e.code === "KeyR" && b.status !== "playing") {
				resetReady();
				return;
			}
			for (const p of b.players.filter((p) => p.enabled)) {
				const lane = KEYS[p.id].indexOf(e.code);
				if (lane >= 0) {
					e.preventDefault();
					hit(b, p, lane, `key:${p.id}:${e.code}`);
				}
			}
		};
		const onUp = (e) => {
			const b = bag.current;
			if (!b) return;
			for (const p of b.players.filter((p) => p.enabled)) if (KEYS[p.id].includes(e.code)) release(b, p, `key:${p.id}:${e.code}`);
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("keyup", onUp);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("keyup", onUp);
		};
	}, [
		pauseSession,
		startSession,
		resetReady
	]);
	(0, import_react.useEffect)(() => {
		if (!toast) return;
		const id = setTimeout(() => setToast(""), 4200);
		return () => clearTimeout(id);
	}, [toast]);
	async function connectMidi() {
		const midiAccess = navigator.requestMIDIAccess;
		if (!midiAccess) {
			setToast("This browser has no Web MIDI. Use the computer keys.");
			return;
		}
		try {
			const access = await midiAccess.call(navigator, { sysex: false });
			const inputs = [];
			const onMessage = (ev) => {
				const b = bag.current;
				if (!b) return;
				const data = ev.data;
				if (!data || data.length < 2) return;
				const status = data[0];
				const type = status & 240;
				const note = data[1];
				const vel = data[2] ?? 0;
				const channel = (status & 15) + 1;
				if (type === 144 && vel) {
					setMidi({
						connected: true,
						last: `Note ${note} · ch ${channel} · vel ${vel}`
					});
					for (const p of b.players.filter((p) => p.enabled)) {
						const judge = b.judges.get(p.id);
						if (!judge) continue;
						const lane = p.type === "drums" ? judge.lanes.findIndex((l) => l.notes?.includes(note)) : judge.lanes.findIndex((l) => l.pc === (note % 12 + 12) % 12);
						if (lane >= 0) hit(b, p, lane, `midi:${p.id}:${note}`, vel);
					}
				} else if (type === 128 || type === 144 && !vel) for (const p of b.players.filter((p) => p.enabled)) release(b, p, `midi:${p.id}:${note}`);
			};
			access.inputs.forEach((input) => {
				input.onmidimessage = onMessage;
				inputs.push(input);
			});
			if (bag.current) bag.current.midiInputs = inputs;
			setMidi({
				connected: inputs.length > 0,
				last: inputs.length ? `${inputs.length} MIDI input${inputs.length === 1 ? "" : "s"} live.` : "MIDI on. No inputs yet."
			});
		} catch {
			setToast("MIDI permission was denied. Computer keys still work.");
		}
	}
	function togglePlayer(id) {
		setPlayers((prev) => {
			const next = prev.map((p) => p.id === id ? {
				...p,
				enabled: !p.enabled
			} : p);
			if (!next.some((p) => p.enabled)) return prev;
			return next;
		});
		resetReady();
	}
	const enabled = players.filter((p) => p.enabled);
	const busy = status === "playing" || status === "starting";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "stage-shell flex min-h-dvh flex-col",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "relative z-20 flex items-center justify-between gap-3 px-4 py-3 md:px-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "eq-bars",
						"aria-hidden": "true",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "font-display text-[1.35rem] font-semibold tracking-[-0.04em] leading-none",
						children: [
							"MIDI ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-accent",
								children: "/"
							}),
							" STAGE"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 text-[10px] font-medium tracking-[0.18em] text-muted",
						children: "REAL INSTRUMENTS. REAL PLAY."
					})] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "hidden items-center gap-2 text-[10px] tracking-[0.16em] text-muted sm:flex",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("size-1.5 rounded-full", midi.connected ? "bg-accent" : "bg-tungsten") }), "LOCAL SET"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							size: "sm",
							variant: "ghost",
							onClick: () => {
								setFeelTap(true);
								setFeelOpen(true);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lamp, { className: "size-3.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "hidden sm:inline",
								children: "The room"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							size: "sm",
							variant: "primary",
							onClick: () => void connectMidi(),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, { className: "size-3.5" }), "Connect MIDI"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "icon",
							variant: "ghost",
							className: "lg:hidden size-11",
							"aria-label": "Open setlist",
							onClick: () => setMenu(true),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Menu, { className: "size-5" })
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
						className: cn("z-30 flex flex-col gap-5 border-border bg-bg/95 p-4 lg:static lg:border-r lg:bg-transparent", "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[min(320px,88vw)] max-lg:overflow-y-auto max-lg:shadow-[0_0_0_1px_rgba(239,232,220,0.08)]", menu ? "max-lg:translate-x-0" : "max-lg:-translate-x-full", "transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]"),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between lg:hidden",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[10px] tracking-[0.18em] text-muted",
									children: "GREEN ROOM"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "icon",
									variant: "ghost",
									className: "size-10",
									"aria-label": "Close setlist",
									onClick: () => setMenu(false),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-5" })
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[10px] font-semibold tracking-[0.2em] text-accent",
									children: "THE HOUSE IS YOURS"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
									className: "font-display mt-2 text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-balance",
									children: [
										"Make some",
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", {
											className: "not-italic text-accent",
											children: "real noise."
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 max-w-[28ch] text-pretty text-[13px] leading-relaxed text-muted",
									children: "Notes roll toward the strike line. Hit them as they bloom. Start on keys, then bring the band."
								})
							] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-2 flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-[10px] font-semibold tracking-[0.18em] text-muted",
									children: "SETLIST"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-[9px] tracking-[0.14em] text-subtle",
									children: [String(songs.length).padStart(2, "0"), " TRACKS"]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex flex-col gap-2",
								children: songs.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": s.id === song.id,
									onClick: () => {
										setSongId(s.id);
										setMenu(false);
										resetReady();
									},
									className: cn("flex items-center gap-3 rounded-xl p-2 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.08)] transition-[background,box-shadow] duration-150", s.id === song.id ? "bg-elevated shadow-[0_0_0_1px_rgba(143,212,196,0.45)]" : "bg-surface hover:bg-elevated"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("album", s.art) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
											className: "block truncate text-[13px] font-medium",
											children: s.name
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", {
											className: "mt-0.5 block text-[10px] text-muted",
											children: [
												s.bpm,
												" BPM · ",
												formatTime(Math.ceil(s.duration))
											]
										})]
									})]
								}, s.id))
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-2 flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-[10px] font-semibold tracking-[0.18em] text-muted",
									children: "YOUR LINEUP"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[9px] tracking-[0.14em] text-subtle",
									children: "1–4 PLAYERS"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid grid-cols-2 gap-2",
								children: players.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": p.enabled,
									onClick: () => togglePlayer(p.id),
									className: cn("flex h-11 items-center justify-between rounded-xl px-3 text-[12px] font-medium shadow-[0_0_0_1px_rgba(239,232,220,0.1)]", p.enabled ? "bg-elevated text-fg shadow-[0_0_0_1px_rgba(143,212,196,0.4)]" : "bg-surface text-muted"),
									children: [p.label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[10px] text-accent",
										children: p.enabled ? "ON" : "OFF"
									})]
								}, p.id))
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl bg-surface p-3 shadow-[0_0_0_1px_rgba(239,232,220,0.08)]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2 text-[12px] font-medium",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("size-1.5 rounded-full", midi.connected ? "bg-accent" : "bg-tungsten") }), midi.connected ? "MIDI live" : "Keyboard ready"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-[11px] leading-relaxed text-muted",
									children: midi.last
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => {
									setFeelTap(true);
									setFeelOpen(true);
									setMenu(false);
								},
								className: "rounded-xl bg-surface p-3 text-left shadow-[0_0_0_1px_rgba(239,232,220,0.08)] hover:bg-elevated",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[10px] font-semibold tracking-[0.18em] text-muted",
										children: "THE ROOM"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[10px] tracking-[0.14em] text-accent",
										children: feel.preset === "custom" ? "CUSTOM" : FEEL_COPY[feel.preset].label.toUpperCase()
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-[12px] leading-relaxed text-muted",
									children: feel.preset === "custom" ? "Your mix. Lights, sparks, and shake." : FEEL_COPY[feel.preset].line
								})]
							})
						]
					}),
					menu ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "fixed inset-0 z-20 bg-bg/50 lg:hidden",
						"aria-label": "Dismiss setlist",
						onClick: () => setMenu(false)
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "flex min-w-0 flex-col px-3 pb-4 md:px-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-end justify-between gap-3 py-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-[10px] font-semibold tracking-[0.18em] text-subtle",
									children: [
										song.original ? "ORIGINAL SESSION" : "YOUR COLLECTION",
										" / ",
										song.tag
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-display mt-1 text-[1.7rem] font-semibold tracking-[-0.03em]",
									children: song.name
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-baseline gap-4 text-muted",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", {
											className: "font-mono text-lg text-fg tabular-nums",
											children: [
												song.bpm,
												" ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "text-[10px] tracking-[0.14em] text-muted",
													children: "BPM"
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-mono text-sm tabular-nums",
											children: formatTime(Math.ceil(song.duration))
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "hidden rounded-full px-2 py-1 text-[9px] tracking-[0.14em] text-accent shadow-[0_0_0_1px_rgba(143,212,196,0.3)] sm:inline",
											children: "NO-FAIL PRACTICE"
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mb-3 max-w-[70ch] text-[13px] text-pretty text-muted",
								children: song.arrangementDescription
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-2 gap-3 rounded-t-2xl bg-surface px-4 py-3 shadow-[0_0_0_1px_rgba(239,232,220,0.08)] sm:grid-cols-4 lg:grid-cols-5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: cn("hud-chip accent", hud.gain > 0 && "pop"),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "SCORE" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [hud.score.toLocaleString().padStart(6, "0"), hud.gain > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("em", {
											className: "gain",
											children: ["+", hud.gain]
										}) : null] }, hud.pop)]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: cn("hud-chip", hud.combo >= 10 && "hot"),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "STREAK" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
											hud.combo,
											" ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", {
												className: "text-[10px] text-subtle",
												children: "NOTES"
											})
										] })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "hud-chip",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "MULTIPLIER" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [hud.multiplier, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", {
											className: "text-[12px]",
											children: "×"
										})] })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "hud-chip",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ACCURACY" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [Math.round(hud.accuracy), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", {
											className: "text-[10px] text-subtle",
											children: "%"
										})] })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "hud-chip hidden lg:flex",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "PERSONAL BEST" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
											className: "text-muted",
											children: best ? best.toLocaleString() : "—"
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center justify-between gap-2 bg-elevated px-4 py-2 text-[10px] tracking-[0.12em] text-muted",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex items-center gap-2",
										children: [
											"STAGE ENERGY",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("meter", {
												className: cn("energy-meter", hud.energy > 70 && "hot"),
												min: 0,
												max: 100,
												value: hud.energy
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "font-mono tabular-nums text-fg",
												children: [hud.energy, "%"]
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: enabled.length === 1 ? "SOLO · FIND YOUR GROOVE" : `${enabled.length}-PLAYER BAND` }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-tungsten",
										children: hud.section
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "relative isolate min-h-[420px] flex-1 overflow-hidden rounded-b-2xl bg-[#07060a] shadow-[0_0_0_1px_rgba(239,232,220,0.08)] md:min-h-[520px]",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
										ref: canvasRef,
										className: "stage-canvas absolute inset-0 size-full",
										"aria-label": "Notes travel down each instrument highway. Hit the matching pad when a note reaches the strike line. You can also tap the receptors on the strike line.",
										onPointerDown: onCanvasPointerDown,
										onPointerUp: onCanvasPointerUp,
										onPointerCancel: onCanvasPointerUp,
										onPointerMove: onCanvasPointerMove
									}),
									hud.countdown && status !== "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "pointer-events-none absolute inset-x-0 top-[22%] text-center font-display text-[5.5rem] font-semibold leading-none tracking-[-0.06em] text-accent",
										children: [hud.countdown === "PAUSED" ? "Ⅱ" : hud.countdown, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", {
											className: "mt-3 block text-[11px] tracking-[0.28em] text-muted",
											children: hud.countdown === "PAUSED" ? "PAUSED" : status === "playing" && bag.current?.demo ? "AUTOPLAY" : "COUNT IN"
										})]
									}) : null,
									overlay && status !== "playing" && !feelOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "absolute inset-0 z-10 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_42%,rgba(7,6,10,0.72),rgba(7,6,10,0.28)_58%,transparent)] px-6 text-center",
										children: results ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "overlay-enter max-w-md",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "text-[10px] tracking-[0.22em] text-muted",
													children: results.demo ? "AUTOPLAY · NOT SAVED" : "SET COMPLETE"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "mt-2 font-display text-4xl font-semibold tracking-[-0.04em] md:text-5xl",
													children: results.demo ? "Now make it yours." : results.accuracy >= 90 ? "You found the pocket." : "The house is warming up."
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "mt-3 font-mono text-5xl font-semibold tabular-nums text-accent",
													children: results.score.toLocaleString()
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "mt-2 text-tungsten tracking-[0.2em]",
													"aria-label": `${results.stars} of 5 stars`,
													children: ["●".repeat(results.stars), "○".repeat(5 - results.stars)]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
													className: "mt-3 text-[13px] text-muted",
													children: [
														Math.round(results.accuracy),
														"% accuracy · ",
														results.perfect,
														" perfect · ",
														results.miss,
														" missed · streak ",
														results.combo
													]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "mt-5 flex flex-wrap justify-center gap-2",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
														onClick: () => void startSession(false),
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4 translate-x-px" }), "Play again"]
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
														variant: "secondary",
														onClick: () => setResults(null),
														children: "Back to house"
													})]
												})
											]
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "overlay-enter max-w-md",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "text-[10px] tracking-[0.22em] text-muted",
													children: "YOUR NEXT SESSION"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
													className: "mt-3 font-display text-5xl font-semibold tracking-[-0.05em] md:text-6xl",
													children: "Take the stage."
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
													className: "mt-4 max-w-[36ch] text-base leading-relaxed text-muted text-pretty md:text-lg",
													children: ["Gems roll toward the hot line. Hit the matching keys as they cross — or tap the strike line, pads, or piano.", song.harmony ? " Chords light the piano. Play the glowing keys together." : ""]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "mt-5 flex flex-wrap justify-center gap-2",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
														onClick: () => void startSession(false),
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4 translate-x-px" }),
															"Start set",
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
																className: "ml-1 rounded-md bg-accent-fg/10 px-1.5 py-0.5 font-mono text-[10px]",
																children: "ENTER"
															})
														]
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
														variant: "secondary",
														onClick: () => void startSession(true),
														disabled: busy,
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "size-4" }), "Watch the house"]
													})]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
													className: "mt-3 text-[11px] text-subtle",
													children: "Solo by default. Add your band from the green room."
												})
											]
										})
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "pointer-events-none absolute inset-x-3 top-3 flex justify-between text-[9px] font-semibold tracking-[0.16em] text-muted",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: enabled.length === 1 ? "SOLO SESSION" : `${enabled.length}-PLAYER BAND` }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: hud.section })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "pointer-events-none absolute inset-x-3 bottom-3 flex justify-between text-[9px] tracking-[0.16em] text-subtle",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "COMPUTER KEYS / MIDI" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [speed.toFixed(2), "× TEMPO"] })]
									})
								]
							}),
							song.harmony ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 rounded-xl bg-surface px-3 py-2 shadow-[0_0_0_1px_rgba(239,232,220,0.08)]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mb-2 flex items-center justify-between text-[10px] tracking-[0.14em] text-muted",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "TUNGSTEN: TARGET · SEA-GLASS: SOUNDING · ROSE: WRONG · TAP THE KEYS" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "font-mono text-accent",
										children: hud.chord || "—"
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PianoGuide, {
									expected: piano.expected,
									sounding: piano.sounding,
									wrong: piano.wrong,
									approaching: piano.approaching,
									interactive: enabled.some((p) => p.id === "keys"),
									onPlay: playPiano,
									onRelease: releasePiano
								})]
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "h-1 overflow-hidden rounded-full bg-elevated",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "h-full bg-accent",
										style: { width: `${song.duration ? hud.elapsed / song.duration * 100 : 0}%` }
									})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatTime(hud.elapsed) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: status === "ready" ? "Ready when you are." : status === "paused" ? "Paused." : bag.current?.demo ? "Watching." : "Make it yours." }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatTime(hud.remaining) })
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex flex-wrap items-center justify-between gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex flex-wrap gap-2",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											onClick: () => void startSession(false),
											disabled: status === "playing" || status === "starting",
											children: status === "paused" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4 translate-x-px" }), " Resume"] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4 translate-x-px" }), " Start set"] })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											variant: "secondary",
											onClick: () => pauseSession(),
											disabled: status !== "playing",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-4" }), " Pause"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											variant: "ghost",
											size: "icon",
											"aria-label": "Restart",
											onClick: resetReady,
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "size-4" })
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "ghost",
									onClick: () => void startSession(true),
									disabled: busy,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "size-4" }), " Watch the house"]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-wrap items-end gap-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex flex-col gap-1 text-[9px] tracking-[0.14em] text-muted",
										children: ["DIFFICULTY", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-10 min-w-[120px] rounded-lg bg-elevated px-2 text-[13px] text-fg shadow-[0_0_0_1px_rgba(239,232,220,0.12)]",
											value: difficulty,
											disabled: busy,
											onChange: (e) => setDifficulty(e.target.value),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "chill",
													children: "Chill"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "standard",
													children: "Standard"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "expert",
													children: "Expert"
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex flex-col gap-1 text-[9px] tracking-[0.14em] text-muted",
										children: ["TEMPO", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-10 min-w-[100px] rounded-lg bg-elevated px-2 text-[13px] text-fg shadow-[0_0_0_1px_rgba(239,232,220,0.12)]",
											value: String(speed),
											disabled: busy,
											onChange: (e) => setSpeed(Number(e.target.value)),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "0.5",
													children: "50%"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "0.75",
													children: "75%"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "1",
													children: "100%"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "1.25",
													children: "125%"
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex h-10 items-center gap-2 text-[12px] text-muted",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: guide,
											disabled: busy,
											onChange: (e) => setGuide(e.target.checked),
											suppressHydrationWarning: true
										}), "Guide part"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex h-10 items-center gap-2 text-[12px] text-muted",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: metronome,
											disabled: busy,
											onChange: (e) => setMetronome(e.target.checked),
											suppressHydrationWarning: true
										}), "Click"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "ml-auto flex items-center gap-2 text-[9px] tracking-[0.14em] text-muted",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "range",
											min: 0,
											max: 100,
											value: volume,
											"aria-label": "Master volume",
											onChange: (e) => {
												const v = Number(e.target.value);
												setVolume(v);
												bag.current?.audio.setVolume(v / 100);
											},
											suppressHydrationWarning: true
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-4 flex flex-col gap-2",
								children: enabled.map((p) => {
									const lanes = bag.current?.judges.get(p.id)?.lanes || [];
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "w-12 shrink-0 text-[9px] tracking-[0.14em] text-muted",
											children: p.label.toUpperCase()
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "grid flex-1 grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8",
											children: lanes.map((lane, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												className: cn("pad", padFlash[`${p.id}:${i}`] && "flash", padHeld[`${p.id}:${i}`] && "held", (padApproach[`${p.id}:${i}`] || 0) > .82 && "soon"),
												style: {
													["--pad-color"]: lane.color,
													["--approach"]: String(padApproach[`${p.id}:${i}`] || 0)
												},
												onPointerDown: (e) => {
													e.preventDefault();
													e.currentTarget.setPointerCapture?.(e.pointerId);
													if (bag.current) hit(bag.current, p, i, `touch:${p.id}:${i}`);
												},
												onPointerUp: () => bag.current && release(bag.current, p, `touch:${p.id}:${i}`),
												onPointerCancel: () => bag.current && release(bag.current, p, `touch:${p.id}:${i}`),
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: lane.short }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", { children: keyLabel(KEYS[p.id][i] || "") })]
											}, lane.short + i))
										})]
									}, p.id);
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-3 text-[11px] text-subtle",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
										className: "rounded bg-elevated px-1",
										children: "ENTER"
									}),
									" start / pause · ",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
										className: "rounded bg-elevated px-1",
										children: "R"
									}),
									" restart · Tap the strike line, pads, or piano. Hold melodic notes through their tails."
								]
							})
						]
					})
				]
			}),
			feelOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "fixed inset-0 z-40 bg-bg/55",
				"aria-label": "Close the room",
				onClick: () => setFeelOpen(false)
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "room-title",
				className: "feel-sheet fixed inset-y-0 right-0 z-50 flex w-[min(400px,92vw)] flex-col overflow-hidden bg-bg shadow-[0_0_0_1px_rgba(239,232,220,0.1)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FeelPanel, {
					feel,
					reduced: bag.current?.reduced ?? false,
					tapping: feelTap,
					live: {
						bloom: hud.bloom,
						trauma: hud.trauma
					},
					onChange: (next) => {
						setFeel(next);
						const b = bag.current;
						if (!b) return;
						b.feel = next;
						if (b.status !== "playing") {
							b.energy = .28 + .55 * next.lights;
							b.bloom = Math.max(b.bloom, .28 * next.bloom);
						}
					},
					onPreview: previewFeel,
					onToggleTap: () => setFeelTap((v) => !v),
					onClose: () => setFeelOpen(false)
				})
			})] }) : null,
			toast ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed bottom-5 left-1/2 z-50 max-w-[min(640px,90vw)] -translate-x-1/2 rounded-xl bg-elevated px-4 py-3 text-[13px] text-fg shadow-[0_0_0_1px_rgba(143,212,196,0.35)]",
				children: toast
			}) : null
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageApp, {});
}
//#endregion
export { Home as component };
