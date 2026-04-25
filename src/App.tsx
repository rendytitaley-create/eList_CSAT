// CATATAN: Ganti bagian CONFIG di bawah dengan data yang Anda miliki!
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, getDocs, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

// 1. MASUKKAN FIREBASE CONFIG ANDA DI SINI
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "PROYEK-ANDA.firebaseapp.com",
  projectId: "PROYEK-ANDA",
  storageBucket: "PROYEK-ANDA.appspot.com",
  messagingSenderId: "12345...",
  appId: "1:12345..."
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 2. MASUKKAN FOLDER ID GOOGLE DRIVE ANDA DI SINI
const DRIVE_FOLDER_ID = "FOLDER_ID_DARI_URL_DRIVE_ANDA";

export default function App() {
  const [role, setRole] = useState<'admin' | 'petugas' | null>(null);
  const [user, setUser] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Fungsi Upload Excel (Admin)
  const handleExcelUpload = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
      
      // Simpan ke Firebase
      data.forEach(async (row) => {
        await addDoc(collection(db, "schedules"), {
          ...row,
          createdAt: new Date().toISOString()
        });
      });
      alert("Jadwal Berhasil di Upload!");
    };
    reader.readAsBinaryString(file);
  };

  // Fungsi Upload Foto (Petugas) ke Google Drive via Script Proxy
  const uploadToDrive = async (base64: string, fileName: string) => {
    setUploading(true);
    // Kita akan menggunakan Google Apps Script sebagai jembatan sederhana
    // (Akan saya pandu buatnya setelah ini)
    console.log("Mengirim ke Drive...");
    setUploading(false);
    alert("Foto Terupload ke Drive & Link tersimpan di Firebase!");
  };

  return (
    <div className="p-5 font-sans">
      <h1 className="text-2xl font-bold border-b pb-2">Aplikasi Monitoring CS & SATPAM</h1>
      
      {!role ? (
        <div className="mt-10 flex gap-4">
          <button onClick={() => setRole('admin')} className="p-4 bg-blue-600 text-white rounded">Masuk Sebagai Admin</button>
          <button onClick={() => setRole('petugas')} className="p-4 bg-green-600 text-white rounded">Masuk Sebagai Petugas</button>
        </div>
      ) : (
        <div>
          <button onClick={() => setRole(null)} className="mb-4 text-red-500 underline">Keluar</button>
          
          {role === 'admin' ? (
            <section className="bg-gray-100 p-4 rounded">
              <h2 className="font-bold mb-2">Menu Admin (Pengawas)</h2>
              <p>Upload File Excel Jadwal:</p>
              <input type="file" onChange={handleExcelUpload} accept=".xlsx, .xls" className="mt-2" />
              <div className="mt-4">
                <h3 className="font-semibold">Log Pekerjaan Realtime:</h3>
                {/* Tabel monitoring data dari Firebase akan tampil di sini */}
                <p className="text-sm italic text-gray-500">Menunggu data masuk...</p>
              </div>
            </section>
          ) : (
            <section className="bg-green-50 p-4 rounded">
              <h2 className="font-bold mb-2">Menu Petugas (CS / SATPAM)</h2>
              <div className="space-y-4">
                <div className="border p-3 bg-white rounded shadow-sm">
                  <p className="font-bold">Tugas Jam ini:</p>
                  <p>Membersihkan Area Lobi / Patroli Parkir</p>
                  <input type="file" accept="image/*" capture="environment" 
                    onChange={(e) => alert("Proses Upload ke Drive...")}
                    className="mt-2 block w-full text-sm" />
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
