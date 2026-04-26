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
    if (!target.includes("senin") && !target.includes("selasa") && !target.includes("rabu") && 
        !target.includes("kamis") && !target.includes("jumat") && !target.includes("sabtu") && 
        !target.includes("minggu") && mingguKeIni === targetMinggu) return true;
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
        if (confirm(`Perbarui data ${collectionName}? Data lama akan dihapus.`)) {
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
    if (!file || !activePetugas) return alert("Pilih/Isi Nama Petugas Dahulu!");
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
            waktu: new Date().toLocaleString('id-ID'),
            timestamp: new Date()
          });
          alert("Laporan Terkirim!");
        }
      } catch (err) { alert("Gagal Kirim ke Drive"); }
      finally { setUploading(false); }
    };
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
      {/* HEADER & JADWAL SHIFT PATEN (DILIHAT SEMUA PEGAWAI) */}
      <header className="mb-6 bg-indigo-900 text-white p-6 rounded-3xl shadow-lg text-center">
        <h1 className="text-2xl font-black italic uppercase">E-Monitoring Ops</h1>
        <p className="text-[10px] opacity-70 tracking-widest mt-1 mb-4 border-b border-indigo-800 pb-2">
          {hariIni}, {new Date().toLocaleDateString('id-ID')} | Minggu ke-{getWeekOfMonth()}
        </p>
        
        <div className="bg-indigo-800/50 p-3 rounded-2xl">
          <p className="text-[10px] font-bold text-indigo-300 mb-2">SIAPA YANG JAGA HARI INI?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {currentShifts.length > 0 ? currentShifts.map((s, i) => (
              <div key={i} className="bg-white text-indigo-900 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                {s["Nama Petugas"]} <span className="text-[9px] opacity-60">({s["Shift"]})</span>
              </div>
            )) : <p className="text-xs italic text-indigo-400">Jadwal shift belum tersedia.</p>}
          </div>
        </div>
      </header>

      {!role ? (
        <div className="flex flex-col gap-6 mt-10">
          <button onClick={() => setRole('petugas')} className="p-6 bg-emerald-600 text-white rounded-2xl shadow-md font-bold text-lg">LOG KERJA PETUGAS</button>
          <button onClick={() => setRole('admin')} className="p-6 bg-white border-2 border-indigo-600 text-indigo-700 rounded-2xl shadow-md font-bold text-lg">MENU ADMIN / PENGAWAS</button>
        </div>
      ) : (
        <div>
          <button onClick={() => setRole(null)} className="mb-6 font-bold text-slate-400 text-xs">← KEMBALI KE DEPAN</button>

          {role === 'admin' ? (
            <div className="space-y-6">
              {/* UPLOAD MASTER DATA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200">
                  <h3 className="text-xs font-bold mb-2 text-indigo-900">1. UPLOAD TUGAS (EXCEL)</h3>
                  <input type="file" onChange={(e) => handleUploadGeneric('schedules', e)} className="text-[10px] w-full" />
                </div>
                <div className="bg-white p-5 rounded-2xl border border-indigo-200">
                  <h3 className="text-xs font-bold mb-2 text-indigo-900">2. UPLOAD SHIFT PATEN (EXCEL)</h3>
                  <input type="file" onChange={(e) => handleUploadGeneric('shifts', e)} className="text-[10px] w-full" />
                </div>
              </div>

              {/* LIVE MONITORING */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="font-bold text-lg mb-4 text-indigo-900 uppercase text-sm tracking-widest">Monitoring Pekerjaan</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b">
                        <th className="pb-2">WAKTU</th>
                        <th className="pb-2">PETUGAS</th>
                        <th className="pb-2">TUGAS</th>
                        <th className="pb-2">BUKTI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {logs.map(log => (
                        <tr key={log.id}>
                          <td className="py-3">{log.waktu}</td>
                          <td className="py-3 font-bold">{log.petugas}</td>
                          <td className="py-3">{log.task}</td>
                          <td className="py-3"><a href={log.fotoUrl} target="_blank" className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold no-underline">LIHAT</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <label className="block font-bold text-slate-700 mb-3 text-sm italic">Siapa yang bertugas?</label>
                <input type="text" value={activePetugas} onChange={(e)=>setActivePetugas(e.target.value)} placeholder="Masukkan Nama Anda..." className="w-full p-4 bg-slate-50 border-0 rounded-xl font-bold" />
              </div>
              <h2 className="font-bold text-slate-500 text-xs tracking-widest uppercase">Tugas Anda Hari Ini:</h2>
              {displaySchedules.map((s, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border-l-8 border-emerald-500">
                  <p className="font-black text-xl mb-1">{s["To do List"]}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">{s["Jam/Rentang Jam"]}</p>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, s)} disabled={uploading} className="text-xs w-full" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
