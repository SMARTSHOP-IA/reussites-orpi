// Configuration de l'outil.
// Projet Firebase partagé des outils Smartshop (comme « Étude des commandes »).
// Ajouter ?demo=1 à l'adresse pour le mode démo (données dans le navigateur, rien n'est envoyé).
export const FIREBASE = {
  apiKey: 'AIzaSyDSb3lmftpgG-fRvlkl7YHhTiwA_veN1Ck',
  authDomain: 'smartshop-catalogues.firebaseapp.com',
  projectId: 'smartshop-catalogues',
  storageBucket: 'smartshop-catalogues.firebasestorage.app',
  messagingSenderId: '161620663653',
  appId: '1:161620663653:web:8a89f06f89597b57d9d58c',
};

// Collections Firestore de l'outil (préfixées pour cohabiter avec les autres outils du projet).
export const COLL = { editions: 'reussites_editions', formulaires: 'reussites_formulaires', acces: 'reussites_acces' };

// Toute personne connectée avec un compte Google de ce domaine fait partie de l'équipe (modification).
export const DOMAINE_EQUIPE = 'smartshop.fr';

// Édition affichée par défaut.
export const EDITION_PAR_DEFAUT = '2026';

export const MODE = (!FIREBASE.apiKey || new URLSearchParams(location.search).has('demo')) ? 'demo' : 'firebase';
