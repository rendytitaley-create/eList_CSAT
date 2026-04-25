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

// Fungsi Bantu untuk Waktu
const getIndonesianDay = () => new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date());
const getWeekOfMonth = () => {
  const date = new Date();
  const day = date.getDate();
  return Math.ceil(day / 7);
};

export default function App() {
  const [role, setRole] = useState<'admin' | 'petugas' | null>(null);
  const [activePetugas, setActivePetugas] = useState('');
  const [uploading, setUploading] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Ambil Data Realtime dari Firebase
  useEffect(() => {
    const qSchedules = query(collection(db, "schedules"));
    const unsubSchedules = onSnapshot(qSchedules, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qLogs = query(collection(db, "logs"), orderBy("timestamp", "desc"));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
    if (!file || !activePetugas) return alert("Pilih Nama Petugas Dahulu!");

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
      } catch (err) { alert("Gagal: " + err); }
      finally { setUploading(false); }
    };
  };

  const filteredSchedules = schedules.filter(s => {
    const hariIni = getIndonesianDay();
    const mingguKe = `Minggu ke-${getWeekOfMonth()}`;
    return s["Waktu"] === "Setiap Hari" || s["Waktu"] === hariIni || s["Waktu"] === mingguKe;
  });

  return (
    <div className="p-4 font-sans max-w-4xl mx-auto bg-gray-50 min-h-screen">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-blue-900">E-MONITORING OFFICE</h1>
        <p className="text-sm text-gray-600">{getIndonesianDay()}, {new Date().toLocaleDateString('id-ID')} (Minggu ke-{getWeekOfMonth()})</p>
      </header>

      {!role ? (
        <div className="flex flex-col gap-4 mt-20">
          <button onClick={() => setRole('admin')} className="p-5 bg-indigo-700 text-white rounded-2xl shadow-xl font-bold">MASUK SEBAGAI PENGAWAS</button>
          <button onClick={() => setRole('petugas')} className="p-5 bg-emerald-600 text-white rounded-2xl shadow-xl font-bold">MASUK SEBAGAI PETUGAS</button>
        </div>
      ) : (
        <div>
          <button onClick={() => setRole(null)} className="mb-4 text-sm font-bold text-red-500 uppercase">← Kembali</button>

          {role === 'admin' ? (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow">
                <h2 className="font-bold mb-2">Upload Jadwal (Excel)</h2>
                <input type="file" onChange={handleExcelUpload} accept=".xlsx,.xls" className="text-sm w-full" />
              </div>
              
              <div className="bg-white p-4 rounded-xl shadow overflow-x-auto">
                <h2 className="font-bold mb-4 text-blue-800">Log Pekerjaan Realtime</h2>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 uppercase">
                      <th className="p-2 border">Waktu</th>
                      <th className="p-2 border">Petugas</th>
                      <th className="p-2 border">Tugas</th>
                      <th className="p-2 border">Bukti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td className="p-2 border">{log.waktu}</td>
                        <td className="p-2 border font-bold">{log.petugas}</td>
                        <td className="p-2 border">{log.task} ({log.jam})</td>
                        <td className="p-2 border"><a href={log.fotoUrl} target="_blank" className="text-blue-600 underline">Lihat Foto</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl shadow">
                <label className="block font-bold mb-2">Pilih Nama Anda:</label>
                <input type="text" value={activePetugas} onChange={(e)=>setActivePetugas(e.target.value)} placeholder="Ketik nama..." className="w-full p-2 border rounded shadow-inner" />
              </div>

              <h2 className="font-bold text-gray-700">Jadwal Tugas Hari Ini:</h2>
              {filteredSchedules.map((s, i) => (
                <div key={i} className="bg-white p-4 rounded-xl shadow border-l-4 border-emerald-500">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-lg leading-tight">{s["To do List"]}</p>
                      <p className="text-sm text-gray-500 font-semibold">{s["Jam/Rentang Jam"]}</p>
                    </div>
                  </div>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, s)} className="mt-3 text-xs w-full" disabled={uploading} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
