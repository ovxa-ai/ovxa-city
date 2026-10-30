export type Lang = 'en' | 'he';
const en = {
  brandSub: 'Your bots, as a living city',
  day: 'Day', night: 'Night', share: 'Share my city', signIn: 'Owner sign in', signOut: 'Sign out',
  heroTitle: 'Your AI bots, as a living city.',
  heroBody: 'Every bot gets a building. Anything risky waits at Town Hall until you approve it.',
  heroCta: 'Build your city', heroStar: 'Star on GitHub',
  demo: 'Demo · sample data', live: 'Live', updated: 'Updated',
  townHall: 'Town Hall', queueTitle: 'Approvals', queueSub: 'External actions wait here until you decide.',
  approve: 'Approve', decline: 'Decline', approved: 'Approved', declined: 'Declined',
  empty: 'All clear. Nobody is waiting on you.', pending: 'pending',
  approvedLog: 'Approved', declinedLog: 'Declined',
  construction: 'Under construction', constructionRole: 'Breaking ground for',
  vacant: 'Open plot', vacantRole: 'Room for one more bot',
  townHallRole: 'Approval queue · keeps the rules',
  status_ok: 'Running', status_busy: 'Working', status_error: 'Needs attention', status_idle: 'No report yet',
  role_chief: 'Headquarters', role_router: 'Main router', role_worker: 'Specialist',
  password: 'Password', signInBtn: 'Sign in', cancel: 'Cancel', wrongPw: 'Wrong password',
  sentToBot: 'Sent to', failed: 'Could not reach the bot. Nothing changed.',
  shareTitle: 'My OVXA City', bots: 'bots', builtWith: 'Built with OVXA',
  swipe: 'Swipe to explore', ago: 'ago', minutes: 'min', justNow: 'just now',
  demoNote: 'Sample data only. Buttons here do not reach any real bot.',
  language: 'עברית',
};
type Dict = typeof en;
const he: Dict = {
  brandSub: 'הבוטים שלך, כעיר חיה',
  day: 'יום', night: 'לילה', share: 'שתף את העיר', signIn: 'כניסת בעלים', signOut: 'יציאה',
  heroTitle: 'הבוטים שלך, כעיר חיה.',
  heroBody: 'לכל בוט יש בניין. כל פעולה רגישה מחכה בעירייה עד שתאשר.',
  heroCta: 'בנה את העיר שלך', heroStar: 'כוכב ב-GitHub',
  demo: 'הדגמה · נתוני דוגמה', live: 'חי', updated: 'עודכן',
  townHall: 'עירייה', queueTitle: 'אישורים', queueSub: 'פעולות חיצוניות מחכות כאן עד שתחליט.',
  approve: 'אשר', decline: 'דחה', approved: 'אושר', declined: 'נדחה',
  empty: 'הכול נקי. אף אחד לא מחכה לך.', pending: 'ממתינים',
  approvedLog: 'אושר', declinedLog: 'נדחה',
  construction: 'בבנייה', constructionRole: 'מתחילים לבנות עבור',
  vacant: 'מגרש פנוי', vacantRole: 'יש מקום לבוט נוסף',
  townHallRole: 'תור אישורים · שומרת על הכללים',
  status_ok: 'פעיל', status_busy: 'עובד', status_error: 'דורש תשומת לב', status_idle: 'עוד לא דיווח',
  role_chief: 'מטה ראשי', role_router: 'נתב ראשי', role_worker: 'מומחה',
  password: 'סיסמה', signInBtn: 'כניסה', cancel: 'ביטול', wrongPw: 'סיסמה שגויה',
  sentToBot: 'נשלח אל', failed: 'לא הצלחנו להגיע לבוט. שום דבר לא השתנה.',
  shareTitle: 'העיר שלי ב-OVXA', bots: 'בוטים', builtWith: 'Built with OVXA',
  swipe: 'החליקו כדי לטייל', ago: 'לפני', minutes: 'דק׳', justNow: 'עכשיו',
  demoNote: 'נתוני דוגמה בלבד. הכפתורים כאן לא מגיעים לשום בוט אמיתי.',
  language: 'English',
};
const dicts = { en, he };
export let lang: Lang = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'he' || q === 'en') return q;
  const s = localStorage.getItem('ovxa.lang');
  return s === 'he' ? 'he' : 'en';
})();
export const t = (k: keyof Dict) => dicts[lang][k];
export function setLang(l: Lang) {
  lang = l; localStorage.setItem('ovxa.lang', l);
  document.documentElement.lang = l; document.documentElement.dir = l === 'he' ? 'rtl' : 'ltr';
}
export function ago(iso?: string) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return t('justNow');
  return lang === 'he' ? `${t('ago')} ${m} ${t('minutes')}` : `${m} ${t('minutes')} ${t('ago')}`;
}
