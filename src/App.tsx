// CATATAN: Ganti bagian CONFIG di bawah dengan data yang Anda miliki!
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, getDocs, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';

// 1. MASUKKAN FIREBASE CONFIG ANDA DI SINI
const firebaseConfig = {
  apiKey: "AIzaSyBxdRzIlg5YhocDDCK15pD2WwhJ9P2McF4",
  authDomain: "elist-csat.firebaseapp.com",
  projectId: "elist-csat",
  storageBucket: "elist-csat.firebasestorage.app",
  messagingSenderId: "385554100266",
  appId: "1:385554100266:web:a30fa180093f220c295353"
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
    reader.onload = (evt: any) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
      
      // Simpan ke Firebase
      data.forEach(async (row: any) => {
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
  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      
      try {
        // URL GOOGLE APPS SCRIPT ANDA
        const response = await fetch('https://script.google.com/macros/s/AKfycbwLBv-k9ZyXT75Kj-qH6FMFvY5xW1m972ccDTiLN33c2gaFakzh8AZyOfdkXzSO2eP3/exec', {
          method: 'POST',
          body: JSON.stringify({
            base64: base64,
            type: file.type,
            name: `${new Date().getTime()}_${file.name}`
          })
        });

        const result = await response.json();
        if (result.result === 'success') {
          // Simpan link foto ke Firebase agar Admin bisa lihat
          await addDoc(collection(db, "logs"), {
            petugas: "Nama Petugas",
            fotoUrl: result.url,
            waktu: new Date().toLocaleString('id-ID'),
            timestamp: new Date()
          });
          alert("Foto Berhasil Terupload!");
        }
      } catch (error) {
        console.error(error);
        alert("Gagal Upload Foto");
      } finally {
        setUploading(false);
      }
    };
  };

  return (
    <div className="p-5 font-sans max-w-lg mx-auto">
      <h1 className="text-2xl font-bold border-b pb-2 mb-6">Monitoring CS & SATPAM</h1>
      
      {!role ? (
        <div className="flex flex-col gap-4">
          <button onClick={() => setRole('admin')} className="p-4 bg-blue-600 text-white rounded-lg font-bold shadow-md">Masuk Sebagai Admin</button>
          <button onClick={() => setRole('petugas')} className="p-4 bg-green-600 text-white rounded-lg font-bold shadow-md">Masuk Sebagai Petugas</button>
        </div>
      ) : (
        <div>
          <button onClick={() => setRole(null)} className="mb-6 text-sm text-gray-500 underline font-semibold"> Kembali ke Menu Utama</button>
          
          {role === 'admin' ? (
            <div className="bg-gray-100 p-6 rounded-xl border border-gray-200">
              <h2 className="font-bold text-lg mb-4 text-blue-800">Panel Admin (Pengawas)</h2>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Jadwal (File Excel):</label>
              <input type="file" onChange={handleExcelUpload} accept=".xlsx, .xls" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
          ) : (
            <div className="bg-green-50 p-6 rounded-xl border border-green-200">
              <h2 className="font-bold text-lg mb-4 text-green-800">Panel Petugas (CS / SATPAM)</h2>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <p className="font-bold text-gray-800 mb-1">Ambil Foto Pekerjaan:</p>
                <p className="text-xs text-gray-500 mb-4 italic text-balance">Klik tombol di bawah untuk mengambil foto bukti pekerjaan saat ini.</p>
                
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="block w-full text-sm text-gray-500" 
                />
                
                {uploading && (
                  <div className="mt-4 flex items-center gap-2 text-blue-600">
                    <span className="animate-spin text-xl">↻</span>
                    <span className="text-sm font-semibold italic">Sedang mengirim foto ke Drive...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
