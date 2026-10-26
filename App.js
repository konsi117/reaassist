/*
 * REA-Assist – Reanimations-Assistent (Snack Expo, React Native)
 * Orientiert an den ERC-Leitlinien 2021 (ALS / PLS / Ethik).
 *
 * HINWEIS: Trainings- und Dokumentationshilfe. KEIN Medizinprodukt.
 * Ersetzt weder Ausbildung, Leitlinien, SOPs noch ärztliche Entscheidungen.
 * Alle Dosierungen vor Gabe eigenständig prüfen.
 *
 * APK-Version: Ton über expo-av, Bildschirm bleibt an (expo-keep-awake).
 * Tipp: Bildschirm-Sperre am Handy während der Nutzung verlängern.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, TextInput,
  Share, Vibration, SafeAreaView, StatusBar, Animated, Platform,
  KeyboardAvoidingView,
} from 'react-native';

/* Ton (expo-av) und Bildschirm-wach-halten (expo-keep-awake) – APK-Version */
import { Audio } from 'expo-av';
import { useKeepAwake } from 'expo-keep-awake';

/* ------------------------------------------------------------------ */
/* Konstanten                                                          */
/* ------------------------------------------------------------------ */

const CYCLE_MS = 2 * 60 * 1000; // 2-min-Zyklus bis zur nächsten Analyse
const EOL_MS = 25 * 60 * 1000; // End-of-Life-Abfrage nach 25 min
const EOL_REPEAT_MS = 10 * 60 * 1000;

const C = {
  bg: '#0B0D12',
  surface: '#151922',
  surface2: '#1E2330',
  line: '#2A3142',
  text: '#F4F6FB',
  dim: '#8D96AB',
  red: '#FF3B4E',
  redDark: '#7A1220',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  green: '#30D158',
  teal: '#40C8E0',
  blue: '#0A84FF',
  indigo: '#5E5CE6',
  purple: '#BF5AF2',
  pink: '#FF375F',
  grey: '#3A4152',
};

const RHYTHMS = {
  VF: 'VF – Kammerflimmern',
  pVT: 'pVT – pulslose VT',
  ASY: 'Asystolie',
  PEA: 'PEA',
};
const RHYTHM_SHORT = { VF: 'VF', pVT: 'pVT', ASY: 'Asystolie', PEA: 'PEA' };
const SHOCKABLE = (r) => r === 'VF' || r === 'pVT';

const HITS = [
  { k: 'hypoxie', g: '4 H', l: 'Hypoxie', tip: 'Atemweg sichern, O₂ 100 %, Beatmung & Tubuslage prüfen' },
  { k: 'hypovol', g: '4 H', l: 'Hypovolämie', tip: 'Blutung stoppen, Volumen, Beckenschlinge / Tourniquet' },
  { k: 'metab', g: '4 H', l: 'Hypo-/Hyperkaliämie, Hypoglykämie, metabolisch', tip: 'BGA / BZ / Kalium. Hyperkaliämie: Calcium, Insulin-Glukose, ggf. Bicarbonat' },
  { k: 'temp', g: '4 H', l: 'Hypothermie / Hyperthermie', tip: '< 30 °C: max. 3 Schocks, Adrenalin pausieren; eCPR erwägen' },
  { k: 'tamp', g: 'HITS', l: 'Herzbeuteltamponade', tip: 'Sonographie (POCUS); Perikardpunktion / Thorakotomie bei Trauma' },
  { k: 'intox', g: 'HITS', l: 'Intoxikation', tip: 'Antidot, Giftnotruf; verlängerte Reanimation / eCPR erwägen' },
  { k: 'thromb', g: 'HITS', l: 'Thrombose (Koronar / Lungenembolie)', tip: 'LAE: Lyse erwägen → CPR 60–90 min fortführen; ACS: PCI' },
  { k: 'pneu', g: 'HITS', l: 'Spannungspneumothorax', tip: 'Nadeldekompression / Thorakostomie' },
];
const HITS_STATES = [
  ['Verdacht', C.orange],
  ['Ausgeschlossen', C.grey],
  ['Behandelt', C.green],
];

const CAUSES = [
  'Kardial (ACS / Rhythmus)', 'Hypoxie / Asphyxie', 'Trauma', 'Blutung / Hypovolämie',
  'Intoxikation', 'Ertrinken', 'Lungenembolie', 'Hypothermie', 'Elektrolytstörung',
  'Anaphylaxie', 'SIDS (Säugling)', 'Unklar',
];

