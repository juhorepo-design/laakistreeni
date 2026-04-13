import React, { useState, useEffect } from 'react';
import {
  BookOpen, BrainCircuit, Activity, Award, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, RotateCcw, BarChart3, Calendar, Zap, RefreshCw, Plus
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc } from 'firebase/firestore';

// --- VARADATA (Jos tietokanta ei vastaa) ---
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

// --- GEMINI API APUFUNKTIO ---
const callGeminiAPI = async (prompt, isJson = false, retries = 3) => {
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: isJson ? { responseMimeType: 'application/json' } : {}
        })
      });
      if (response.status === 503) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (isJson && text) {
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(text);
      }
      return text;
    } catch (err) { if (i === retries - 1) throw err; }
  }
};

// --- KOMPONENTIT ---

const Navbar = ({ setCurrentView }) => (
  <nav className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
    <div className="max-w-7xl mx-auto flex justify-between items-center">
      <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
        <Activity className="text-emerald-400" />
        <span className="font-bold text-xl">LääkisTreeni</span>
      </div>
      <div className="flex space-x-4 text-sm">
        <button onClick={() => setCurrentView('dashboard')}>Kojelauta</button>
        <button onClick={() => setCurrentView('quiz')}>Koe</button>
        <button onClick={() => setCurrentView('flashcards')}>Kortit</button>
      </div>
    </div>
  </nav>
);

const Dashboard = ({ setCurrentView, stats, onGenerate }) => {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Hei! Valmiina treeniin?</h1>
      
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm border text-center">
          <p className="text-xs text-slate-500 uppercase">Tehty</p>
          <p className="text-xl font-bold">{stats.questionsAnswered}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border text-center">
          <p className="text-xs text-slate-500 uppercase">Oikein</p>
          <p className="text-xl font-bold">{stats.questionsAnswered > 0 ? Math.round((stats.correctAnswers/stats.questionsAnswered)*100) : 0}%</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border text-center">
          <p className="text-xs text-slate-500 uppercase">Putki</p>
          <p className="text-xl font-bold">4 pv</p>
        </div>
      </div>

      <div className="bg-indigo-900 text-white p-6 rounded-2xl mb-8">
        <h2 className="font-bold mb-2">Luo uusia kysymyksiä tekoälyllä</h2>
        <div className="flex gap-2">
          <input 
            className="flex-1 p-3 rounded-lg text-slate-900" 
            placeholder="Aihe, esim. Verenkierto" 
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button 
            className="bg-emerald-500 px-4 py-2 rounded-lg font-bold disabled:opacity-50"
            disabled={loading}
            onClick={async () => { setLoading(true); await onGenerate(topic); setLoading(false); setTopic(''); }}
          >
            {loading ? '...' : 'Luo'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => setCurrentView('quiz')} className="bg-white p-6 rounded-2xl border-2 hover:border-emerald-500 text-left">
          <h3 className="font-bold text-lg">Aloita Treenikoe</h3>
          <p className="text-slate-500 text-sm">5 satunnaista kysymystä</p>
        </button>
        <button onClick={() => setCurrentView('flashcards')} className="bg-white p-6 rounded-2xl border-2 hover:border-indigo-500 text-left">
          <h3 className="font-bold text-lg">Muistikortit</h3>
          <p className="text-slate-500 text-sm">Kertaa termejä</p>
        </button>
      </div>
    </div>
  );
};

const Quiz = ({ questions, onComplete }) => {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);

  const q = questions[idx] || VARA_KYSYMYKSET[0];

  const handleNext = () => {
    const isCorrect = selected === q.correctAnswer;
    const newScore = isCorrect ? score + 1 : score;
    if (idx < questions.length - 1) {
      setIdx(idx + 1); setSelected(null); setScore(newScore);
    } else {
      onComplete(newScore, questions.length);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border">
        <p className="text-emerald-600 font-bold text-sm mb-2">{q.subject} • {idx+1}/{questions.length}</p>
        <h2 className="text-xl font-bold mb-6">{q.question}</h2>
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <button 
              key={i}
              onClick={() => setSelected(i)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${selected === i ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100'}`}
            >
              {opt}
            </button>
          ))}
        </div>
        {selected !== null && (
          <button onClick={handleNext} className="w-full mt-6 bg-slate-900 text-white p-4 rounded-xl font-bold">
            Seuraava
          </button>
        )}
      </div>
    </div>
  );
};

