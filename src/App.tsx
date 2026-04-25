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
  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      
      try {
        // GANTI URL DI BAWAH INI DENGAN WEB APP URL DARI GOOGLE APPS SCRIPT
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
            petugas: "Nama Petugas", // Nanti bisa dibuat input nama
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
