import type { Messages } from "./en";

// Vous, warm and direct. French puts a space before : ? ! ; and inside « ».
export const fr: Messages = {
  nav: {
    label: "Principal",
    shop: "Acheter",
    watches: "Alertes",
    orders: "Commandes",
    planner: "Agenda",
    settings: "Réglages",
    account: "Compte",
    signOut: "Se déconnecter",
  },
  signIn: {
    pageTitle: "Connexion – Aide",
    heading: "Bienvenue sur Aide",
    tagline:
      "Votre assistant d'achat. Il trouve, surveille le prix et achète avec PayPal quand vous dites oui.",
    choose: "Choisissez un compte de démonstration",
    demoNote: "C'est une démonstration : il n'y a pas de mot de passe.",
    signInAs: (name) => `Continuer en tant que ${name}`,
    failed: "Connexion impossible. Réessayez.",
    loadFailed: "Impossible de charger les comptes de démonstration.",
    retry: "Réessayer",
    noUsers:
      "Aucun compte pour l'instant. Lancez d'abord le script de données.",
  },
  shop: {
    pageTitle: "Acheter – Aide",
    greeting: (name) => `Bonjour ${name}, que cherchez-vous ?`,
    intro:
      "Décrivez ce qu'il vous faut avec vos mots. Je compare les offres de milliers de boutiques et j'achète avec PayPal quand vous dites oui.",
    suggestionsLabel: "Essayez de demander",
    suggestions: [
      "Un casque à moins de 200 $ pour l'avion",
      "Un cadeau pour ma sœur qui adore cuisiner",
      "Des chaussures de course comme mes anciennes Pegasus",
    ],
    conversation: "Conversation",
    you: "Vous",
    aide: "Aide",
    thinking: "Aide cherche…",
    answerFailed: "Aide n'a pas pu répondre. Réessayez.",
    retry: "Réessayer",
    composerLabel: "Écrire à Aide",
    placeholder: "Demandez ce que vous voulez…",
    send: "Envoyer",
    speak: "Parler",
    stopListening: "Arrêter l'écoute",
    listening: "J'écoute…",
    play: "Écouter",
    stop: "Arrêter",
    chose: (title) => `Je prends ${title}.`,
    nothingBought:
      "Pas de souci, rien n'a été acheté. Que puis-je chercher pour vous ?",
    switchLanguage: (name) => `Utiliser ${name} désormais`,
    newChat: "Nouvelle conversation",
  },
  card: {
    options: "Choix",
    lowest: "Le prix le plus bas",
    sale: (was) => `En promotion, avant ${was}`,
    from: (retailer) => `Vendu par ${retailer}`,
    buy: "Acheter",
    buyLabel: (title) => `Acheter ${title}`,
    watch: "Surveiller le prix",
    comingSoon: "Bientôt disponible",
    noImage: "Pas d'image",
  },
  checkout: {
    title: "Paiement",
    description: "Vérifiez les détails, puis payez avec PayPal.",
    item: "Article",
    store: "Boutique",
    price: "Prix",
    delivery: "Livraison",
    included: "Incluse",
    total: "Total",
    buy: (amount) => `Acheter pour ${amount}`,
    buyAnyway: (amount) => `Acheter quand même pour ${amount}`,
    checking: "Vérification du prix…",
    notNow: "Pas maintenant",
    warningsTitle: "Avant d'acheter",
    askAbove: (amount) =>
      `C'est au-dessus de votre seuil « demandez-moi d'abord » de ${amount}.`,
    overBudget: (amount) =>
      `Vous dépasseriez votre budget mensuel de ${amount}.`,
    otherCurrency: (currency) =>
      `Le prix est en ${currency} : il ne peut pas être comparé à vos règles de dépense.`,
    priceChanged: (total) =>
      `Le prix est passé à ${total}. Vérifiez à nouveau.`,
    retailerChanged: (retailer, total) =>
      `La première boutique est en rupture. ${retailer} le propose à ${total}.`,
    detailsChanged: "Quelque chose a changé. Vérifiez à nouveau la commande.",
    unavailable: "Désolé, cet article n'est plus disponible.",
    checkFailed: "Impossible de vérifier la commande. Réessayez.",
    payTitle: "Payer avec PayPal",
    payHint:
      "PayPal s'ouvre dans une nouvelle fenêtre. Rien n'est débité avant votre accord.",
    loadingPaypal: "Chargement de PayPal…",
    paypalUnavailable:
      "PayPal n'est pas disponible pour le moment. Rien n'a été débité.",
    finishFailed:
      "PayPal a accepté, mais nous n'avons pas pu terminer. Réessayez.",
    closed: "Vous avez fermé PayPal. Rien n'a été débité.",
    problem: "PayPal a rencontré un problème. Rien n'a été débité.",
    voiceHint: "Ou dites « oui » pour acheter.",
    sayYes: "Dire oui",
    heard: (text) => `Vous avez dit « ${text} »`,
    unclear: "Pardon, j'ai besoin d'un oui ou d'un non clair.",
    readBack: (title, retailer, total) =>
      `${title}, chez ${retailer}. ${total} au total, livraison incluse.`,
    ask: "Je l'achète ?",
  },
  success: {
    title: "Commande passée",
    body: (title, retailer) =>
      `Votre ${title} de chez ${retailer} est payé et en route.`,
    spoken: (amount, title) =>
      `C'est fait. Vous avez payé ${amount} pour ${title}.`,
    totalPaid: "Total payé",
    order: "Commande",
    paidWith: "Payé avec",
    keepShopping: "Continuer les achats",
    viewOrders: "Voir les commandes",
  },
  empty: {
    watchesTitle: "Vos alertes de prix apparaîtront ici",
    watchesBody:
      "Demandez à Aide de surveiller un produit : il préparera le paiement quand le prix atteindra votre objectif.",
    ordersTitle: "Vos commandes apparaîtront ici",
    ordersBody:
      "Tout ce que vous achetez avec Aide, avec reçus et remboursements, au même endroit.",
    plannerTitle: "Votre agenda apparaîtra ici",
    plannerBody:
      "Livraisons, échéances des alertes et dates importantes, dans un seul calendrier.",
    startShopping: "Commencer mes achats",
  },
  settings: {
    pageTitle: "Réglages – Aide",
    heading: "Réglages",
    description: "Votre profil, vos règles de dépense et l'apparence d'Aide.",
    tabs: {
      profile: "Profil",
      rules: "Règles de dépense",
      appearance: "Apparence",
    },
    profileTitle: "Profil",
    profileDescription:
      "Comment Aide vous appelle, et la langue et la devise qu'il utilise.",
    name: "Nom",
    email: "E-mail",
    emailHelp: "Utilisé pour les reçus. Jamais partagé.",
    language: "Langue",
    languageHelp: "Aide répond et parle dans cette langue.",
    currency: "Devise",
    currencyHelp:
      "Votre budget et votre seuil « demandez-moi d'abord » utilisent cette devise.",
    rulesTitle: "Règles de dépense",
    rulesDescription:
      "Aide vous prévient avant qu'un achat n'enfreigne une règle et vous demande un oui supplémentaire.",
    monthlyBudget: "Budget mensuel",
    monthlyBudgetHelp: "Laissez vide pour ne pas avoir de budget.",
    askAbove: "Me demander d'abord au-dessus de",
    askAboveHelp:
      "Tout achat au-dessus de ce montant demande une confirmation de plus. Laissez vide pour désactiver.",
    blocked: "Catégories bloquées",
    blockedHelp:
      "Les produits de ces catégories n'apparaissent jamais dans vos résultats.",
    findCategory: "Trouver une catégorie",
    findCategoryPlaceholder: "Par exemple : alcool",
    noneBlocked: "Rien n'est bloqué.",
    block: (title) => `Bloquer ${title}`,
    unblock: (title) => `Débloquer ${title}`,
    noMatches: "Aucune catégorie correspondante.",
    appearanceTitle: "Apparence",
    appearanceDescription: "Choisissez un thème, ou suivez votre appareil.",
    theme: "Thème",
    light: "Clair",
    dark: "Sombre",
    system: "Système",
    voiceTitle: "Voix",
    voiceDescription:
      "Parler à Aide est facultatif. Écrire fonctionne toujours.",
    readAloud: "Lire les réponses à voix haute",
    readAloudHelp: "Aide prononce chaque réponse en plus de l'afficher.",
    autoSend: "Envoyer quand j'arrête de parler",
    autoSendHelp:
      "Sinon, vos mots attendent dans le champ pour que vous les vérifiiez.",
    voiceSpeed: "Vitesse de la voix",
    slow: "Lente",
    normal: "Normale",
    testVoice: "Essayer la voix",
    voiceSample: "Bonjour, je suis Aide. Voici ma voix.",
    save: "Enregistrer",
    saving: "Enregistrement…",
    saved: "Enregistré",
    saveFailed: "Impossible d'enregistrer. Réessayez.",
    required: "Obligatoire.",
    invalidEmail: "Saisissez un e-mail comme nom@exemple.com.",
    invalidMoney: "Saisissez un montant comme 150 ou 149,99.",
    positive: "Saisissez un montant supérieur à 0.",
    unknownCategories: (slugs) => `Ces catégories n'existent plus : ${slugs}.`,
  },
  speech: {
    unsupported:
      "La voix n'est pas disponible dans ce navigateur. Vous pouvez écrire.",
    "not-allowed":
      "Aide ne peut pas utiliser le micro. Autorisez-le dans votre navigateur, ou écrivez.",
    "no-speech": "Aide n'a rien entendu. Appuyez sur le micro et réessayez.",
    "no-mic": "Aucun micro trouvé. Vous pouvez écrire.",
    network:
      "La voix ne fonctionne pas pour le moment. Écrivez, s'il vous plaît.",
    unknown: "Un problème est survenu avec le micro. Vous pouvez écrire.",
  },
  readout: {
    option: (n, title, price) => `Choix ${n} : ${title}, ${price}.`,
    lowest: "C'est le prix le plus bas.",
    sale: (was) => `Il est en promotion ; avant, il coûtait ${was}.`,
    store: (retailer) => `Il est vendu par ${retailer}.`,
  },
};
