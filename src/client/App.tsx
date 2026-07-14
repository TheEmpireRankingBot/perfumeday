import { useEffect, useMemo, useState } from 'react';
import { createManualProfile, createStarterCollection, STARTER_CATALOG } from '../shared/catalog';
import { migrateLegacyStorage } from '../shared/migration';
import { buildRecommendation } from '../shared/scoring';
import { OCCASIONS, SETTINGS, VIBES } from '../shared/types';
import type {
  AppState,
  CandidateScore,
  DailyContext,
  Enjoyment,
  FragranceProfile,
  ManualFragranceInput,
  RecommendationResult,
  StrengthFeedback,
  UserPreferences,
  WearLog,
} from '../shared/types';
import { api } from './api';
import { buildDailyContext, weatherLabel } from './context';

type View = 'today' | 'shelf' | 'history' | 'settings';
type LoadState = 'loading' | 'ready' | 'error';

const CACHE_KEY = 'perfumeday-v2-cache';
const MIGRATION_KEY = 'perfumeday-v2-migrated';

const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: 'Asia/Singapore',
  defaultLatitude: 1.3521,
  defaultLongitude: 103.8198,
  tasteNotes: '',
  defaultSetting: 'mixed',
};

const fallbackState = (): AppState => ({
  catalog: STARTER_CATALOG,
  collection: createStarterCollection(),
  wearLogs: [],
  preferences: DEFAULT_PREFERENCES,
});

function loadCachedState(): AppState {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as AppState;
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory fallback remains usable.
  }
  return fallbackState();
}

const legacyPayload = () => {
  try {
    return {
      sotd_perfumes: localStorage.getItem('sotd_perfumes'),
      sotd_history: localStorage.getItem('sotd_history'),
      sotd_taste: localStorage.getItem('sotd_taste'),
    };
  } catch {
    return { sotd_perfumes: null, sotd_history: null, sotd_taste: null };
  }
};

const hasLegacyData = (legacy: Record<string, string | null>) => Object.values(legacy).some(Boolean);

