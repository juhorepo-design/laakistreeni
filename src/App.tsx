import { useState, useEffect } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc } from 'firebase/firestore';

// --- GLOBAALIT MUUTTUJAT TYPESCRIPTILLE ---
declare const __firebase_config: any;
declare const __app_id: any;
declare const __initial_auth_token: any;

// --- FIREBASE ALUSTUS ---
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyA66M4dCI6i1c_tp3XmWK8N7cmBaHxuaw4",
  authDomain: "laakistreeni.firebaseapp.com",
  projectId: "laakistreeni",
  storageBucket: "laakistreeni.firebasestorage.app",
  messagingSenderId: "843448166281",
  appId: "1:843448166281:web:2b9fe9a2d66d5824ba6358",
  measurementId: "G-1KPNP2TY8G"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- MOCK DATA ---
const KYSYMYKSET = [
  {
    id: 1,
    subject: 'Biologia',
    topic: 'Solubiologia',
    question: 'Mikä seuraavista väittämistä koskien solukalvon rakennetta ja toimintaa on TOSI?',
    options: [
      'Happimolekyylit siirtyvät solukalvon läpi avustetulla diffuusiolla.',
      'Kolesteroli lisää solukalvon juoksevuutta alhaisissa lämpötiloissa.',
      'Aktiivinen kuljetus tapahtuu aina pitoisuuserojen suuntaan.',
      'Kaikki solukalvon proteiinit ovat kiinnittyneet kalvon sisäpintaan.'
    ],
    correctAnswer: 1,
    explanation: 'Kolesteroli puskuroi solukalvon juoksevuuden muutoksia: se estää kalvoa jähmettymästä liikaa kylmässä ja liian juoksevaksi muuttumista lämpimässä. Happi siirtyy yksinkertaisella diffuusiolla, aktiivinen kuljetus vaatii ATP:tä ja tapahtuu usein pitoisuuseroa vastaan, ja proteiineja on myös kalvon läpäisevinä (integraaliset).'
  },
  {
    id: 2,
    subject: 'Kemia',
    topic: 'Happo-emäsreaktiot',
    question: 'Mikä on 0,01 M HCl-liuoksen pH? Oletetaan, että suolahappo protolysoituu täydellisesti.',
    options: [
      '1',
      '2',
      '3',
      '0.01'
    ],
    correctAnswer: 1,
    explanation: 'HCl on vahva happo, joten se protolysoituu täydellisesti: [H3O+] = 0,01 mol/l. pH = -log(0,01) = 2.'
  },
  {
    id: 3,
    subject: 'Fysiikka',
    topic: 'Mekaniikka',
    question: 'Kappale (m = 2,0 kg) putoaa vapaasti 5,0 metrin korkeudesta. Kuinka suuri on sen kineettinen energia juuri ennen maahan osumista? (g ≈ 9,81 m/s²)',
    options: [
      '49 J',
      '98 J',
      '10 J',
      '196 J'
    ],
    correctAnswer: 1,
    explanation: 'Mekaanisen energian säilymislain mukaan potentiaalienergia muuttuu kineettiseksi energiaksi. Ep = mgh = 2,0 kg * 9,81 m/s² * 5,0 m = 98,1 J ≈ 98 J.'
  },
  {
    id: 4,
    subject: 'Biologia',
    topic: 'Ihmisen fysiologia',
    question: 'Missä seuraavista elimistä erittyy sappinestettä?',
    options: [
      'Sappirakko',
      'Maksa',
      'Haima',
      'Ohutsuoli'
    ],
    correctAnswer: 1,
    explanation: 'Sappineste muodostuu maksassa ja vain varastoituu sekä väkevöityy sappirakossa. Tämä on yleinen kompa pääsykokeissa.'
  }
];

