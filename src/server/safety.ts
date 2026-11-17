/**
 * Lightweight, deterministic risk screening for the latest parent message.
 *
 * This is one layer of several (system prompt, request validation, this
 * screen). It deliberately favours caution and is NOT a complete or reliable
 * detector: phrasing it does not anticipate will be missed, and some ordinary
 * messages will be flagged. It looks at English, Urdu script and Roman Urdu.
 *
 * - `emergency`: clear signs of imminent danger. The server answers with a
 *   fixed safety message and does not call the model at all.
 * - `elevated`: a sensitive topic (abuse, self-harm, medical, medication,
 *   diagnosis, legal). The model is called with an extra safety reminder.
 * - `none`: an everyday concern.
 */
import type { Language } from "@/lib/types";

export type RiskLevel = "none" | "elevated" | "emergency";

export type RiskCategory =
  | "danger" // someone may be about to be hurt, or a child is missing
  | "self_harm"
  | "medical"
  | "abuse"
  | "professional"; // medication, diagnosis or legal questions

export interface RiskAssessment {
  level: RiskLevel;
  categories: RiskCategory[];
}

interface Rule {
  category: RiskCategory;
  pattern: RegExp;
}

/** Lower-cases and normalises Urdu/Arabic letter variants so patterns stay simple. */
export function normalizeForMatching(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "") // Arabic diacritics (zabar, zer, pesh, …)
    .replace(/[​-‏⁠﻿]/g, "") // zero-width characters and direction marks
    .replace(/[يى]/g, "ی") // Arabic yeh → Farsi/Urdu yeh
    .replace(/ك/g, "ک") // Arabic kaf → keheh
    .replace(/ه/g, "ہ") // Arabic heh → heh goal
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ");
}

const SELF = "(?:myself|himself|herself|themselves|themself|yourself)";
const FAMILY =
  "(?:baby|child|children|kid|kids|son|daughter|toddler|newborn|infant|husband|wife|partner)";

// --- Imminent danger: answered with a fixed safety message -----------------

