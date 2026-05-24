import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyClOLODD-nU_GG1DrvJay8jFQ6KmjmP29I',
  authDomain: 'kurdish-app-ea16a.firebaseapp.com',
  projectId: 'kurdish-app-ea16a',
  storageBucket: 'kurdish-app-ea16a.firebasestorage.app',
  messagingSenderId: '374195140322',
  appId: '1:374195140322:web:efe5243a53da63af6810bb',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