const FLASHCARDS = [
  { id: 1, front: 'Mitoosin vaiheet järjestyksessä?', back: 'Profaasi, prometafaasi, metafaasi, anafaasi, telofaasi.' },
  { id: 2, front: 'Ohmin laki (kaava)?', back: 'U = RI (Jännite = Resistanssi × Virta)' },
  { id: 3, front: 'Mitä tarkoittaa isotooppi?', back: 'Saman alkuaineen atomi, jolla on eri määrä neutroneja ytimessä (eri massaluku).' },
  { id: 4, front: 'Verenkierron iso verenkierto (systeeminen) alkaa mistä sydämen osasta?', back: 'Vasen kammio (aortan kautta koko kehoon).' }
];

// --- GEMINI API INTEGRAATIO ---
const callGeminiAPI = async (prompt: string, isJson: boolean = false) => {
  const apiKey = "AIzaSyClAoECSG5E2HVpQphA9fN_v-vZTSadF5s"; 
  
  const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest"];
  
  const payload: any = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  if (isJson) {
    payload.generationConfig = {
      responseMimeType: "application/json",
    };
  }

  let lastErrorMessage = "";

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if (response.status === 404) {
          lastErrorMessage = `Malli ${model} ei löytynyt (404).`;
          continue; 
        }
        
        const errText = await response.text();
        let errMsg = `Palvelin vastasi koodilla ${response.status}. `;
        try {
          const errObj = JSON.parse(errText);
          errMsg += errObj.error?.message || "";
        } catch (e) {
          errMsg += "Virhettä ei voitu lukea.";
        }
        throw new Error(errMsg); 
      }

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) throw new Error("Tekoäly ei osannut vastata kysymykseen.");

      if (isJson) {
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(text);
      }

      return text; 
      
    } catch (error: any) {
      if (error.message && error.message.includes("404")) {
          continue; 
      }
      console.error("Yksityiskohtainen virhe API-kutsussa:", error);
      if (error.message && error.message.includes("Failed to fetch")) {
        throw new Error("Nettiyhteys katkesi tai selaimen mainostenestäjä estää yhteyden Googlen palvelimelle.");
      }
      throw error; 
    }
  }
  
  throw new Error(`Tekoälymallia ei löytynyt. ${lastErrorMessage}`);
};

// --- COMPONENTS ---

