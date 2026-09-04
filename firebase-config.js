// Configuração do app Web do Firebase.
//
// Console do Firebase -> engrenagem -> Configurações do projeto -> aba Geral ->
// seção "Seus apps" -> app da Web -> "Configuração do SDK". Copie apiKey e appId
// de lá e cole abaixo. Os outros campos já vêm do projeto foco-estudos-f75ea.
//
// Estes valores não são segredos: eles vão embutidos em qualquer app Firebase
// que roda no navegador. Quem protege seus dados são as regras do Firestore,
// que só liberam users/{seu-uid} para você.
export const firebaseConfig = {
  apiKey: "AIzaSyCK-1qajnXRCUp-2remRw9wG6j0eob1un0",
  authDomain: "foco-estudos-f75ea.firebaseapp.com",
  projectId: "foco-estudos-f75ea",
  storageBucket: "foco-estudos-f75ea.firebasestorage.app",
  messagingSenderId: "371348266511",
  appId: "1:371348266511:web:6b71d93d33431fbd168d7a"
};