// Fragenkatalog nach ERC 2021 – Ethik / Beendigung der Reanimation (+ TOR-Regeln)
const EOL_Q = [
  { k: 'safety', crit: true, q: 'Ist die Sicherheit des Teams nicht mehr gewährleistet?' },
  { k: 'death', crit: true, q: 'Liegen sichere Todeszeichen oder mit dem Leben nicht vereinbare Verletzungen vor?' },
  { k: 'directive', crit: true, q: 'Liegt eine gültige Patientenverfügung / ein dokumentierter Wille gegen Reanimation (DNACPR) vor?' },
  { k: 'values', crit: true, q: 'Gibt es starke Hinweise, dass die Reanimation dem Willen bzw. den Werten des Patienten widerspricht oder aussichtslos ist?' },
  { k: 'asys20', crit: true, q: 'Besteht seit > 20 min eine Asystolie trotz laufender ALS-Maßnahmen ohne behebbare Ursache?' },
  { k: 'rev', q: 'Wurden reversible Ursachen (4 H / HITS) systematisch geprüft und behandelt?' },
  { k: 'special', cont: true, q: 'Liegt eine Sondersituation vor, die eine verlängerte Reanimation rechtfertigt (Hypothermie, Intoxikation, Ertrinken, LAE mit Lyse, Schwangerschaft, Kind)?' },
  { k: 'ecpr', cont: true, q: 'Ist der Patient Kandidat für eCPR / Transport unter mechanischer Reanimation (beobachtet, Laien-CPR, kurze No-Flow-Zeit, refraktär schockbar, Zentrum erreichbar)?' },
  { k: 'rosc', cont: true, q: 'Gab es zu irgendeinem Zeitpunkt einen ROSC?' },
  { k: 'tor1', q: 'TOR-Regel: Kreislaufstillstand NICHT vom Rettungsdienst beobachtet?' },
  { k: 'tor2', q: 'TOR-Regel: Kein Schock abgegeben?' },
  { k: 'tor3', q: 'TOR-Regel (ALS): Nicht von Laien beobachtet UND keine Laienreanimation?' },
  { k: 'etco2', q: 'EtCO₂ nach 20 min ALS dauerhaft < 10 mmHg? (nur in Zusammenschau verwertbar)' },
  { k: 'family', q: 'Wurden Angehörige informiert und einbezogen?' },
];

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
const clock = (t) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const dur = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};
const num = (x) => {
  const n = parseFloat(String(x ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const de = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');

function ageYears(p) {
  const a = num(p.age);
  if (a == null) return null;
  return p.ageUnit === 'M' ? a / 12 : a;
}
// Gewichtsschätzung (APLS/ERC-übliche Formeln)
function estWeight(p) {
  const y = ageYears(p);
  if (y == null) return null;
  if (y < 1) return Math.round((y * 12) / 2 + 4);
  if (y <= 5) return Math.round(y * 2 + 8);
  if (y <= 12) return Math.round(y * 3 + 7);
  return null;
}
function ageLabel(p) {
  if (num(p.age) == null) return '';
  return `${p.age} ${p.ageUnit === 'M' ? 'Mon.' : 'J.'}`;
}

function getDoses(p) {
  if (p.type !== 'child') {
    return {
      child: false,
      adr: 1, adrTxt: '1 mg i.v./i.o. (1 mg/10 ml → 10 ml)',
      amio1: 300, amio2: 150, amioTxt: '300 mg nach 3. Schock, 150 mg nach 5. Schock',
      lido1: 100, lido2: 50, lidoTxt: '100 mg (alternativ zu Amiodaron), 50 mg nach 5. Schock',
      energies: [150, 200, 360],
      shockTxt: 'Biphasisch ≥ 150 J (herstellerabhängig 150–200 J), bei Folgeschocks ggf. eskalieren bis 360 J.',
      ratio: '30 : 2', depth: '5–6 cm',
      vent: 'Mit SGA/ETI: durchgehend komprimieren, 10 Beatmungen/min',
    };
  }
  const w = num(p.weight);
  const base = {
    child: true,
    ratio: '15 : 2', depth: '≥ ⅓ Thoraxtiefe (Säugling ≈ 4 cm, Kind ≈ 5 cm)',
    vent: 'Mit SGA/ETI: durchgehend komprimieren; Beatmung Säugling 25, 1–8 J 20, 8–12 J 15, > 12 J 10 /min',
  };
  if (!w) {
    return {
      ...base, noWeight: true,
      adr: null, adrTxt: '10 µg/kg (max. 1 mg) – GEWICHT FEHLT',
      amio1: null, amio2: null, amioTxt: '5 mg/kg (max. 300 mg) – GEWICHT FEHLT',
      lido1: null, lido2: null, lidoTxt: '1 mg/kg (max. 100 mg) – GEWICHT FEHLT',
      energies: [], shockTxt: '4 J/kg – GEWICHT FEHLT',
    };
  }
  const adr = Math.min(0.01 * w, 1);
  const amio = Math.min(5 * w, 300);
  const lido = Math.min(1 * w, 100);
  const j1 = Math.min(Math.round(4 * w), 200);
  const j2 = Math.min(Math.round(8 * w), 360);
  return {
    ...base,
    adr: Math.round(adr * 100) / 100,
    adrTxt: `10 µg/kg = ${Math.round(adr * 1000)} µg = ${de(adr)} mg = ${de(adr * 10, 1)} ml (1 mg/10 ml), max. 1 mg`,
    amio1: Math.round(amio), amio2: Math.round(amio),
    amioTxt: `5 mg/kg = ${Math.round(amio)} mg (${de(amio / 50, 1)} ml à 50 mg/ml) nach 3. und 5. Schock`,
    lido1: Math.round(lido), lido2: Math.round(lido),
    lidoTxt: `1 mg/kg = ${Math.round(lido)} mg (${de(lido / 20, 1)} ml Lidocain 2 %), alternativ zu Amiodaron`,
    energies: [j1, j2],
    shockTxt: `4 J/kg = ${j1} J (max. Erwachsenendosis). Refraktär (> 5 Schocks): bis 8 J/kg = ${j2} J erwägen.`,
  };
}

/* ------------------------------------------------------------------ */
/* Sound: WAV wird im Code erzeugt → keine externen Dateien nötig      */
/* ------------------------------------------------------------------ */

const SR = 16000;
function synth(parts) {
  const total = parts.reduce((s, p) => s + Math.floor((SR * p.ms) / 1000), 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    const n = Math.floor((SR * p.ms) / 1000);
    for (let i = 0; i < n; i++) {
      let v = 0;
      if (p.f) {
        const env = p.decay
          ? Math.exp(-i / (SR * p.decay))
          : Math.min(1, i / 80, (n - i) / 80);
        v = Math.sin((2 * Math.PI * p.f * i) / SR) * env * (p.vol || 0.8);
        if (p.f2) v += Math.sin((2 * Math.PI * p.f2 * i) / SR) * env * 0.3;
      }
      out[o++] = v;
    }
  }
  return out;
}
function wav(samples) {
  const n = samples.length;
  const buf = new Uint8Array(44 + n * 2);
  const dv = new DataView(buf.buffer);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, v * 32767, true);
  }
  return buf;
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(b) {
  let s = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const r = b.length - i;
  if (r === 1) {
    const n = b[i] << 16;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (r === 2) {
    const n = (b[i] << 16) | (b[i + 1] << 8);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return s;
}
// Ton als WAV-Daten direkt im Code (keine Dateien, keine Downloads)
function soundUri(bytes) {
  return 'data:audio/wav;base64,' + toB64(bytes);
}

const Sound = {
  ready: false,
  click: [],
  alarm: null,
  i: 0,
  async load(uri) {
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false, volume: 1 });
    return sound;
  },
  async init() {
    if (this.ready) return;
    this.ready = true;
    if (!Audio) return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
    } catch (e) {}
    try {
      const cu = soundUri(wav(synth([{ f: 1800, f2: 3600, ms: 45, decay: 0.012, vol: 0.95 }])));
      this.click = [await this.load(cu), await this.load(cu)];
      const beep = [];
      for (let k = 0; k < 3; k++) {
        beep.push({ f: 988, ms: 170, vol: 0.9 }, { ms: 60 }, { f: 784, ms: 170, vol: 0.9 }, { ms: 140 });
      }
      this.alarm = await this.load(soundUri(wav(synth(beep))));
    } catch (e) {
      console.warn('Audio nicht verfügbar', e);
    }
  },
  playClick() {
    const p = this.click[this.i++ % 2];
    if (!p) {
      // ohne Ton: kurzer Vibrationsimpuls pro Schlag (nur Android)
      if (Platform.OS === 'android') Vibration.vibrate(35);
      return;
    }
    p.replayAsync().catch(() => {});
  },
  playAlarm() {
    Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    if (this.alarm) this.alarm.replayAsync().catch(() => {});
  },
};

/* ------------------------------------------------------------------ */
/* UI-Bausteine                                                        */
/* ------------------------------------------------------------------ */

function Tile({ label, sub, color = C.surface2, onPress, style, icon, big, disabled }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={disabled}
      onPress={onPress}
      style={[s.tile, { backgroundColor: color, opacity: disabled ? 0.4 : 1 }, big && s.tileBig, style]}>
      {icon ? <Text style={s.tileIcon}>{icon}</Text> : null}
      <Text style={[s.tileTxt, big && { fontSize: 22 }]} numberOfLines={2}>{label}</Text>
      {sub ? <Text style={s.tileSub} numberOfLines={2}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

function Chips({ options, value, onChange, small }) {
  return (
    <View style={s.chips}>
      {options.map(([v, l, col]) => {
        const on = value === v;
        return (
          <TouchableOpacity
            key={String(v)}
            onPress={() => onChange(on ? '' : v)}
            style={[s.chip, small && s.chipSmall, on && { backgroundColor: col || C.blue, borderColor: col || C.blue }]}>
            <Text style={[s.chipTxt, small && { fontSize: 13 }, on && { color: '#fff' }]}>{l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Stat({ label, value, color = C.text, sub, wide }) {
  return (
    <View style={[s.stat, wide && s.statWide]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statVal, { color }]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={s.statSub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

// Ein einziger Modal-Host für alle Auswahl- und Eingabedialoge
function Dialog({ d, close }) {
  const [v, setV] = useState('');
  useEffect(() => {
    setV(d && d.kind === 'input' ? d.value || '' : '');
  }, [d && d.id]);
  const submit = () => {
    if (!d.allowEmpty && !v.trim()) return;
    const fn = d.onSubmit;
    close();
    fn && fn(v.trim());
  };
  return (
    <Modal transparent visible={!!d} animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        {d ? (
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{d.title}</Text>
            {d.message ? <Text style={s.sheetMsg}>{d.message}</Text> : null}
            {d.kind === 'choice' ? (
              <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
                {d.options.map((o, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.option, { backgroundColor: o.color || C.surface2 }]}
                    onPress={() => { close(); o.onPress && o.onPress(); }}>
                    <Text style={s.optionTxt}>{o.label}</Text>
                    {o.sub ? <Text style={s.optionSub}>{o.sub}</Text> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View>
                <View style={s.inputRow}>
                  <TextInput
                    value={v}
                    onChangeText={setV}
                    autoFocus
                    keyboardType={d.keyboardType || 'default'}
                    placeholder={d.placeholder}
                    placeholderTextColor={C.dim}
                    multiline={!!d.multiline}
                    style={[s.input, { flex: 1 }, d.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
                    onSubmitEditing={d.multiline ? undefined : submit}
                  />
                  {d.suffix ? <Text style={s.suffix}>{d.suffix}</Text> : null}
                </View>
                <TouchableOpacity style={[s.option, { backgroundColor: C.blue }]} onPress={submit}>
                  <Text style={s.optionTxt}>{d.submitLabel || 'Speichern'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {d.noCancel ? null : (
              <TouchableOpacity style={s.cancel} onPress={close}>
                <Text style={s.cancelTxt}>Abbrechen</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const emptyPatient = () => ({
  type: '', age: '', ageUnit: 'J', weight: '', weightEst: false, sex: '',
  witnessed: '', bystander: '', initialRhythm: '', cause: '',
});

export default function App() {
  useKeepAwake();
  const [phase, setPhase] = useState('home'); // home | setup | run | end
  const [patient, setPatient] = useState(emptyPatient());
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [endReason, setEndReason] = useState('');
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('cpr'); // cpr | rosc
  const [cycleStart, setCycleStart] = useState(null);
  const [alarmDone, setAlarmDone] = useState(false);
  const [shockPending, setShockPending] = useState(false);
  const [metroOn, setMetroOn] = useState(true);
  const [bpm, setBpm] = useState(110);
  const [hits, setHits] = useState({});
  const [eolAns, setEolAns] = useState({});
  const [eolNextAt, setEolNextAt] = useState(Infinity);
  const [view, setView] = useState('main'); // main | hits | eol | patient | log
  const [dialog, setDialog] = useState(null);
  const [now, setNow] = useState(Date.now());
  const pulse = useRef(new Animated.Value(1)).current;
  const idRef = useRef(0);

  const ask = (cfg) => setDialog({ ...cfg, kind: 'choice', id: ++idRef.current });
  const prompt = (cfg) => setDialog({ ...cfg, kind: 'input', id: ++idRef.current });
  const closeDialog = () => setDialog(null);
  const log = (type, text, data = {}) =>
    setEvents((ev) => [...ev, { t: Date.now(), type, text, data }]);

  /* ---------- Abgeleitete Werte ---------- */
  const D = useMemo(() => getDoses(patient), [patient]);
  const isChild = patient.type === 'child';
  const count = (ty) => events.filter((e) => e.type === ty).length;
  const lastOf = (ty) => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].type === ty) return events[i];
    return null;
  };
  const shocks = count('shock');
  const adrN = count('adr');
  const amioN = count('amio');
  const lidoN = count('lido');
  const lastAdr = lastOf('adr');
  const lastEt = lastOf('etco2');
  const lastShock = lastOf('shock');
  const analyses = events.filter((e) => e.type === 'analysis');
  const rhythm = analyses.length ? analyses[analyses.length - 1].data.r : patient.initialRhythm || '';
  const initialRhythm = patient.initialRhythm || (analyses[0] ? analyses[0].data.r : '');
  const airways = events.filter((e) => e.type === 'airway');
  const advancedAirway = airways.some((e) => e.data.kind === 'SGA' || e.data.kind === 'ETI');
  const accesses = events.filter((e) => e.type === 'access');
  const hadRosc = events.some((e) => e.type === 'rosc');
  const elapsed = startTime ? (endTime || now) - startTime : 0;

  let asysSince = null;
  if (rhythm === 'ASY' && analyses.length) {
    for (let i = analyses.length - 1; i >= 0 && analyses[i].data.r === 'ASY'; i--) asysSince = analyses[i].t;
  }

  /* ---------- Timer ---------- */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Metronom
  useEffect(() => {
    if (phase !== 'run' || status !== 'cpr' || !metroOn) return;
    let alive = true;
    let to;
    let next = Date.now();
    const tick = () => {
      if (!alive) return;
      Sound.playClick();
      pulse.setValue(1.18);
      Animated.timing(pulse, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
      next += 60000 / bpm;
      to = setTimeout(tick, Math.max(0, next - Date.now()));
    };
    tick();
    return () => { alive = false; clearTimeout(to); };
  }, [phase, status, metroOn, bpm]);

  // 2-min-Alarm & End-of-Life-Abfrage
  useEffect(() => {
    if (phase !== 'run') return;
    if (status === 'cpr' && cycleStart && !alarmDone && now - cycleStart >= CYCLE_MS) {
      setAlarmDone(true);
      Sound.playAlarm();
      log('alarm', '⏰ 2 min um – Rhythmusanalyse fällig, Drückerwechsel');
    }
    if (status === 'cpr' && now >= eolNextAt) {
      setEolNextAt(Infinity);
      Sound.playAlarm();
      setDialog(null);
      setView('eol');
      log('info', `${Math.round((now - startTime) / 60000)} min Reanimation – End-of-Life-Entscheidung (ERC) erfragt`);
    }
  }, [now]);

  /* ---------- Aktionen ---------- */
  const startCycle = () => { setCycleStart(Date.now()); setAlarmDone(false); };

  const startRea = () => {
    const t = Date.now();
    let p = { ...patient };
    if (p.type === 'child' && !num(p.weight)) {
      const w = estWeight(p);
      if (w) p = { ...p, weight: String(w), weightEst: true };
    }
    setPatient(p);
    setStartTime(t);
    setEndTime(null);
    setEndReason('');
    setStatus('cpr');
    setCycleStart(null);
    setAlarmDone(false);
    setShockPending(false);
    setHits({});
    setEolAns({});
    setEolNextAt(t + EOL_MS);
    setMetroOn(true);
    setView('main');
    const desc = [
      p.type === 'child' ? 'Kind (PLS)' : 'Erwachsener (ALS)',
      ageLabel(p),
      num(p.weight) ? `${p.weight} kg${p.weightEst ? ' (geschätzt)' : ''}` : '',
    ].filter(Boolean).join(', ');
    setEvents([{ t, type: 'start', text: `Reanimationsbeginn – ${desc}`, data: {} }]);
    setPhase('run');
  };

  const doAnalysis = () => ask({
    title: `Rhythmusanalyse #${analyses.length + 1}`,
    message: 'Kompressionspause so kurz wie möglich (< 5 s)!',
    options: [
      { label: '⚡ VF – Kammerflimmern', sub: 'schockbar', color: C.orange, onPress: () => afterAnalysis('VF') },
      { label: '⚡ pVT – pulslose VT', sub: 'schockbar', color: C.orange, onPress: () => afterAnalysis('pVT') },
      { label: 'Asystolie', sub: 'nicht schockbar', color: C.indigo, onPress: () => afterAnalysis('ASY') },
      { label: 'PEA', sub: 'nicht schockbar', color: C.indigo, onPress: () => afterAnalysis('PEA') },
      { label: '♥ ROSC – Lebenszeichen', color: C.green, onPress: () => doRosc() },
    ],
  });

  const afterAnalysis = (r) => {
    const n = analyses.length + 1;
    log('analysis', `Analyse #${n}: ${RHYTHMS[r]} (${SHOCKABLE(r) ? 'schockbar' : 'nicht schockbar'})`, { r });
    if (SHOCKABLE(r)) {
      setCycleStart(null);
      setShockPending(true);
      doShock();
    } else {
      setShockPending(false);
      startCycle();
      if (adrN === 0) {
        ask({
          title: 'Nicht schockbarer Rhythmus',
          message: 'ERC: Adrenalin so früh wie möglich geben. CPR sofort fortsetzen.',
          options: [{ label: `💉 Adrenalin jetzt dokumentieren`, color: C.red, onPress: () => giveDrug('adr') }],
        });
      }
    }
  };

  const doShock = () => {
    const opts = (isChild
      ? D.energies.map((j, i) => ({ label: `⚡ ${j} J`, sub: i === 0 ? '4 J/kg' : '8 J/kg – nur refraktär', j }))
      : D.energies.map((j) => ({ label: `⚡ ${j} J`, j }))
    ).map((o) => ({ ...o, color: C.orange, onPress: () => confirmShock(o.j) }));
    opts.push({
      label: 'Andere Energie …',
      onPress: () => prompt({
        title: 'Energie', keyboardType: 'numeric', suffix: 'J', submitLabel: 'Schock dokumentieren',
        onSubmit: (v) => { const j = num(v); if (j) confirmShock(j); },
      }),
    });
    opts.push({
      label: 'Kein Schock – CPR fortsetzen', color: C.grey,
      onPress: () => { setShockPending(false); log('info', 'Kein Schock abgegeben – CPR fortgesetzt'); startCycle(); },
    });
    ask({
      title: `Schock #${shocks + 1}`,
      message: `${D.shockTxt}\n\nNach dem Schock SOFORT 2 min CPR!`,
      options: opts,
    });
  };

  const confirmShock = (j) => {
    log('shock', `⚡ Schock #${shocks + 1}: ${j} J`, { j });
    setShockPending(false);
    startCycle();
  };

  const giveDrug = (kind) => {
    let title, mg, info, warn = [];
    const shockableNow = SHOCKABLE(rhythm);
    if (kind === 'adr') {
      title = `Adrenalin – ${adrN + 1}. Gabe`;
      mg = D.adr;
      info = `${D.adrTxt}\nWiederholung alle 3–5 min.`;
      if (lastAdr && now - lastAdr.t < 180000) warn.push(`Letzte Gabe erst vor ${dur(now - lastAdr.t)} min`);
      if (shockableNow && shocks < 3 && adrN === 0) warn.push(`Schockbar: ERC empfiehlt Adrenalin erst nach dem 3. Schock (bisher ${shocks})`);
    } else if (kind === 'amio') {
      title = `Amiodaron – ${amioN + 1}. Gabe`;
      mg = amioN >= 1 ? D.amio2 : D.amio1;
      info = D.amioTxt;
      if (amioN >= 2) warn.push('ERC sieht max. 2 Gaben vor');
      if (lidoN > 0) warn.push('Lidocain wurde bereits gegeben');
      if (!shockableNow) warn.push('Nur bei schockrefraktärem VF/pVT indiziert');
      else if (shocks < 3) warn.push(`Indikation nach 3. Schock (bisher ${shocks})`);
    } else {
      title = `Lidocain – ${lidoN + 1}. Gabe`;
      mg = lidoN >= 1 ? D.lido2 : D.lido1;
      info = D.lidoTxt;
      if (amioN > 0) warn.push('Amiodaron wurde bereits gegeben');
      if (!shockableNow) warn.push('Nur bei schockrefraktärem VF/pVT indiziert');
    }
    if (mg == null) warn.push('Kein Gewicht hinterlegt – Dosis manuell eingeben');
    const name = { adr: 'Adrenalin', amio: 'Amiodaron', lido: 'Lidocain' }[kind];
    const n = { adr: adrN, amio: amioN, lido: lidoN }[kind] + 1;
    prompt({
      title,
      message: info + (warn.length ? '\n\n⚠️ ' + warn.join('\n⚠️ ') : ''),
      value: mg != null ? de(mg) : '',
      keyboardType: 'decimal-pad',
      suffix: 'mg',
      submitLabel: '💉 Gabe dokumentieren',
      onSubmit: (v) => {
        const d = num(v);
        if (d == null) return;
        const acc = accesses.length ? accesses[accesses.length - 1].data.kind : '';
        log(kind, `💉 ${name} ${de(d)} mg${acc ? ' ' + acc : ''} (${n}. Gabe)`, { mg: d });
      },
    });
  };

  const doAccess = () => ask({
    title: 'Zugang',
    options: [
      { label: 'i.v. – periphervenös', color: C.teal, onPress: () => accessSite('i.v.', ['Handrücken', 'Unterarm', 'Ellenbeuge', 'V. jugularis externa', 'Fuß / Sonstige']) },
      { label: 'i.o. – intraossär', color: C.teal, onPress: () => accessSite('i.o.', ['Proximale Tibia', 'Proximaler Humerus', 'Distale Tibia', 'Distaler Femur (Kind)']) },
      { label: 'Zugang frustran', color: C.grey, onPress: () => log('access', 'Zugangsversuch frustran', { kind: '' }) },
    ],
  });
  const accessSite = (kind, sites) => ask({
    title: `${kind} – Lokalisation`,
    options: sites.map((si) => ({
      label: si,
      onPress: () => ask({
        title: `${kind} ${si}`, message: 'Seite',
        options: ['links', 'rechts', 'k. A.'].map((side) => ({
          label: side,
          onPress: () => log('access', `Zugang ${kind}: ${si}${side !== 'k. A.' ? ' ' + side : ''}`, { kind }),
        })),
      }),
    })),
  });

  const doSGA = () => ask({
    title: 'Atemweg',
    options: [
      ...['i-gel', 'Larynxtubus (LTS-D)', 'Larynxmaske'].map((x) => ({
        label: `SGA: ${x}`, color: C.indigo,
        onPress: () => prompt({
          title: `${x} – Größe`, keyboardType: 'decimal-pad', placeholder: 'z. B. 4 (optional)', allowEmpty: true,
          submitLabel: 'SGA dokumentieren',
          onSubmit: (v) => log('airway', `🫁 SGA ${x}${v ? ' Gr. ' + v : ''} – Kapnographie angeschlossen`, { kind: 'SGA' }),
        }),
      })),
      { label: 'Beutel-Masken-Beatmung', onPress: () => log('airway', '🫁 Beutel-Masken-Beatmung', { kind: 'BMV' }) },
    ],
  });

  const doETI = () => prompt({
    title: 'Endotracheale Intubation',
    message: 'Tubusgröße (ID mm). Unterbrechung der Kompressionen < 5 s!',
    placeholder: isChild ? 'z. B. 5,0 (optional)' : 'z. B. 7,5 (optional)',
    keyboardType: 'decimal-pad', allowEmpty: true, submitLabel: 'Weiter zur Lagekontrolle',
    onSubmit: (v) => ask({
      title: 'Lagekontrolle',
      message: 'ERC: Kapnographie zur Lagekontrolle obligat.',
      options: [
        { label: '✓ Lage bestätigt (Kapnographie)', color: C.green, onPress: () => log('airway', `🫁 ETI${v ? ' Tubus ID ' + v : ''} – Lage bestätigt (Kapnographie)`, { kind: 'ETI' }) },
        { label: '✗ Fehllage / Tubus entfernt', color: C.red, onPress: () => log('airway', `🫁 ETI${v ? ' ID ' + v : ''} – Fehllage, Tubus entfernt`, { kind: 'ETI-fail' }) },
      ],
    }),
  });

  const doEtco2 = () => prompt({
    title: 'EtCO₂',
    message: 'Bei guter CPR meist > 20 mmHg. Plötzlicher Anstieg → an ROSC denken.',
    keyboardType: 'numeric', suffix: 'mmHg', submitLabel: 'Wert dokumentieren',
    onSubmit: (v) => {
      const x = num(v);
      if (x == null) return;
      let note = '';
      if (lastEt && x - lastEt.data.v >= 10) note = ' – deutlicher Anstieg: ROSC?';
      else if (x < 10) note = ' – niedrig: CPR-Qualität / Tubuslage prüfen';
      log('etco2', `EtCO₂ ${x} mmHg${note}`, { v: x });
    },
  });

  const setCause = (c) => {
    setPatient((p) => ({ ...p, cause: c }));
    log('cause', `Vermutete Ursache: ${c}`);
  };
  const doCause = () => ask({
    title: 'Vermutete Ursache',
    options: [
      ...CAUSES.map((c) => ({ label: c, onPress: () => setCause(c) })),
      { label: 'Freitext …', color: C.grey, onPress: () => prompt({ title: 'Vermutete Ursache', onSubmit: setCause }) },
    ],
  });

  const doNote = () => prompt({ title: 'Notiz', multiline: true, placeholder: 'z. B. Medikamente, Befunde, Team …', onSubmit: (v) => log('note', `📝 ${v}`) });

  const doRosc = () => {
    setStatus('rosc');
    setCycleStart(null);
    setShockPending(false);
    log('rosc', '♥ ROSC – Spontankreislauf');
    ask({
      title: '♥ ROSC',
      message: 'Post-ROSC-Versorgung (ERC 2021):\n• ABCDE, 12-Kanal-EKG\n• SpO₂ 94–98 %, Normokapnie\n• RR syst. > 100 mmHg / MAD > 65 mmHg\n• Fieber vermeiden, Temperaturkontrolle\n• Zielklinik mit Herzkatheter',
      noCancel: true,
      options: [{ label: 'Verstanden', color: C.green }],
    });
  };

  const doRearrest = () => {
    setStatus('cpr');
    setCycleStart(null);
    log('rearrest', 'Erneuter Kreislaufstillstand – CPR wieder aufgenommen');
    doAnalysis();
  };

  const finish = (reason) => {
    setEndTime(Date.now());
    setEndReason(reason);
    setCycleStart(null);
    log('end', `Einsatzende: ${reason}`);
    setView('main');
    setPhase('end');
  };

  const doEnd = () => ask({
    title: 'Einsatz beenden',
    message: 'Zeiten werden gestoppt, danach folgt die Auswertung.',
    options: [
      { label: '♥ ROSC – Übergabe Klinik', color: C.green, onPress: () => finish('ROSC – Übergabe an Klinik') },
      { label: 'Transport unter laufender CPR / eCPR', color: C.orange, onPress: () => finish('Übergabe unter laufender Reanimation') },
      { label: 'Reanimation beendet – Tod festgestellt', color: C.redDark, onPress: () => finish('Reanimation beendet – Tod festgestellt') },
    ],
  });

  const eolDecision = (dec) => {
    const yes = EOL_Q.filter((q) => eolAns[q.k] === 'Ja').map((q) => q.k);
    log('eol', `End-of-Life-Abfrage (ERC): ${dec}`, { answers: { ...eolAns }, yes });
    setView('main');
    if (dec === 'Reanimation beenden') {
      ask({
        title: 'Reanimation wirklich beenden?',
        message: 'Die Entscheidung trifft das Team / der Notarzt. Todeszeitpunkt = jetzt.',
        options: [{ label: 'Ja – Tod festgestellt', color: C.redDark, onPress: () => finish('Reanimation beendet – Tod festgestellt (End-of-Life-Entscheidung)') }],
      });
    } else {
      setEolNextAt(Date.now() + EOL_REPEAT_MS);
    }
  };

  const resetAll = () => {
    setPhase('home');
    setPatient(emptyPatient());
    setEvents([]);
    setStartTime(null);
    setEndTime(null);
    setEndReason('');
    setEolNextAt(Infinity);
    setView('main');
  };

  /* ---------- Protokoll ---------- */
  const buildProtocol = () => {
    const st = startTime;
    const rel = (t) => '+' + dur(t - st);
    const L = [];
    const yn = (v) => (v === 'ja' ? 'Ja' : v === 'nein' ? 'Nein' : 'k. A.');
    L.push('REANIMATIONSPROTOKOLL');
    L.push('══════════════════════════');
    L.push(`Datum: ${new Date(st).toLocaleDateString('de-DE')}`);
    L.push(`Beginn: ${clock(st)}   Ende: ${endTime ? clock(endTime) : 'laufend'}`);
    L.push(`Dauer: ${dur((endTime || Date.now()) - st)} min`);
    if (endReason) L.push(`Ergebnis: ${endReason}`);
    L.push('');
    L.push('PATIENT');
    L.push(`Typ: ${isChild ? 'Kind (PLS-Algorithmus)' : 'Erwachsener (ALS-Algorithmus)'}`);
    L.push(`Alter: ${ageLabel(patient) || 'k. A.'}   Gewicht: ${num(patient.weight) ? patient.weight + ' kg' + (patient.weightEst ? ' (geschätzt)' : '') : 'k. A.'}   Geschlecht: ${patient.sex || 'k. A.'}`);
    L.push(`Beobachteter Stillstand: ${yn(patient.witnessed)}   Laienreanimation: ${yn(patient.bystander)}`);
    L.push(`Initialer Rhythmus: ${initialRhythm ? RHYTHMS[initialRhythm] : 'k. A.'}`);
    L.push(`Vermutete Ursache: ${patient.cause || 'k. A.'}`);
    L.push('');
    L.push('ZUSAMMENFASSUNG');
    const sum = (ty) => events.filter((e) => e.type === ty).reduce((a, e) => a + (e.data.mg || 0), 0);
    L.push(`Analysen: ${analyses.length}   Schocks: ${shocks}${shocks ? ' (' + events.filter((e) => e.type === 'shock').map((e) => e.data.j + ' J').join(', ') + ')' : ''}`);
    L.push(`Adrenalin: ${adrN}× (gesamt ${de(sum('adr'))} mg)`);
    L.push(`Amiodaron: ${amioN}× (gesamt ${de(sum('amio'))} mg)   Lidocain: ${lidoN}× (gesamt ${de(sum('lido'))} mg)`);
    L.push(`Atemweg: ${airways.length ? airways.map((e) => e.text.replace('🫁 ', '')).join('; ') : 'k. A.'}`);
    L.push(`Zugang: ${accesses.length ? accesses.map((e) => e.text).join('; ') : 'k. A.'}`);
    L.push(`ROSC: ${hadRosc ? 'Ja' : 'Nein'}`);
    L.push('');
    L.push('RHYTHMUSVERLAUF');
    if (!analyses.length) L.push('–');
    analyses.forEach((e) => L.push(`${clock(e.t)} (${rel(e.t)})  ${RHYTHMS[e.data.r]}`));
    L.push('');
    L.push('EtCO₂-VERLAUF');
    const et = events.filter((e) => e.type === 'etco2');
    if (!et.length) L.push('–');
    et.forEach((e) => L.push(`${clock(e.t)} (${rel(e.t)})  ${e.data.v} mmHg`));
    L.push('');
    L.push('REVERSIBLE URSACHEN (4 H / HITS)');
    HITS.forEach((h) => L.push(`${h.g}  ${h.l}: ${hits[h.k] ? hits[h.k].st + ' (' + clock(hits[h.k].t) + ')' : 'nicht dokumentiert'}`));
    const eolEv = events.filter((e) => e.type === 'eol');
    if (eolEv.length) {
      L.push('');
      L.push('END-OF-LIFE-ABFRAGE (ERC 2021)');
      const lastE = eolEv[eolEv.length - 1];
      EOL_Q.forEach((q) => L.push(`• ${q.q} → ${lastE.data.answers[q.k] || 'k. A.'}`));
      eolEv.forEach((e) => L.push(`${clock(e.t)} (${rel(e.t)})  Entscheidung: ${e.text.split(': ').pop()}`));
    }
    L.push('');
    L.push('CHRONOLOGIE');
    events.forEach((e) => L.push(`${clock(e.t)} (${rel(e.t)})  ${e.text}`));
    L.push('');
    L.push('Erstellt mit REA-Assist – Trainings-/Dokumentationshilfe, kein Medizinprodukt.');
    return L.join('\n');
  };

  const shareProtocol = async () => {
    const message = buildProtocol();
    try {
      await Share.share({ message, title: 'Reanimationsprotokoll' });
    } catch (e) {
      ask({ title: 'Teilen nicht möglich', message: 'Bitte Text im Protokoll markieren und kopieren.', options: [] });
    }
  };

  /* ---------- Hinweise (ERC-Algorithmus) ---------- */
  const hints = [];
  if (phase === 'run' && status === 'cpr') {
    const shockableNow = SHOCKABLE(rhythm);
    if (!analyses.length) hints.push([C.blue, 'Pads kleben → erste Rhythmusanalyse so früh wie möglich']);
    if (adrN === 0) {
      if (rhythm && !shockableNow) hints.push([C.red, 'Nicht schockbar: Adrenalin SOFORT']);
      if (shockableNow && shocks >= 3) hints.push([C.red, 'Adrenalin nach 3. Schock fällig']);
    } else if (lastAdr) {
      const since = now - lastAdr.t;
      if (since >= 180000) hints.push([since >= 300000 ? C.red : C.yellow, `Adrenalin fällig (letzte Gabe vor ${dur(since)})`]);
    }
    const anti = amioN + lidoN;
    if (shockableNow && shocks >= 3 && anti === 0) hints.push([C.purple, `Antiarrhythmikum: Amiodaron ${D.amio1 ?? '5 mg/kg'}${D.amio1 ? ' mg' : ''} (alternativ Lidocain)`]);
    if (shockableNow && shocks >= 5 && anti === 1) hints.push([C.purple, `2. Antiarrhythmikum-Gabe nach 5. Schock`]);
    if (isChild && D.noWeight) hints.push([C.yellow, 'Kein Gewicht hinterlegt → unter „Patient“ eintragen']);
    if (elapsed > 4 * 60000 && Object.keys(hits).length === 0) hints.push([C.teal, 'Reversible Ursachen (4 H / HITS) prüfen']);
    if (!accesses.length && elapsed > 2 * 60000) hints.push([C.dim, 'Zugang i.v. / i.o. legen']);
    if (asysSince && now - asysSince > 20 * 60000) hints.push([C.dim, `Asystolie seit ${dur(now - asysSince)} – Beendigung erwägen (ERC)`]);
  }

  /* ================================================================ */
  /* RENDER                                                           */
  /* ================================================================ */

  const wrap = (children) => (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {children}
      <Dialog d={dialog} close={closeDialog} />
    </SafeAreaView>
  );

  /* ---------- Startbildschirm ---------- */
  if (phase === 'home') {
    return wrap(
      <ScrollView contentContainerStyle={s.homeWrap}>
        <Text style={s.brand}>REA<Text style={{ color: C.red }}>·</Text>Assist</Text>
        <Text style={s.brandSub}>Reanimations-Assistent · ERC 2021</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          style={s.startBtn}
          onPress={() => { Sound.init(); setPatient(emptyPatient()); setPhase('setup'); }}>
          <Text style={s.startTxt}>START</Text>
          <Text style={s.startSub}>Reanimation</Text>
        </TouchableOpacity>
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTitle}>⚠️ Kein Medizinprodukt</Text>
          <Text style={s.disclaimerTxt}>
            Trainings- und Dokumentationshilfe, orientiert an den ERC-Leitlinien 2021.
            Ersetzt weder Ausbildung, lokale SOPs noch ärztliche Entscheidungen.
            Alle Dosierungen vor Gabe eigenständig prüfen.
          </Text>
        </View>
      </ScrollView>
    );
  }

  /* ---------- Patientenauswahl ---------- */
  if (phase === 'setup') {
    const est = estWeight(patient);
    return wrap(
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => setPhase('home')}><Text style={s.back}>‹ Zurück</Text></TouchableOpacity>
        <Text style={s.h1}>Wer wird reanimiert?</Text>
        <View style={s.row}>
          <TouchableOpacity
            style={[s.typeBtn, patient.type === 'adult' && { borderColor: C.red, backgroundColor: '#2A0F14' }]}
            onPress={() => setPatient((p) => ({ ...p, type: 'adult' }))}>
            <Text style={s.typeIcon}>🧍</Text>
            <Text style={s.typeTxt}>Erwachsener</Text>
            <Text style={s.typeSub}>ALS · 30:2</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.typeBtn, patient.type === 'child' && { borderColor: C.teal, backgroundColor: '#0D2229' }]}
            onPress={() => setPatient((p) => ({ ...p, type: 'child' }))}>
            <Text style={s.typeIcon}>🧒</Text>
            <Text style={s.typeTxt}>Kind</Text>
            <Text style={s.typeSub}>PLS · 15:2</Text>
          </TouchableOpacity>
        </View>

        {patient.type ? (
          <View style={s.card}>
            <Text style={s.label}>Alter {patient.type === 'adult' ? '(optional)' : ''}</Text>
            <View style={s.row}>
              <TextInput
                style={[s.input, { flex: 1 }]} keyboardType="decimal-pad" placeholder="Alter"
                placeholderTextColor={C.dim} value={patient.age}
                onChangeText={(v) => setPatient((p) => ({ ...p, age: v }))} />
              {patient.type === 'child' ? (
                <Chips small value={patient.ageUnit}
                  onChange={(v) => setPatient((p) => ({ ...p, ageUnit: v || 'J' }))}
                  options={[['J', 'Jahre'], ['M', 'Monate']]} />
              ) : null}
            </View>
            {patient.type === 'child' ? (
              <>
                <Text style={s.label}>Gewicht (kg)</Text>
                <TextInput
                  style={s.input} keyboardType="decimal-pad"
                  placeholder={est ? `geschätzt ${est} kg` : 'Gewicht in kg'}
                  placeholderTextColor={C.dim} value={patient.weight}
                  onChangeText={(v) => setPatient((p) => ({ ...p, weight: v, weightEst: false }))} />
                <Text style={s.hintSmall}>
                  {est && !num(patient.weight)
                    ? `Ohne Eingabe wird ${est} kg (Formel nach Alter) übernommen.`
                    : 'Gewicht bestimmt alle Kinder-Dosierungen (Adrenalin, Amiodaron, Lidocain, Joule).'}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          disabled={!patient.type}
          style={[s.goBtn, !patient.type && { opacity: 0.35 }]}
          onPress={startRea}>
          <Text style={s.goTxt}>▶  REANIMATION STARTEN</Text>
        </TouchableOpacity>
        <Text style={[s.hintSmall, { textAlign: 'center' }]}>Weitere Daten können jederzeit unter „Patient“ ergänzt werden.</Text>
      </ScrollView>
    );
  }

  /* ---------- Auswertung nach Einsatzende ---------- */
  if (phase === 'end') {
    const firstOf = (ty) => events.find((e) => e.type === ty);
    const fs = firstOf('shock');
    const fa = firstOf('adr');
    const fan = firstOf('analysis');
    const fr = firstOf('rosc');
    const adrTimes = events.filter((e) => e.type === 'adr').map((e) => e.t);
    const adrInt = adrTimes.length > 1
      ? (adrTimes[adrTimes.length - 1] - adrTimes[0]) / (adrTimes.length - 1) : null;
    const anTimes = analyses.map((e) => e.t);
    const anInt = anTimes.length > 1
      ? (anTimes[anTimes.length - 1] - anTimes[0]) / (anTimes.length - 1) : null;
    const total = endTime - startTime;
    const good = endReason.startsWith('ROSC');
    const evalItems = [
      ['Analyse-Intervall Ø', anInt ? dur(anInt) : '–', anInt ? (Math.abs(anInt - CYCLE_MS) <= 30000 ? C.green : C.yellow) : C.dim, 'Ziel 2:00'],
      ['Adrenalin-Intervall Ø', adrInt ? dur(adrInt) : '–', adrInt ? (adrInt >= 180000 && adrInt <= 300000 ? C.green : C.yellow) : C.dim, 'Ziel 3–5 min'],
      ['Bis 1. Analyse', fan ? dur(fan.t - startTime) : '–', C.text],
      ['Bis 1. Schock', fs ? dur(fs.t - startTime) : '–', C.text],
      ['Bis 1. Adrenalin', fa ? dur(fa.t - startTime) : '–', C.text],
      ['Bis ROSC', fr ? dur(fr.t - startTime) : '–', fr ? C.green : C.dim],
    ];
    const typeColor = {
      shock: C.orange, adr: C.red, amio: C.purple, lido: C.purple, analysis: C.blue,
      rosc: C.green, airway: C.indigo, access: C.teal, etco2: C.green, alarm: C.yellow,
      eol: C.pink, hits: C.teal, end: C.red,
    };
    return wrap(
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
        <Text style={s.kicker}>EINSATZAUSWERTUNG</Text>
        <Text style={s.h1}>{good ? '♥ ' : ''}{endReason}</Text>
        <Text style={s.dimTxt}>
          {new Date(startTime).toLocaleDateString('de-DE')} · {clock(startTime)} – {clock(endTime)} · {isChild ? 'Kind' : 'Erwachsener'} {ageLabel(patient)}
        </Text>

        <View style={[s.card, { flexDirection: 'row', flexWrap: 'wrap' }]}>
          <Stat wide label="Dauer" value={dur(total)} color={C.text} />
          <Stat wide label="Schocks" value={String(shocks)} color={C.orange} />
          <Stat wide label="Adrenalin" value={`${adrN}×`} color={C.red} />
          <Stat wide label="Amio / Lido" value={`${amioN} / ${lidoN}`} color={C.purple} />
          <Stat wide label="Analysen" value={String(analyses.length)} color={C.blue} />
          <Stat wide label="Init. Rhythmus" value={initialRhythm ? RHYTHM_SHORT[initialRhythm] : '–'} color={C.teal} />
        </View>

        <Text style={s.section}>Qualität & Zeiten</Text>
        <View style={s.card}>
          {evalItems.map(([l, v, c, sub]) => (
            <View key={l} style={s.evalRow}>
              <Text style={s.evalLabel}>{l}{sub ? <Text style={s.dimTxt}>  ({sub})</Text> : null}</Text>
              <Text style={[s.evalVal, { color: c }]}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>Zeitstrahl</Text>
        <View style={s.card}>
          {events.map((e, i) => (
            <View key={i} style={s.tlRow}>
              <View style={s.tlLeft}>
                <Text style={s.tlTime}>{dur(e.t - startTime)}</Text>
                <Text style={s.tlClock}>{clock(e.t)}</Text>
              </View>
              <View style={[s.tlDot, { backgroundColor: typeColor[e.type] || C.grey }]} />
              <Text style={s.tlTxt}>{e.text}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>Protokoll (Text)</Text>
        <View style={s.card}>
          <Text selectable style={s.mono}>{buildProtocol()}</Text>
        </View>

        <TouchableOpacity style={[s.goBtn, { backgroundColor: C.blue }]} onPress={shareProtocol}>
          <Text style={s.goTxt}>⇪  Protokoll teilen / exportieren</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.goBtn, { backgroundColor: C.surface2 }]}
          onPress={() => ask({
            title: 'Neuen Einsatz starten?',
            message: 'Das aktuelle Protokoll wird verworfen. Vorher teilen/exportieren!',
            options: [{ label: 'Ja, neuer Einsatz', color: C.red, onPress: resetAll }],
          })}>
          <Text style={s.goTxt}>Neuer Einsatz</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  /* ---------- Laufende Reanimation ---------- */
  const remaining = cycleStart ? CYCLE_MS - (now - cycleStart) : null;
  const overdue = remaining != null && remaining <= 0;
  const blink = Math.floor(now / 500) % 2 === 0;

  const header = (
    <View style={[s.header, status === 'rosc' && { borderBottomColor: C.green }]}>
      <View>
        <Text style={s.headerLabel}>{status === 'rosc' ? '♥ ROSC' : '● REANIMATION'}</Text>
        <Text style={s.headerTime}>{dur(elapsed)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.headerClock}>{clock(now)}</Text>
        <Text style={s.headerPt}>
          {isChild ? '🧒 Kind' : '🧍 Erw.'}{ageLabel(patient) ? ' · ' + ageLabel(patient) : ''}{num(patient.weight) ? ` · ${patient.weight} kg` : ''}
        </Text>
        <Text style={s.headerPt}>Beginn {clock(startTime)}</Text>
      </View>
    </View>
  );

  // --- Unteransicht: 4 H / HITS ---
  if (view === 'hits') {
    return wrap(
      <>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setView('main')}><Text style={s.back}>‹ Zurück zur Reanimation</Text></TouchableOpacity>
          <Text style={s.h1}>Reversible Ursachen</Text>
          {['4 H', 'HITS'].map((g) => (
            <View key={g}>
              <Text style={s.section}>{g}</Text>
              {HITS.filter((h) => h.g === g).map((h) => (
                <View key={h.k} style={[s.card, { marginTop: 8 }]}>
                  <Text style={s.hitsTitle}>{h.l}</Text>
                  <Text style={s.hitsTip}>{h.tip}</Text>
                  <View style={s.row}>
                    {HITS_STATES.map(([st, col]) => {
                      const on = hits[h.k] && hits[h.k].st === st;
                      return (
                        <TouchableOpacity
                          key={st}
                          style={[s.hitsBtn, on && { backgroundColor: col, borderColor: col }]}
                          onPress={() => {
                            setHits((x) => ({ ...x, [h.k]: { st, t: Date.now() } }));
                            log('hits', `${g} ${h.l}: ${st}`);
                          }}>
                          <Text style={[s.hitsBtnTxt, on && { color: '#fff' }]}>{st}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {hits[h.k] ? <Text style={s.hintSmall}>{hits[h.k].st} um {clock(hits[h.k].t)}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </>
    );
  }

  // --- Unteransicht: Patientendaten ---
  if (view === 'patient') {
    const est = estWeight(patient);
    const upd = (k) => (v) => setPatient((p) => ({ ...p, [k]: v }));
    return wrap(
      <>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => {
            log('patient', `Patientendaten: ${[ageLabel(patient), num(patient.weight) ? patient.weight + ' kg' : '', patient.sex, patient.witnessed ? 'beobachtet: ' + patient.witnessed : '', patient.bystander ? 'Laien-CPR: ' + patient.bystander : '', patient.initialRhythm ? 'initial ' + RHYTHM_SHORT[patient.initialRhythm] : ''].filter(Boolean).join(', ') || 'aktualisiert'}`);
            setView('main');
          }}>
            <Text style={s.back}>‹ Speichern & zurück</Text>
          </TouchableOpacity>
          <Text style={s.h1}>Patientendaten</Text>
          <View style={s.card}>
            <Text style={s.label}>Algorithmus</Text>
            <Chips value={patient.type} onChange={(v) => v && upd('type')(v)} options={[['adult', 'Erwachsener (ALS)', C.red], ['child', 'Kind (PLS)', C.teal]]} />
            <Text style={s.label}>Alter</Text>
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1 }]} keyboardType="decimal-pad" value={patient.age} onChangeText={upd('age')} placeholder="Alter" placeholderTextColor={C.dim} />
              <Chips small value={patient.ageUnit} onChange={(v) => upd('ageUnit')(v || 'J')} options={[['J', 'Jahre'], ['M', 'Monate']]} />
            </View>
            <Text style={s.label}>Gewicht (kg)</Text>
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1 }]} keyboardType="decimal-pad" value={patient.weight}
                onChangeText={(v) => setPatient((p) => ({ ...p, weight: v, weightEst: false }))} placeholder="kg" placeholderTextColor={C.dim} />
              {est ? (
                <TouchableOpacity style={s.smallBtn} onPress={() => setPatient((p) => ({ ...p, weight: String(est), weightEst: true }))}>
                  <Text style={s.smallBtnTxt}>Schätzen: {est} kg</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={s.label}>Geschlecht</Text>
            <Chips value={patient.sex} onChange={upd('sex')} options={[['männlich', 'männlich'], ['weiblich', 'weiblich'], ['divers', 'divers']]} />
            <Text style={s.label}>Beobachteter Kreislaufstillstand</Text>
            <Chips value={patient.witnessed} onChange={upd('witnessed')} options={[['ja', 'Ja', C.green], ['nein', 'Nein', C.red]]} />
            <Text style={s.label}>Laienreanimation</Text>
            <Chips value={patient.bystander} onChange={upd('bystander')} options={[['ja', 'Ja', C.green], ['nein', 'Nein', C.red]]} />
            <Text style={s.label}>Initialer Rhythmus</Text>
            <Chips value={patient.initialRhythm} onChange={upd('initialRhythm')} options={Object.keys(RHYTHMS).map((k) => [k, RHYTHM_SHORT[k], SHOCKABLE(k) ? C.orange : C.indigo])} />
            <Text style={s.label}>Vermutete Ursache</Text>
            <TextInput style={s.input} value={patient.cause} onChangeText={upd('cause')} placeholder="z. B. kardial" placeholderTextColor={C.dim} />
          </View>
        </ScrollView>
      </>
    );
  }

  // --- Unteransicht: End-of-Life-Abfrage ---
  if (view === 'eol') {
    const auto = {
      asys20: asysSince ? `Protokoll: Asystolie seit ${dur(now - asysSince)}` : `Protokoll: aktueller Rhythmus ${rhythm ? RHYTHM_SHORT[rhythm] : 'k. A.'}`,
      rev: `Protokoll: ${Object.keys(hits).length}/8 dokumentiert`,
      rosc: `Protokoll: ${hadRosc ? 'ROSC dokumentiert' : 'kein ROSC'}`,
      tor1: `Protokoll: beobachtet = ${patient.witnessed || 'k. A.'}`,
      tor2: `Protokoll: ${shocks} Schock(s)`,
      tor3: `Protokoll: Laien-CPR = ${patient.bystander || 'k. A.'}`,
      etco2: `Protokoll: letzter Wert ${lastEt ? lastEt.data.v + ' mmHg' : 'k. A.'}`,
    };
    const critYes = EOL_Q.filter((q) => q.crit && eolAns[q.k] === 'Ja').length;
    const contYes = EOL_Q.filter((q) => q.cont && eolAns[q.k] === 'Ja').length;
    const torAll = ['tor1', 'tor2'].every((k) => eolAns[k] === 'Ja');
    return wrap(
      <>
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => { setView('main'); if (eolNextAt === Infinity) setEolNextAt(Date.now() + 5 * 60000); }}>
            <Text style={s.back}>‹ Später (Erinnerung in 5 min)</Text>
          </TouchableOpacity>
          <Text style={s.kicker}>ERC 2021 · ETHIK</Text>
          <Text style={s.h1}>End-of-Life-Entscheidung</Text>
          <Text style={s.dimTxt}>
            Reanimationsdauer {dur(elapsed)} · {shocks} Schock(s) · {adrN}× Adrenalin · {hadRosc ? 'ROSC zwischenzeitlich' : 'kein ROSC'}
          </Text>
          {isChild ? (
            <View style={[s.hint, { borderLeftColor: C.teal, marginTop: 12 }]}>
              <Text style={s.hintTxt}>Kind: TOR-Regeln sind nicht validiert – individuelle Entscheidung, Sondersituationen (Ertrinken, Hypothermie) großzügig weiter reanimieren.</Text>
            </View>
          ) : null}
          {EOL_Q.map((q, i) => (
            <View key={q.k} style={[s.card, { marginTop: 10 }]}>
              <Text style={s.eolQ}>
                <Text style={{ color: q.crit ? C.red : q.cont ? C.green : C.dim }}>{i + 1}. </Text>{q.q}
              </Text>
              {auto[q.k] ? <Text style={s.hintSmall}>{auto[q.k]}</Text> : null}
              <Chips small value={eolAns[q.k]} onChange={(v) => setEolAns((a) => ({ ...a, [q.k]: v }))}
                options={[['Ja', 'Ja', q.cont ? C.green : C.red], ['Nein', 'Nein', C.grey], ['Unklar', 'Unklar', C.yellow]]} />
            </View>
          ))}
          <View style={[s.card, { marginTop: 14, borderColor: critYes ? C.red : C.line }]}>
            <Text style={s.hitsTitle}>Zusammenfassung</Text>
            <Text style={s.hintTxt}>• ERC-Kriterien für Beendigung / Nichtbeginn mit „Ja“: {critYes}</Text>
            <Text style={s.hintTxt}>• Gründe für Fortsetzen / Sondersituation mit „Ja“: {contYes}</Text>
            {!isChild ? <Text style={s.hintTxt}>• TOR-Regel (BLS): {torAll && eolAns.rosc === 'Nein' ? 'erfüllt' : 'nicht vollständig erfüllt'}</Text> : null}
            <Text style={[s.hintSmall, { marginTop: 6 }]}>Die Entscheidung trifft das Team / der Notarzt. Die App gibt keine Empfehlung.</Text>
          </View>
          <TouchableOpacity style={[s.goBtn, { backgroundColor: C.green }]} onPress={() => eolDecision('Reanimation fortsetzen')}>
            <Text style={s.goTxt}>Reanimation fortsetzen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.goBtn, { backgroundColor: C.orange }]} onPress={() => eolDecision('Transport unter CPR / eCPR')}>
            <Text style={s.goTxt}>Transport unter CPR / eCPR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.goBtn, { backgroundColor: C.redDark }]} onPress={() => eolDecision('Reanimation beenden')}>
            <Text style={s.goTxt}>Reanimation beenden</Text>
          </TouchableOpacity>
        </ScrollView>
      </>
    );
  }

  // --- Hauptansicht ---
  let cycleCard;
  if (status === 'rosc') {
    const r = lastOf('rosc');
    cycleCard = (
      <View style={[s.cycle, { backgroundColor: '#0E2A17', borderColor: C.green }]}>
        <Text style={[s.cycleLabel, { color: C.green }]}>♥ ROSC SEIT</Text>
        <Text style={[s.cycleBig, { color: C.green }]}>{r ? dur(now - r.t) : '--:--'}</Text>
        <View style={s.row}>
          <Tile label="Erneuter Stillstand" sub="CPR wieder aufnehmen" color={C.red} style={{ flex: 1 }} onPress={doRearrest} />
          <Tile label="Einsatz beenden" sub="→ Auswertung" color={C.surface2} style={{ flex: 1 }} onPress={doEnd} />
        </View>
      </View>
    );
  } else if (shockPending) {
    cycleCard = (
      <TouchableOpacity activeOpacity={0.8} onPress={doShock}
        style={[s.cycle, { backgroundColor: blink ? C.orange : '#4A2E00', borderColor: C.orange }]}>
        <Text style={[s.cycleLabel, { color: '#fff' }]}>SCHOCKBARER RHYTHMUS</Text>
        <Text style={[s.cycleBig, { color: '#fff', fontSize: 40 }]}>⚡ SCHOCK</Text>
        <Text style={s.cycleSub}>{isChild ? D.energies[0] ? `${D.energies[0]} J (4 J/kg)` : '4 J/kg' : '≥ 150 J biphasisch'} · antippen</Text>
      </TouchableOpacity>
    );
  } else if (cycleStart) {
    const frac = Math.min(1, (now - cycleStart) / CYCLE_MS);
    cycleCard = (
      <TouchableOpacity activeOpacity={0.85} onPress={overdue ? doAnalysis : undefined}
        style={[s.cycle, overdue && { backgroundColor: blink ? C.red : C.redDark, borderColor: C.red }]}>
        <Text style={[s.cycleLabel, overdue && { color: '#fff' }]}>{overdue ? 'ANALYSE JETZT · antippen' : 'NÄCHSTE ANALYSE IN'}</Text>
        <Text style={[s.cycleBig, overdue && { color: '#fff' }]}>{overdue ? '+' + dur(-remaining) : dur(remaining)}</Text>
        {!overdue ? (
          <View style={s.progress}><View style={[s.progressFill, { width: `${frac * 100}%`, backgroundColor: frac > 0.85 ? C.yellow : C.blue }]} /></View>
        ) : <Text style={s.cycleSub}>Drückerwechsel · Pads/Rhythmus prüfen</Text>}
        {lastShock && !overdue ? <Text style={s.cycleMeta}>Letzter Schock vor {dur(now - lastShock.t)} · Zyklus {analyses.length}</Text> : null}
      </TouchableOpacity>
    );
  } else {
    cycleCard = (
      <TouchableOpacity activeOpacity={0.85} onPress={doAnalysis} style={[s.cycle, { borderColor: C.blue }]}>
        <Text style={s.cycleLabel}>ERSTE ANALYSE</Text>
        <Text style={[s.cycleBig, { fontSize: 30 }]}>Pads kleben → Analyse</Text>
        <Text style={s.cycleSub}>Antippen sobald Defi bereit</Text>
      </TouchableOpacity>
    );
  }

  const sinceAdr = lastAdr ? now - lastAdr.t : null;
  const adrColor = sinceAdr == null ? C.dim : sinceAdr >= 300000 ? C.red : sinceAdr >= 180000 ? C.yellow : C.green;

  return wrap(
    <>
      {header}
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {cycleCard}

        {/* Metronom */}
        {status === 'cpr' ? (
          <View style={s.metro}>
            <Animated.View style={[s.metroDot, { transform: [{ scale: pulse }], opacity: metroOn ? 1 : 0.25 }]}>
              <Text style={s.metroBpm}>{bpm}</Text>
              <Text style={s.metroUnit}>/min</Text>
            </Animated.View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <View style={s.row}>
                <TouchableOpacity style={s.bpmBtn} onPress={() => setBpm((b) => Math.max(100, b - 5))}><Text style={s.bpmBtnTxt}>−</Text></TouchableOpacity>
                <TouchableOpacity style={[s.bpmBtn, { flex: 1, backgroundColor: metroOn ? C.surface2 : C.blue }]} onPress={() => setMetroOn((m) => !m)}>
                  <Text style={[s.bpmBtnTxt, { fontSize: 15 }]}>{metroOn ? '🔊 An' : '🔇 Aus'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.bpmBtn} onPress={() => setBpm((b) => Math.min(120, b + 5))}><Text style={s.bpmBtnTxt}>+</Text></TouchableOpacity>
              </View>
              <Text style={s.metroInfo}>{advancedAirway ? 'Durchgehend komprimieren' : `Verhältnis ${D.ratio}`} · Tiefe {D.depth}</Text>
            </View>
          </View>
        ) : null}

        {/* ERC-Hinweise */}
        {hints.map(([col, txt], i) => (
          <View key={i} style={[s.hint, { borderLeftColor: col }]}>
            <Text style={s.hintTxt}>{txt}</Text>
          </View>
        ))}

        {/* Status-Leiste */}
        <View style={s.statusRow}>
          <Stat label="Rhythmus" value={rhythm ? RHYTHM_SHORT[rhythm] : '–'} color={SHOCKABLE(rhythm) ? C.orange : rhythm ? C.indigo : C.dim} />
          <Stat label="Schocks" value={String(shocks)} color={C.orange} sub={lastShock ? `${lastShock.data.j} J` : ''} />
          <Stat label="Adrenalin" value={`${adrN}×`} color={C.red} sub={sinceAdr != null ? `vor ${dur(sinceAdr)}` : ''} />
          <Stat label="EtCO₂" value={lastEt ? String(lastEt.data.v) : '–'} color={lastEt ? (lastEt.data.v < 10 ? C.red : lastEt.data.v < 20 ? C.yellow : C.green) : C.dim} sub="mmHg" />
        </View>

        {/* Hauptaktionen – groß */}
        <View style={s.grid}>
          <Tile big icon="📈" label="Analyse" sub={`#${analyses.length + 1}`} color={C.blue} style={s.w2} onPress={doAnalysis} disabled={status !== 'cpr'} />
          <Tile big icon="⚡" label="Schock" sub={`#${shocks + 1} · ${isChild ? (D.energies[0] ? D.energies[0] + ' J' : '4 J/kg') : '≥150 J'}`} color={C.orange} style={s.w2} onPress={doShock} disabled={status !== 'cpr'} />
          <Tile big icon="💉" label="Adrenalin" sub={`${D.adr != null ? de(D.adr) + ' mg' : '10 µg/kg'} · ${adrN}×`} color={C.red} style={[s.w2, sinceAdr != null && sinceAdr >= 180000 && { borderWidth: 3, borderColor: adrColor }]} onPress={() => giveDrug('adr')} />
          <Tile big icon="💊" label="Amiodaron" sub={`${(amioN >= 1 ? D.amio2 : D.amio1) ?? '5 mg/kg'}${D.amio1 ? ' mg' : ''} · ${amioN}×`} color={C.purple} style={s.w2} onPress={() => giveDrug('amio')} />
        </View>

        <View style={s.grid}>
          <Tile label="Lidocain" sub={`${(lidoN >= 1 ? D.lido2 : D.lido1) ?? '1 mg/kg'}${D.lido1 ? ' mg' : ''} · ${lidoN}×`} color="#7B3FA0" style={s.w3} onPress={() => giveDrug('lido')} />
          <Tile label="4 H / HITS" sub={`${Object.keys(hits).length}/8 geprüft`} color="#0F6E7E" style={s.w3} onPress={() => setView('hits')} />
          <Tile label="EtCO₂" sub="Wert eintragen" color="#1F7A3A" style={s.w3} onPress={doEtco2} />
          <Tile label="SGA" sub={airways.some((e) => e.data.kind === 'SGA') ? '✓ liegt' : 'i-gel / LT'} color={C.indigo} style={s.w3} onPress={doSGA} />
          <Tile label="Intubation" sub={airways.some((e) => e.data.kind === 'ETI') ? '✓ liegt' : 'ETI'} color={C.indigo} style={s.w3} onPress={doETI} />
          <Tile label="Zugang" sub={accesses.length ? accesses[accesses.length - 1].data.kind || 'frustran' : 'i.v. / i.o.'} color="#136B8A" style={s.w3} onPress={doAccess} />
          <Tile label="Ursache" sub={patient.cause || 'auswählen'} style={s.w3} onPress={doCause} />
          <Tile label="Patient" sub={[ageLabel(patient), num(patient.weight) ? patient.weight + ' kg' : ''].filter(Boolean).join(' · ') || 'Daten'} style={s.w3} onPress={() => setView('patient')} />
          <Tile label="Notiz" sub="Freitext" style={s.w3} onPress={doNote} />
        </View>

        <View style={s.grid}>
          <Tile label="♥ ROSC" color={C.green} style={s.w3} onPress={doRosc} disabled={status !== 'cpr'} />
          <Tile label="End of Life" sub="ERC-Fragen" color="#8A1538" style={s.w3} onPress={() => setView('eol')} />
          <Tile label="Beenden" sub="→ Auswertung" color={C.grey} style={s.w3} onPress={doEnd} />
        </View>

        {/* Letzte Ereignisse */}
        <Text style={s.section}>Verlauf</Text>
        <View style={s.card}>
          {events.slice(-6).reverse().map((e, i) => (
            <View key={i} style={s.logRow}>
              <Text style={s.logTime}>{dur(e.t - startTime)}</Text>
              <Text style={s.logTxt}>{e.text}</Text>
            </View>
          ))}
        </View>
        <Text style={[s.hintSmall, { textAlign: 'center', marginTop: 12 }]}>Trainings-/Dokumentationshilfe · kein Medizinprodukt</Text>
      </ScrollView>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Home
  homeWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  brand: { color: C.text, fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  brandSub: { color: C.dim, fontSize: 15, marginTop: 4, marginBottom: 40, letterSpacing: 1 },
  startBtn: {
    width: 230, height: 230, borderRadius: 115, backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red, shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 16,
    borderWidth: 6, borderColor: '#FF6B7A',
  },
  startTxt: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: 2 },
  startSub: { color: '#FFD9DE', fontSize: 16, fontWeight: '600', marginTop: 2 },
  disclaimer: { marginTop: 48, backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line, maxWidth: 480 },
  disclaimerTitle: { color: C.yellow, fontWeight: '800', fontSize: 15, marginBottom: 6 },
  disclaimerTxt: { color: C.dim, fontSize: 13, lineHeight: 19 },

  // Setup
  back: { color: C.blue, fontSize: 17, fontWeight: '600', paddingVertical: 8 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800', marginTop: 6, marginBottom: 12, letterSpacing: -0.5 },
  kicker: { color: C.dim, fontSize: 12, fontWeight: '800', letterSpacing: 2, marginTop: 8 },
  typeBtn: {
    flex: 1, backgroundColor: C.surface, borderRadius: 22, paddingVertical: 28, alignItems: 'center',
    borderWidth: 3, borderColor: C.line,
  },
  typeIcon: { fontSize: 54 },
  typeTxt: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
  typeSub: { color: C.dim, fontSize: 14, marginTop: 4 },
  card: { backgroundColor: C.surface, borderRadius: 18, padding: 14, marginTop: 12, borderWidth: 1, borderColor: C.line },
  label: { color: C.dim, fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: {
    backgroundColor: C.surface2, color: C.text, fontSize: 20, fontWeight: '600', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: C.line,
  },
  hintSmall: { color: C.dim, fontSize: 12, marginTop: 6, lineHeight: 17 },
  goBtn: { backgroundColor: C.red, borderRadius: 18, paddingVertical: 20, alignItems: 'center', marginTop: 16 },
  goTxt: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 8 },
  chipTxt: { color: C.text, fontSize: 15, fontWeight: '600' },
  smallBtn: { backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14, borderWidth: 1, borderColor: C.line },
  smallBtnTxt: { color: C.teal, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface,
    borderBottomWidth: 2, borderBottomColor: C.red,
  },
  headerLabel: { color: C.red, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  headerTime: { color: C.text, fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  headerClock: { color: C.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headerPt: { color: C.dim, fontSize: 12, marginTop: 2 },

  // Zyklus
  cycle: { backgroundColor: C.surface, borderRadius: 22, padding: 16, borderWidth: 2, borderColor: C.line, alignItems: 'center' },
  cycleLabel: { color: C.dim, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  cycleBig: { color: C.text, fontSize: 64, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -2, marginVertical: 2, textAlign: 'center' },
  cycleSub: { color: '#fff', fontSize: 14, fontWeight: '600', opacity: 0.9, marginBottom: 4 },
  cycleMeta: { color: C.dim, fontSize: 12, marginTop: 8 },
  progress: { width: '100%', height: 10, backgroundColor: C.surface2, borderRadius: 5, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', borderRadius: 5 },

  // Metronom
  metro: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 22, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.line },
  metroDot: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', shadowColor: C.red, shadowOpacity: 0.7, shadowRadius: 14, elevation: 8 },
  metroBpm: { color: '#fff', fontSize: 30, fontWeight: '900' },
  metroUnit: { color: '#FFD9DE', fontSize: 11, marginTop: -4 },
  bpmBtn: { backgroundColor: C.surface2, borderRadius: 14, height: 50, minWidth: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  bpmBtnTxt: { color: C.text, fontSize: 26, fontWeight: '800' },
  metroInfo: { color: C.dim, fontSize: 12, marginTop: 8 },

  // Hinweise
  hint: { backgroundColor: C.surface, borderRadius: 12, padding: 12, marginTop: 8, borderLeftWidth: 5 },
  hintTxt: { color: C.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },

  // Status
  statusRow: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 18, marginTop: 10, paddingVertical: 10, borderWidth: 1, borderColor: C.line },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statWide: { minWidth: '33%', flexGrow: 1, flexBasis: '33%' },
  statLabel: { color: C.dim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  statVal: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  statSub: { color: C.dim, fontSize: 11 },

  // Kacheln
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 },
  tile: { borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8, minHeight: 74 },
  tileBig: { minHeight: 112 },
  tileIcon: { fontSize: 26, marginBottom: 2 },
  tileTxt: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  tileSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 3, textAlign: 'center' },
  w2: { width: '48.8%' },
  w3: { width: '32.3%' },

  // Verlauf
  section: { color: C.dim, fontSize: 13, fontWeight: '900', letterSpacing: 1.5, marginTop: 18, textTransform: 'uppercase' },
  logRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  logTime: { color: C.dim, width: 56, fontVariant: ['tabular-nums'], fontWeight: '700' },
  logTxt: { color: C.text, flex: 1, fontSize: 14 },

  // 4H/HITS
  hitsTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  hitsTip: { color: C.dim, fontSize: 13, marginTop: 4, marginBottom: 10, lineHeight: 18 },
  hitsBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: 'center', backgroundColor: C.surface2 },
  hitsBtnTxt: { color: C.text, fontWeight: '700', fontSize: 13 },

  // EOL
  eolQ: { color: C.text, fontSize: 15, fontWeight: '600', lineHeight: 21, marginBottom: 4 },

  // Auswertung
  dimTxt: { color: C.dim, fontSize: 13 },
  evalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  evalLabel: { color: C.text, fontSize: 15, flex: 1 },
  evalVal: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
  tlLeft: { width: 64 },
  tlTime: { color: C.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tlClock: { color: C.dim, fontSize: 11 },
  tlDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 10 },
  tlTxt: { color: C.text, flex: 1, fontSize: 14, lineHeight: 20 },
  mono: { color: C.text, fontSize: 12, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Dialog
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 30, borderWidth: 1, borderColor: C.line },
  sheetTitle: { color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 6 },
  sheetMsg: { color: C.dim, fontSize: 15, lineHeight: 21, marginBottom: 8 },
  option: { borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, marginTop: 8, alignItems: 'center' },
  optionTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  optionSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  suffix: { color: C.dim, fontSize: 18, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  cancelTxt: { color: C.dim, fontSize: 16, fontWeight: '700' },
});
