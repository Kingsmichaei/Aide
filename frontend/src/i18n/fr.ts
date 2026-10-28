import type { Messages } from "./en";

// Vous form throughout. French puts a space before : ? ! (a no-break space
// would be ideal; a normal space keeps the source readable).
export const fr: Messages = {
  nav: {
    label: "Acheteur",
    shop: "Acheter",
    settings: "Réglages",
    signOut: "Se déconnecter",
  },
  signIn: {
    pageTitle: "Aide – Connexion",
    heading: "Qui utilise Aide ?",
    demoNote:
      "Ceci est une démonstration. Choisissez une personne pour continuer. Il n'y a pas de mot de passe.",
    shopper: "Acheteur",
    caregiver: "Aidant",
    signInAs: (name) => `Se connecter en tant que ${name}`,
    failed: "Connexion impossible. Réessayez.",
    noUsers: "Personne pour l'instant. Lancez d'abord le script de données.",
  },
  shop: {
    pageTitle: "Aide – Acheter",
    heading: "Aide",
    intro:
      "Dites-moi ce qu'il vous faut. Je vous aide à le trouver et je vous lis le prix.",
    conversation: "Conversation",
    you: "Vous",
    aide: "Aide",
    thinking: "Aide réfléchit…",
    answerFailed: "Désolé, Aide n'a pas pu répondre. Réessayez.",
    checkFailed: "Désolé, nous n'avons pas pu vérifier la commande. Réessayez.",
    typeLabel: "Écrivez votre message",
    send: "Envoyer",
    talk: "Parler à Aide",
    stopListening: "Arrêter d'écouter",
    listening:
      "J'écoute… Appuyez à nouveau sur le bouton quand vous avez fini.",
    replay: "Réécouter",
    replaySlowly: "Réécouter lentement",
    stop: "Arrêter",
    chose: (title) => `Je choisis ${title}.`,
    nothingBought:
      "D'accord. Rien n'a été acheté. Que puis-je chercher pour vous ?",
    switchLanguage: (name) => `Utiliser ${name} à partir de maintenant`,
    priceChanged: (total) =>
      `Le prix a changé. Il est maintenant de ${total}. Vérifiez à nouveau, s'il vous plaît.`,
    retailerChanged: (retailer, total) =>
      `Le premier magasin ne le vend plus. ${retailer} l'a pour ${total}. Vérifiez à nouveau, s'il vous plaît.`,
    detailsChanged:
      "Quelque chose a changé. Vérifiez à nouveau la commande, s'il vous plaît.",
    unavailable: "Désolé, cet article n'est plus disponible.",
    paidHeading: "Payé",
    approvalHeading: "Envoyé à votre aidant pour accord",
    paid: (amount, title) =>
      `Vous avez payé ${amount} pour ${title}. C'est en route.`,
    needsApproval: (title, amount) =>
      `${title} coûte ${amount}. C'est au-dessus de votre limite, donc votre aidant va d'abord vérifier. Vous ne payez que s'il dit oui.`,
    shopAgain: "Acheter autre chose",
  },
  card: {
    options: "Choix",
    option: (n) => `Choix ${n}`,
    lowest: "Le prix le plus bas",
    sale: (was) => `En promotion. Avant ${was}`,
    from: (retailer) => `Chez ${retailer}`,
    choose: "Choisir",
  },
  confirm: {
    heading: "Vérifiez votre commande",
    item: "Article",
    store: "Magasin",
    price: "Prix",
    delivery: "Livraison",
    total: "Total",
    yes: "Oui, l'acheter",
    checking: "Vérification du prix…",
    no: "Non, pas celui-ci",
    readBack: (title, retailer, total) =>
      `${title}, chez ${retailer}. Le total, livraison comprise, est de ${total}.`,
    ask: "Je l'achète ?",
    hint: "Dites oui ou non, ou appuyez sur un bouton.",
    unclear: "Pardon, j'ai besoin d'un oui ou d'un non clair.",
    youSaid: (text) => `Vous avez dit : ${text}`,
  },
  paypal: {
    heading: (amount) => `Payer ${amount} avec PayPal`,
    instructions:
      "Appuyez sur le bouton PayPal. PayPal va s'ouvrir pour que vous puissiez vous connecter et accepter.",
    loading: "Chargement de PayPal…",
    unavailable:
      "PayPal n'est pas disponible pour le moment. Rien n'a été payé.",
    finishFailed:
      "PayPal a accepté, mais nous n'avons pas pu terminer. Réessayez.",
    closed: "Vous avez fermé PayPal. Rien n'a été payé.",
    problem: "PayPal a eu un problème. Rien n'a été payé.",
  },
  settings: {
    pageTitle: "Aide – Réglages",
    heading: "Réglages",
    language: "Langue",
    textSize: "Taille du texte",
    px: (size) => `${size} px`,
    voiceSpeed: "Vitesse de la voix",
    slow: "Lente",
    normal: "Normale",
    readAloud: "Lire à voix haute les réponses d'Aide",
    autoSend: "Envoyer mon message quand j'arrête de parler",
    on: "Oui",
    off: "Non",
    testVoice: "Essayer la voix",
    voiceSample: "Bonjour. Voici ma voix.",
    saved: "Enregistré.",
    saveFailed: "Impossible d'enregistrer. Réessayez.",
  },
  speech: {
    unsupported:
      "La parole n'est pas disponible dans ce navigateur. Vous pouvez écrire.",
    "not-allowed":
      "Je ne peux pas utiliser le micro. Autorisez-le dans votre navigateur, ou écrivez.",
    "no-speech":
      "Je n'ai rien entendu. Appuyez sur Parler à Aide et réessayez.",
    "no-mic": "Je ne trouve pas de micro. Vous pouvez écrire.",
    network:
      "Je ne peux pas vous entendre pour le moment. Écrivez, s'il vous plaît.",
    unknown: "Un problème est survenu avec le micro. Vous pouvez écrire.",
  },
  readout: {
    option: (n, title, price) => `Choix ${n} : ${title}, ${price}.`,
    lowest: "C'est le prix le plus bas.",
    sale: (was) => `Il est en promotion. Avant, il coûtait ${was}.`,
    store: (retailer) => `Il est vendu par ${retailer}.`,
  },
};
