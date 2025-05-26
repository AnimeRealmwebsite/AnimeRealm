// Your web app's Firebase configuration
const firebaseConfig = {
  // TODO: Replace with your Firebase config
  apiKey: "AIzaSyAl6fkchBhUYO1iuC41COTaLO2RrMh8Lyk",
  authDomain: "animerealm-chat.firebaseapp.com",
  projectId: "animerealm-chat",
  storageBucket: "animerealm-chat.firebasestorage.app",
  messagingSenderId: "58036383508",
  appId: "1:58036383508:web:f6e78653ab594158369c01",
  databaseURL: "https://animerealm-chat-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();