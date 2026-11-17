import type { ChatErrorCode, Language } from "./types";

export interface UiStrings {
  appName: string;
  tagline: string;
  newChat: string;
  conversations: string;
  noConversations: string;
  storedLocally: string;
  deleteConversation: (title: string) => string;
  confirmDelete: string;
  showSidebar: string;
  hideSidebar: string;
  languageLabel: string;
  emptyTitle: string;
  emptyBody: string;
  examplesLabel: string;
  examples: string[];
  inputLabel: string;
  placeholder: string;
  send: string;
  stop: string;
  thinking: string;
  responding: string;
  you: string;
  coach: string;
  stopped: string;
  retry: string;
  charsLeft: (count: number) => string;
  disclaimer: string;
  loading: string;
  errors: Record<ChatErrorCode, string>;
}

const en: UiStrings = {
  appName: "Parent Coach",
  tagline: "Calm, practical support for everyday parenting",
  newChat: "New conversation",
  conversations: "Conversations",
  noConversations: "No saved conversations yet.",
  storedLocally:
    "Chats are saved only in this browser on this device. Clearing your browser data removes them.",
  deleteConversation: (title) => `Delete conversation: ${title}`,
  confirmDelete: "Delete this conversation? This cannot be undone.",
  showSidebar: "Show conversations",
  hideSidebar: "Hide conversations",
  languageLabel: "Reply language",
  emptyTitle: "What's on your mind today?",
  emptyBody:
    "Describe a parenting situation in English or Urdu. You'll get a short, practical plan to try.",
  examplesLabel: "Try an example",
  examples: [
    "My 3-year-old has huge tantrums every time we leave the park.",
    "Bedtime has turned into a nightly battle with my 6-year-old.",
    "How can I set screen-time limits without constant arguments?",
  ],
  inputLabel: "Describe your parenting concern",
  placeholder: "Type in English or Urdu…",
  send: "Send",
  stop: "Stop",
  thinking: "Coach is thinking…",
  responding: "The coach is responding.",
  you: "You",
  coach: "Coach",
  stopped: "Response stopped.",
  retry: "Try again",
  charsLeft: (count) => `${count} characters left`,
  disclaimer:
    "Parent Coach offers general guidance, not medical, mental health or legal advice. In an emergency, contact your local emergency services.",
  loading: "Loading…",
  errors: {
    invalid_request: "That message couldn't be sent. Please shorten it and try again.",
    payload_too_large: "That conversation is too long to send. Please start a new one.",
    rate_limited: "The coach is busy right now. Please wait a moment and try again.",
    daily_limit:
      "Today's message limit has been reached. Please try again tomorrow. In an emergency, contact your local emergency services.",
    timeout: "The response took too long. Please try again.",
    not_configured: "The coach isn't set up correctly on the server.",
    upstream_error: "The coach couldn't respond right now. Please try again.",
    network: "Couldn't reach the server. Check your connection and try again.",
    interrupted: "The response was interrupted and may be incomplete.",
  },
};

const ur: UiStrings = {
  appName: "پیرنٹنگ کوچ",
  tagline: "روزمرہ پرورش کے لیے پُرسکون اور عملی رہنمائی",
  newChat: "نئی گفتگو",
  conversations: "گفتگوئیں",
  noConversations: "ابھی تک کوئی محفوظ گفتگو نہیں۔",
  storedLocally:
    "گفتگو صرف اسی ڈیوائس کے اس براؤزر میں محفوظ ہوتی ہے۔ براؤزر کا ڈیٹا صاف کرنے سے یہ مٹ جائے گی۔",
  deleteConversation: (title) => `گفتگو حذف کریں: ${title}`,
  confirmDelete: "کیا آپ یہ گفتگو حذف کرنا چاہتے ہیں؟ اسے واپس نہیں لایا جا سکتا۔",
  showSidebar: "گفتگوئیں دکھائیں",
  hideSidebar: "گفتگوئیں چھپائیں",
  languageLabel: "جواب کی زبان",
  emptyTitle: "آج آپ کس بارے میں بات کرنا چاہیں گے؟",
  emptyBody:
    "اردو یا انگریزی میں بچوں کی پرورش سے متعلق کوئی صورتحال بیان کریں۔ آپ کو آزمانے کے لیے ایک مختصر اور عملی منصوبہ ملے گا۔",
  examplesLabel: "کوئی مثال آزمائیں",
  examples: [
    "میرا تین سال کا بیٹا پارک سے واپس آتے وقت بہت ضد اور رونا دھونا کرتا ہے۔",
    "میری چھ سالہ بیٹی ہر رات سونے کے وقت بہت تنگ کرتی ہے۔",
    "بچوں کا اسکرین ٹائم بغیر جھگڑے کے کیسے محدود کروں؟",
  ],
  inputLabel: "اپنی پریشانی بیان کریں",
  placeholder: "اردو یا انگریزی میں لکھیں…",
  send: "بھیجیں",
  stop: "روکیں",
  thinking: "کوچ سوچ رہا ہے…",
  responding: "کوچ جواب دے رہا ہے۔",
  you: "آپ",
  coach: "کوچ",
  stopped: "جواب روک دیا گیا۔",
  retry: "دوبارہ کوشش کریں",
  charsLeft: (count) => `${count} حروف باقی`,
  disclaimer:
    "پیرنٹنگ کوچ عمومی رہنمائی دیتا ہے، طبی، نفسیاتی یا قانونی مشورہ نہیں۔ ہنگامی صورتحال میں اپنی مقامی ایمرجنسی سروس سے رابطہ کریں۔",
  loading: "لوڈ ہو رہا ہے…",
  errors: {
    invalid_request: "یہ پیغام نہیں بھیجا جا سکا۔ براہِ کرم اسے مختصر کر کے دوبارہ کوشش کریں۔",
    payload_too_large: "یہ گفتگو بھیجنے کے لیے بہت لمبی ہے۔ براہِ کرم نئی گفتگو شروع کریں۔",
    rate_limited: "کوچ اس وقت مصروف ہے۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
    daily_limit:
      "آج کے پیغامات کی حد پوری ہو گئی ہے۔ براہِ کرم کل دوبارہ کوشش کریں۔ ہنگامی صورتحال میں اپنی مقامی ایمرجنسی سروس سے رابطہ کریں۔",
    timeout: "جواب میں بہت زیادہ وقت لگ گیا۔ دوبارہ کوشش کریں۔",
    not_configured: "سرور پر کوچ درست طریقے سے سیٹ اپ نہیں ہے۔",
    upstream_error: "کوچ اس وقت جواب نہیں دے سکا۔ دوبارہ کوشش کریں۔",
    network: "سرور سے رابطہ نہیں ہو سکا۔ اپنا انٹرنیٹ کنکشن چیک کر کے دوبارہ کوشش کریں۔",
    interrupted: "جواب درمیان میں رک گیا اور نامکمل ہو سکتا ہے۔",
  },
};

const STRINGS: Record<Language, UiStrings> = { en, ur };

export function getStrings(language: Language): UiStrings {
  return STRINGS[language];
}
