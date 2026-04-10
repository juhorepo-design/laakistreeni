import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  BrainCircuit,
  Activity,
  Award,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  BarChart3,
  Zap,
  RefreshCw,
  PlusCircle,
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
} from 'firebase/firestore';

// --- GLOBAALIT MUUTTUJAT YMPÄRISTÖSTÄ ---
const firebaseConfig =
  typeof __firebase_config !== 'undefined' && __firebase_config
    ? JSON.parse(__firebase_config)
    : {
        apiKey: 'AIzaSyA66M4dCI6i1c_tp3XmWK8N7cmBaHxuaw4',
        authDomain: 'laakistreeni.firebaseapp.com',
        projectId: 'laakistreeni',
        storageBucket: 'laakistreeni.firebasestorage.app',
        messagingSenderId: '843448166281',
        appId: '1:843448166281:web:2b9fe9a2d66d5824ba6358',
        measurementId: 'G-1KPNP2TY8G',
      };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- VARATIEDOT (Fallback) ---
const ALKUPERAISET_KYSYMYKSET = [
  {
    subject: 'Biologia',
    topic: 'Solubiologia',
    question: 'Mikä seuraavista väittämistä koskien solukalvon rakennetta ja toimintaa on TOSI?',
    options: [
      'Happimolekyylit siirtyvät solukalvon läpi avustetulla diffuusiolla.',
      'Kolesteroli lisää solukalvon juoksevuutta alhaisissa lämpötiloissa.',
      'Aktiivinen kuljetus tapahtuu aina pitoisuuserojen suuntaan.',
      'Kaikki solukalvon proteiinit ovat kiinnittyneet kalvon sisäpintaan.',
    ],
    correctAnswer: 1,
    explanation: 'Kolesteroli puskuroi solukalvon juoksevuuden muutoksia: se estää kalvoa jähmettymästä liikaa kylmässä ja liian juoksevaksi muuttumista lämpimässä.',
  }
];

// --- TEKOÄLY-INTEGRAATIO AUTOMAATTISELLA UUDELLEENYRITYKSELLÄ ---
const callGeminiAPI = async (prompt, isJson = false) => {
  let apiKey = "";
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    }
  } catch (e) {}

  if (!apiKey) {
    apiKey = 'AIzaSyClAoECSG5E2HVpQphA9fN_v-vZTSadF5s'; 
  }

  const model = 'gemini-2.5-flash-preview-09-2025';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const payload = { 
    contents: [{ parts: [{ text: prompt }] }],
    ...(isJson && { generationConfig: { responseMimeType: "application/json" } })
  };

  const delays = [1000, 2000, 4000, 8000];
  
  for (let i = 0; i <= delays.length; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Tyhjä vastaus.");
        
        if (isJson) {
          text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          return JSON.parse(text);
        }
        return text;
      }
      if ((response.status === 429 || response.status === 503) && i < delays.length) {
        await new Promise(r => setTimeout(r, delays[i]));
        continue;
      }
      throw new Error(`Virhe ${response.status}`);
    } catch (error) {
      if (i === delays.length) throw error;
      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
};

// --- KOMPONENTIT ---

