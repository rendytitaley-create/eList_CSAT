import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, getDocs, deleteDoc, updateDoc, doc, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

// === 1. KONFIGURASI (SESUAIKAN DENGAN DATA ANDA) ===
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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  
  const [activeTab, setActiveTab] = useState<'monitoring' | 'users' | 'schedules'>('monitoring');
  const [uploading, setUploading] = useState(false);
  
  const [schedules, setSchedules] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // Data untuk User Baru
  const [newUser, setNewUser] = useState({ nama: '', username: '', password: '', jabatan: 'SATPAM', foto: '' });

  useEffect(() => {
    onSnapshot(query(collection(db, "schedules")), (snap) => setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "shifts")), (snap) => setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "logs"), orderBy("timestamp", "desc")), (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "users")), (snap) => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // --- FUNGSI LOGIN ---
  const handleLogin = () => {
    const foundUser = allUsers.find(u => u.username === loginData.user && u.password === loginData.pass);
    if (foundUser) {
      setCurrentUser(foundUser);
      setIsLoggedIn(true);
    } else {
      alert("Username atau Password Salah!");
    }
  };

  // --- FUNGSI DRIVE UPLOAD (UNTUK FOTO PROFIL & LAPORAN) ---
  const uploadFileToDrive = async (file: File) => {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ base64, type: file.type, name: `${Date.now()}_${file.name}` })
          });
          const result = await res.json();
          resolve(result.url);
        } catch (err) { reject(err); }
      };
    });
  };

  // --- DAFTAR USER BARU ---
  const handleCreateUser = async (e: any) => {
    e.preventDefault();
    setUploading(true);
    try {
      await addDoc(collection(db, "users"), { ...newUser, role: newUser.jabatan === 'PENGAWAS' ? 'admin' : 'petugas' });
      alert("User Berhasil Didaftarkan!");
      setNewUser({ nama: '', username: '', password: '', jabatan: 'SATPAM', foto: '' });
    } catch (err) { alert("Gagal Daftar"); }
    setUploading(false);
  };

  const handleTaskUpload = async (e: any, task: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFileToDrive(file);
      await addDoc(collection(db, "logs"), {
        petugas: currentUser.nama,
        task: task["To do List"],
        jam: task["Jam/Rentang Jam"],
        fotoUrl: url,
        approval: 'Menunggu',
        waktu: new Date().toLocaleString('id-ID'),
        timestamp: new Date()
      });
      alert("Laporan Terkirim!");
    } catch (err) { alert("Gagal Kirim"); }
    setUploading(false);
  };

  // --- TAMPILAN LOGIN ---
  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm">
          <h1 className="text-2xl font-black text-center text-indigo-900 mb-6">LOGIN OPS</h1>
          <input type="text" placeholder="Username" className="w-full p-4 mb-3 border rounded-2xl font-bold" onChange={(e)=>setLoginData({...loginData, user: e.target.value})} />
          <input type="password" placeholder="Password" className="w-full p-4 mb-6 border rounded-2xl font-bold" onChange={(e)=>setLoginData({...loginData, pass: e.target.value})} />
          <button onClick={handleLogin} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">MASUK</button>
          <p className="text-[10px] text-center mt-4 text-slate-400 font-bold uppercase">v1.0 - Authorized Personnel Only</p>
        </div>
      </div>
    );
  }

  const hariIni = getIndonesianDay();
  const currentShifts = shifts.filter(s => String(s["Hari"]).toLowerCase() === hariIni.toLowerCase());
  const myTasks = schedules.filter(s => s["Nama Petugas"] === currentUser.nama);

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen">
      <header className="mb-6 bg-indigo-900 text-white p-6 rounded-3xl shadow-lg flex justify-between items-center">
        <div className="text-left">
          <h1 className="text-xl font-black italic">E-MONITORING</h1>
          <p className="text-[10px] opacity-60 font-bold uppercase tracking-widest">{hariIni}, {new Date().toLocaleDateString('id-ID')}</p>
        </div>
        <div className="text-right flex items-center gap-3">
          <div className="hidden sm:block">
            <p className="text-xs font-black">{currentUser.nama}</p>
            <p className="text-[9px] font-bold text-indigo-300 uppercase">{currentUser.jabatan}</p>
          </div>
          <button onClick={() => setIsLoggedIn(false)} className="bg-red-500 text-[9px] font-bold px-3 py-2 rounded-xl uppercase">Logout</button>
        </div>
      </header>

      {currentUser.role === 'admin' ? (
        <div className="space-y-6">
          {/* TAB NAVIGATION */}
          <div className="flex gap-2 bg-slate-200 p-1 rounded-2xl">
            {['monitoring', 'users', 'schedules'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === t ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>
                {t}
              </button>
            ))}
          </div>

          {activeTab === 'users' && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 animate-in fade-in">
              <h2 className="font-black text-indigo-900 mb-4 uppercase text-sm">Daftarkan Petugas Baru</h2>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <input type="text" placeholder="Nama Lengkap" required className="w-full p-3 bg-slate-50 rounded-xl text-sm font-bold" value={newUser.nama} onChange={(e)=>setNewUser({...newUser, nama: e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Username" required className="p-3 bg-slate-50 rounded-xl text-sm font-bold" value={newUser.username} onChange={(e)=>setNewUser({...newUser, username: e.target.value})} />
                  <input type="password" placeholder="Password" required className="p-3 bg-slate-50 rounded-xl text-sm font-bold" value={newUser.password} onChange={(e)=>setNewUser({...newUser, password: e.target.value})} />
                </div>
                <select className="w-full p-3 bg-slate-50 rounded-xl text-sm font-bold" value={newUser.jabatan} onChange={(e)=>setNewUser({...newUser, jabatan: e.target.value})}>
                  <option value="SATPAM">SATPAM</option>
                  <option value="CS">CLEANING SERVICE</option>
                  <option value="PENGAWAS">PENGAWAS (ADMIN)</option>
                </select>
                <button type="submit" disabled={uploading} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-md">{uploading ? 'PROSES...' : 'SIMPAN USER'}</button>
              </form>
            </div>
          )}

          {activeTab === 'monitoring' && (
             <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
             <h2 className="font-black text-indigo-900 mb-4 uppercase text-sm tracking-widest">Live Log Pekerjaan</h2>
             <div className="space-y-3">
               {logs.map(log => (
                 <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2">
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] font-black text-indigo-600 uppercase">{log.petugas} - {log.jam}</span>
                     <span className={`text-[9px] px-2 py-1 rounded-full font-bold ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-600'}`}>{log.approval}</span>
                   </div>
                   <p className="text-xs font-bold text-slate-800">{log.task}</p>
                   <a href={log.fotoUrl} target="_blank" className="text-[9px] bg-white border p-2 rounded-lg text-center font-bold text-indigo-600">LIHAT BUKTI FOTO</a>
                 </div>
               ))}
             </div>
           </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-emerald-500">
            <h2 className="text-xs font-black text-slate-400 uppercase mb-2">Tugas Anda:</h2>
            <p className="text-xl font-black text-indigo-900 leading-tight">Halo, {currentUser.nama}</p>
            <p className="text-[10px] font-bold text-emerald-600">Anda Login sebagai {currentUser.jabatan}</p>
          </div>

          <div className="space-y-4">
            {myTasks.length > 0 ? myTasks.map((s, i) => (
              <div key={i} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <p className="font-black text-slate-800 leading-none mb-1">{s["To do List"]}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">{s["Jam/Rentang Jam"]}</p>
                <div className="relative group">
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleTaskUpload(e, s)} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                  <div className="p-4 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-2xl text-center font-black text-[10px] text-emerald-700 uppercase">
                    {uploading ? 'MENGIRIM...' : 'AMBIL FOTO LAPORAN'}
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-center py-10 text-slate-400 italic text-xs uppercase font-bold">Tidak ada jadwal tugas untuk Anda hari ini.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
