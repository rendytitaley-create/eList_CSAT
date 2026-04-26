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
    let fileId = "";
    if (url.includes('id=')) { fileId = url.split('id=')[1].split('&')[0]; }
    else { const parts = url.split('/'); fileId = parts[parts.indexOf('d') + 1]; }
    return `https://lh3.googleusercontent.com/d/${fileId}`;
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
  const [activeTab, setActiveTab] = useState<'monitoring' | 'users' | 'master' | 'rekap'>('monitoring');
  
  const [uploading, setUploading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [showManualTask, setShowManualTask] = useState(false);
  const [manualTaskName, setManualTaskName] = useState('');
  const [newUser, setNewUser] = useState({ nama: '', username: '', password: '', jabatan: 'SATPAM', fotoUrl: '' });
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const [rekapMonth, setRekapMonth] = useState(new Date().getMonth() + 1);
  const [rekapYear, setRekapYear] = useState(new Date().getFullYear());

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
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
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
      if (isEditing) { await updateDoc(doc(db, "users", isEditing), userData); alert("User Diupdate!"); } 
      else { await addDoc(collection(db, "users"), userData); alert("User Didaftarkan!"); }
      setNewUser({ nama: '', username: '', password: '', jabatan: 'SATPAM', fotoUrl: '' });
      setIsEditing(null);
    } catch (err) { alert("Gagal Simpan User"); }
    setUploading(false);
  };

  const handleUploadExcel = async (type: 'schedules' | 'shifts', e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
        if (confirm(`Ganti Master ${type}?`)) {
          const q = await getDocs(query(collection(db, type)));
          await Promise.all(q.docs.map(d => deleteDoc(d.ref)));
          for (const r of data) await addDoc(collection(db, type), { ...r, createdAt: new Date().toISOString() });
          alert("Master Berhasil Diganti!");
        }
      } catch (err) { alert("Gagal upload"); }
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
      if (isManual) { setShowManualTask(false); setManualTaskName(''); }
    } catch (err) { alert("Gagal Kirim"); }
    finally { setUploading(false); }
  };

  // --- LOGIKA EXPORT REKAP (LOAD DYNAMIC LIBRARIES) ---
  const exportRekap = async (format: 'excel' | 'pdf') => {
    const filteredLogs = logs.filter(l => {
      const d = l.timestamp.toDate();
      return (d.getMonth() + 1) === rekapMonth && d.getFullYear() === rekapYear;
    });

    const dataRows = filteredLogs.map(l => ({
      Tanggal: l.waktu.split(',')[0],
      Petugas: l.petugas,
      Jabatan: l.jabatan,
      Pekerjaan: l.task,
      Waktu: l.jam,
      Status: l.approval,
      Bukti: l.fotoUrl
    }));

    if (format === 'excel') {
      const ws = XLSX.utils.json_to_sheet(dataRows);
      ws['!cols'] = [{wch:15}, {wch:20}, {wch:12}, {wch:50}, {wch:15}, {wch:12}, {wch:50}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap");
      XLSX.writeFile(wb, `Rekap_${rekapMonth}_${rekapYear}.xlsx`);
    } else {
        alert("Menyiapkan PDF... Silakan tunggu sebentar.");
        // Load jsPDF secara dinamis untuk menghindari error build
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
                doc.text(`REKAP PEKERJAAN - BULAN ${rekapMonth}/${rekapYear}`, 14, 15);
                (doc as any).autoTable({
                    startY: 20,
                    head: [['Tanggal', 'Petugas', 'Jabatan', 'Pekerjaan', 'Waktu', 'Status', 'Link Bukti']],
                    body: dataRows.map(r => Object.values(r)),
                    styles: { fontSize: 7, overflow: 'linebreak' },
                    columnStyles: { 3: { cellWidth: 80 } }
                });
                doc.save(`Rekap_${rekapMonth}_${rekapYear}.pdf`);
            };
        };
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border-t-8 border-indigo-600">
          <h1 className="text-2xl font-black text-center mb-6 text-slate-800 tracking-tighter italic">E-MONITORING</h1>
          <input type="text" placeholder="Username" className="w-full p-4 mb-3 border rounded-2xl font-bold bg-slate-50" onChange={(e)=>setLoginData({...loginData, user: e.target.value})} onKeyDown={(e)=>e.key==='Enter'&&handleLogin()}/>
          <input type="password" placeholder="Password" className="w-full p-4 mb-6 border rounded-2xl font-bold bg-slate-50" onChange={(e)=>setLoginData({...loginData, pass: e.target.value})} onKeyDown={(e)=>e.key==='Enter'&&handleLogin()}/>
          <button onClick={handleLogin} className="w-full p-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-200">Masuk</button>
        </div>
      </div>
    );
  }

  const hariIni = getIndonesianDay();
  const currentShifts = shifts.filter(s => String(s["Hari"]).toLowerCase() === hariIni.toLowerCase());
  const myTasks = schedules.filter(s => s["Nama Petugas"] === currentUser?.nama && checkDayMatch(s["Waktu"]));

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen text-slate-800">
      <header className="mb-6 bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl flex justify-between items-center border-b-4 border-indigo-600">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-indigo-500 overflow-hidden bg-indigo-800 flex items-center justify-center">
            {currentUser.fotoUrl ? <img src={getDirectImg(currentUser.fotoUrl)} className="w-full h-full object-cover" /> : <span className="font-bold">{currentUser.nama.charAt(0)}</span>}
          </div>
          <div><h1 className="font-black text-sm">{currentUser.nama}</h1><p className="text-[9px] uppercase text-indigo-400 font-bold tracking-widest">{currentUser.jabatan}</p></div>
        </div>
        <button onClick={()=>setIsLoggedIn(false)} className="bg-red-500/20 text-red-500 px-4 py-2 rounded-xl text-[8px] font-black uppercase border border-red-500/50">Logout</button>
      </header>

      {/* SHIFT PATEN */}
      <div className="mb-6 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
        <div className="bg-indigo-600 text-white p-2 rounded-xl text-[9px] font-black uppercase leading-tight">Piket<br/>Hari Ini</div>
        <div className="flex flex-wrap gap-2">
          {currentShifts.map((s, i) => (
            <span key={i} className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-bold border border-indigo-100 shadow-sm">
              {s["Nama Petugas"]} ({s["Shift"]})
            </span>
          ))}
          {currentShifts.length === 0 && <span className="text-xs italic text-slate-300 font-medium tracking-tight uppercase">Jadwal belum tersedia</span>}
        </div>
      </div>

      {currentUser.role === 'admin' ? (
        <div className="space-y-6">
          <div className="flex gap-2 bg-slate-200 p-1 rounded-2xl overflow-x-auto shadow-inner">
            {['monitoring', 'users', 'master', 'rekap'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 px-4 rounded-xl text-[9px] font-black uppercase transition-all ${activeTab === t ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>
                {t === 'master' ? 'Setup Excel' : t}
              </button>
            ))}
          </div>

          {activeTab === 'rekap' && (
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm animate-in fade-in">
              <h2 className="font-black text-indigo-900 text-xs uppercase mb-4 tracking-widest">Cetak Rekap Laporan Bulanan</h2>
              <div className="flex flex-wrap gap-3 mb-6">
                <select className="p-4 bg-slate-50 rounded-2xl font-bold text-xs border-0 outline-none" value={rekapMonth} onChange={(e)=>setRekapMonth(Number(e.target.value))}>
                  {["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"].map((m,i)=> <option key={i+1} value={i+1}>{m}</option>)}
                </select>
                <input type="number" className="p-4 bg-slate-50 rounded-2xl font-bold text-xs border-0 w-28 outline-none" value={rekapYear} onChange={(e)=>setRekapYear(Number(e.target.value))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={()=>exportRekap('excel')} className="p-5 bg-emerald-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase shadow-lg shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2">💾 Download Excel</button>
                <button onClick={()=>exportRekap('pdf')} className="p-5 bg-rose-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase shadow-lg shadow-rose-100 active:scale-95 transition-all flex items-center justify-center gap-2">📑 Download PDF</button>
              </div>
              <p className="text-[9px] text-slate-400 mt-6 font-bold uppercase tracking-tighter italic text-center">*Link bukti foto akan otomatis disertakan dalam tabel rekap.</p>
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className="space-y-4 animate-in fade-in">
              {logs.map(log => (
                <div key={log.id} className="p-5 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm group transition-all hover:border-indigo-200">
                   <div className="flex justify-between items-start mb-2">
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black text-indigo-700 uppercase leading-none">{log.petugas}</span>
                        <span className="text-[8px] font-bold text-slate-300 mt-1 uppercase tracking-widest">{log.jabatan} • {log.jam}</span>
                     </div>
                     <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-600'}`}>{log.approval}</span>
                   </div>
                   <p className="text-sm font-black text-slate-800 mb-4">{log.task}</p>
                   <div className="flex gap-2">
                     <a href={log.fotoUrl} target="_blank" className="flex-1 text-center bg-slate-100 p-3 rounded-xl text-[9px] font-black uppercase no-underline text-indigo-600 hover:bg-slate-200 transition-colors">Lihat Bukti Foto</a>
                     {log.approval === 'Menunggu' && (
                       <><button onClick={() => {if(confirm("Setujui?")) handleVerify(log.id, 'Setuju')}} className="bg-emerald-600 text-white px-5 rounded-xl text-[9px] font-black uppercase">Setuju</button>
                         <button onClick={() => {if(confirm("Tolak?")) handleVerify(log.id, 'Tolak')}} className="bg-rose-600 text-white px-5 rounded-xl text-[9px] font-black uppercase">Tolak</button></>
                     )}
                   </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB USER & MASTER TETAP ADA DI SINI */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="font-black text-[10px] uppercase mb-4 text-indigo-900 tracking-widest italic">Management Petugas</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" placeholder="Nama" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.nama} onChange={(e)=>setNewUser({...newUser, nama: e.target.value})} />
                  <input type="text" placeholder="Pass" className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.password} onChange={(e)=>setNewUser({...newUser, password: e.target.value})} />
                  <select className="p-4 bg-slate-50 rounded-2xl text-sm font-bold border-0" value={newUser.jabatan} onChange={(e)=>setNewUser({...newUser, jabatan: e.target.value})}>
                    <option value="SATPAM">SATPAM</option><option value="CS">CS</option><option value="PENGAWAS">PENGAWAS</option>
                  </select>
                  <button onClick={handleSaveUser} disabled={uploading} className="p-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase">{uploading ? '...' : 'Simpan User'}</button>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-[10px] border-separate border-spacing-y-2">
                  <tbody className="divide-y">
                    {allUsers.map(u => (
                      <tr key={u.id} className="bg-slate-50/50">
                        <td className="p-3 font-black">{u.nama}</td><td className="p-3 uppercase font-bold text-slate-400">{u.jabatan}</td><td className="p-3 font-mono">{u.password}</td>
                        <td className="p-3 flex gap-2"><button onClick={()=>handleDeleteUser(u.id)} className="text-red-500 font-bold uppercase text-[8px]">Hapus</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'master' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-10 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center">
                 <div className="text-3xl mb-2 opacity-30">📊</div>
                 <p className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-tighter">Master Tugas (Excel)</p>
                 <input type="file" onChange={(e) => handleUploadExcel('schedules', e)} className="text-[10px] w-full bg-slate-50 p-4 rounded-2xl" />
              </div>
              <div className="bg-white p-10 rounded-[2.5rem] border-2 border-dashed border-indigo-200 text-center flex flex-col items-center">
                 <div className="text-3xl mb-2 opacity-30">🛡️</div>
                 <p className="text-[10px] font-black text-indigo-400 mb-4 uppercase tracking-tighter">Shift Paten (Excel)</p>
                 <input type="file" onChange={(e) => handleUploadExcel('shifts', e)} className="text-[10px] w-full bg-indigo-50 p-4 rounded-2xl" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          {/* TUGAS TAMBAHAN */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-indigo-100 border-2 border-dashed border-indigo-200">
            {!showManualTask ? (
              <button onClick={()=>setShowManualTask(true)} className="w-full font-black text-xs uppercase flex items-center justify-center gap-2 tracking-widest text-indigo-600">
                <span className="text-xl">+</span> Tambah Pekerjaan Tambahan
              </button>
            ) : (
              <div className="space-y-4 animate-in zoom-in-95">
                <input type="text" placeholder="Apa yang Anda kerjakan?" className="w-full p-4 bg-slate-50 rounded-2xl text-slate-800 font-bold border-0 placeholder:text-slate-300" value={manualTaskName} onChange={(e)=>setManualTaskName(e.target.value)} />
                <div className="relative">
                    <input type="file" accept="image/*" capture="environment" onChange={(e)=>handleTaskReport(e, '', '', true)} disabled={uploading||!manualTaskName} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                    <div className="p-5 bg-emerald-600 text-white rounded-2xl text-center font-black text-[10px] uppercase shadow-lg shadow-emerald-200">
                        {uploading ? 'MEMPROSES...' : '📷 AMBIL FOTO & KIRIM'}
                    </div>
                </div>
                <button onClick={()=>setShowManualTask(false)} className="w-full text-center text-[9px] font-bold text-slate-300 uppercase tracking-widest">BATALKAN</button>
              </div>
            )}
          </div>

          <h3 className="text-[9px] font-black text-slate-400 uppercase ml-5 tracking-[0.2em]">Tugas Rutin Harian:</h3>
          {Array.from(new Set(myTasks.map(t => t["To do List"]))).map((taskTitle) => {
            const s = myTasks.find(t => t["To do List"] === taskTitle);
            const logTerkait = logs.find(l => l.task === taskTitle && l.jabatan === currentUser.jabatan && l.waktu.split(',')[0] === new Date().toLocaleDateString('id-ID'));

            return (
              <div key={taskTitle} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-black text-slate-800 leading-tight flex-1 mr-4">{taskTitle}</p>
                  {logTerkait && <span className={`text-[9px] px-3 py-1 rounded-full font-black uppercase ${logTerkait.approval === 'Setuju' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-600'}`}>{logTerkait.petugas === currentUser.nama ? logTerkait.approval : 'Oleh ' + logTerkait.petugas}</span>}
                </div>
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter mb-4">{s["Jam/Rentang Jam"]}</p>
                {(!logTerkait || logTerkait.approval === 'Tolak') ? (
                  <div className="relative">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleTaskReport(e, taskTitle, s["Jam/Rentang Jam"])} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                    <div className="p-4 bg-slate-900 text-white rounded-2xl text-center font-black text-[10px] uppercase active:scale-95 transition-all">
                      {uploading ? '📡 Mengirim...' : '📷 Ambil Foto'}
                    </div>
                  </div>
                ) : <div className="p-4 bg-slate-50 rounded-2xl text-center text-[10px] font-black text-slate-400 uppercase border border-slate-100">Selesai Dikirim</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
