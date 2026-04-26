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

// --- FUNGSI PEMBANTU ---
const getIndonesianDay = () => new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date());
const getWeekOfMonth = () => Math.ceil(new Date().getDate() / 7);

const getDirectImg = (url: string) => {
  if (!url) return '';
  if (url.includes('drive.google.com')) {
    return url.replace('/view?usp=drivesdk', '').replace('file/d/', 'uc?export=view&id=').replace('/view', '');
  }
  return url;
};

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
            body: JSON.stringify({ base64, type: file.type, name: `UPLOAD_${Date.now()}.jpg` })
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
    if (confirm("Hapus user ini?")) await deleteDoc(doc(db, "users", id));
  };

  const handleUploadExcel = async (type: 'schedules' | 'shifts', e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
        if (confirm(`Ganti Master ${type === 'schedules' ? 'Tugas' : 'Shift'}?`)) {
          const q = await getDocs(query(collection(db, type)));
          await Promise.all(q.docs.map(d => deleteDoc(d.ref)));
          for (const r of data) await addDoc(collection(db, type), { ...r, createdAt: new Date().toISOString() });
          alert("Update Sukses!");
        }
      } catch (err) { alert("Gagal upload"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleTaskReport = async (e: any, task: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToDrive(file);
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
    finally { setUploading(false); }
  };

  const handleVerify = async (id: string, status: 'Setuju' | 'Tolak') => {
    await updateDoc(doc(db, "logs", id), { approval: status });
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border-t-8 border-indigo-600">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-800 italic">E-MONITORING</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sistem Kontrol Operasional</p>
          </div>
          <div className="space-y-4">
            <input type="text" placeholder="Username" className="w-full p-4 rounded-2xl bg-slate-100 font-bold border-0" onChange={(e)=>setLoginData({...loginData, user: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <input type="password" placeholder="Password" className="w-full p-4 rounded-2xl bg-slate-100 font-bold border-0" onChange={(e)=>setLoginData({...loginData, pass: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <button onClick={handleLogin} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg uppercase tracking-widest text-xs">Masuk</button>
          </div>
        </div>
      </div>
    );
  }

  const hariIni = getIndonesianDay();
  const currentShifts = shifts.filter(s => String(s["Hari"]).toLowerCase() === hariIni.toLowerCase());
  const myTasks = schedules.filter(s => s["Nama Petugas"] === currentUser?.nama && checkDayMatch(s["Waktu"]));

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen">
      <header className="mb-6 bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl flex justify-between items-center border-b-4 border-indigo-600">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full border-2 border-indigo-500 overflow-hidden bg-indigo-800 flex items-center justify-center">
            {currentUser.fotoUrl ? (
              <img src={getDirectImg(currentUser.fotoUrl)} className="w-full h-full object-cover" onError={(e) => {(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${currentUser.nama}`;}} />
            ) : <span className="text-xl font-black">{currentUser.nama.charAt(0)}</span>}
          </div>
          <div>
            <h1 className="text-lg font-black leading-none">{currentUser.nama}</h1>
            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{currentUser.jabatan}</p>
          </div>
        </div>
        <button onClick={() => setIsLoggedIn(false)} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl text-[9px] font-black uppercase">Logout</button>
      </header>

      <div className="mb-6 bg-indigo-100 p-4 rounded-2xl border border-indigo-200 shadow-sm">
        <p className="text-[10px] font-black text-indigo-900 mb-2 uppercase tracking-widest">Shift Paten Hari Ini:</p>
        <div className="flex flex-wrap gap-2">
          {currentShifts.map((s, i) => (
            <span key={i} className="bg-white text-indigo-700 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm">
              {s["Nama Petugas"]} <span className="opacity-50">({s["Shift"]})</span>
            </span>
          ))}
        </div>
      </div>

      {currentUser.role === 'admin' ? (
        <div className="space-y-6">
          <div className="flex gap-2 bg-slate-200 p-1 rounded-2xl shadow-inner">
            {['monitoring', 'users', 'master'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === t ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>
                {t === 'master' ? 'Setup Excel' : t === 'users' ? 'Daftar Petugas' : t}
              </button>
            ))}
          </div>

          {activeTab === 'users' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="font-black text-indigo-900 text-xs uppercase mb-4">{isEditing ? 'Edit Petugas' : 'Tambah Petugas Baru'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" placeholder="Nama Lengkap" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.nama} onChange={(e)=>setNewUser({...newUser, nama: e.target.value})} />
                  <input type="text" placeholder="Username" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.username} onChange={(e)=>setNewUser({...newUser, username: e.target.value})} />
                  <input type="text" placeholder="Password" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.password} onChange={(e)=>setNewUser({...newUser, password: e.target.value})} />
                  <select className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.jabatan} onChange={(e)=>setNewUser({...newUser, jabatan: e.target.value})}>
                    <option value="SATPAM">SATPAM</option>
                    <option value="CS">CLEANING SERVICE</option>
                    <option value="PENGAWAS">PENGAWAS (ADMIN)</option>
                  </select>
                  <div className="md:col-span-2">
                    <p className="text-[9px] font-bold text-slate-400 mb-1 uppercase">Foto Profil</p>
                    <input type="file" onChange={async (e) => { if(e.target.files?.[0]) { setUploading(true); const url = await uploadToDrive(e.target.files[0]); setNewUser({...newUser, fotoUrl: url}); setUploading(false); } }} className="text-xs w-full" />
                  </div>
                  <button onClick={handleSaveUser} disabled={uploading} className="md:col-span-2 p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg">
                    {uploading ? 'MEMPROSES...' : 'SIMPAN DATA'}
                  </button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-slate-400 uppercase font-black text-[9px]"><th className="px-2">User</th><th className="px-2">Jabatan</th><th className="px-2">Password</th><th className="px-2">Aksi</th></tr>
                  </thead>
                  <tbody>
                    {allUsers.map(u => (
                      <tr key={u.id} className="bg-slate-50 rounded-xl">
                        <td className="p-3 font-black text-indigo-900 flex items-center gap-2">
                          {u.fotoUrl && <img src={getDirectImg(u.fotoUrl)} className="w-6 h-6 rounded-full object-cover" />}
                          {u.nama}
                        </td>
                        <td className="p-3 font-bold text-slate-500 uppercase text-[9px]">{u.jabatan}</td>
                        <td className="p-3 font-mono font-bold text-emerald-600">{u.password}</td>
                        <td className="p-3 flex gap-2">
                          <button onClick={() => { setIsEditing(u.id); setNewUser(u); }} className="p-2 bg-white rounded-lg shadow-sm">✏️</button>
                          <button onClick={() => handleDeleteUser(u.id)} className="p-2 bg-white rounded-lg shadow-sm">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'master' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
              <div className="bg-white p-6 rounded-[2rem] border-2 border-dashed border-slate-200 text-center">
                 <p className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest italic">1. Upload Master Tugas</p>
                 <input type="file" onChange={(e) => handleUploadExcel('schedules', e)} className="text-[10px] bg-slate-50 p-4 rounded-2xl w-full" />
              </div>
              <div className="bg-white p-6 rounded-[2rem] border-2 border-dashed border-indigo-200 text-center">
                 <p className="text-[10px] font-black text-indigo-400 mb-4 uppercase tracking-widest italic">2. Upload Shift Paten</p>
                 <input type="file" onChange={(e) => handleUploadExcel('shifts', e)} className="text-[10px] bg-slate-50 p-4 rounded-2xl w-full" />
              </div>
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className="space-y-4 animate-in fade-in">
              {logs.map(log => (
                <div key={log.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] font-black text-indigo-700 uppercase">{log.petugas} - {log.jam}</span>
                     <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-600'}`}>{log.approval}</span>
                   </div>
                   <p className="text-xs font-bold text-slate-800">{log.task}</p>
                   <div className="flex gap-2">
                     <a href={log.fotoUrl} target="_blank" className="flex-1 text-center bg-slate-100 p-2 rounded-xl text-[9px] font-black uppercase no-underline">Lihat Bukti</a>
                     {log.approval === 'Menunggu' && (
                       <><button onClick={() => handleVerify(log.id, 'Setuju')} className="flex-1 bg-green-600 text-white p-2 rounded-lg text-[9px] font-bold uppercase">Setuju</button>
                         <button onClick={() => handleVerify(log.id, 'Tolak')} className="flex-1 bg-red-600 text-white p-2 rounded-lg text-[9px] font-bold uppercase">Tolak</button></>
                     )}
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border-l-8 border-emerald-500">
             <h1 className="text-2xl font-black text-slate-800 tracking-tight">Halo, {currentUser.nama}</h1>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Tugas Anda untuk Hari ini:</p>
          </div>

          {Array.from(new Set(myTasks.map(t => t["To do List"]))).map((taskTitle) => {
            const s = myTasks.find(t => t["To do List"] === taskTitle);
            const logTerkait = logs.find(l => l.petugas === currentUser.nama && l.task === taskTitle);
            return (
              <div key={taskTitle} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-black text-slate-800 leading-tight">{taskTitle}</p>
                  {logTerkait && <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase ${logTerkait.approval === 'Setuju' ? 'bg-green-100 text-green-700' : logTerkait.approval === 'Tolak' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{logTerkait.approval}</span>}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">{s["Jam/Rentang Jam"]}</p>
                {(!logTerkait || logTerkait.approval === 'Tolak') ? (
                  <div className="relative group">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleTaskReport(e, s)} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                    <div className="p-4 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-2xl text-center font-black text-[10px] text-emerald-700 uppercase">
                      {uploading ? 'Mengirim...' : (logTerkait?.approval === 'Tolak' ? "Upload Ulang" : "Ambil Foto Laporan")}
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
