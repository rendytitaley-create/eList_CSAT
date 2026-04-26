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
  const target = waktuExcel.toLowerCase();
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
  const [role, setRole] = useState<'admin' | 'petugas' | null>(null);
  const [activePetugas, setActivePetugas] = useState('');
  const [uploading, setUploading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const unsubSchedules = onSnapshot(query(collection(db, "schedules")), (snap) => {
      setSchedules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubShifts = onSnapshot(query(collection(db, "shifts")), (snap) => {
      setShifts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLogs = onSnapshot(query(collection(db, "logs"), orderBy("timestamp", "desc")), (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubSchedules(); unsubShifts(); unsubLogs(); };
  }, []);

  const handleUploadGeneric = async (collectionName: string, e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
        if (confirm(`Perbarui data ${collectionName}?`)) {
          const qSnapshot = await getDocs(query(collection(db, collectionName)));
          await Promise.all(qSnapshot.docs.map((doc) => deleteDoc(doc.ref)));
          for (const row of data) {
            await addDoc(collection(db, collectionName), { ...row, createdAt: new Date().toISOString() });
          }
          alert("Data Berhasil Diperbarui!");
        }
      } catch (error) { alert("Gagal upload"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleFileUpload = async (e: any, taskInfo: any) => {
    const file = e.target.files[0];
    if (!file || !activePetugas) return alert("Isi Nama Petugas!");
    setUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ base64, type: file.type, name: `${activePetugas}_${Date.now()}.jpg` })
        });
        const result = await res.json();
        if (result.result === 'success') {
          await addDoc(collection(db, "logs"), {
            petugas: activePetugas,
            task: taskInfo["To do List"],
            jam: taskInfo["Jam/Rentang Jam"],
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
  const displaySchedules = schedules.filter(s => {
    const matchUser = activePetugas ? s["Nama Petugas"].toLowerCase().includes(activePetugas.toLowerCase()) : false;
    const matchTime = checkDayMatch(s["Waktu"] || "");
    return matchUser && matchTime;
  });

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen text-slate-800">
      {/* HEADER & SHIFT */}
      <header className="mb-6 bg-indigo-900 text-white p-6 rounded-3xl shadow-lg text-center">
        <h1 className="text-2xl font-black italic uppercase">E-Monitoring Ops</h1>
        <p className="text-[10px] opacity-70 tracking-widest mt-1 mb-4 border-b border-indigo-800 pb-2">
          {hariIni}, {new Date().toLocaleDateString('id-ID')} | Minggu ke-{getWeekOfMonth()}
        </p>
        <div className="bg-indigo-800/50 p-3 rounded-2xl">
          <p className="text-[10px] font-bold text-indigo-300 mb-2 uppercase">Shift Hari Ini (Paten)</p>
          <div className="flex flex-wrap justify-center gap-2">
            {currentShifts.map((s, i) => (
              <div key={i} className="bg-white text-indigo-900 px-3 py-1 rounded-full text-xs font-bold">
                {s["Nama Petugas"]} <span className="text-[9px] opacity-60">({s["Shift"]})</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {!role ? (
        <div className="flex flex-col gap-6 mt-10">
          <button onClick={() => setRole('petugas')} className="p-6 bg-emerald-600 text-white rounded-2xl shadow-md font-bold text-lg">LOG KERJA PETUGAS</button>
          <button onClick={() => setRole('admin')} className="p-6 bg-white border-2 border-indigo-600 text-indigo-700 rounded-2xl shadow-md font-bold text-lg">MENU ADMIN / PENGAWAS</button>
        </div>
      ) : (
        <div className="animate-in fade-in">
          <button onClick={() => setRole(null)} className="mb-6 font-bold text-slate-400 text-xs">← KEMBALI</button>

          {role === 'admin' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <h3 className="text-[10px] font-bold mb-2">UPLOAD TUGAS</h3>
                  <input type="file" onChange={(e) => handleUploadGeneric('schedules', e)} className="text-[10px]" />
                </div>
                <div className="bg-white p-4 rounded-xl border border-indigo-200">
                  <h3 className="text-[10px] font-bold mb-2">UPLOAD SHIFT PATEN</h3>
                  <input type="file" onChange={(e) => handleUploadGeneric('shifts', e)} className="text-[10px]" />
                </div>
              </div>

              {/* DASHBOARD MONITORING DENGAN VERIFIKASI */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="font-bold text-sm tracking-widest uppercase mb-4 text-indigo-900">Dashboard Verifikasi</h2>
                <div className="space-y-4">
                  {logs.map(log => (
                    <div key={log.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-black text-indigo-700 uppercase">{log.petugas}</p>
                          <p className="text-[9px] text-slate-400">{log.waktu}</p>
                        </div>
                        <span className={`text-[9px] px-2 py-1 rounded-full font-bold uppercase ${log.approval === 'Setuju' ? 'bg-green-100 text-green-700' : log.approval === 'Tolak' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {log.approval}
                        </span>
                      </div>
                      <p className="text-xs font-bold">{log.task} ({log.jam})</p>
                      <div className="flex gap-2">
                        <a href={log.fotoUrl} target="_blank" className="flex-1 text-center bg-white border border-indigo-200 text-indigo-700 py-2 rounded-lg text-[10px] font-bold no-underline">LIHAT FOTO</a>
                        {log.approval === 'Menunggu' && (
                          <>
                            <button onClick={() => handleVerify(log.id, 'Setuju')} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-[10px] font-bold uppercase">Setuju</button>
                            <button onClick={() => handleVerify(log.id, 'Tolak')} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-[10px] font-bold uppercase">Tolak</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <input type="text" value={activePetugas} onChange={(e)=>setActivePetugas(e.target.value)} placeholder="Nama Anda..." className="w-full p-4 bg-white border-0 rounded-2xl shadow-sm font-bold" />
              
              <h2 className="font-bold text-slate-500 text-xs uppercase px-2 tracking-widest">Tugas & Status Laporan:</h2>
              {displaySchedules.map((s, i) => {
                // Mencari apakah tugas ini sudah ada log-nya untuk petugas ini hari ini
                const logTerkait = logs.find(l => l.petugas === activePetugas && l.task === s["To do List"]);
                
                return (
                  <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border-l-8 border-emerald-500">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-black text-lg flex-1">{s["To do List"]}</p>
                      {logTerkait && (
                        <span className={`text-[9px] px-2 py-1 rounded-full font-bold uppercase ${logTerkait.approval === 'Setuju' ? 'bg-green-100 text-green-700' : logTerkait.approval === 'Tolak' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {logTerkait.approval}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">{s["Jam/Rentang Jam"]}</p>
                    
                    {(!logTerkait || logTerkait.approval === 'Tolak') ? (
                      <div className="relative">
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, s)} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
                        <div className="p-3 border-2 border-dashed border-emerald-200 rounded-xl flex items-center justify-center gap-2 bg-emerald-50">
                          <span className="text-sm font-bold text-emerald-700 uppercase">{uploading ? "Mengirim..." : (logTerkait?.approval === 'Tolak' ? "Upload Ulang" : "Ambil Foto Bukti")}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-100 rounded-xl text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Laporan Terkirim</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