export function App() {
  const [state, setState] = useState<AppState>(loadCachedState);
  const [context, setContext] = useState<DailyContext>();
  const [recommendation, setRecommendation] = useState<RecommendationResult>();
  const [view, setView] = useState<View>('today');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('Reading the air and your rotation…');
  const [remote, setRemote] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [activeWear, setActiveWear] = useState<WearLog>();
  const [tasteDraft, setTasteDraft] = useState(state.preferences.tasteNotes);

  const profileMap = useMemo(() => new Map(state.catalog.map((profile) => [profile.id, profile])), [state.catalog]);
  const winnerProfile = recommendation ? profileMap.get(recommendation.winner.profileId) : undefined;

  useEffect(() => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state, recommendation })); } catch { /* memory-only mode */ }
  }, [state, recommendation]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoadState('loading');
      let next = loadCachedState();
      const legacy = legacyPayload();
      let connected = false;
      try {
        if (hasLegacyData(legacy) && !localStorage.getItem(MIGRATION_KEY)) {
          next = await api.importLegacy(legacy);
          localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
          setMessage('Your original shelf and wear memory were imported safely.');
        } else {
          next = await api.bootstrap();
        }
        connected = true;
        setRemote(true);
      } catch {
        if (hasLegacyData(legacy) && !localStorage.getItem(MIGRATION_KEY)) {
          next = migrateLegacyStorage(legacy).state;
          localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        }
        setRemote(false);
      }
      if (cancelled) return;
      setState(next);
      setTasteDraft(next.preferences.tasteNotes);
      try {
        const daily = await buildDailyContext(next.preferences);
        if (cancelled) return;
        setContext(daily);
        const result = await calculate(daily, next, false, connected);
        if (cancelled) return;
        setRecommendation(result);
        setMessage('Your scent is ready.');
        setLoadState('ready');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not prepare today’s recommendation.');
        setLoadState('error');
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, []);

  async function calculate(nextContext: DailyContext, currentState = state, force = false, useRemote = remote) {
    if (useRemote) {
      try { return await api.recommend(nextContext, force); } catch { setRemote(false); }
    }
    return buildRecommendation(
      currentState.catalog,
      currentState.collection,
      nextContext,
      currentState.wearLogs,
      new Date(),
      currentState.preferences.tasteNotes,
    );
  }

  async function recompute(patch: Partial<DailyContext>, force = false) {
    if (!context) return;
    const next = { ...context, ...patch };
    setContext(next);
    setLoadState('loading');
    setMessage('Rebalancing the wardrobe…');
    try {
      const result = await calculate(next, state, force);
      setRecommendation(result);
      setMessage('Adjusted for your plans.');
      setLoadState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the recommendation.');
      setLoadState('error');
    }
  }

  async function wear(profileId = recommendation?.winner.profileId) {
    if (!profileId || !context) return;
    let log: WearLog = {
      id: crypto.randomUUID(),
      profileIds: [profileId],
      wornAt: new Date().toISOString(),
      context,
    };
    if (remote) {
      try { log = await api.createWear([profileId], context); } catch { setRemote(false); }
    }
    setState((current) => ({ ...current, wearLogs: [log, ...current.wearLogs] }));
    setActiveWear(log);
    setMessage('Wear logged. Tell me how it performs later.');
  }

  async function rateWear(enjoyment: Enjoyment, strength: StrengthFeedback = 'right') {
    if (!activeWear) return;
    let updated: WearLog = { ...activeWear, enjoyment, strength };
    if (remote) {
      try { updated = await api.updateWear(activeWear.id, { enjoyment, strength }); } catch { setRemote(false); }
    }
    setState((current) => ({
      ...current,
      wearLogs: current.wearLogs.map((log) => log.id === updated.id ? updated : log),
    }));
    setActiveWear(updated);
    setMessage('Feedback saved — future scores will learn from it.');
  }

  async function toggleProfile(profileId: string, active: boolean) {
    setState((current) => ({
      ...current,
      collection: current.collection.map((item) => item.profileId === profileId ? { ...item, active } : item),
    }));
    if (remote) {
      try { await api.updateCollection(profileId, active); } catch { setRemote(false); }
    }
  }

  async function addFragrance(input: ManualFragranceInput) {
    const suffix = crypto.randomUUID();
    let profile = createManualProfile(input, `custom-${suffix}`);
    let item = { id: `item-${suffix}`, profileId: profile.id, active: true, addedAt: new Date().toISOString() };
    if (remote) {
      try {
        const created = await api.addFragrance(input);
        profile = created.profile;
        item = created.item;
      } catch { setRemote(false); }
    }
    setState((current) => ({
      ...current,
      catalog: [...current.catalog, profile],
      collection: [...current.collection, item],
    }));
    setMessage(`${profile.name} was added with a provisional profile.`);
  }

  async function savePreferences() {
    const preferences = { ...state.preferences, tasteNotes: tasteDraft };
    setState((current) => ({ ...current, preferences }));
    if (remote) {
      try { await api.updatePreferences({ tasteNotes: tasteDraft }); } catch { setRemote(false); }
    }
    setMessage('Taste notes saved.');
  }

  function swapWinner(candidate: CandidateScore) {
    if (!recommendation) return;
    setRecommendation({
      ...recommendation,
      winner: candidate,
      alternatives: [recommendation.winner, ...recommendation.alternatives.filter((item) => item.profileId !== candidate.profileId)].slice(0, 2),
    });
    setMessage('Alternative selected for today.');
  }

  const statusLabel = remote ? 'Cloud wardrobe' : 'Private device mode';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setView('today')} aria-label="Open today">
          <span>Perfume</span><em>Day</em>
        </button>
        <div className={`connection ${remote ? 'online' : ''}`}><i />{statusLabel}</div>
      </header>

      <main>
        {view === 'today' && (
          <TodayView
            context={context}
            recommendation={recommendation}
            winner={winnerProfile}
            profileMap={profileMap}
            loadState={loadState}
            message={message}
            adjusting={adjusting}
            activeWear={activeWear}
            onToggleAdjust={() => setAdjusting((value) => !value)}
            onRecompute={recompute}
            onWear={wear}
            onRate={rateWear}
            onSwap={swapWinner}
          />
        )}
        {view === 'shelf' && <ShelfView state={state} onToggle={toggleProfile} onAdd={addFragrance} />}
        {view === 'history' && <HistoryView logs={state.wearLogs} profileMap={profileMap} />}
        {view === 'settings' && (
          <SettingsView
            state={state}
            tasteDraft={tasteDraft}
            onTasteChange={setTasteDraft}
            onSave={savePreferences}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {(['today', 'shelf', 'history', 'settings'] as View[]).map((item) => (
          <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>
            <NavIcon view={item} /><span>{item}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function TodayView({
  context, recommendation, winner, profileMap, loadState, message, adjusting, activeWear,
  onToggleAdjust, onRecompute, onWear, onRate, onSwap,
}: {
  context?: DailyContext;
  recommendation?: RecommendationResult;
  winner?: FragranceProfile;
  profileMap: Map<string, FragranceProfile>;
  loadState: LoadState;
  message: string;
  adjusting: boolean;
  activeWear?: WearLog;
  onToggleAdjust: () => void;
  onRecompute: (patch: Partial<DailyContext>, force?: boolean) => void;
  onWear: (profileId?: string) => void;
  onRate: (enjoyment: Enjoyment, strength?: StrengthFeedback) => void;
  onSwap: (candidate: CandidateScore) => void;
}) {
  const dateLabel = new Intl.DateTimeFormat('en-SG', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  return (
    <div className="page today-page">
      <section className="intro">
        <p className="eyebrow">{dateLabel}</p>
        <h1>Your air.<br /><span>Your scent.</span></h1>
        <p className="status-copy">{message}</p>
      </section>

      {context && <WeatherStrip context={context} />}

      <div className="context-row">
        <button className="context-summary" onClick={onToggleAdjust}>
          <span>{context?.occasion || 'Reading plans'}</span>
          <span>{context?.vibe || 'Balanced'}</span>
          <span>{context?.setting || 'Mixed'}</span>
          <b>{adjusting ? 'Close' : 'Adjust'}</b>
        </button>
      </div>

      {adjusting && context && <AdjustPanel context={context} onChange={onRecompute} />}

      {loadState === 'loading' && !recommendation && <RecommendationSkeleton />}
      {winner && recommendation && (
        <>
          <section className="recommendation-card">
            <div className="card-glow" />
            <div className="recommendation-topline">
              <span>Today’s choice</span>
              <ScoreRing score={recommendation.winner.score.total} />
            </div>
            <Bottle profile={winner} large />
            <p className="house">{winner.house}</p>
            <h2>{winner.name}</h2>
            <p className="edition">{winner.edition}</p>
            <div className="accord-list">
              {winner.accords.slice(0, 4).map((accord) => <span key={accord}>{accord}</span>)}
            </div>
            <div className="reason-list">
              {recommendation.winner.reasons.map((reason) => <p key={reason}>{reason}</p>)}
            </div>
            <div className="application"><span>Application</span><strong>{recommendation.winner.application}</strong></div>
            <ScoreBreakdown candidate={recommendation.winner} />
            {!activeWear ? (
              <button className="primary-button" onClick={() => onWear()}>Wear this today</button>
            ) : (
              <FeedbackPanel activeWear={activeWear} onRate={onRate} />
            )}
          </section>

          <section className="alternatives">
            <div className="section-heading"><div><p className="eyebrow">Close contenders</p><h3>Other directions</h3></div></div>
            <div className="alternative-grid">
              {recommendation.alternatives.map((candidate) => {
                const profile = profileMap.get(candidate.profileId);
                return profile ? (
                  <button className="alternative-card" key={candidate.profileId} onClick={() => onSwap(candidate)}>
                    <Bottle profile={profile} />
                    <div><span>{candidate.score.total} match</span><strong>{profile.name}</strong><small>{profile.house}</small></div>
                  </button>
                ) : null;
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function WeatherStrip({ context }: { context: DailyContext }) {
  return (
    <section className="weather-strip">
      <div><span>Feels like</span><strong>{Math.round(context.weather.apparentTemperatureC)}°</strong></div>
      <div><span>Humidity</span><strong>{Math.round(context.weather.humidity)}%</strong></div>
      <div><span>Rain</span><strong>{Math.round(context.weather.rainProbability)}%</strong></div>
      <div className="weather-description"><span>{context.weather.source}</span><strong>{weatherLabel(context.weather.weatherCode)}</strong></div>
    </section>
  );
}

function AdjustPanel({ context, onChange }: { context: DailyContext; onChange: (patch: Partial<DailyContext>) => void }) {
  return (
    <section className="adjust-panel">
      <ChoiceRow label="Occasion" values={OCCASIONS} selected={context.occasion} onSelect={(occasion) => onChange({ occasion })} />
      <ChoiceRow label="Mood" values={VIBES} selected={context.vibe} onSelect={(vibe) => onChange({ vibe })} />
      <ChoiceRow label="Setting" values={SETTINGS} selected={context.setting} onSelect={(setting) => onChange({ setting })} />
    </section>
  );
}

function ChoiceRow<T extends string>({ label, values, selected, onSelect }: {
  label: string; values: readonly T[]; selected: T; onSelect: (value: T) => void;
}) {
  return <div className="choice-row"><span>{label}</span><div>{values.map((value) => (
    <button key={value} className={selected === value ? 'selected' : ''} onClick={() => onSelect(value)}>{value}</button>
  ))}</div></div>;
}

function ScoreBreakdown({ candidate }: { candidate: CandidateScore }) {
  const parts = [
    ['Climate', candidate.score.climate, 25], ['Occasion', candidate.score.occasion, 25],
    ['Taste', candidate.score.taste, 20], ['Time', candidate.score.time, 10],
    ['Rotation', candidate.score.rotation, 10], ['Vibe', candidate.score.vibe, 10],
  ] as const;
  return <div className="score-breakdown">{parts.map(([label, value, max]) => (
    <div className="score-row" key={label}><span>{label}</span><i><b style={{ width: `${(value / max) * 100}%` }} /></i><strong>{value}</strong></div>
  ))}</div>;
}

function FeedbackPanel({ activeWear, onRate }: { activeWear: WearLog; onRate: (enjoyment: Enjoyment, strength?: StrengthFeedback) => void }) {
  if (activeWear.enjoyment) return <div className="feedback-saved">Feedback saved · {activeWear.enjoyment}/5</div>;
  return (
    <div className="feedback-panel">
      <strong>How did it wear?</strong>
      <div className="rating-row">{([1, 2, 3, 4, 5] as Enjoyment[]).map((rating) => (
        <button key={rating} onClick={() => onRate(rating)} aria-label={`${rating} out of 5`}>{rating}</button>
      ))}</div>
      <div className="strength-row">
        <button onClick={() => onRate(3, 'too-faint')}>Too faint</button>
        <button onClick={() => onRate(4, 'right')}>Just right</button>
        <button onClick={() => onRate(3, 'too-strong')}>Too strong</button>
      </div>
    </div>
  );
}

function ShelfView({ state, onToggle, onAdd }: {
  state: AppState;
  onToggle: (profileId: string, active: boolean) => void;
  onAdd: (input: ManualFragranceInput) => Promise<void>;
}) {
  const active = new Map(state.collection.map((item) => [item.profileId, item.active]));
  return (
    <div className="page inner-page">
      <p className="eyebrow">The wardrobe</p><h1>Your shelf</h1>
      <p className="page-lede">Turn a bottle off without deleting its profile or history.</p>
      <AddBottleForm onAdd={onAdd} />
      <div className="shelf-grid">{state.catalog.map((profile) => (
        <article className={`shelf-card ${active.get(profile.id) ? '' : 'inactive'}`} key={profile.id}>
          <Bottle profile={profile} />
          <div className="shelf-card-copy">
            <p>{profile.house}</p><h2>{profile.name}</h2><span>{profile.edition}</span>
            <div className="mini-accords">{profile.accords.slice(0, 3).map((item) => <i key={item}>{item}</i>)}</div>
            {profile.needsConfirmation && <small className="confirm-badge">Edition to confirm</small>}
          </div>
          <label className="switch"><input type="checkbox" checked={active.get(profile.id) ?? true} onChange={(event) => onToggle(profile.id, event.target.checked)} /><span /></label>
        </article>
      ))}</div>
    </div>
  );
}

function AddBottleForm({ onAdd }: { onAdd: (input: ManualFragranceInput) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [house, setHouse] = useState('');
  const [edition, setEdition] = useState('');
  const [accords, setAccords] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onAdd({
      name: name.trim(), house: house.trim(), edition: edition.trim(),
      accords: accords.split(',').map((item) => item.trim()).filter(Boolean),
    });
    setName(''); setHouse(''); setEdition(''); setAccords(''); setBusy(false); setOpen(false);
  }

  return (
    <section className={`add-bottle ${open ? 'open' : ''}`}>
      <button className="add-bottle-toggle" onClick={() => setOpen((value) => !value)}>
        <span>＋</span><div><strong>Add a bottle</strong><small>Start with a transparent provisional profile</small></div><b>{open ? 'Close' : 'Open'}</b>
      </button>
      {open && <form onSubmit={submit}>
        <label>Fragrance name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Terre d’Hermès" /></label>
        <label>House<input value={house} onChange={(event) => setHouse(event.target.value)} placeholder="e.g. Hermès" /></label>
        <label>Edition<input value={edition} onChange={(event) => setEdition(event.target.value)} placeholder="e.g. Eau de Toilette" /></label>
        <label className="wide">Main accords<input value={accords} onChange={(event) => setAccords(event.target.value)} placeholder="citrus, woody, aromatic" /></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add to shelf'}</button>
      </form>}
    </section>
  );
}

function HistoryView({ logs, profileMap }: { logs: WearLog[]; profileMap: Map<string, FragranceProfile> }) {
  return (
    <div className="page inner-page">
      <p className="eyebrow">Memory</p><h1>Wear history</h1>
      <p className="page-lede">Every wear gives the scoring engine better evidence.</p>
      <div className="history-list">{logs.length ? logs.map((log) => {
        const names = log.profileIds.map((id) => profileMap.get(id)?.name || id).join(' + ');
        return <article key={log.id}><div><strong>{names}</strong><span>{log.context.occasion} · {Math.round(log.context.weather.apparentTemperatureC)}°C</span></div><div><b>{log.enjoyment ? `${log.enjoyment}/5` : 'Unrated'}</b><time>{new Date(log.wornAt).toLocaleDateString()}</time></div></article>;
      }) : <div className="empty-state">Your first wear will appear here.</div>}</div>
    </div>
  );
}

function SettingsView({ state, tasteDraft, onTasteChange, onSave }: {
  state: AppState; tasteDraft: string; onTasteChange: (value: string) => void; onSave: () => void;
}) {
  return (
    <div className="page inner-page">
      <p className="eyebrow">Personalization</p><h1>Advisor settings</h1>
      <section className="settings-card">
        <label htmlFor="taste">Taste memory</label>
        <p>Use plain language: what you love, avoid, or reserve for certain situations.</p>
        <textarea id="taste" value={tasteDraft} onChange={(event) => onTasteChange(event.target.value)} placeholder="I prefer clean scents for work. Keep heavier woods for rainy evenings…" />
        <button className="primary-button" onClick={onSave}>Save memory</button>
      </section>
      <section className="settings-card data-card">
        <span>Default location</span><strong>Singapore · {state.preferences.timezone}</strong>
        <span>Wardrobe profiles</span><strong>{state.catalog.length}</strong>
        <span>Recorded wears</span><strong>{state.wearLogs.length}</strong>
        <p className="privacy-note">API keys and legacy GitHub tokens are never imported or synced.</p>
      </section>
    </div>
  );
}

function Bottle({ profile, large = false }: { profile: FragranceProfile; large?: boolean }) {
  const colors = palette(profile.accords);
  return (
    <div className={`bottle ${large ? 'large' : ''}`} style={{ '--bottle-a': colors[0], '--bottle-b': colors[1] } as React.CSSProperties} aria-hidden="true">
      <div className="bottle-cap" /><div className="bottle-neck" />
      <div className="bottle-body"><div className="bottle-label"><small>{profile.house}</small><b>{profile.name}</b></div></div>
    </div>
  );
}

function palette(accords: string[]) {
  const joined = accords.join(' ');
  if (/aquatic|marine/.test(joined)) return ['#72b6c9', '#18485c'];
  if (/citrus|grapefruit/.test(joined)) return ['#e9c35b', '#9a6b25'];
  if (/floral|rose/.test(joined)) return ['#d99cab', '#764657'];
  if (/green|aromatic/.test(joined)) return ['#8ca27a', '#344b38'];
  if (/woody|leather|tobacco/.test(joined)) return ['#a47953', '#3e2a25'];
  return ['#b39ac5', '#4e3e5c'];
}

function ScoreRing({ score }: { score: number }) {
  return <div className="score-ring" style={{ '--score': `${score * 3.6}deg` } as React.CSSProperties}><strong>{Math.round(score)}</strong><span>match</span></div>;
}

function RecommendationSkeleton() {
  return <section className="recommendation-card skeleton"><div className="pulse circle" /><div className="pulse line wide" /><div className="pulse line" /><div className="pulse block" /></section>;
}

function NavIcon({ view }: { view: View }) {
  const icons: Record<View, string> = { today: '✦', shelf: '▥', history: '◷', settings: '⌁' };
  return <i>{icons[view]}</i>;
}
