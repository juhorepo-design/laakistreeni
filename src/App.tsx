import React, { useState, useEffect } from 'react';
import {
  BookOpen, BrainCircuit, Activity, Award, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, RotateCcw, BarChart3, Calendar, Zap, RefreshCw, Plus
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc } from 'firebase/firestore';

// --- VARADATA (Jos tietokantayhteys pätkii) ---
const VARA_KYSYMYKSET = [
  {
    subject: 'Biologia',
    question: 'Mikä on solun "voimalaitos", jossa ATP-energia tuotetaan?',
    options: ['Ydin', 'Mitokondrio', 'Ribosomi', 'Solukalvo'],
    correctAnswer: 1,
    explanation: 'Mitokondriot vastaavat solun soluhengityksestä ja ATP-energian tuotannosta.'
  }
];

const VARA_KORTIT = [
  { front: 'Mitoosin vaiheet?', back: 'Profaasi, prometafaasi, metafaasi, anafaasi, telofaasi.' }
];

// --- FIREBASE ALUSTUS ---
const firebaseConfig = {
  apiKey: 'AIzaSyA66M4dCI6i1c_tp3XmWK8N7cmBaHxuaw4',
  authDomain: 'laakistreeni.firebaseapp.com',
  projectId: 'laakistreeni',
  storageBucket: 'laakistreeni.firebasestorage.app',
  messagingSenderId: '843448166281',
  appId: '1:843448166281:web:2b9fe9a2d66d5824ba6358'
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GEMINI API APUFUNKTIO (Käyttää Netlifyn VITE-avainta) ---
const callGeminiAPI = async (prompt: string, isJson = false, retries = 3) => {
  // @ts-ignore
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey || apiKey === "undefined") {
    throw new Error("API-avainta ei löydy Netlifyn asetuksista.");
  }

  // Kokeillaan useita malleja. Jos yksi on "Limit 0", siirrytään heti seuraavaan.
  const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash'];
  let lastErrorMessage = "";

  for (const model of modelsToTry) {
    // Käytetään v1-versiota, joka on stabiilein
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: isJson ? `${prompt} Vastaa PELKÄSTÄÄN puhtaalla JSON-taulukolla.` : prompt 
            }] 
          }]
        })
      });

      // Jos mallia ei löydy (404) TAI kiintiö on 0 (429), kokeillaan listan seuraavaa
      if (response.status === 404 || response.status === 429) {
        lastErrorMessage = `Malli ${model} antoi virheen ${response.status}.`;
        continue; 
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API-virhe ${response.status}: ${errorData.error?.message || 'Tuntematon virhe'}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) throw new Error("Tekoäly palautti tyhjän vastauksen.");

      if (isJson) {
        const cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);
      }
      return text;

    } catch (err: any) {
      // Jos virhe liittyy kiintiöön tai puuttuvaan malliin, jatketaan listassa eteenpäin
      if (err.message.includes("429") || err.message.includes("404")) continue;
      
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 2000));
        return callGeminiAPI(prompt, isJson, retries - 1);
      }
      throw err;
    }
  }
  
  throw new Error(`Kaikki tekoälymallit ovat tällä hetkellä varattuja tai rajoitettuja. Viimeisin viesti: ${lastErrorMessage}`);
};

// --- KOMPONENTIT ---

const Navbar = ({ setCurrentView }: { setCurrentView: (v: string) => void }) => (
  <nav className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
    <div className="max-w-7xl mx-auto flex justify-between items-center">
      <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
        <Activity className="text-emerald-400" />
        <span className="font-bold text-xl">LääkisTreeni</span>
      </div>
      <div className="flex space-x-4 text-sm font-medium">
        <button onClick={() => setCurrentView('dashboard')} className="hover:text-emerald-400 transition-colors">Kojelauta</button>
        <button onClick={() => setCurrentView('quiz')} className="hover:text-emerald-400 transition-colors">Koe</button>
        <button onClick={() => setCurrentView('flashcards')} className="hover:text-emerald-400 transition-colors">Kortit</button>
      </div>
    </div>
  </nav>
);