const Navbar = ({ currentView, setCurrentView }) => (
  <nav className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
      <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
        <Activity className="h-8 w-8 text-emerald-400" />
        <span className="font-bold text-xl tracking-tight">Lääkis<span className="text-emerald-400">Treeni</span></span>
      </div>
      <div className="flex space-x-1 sm:space-x-2">
        <button onClick={() => setCurrentView('dashboard')} className={`px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${currentView === 'dashboard' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}>Kojelauta</button>
        <button onClick={() => setCurrentView('quiz')} className={`px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${currentView === 'quiz' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}>Koe</button>
        <button onClick={() => setCurrentView('flashcards')} className={`px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${currentView === 'flashcards' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}>Kortit</button>
      </div>
    </div>
  </nav>
);

const Dashboard = ({ setCurrentView, stats, totalQuestions }) => {
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [msg, setMsg] = useState("");

  const generateNewQuestions = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setMsg("Tekoäly luo uusia kysymyksiä tietokantaan...");
    try {
      const prompt = `Luo 5 haastavaa monivalintakysymystä lääketieteellisen valintakokeen (Valintakoe B) tyylillä. Aihe: ${topic || 'sekoitus biologiaa, kemiaa ja fysiikkaa'}. Vastaa JSON-taulukolla: [{"subject": "Aine", "topic": "Aihe", "question": "Kysymys", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "explanation": "Selitys"}].`;
      const newQuestions = await callGeminiAPI(prompt, true);
      
      const qRef = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
      for (const q of newQuestions) {
        await addDoc(qRef, q);
      }
      setMsg(`Onnistui! Lisättiin 5 uutta kysymystä pankkiin.`);
      setTopic('');
    } catch (e) {
      setMsg("Virhe luonnissa. Yritä hetken kuluttua uudelleen.");
    }
    setIsGenerating(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-slate-900 mb-2">Opiskeluasema</h1>
        <p className="text-slate-500">Tietokannassa on nyt <span className="text-emerald-600 font-bold">{totalQuestions}</span> uniikkia kysymystä.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Oikein %</p>
          <p className="text-4xl font-black text-emerald-600">{stats.questionsAnswered > 0 ? Math.round((stats.correctAnswers / stats.questionsAnswered) * 100) : 0}%</p>
        </div>
        
        <button onClick={() => setCurrentView('quiz')} className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex justify-between items-center group active:scale-95 transition-all lg:col-span-2">
          <div className="text-left">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Harjoittelu</p>
            <p className="text-2xl font-bold">Aloita satunnainen treenikoe</p>
          </div>
          <ChevronRight className="h-8 w-8 text-emerald-400 group-hover:translate-x-2 transition-transform" />
        </button>
      </div>

      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border-2 border-dashed border-slate-200">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center">
            <PlusCircle className="mr-3 text-emerald-500" /> Laajenna kysymyspankkia
          </h2>
          <p className="text-slate-600 mb-8">Voit luoda tekoälyllä uusia kysymyksiä mistä tahansa aiheesta. Ne lisätään yhteiseen pankkiin kaikkien hyödyksi.</p>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              placeholder="Esim. Soluhengitys, Orgaaninen kemia..." 
              className="flex-1 p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-emerald-50 outline-none transition-all"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
            <button 
              onClick={generateNewQuestions}
              disabled={isGenerating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              {isGenerating ? 'Luodaan...' : 'Luo 5 kysymystä'}
            </button>
          </div>
          {msg && <p className="mt-4 text-sm font-medium text-emerald-600 animate-pulse">{msg}</p>}
        </div>
      </div>
    </div>
  );
};

const Quiz = ({ questions, onComplete }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [shuffledQuestions, setShuffledQuestions] = useState([]);

  useEffect(() => {
    if (questions.length > 0) {
      const shuffled = [...questions].sort(() => 0.5 - Math.random());
      setShuffledQuestions(shuffled.slice(0, 5));
    }
  }, [questions]);

  if (!shuffledQuestions.length) return <div className="p-20 text-center text-slate-500 font-medium">Valmistellaan koetta...</div>;
  const q = shuffledQuestions[currentIdx];

  const handleNext = () => {
    if (currentIdx < shuffledQuestions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setSelected(null);
      setIsAnswered(false);
    } else {
      onComplete(score, shuffledQuestions.length);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-in slide-in-from-bottom-8 duration-500">
      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-xl border border-slate-100 mb-8">
        <div className="flex justify-between items-center mb-8">
          <div className="bg-slate-100 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">
            {q.subject} • {currentIdx + 1}/{shuffledQuestions.length}
          </div>
        </div>
        
        <h2 className="text-xl md:text-2xl font-bold mb-10 text-slate-800 leading-tight">{q.question}</h2>
        
        <div className="space-y-4">
          {q.options.map((opt, i) => (
            <button 
              key={i} 
              onClick={() => { if(!isAnswered){ setSelected(i); setIsAnswered(true); if(i===q.correctAnswer)setScore(score+1) }}}
              className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex justify-between items-center group ${
                isAnswered 
                  ? (i === q.correctAnswer ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-4 ring-emerald-50' : (selected === i ? 'border-red-500 bg-red-50 text-red-900' : 'border-slate-50 opacity-30')) 
                  : 'border-slate-100 hover:border-emerald-200 hover:bg-slate-50 text-slate-700 shadow-sm'
              }`}
            >
              <span className="font-semibold">{opt}</span>
              {isAnswered && i === q.correctAnswer && <CheckCircle2 className="h-6 w-6 text-emerald-500" />}
              {isAnswered && selected === i && i !== q.correctAnswer && <XCircle className="h-6 w-6 text-red-500" />}
            </button>
          ))}
        </div>

        {isAnswered && (
          <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <p className="text-sm leading-relaxed text-slate-600"><span className="font-bold text-slate-900 block mb-2 underline decoration-emerald-200 underline-offset-4">Oikea vastaus & selitys:</span> {q.explanation}</p>
          </div>
        )}
      </div>

      {isAnswered && (
        <button onClick={handleNext} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-2xl transition-all flex items-center justify-center space-x-3 active:scale-95 group">
          <span>{currentIdx < shuffledQuestions.length - 1 ? 'Seuraava kysymys' : 'Viimeistele ja katso tulokset'}</span>
          <ChevronRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
        </button>
      )}
    </div>
  );
};