const EMERGENCY_RULES: Rule[] = [
  // Self-harm / suicide — English
  { category: "self_harm", pattern: new RegExp(`\\b(?:kill|killing|hang|hanging|shoot|shooting) ${SELF}\\b`) },
  { category: "self_harm", pattern: new RegExp(`\\b(?:going|about|planning|want|wants|wanted|trying) to (?:kill|hurt|harm|cut|hang) ${SELF}\\b`) },
  { category: "self_harm", pattern: /\b(?:end|ending|take|taking) (?:my|his|her|their) (?:own )?life\b/ },
  { category: "self_harm", pattern: /\b(?:commit|committing|attempt|attempted|attempting) suicide\b|\bsuicidal\b|\bsuicide (?:plan|note|attempt)\b/ },
  { category: "self_harm", pattern: /\b(?:want|wants|wanna|wanted) to die\b|\bbetter off dead\b|\b(?:don't|do not|doesn't|does not) want to (?:live|be alive)\b/ },
  // Self-harm / suicide — Urdu
  { category: "self_harm", pattern: /خود ?کشی (?:کر|کی کوشش|کا (?:سوچ|ارادہ))/ },
  { category: "self_harm", pattern: /(?:مرنا|مر جانا|مرجانا) چاہ(?:تا|تی|تے)/ },
  { category: "self_harm", pattern: /اپنی جان (?:لے|لینا|لینے|دے|دینا|دینے)/ },
  { category: "self_harm", pattern: /خود کو (?:مار|ختم کر)/ },
  { category: "self_harm", pattern: /جینا نہیں چاہ(?:تا|تی|تے)/ },
  // Self-harm / suicide — Roman Urdu
  { category: "self_harm", pattern: /\bkhud ?k[ua]shi (?:kar|karna|karne|karlun|ki koshish)/ },
  { category: "self_harm", pattern: /\b(?:marna|mar jana|marjana) chah?t[aie]\b/ },
  { category: "self_harm", pattern: /\bapni jaa?n (?:le|lena|lene|de|dena|dene)\b/ },
  { category: "self_harm", pattern: /\bkhud ko (?:maa?r|khatam)\b/ },
  { category: "self_harm", pattern: /\bjee?na nahi?n? chah?t[aie]\b/ },

  // Medical emergencies — English
  { category: "medical", pattern: /\b(?:not|isn't|stopped|can't|cannot|struggling to|trouble|difficulty) breath(?:e|ing)\b/ },
  { category: "medical", pattern: /\b(?:turning|turned|going) blue\b|\bunconscious\b|\bunresponsive\b/ },
  { category: "medical", pattern: /\bhaving a seizure\b|\bis seizing\b|\bconvulsing\b/ },
  { category: "medical", pattern: /\b(?:swallowed|drank|ate|ingested) (?:some |a |an |the |his |her |my |their )?(?:bleach|poison|rat poison|detergent|pills|tablets|battery|batteries|button battery|chemicals?|cleaning products?|laundry pods?)\b/ },
  { category: "medical", pattern: /\boverdos(?:e|ed|ing)\b|\bpoisoned\b/ },
  { category: "medical", pattern: /\bbleeding (?:heavily|badly|a lot)\b|\b(?:won't|will not) stop bleeding\b/ },
  { category: "medical", pattern: /\b(?:is|are|he's|she's|baby's|they're) choking\b(?! back| up)/ },
  { category: "medical", pattern: /\banaphyla\w*|\bsevere allergic reaction\b/ },
  // Medical emergencies — Urdu
  { category: "medical", pattern: /سانس (?:نہیں لے|نہیں آ|رک|بند ہو)/ },
  { category: "medical", pattern: /بے ?ہوش/ },
  { category: "medical", pattern: /(?:زہر|بلیچ|گولیاں|گولیوں|بیٹری|تیزاب|کیمیکل) (?:کھا|پی|نگل)/ },
  { category: "medical", pattern: /(?:دورہ|دورے|جھٹکے) (?:پڑ رہا|پڑ رہے|لگ رہے|پڑا ہے)/ },
  { category: "medical", pattern: /خون (?:بہہ رہا|نہیں رک|بند نہیں)/ },
  { category: "medical", pattern: /گلے میں (?:کچھ )?(?:پھنس|اٹک)/ },
  // Medical emergencies — Roman Urdu
  { category: "medical", pattern: /\bsaa?ns (?:nahi|nahin) (?:le|aa?)\b|\bsaa?ns ruk/ },
  { category: "medical", pattern: /\bbe ?hosh\b/ },
  { category: "medical", pattern: /\b(?:zehe?r|zaher|bleach|goliy?aa?n|battery|tezaa?b|chemical) (?:kha|pi|pee|nigal)/ },
  { category: "medical", pattern: /\b(?:dora|daura|dorey|jhatke) (?:par|pad|lag) (?:raha|rahe)\b/ },
  { category: "medical", pattern: /\bkhoo?n (?:nahi|nahin) ruk/ },

  // Danger to a child or another person — English
  { category: "danger", pattern: /\b(?:i'll|i will|i'm going to|i am going to|i'm gonna|about to) (?:kill|hurt|harm|strangle|smother|drown)\b/ },
  { category: "danger", pattern: /\b(?:he|she|they)(?:'s| is|'re| are) (?:going to|gonna|about to|threatening to) (?:kill|hurt|harm)\b/ },
  { category: "danger", pattern: /\bthreaten\w* (?:to )?(?:kill|hurt|harm|stab|shoot)\b|\b(?:pointing|pulled|waving) a (?:knife|gun)\b/ },
  { category: "danger", pattern: /\b(?:is|are|he's|she's|they're) (?:beating|choking|strangling|attacking) (?:me|us|my|our|the|him|her)\b/ },
  { category: "danger", pattern: new RegExp(`\\b(?:my|our) ${FAMILY} (?:is|has gone|went) missing\\b|\\bcan't find (?:my|our) ${FAMILY}\\b(?!')|\\bkidnapp?(?:ed|ing)\\b`) },
  { category: "danger", pattern: /\b(?:is|are|he's|she's|they're|been) (?:sexually abusing|molesting|raping)\b|\braped\b/ },
  // Danger — Urdu
  { category: "danger", pattern: /جان سے مار|مار ڈال(?:وں|ے|یں|نا|نے|ا)/ },
  { category: "danger", pattern: /(?:چاقو|چھری|بندوق|پستول) (?:سے|لے کر|دکھا کر) (?:دھمک|مار|حملہ)/ },
  { category: "danger", pattern: /(?:بچہ|بچی|بیٹا|بیٹی|بچے) (?:لاپتہ|گم|غائب) ہو (?:گیا|گئی|گئے)|اغوا/ },
  // Danger — Roman Urdu
  { category: "danger", pattern: /\bjaa?n se maa?r|\bmaa?r (?:dalun|daloon|dalunga|dalungi|dalega|dalegi|dalenge|dala)\b/ },
  { category: "danger", pattern: /\b(?:bacha|bachi|bachay|beta|beti) (?:gum|lapata|laapata|ghayab|ghaib) ho (?:gaya|gayi|gai|gaye)\b|\bagh?wa\b/ },
];

// --- Sensitive topics: the model is called with an extra safety reminder ---

const ELEVATED_RULES: Rule[] = [
  { category: "self_harm", pattern: /\bsuicid\w*|\bself[- ]?harm\w*|\bcutting (?:my|him|her|them)sel\w*|\bcuts on (?:his|her|their) (?:arms?|wrists?|legs?|thighs?)\b|\bhopeless\b|\bno reason to live\b/ },
  { category: "self_harm", pattern: new RegExp(`\\b(?:hurt|hurting|hurts|harm|harming) ${SELF}\\b`) },
  { category: "self_harm", pattern: /خود ?کشی|خود کو (?:نقصان|زخمی|کاٹ)|نا ?امید/ },
  { category: "self_harm", pattern: /\bkhud ?k[ua]shi\b|\bkhud ko (?:nuqsa?a?n|zakhmi|kaat)/ },

  { category: "danger", pattern: new RegExp(`\\b(?:might|could|scared i'll|afraid i'll|want to|wanna|feel like i could) (?:hurt|harm|kill|shake|hit) (?:my|the|our) ${FAMILY}\\b`) },
  { category: "danger", pattern: /\bshak(?:e|ing) (?:the|my|our) baby\b|\blose control\b|\blosing control\b/ },
  { category: "danger", pattern: /(?:نقصان|تکلیف) پہنچا (?:دوں|سکتی|سکتا|بیٹھوں)/ },
  { category: "danger", pattern: /\bnuqsa?a?n (?:pohancha|pahuncha|puhancha)/ },

  { category: "abuse", pattern: /\babus(?:e|ed|es|ing|ive)\b|\bmolest\w*|\bsexual(?:ly)?\b|\binappropriate(?:ly)? touch\w*|\btouch\w* (?:him|her|them|my \w+) inappropriately\b/ },
  { category: "abuse", pattern: /\bgroom(?:ed|ing)\b|\bneglect\w*|\bexploit\w*|\bdomestic violence\b|\bbeats? (?:me|him|her|them|my)\b|\bbeaten\b|\bbruises?\b/ },
  { category: "abuse", pattern: /زیادتی|جنسی|بدسلوکی|تشدد|مار ?پیٹ|استحصال|غلط (?:طریقے|طرح) سے (?:چھو|ہاتھ)|(?:بہت|روز|بری طرح) مارت(?:ا|ی|ے)/ },
  { category: "abuse", pattern: /\b(?:zi?y?aa?dti|jinsi|badsulooki|tashaddu?d|maa?r ?pee?t|isteh?saa?l)\b|\bghalat (?:tareeqe|tarah) se (?:chhu|chu|haath)|\b(?:bohot|bahut|roz|buri tarah) maa?rt[aie]\b/ },

  { category: "medical", pattern: /\b(?:fever|seizures?|fainted|fainting|vomiting blood|blood in|head injury|hit (?:his|her|their) head|concussion|dehydrat\w*|stopped eating|won't eat|rash|allerg\w*|wheez\w*|chest pain|eating disorder|anorexi\w*|bulimi\w*)\b/ },
  { category: "medical", pattern: /بخار|دورہ|الٹی|قے|سر پر چوٹ|الرجی|کھانا (?:نہیں کھا|چھوڑ)/ },
  { category: "medical", pattern: /\b(?:bukhaa?r|ulti|ultee|qay|chot|allergy)\b|\bkhana nahi?n? kha/ },

  { category: "professional", pattern: /\b(?:dose|doses|dosage|mg|ml|milligrams?|prescri\w*|medicat\w*|medicine|meds|pills?|tablets?|paracetamol|acetaminophen|ibuprofen|tylenol|calpol|panadol|melatonin|benadryl|antihistamines?|antidepressants?|ritalin|adderall|sleeping pills?|syrup)\b/ },
  { category: "professional", pattern: /\b(?:diagnos\w*|adhd|autis\w*|asperger\w*|ocd|bipolar|depress\w*|anxiety disorder|dyslexi\w*|on the spectrum|disorder)\b/ },
  { category: "professional", pattern: /\b(?:custody|divorce|lawyer|legal\w*|court|sue|visitation|child support|alimony|police report)\b/ },
  { category: "professional", pattern: /دوا|دوائی|خوراک|ملی ?گرام|گولی|سیرپ|شربت|تشخیص|آٹزم|اے ڈی ایچ ڈی|ڈپریشن|بائی ?پولر|طلاق|حضانت|کسٹڈی|عدالت|وکیل|قانون|مقدمہ/ },
  { category: "professional", pattern: /\b(?:dawaa?i?|khuraa?k|goli|syrup|tashkhees|autism|adhd|depression|talaa?q|custody|adalat|wakee?l|wakil|qanoo?ni?|muqadma)\b/ },
];

function matchCategories(text: string, rules: Rule[]): RiskCategory[] {
  const found = new Set<RiskCategory>();
  for (const rule of rules) {
    if (rule.pattern.test(text)) found.add(rule.category);
  }
  return [...found];
}

/**
 * Screens the latest user message (and, for sensitive topics, the previous
 * user message too, so short follow-ups like "she is 4, how much?" keep the
 * earlier context).
 */
export function assessRisk(latestUserMessage: string, previousUserMessage = ""): RiskAssessment {
  const latest = normalizeForMatching(latestUserMessage);

  const emergency = matchCategories(latest, EMERGENCY_RULES);
  if (emergency.length > 0) return { level: "emergency", categories: emergency };

  const recent = `${normalizeForMatching(previousUserMessage)}\n${latest}`;
  const elevated = matchCategories(recent, ELEVATED_RULES);
  if (elevated.length > 0) return { level: "elevated", categories: elevated };

  return { level: "none", categories: [] };
}

// --- Fixed safety responses --------------------------------------------------

type EmergencyKind = "danger" | "self_harm" | "medical";

const SAFETY_RESPONSES: Record<Language, Record<EmergencyKind, string>> = {
  en: {
    danger: [
      "Thank you for telling me. What you're describing sounds serious, and safety has to come first right now.",
      "If you, a child or anyone else is in immediate danger, please contact your local emergency number now, or get to a safe place and ask someone nearby for help. If a child is being harmed or is at risk, your local child-protection services or the police can help once everyone is safe.",
      "I'm an AI parenting coach, so I can't call for help or handle an emergency. Please reach out to people who can act right now. I'm here to support you afterwards.",
    ].join("\n\n"),
    self_harm: [
      "Thank you for telling me. That took courage, and you don't have to deal with this alone.",
      "If you or someone else might act on thoughts of suicide or self-harm, please contact your local emergency number or a local crisis line right now. Try not to stay alone: reach out to someone you trust, and keep anything that could be used for self-harm out of reach. If it's your child, stay with them.",
      "I'm an AI parenting coach and can't provide crisis support, but trained people can help you right now. When you're safe, I'm here to talk through next steps.",
    ].join("\n\n"),
    medical: [
      "This sounds like it could be a medical emergency.",
      "Please contact your local emergency number or go to the nearest emergency department right now. Don't wait to see whether it passes. While you get help, follow the instructions of the emergency operator or medical staff.",
      "I'm an AI parenting coach and can't give medical guidance, but I'm here to support you once your child is being cared for.",
    ].join("\n\n"),
  },
  ur: {
    danger: [
      "مجھے بتانے کا شکریہ۔ آپ جو بیان کر رہے ہیں وہ سنگین لگتا ہے، اور اس وقت سب سے پہلے حفاظت ضروری ہے۔",
      "اگر آپ، کوئی بچہ یا کوئی اور فوری خطرے میں ہے تو ابھی اپنے مقامی ایمرجنسی نمبر پر رابطہ کریں، یا کسی محفوظ جگہ پہنچ کر آس پاس کسی سے مدد مانگیں۔ اگر کسی بچے کو نقصان پہنچایا جا رہا ہے یا خطرہ ہے تو سب کے محفوظ ہونے کے بعد مقامی چائلڈ پروٹیکشن ادارہ یا پولیس مدد کر سکتے ہیں۔",
      "میں ایک اے آئی پیرنٹنگ کوچ ہوں، اس لیے میں مدد کے لیے کال نہیں کر سکتا اور ہنگامی صورتحال نہیں سنبھال سکتا۔ براہِ کرم ابھی ان لوگوں سے رابطہ کریں جو فوری مدد کر سکتے ہیں۔ اس کے بعد میں آپ کی مدد کے لیے حاضر ہوں۔",
    ].join("\n\n"),
    self_harm: [
      "مجھے بتانے کا شکریہ۔ یہ کہنا آسان نہیں تھا، اور آپ کو یہ سب اکیلے نہیں سنبھالنا۔",
      "اگر آپ یا کوئی اور خودکشی یا خود کو نقصان پہنچانے کے خیالات پر عمل کر سکتا ہے تو ابھی اپنے مقامی ایمرجنسی نمبر یا کسی مقامی کرائسس ہیلپ لائن سے رابطہ کریں۔ اکیلے نہ رہیں، کسی قابلِ اعتماد شخص کو اپنے پاس بلائیں، اور ایسی چیزیں دور رکھیں جن سے نقصان پہنچ سکتا ہے۔ اگر یہ آپ کا بچہ ہے تو اس کے ساتھ رہیں۔",
      "میں ایک اے آئی پیرنٹنگ کوچ ہوں اور بحران میں مدد فراہم نہیں کر سکتا، لیکن تربیت یافتہ لوگ ابھی آپ کی مدد کر سکتے ہیں۔ جب آپ محفوظ ہوں تو میں اگلے قدموں پر بات کرنے کے لیے حاضر ہوں۔",
    ].join("\n\n"),
    medical: [
      "یہ طبی ایمرجنسی ہو سکتی ہے۔",
      "براہِ کرم ابھی اپنے مقامی ایمرجنسی نمبر پر رابطہ کریں یا فوراً قریبی ہسپتال کے ایمرجنسی شعبے میں جائیں۔ یہ انتظار نہ کریں کہ حالت خود بہتر ہو جائے گی۔ مدد ملنے تک ایمرجنسی آپریٹر یا طبی عملے کی ہدایات پر عمل کریں۔",
      "میں ایک اے آئی پیرنٹنگ کوچ ہوں اور طبی رہنمائی نہیں دے سکتا، لیکن جب آپ کے بچے کی دیکھ بھال شروع ہو جائے تو میں آپ کی مدد کے لیے حاضر ہوں۔",
    ].join("\n\n"),
  },
};

/** The fixed reply for an emergency assessment, in the selected language. */
export function getSafetyResponse(risk: RiskAssessment, language: Language): string {
  // When several emergency signals appear, the general danger message fits best.
  const kind: EmergencyKind =
    risk.categories.includes("danger") || risk.categories.length > 1
      ? "danger"
      : risk.categories.includes("self_harm")
        ? "self_harm"
        : risk.categories.includes("medical")
          ? "medical"
          : "danger";
  return SAFETY_RESPONSES[language][kind];
}

const CATEGORY_DESCRIPTIONS: Record<RiskCategory, string> = {
  danger: "a risk that someone could harm a child or another person",
  self_harm: "self-harm or suicidal thoughts",
  medical: "possible medical warning signs",
  abuse: "possible abuse, neglect, exploitation or violence",
  professional: "a question that may need medical, medication, diagnostic or legal expertise",
};

export function describeCategories(categories: RiskCategory[]): string {
  return categories.map((c) => CATEGORY_DESCRIPTIONS[c]).join("; ");
}