const Dashboard = ({ setCurrentView, stats, onGenerate, totalQuestions }: any) => {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in duration-500">
      <h1 className="text-3xl font-black mb-2 text-slate-900">Hei! Valmiina treeniin?</h1>
      <p className="text-slate-500 mb-8 font-medium">Pankissa on nyt <span className="text-emerald-600 font-bold">{totalQuestions}</span> kysymystä.</p>
      
      <div className="grid grid-cols-3 gap-4 mb-10 text-center">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Tehty</p>
          <p className="text-2xl font-black text-slate-800">{stats.questionsAnswered}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Oikein</p>
          <p className="text-2xl font-black text-emerald-500">{stats.questionsAnswered > 0 ? Math.round((stats.correctAnswers/stats.questionsAnswered)*100) : 0}%</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Putki</p>
          <p className="text-2xl font-black text-amber-500">4 pv</p>
        </div>
      </div>

      <div className="bg-indigo-900 text-white p-8 rounded-[2rem] shadow-xl mb-10">
        <h2 className="text-xl font-bold mb-4 flex items-center"><BrainCircuit className="mr-2 text-emerald-400" /> Laajenna kysymyspankkia ✨</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            className="flex-1 p-4 rounded-xl text-slate-900 outline-none" 
            placeholder="Aihe, esim. Soluhengitys" 
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button 
            className="bg-emerald-500 hover:bg-emerald-400 px-6 py-4 rounded-xl font-bold transition-all disabled:opacity-50"
            disabled={loading}
            onClick={async () => { 
                setLoading(true); 
                setMsg("Tekoäly miettii kysymyksiä...");
                await onGenerate(topic); 
                setLoading(false); 
                setTopic('');
                setMsg("Valmista! Uudet kysymykset lisätty.");
                setTimeout(() => setMsg(''), 3000);
            }}
          >
            {loading ? <RefreshCw className="animate-spin" /> : 'Luo 5 kysymystä'}
          </button>
        </div>
        {msg && <p className="mt-4 text-emerald-400 font-medium text-sm animate-pulse">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => setCurrentView('quiz')} className="bg-white p-8 rounded-3xl border-2 hover:border-emerald-500 transition-all text-left shadow-sm group">
          <h3 className="font-bold text-xl mb-1 group-hover:text-emerald-600 transition-colors">Aloita Treenikoe</h3>
          <p className="text-slate-500 text-sm font-medium">5 satunnaista kysymystä pankista</p>
        </button>
        <button onClick={() => setCurrentView('flashcards')} className="bg-white p-8 rounded-3xl border-2 hover:border-indigo-500 transition-all text-left shadow-sm group">
          <h3 className="font-bold text-xl mb-1 group-hover:text-indigo-600 transition-colors">Muistikortit</h3>
          <p className="text-slate-500 text-sm font-medium">Kertaa termejä ja kaavoja</p>
        </button>
      </div>
    </div>
  );
};