const Flashcards = ({ cards, setCards, user }) => {
  const [currentCard, setCurrentCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [customTopic, setCustomTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  if (!cards.length) return <div className="p-20 text-center text-slate-500">Ladataan kortteja...</div>;
  const card = cards[currentCard];

  const handleGenerate = async () => {
    if (!customTopic.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const prompt = `Luo 3 lääketieteen muistikorttia aiheesta: "${customTopic}". Vastaa JSONina: [{"front": "kysymys", "back": "vastaus"}].`;
      const newCards = await callGeminiAPI(prompt, true);
      const fRef = collection(db, 'artifacts', appId, 'public', 'data', 'flashcards');
      for (const c of newCards) { await addDoc(fRef, c); }
      setCustomTopic('');
    } catch (e) { console.error(e); }
    setIsGenerating(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center">
      <div className="w-full bg-indigo-50 p-6 rounded-3xl border border-indigo-100 mb-10 flex flex-col sm:flex-row gap-3">
        <input type="text" placeholder="Aihe muistikorteille..." className="flex-1 p-4 rounded-2xl border border-indigo-200 outline-none focus:ring-4 focus:ring-indigo-100" value={customTopic} onChange={e => setCustomTopic(e.target.value)} />
        <button onClick={handleGenerate} disabled={isGenerating} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold shadow-md active:scale-95 transition-all">
          {isGenerating ? 'Luodaan...' : 'Luo kortit'}
        </button>
      </div>

      <div className="w-full relative min-h-[400px] cursor-pointer group mb-10 perspective-1000" onClick={() => setIsFlipped(!isFlipped)}>
        <div className={`absolute inset-0 w-full h-full bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-xl p-10 flex flex-col items-center justify-center text-center transition-all duration-700 backface-hidden ${isFlipped ? 'opacity-0 rotate-y-180 pointer-events-none' : 'opacity-100 rotate-y-0'}`}>
           <h3 className="text-2xl font-black text-slate-800 overflow-y-auto max-h-full pr-2 custom-scrollbar">{card.front}</h3>
           <div className="absolute bottom-6 text-slate-300 font-bold text-xs tracking-widest uppercase">Napauta kääntääksesi</div>
        </div>

        <div className={`absolute inset-0 w-full h-full bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] shadow-2xl p-10 flex flex-col items-center justify-center text-center text-white transition-all duration-700 backface-hidden ${isFlipped ? 'opacity-100 rotate-y-0' : 'opacity-0 rotate-y-180 pointer-events-none'}`}>
           <div className="w-full overflow-y-auto max-h-full pr-2 custom-scrollbar">
             <p className="text-xl leading-relaxed font-medium">{card.back}</p>
           </div>
        </div>
      </div>

      {isFlipped && (
        <button onClick={() => {setIsFlipped(false); setCurrentCard((currentCard + 1) % cards.length);}} className="w-full bg-emerald-600 text-white font-bold py-5 rounded-2xl shadow-xl active:scale-95">
          Seuraava kortti
        </button>
      )}
    </div>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [stats, setStats] = useState({ questionsAnswered: 0, correctAnswers: 0 });
  const [user, setUser] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. KIRJAUTUMINEN (SÄÄNTÖ 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, u => { if(u) setUser(u); });
    return () => unsubscribe();
  }, []);

  // 2. DATAHAKU (Varmistetaan auth ennen hakuja)
  useEffect(() => {
    if (!user) return;

    const qRef = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
    const fRef = collection(db, 'artifacts', appId, 'public', 'data', 'flashcards');

    const unsubQ = onSnapshot(qRef, snap => {
      if (snap.empty) {
        setQuestions(ALKUPERAISET_KYSYMYKSET);
        ALKUPERAISET_KYSYMYKSET.forEach(q => addDoc(qRef, q));
      } else {
        setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    }, (err) => {
      console.error("Firestore Q error:", err);
      setQuestions(ALKUPERAISET_KYSYMYKSET);
    });

    const unsubF = onSnapshot(fRef, snap => {
      setFlashcards(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    }, (err) => {
      console.error("Firestore F error:", err);
      setIsLoading(false);
    });

    return () => { unsubQ(); unsubF(); };
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <Navbar currentView={currentView} setCurrentView={setCurrentView} />
      <main>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="relative h-16 w-16 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100"></div>
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Valmistellaan materiaaleja...</p>
          </div>
        ) : (
          <>
            {currentView === 'dashboard' && <Dashboard setCurrentView={setCurrentView} stats={stats} totalQuestions={questions.length} />}
            {currentView === 'quiz' && (
              <Quiz 
                questions={questions} 
                onComplete={(s, t) => {
                  setStats(p => ({ questionsAnswered: p.questionsAnswered + t, correctAnswers: p.correctAnswers + s })); 
                  setCurrentView('dashboard');
                }} 
              />
            )}
            {currentView === 'flashcards' && <Flashcards cards={flashcards} setCards={setFlashcards} user={user} />}
          </>
        )}
      </main>
      <style>{`
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .rotate-y-0 { transform: rotateY(0deg); }
        .perspective-1000 { perspective: 1000px; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.2); border-radius: 10px; }
        body { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
