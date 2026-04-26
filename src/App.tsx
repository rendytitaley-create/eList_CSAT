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

  // State User Baru / Edit
  const [newUser, setNewUser] = useState({ nama: '', username: '', password: '', jabatan: 'SATPAM', fotoUrl: '' });
  const [isEditing, setIsEditing] = useState<string | null>(null);

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

  const uploadToDrive = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ base64, type: file.type, name: `USER_${Date.now()}.jpg` })
          });
          const result = await res.json();
          resolve(result.url);
        } catch (err) { reject(err); }
      };
    });
  };

  const handleSaveUser = async (e: any) => {
    e.preventDefault();
    setUploading(true);
    try {
      const userData = { ...newUser, role: newUser.jabatan === 'PENGAWAS' ? 'admin' : 'petugas' };
      if (isEditing) {
        await updateDoc(doc(db, "users", isEditing), userData);
        alert("User Berhasil Diupdate!");
      } else {
        await addDoc(collection(db, "users"), userData);
        alert("User Berhasil Didaftarkan!");
      }
      setNewUser({ nama: '', username: '', password: '', jabatan: 'SATPAM', fotoUrl: '' });
      setIsEditing(null);
    } catch (err) { alert("Gagal Simpan User"); }
    setUploading(false);
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm("Hapus user ini selamanya?")) await deleteDoc(doc(db, "users", id));
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border-t-8 border-indigo-600 transition-all">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter italic">E-MONITORING</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Sistem Kontrol Operasional</p>
          </div>
          <div className="space-y-4">
            <input type="text" placeholder="Username" className="w-full p-4 rounded-2xl border-0 bg-slate-100 font-bold focus:ring-2 focus:ring-indigo-500" onChange={(e)=>setLoginData({...loginData, user: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <input type="password" placeholder="Password" className="w-full p-4 rounded-2xl border-0 bg-slate-100 font-bold focus:ring-2 focus:ring-indigo-500" onChange={(e)=>setLoginData({...loginData, pass: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <button onClick={handleLogin} className="w-full p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 transition-all active:scale-95 uppercase tracking-widest text-xs">Masuk Sekarang</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen">
      <header className="mb-6 bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl flex justify-between items-center border-b-4 border-indigo-600">
        <div className="flex items-center gap-4">
          {currentUser.fotoUrl && <img src={currentUser.fotoUrl} className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500" />}
          <div>
            <h1 className="text-lg font-black leading-none">{currentUser.nama}</h1>
            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{currentUser.jabatan}</p>
          </div>
        </div>
        <button onClick={() => setIsLoggedIn(false)} className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-[9px] font-black px-4 py-2 rounded-xl uppercase transition-all">Logout</button>
      </header>

      {currentUser.role === 'admin' ? (
        <div className="space-y-6">
          <div className="flex gap-2 bg-slate-200 p-1 rounded-2xl shadow-inner">
            {['monitoring', 'users', 'master'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === t ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'master' ? 'Setup Excel' : t === 'users' ? 'Daftar Petugas' : t}
              </button>
            ))}
          </div>

          {activeTab === 'users' && (
            <div className="space-y-4 animate-in fade-in duration-500">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="font-black text-indigo-900 text-xs uppercase mb-4">{isEditing ? 'Edit Petugas' : 'Tambah Petugas Baru'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" placeholder="Nama Lengkap" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.nama} onChange={(e)=>setNewUser({...newUser, nama: e.target.value})} />
                  <input type="text" placeholder="Username" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.username} onChange={(e)=>setNewUser({...newUser, username: e.target.value})} />
                  <input type="text" placeholder="Password (Bisa Dilihat Admin)" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.password} onChange={(e)=>setNewUser({...newUser, password: e.target.value})} />
                  <select className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.jabatan} onChange={(e)=>setNewUser({...newUser, jabatan: e.target.value})}>
                    <option value="SATPAM">SATPAM</option>
                    <option value="CS">CLEANING SERVICE</option>
                    <option value="PENGAWAS">PENGAWAS (ADMIN)</option>
                  </select>
                  <div className="md:col-span-2">
                    <p className="text-[9px] font-bold text-slate-400 mb-1 uppercase">Foto Profil (Optional)</p>
                    <input type="file" onChange={async (e) => {
                      if(e.target.files?.[0]) {
                        setUploading(true);
                        const url = await uploadToDrive(e.target.files[0]);
                        setNewUser({...newUser, fotoUrl: url as string});
                        setUploading(false);
                      }
                    }} className="text-xs w-full" />
                  </div>
                  <button onClick={handleSaveUser} disabled={uploading} className="md:col-span-2 p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg active:scale-95">
                    {uploading ? 'MEMPROSES...' : (isEditing ? 'UPDATE DATA PETUGAS' : 'DAFTARKAN PETUGAS SEKARANG')}
                  </button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 overflow-x-auto shadow-sm">
                <h2 className="font-black text-slate-400 text-[10px] uppercase mb-4">Daftar Akun Terdaftar</h2>
                <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-slate-400 uppercase font-black text-[9px]">
                      <th className="px-2">User</th>
                      <th className="px-2">Jabatan</th>
                      <th className="px-2">Password</th>
                      <th className="px-2">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map(u => (
                      <tr key={u.id} className="bg-slate-50 rounded-xl overflow-hidden group">
                        <td className="p-3 font-black text-indigo-900 flex items-center gap-2">
                          {u.fotoUrl && <img src={u.fotoUrl} className="w-6 h-6 rounded-full object-cover" />}
                          {u.nama}
                        </td>
                        <td className="p-3 font-bold text-slate-500 uppercase text-[9px]">{u.jabatan}</td>
                        <td className="p-3 font-mono font-bold text-emerald-600">{u.password}</td>
                        <td className="p-3 flex gap-2">
                          <button onClick={() => { setIsEditing(u.id); setNewUser(u); }} className="p-2 bg-white rounded-lg shadow-sm hover:bg-indigo-50 transition-all">✏️</button>
                          <button onClick={() => handleDeleteUser(u.id)} className="p-2 bg-white rounded-lg shadow-sm hover:bg-red-50 transition-all">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'master' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
              <div className="bg-white p-6 rounded-[2rem] border-2 border-dashed border-slate-200 text-center">
                 <p className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest italic">Upload List Tugas CS/Satpam</p>
                 <input type="file" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if(!file) return;
                    const reader = new FileReader();
                    reader.onload = async (evt: any) => {
                      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
                      if(confirm("Ganti Master Tugas?")) {
                        const q = await getDocs(query(collection(db, "schedules")));
                        await Promise.all(q.docs.map(d => deleteDoc(d.ref)));
                        for(const r of data) await addDoc(collection(db, "schedules"), {...r, createdAt: new Date().toISOString()});
                        alert("Update Sukses!");
                      }
                    };
                    reader.readAsBinaryString(file);
                 }} className="text-[10px] bg-slate-50 p-4 rounded-2xl w-full" />
              </div>
              {/* UPLOAD SHIFT PATEN SAMA DENGAN DI ATAS (SESUAIKAN TYPE) */}
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              {logs.map(log => (
                <div key={log.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] font-black text-indigo-700 uppercase">{log.petugas} - {log.jam}</span>
                     <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-600'}`}>{log.approval}</span>
                   </div>
                   <p className="text-xs font-bold">{log.task}</p>
                   <a href={log.fotoUrl} target="_blank" className="bg-indigo-50 text-indigo-600 p-2 rounded-xl text-center text-[9px] font-black uppercase no-underline">Lihat Bukti Kerja</a>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* UI PETUGAS (TETAP SAMA SEPERTI SEBELUMNYA) */
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border-l-8 border-emerald-500">
             <h1 className="text-2xl font-black text-slate-800 tracking-tight">Halo, {currentUser.nama}</h1>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Tugas Anda untuk Hari ini:</p>
          </div>
          {/* LOGIKA MYTASKS SAMA SEPERTI SEBELUMNYA */}
        </div>
      )}
    </div>
  );
}
