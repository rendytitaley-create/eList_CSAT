import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, getDocs, deleteDoc, updateDoc, doc } from 'firebase/firestore';
import * as XLSX from 'xlsx';

// === 1. KONFIGURASI ===
const firebaseConfig = {
  apiKey: "AIzaSyBxdRzIlg5YhocDDCK15pD2WwhJ9P2McF4",
  authDomain: "elist-csat.firebaseapp.com",
  projectId: "elist-csat",
  storageBucket: "elist-csat.firebasestorage.app",
  messagingSenderId: "385554100266",
  appId: "1:385554100266:web:a30fa180093f220c295353"
};
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwLBv-k9ZyXT75Kj-qH6FMFvY5xW1m972ccDTiLN33c2gaFakzh8AZyOfdkXzSO2eP3/exec';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const getIndonesianDay = () => new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date());
const getWeekOfMonth = () => Math.ceil(new Date().getDate() / 7);

const checkDayMatch = (waktuExcel: string) => {
  const hariIni = getIndonesianDay().toLowerCase();
  const mingguKeIni = getWeekOfMonth();
  const target = (waktuExcel || "").toLowerCase();
  if (target.includes("setiap hari")) return true;
  if (target.includes("-")) {
    const hariList = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];
    const [start, end] = target.split("-").map(h => h.trim());
    const startIndex = hariList.indexOf(start);
    const endIndex = hariList.indexOf(end);
    const currentIndex = hariList.indexOf(hariIni);
    if (currentIndex >= startIndex && currentIndex <= endIndex) return true;
  }
  if (target.includes("minggu ke-")) {
    const targetMinggu = parseInt(target.split("minggu ke-")[1]);
    if (target.includes(hariIni) && mingguKeIni === targetMinggu) return true;
  }
  if (target === hariIni) return true;
  return false;
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  const [activeTab, setActiveTab] = useState<'monitoring' | 'users' | 'master'>('monitoring');
  
  const [uploading, setUploading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // State untuk Tambah User Baru
  const [newUser, setNewUser] = useState({ nama: '', username: '', password: '', jabatan: 'SATPAM' });

  useEffect(() => {
    onSnapshot(query(collection(db, "schedules")), (snap) => setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "shifts")), (snap) => setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "logs"), orderBy("timestamp", "desc")), (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "users")), (snap) => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const handleLogin = () => {
    const foundUser = allUsers.find(u => u.username === loginData.user && u.password === loginData.pass);
    if (foundUser) {
      setCurrentUser(foundUser);
      setIsLoggedIn(true);
    } else { alert("Username atau Password Salah!"); }
  };

  const handleUploadExcel = async (type: 'schedules' | 'shifts', e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
        if (confirm(`Hapus data ${type} lama dan ganti baru?`)) {
          const qSnapshot = await getDocs(query(collection(db, type)));
          await Promise.all(qSnapshot.docs.map(d => deleteDoc(d.ref)));
          for (const row of data) { await addDoc(collection(db, type), { ...row, createdAt: new Date().toISOString() }); }
          alert("Berhasil diperbarui!");
        }
      } catch (err) { alert("Gagal upload"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleTaskReport = async (e: any, task: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ base64, type: file.type, name: `${currentUser.nama}_${Date.now()}.jpg` })
        });
        const result = await res.json();
        if (result.result === 'success') {
          await addDoc(collection(db, "logs"), {
            petugas: currentUser.nama,
            task: task["To do List"],
            jam: task["Jam/Rentang Jam"],
            fotoUrl: result.url,
            approval: 'Menunggu',
            waktu: new Date().toLocaleString('id-ID'),
            timestamp: new Date()
          });
          alert("Laporan Terkirim!");
        }
      } catch (err) { alert("Gagal Kirim"); }
      finally { setUploading(false); }
    };
  };

  const handleVerify = async (id: string, status: 'Setuju' | 'Tolak') => {
    await updateDoc(doc(db, "logs", id), { approval: status });
  };

  const hariIni = getIndonesianDay();
  const currentShifts = shifts.filter(s => String(s["Hari"]).toLowerCase() === hariIni.toLowerCase());
  const myTasks = schedules.filter(s => s["Nama Petugas"] === currentUser?.nama && checkDayMatch(s["Waktu"]));

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm">
          <h1 className="text-2xl font-black text-center text-slate-900 mb-6 uppercase italic">Login Monitoring</h1>
          <input type="text" placeholder="Username" className="w-full p-4 mb-3 border rounded-2xl font-bold bg-slate-50" onChange={(e)=>setLoginData({...loginData, user: e.target.value})} />
          <input type="password" placeholder="Password" className="w-full p-4 mb-6 border rounded-2xl font-bold bg-slate-50" onChange={(e)=>setLoginData({...loginData, pass: e.target.value})} />
          <button onClick={handleLogin} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">MASUK</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen text-slate-800">
      <header className="mb-6 bg-indigo-950 text-white p-6 rounded-3xl shadow-xl flex justify-between items-center">
        <div className="text-left">
          <h1 className="text-xl font-black italic">E-MONITORING</h1>
          <p className="text-[10px] opacity-60 font-bold uppercase tracking-widest">{hariIni}, {new Date().toLocaleDateString('id-ID')}</p>
        </div>
        <button onClick={() => setIsLoggedIn(false)} className="bg-white/10 hover:bg-white/20 text-[9px] font-bold px-4 py-2 rounded-xl uppercase transition-all">Logout</button>
      </header>

      {/* SHIFT PATEN SELALU MUNCUL DI ATAS */}
      <div className="mb-6 bg-indigo-100 p-4 rounded-2xl border border-indigo-200">
        <p className="text-[10px] font-black text-indigo-900 mb-2 uppercase tracking-widest">Shift Paten Hari Ini:</p>
        <div className="flex flex-wrap gap-2">
          {currentShifts.map((s, i) => (
            <span key={i} className="bg-white text-indigo-700 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm">
              {s["Nama Petugas"]} <span className="opacity-50">({s["Shift"]})</span>
            </span>
          ))}
          {currentShifts.length === 0 && <p className="text-xs italic text-slate-400 font-medium">Jadwal belum di-upload</p>}
        </div>
      </div>

      {currentUser.role === 'admin' ? (
        <div className="space-y-6">
          <div className="flex gap-2 bg-slate-200 p-1 rounded-2xl">
            {['monitoring', 'users', 'master'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === t ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>
                {t === 'master' ? 'Upload Excel' : t}
              </button>
            ))}
          </div>

          {activeTab === 'master' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-2xl border-2 border-dashed border-slate-200">
                <p className="text-[10px] font-black text-slate-400 mb-2 uppercase">1. Upload List Tugas</p>
                <input type="file" onChange={(e) => handleUploadExcel('schedules', e)} className="text-[10px] w-full" />
              </div>
              <div className="bg-white p-5 rounded-2xl border-2 border-dashed border-indigo-200">
                <p className="text-[10px] font-black text-indigo-400 mb-2 uppercase">2. Upload Shift Paten</p>
                <input type="file" onChange={(e) => handleUploadExcel('shifts', e)} className="text-[10px] w-full" />
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in">
              <h2 className="font-black text-indigo-900 mb-4 uppercase text-xs">Tambah Petugas Baru</h2>
              <div className="grid grid-cols-1 gap-3">
                <input type="text" placeholder="Nama Lengkap" className="p-3 bg-slate-50 rounded-xl text-sm font-bold" onChange={(e)=>setNewUser({...newUser, nama: e.target.value})} />
                <input type="text" placeholder="Username" className="p-3 bg-slate-50 rounded-xl text-sm font-bold" onChange={(e)=>setNewUser({...newUser, username: e.target.value})} />
                <input type="password" placeholder="Password" className="p-3 bg-slate-50 rounded-xl text-sm font-bold" onChange={(e)=>setNewUser({...newUser, password: e.target.value})} />
                <select className="p-3 bg-slate-50 rounded-xl text-sm font-bold" onChange={(e)=>setNewUser({...newUser, jabatan: e.target.value})}>
                  <option value="SATPAM">SATPAM</option>
                  <option value="CS">CLEANING SERVICE</option>
                  <option value="PENGAWAS">PENGAWAS (ADMIN)</option>
                </select>
                <button onClick={async () => {
                  await addDoc(collection(db, "users"), { ...newUser, role: newUser.jabatan === 'PENGAWAS' ? 'admin' : 'petugas' });
                  alert("User Berhasil Didaftarkan!");
                }} className="p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase">Simpan Petugas</button>
              </div>
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className="space-y-4 animate-in fade-in">
              {logs.map(log => (
                <div key={log.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-indigo-700 uppercase">{log.petugas} - {log.jam}</span>
                    <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : log.approval === 'Tolak' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-600'}`}>
                      {log.approval}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">{log.task}</p>
                  <div className="flex gap-2">
                    <a href={log.fotoUrl} target="_blank" className="flex-1 text-center bg-slate-100 p-2 rounded-lg text-[9px] font-bold no-underline">Lihat Bukti</a>
                    {log.approval === 'Menunggu' && (
                      <>
                        <button onClick={() => handleVerify(log.id, 'Setuju')} className="flex-1 bg-green-600 text-white p-2 rounded-lg text-[9px] font-bold uppercase">Setuju</button>
                        <button onClick={() => handleVerify(log.id, 'Tolak')} className="flex-1 bg-red-600 text-white p-2 rounded-lg text-[9px] font-bold uppercase">Tolak</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-emerald-500 mb-6">
            <h2 className="text-xl font-black text-indigo-950 uppercase">Halo, {currentUser.nama}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase italic">Anda sedang login sebagai {currentUser.jabatan}</p>
          </div>
          {myTasks.map((s, i) => {
            const logTerkait = logs.find(l => l.petugas === currentUser.nama && l.task === s["To do List"]);
            return (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-black text-slate-800 leading-tight">{s["To do List"]}</p>
                  {logTerkait && <span className={`text-[9px] px-2 py-1 rounded-full font-bold uppercase ${logTerkait.approval === 'Setuju' ? 'bg-green-100 text-green-700' : logTerkait.approval === 'Tolak' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-600'}`}>{logTerkait.approval}</span>}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">{s["Jam/Rentang Jam"]}</p>
                {(!logTerkait || logTerkait.approval === 'Tolak') ? (
                  <div className="relative group">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleTaskReport(e, s)} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                    <div className="p-4 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-2xl text-center font-black text-[10px] text-emerald-700 uppercase">
                      {uploading ? 'Sedang Mengirim...' : 'Ambil Foto Laporan'}
                    </div>
                  </div>
                ) : <div className="p-4 bg-slate-50 rounded-2xl text-center text-[10px] font-black text-slate-400 uppercase">Laporan Terkirim</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
