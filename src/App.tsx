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

// PERBAIKAN UTAMA: Logika transformasi URL Google Drive yang lebih kuat
const getDirectImg = (url: string) => {
  if (!url) return '';
  // Jika link berasal dari Google Drive
  if (url.includes('drive.google.com')) {
    let fileId = "";
    if (url.includes('id=')) {
      fileId = url.split('id=')[1].split('&')[0];
    } else {
      const parts = url.split('/');
      fileId = parts[parts.indexOf('d') + 1];
    }
    return `https://lh3.googleusercontent.com/d/${fileId}=s500`; // Gunakan API thumbnail Google yang lebih stabil
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
            body: JSON.stringify({ base64, type: file.type, name: `PROFILE_${Date.now()}.jpg` })
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
        alert("Data Berhasil Diperbarui!");
      } else {
        await addDoc(collection(db, "users"), userData);
        alert("User Baru Berhasil Didaftarkan!");
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
          alert("Update Berhasil!");
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
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border-t-8 border-indigo-600 animate-in zoom-in duration-300">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-800 italic tracking-tighter">E-MONITORING</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sistem Kontrol Operasional</p>
          </div>
          <div className="space-y-4">
            <input type="text" placeholder="Username" className="w-full p-4 rounded-2xl bg-slate-100 font-bold border-0 focus:ring-2 focus:ring-indigo-500" onChange={(e)=>setLoginData({...loginData, user: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <input type="password" placeholder="Password" className="w-full p-4 rounded-2xl bg-slate-100 font-bold border-0 focus:ring-2 focus:ring-indigo-500" onChange={(e)=>setLoginData({...loginData, pass: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <button onClick={handleLogin} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg uppercase tracking-widest text-xs active:scale-95 transition-transform">Masuk Sekarang</button>
          </div>
        </div>
      </div>
    );
  }

  const hariIni = getIndonesianDay();
  const currentShifts = shifts.filter(s => String(s["Hari"]).toLowerCase() === hariIni.toLowerCase());
  const myTasks = schedules.filter(s => s["Nama Petugas"] === currentUser?.nama && checkDayMatch(s["Waktu"]));

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen text-slate-900">
      <header className="mb-6 bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl flex justify-between items-center border-b-4 border-indigo-600">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full border-2 border-indigo-500 overflow-hidden bg-indigo-800 flex items-center justify-center">
            {currentUser.fotoUrl ? (
              <img src={getDirectImg(currentUser.fotoUrl)} className="w-full h-full object-cover" onError={(e) => {(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${currentUser.nama}&background=random`;}} />
            ) : <span className="text-xl font-black">{currentUser.nama.charAt(0)}</span>}
          </div>
          <div>
            <h1 className="text-lg font-black leading-none">{currentUser.nama}</h1>
            <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{currentUser.jabatan}</p>
          </div>
        </div>
        <button onClick={() => setIsLoggedIn(false)} className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all">Logout</button>
      </header>

      <div className="mb-6 bg-indigo-50 p-5 rounded-3xl border border-indigo-100 shadow-sm">
        <p className="text-[10px] font-black text-indigo-900 mb-3 uppercase tracking-widest">Shift Paten Hari Ini:</p>
        <div className="flex flex-wrap gap-2">
          {currentShifts.map((s, i) => (
            <span key={i} className="bg-white text-indigo-700 px-4 py-2 rounded-2xl text-[11px] font-bold shadow-sm border border-indigo-50">
              {s["Nama Petugas"]} <span className="opacity-40 text-[9px]">({s["Shift"]})</span>
            </span>
          ))}
          {currentShifts.length === 0 && <p className="text-xs italic text-slate-400">Jadwal belum tersedia</p>}
        </div>
      </div>

      {currentUser.role === 'admin' ? (
        <div className="space-y-6">
          <div className="flex gap-2 bg-slate-200 p-1 rounded-2xl shadow-inner">
            <button onClick={() => setActiveTab('monitoring')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'monitoring' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Monitoring</button>
            <button onClick={() => setActiveTab('users')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'users' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Daftar Petugas</button>
            <button onClick={() => setActiveTab('master')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'master' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Setup Excel</button>
          </div>

          {activeTab === 'users' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="font-black text-indigo-900 text-xs uppercase mb-4">{isEditing ? 'Mode Edit Petugas' : 'Tambah Petugas Baru'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" placeholder="Nama Lengkap" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.nama} onChange={(e)=>setNewUser({...newUser, nama: e.target.value})} />
                  <input type="text" placeholder="Username" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.username} onChange={(e)=>setNewUser({...newUser, username: e.target.value})} />
                  <input type="text" placeholder="Password" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.password} onChange={(e)=>setNewUser({...newUser, password: e.target.value})} />
                  <select className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.jabatan} onChange={(e)=>setNewUser({...newUser, jabatan: e.target.value})}>
                    <option value="SATPAM">SATPAM</option>
                    <option value="CS">CLEANING SERVICE</option>
                    <option value="PENGAWAS">PENGAWAS (ADMIN)</option>
                  </select>
                  <div className="md:col-span-2">
                    <p className="text-[9px] font-bold text-slate-400 mb-2 uppercase ml-1">Unggah Foto Profil Petugas</p>
                    <input type="file" onChange={async (e) => { if(e.target.files?.[0]) { setUploading(true); const url = await uploadToDrive(e.target.files[0]); setNewUser({...newUser, fotoUrl: url}); setUploading(false); } }} className="text-xs bg-slate-50 p-3 rounded-xl w-full border border-dashed" />
                  </div>
                  <button onClick={handleSaveUser} disabled={uploading} className="md:col-span-2 p-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase shadow-lg hover:bg-indigo-700 transition-colors">
                    {uploading ? 'MEMPROSES...' : (isEditing ? 'PERBARUI DATA' : 'DAFTARKAN PETUGAS SEKARANG')}
                  </button>
                  {isEditing && <button onClick={()=>{setIsEditing(null); setNewUser({nama:'', username:'', password:'', jabatan:'SATPAM', fotoUrl:''})}} className="md:col-span-2 p-2 text-[10px] font-bold text-red-500 uppercase">Batalkan Edit</button>}
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-slate-400 uppercase font-black text-[9px]"><th className="px-3">Foto</th><th className="px-2">User</th><th className="px-2">Jabatan</th><th className="px-2">Password</th><th className="px-2">Aksi</th></tr>
                  </thead>
                  <tbody>
                    {allUsers.map(u => (
                      <tr key={u.id} className="bg-slate-50 rounded-2xl group hover:bg-slate-100 transition-colors">
                        <td className="p-3 w-12">
                           <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 border border-white">
                             {u.fotoUrl ? <img src={getDirectImg(u.fotoUrl)} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">{u.nama.charAt(0)}</div>}
                           </div>
                        </td>
                        <td className="p-3 font-black text-indigo-900">{u.nama}</td>
                        <td className="p-3 font-bold text-slate-500 uppercase text-[9px]">{u.jabatan}</td>
                        <td className="p-3 font-mono font-bold text-emerald-600">{u.password}</td>
                        <td className="p-3 flex gap-2">
                          <button onClick={() => { setIsEditing(u.id); setNewUser(u); }} className="p-3 bg-white rounded-xl shadow-sm hover:text-indigo-600">✏️</button>
                          <button onClick={() => handleDeleteUser(u.id)} className="p-3 bg-white rounded-xl shadow-sm hover:text-red-600">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'master' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in scale-95 duration-300">
              <div className="bg-white p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center">
                 <div className="text-3xl mb-3">📄</div>
                 <p className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest italic">1. Upload Master Tugas Pekerjaan</p>
                 <input type="file" onChange={(e) => handleUploadExcel('schedules', e)} className="text-[10px] bg-slate-50 p-4 rounded-2xl w-full border" />
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border-2 border-dashed border-indigo-200 text-center flex flex-col items-center">
                 <div className="text-3xl mb-3">📅</div>
                 <p className="text-[10px] font-black text-indigo-400 mb-4 uppercase tracking-widest italic">2. Upload Jadwal Shift Paten</p>
                 <input type="file" onChange={(e) => handleUploadExcel('shifts', e)} className="text-[10px] bg-indigo-50 p-4 rounded-2xl w-full border border-indigo-100" />
              </div>
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
              {logs.length === 0 && <div className="text-center py-20 bg-white rounded-3xl text-slate-300 italic text-sm font-bold uppercase">Belum ada laporan masuk</div>}
              {logs.map(log => (
                <div key={log.id} className="p-5 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col gap-3 group">
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] font-black text-indigo-700 uppercase tracking-tight">{log.petugas} • {log.jam}</span>
                     <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : log.approval === 'Tolak' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-600'}`}>
                       {log.approval}
                     </span>
                   </div>
                   <p className="text-sm font-black text-slate-800 leading-tight">{log.task}</p>
                   <div className="flex gap-3">
                     <a href={log.fotoUrl} target="_blank" className="flex-1 text-center bg-slate-50 border p-3 rounded-xl text-[10px] font-black uppercase no-underline text-indigo-600 hover:bg-slate-100">Lihat Hasil Foto</a>
                     {log.approval === 'Menunggu' && (
                       <><button onClick={() => handleVerify(log.id, 'Setuju')} className="flex-1 bg-green-600 text-white p-3 rounded-xl text-[10px] font-black uppercase shadow-sm">Setuju</button>
                         <button onClick={() => handleVerify(log.id, 'Tolak')} className="flex-1 bg-red-600 text-white p-3 rounded-xl text-[10px] font-black uppercase shadow-sm">Tolak</button></>
                     )}
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border-l-8 border-emerald-500 flex justify-between items-center">
             <div>
               <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">Halo, {currentUser.nama}</h1>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic leading-none">Status: {currentUser.jabatan}</p>
             </div>
             <div className="w-16 h-16 rounded-3xl bg-slate-100 overflow-hidden border">
               {currentUser.fotoUrl ? <img src={getDirectImg(currentUser.fotoUrl)} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-300">?</div>}
             </div>
          </div>

          <h3 className="text-[10px] font-black text-slate-400 uppercase ml-3 tracking-widest">Daftar Tugas Hari Ini:</h3>
          {/* LOGIKA ANTI DUPLIKASI: Mengambil list unik dari To Do List */}
          {Array.from(new Set(myTasks.map(t => t["To do List"]))).map((taskTitle) => {
            const s = myTasks.find(t => t["To do List"] === taskTitle);
            const logTerkait = logs.find(l => l.petugas === currentUser.nama && l.task === taskTitle);
            
            return (
              <div key={taskTitle} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-start mb-3">
                  <p className="font-black text-slate-800 text-lg leading-tight flex-1 mr-4">{taskTitle}</p>
                  {logTerkait && <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase ${logTerkait.approval === 'Setuju' ? 'bg-green-100 text-green-700' : logTerkait.approval === 'Tolak' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{logTerkait.approval}</span>}
                </div>
                <p className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full w-fit mb-5">{s["Jam/Rentang Jam"]}</p>
                
                {(!logTerkait || logTerkait.approval === 'Tolak') ? (
                  <div className="relative group">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleTaskReport(e, s)} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                    <div className={`p-5 rounded-2xl text-center font-black text-[11px] uppercase border-2 border-dashed transition-colors ${logTerkait?.approval === 'Tolak' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                      {uploading ? '📡 Sabar, Sedang Mengirim...' : (logTerkait?.approval === 'Tolak' ? '📸 Upload Ulang Bukti' : '📸 Ambil Foto Bukti Laporan')}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-[11px] font-black text-slate-400 uppercase">
                    ✅ Laporan Sudah Terkirim
                  </div>
                )}
              </div>
            );
          })}
          {myTasks.length === 0 && <div className="text-center py-20 text-slate-300 italic text-sm">Tidak ada jadwal tugas untuk nama Anda hari ini.</div>}
        </div>
      )}
    </div>
  );
}