const Quiz = ({ questions, onComplete }: any) => {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);

  const pool = questions.length > 0 ? questions : VARA_KYSYMYKSET;
  const q = pool[idx];

  const handleAnswer = (i: number) => {
    if (answered) return;
    setSelected(i);
    setAnswered(true);
    if (i === q.correctAnswer) setScore(score + 1);
  };

  const handleNext = () => {
    if (idx < pool.length - 1) {
      setIdx(idx + 1); setSelected(null); setAnswered(false);
    } else {
      onComplete(score, pool.length);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 py-12 animate-in slide-in-from-bottom-8 duration-500">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{q.subject} • {idx+1}/{pool.length}</p>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-10 leading-tight">{q.question}</h2>
        <div className="space-y-3">
          {q.options.map((opt: string, i: number) => (
            <button 
              key={i} 
              onClick={() => handleAnswer(i)}
              className={`w-full p-5 rounded-2xl border-2 text-left font-semibold transition-all ${
                !answered ? "border-slate-50 hover:border-emerald-200 hover:bg-emerald-50" :
                i === q.correctAnswer ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm" :
                i === selected ? "border-red-500 bg-red-50 text-red-900" : "border-slate-50 opacity-40"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {answered && (
          <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 animate-in fade-in">
            <p className="font-bold text-slate-800 mb-2">Selitys:</p>
            <p className="text-slate-600 text-sm leading-relaxed">{q.explanation}</p>
            <button onClick={handleNext} className="w-full mt-8 bg-slate-900 text-white p-5 rounded-2xl font-bold shadow-lg active:scale-95 transition-all">
              {idx < pool.length - 1 ? "Seuraava kysymys" : "Katso tulokset"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const Flashcards = ({ cards }: any) => {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const pool = cards.length > 0 ? cards : VARA_KORTIT;
  const card = pool[idx];

  return (
    <div className="max-w-md mx-auto p-6 py-16 text-center">
      <div 
        className="aspect-[3/2] w-full mb-10 cursor-pointer"
        onClick={() => setFlipped(!flipped)}
        style={{ perspective: '1000px' }}
      >
        <div className={`relative w-full h-full transition-all duration-700 ${flipped ? 'rotate-y-180' : ''}`}
             style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
          <div className={`absolute inset-0 bg-white border-2 border-slate-100 rounded-[2rem] shadow-xl flex items-center justify-center p-10 font-bold text-2xl text-slate-800 backface-hidden ${flipped ? 'opacity-0' : 'opacity-100'}`} style={{ backfaceVisibility: 'hidden' }}>
            {card.front}
          </div>
          <div className={`absolute inset-0 bg-slate-900 text-white border-2 border-slate-900 rounded-[2rem] shadow-2xl flex items-center justify-center p-10 text-xl font-medium backface-hidden overflow-y-auto ${flipped ? 'opacity-100' : 'opacity-0'}`} style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            {card.back}
          </div>
        </div>
      </div>
      <button onClick={() => { setFlipped(false); setIdx((idx + 1) % pool.length); }} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all">Seuraava kortti</button>
    </div>
  );
};

// --- PÄÄSOVELLUS ---

export default function App() {
  const [view, setView] = useState('dashboard');
  const [user, setUser] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [quizSet, setQuizSet] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ questionsAnswered: 0, correctAnswers: 0 });

  // 1. Hätäkatkaisin: Jos tietokanta ei vastaa, päästetään sisään silti
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // 2. Anonyymi kirjautuminen
  useEffect(() => {
    signInAnonymously(auth).then(res => setUser(res.user)).catch(() => setUser({ uid: 'guest' }));
  }, []);

  // 3. Reaaliaikainen tiedon haku Firestoresta
  useEffect(() => {
    if (!user) return;
    const unsubQ = onSnapshot(collection(db, 'questions'), snap => {
      const data = snap.docs.map(d => d.data());
      if (data.length > 0) setQuestions(data);
      setLoading(false);
    });
    const unsubF = onSnapshot(collection(db, 'flashcards'), snap => {
      const data = snap.docs.map(d => d.data());
      if (data.length > 0) setFlashcards(data);
    });
    return () => { unsubQ(); unsubF(); };
  }, [user]);

  // FUNKTIOT
  const generateQuestions = async (topic: string) => {
    const prompt = `Luo 5 haastavaa lääketieteen pääsykoekysymystä aiheesta: ${topic || 'Biologia, kemia ja fysiikka'}. Vastaa vain JSON-muodossa: [{"subject": "Aihe", "question": "Kysymys?", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "explanation": "Miksi?"}]`;
    try {
      const newQs = await callGeminiAPI(prompt, true);
      for (const q of newQs) { await addDoc(collection(db, 'questions'), q); }
    } catch (e: any) { 
      // DIAGNOSTIIKKA-ALERT: Näyttää tarkan virheen
      alert("Virhetieto: " + e.message); 
    }
  };

  const startQuiz = () => {
    const pool = questions.length > 0 ? questions : VARA_KYSYMYKSET;
    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
    setQuizSet(shuffled);
    setView('quiz');
  };

  const handleQuizComplete = (score: number, total: number) => {
    setStats(prev => ({ 
      questionsAnswered: prev.questionsAnswered + total, 
      correctAnswers: prev.correctAnswers + score 
    }));
    setView('dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-emerald-100">
      <Navbar setCurrentView={setView} />
      <main>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[80vh]">
            <RefreshCw className="animate-spin text-emerald-500 h-12 w-12 mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Valmistellaan materiaaleja...</p>
          </div>
        ) : (
          <>
            {view === 'dashboard' && (
              <Dashboard 
                setCurrentView={(v: string) => v === 'quiz' ? startQuiz() : setView(v)} 
                stats={stats} 
                onGenerate={generateQuestions} 
                totalQuestions={questions.length} 
              />
            )}
            {view === 'quiz' && <Quiz questions={quizSet} onComplete={handleQuizComplete} />}
            {view === 'flashcards' && <Flashcards cards={flashcards} />}
          </>
        )}
      </main>
      <style>{`
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .rotate-y-0 { transform: rotateY(0deg); }
      `}</style>
    </div>
  );
}