const Flashcards = ({ cards }) => {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx] || VARA_KORTIT[0];

  return (
    <div className="max-w-md mx-auto p-6 text-center">
      <div 
        className="aspect-[3/2] w-full mb-6 cursor-pointer"
        onClick={() => setFlipped(!flipped)}
        style={{ perspective: '1000px' }}
      >
        <div className={`relative w-full h-full transition-all duration-500 ${flipped ? 'rotate-y-180' : ''}`}
             style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
          <div className={`absolute inset-0 bg-white border-2 rounded-2xl flex items-center justify-center p-6 font-bold text-xl backface-hidden ${flipped ? 'opacity-0' : 'opacity-100'}`} style={{ backfaceVisibility: 'hidden' }}>
            {card.front}
          </div>
          <div className={`absolute inset-0 bg-slate-900 text-white border-2 rounded-2xl flex items-center justify-center p-6 text-lg backface-hidden overflow-y-auto ${flipped ? 'opacity-100' : 'opacity-0'}`} style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            {card.back}
          </div>
        </div>
      </div>
      <button onClick={() => { setFlipped(false); setIdx((idx + 1) % cards.length); }} className="bg-slate-200 px-6 py-2 rounded-full font-bold">Seuraava kortti</button>
    </div>
  );
};

// --- PÄÄSOVELLUS ---

export default function App() {
  const [view, setView] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [quizSet, setQuizSet] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ questionsAnswered: 0, correctAnswers: 0 });

  // 1. Hätäkatkaisin (3 sekuntia)
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // 2. Kirjautuminen
  useEffect(() => {
    signInAnonymously(auth).then(res => setUser(res.user)).catch(() => setUser({ uid: 'guest' }));
  }, []);

  // 3. Tietokannan haku
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

  // --- TÄSSÄ OVAT NE PUUTTUVAT FUNKTIOT ---
  
  const generateQuestions = async (topic) => {
    const prompt = `Luo 5 lääketieteen pääsykoekysymystä aiheesta: ${topic}. Vastaa vain JSON-muodossa: [{"subject": "Aihe", "question": "Kysymys?", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "explanation": "Miksi?"}]`;
    try {
      const newQs = await callGeminiAPI(prompt, true);
      for (const q of newQs) { await addDoc(collection(db, 'questions'), q); }
    } catch (e) { alert("Tekoäly on varattu, kokeile kohta uudelleen!"); }
  };

  const startQuiz = () => {
    const pool = questions.length > 0 ? questions : VARA_KYSYMYKSET;
    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
    setQuizSet(shuffled);
    setView('quiz');
  };

  const handleQuizComplete = (score, total) => {
    setStats(prev => ({ 
      questionsAnswered: prev.questionsAnswered + total, 
      correctAnswers: prev.correctAnswers + score 
    }));
    setView('dashboard');
    alert(`Hienoa! Sait ${score}/${total} oikein.`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar setCurrentView={setView} />
      {loading ? (
        <div className="flex flex-col items-center justify-center h-[80vh]">
          <RefreshCw className="animate-spin text-emerald-500 h-10 w-10 mb-4" />
          <p className="text-slate-500">Ladataan...</p>
        </div>
      ) : (
        <>
          {view === 'dashboard' && <Dashboard setCurrentView={(v) => v === 'quiz' ? startQuiz() : setView(v)} stats={stats} onGenerate={generateQuestions} />}
          {view === 'quiz' && <Quiz questions={quizSet} onComplete={handleQuizComplete} />}
          {view === 'flashcards' && <Flashcards cards={flashcards.length > 0 ? flashcards : VARA_KORTIT} />}
        </>
      )}
    </div>
  );
}
