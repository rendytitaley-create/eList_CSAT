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
  if (!url || !url.includes('drive.google.com')) return url || '';
  const fileId = url.match(/[-\w]{25,}/);
  return fileId ? `https://lh3.googleusercontent.com/d/${fileId[0]}` : url;
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
    return currentIndex >= startIndex && currentIndex <= endIndex;
  }
  if (target.includes("minggu ke-")) {
    const targetMinggu = parseInt(target.split("minggu ke-")[1]);
    return target.includes(hariIni) && mingguKeIni === targetMinggu;
  }
  return target === hariIni;
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  const [activeTab, setActiveTab] = useState<'monitoring' | 'users' | 'master' | 'rekap'>('monitoring');
  const [uploading, setUploading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  // User Management
  const [newUser, setNewUser] = useState({ nama: '', username: '', password: '', jabatan: 'SATPAM', fotoUrl: '' });
  const [isEditing, setIsEditing] = useState<string | null>(null);

  // Filter Rekap
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterPetugas, setFilterPetugas] = useState('Semua');
  const [filterJabatan, setFilterJabatan] = useState('Semua');
  const [showManualTask, setShowManualTask] = useState(false);
  const [manualTaskName, setManualTaskName] = useState('');

  useEffect(() => {
    onSnapshot(query(collection(db, "schedules")), (snap) => setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "shifts")), (snap) => setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "logs"), orderBy("timestamp", "desc")), (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, "users")), (snap) => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const handleLogin = () => {
    const foundUser = allUsers.find(u => u.username === loginData.user && u.password === loginData.pass);
    if (foundUser) { setCurrentUser(foundUser); setIsLoggedIn(true); } 
    else { alert("Username atau Password Salah!"); }
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
            body: JSON.stringify({ base64, type: file.type, name: `IMG_${Date.now()}.jpg` })
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
      if (isEditing) { await updateDoc(doc(db, "users", isEditing), userData); } 
      else { await addDoc(collection(db, "users"), userData); }
      setNewUser({ nama: '', username: '', password: '', jabatan: 'SATPAM', fotoUrl: '' });
      setIsEditing(null); alert("Data Berhasil Disimpan!");
    } catch (err) { alert("Gagal Simpan User"); }
    setUploading(false);
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm("Hapus user ini selamanya?")) await deleteDoc(doc(db, "users", id));
  };

  const handleUploadExcel = async (type: 'schedules' | 'shifts', e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const rawData: any[] = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
        const cleanedData = rawData.filter(row => {
            const val = Object.values(row)[0] as string;
            return val && !String(val).toLowerCase().includes("nama petugas");
        });
        if (confirm(`Ganti Master ${type}?`)) {
          const q = await getDocs(query(collection(db, type)));
          await Promise.all(q.docs.map(d => deleteDoc(d.ref)));
          for (const r of cleanedData) await addDoc(collection(db, type), { ...r, createdAt: new Date().toISOString() });
          alert("Update Sukses!");
        }
      } catch (err) { alert("Format Excel Tidak Sesuai"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleTaskReport = async (e: any, taskName: string, taskTime: string, isManual: boolean = false) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToDrive(file);
      await addDoc(collection(db, "logs"), {
        petugas: currentUser.nama,
        jabatan: currentUser.jabatan,
        task: isManual ? manualTaskName : taskName,
        jam: isManual ? "INSIDENTIL" : taskTime,
        fotoUrl: url,
        approval: 'Menunggu',
        type: isManual ? 'tambahan' : 'rutin',
        waktu: new Date().toLocaleString('id-ID'),
        timestamp: new Date()
      });
      alert("Laporan Terkirim!");
      setShowManualTask(false); setManualTaskName('');
    } catch (err) { alert("Gagal Kirim"); }
    finally { setUploading(false); }
  };

  const handleVerify = async (id: string, status: 'Setuju' | 'Tolak') => {
    await updateDoc(doc(db, "logs", id), { approval: status });
  };

  const exportRekap = async (format: 'excel' | 'pdf') => {
    const filtered = logs.filter(l => {
      const d = l.timestamp.toDate();
      const mMatch = (d.getMonth() + 1) === filterMonth;
      const yMatch = d.getFullYear() === filterYear;
      const pMatch = filterPetugas === 'Semua' || String(l.petugas).toLowerCase() === filterPetugas.toLowerCase();
      const jMatch = filterJabatan === 'Semua' || l.jabatan === filterJabatan;
      return mMatch && yMatch && pMatch && jMatch;
    });

    if (filtered.length === 0) return alert("Data tidak ditemukan!");

    const dataRows = filtered.map(l => ({
      "Tanggal": l.waktu.split(',')[0],
      "Petugas": l.petugas,
      "Jabatan": l.jabatan,
      "Uraian Pekerjaan": l.task,
      "Jadwal SOP": l.jam,
      "Verifikasi": l.approval === 'Menunggu' ? "BELUM DIPERIKSA" : l.approval,
      "Bukti Foto": l.fotoUrl
    }));

    if (format === 'excel') {
      const ws = XLSX.utils.json_to_sheet(dataRows);
      ws['!cols'] = [{wch:15}, {wch:25}, {wch:12}, {wch:45}, {wch:15}, {wch:18}, {wch:50}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Bulanan");
      XLSX.writeFile(wb, `Rekap_${filterPetugas}_${filterMonth}.xlsx`);
    } else {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        document.body.appendChild(script);
        script.onload = () => {
            const script2 = document.createElement('script');
            script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js';
            document.body.appendChild(script2);
            script2.onload = () => {
                const { jsPDF } = (window as any).jspdf;
                const doc = new jsPDF('l', 'mm', 'a4');
                doc.text(`REKAPITULASI KERJA - ${filterMonth}/${filterYear}`, 14, 15);
                (doc as any).autoTable({
                    startY: 22,
                    head: [Object.keys(dataRows[0])],
                    body: dataRows.map(r => Object.values(r)),
                    theme: 'grid',
                    styles: { fontSize: 7, overflow: 'linebreak' },
                    columnStyles: { 3: { cellWidth: 80 } }
                });
                doc.save(`Rekap_${filterPetugas}.pdf`);
            };
        };
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border-t-8 border-indigo-600">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-800 italic">E-MONITORING</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Authorized Office App</p>
          </div>
          <div className="space-y-4">
            <input type="text" placeholder="Username" className="w-full p-4 rounded-2xl bg-slate-100 font-bold border-0 focus:ring-2 focus:ring-indigo-500" onChange={(e)=>setLoginData({...loginData, user: e.target.value})} onKeyDown={(e)=>e.key==='Enter'&&handleLogin()}/>
            <input type="password" placeholder="Password" className="w-full p-4 rounded-2xl bg-slate-100 font-bold border-0 focus:ring-2 focus:ring-indigo-500" onChange={(e)=>setLoginData({...loginData, pass: e.target.value})} onKeyDown={(e)=>e.key==='Enter'&&handleLogin()}/>
            <button onClick={handleLogin} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all">Masuk</button>
          </div>
        </div>
      </div>
    );
  }

  const hariIni = getIndonesianDay();
  const currentShifts = shifts.filter(s => String(s["Hari"]).toLowerCase() === hariIni.toLowerCase());
  const myTasks = schedules.filter(s => s["Nama Petugas"] === currentUser?.nama && checkDayMatch(s["Waktu"]));

  return (
    <div className="p-4 font-sans max-w-6xl mx-auto bg-slate-50 min-h-screen">
      <header className="mb-6 bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl flex justify-between items-center border-b-4 border-indigo-600">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full border-2 border-indigo-500 overflow-hidden bg-indigo-800 flex items-center justify-center">
            {currentUser.fotoUrl ? <img src={getDirectImg(currentUser.fotoUrl)} className="w-full h-full object-cover" /> : <span className="font-black text-xl">{currentUser.nama.charAt(0)}</span>}
          </div>
          <div><h1 className="font-black text-lg leading-tight">{currentUser.nama}</h1><p className="text-[10px] uppercase text-indigo-400 font-bold tracking-widest">{currentUser.jabatan}</p></div>
        </div>
        <button onClick={()=>setIsLoggedIn(false)} className="bg-red-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-lg">Logout</button>
      </header>

      {/* SHIFT PATEN */}
      <div className="mb-6 bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex items-center gap-3 overflow-x-auto">
        <span className="text-[9px] font-black text-indigo-900 uppercase bg-indigo-200 px-2 py-1 rounded-lg shrink-0">Piket Hari Ini</span>
        <div className="flex gap-2">
          {currentShifts.map((s, i) => (
            <span key={i} className="bg-white text-indigo-700 px-3 py-1 rounded-full text-[10px] font-bold shadow-sm border border-indigo-50 whitespace-nowrap">{s["Nama Petugas"]} ({s["Shift"]})</span>
          ))}
        </div>
      </div>

      {currentUser.role === 'admin' ? (
        <div className="space-y-6">
          <div className="flex gap-2 bg-slate-200 p-1 rounded-2xl shadow-inner overflow-x-auto">
            {['monitoring', 'users', 'master', 'rekap'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 px-6 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === t ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>
                {t === 'master' ? 'Setup Excel' : t === 'users' ? 'Daftar User' : t}
              </button>
            ))}
          </div>

          {activeTab === 'rekap' && (
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm animate-in fade-in">
              <h2 className="font-black text-indigo-900 text-xs uppercase mb-6 tracking-widest italic">Filter & Cetak Rekap Laporan</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Bulan</label>
                <select className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs" value={filterMonth} onChange={(e)=>setFilterMonth(Number(e.target.value))}>
                  {["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"].map((m,i)=> <option key={i+1} value={i+1}>{m}</option>)}
                </select></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Tahun</label>
                <input type="number" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs" value={filterYear} onChange={(e)=>setFilterYear(Number(e.target.value))} /></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Nama Petugas</label>
                <select className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs" value={filterPetugas} onChange={(e)=>setFilterPetugas(e.target.value)}>
                  <option value="Semua">Semua Petugas</option>
                  {allUsers.filter(u=>u.role!=='admin').map(u=><option key={u.id} value={u.nama}>{u.nama}</option>)}
                </select></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Jabatan</label>
                <select className="w-full p-3 bg-slate-50 rounded-xl font-bold text-xs" value={filterJabatan} onChange={(e)=>setFilterJabatan(e.target.value)}>
                  <option value="Semua">Semua Jabatan</option><option value="SATPAM">SATPAM</option><option value="CS">CS</option>
                </select></div>
              </div>
              <div className="flex gap-4 border-t pt-6">
                <button onClick={()=>exportRekap('excel')} className="flex-1 p-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-emerald-100 transition-all active:scale-95">Download Excel</button>
                <button onClick={()=>exportRekap('pdf')} className="flex-1 p-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-rose-100 transition-all active:scale-95">Download PDF</button>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="font-black text-xs uppercase mb-4 text-indigo-900">{isEditing ? 'Ubah Data Petugas' : 'Daftarkan Petugas Baru'}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" placeholder="Nama Lengkap" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.nama} onChange={(e)=>setNewUser({...newUser, nama: e.target.value})} />
                  <input type="text" placeholder="Username Login" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.username} onChange={(e)=>setNewUser({...newUser, username: e.target.value})} />
                  <input type="text" placeholder="Password" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.password} onChange={(e)=>setNewUser({...newUser, password: e.target.value})} />
                  <select className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.jabatan} onChange={(e)=>setNewUser({...newUser, jabatan: e.target.value})}>
                    <option value="SATPAM">SATPAM</option><option value="CS">CS</option><option value="PENGAWAS">PENGAWAS</option>
                  </select>
                  <div className="md:col-span-2">
                    <p className="text-[9px] font-bold text-slate-400 mb-1 uppercase">Link Foto Profil (Drive)</p>
                    <input type="text" className="w-full p-4 bg-slate-50 rounded-2xl text-xs border-0" value={newUser.fotoUrl} onChange={(e)=>setNewUser({...newUser, fotoUrl: e.target.value})} placeholder="Paste link drive di sini" />
                  </div>
                  <button onClick={handleSaveUser} disabled={uploading} className="md:col-span-2 p-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">Simpan User</button>
                  {isEditing && <button onClick={()=>{setIsEditing(null); setNewUser({nama:'',username:'',password:'',jabatan:'SATPAM',fotoUrl:''})}} className="text-xs font-bold text-red-500 uppercase">Batalkan Edit</button>}
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 overflow-x-auto shadow-sm">
                <table className="w-full text-left text-[10px] border-separate border-spacing-y-2">
                  <thead><tr className="text-slate-400 uppercase font-black text-[8px]"><th className="px-3">Foto</th><th>Nama</th><th>Jabatan</th><th>Pass</th><th>Aksi</th></tr></thead>
                  <tbody>
                    {allUsers.map(u => (
                      <tr key={u.id} className="bg-slate-50 rounded-xl">
                        <td className="p-3 w-16 text-center"><img src={getDirectImg(u.fotoUrl)} className="w-8 h-8 rounded-full mx-auto object-cover border bg-white shadow-inner" onError={(e)=>e.currentTarget.src='https://ui-avatars.com/api/?name='+u.nama} /></td>
                        <td className="p-3 font-black text-indigo-900">{u.nama}</td>
                        <td className="p-3 uppercase font-bold text-slate-400">{u.jabatan}</td>
                        <td className="p-3 font-mono font-bold text-emerald-600">{u.password}</td>
                        <td className="p-3 flex gap-2"><button onClick={()=>{setIsEditing(u.id); setNewUser(u);}} className="bg-white p-2 rounded shadow-sm">✏️</button><button onClick={()=>handleDeleteUser(u.id)} className="bg-white p-2 rounded shadow-sm text-red-500">🗑️</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className="space-y-4 animate-in fade-in">
              {logs.map(log => (
                <div key={log.id} className="p-5 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col gap-2 group transition-all hover:border-indigo-200">
                   <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black text-indigo-700 uppercase">{log.petugas}</span>
                       {log.type === 'tambahan' && <span className="text-[8px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded font-black uppercase">Insidentil</span>}
                     </div>
                     <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-600'}`}>{log.approval}</span>
                   </div>
                   <p className="text-xs font-bold text-slate-800">{log.task}</p>
                   <p className="text-[9px] text-slate-400 font-bold uppercase">{log.jam} • {log.waktu}</p>
                   <div className="flex gap-2 mt-2">
                     <a href={log.fotoUrl} target="_blank" className="flex-1 text-center bg-slate-100 p-3 rounded-xl text-[9px] font-black uppercase no-underline text-indigo-600 hover:bg-slate-200 transition-colors">Lihat Bukti Foto</a>
                     {log.approval === 'Menunggu' && (
                       <><button onClick={() => {if(confirm("Setujui?")) handleVerify(log.id, 'Setuju')}} className="bg-emerald-600 text-white px-5 rounded-xl text-[9px] font-black uppercase shadow-sm">Setuju</button>
                         <button onClick={() => {if(confirm("Tolak?")) handleVerify(log.id, 'Tolak')}} className="bg-rose-600 text-white px-5 rounded-xl text-[9px] font-black uppercase shadow-sm">Tolak</button></>
                     )}
                   </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'master' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
              <div className="bg-white p-10 rounded-[2rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center">
                 <div className="text-3xl mb-2 opacity-30">📂</div>
                 <p className="text-[10px] font-black text-slate-400 mb-4 uppercase italic">1. Upload List Tugas SOP (Excel)</p>
                 <input type="file" onChange={(e) => handleUploadExcel('schedules', e)} className="text-[10px] bg-slate-50 p-4 rounded-2xl w-full border" />
              </div>
              <div className="bg-white p-10 rounded-[2rem] border-2 border-dashed border-indigo-200 text-center flex flex-col items-center">
                 <div className="text-3xl mb-2 opacity-30">📅</div>
                 <p className="text-[10px] font-black text-indigo-400 mb-4 uppercase italic">2. Upload Jadwal Shift Paten (Excel)</p>
                 <input type="file" onChange={(e) => handleUploadExcel('shifts', e)} className="text-[10px] bg-indigo-50 p-4 rounded-2xl w-full border border-indigo-100" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          {/* TUGAS TAMBAHAN */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border-2 border-dashed border-indigo-200">
            {!showManualTask ? (
              <button onClick={()=>setShowManualTask(true)} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 active:scale-95 transition-all">+ PEKERJAAN TAMBAHAN (INSIDENTIL)</button>
            ) : (
              <div className="space-y-4 animate-in zoom-in-95">
                <input type="text" placeholder="Apa yang Anda kerjakan?" className="w-full p-4 bg-slate-50 border-0 rounded-2xl text-sm font-bold" value={manualTaskName} onChange={(e)=>setManualTaskName(e.target.value)} />
                <div className="relative">
                    <input type="file" accept="image/*" capture="environment" onChange={(e)=>handleTaskReport(e, '', '', true)} disabled={uploading||!manualTaskName} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                    <div className="p-5 bg-emerald-600 text-white rounded-2xl text-center font-black text-[11px] uppercase shadow-lg">📷 Ambil Foto & Kirim</div>
                </div>
                <button onClick={()=>setShowManualTask(false)} className="w-full text-center text-[9px] font-bold text-slate-300 uppercase tracking-widest">Batal</button>
              </div>
            )}
          </div>

          <h3 className="text-[10px] font-black text-slate-400 uppercase ml-4 tracking-widest italic leading-none">Daftar Tugas Rutin Harian:</h3>
          {Array.from(new Set(myTasks.map(t => t["To do List"]))).map((taskTitle) => {
            const s = myTasks.find(t => t["To do List"] === taskTitle);
            const logTerkait = logs.find(l => 
              l.task === taskTitle && l.jabatan === currentUser.jabatan && l.waktu.split(',')[0] === new Date().toLocaleDateString('id-ID')
            );

            return (
              <div key={taskTitle} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-black text-slate-800 leading-tight flex-1 mr-4">{taskTitle}</p>
                  {logTerkait && <span className={`text-[9px] px-2 py-1 rounded-full font-black uppercase ${logTerkait.approval === 'Setuju' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-600'}`}>{logTerkait.petugas === currentUser.nama ? logTerkait.approval : 'Selesai oleh ' + logTerkait.petugas}</span>}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-4">{s["Jam/Rentang Jam"]}</p>
                {(!logTerkait || logTerkait.approval === 'Tolak') ? (
                  <div className="relative">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleTaskReport(e, taskTitle, s["Jam/Rentang Jam"])} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                    <div className={`p-4 rounded-xl text-center font-black text-[10px] uppercase border-2 border-dashed ${logTerkait?.approval === 'Tolak' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-slate-900 text-white'}`}>📷 AMBIL FOTO</div>
                  </div>
                ) : <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center text-[10px] font-black text-slate-400 uppercase">LAPORAN DIKIRIM</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
