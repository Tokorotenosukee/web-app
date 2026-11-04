import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type Category = { id: string; label: string; phrases: string[] };
type Settings = { fontSize: number; buttonSize: number; rate: number; voiceName: string; saveHistory: boolean };
type HistoryItem = { id: string; text: string; createdAt: number };
const defaultCategories: Category[] = [
  { id: 'reply', label: '返事', phrases: ['はい', 'いいえ', 'ありがとう', 'ちょっと待って'] },
  { id: 'life', label: '生活', phrases: ['水が飲みたい', 'お腹がすいた', 'トイレに行きたい', '体勢を変えて'] },
  { id: 'condition', label: '体調', phrases: ['痛い', '苦しい', '寒い', '暑い'] },
  { id: 'talk', label: '会話', phrases: ['もう一度言って', 'わからない', '話したい', '家族を呼んで'] },
];
const defaults: Settings = { fontSize: 28, buttonSize: 1, rate: 1, voiceName: '', saveHistory: true };
const load = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };

function App() {
  const [screen, setScreen] = useState('home');
  const [categories, setCategories] = useState<Category[]>(() => load('ohanas-categories', defaultCategories));
  const [settings, setSettings] = useState<Settings>(() => ({ ...defaults, ...load<Partial<Settings>>('ohanas-settings', {}) }));
  const [active, setActive] = useState('reply');
  const [current, setCurrent] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const voices = useMemo(() => window.speechSynthesis?.getVoices?.() || [], [speaking]);
  const activeCategory = categories.find(c => c.id === active) || categories[0];

  useEffect(() => { localStorage.setItem('ohanas-categories', JSON.stringify(categories)); }, [categories]);
  useEffect(() => { localStorage.setItem('ohanas-settings', JSON.stringify(settings)); document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`); }, [settings]);
  useEffect(() => { loadHistory().then(setHistory); }, []);

  async function loadHistory() { const db = await openDb(); return new Promise<HistoryItem[]>(resolve => { const req = db.transaction('history').objectStore('history').getAll(); req.onsuccess = () => resolve((req.result as HistoryItem[]).sort((a,b) => b.createdAt-a.createdAt)); req.onerror = () => resolve([]); }); }
  async function saveHistoryItem(item: HistoryItem) { const db = await openDb(); db.transaction('history', 'readwrite').objectStore('history').put(item); }
  async function speak(value: string) {
    const phrase = value.trim(); if (!phrase) return;
    if (!('speechSynthesis' in window)) { setError('この端末では読み上げを利用できません。'); return; }
    window.speechSynthesis.cancel(); setError(''); setCurrent(phrase); setSpeaking(true);
    const u = new SpeechSynthesisUtterance(phrase); u.lang = 'ja-JP'; u.rate = settings.rate;
    const voice = voices.find(v => v.name === settings.voiceName) || voices.find(v => v.lang.toLowerCase().startsWith('ja'));
    if (voice) u.voice = voice; u.onend = () => setSpeaking(false); u.onerror = () => { setSpeaking(false); setError('読み上げで問題が起きました。もう一度お試しください。'); };
    utterance.current = u; window.speechSynthesis.speak(u);
    if (settings.saveHistory) { const item = { id: crypto.randomUUID(), text: phrase, createdAt: Date.now() }; await saveHistoryItem(item); setHistory(h => [item, ...h].slice(0, 100)); }
  }
  function stop() { window.speechSynthesis?.cancel(); setSpeaking(false); }
  function updateSettings(next: Partial<Settings>) { setSettings(s => ({ ...s, ...next })); }
  function exportData() { const blob = new Blob([JSON.stringify({ categories, settings }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ohanas-backup.json'; a.click(); URL.revokeObjectURL(a.href); }
  function importData(file: File) { const reader = new FileReader(); reader.onload = () => { try { const d = JSON.parse(String(reader.result)); if (Array.isArray(d.categories)) setCategories(d.categories); if (d.settings) setSettings({ ...defaults, ...d.settings }); alert('バックアップを読み込みました。'); } catch { alert('JSONを読み込めませんでした。'); } }; reader.readAsText(file); }
  async function clearHistory() { if (!confirm('履歴をすべて削除しますか？')) return; const db = await openDb(); db.transaction('history', 'readwrite').objectStore('history').clear(); setHistory([]); }
  function addPhrase() { const value = prompt('追加する定型文'); if (!value?.trim()) return; setCategories(cs => cs.map(c => c.id === active ? { ...c, phrases: [...c.phrases, value.trim()] } : c)); }
  function editPhrase(categoryId: string, index: number) { const value = prompt('定型文を編集', categories.find(c => c.id === categoryId)?.phrases[index]); if (!value?.trim()) return; setCategories(cs => cs.map(c => c.id === categoryId ? { ...c, phrases: c.phrases.map((p,i) => i === index ? value.trim() : p) } : c)); }
  function deletePhrase(categoryId: string, index: number) { if (!confirm('この定型文を削除しますか？')) return; setCategories(cs => cs.map(c => c.id === categoryId ? { ...c, phrases: c.phrases.filter((_,i) => i !== index) } : c)); }

  return <div className="app" style={{ '--button-scale': settings.buttonSize } as CSSProperties}>
    <header><h1>おはなし</h1><div className="status" aria-live="polite">{speaking ? '読み上げ中' : error || 'いつでも話しかけてください'}</div></header>
    <div className="global-stop"><button className="stop" onClick={stop} disabled={!speaking}>■ 読み上げを止める</button></div>
    <main>{screen === 'home' && <Home current={current} category={activeCategory} categories={categories} active={active} setActive={setActive} speak={speak} />}
      {screen === 'input' && <Input text={text} setText={setText} speak={speak} stop={stop} />}
      {screen === 'history' && <History items={history} speak={speak} add={value => setCategories(cs => cs.map(c => c.id === active ? {...c, phrases: [...c.phrases, value]} : c))} clear={clearHistory} />}
      {screen === 'settings' && <SettingsView settings={settings} update={updateSettings} categories={categories} addPhrase={addPhrase} editPhrase={editPhrase} deletePhrase={deletePhrase} exportData={exportData} importData={importData} />}
    </main>
    <nav aria-label="メインメニュー">{[['home','ホーム'],['input','自由入力'],['history','履歴'],['settings','設定']].map(([id,label]) => <button key={id} className={screen === id ? 'selected' : ''} onClick={() => setScreen(id)}>{label}</button>)}</nav>
  </div>;
}

function Home({current,category,categories,active,setActive,speak}:{current:string;category:Category;categories:Category[];active:string;setActive:(v:string)=>void;speak:(v:string)=>void}) { return <section className="home"><div className="current" aria-live="polite">{current || '定型文を選んでください'}</div><div className="tabs">{categories.map(c => <button key={c.id} className={c.id===active?'selected':''} onClick={() => setActive(c.id)}>{c.label}</button>)}</div><div className="phrase-grid">{category?.phrases.map(p => <button className="phrase" key={p} onClick={() => speak(p)}>{p}</button>)}</div></section> }
function Input({text,setText,speak,stop}:{text:string;setText:(v:string)=>void;speak:(v:string)=>void;stop:()=>void}) { return <section className="input-screen"><label htmlFor="speech-text">話したいこと</label><textarea id="speech-text" value={text} onChange={e=>setText(e.target.value)} placeholder="ここに文章を入力してください" autoFocus /><div className="actions"><button className="primary" onClick={()=>speak(text)}>話す</button><button className="stop" onClick={stop}>停止</button><button onClick={()=>{if(confirm('入力中の文章を削除しますか？'))setText('')}}>全文削除</button></div><p className="hint">読み上げ後も文章は残ります。</p></section> }
function History({items,speak,add,clear}:{items:HistoryItem[];speak:(v:string)=>void;add:(v:string)=>void;clear:()=>void}) { return <section><div className="section-head"><h2>発話履歴</h2><button onClick={clear}>履歴をすべて削除</button></div>{items.length===0?<p className="empty">履歴はありません。</p>:<div className="history-list">{items.map(i=><div className="history-row" key={i.id}><button className="history-text" onClick={()=>speak(i.text)}>{i.text}<small>{new Date(i.createdAt).toLocaleString('ja-JP')}</small></button><button onClick={()=>{add(i.text);alert('現在のカテゴリに登録しました。')}}>定型文に登録</button></div>)}</div>}</section> }
function SettingsView({settings,update,categories,addPhrase,editPhrase,deletePhrase,exportData,importData}:{settings:Settings;update:(v:Partial<Settings>)=>void;categories:Category[];addPhrase:()=>void;editPhrase:(c:string,i:number)=>void;deletePhrase:(c:string,i:number)=>void;exportData:()=>void;importData:(f:File)=>void}) { const voices=window.speechSynthesis?.getVoices?.()||[]; return <section className="settings"><h2>設定</h2><div className="setting-grid"><label>文字サイズ <input type="range" min="24" max="48" step="2" value={settings.fontSize} onChange={e=>update({fontSize:Number(e.target.value)})}/><output>{settings.fontSize}px</output></label><label>ボタンサイズ <input type="range" min="0.9" max="1.25" step="0.05" value={settings.buttonSize} onChange={e=>update({buttonSize:Number(e.target.value)})}/></label><label>音声速度 <input type="range" min="0.6" max="1.4" step="0.1" value={settings.rate} onChange={e=>update({rate:Number(e.target.value)})}/><output>{settings.rate.toFixed(1)}</output></label><label>日本語音声<select value={settings.voiceName} onChange={e=>update({voiceName:e.target.value})}><option value="">自動選択</option>{voices.filter(v=>v.lang.toLowerCase().startsWith('ja')).map(v=><option key={v.name} value={v.name}>{v.name}</option>)}</select></label><label className="check"><input type="checkbox" checked={settings.saveHistory} onChange={e=>update({saveHistory:e.target.checked})}/> 発話履歴を保存する</label></div><h3>定型文の編集</h3>{categories.map(c=><div className="edit-category" key={c.id}><strong>{c.label}</strong>{c.phrases.map((p,i)=><div key={`${c.id}-${i}`}><span>{p}</span><button onClick={()=>editPhrase(c.id,i)}>編集</button><button onClick={()=>deletePhrase(c.id,i)}>削除</button></div>)}{c.id===categories[0].id&&<button onClick={addPhrase}>定型文を追加</button>}</div>)}<h3>バックアップ</h3><div className="backup"><button onClick={exportData}>JSONを書き出す</button><label className="file-button">JSONを読み込む<input type="file" accept="application/json" onChange={e=>e.target.files?.[0]&&importData(e.target.files[0])}/></label></div></section> }
function openDb(): Promise<IDBDatabase> { return new Promise((resolve,reject)=>{ const req=indexedDB.open('ohanas-db',1); req.onupgradeneeded=()=>req.result.createObjectStore('history',{keyPath:'id'}); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }

export default App;