const Navbar = ({ currentView, setCurrentView }: { currentView: string, setCurrentView: (v: string) => void }) => (
  <nav className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
          <Activity className="h-8 w-8 text-emerald-400" />
          <span className="font-bold text-xl tracking-tight">Lääkis<span className="text-emerald-400">Treeni</span></span>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-4">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentView === 'dashboard' ? 'bg-slate-800 text-emerald-400' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            Kojelauta
          </button>
          <button 
            onClick={() => setCurrentView('quiz')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${currentView === 'quiz' ? 'bg-slate-800 text-emerald-400' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            Treenikoe
          </button>
          <button 
            onClick={() => setCurrentView('flashcards')}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors hidden sm:block ${currentView === 'flashcards' ? 'bg-slate-800 text-emerald-400' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            Muistikortit
          </button>
        </div>
      </div>
    </div>
  </nav>
);

const Dashboard = ({ setCurrentView, stats }: { setCurrentView: (v: string) => void, stats: any }) => {
  const [testStatus, setTestStatus] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const testApiConnection = async () => {
    setIsTesting(true);
    setTestStatus("Kokeillaan ottaa yhteys tekoälyyn...");
    try {
      const response = await callGeminiAPI("Sano pelkästään sana: TOIMII");
      setTestStatus(`Yhteys toimii täydellisesti! Tekoäly vastasi: "${response.trim()}"`);
    } catch (err: any) {
      setTestStatus(`Yhteys epäonnistui. TARKKA SYY: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Tervetuloa opiskelemaan!</h1>
        <p className="text-slate-500 mt-2 text-lg">Valintakoe B (Lääketiede, hammaslääketiede, eläinlääketiede) lähestyy. Olet tehnyt hienoa työtä.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center space-x-4">
          <div className="bg-blue-100 p-3 rounded-lg">
            <BookOpen className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Tehdyt tehtävät</p>
            <p className="text-2xl font-bold text-slate-900">{stats.questionsAnswered}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center space-x-4">
          <div className="bg-emerald-100 p-3 rounded-lg">
            <Award className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Oikein %</p>
            <p className="text-2xl font-bold text-slate-900">
              {stats.questionsAnswered > 0 ? Math.round((stats.correctAnswers / stats.questionsAnswered) * 100) : 0}%
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center space-x-4">
          <div className="bg-amber-100 p-3 rounded-lg">
            <Zap className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Päiväputki</p>
            <p className="text-2xl font-bold text-slate-900">4 päivää</p>
          </div>
        </div>
      </div>

      {/* API TESTAUSTYÖKALU */}
      <div className="bg-slate-100 border border-slate-300 p-5 mb-8 rounded-xl">
        <h3 className="font-bold text-slate-800 mb-2 flex items-center">
          <RefreshCw className="h-5 w-5 mr-2" /> Vianmääritys: Testaa tekoälyn yhteys
        </h3>
        <p className="text-sm text-slate-600 mb-4">Jos uudet muistikortit eivät toimi, paina tästä nähdäksesi tarkan virheen.</p>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <button 
            onClick={testApiConnection}
            disabled={isTesting}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {isTesting ? "Testataan..." : "Käynnistä testi"}
          </button>
          {testStatus && (
            <p className={`text-sm font-medium ${testStatus.includes("toimii") ? "text-emerald-600" : "text-red-600"}`}>
              {testStatus}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center">
            <BarChart3 className="mr-2 h-5 w-5 text-slate-500"/> Osaamisprofiili
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">Biologia</span>
                <span className="text-sm font-medium text-slate-700">75%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '75%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">Kemia</span>
                <span className="text-sm font-medium text-slate-700">45%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: '45%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">Fysiikka</span>
                <span className="text-sm font-medium text-slate-700">60%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: '60%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <button 
            onClick={() => setCurrentView('quiz')}
            className="w-full group bg-emerald-600 hover:bg-emerald-700 text-white p-6 rounded-xl shadow-sm transition-all flex items-center justify-between"
          >
            <div className="text-left">
              <h3 className="text-xl font-bold">Aloita Treenikoe</h3>
              <p className="text-emerald-100 mt-1">Sekoitus Valintakoe B -tyyppisiä tehtäviä. Välitön palaute.</p>
            </div>
            <ChevronRight className="h-8 w-8 group-hover:translate-x-1 transition-transform" />
          </button>

          <button 
            onClick={() => setCurrentView('flashcards')}
            className="w-full group bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-800 p-6 rounded-xl shadow-sm transition-all flex items-center justify-between"
          >
            <div className="text-left">
              <h3 className="text-xl font-bold">Kertaa Muistikorteilla</h3>
              <p className="text-slate-500 mt-1">Nopea kaavojen ja termien kertaus. Spaced repetition.</p>
            </div>
            <ChevronRight className="h-8 w-8 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};

const Quiz = ({ questions, onComplete }: { questions: any[], onComplete: (score: number, total: number) => void }) => {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [aiExplanation, setAiExplanation] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  if (!questions || questions.length === 0) {
    return <div className="p-8 text-center text-slate-500">Ladataan kysymyksiä...</div>;
  }

  const question = questions[currentQuestionIdx];

  const handleAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
    setIsAnswered(true);
    
    if (index === question.correctAnswer) {
      setScore(score + 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setAiExplanation("");
    } else {
      onComplete(score, questions.length);
    }
  };

  const handleAskAi = async () => {
    if (selectedAnswer === null) return;
    setIsAiLoading(true);
    setAiExplanation("");
    try {
      const prompt = `Olen lääketieteen pääsykokeisiin valmistautuva opiskelija. Kysymys oli: "${question.question}". Oikea vastaus on "${question.options[question.correctAnswer]}". Minun vastaukseni oli "${question.options[selectedAnswer]}". Selitä lyhyesti (max 3-4 virkettä), kannustavasti ja selkeästi suomeksi miksi oikea vastaus on oikein, ja jos vastasin väärin, miksi vastaukseni oli virheellinen. Korosta lääketieteellistä/luonnontieteellistä logiikkaa.`;
      const explanation = await callGeminiAPI(prompt);
      setAiExplanation(explanation);
    } catch (error: any) {
      setAiExplanation(`VIRHE: ${error.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const getOptionStyles = (index: number) => {
    if (!isAnswered) {
      return selectedAnswer === index 
        ? "border-emerald-500 bg-emerald-50 text-emerald-700" 
        : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50 text-slate-700";
    }
    
    if (index === question.correctAnswer) {
      return "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium";
    }
    
    if (selectedAnswer === index) {
      return "border-red-500 bg-red-50 text-red-800";
    }
    
    return "border-slate-200 text-slate-400 opacity-50";
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-in slide-in-from-bottom-4 duration-300">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">
          Kysymys {currentQuestionIdx + 1} / {questions.length}
        </span>
        <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded text-slate-600 uppercase tracking-wider">
          {question.subject}
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-1.5 mb-8">
        <div 
          className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" 
          style={{ width: `${((currentQuestionIdx + 1) / questions.length) * 100}%` }}
        ></div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 mb-6">
        <h2 className="text-xl md:text-2xl font-semibold text-slate-900 mb-8 leading-snug">
          {question.question}
        </h2>

        <div className="space-y-3">
          {question.options.map((option: any, idx: number) => (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              disabled={isAnswered}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between ${getOptionStyles(idx)}`}
            >
              <span>{option}</span>
              {isAnswered && idx === question.correctAnswer && <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />}
              {isAnswered && selectedAnswer === idx && idx !== question.correctAnswer && <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {isAnswered && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className={`p-6 rounded-xl border ${selectedAnswer === question.correctAnswer ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} mb-6`}>
            <h3 className={`font-bold text-lg mb-2 ${selectedAnswer === question.correctAnswer ? 'text-emerald-800' : 'text-red-800'}`}>
              {selectedAnswer === question.correctAnswer ? 'Oikein!' : 'Väärin, mutta opitaan tästä!'}
            </h3>
            <p className="text-slate-700 leading-relaxed">
              <span className="font-semibold block mb-1">Miksi?</span>
              {question.explanation}
            </p>
          </div>
          
          {!aiExplanation && !isAiLoading && (
            <button 
              onClick={handleAskAi}
              className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold py-3 rounded-xl mb-6 transition-colors flex items-center justify-center space-x-2 border border-indigo-200 shadow-sm"
            >
              <Zap className="h-5 w-5 text-indigo-500" />
              <span>Kysy tekoälyltä tarkennusta ✨</span>
            </button>
          )}

          {isAiLoading && (
            <div className="p-4 bg-indigo-50 rounded-xl mb-6 flex items-center justify-center border border-indigo-100">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 mr-3"></div>
              <span className="text-indigo-700 font-medium">Tekoäly miettii vastausta...</span>
            </div>
          )}

          {aiExplanation && (
            <div className={`p-6 rounded-xl mb-6 border animate-in fade-in duration-500 ${aiExplanation.includes("VIRHE:") ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-200'}`}>
              <h4 className={`font-bold mb-2 flex items-center ${aiExplanation.includes("VIRHE:") ? 'text-red-800' : 'text-indigo-800'}`}>
                <BrainCircuit className={`h-5 w-5 mr-2 ${aiExplanation.includes("VIRHE:") ? 'text-red-600' : 'text-indigo-600'}`} />
                {aiExplanation.includes("VIRHE:") ? 'Ongelma yhteydessä' : 'Tekoälytuutori ✨'}
              </h4>
              <p className={`leading-relaxed text-sm whitespace-pre-wrap ${aiExplanation.includes("VIRHE:") ? 'text-red-700' : 'text-indigo-900'}`}>
                {aiExplanation}
              </p>
            </div>
          )}
          
          <button 
            onClick={handleNext}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2"
          >
            <span>{currentQuestionIdx < questions.length - 1 ? 'Seuraava kysymys' : 'Katso tulokset'}</span>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
};

const Flashcards = ({ cards, setCards, user }: { cards: any[], setCards: any, user: any }) => {
  const [currentCard, setCurrentCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!cards || cards.length === 0) {
    return <div className="p-8 text-center text-slate-500">Ladataan kortteja...</div>;
  }

  const card = cards[currentCard];

  const handleNextCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentCard((prev) => (prev + 1) % cards.length);
    }, 150);
  };

  const handleGenerateCards = async () => {
    if (!customTopic.trim() || isGenerating) return;
    setIsGenerating(true);
    setErrorMsg("");
    try {
      const prompt = `Luo 3 edistynyttä lääketieteen pääsykokeen (biologia, fysiikka tai kemia) tasoista muistikorttia aiheesta: "${customTopic}". Vastaa PELKÄLLÄ puhtaalla JSON-taulukolla ilman markdown-muotoiluja tai selityksiä. Formaatti: [{"front": "kysymys", "back": "vastaus"}].`;
      const newCardsData = await callGeminiAPI(prompt, true);
      
      try {
        const fRef = collection(db, 'artifacts', appId, 'users', user.uid, 'flashcards');
        for (const c of newCardsData) {
          await addDoc(fRef, { front: c.front, back: c.back });
        }
      } catch (dbErr) {
        console.warn("Kortteja ei saatu tallennettua tietokantaan, lisätään paikallisesti.", dbErr);
      }
      
      const localCards = newCardsData.map((c: any, i: number) => ({ id: Date.now() + i, front: c.front, back: c.back }));
      setCards((prev: any[]) => [...localCards, ...prev]);
      
      setCurrentCard(0);
      setIsFlipped(false);
      setCustomTopic("");
    } catch (error: any) {
      setErrorMsg(`VIRHE: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!card) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center">
      
      <div className="w-full bg-indigo-50 p-5 rounded-2xl shadow-sm border border-indigo-100 mb-8">
        <h3 className="text-indigo-900 font-bold mb-3 flex items-center">
          <BrainCircuit className="h-5 w-5 mr-2 text-indigo-600"/> 
          Luo omia tekoälykortteja ✨
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Esim. Hermoston toiminta, Sähkömagnetismi..." 
            className="flex-1 p-3 border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerateCards()}
          />
          <button 
            onClick={handleGenerateCards}
            disabled={isGenerating || !customTopic.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors whitespace-nowrap flex items-center justify-center shadow-sm"
          >
            {isGenerating ? (
              <span className="flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div> Luodaan...</span>
            ) : 'Luo 3 korttia'}
          </button>
        </div>
        {errorMsg && (
          <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded-xl text-red-800 text-sm font-medium">
            {errorMsg}
          </div>
        )}
      </div>

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Nopea Kertaus</h2>
        <p className="text-slate-500">Mieti vastaus mielessäsi ennen kuin käännät kortin.</p>
        <p className="text-sm font-medium text-slate-400 mt-2">Kortti {currentCard + 1} / {cards.length}</p>
      </div>

      <div 
        onClick={() => setIsFlipped(!isFlipped)}
        className="w-full aspect-video md:aspect-[3/2] bg-transparent cursor-pointer group perspective-1000 mb-8"
        style={{ perspective: '1000px' }}
      >
        <div 
          className="relative w-full h-full transition-all duration-500"
          style={{ 
            transformStyle: 'preserve-3d', 
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)' 
          }}
        >
          <div 
            className="absolute w-full h-full backface-hidden bg-white border-2 border-slate-200 rounded-2xl shadow-md flex items-center justify-center p-8 text-center"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <h3 className="text-2xl font-bold text-slate-800">{card.front}</h3>
            <div className="absolute bottom-4 text-slate-400 text-sm flex items-center">
              <RotateCcw className="w-4 h-4 mr-1" /> Napauta kääntääksesi
            </div>
          </div>
          
          <div 
            className="absolute w-full h-full backface-hidden bg-slate-900 border-2 border-slate-900 rounded-2xl shadow-md flex items-center justify-center p-8 text-center text-white"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <p className="text-xl leading-relaxed">{card.back}</p>
          </div>
        </div>
      </div>

      {isFlipped && (
        <div className="w-full flex space-x-4 animate-in fade-in duration-300">
          <button onClick={handleNextCard} className="flex-1 bg-red-100 hover:bg-red-200 text-red-800 font-semibold py-3 rounded-lg transition-colors">
            Vaikea (Kertaa pian)
          </button>
          <button onClick={handleNextCard} className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold py-3 rounded-lg transition-colors">
            Hyvä
          </button>
          <button onClick={handleNextCard} className="flex-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold py-3 rounded-lg transition-colors">
            Helppo
          </button>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [stats, setStats] = useState({ questionsAnswered: 0, correctAnswers: 0 });
  const [lastScore, setLastScore] = useState({ score: 0, total: 0 });
  
  const [user, setUser] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);

  // 1. Virheensietokykyinen Autentikaatio
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Autentikaatiovirhe:", err);
        setUser({ uid: 'paikallinen-testi-käyttäjä-123' } as any);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Virheensietokykyinen Tietokantahaku
  useEffect(() => {
    if (!user) return;

    const qRef = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
    const unsubQ = onSnapshot(qRef, async (snapshot: any) => {
      if (snapshot.empty) {
        try {
          for (const q of KYSYMYKSET) {
            await addDoc(qRef, q);
          }
        } catch (e) {
          console.warn("Tietokantaan kirjoittaminen estetty. Käytetään varakysymyksiä.", e);
          setQuestions(KYSYMYKSET);
        }
      } else {
        setQuestions(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
      }
    }, (error: any) => {
      console.error("Kysymysten latausvirhe:", error);
      setQuestions(KYSYMYKSET);
    });

    const fRef = collection(db, 'artifacts', appId, 'users', user.uid, 'flashcards');
    const unsubF = onSnapshot(fRef, async (snapshot: any) => {
      if (snapshot.empty) {
        try {
          for (const f of FLASHCARDS) {
            await addDoc(fRef, f);
          }
        } catch (e) {
          console.warn("Tietokantaan kirjoittaminen estetty. Käytetään varakortteja.", e);
          setFlashcards(FLASHCARDS);
          setIsLoadingDb(false);
        }
      } else {
        setFlashcards(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
        setIsLoadingDb(false);
      }
    }, (error: any) => {
      console.error("Korttien latausvirhe:", error);
      setFlashcards(FLASHCARDS);
      setIsLoadingDb(false);
    });

    return () => {
      unsubQ();
      unsubF();
    };
  }, [user]);

  const handleQuizComplete = (score: number, total: number) => {
    setStats((prev: any) => ({
      questionsAnswered: prev.questionsAnswered + total,
      correctAnswers: prev.correctAnswers + score
    }));
    setLastScore({ score, total });
    setCurrentView('results');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <Navbar currentView={currentView} setCurrentView={setCurrentView} />
      
      <main>
        {isLoadingDb ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
            <p className="text-slate-500">Ladataan oppimateriaaleja...</p>
          </div>
        ) : (
          <>
            {currentView === 'dashboard' && <Dashboard setCurrentView={setCurrentView} stats={stats} />}
            {currentView === 'quiz' && <Quiz questions={questions} onComplete={handleQuizComplete} />}
            {currentView === 'flashcards' && <Flashcards cards={flashcards} setCards={setFlashcards} user={user} />}
            
            {currentView === 'results' && (
              <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in zoom-in-95 duration-500">
                <div className="bg-white rounded-3xl shadow-lg p-10 border border-slate-100">
                  <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Award className="h-12 w-12 text-emerald-500" />
                  </div>
                  <h2 className="text-3xl font-extrabold mb-2 text-slate-900">Treeni suoritettu!</h2>
                  <p className="text-slate-500 mb-8 text-lg">Sait oikein <span className="font-bold text-slate-900">{lastScore.score} / {lastScore.total}</span> pistettä.</p>
                  
                  <div className="space-y-4">
                    <button 
                      onClick={() => setCurrentView('quiz')}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-md transition-colors"
                    >
                      Tee uusi harjoitus
                    </button>
                    <button 
                      onClick={() => setCurrentView('dashboard')}
                      className="w-full bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 font-bold py-4 rounded-xl transition-colors"
                    >
                      Palaa kojelaudalle
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}