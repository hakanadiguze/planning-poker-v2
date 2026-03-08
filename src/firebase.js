import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCe_dC3LAtGCBFW8CQh1s8eAHncOid4jbs",
  authDomain: "planning-poker-9bb67.firebaseapp.com",
  databaseURL: "https://planning-poker-9bb67-default-rtdb.firebaseio.com",
  projectId: "planning-poker-9bb67",
  storageBucket: "planning-poker-9bb67.firebasestorage.app",
  messagingSenderId: "208415095607",
  appId: "1:208415095607:web:8b584c2d1f1292f07db8b2"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
