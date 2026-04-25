import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';

// === 1. KONFIGURASI (ISI KEMBALI DATA ANDA) ===
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

// Fungsi Pembantu Logika Waktu
const getIndonesianDay = () => new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date());
const getWeekOfMonth = () => Math.ceil(new Date().getDate() / 7);

const checkDayMatch = (waktuExcel: string) => {
  const hariIni = getIndonesianDay().toLowerCase();
  const mingguKeIni = getWeekOfMonth();
  const target = waktuExcel.toLowerCase();

  // 1. Cek "Setiap Hari"
  if (target.includes("setiap hari")) return true;

  // 2. Cek Rentang (Contoh: Senin - Jumat)
  if (target.includes("-")) {
    const hariList = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];
    const [start, end] = target.split("-").map(h => h.trim());
    const startIndex = hariList.indexOf(start);
    const endIndex = hariList.indexOf(end);
    const currentIndex = hariList.indexOf(hariIni);
    if (currentIndex >= startIndex && currentIndex <= endIndex) return true;
  }

  // 3. Cek Spesifik (Contoh: Sabtu Minggu ke-1)
  if (target.includes("minggu ke-")) {
    const targetMinggu = parseInt(target.split("minggu ke-")[1]);
    if (target.includes(hariIni) && mingguKeIni === targetMinggu) return true;
    // Jika hanya tulis "Minggu ke-1" tanpa nama hari
    if (!target.includes("senin") && !target.includes("selasa") && !target.includes("rabu") && 
        !target.includes("kamis") && !target.includes("jumat") && !target.includes("sabtu") && 
        !target.includes("minggu") && mingguKeIni === targetMinggu) return true;
  }

  // 4. Cek Hari Tunggal
  if (target === hariIni) return true;

  return false;
};

export default function App() {
  const [role, setRole] = useState<'admin' | 'petugas' | null>(null);
  const [activePetugas, setActivePetugas] = useState('');
  const [uploading, setUploading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const unsubSchedules = onSnapshot(query(collection(db, "schedules")), (snap) => {
      setSchedules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLogs = onSnapshot(query(collection(db, "logs"), orderBy("timestamp", "desc")), (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubSchedules(); unsubLogs(); };
  }, []);

  const handleExcelUpload = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      const data = XLSX.utils.sheet_to_json(XLSX.read(evt.target.result, { type: 'binary' }).Sheets[XLSX.read(evt.target.result, { type: 'binary' }).SheetNames[0]]);
      data.forEach(async (row: any) => {
        await addDoc(collection(db, "schedules"), { ...row, createdAt: new Date().toISOString() });
      });
      alert("Jadwal Berhasil Diunggah!");
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

  // Filter Jadwal berdasarkan Petugas dan Waktu
  const displaySchedules = schedules.filter(s => {
    const matchUser = activePetugas ? s["Nama Petugas"].toLowerCase().includes(activePetugas.toLowerCase()) : false;
    const matchTime = checkDayMatch(s["Waktu"] || "");
    return matchUser && matchTime;
  });

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-slate-50 min-h-screen text-slate-800">
      <header className="mb-8 text-center bg-indigo-900 text-white p-6 rounded-2xl shadow-lg">
        <h1 className="text-2xl font-black tracking-tight">E-MONITORING OPS</h1>
        <div className="text-xs opacity-80 mt-1 font-medium">
          {getIndonesianDay()}, {new Date().toLocaleDateString('id-ID')} | Minggu ke-{getWeekOfMonth()}
        </div>
      </header>

      {!role ? (
        <div className="flex flex-col gap-6 mt-10">
          <button onClick={() => setRole('admin')} className="p-6 bg-white border-2 border-indigo-600 text-indigo-700 rounded-2xl shadow-md font-bold text-lg hover:bg-indigo-50 transition-all">PANEL PENGAWAS / ADMIN</button>
          <button onClick={() => setRole('petugas')} className="p-6 bg-emerald-600 text-white rounded-2xl shadow-md font-bold text-lg hover:bg-emerald-700 transition-all">ABSENSI & TUGAS PETUGAS</button>
        </div>
      ) : (
        <div className="animate-in fade-in duration-500">
          <button onClick={() => setRole(null)} className="mb-6 px-4 py-2 bg-slate-200 rounded-full text-xs font-bold text-slate-600">← KEMBALI</button>

          {role === 'admin' ? (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2">📤 Upload Data Master Petugas</h2>
                <input type="file" onChange={handleExcelUpload} accept=".xlsx,.xls" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="font-bold text-lg mb-4 text-indigo-900">Live Monitoring Pekerjaan</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-slate-400 font-semibold">
                        <th className="pb-2 px-2">JAM LAPOR</th>
                        <th className="pb-2 px-2">PETUGAS</th>
                        <th className="pb-2 px-2">TUGAS</th>
                        <th className="pb-2 px-2">BUKTI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id} className="bg-slate-50 rounded-lg overflow-hidden">
                          <td className="p-3 font-medium">{log.waktu}</td>
                          <td className="p-3 font-bold text-indigo-700">{log.petugas}</td>
                          <td className="p-3">{log.task} <span className="text-[10px] bg-slate-200 px-1 rounded">{log.jam}</span></td>
                          <td className="p-3"><a href={log.fotoUrl} target="_blank" className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] no-underline">LIHAT FOTO</a></td>
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
                <label className="block font-bold text-slate-700 mb-3 text-sm">Masukan Nama Lengkap Anda:</label>
                <input type="text" value={activePetugas} onChange={(e)=>setActivePetugas(e.target.value)} placeholder="Contoh: Ahmad" className="w-full p-4 bg-slate-50 border-0 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all font-bold" />
              </div>

              <h2 className="font-bold text-slate-500 text-sm tracking-widest uppercase px-2">Tugas Anda Hari Ini:</h2>
              {displaySchedules.length > 0 ? displaySchedules.map((s, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border-l-8 border-emerald-500 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="mb-4">
                    <p className="font-black text-xl text-slate-800 leading-tight mb-1">{s["To do List"]}</p>
                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">{s["Jam/Rentang Jam"]}</span>
                  </div>
                  <div className="relative group cursor-pointer">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, s)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={uploading} />
                    <div className="p-4 border-2 border-dashed border-emerald-200 rounded-xl flex items-center justify-center gap-3 bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                      <span className="text-2xl">📸</span>
                      <span className="text-sm font-bold text-emerald-700">{uploading ? "MENGIRIM..." : "AMBIL FOTO BUKTI"}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-10 text-slate-400 italic text-sm">
                  {activePetugas ? "Tidak ada jadwal tugas untuk Anda hari ini." : "Silakan masukkan nama untuk melihat jadwal."}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
