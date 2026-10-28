// The shopper app's words. en is the source of truth: the other languages must
// have exactly the same keys (TypeScript checks this through `Messages`).
// Keep sentences short and plain, at about a 6th-grade reading level.

export const en = {
  nav: {
    label: "Shopper",
    shop: "Shop",
    settings: "Settings",
    signOut: "Sign out",
  },
  signIn: {
    pageTitle: "Aide – Sign in",
    heading: "Who is using Aide?",
    demoNote:
      "This is a demo. Choose a person to continue. There are no passwords.",
    shopper: "Shopper",
    caregiver: "Caregiver",
    signInAs: (name: string) => `Sign in as ${name}`,
    failed: "Could not sign in. Please try again.",
    noUsers: "No people yet. Run the seed script first.",
  },
  shop: {
    pageTitle: "Aide – Shop",
    heading: "Aide",
    intro:
      "Tell me what you need. I will help you find it and read you the price.",
    conversation: "Conversation",
    you: "You",
    aide: "Aide",
    thinking: "Aide is thinking…",
    answerFailed: "Sorry, Aide could not answer. Please try again.",
    checkFailed: "Sorry, we could not check the order. Please try again.",
    typeLabel: "Type your message",
    send: "Send",
    talk: "Talk to Aide",
    stopListening: "Stop listening",
    listening: "Listening… Press the button again when you are done.",
    replay: "Replay",
    replaySlowly: "Replay slowly",
    stop: "Stop",
    chose: (title: string) => `I choose ${title}.`,
    nothingBought: "Okay. Nothing was bought. What else can I help you find?",
    switchLanguage: (name: string) => `Use ${name} from now on`,
    priceChanged: (total: string) =>
      `The price changed. It is now ${total}. Please check again.`,
    retailerChanged: (retailer: string, total: string) =>
      `The first store stopped selling it. ${retailer} has it for ${total}. Please check again.`,
    detailsChanged: "Something changed. Please check the order again.",
    unavailable: "Sorry, this item is not available any more.",
    paidHeading: "Paid",
    approvalHeading: "Sent to your caregiver for approval",
    paid: (amount: string, title: string) =>
      `You paid ${amount} for ${title}. It is on its way.`,
    needsApproval: (title: string, amount: string) =>
      `${title} costs ${amount}. That is over your limit, so your caregiver will check it first. You only pay if they say yes.`,
    shopAgain: "Shop for something else",
  },
  card: {
    options: "Options",
    option: (n: number) => `Option ${n}`,
    lowest: "Lowest price here",
    sale: (was: string) => `On sale. Was ${was}`,
    from: (retailer: string) => `From ${retailer}`,
    choose: "Choose this",
  },
  confirm: {
    heading: "Check your order",
    item: "Item",
    store: "Store",
    price: "Price",
    delivery: "Delivery",
    total: "Total",
    yes: "Yes, buy it",
    checking: "Checking the price…",
    no: "No, not this one",
    readBack: (title: string, retailer: string, total: string) =>
      `${title}, from ${retailer}. The total, with delivery, is ${total}.`,
    ask: "Shall I buy it?",
    hint: "Say yes or no, or press a button.",
    unclear: "Sorry, I need a clear yes or no.",
    youSaid: (text: string) => `You said: ${text}`,
  },
  paypal: {
    heading: (amount: string) => `Pay ${amount} with PayPal`,
    instructions:
      "Press the PayPal button. PayPal will open so you can log in and approve.",
    loading: "Loading PayPal…",
    unavailable: "PayPal is not available right now. Nothing was paid.",
    finishFailed: "PayPal approved, but we could not finish. Please try again.",
    closed: "You closed PayPal. Nothing was paid.",
    problem: "PayPal had a problem. Nothing was paid.",
  },
  settings: {
    pageTitle: "Aide – Settings",
    heading: "Settings",
    language: "Language",
    textSize: "Text size",
    px: (size: number) => `${size} px`,
    voiceSpeed: "Voice speed",
    slow: "Slow",
    normal: "Normal",
    readAloud: "Read Aide's replies aloud",
    autoSend: "Send my message when I stop speaking",
    on: "On",
    off: "Off",
    testVoice: "Test voice",
    voiceSample: "Hello. This is how I will sound.",
    saved: "Saved.",
    saveFailed: "Could not save. Please try again.",
  },
  speech: {
    unsupported: "Talking is not available in this browser. You can type.",
    "not-allowed":
      "I can't use the microphone. Please allow it in your browser, or type instead.",
    "no-speech": "I didn't hear anything. Press Talk to Aide and try again.",
    "no-mic": "I can't find a microphone. You can type instead.",
    network: "I can't hear you right now. Please type instead.",
    unknown: "Something went wrong with the microphone. You can type instead.",
  },
  readout: {
    option: (n: number, title: string, price: string) =>
      `Option ${n}: ${title}, ${price}.`,
    lowest: "It is the lowest price here.",
    sale: (was: string) => `It is on sale. It was ${was}.`,
    store: (retailer: string) => `It is sold by ${retailer}.`,
  },
};

export type Messages = typeof en;
