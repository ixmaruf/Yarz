# 🚀 YARZ ওয়েবসাইট GitHub এ আপলোড করার সঠিক নিয়ম

আপনার লোকাল হোস্টে কাজ করছে কিন্তু GitHub এ কাজ করছে না — এর কারণ হচ্ছে **folder structure ভুল আপলোড করা হয়েছে**। এই গাইড টা step-by-step follow করুন।

---

## ❗ আসল সমস্যা কী ছিল?

GitHub Pages **Linux server** এ চলে। Linux এ filename **case-sensitive** (অর্থাৎ `Style.css` আর `style.css` দুইটা আলাদা ফাইল হিসেবে গণ্য হয়)। কিন্তু আপনার Windows কম্পিউটার case ignore করে — তাই localhost এ কাজ করছিল কিন্তু GitHub এ ভেঙে যাচ্ছিল।

আমি যা যা ফিক্স করেছি:
- ✅ সব HTML ফাইলে paths এ `./` prefix যোগ করেছি (যেমন `./css/style.css`) — এতে যেকোনো hosting এ কাজ করবে
- ✅ `.nojekyll` ফাইল যোগ করেছি — GitHub Pages এর Jekyll প্রসেসিং বন্ধ করতে
- ✅ `404.html` যোগ করেছি — deep link redirect support এর জন্য

---

## ✅ সঠিক Folder Structure (এটাই হতে হবে GitHub Repository এ)

আপনার GitHub repository এর **root level** এ ঠিক এইভাবে ফাইল থাকতে হবে:

```
your-repo-name/
│
├── index.html              ← root এ থাকতে হবে
├── about.html
├── contact.html
├── privacy.html
├── terms.html
├── shipping.html
├── return-policy.html
├── 404.html
├── README.md
├── .nojekyll               ← খুব important! (hidden file)
│
├── css/                    ← folder নাম ছোট হাতের css হতে হবে
│   └── style.css           ← filename ছোট হাতের
│
└── js/                     ← folder নাম ছোট হাতের js হতে হবে
    ├── api.js
    └── app.js
```

### ⚠️ যা ভুলেও করবেন না:
- ❌ `CSS/Style.css` (বড় হাতের অক্ষর) — কাজ করবে না
- ❌ সব ফাইল একটা subfolder এর ভিতরে রাখা (যেমন `yarz-website/index.html`)
- ❌ `css` folder এর বদলে `styles` বা অন্য নাম দেওয়া
- ❌ `js` folder এর বদলে `scripts` বা `JS` নাম দেওয়া

---

## 📤 GitHub এ সঠিকভাবে আপলোড করার পদ্ধতি

### পদ্ধতি ১: GitHub Web Interface দিয়ে (সহজ পদ্ধতি)

1. GitHub এ আপনার repository খুলুন
2. **Add file → Upload files** এ ক্লিক করুন
3. **আপনার পুরো folder টা drag-and-drop করুন** (subfolder সহ)
4. ⚠️ **খুব important**: আপলোড করার পর verify করুন:
   - Repository এর root এ `index.html` দেখা যাচ্ছে কিনা
   - `css/` folder এর ভিতরে `style.css` আছে কিনা
   - `js/` folder এর ভিতরে `api.js` ও `app.js` আছে কিনা
5. **Commit changes** এ ক্লিক করুন

### পদ্ধতি ২: Git Command দিয়ে (recommended)

```bash
# আপনার project folder এ যান
cd path/to/your/yarz-website

# Git initialize করুন (যদি না করে থাকেন)
git init

# Remote add করুন
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git

# সব ফাইল add করুন
git add .

# Commit করুন
git commit -m "Initial commit - YARZ website"

# Push করুন
git branch -M main
git push -u origin main
```

---

## 🌐 GitHub Pages Enable করার নিয়ম

1. আপনার repository → **Settings** → **Pages**
2. **Source** এ select করুন: **Deploy from a branch**
3. **Branch**: `main` (অথবা `master`) এবং folder `/ (root)` select করুন
4. **Save** এ ক্লিক করুন
5. ২-৩ মিনিট অপেক্ষা করুন
6. URL পাবেন: `https://YOUR-USERNAME.github.io/YOUR-REPO/`

---

## 🔍 Deploy এর পর Verify করুন (Browser DevTools)

ওয়েবসাইট open করার পর:

1. **F12** চাপুন (DevTools খুলবে)
2. **Console** ট্যাব এ যান — কোনো error দেখা যাচ্ছে কিনা দেখুন
3. **Network** ট্যাব এ যান → page reload করুন
4. দেখুন:
   - `style.css` → Status **200** হতে হবে (404 হলে path ভুল)
   - `api.js` → Status **200** হতে হবে
   - `app.js` → Status **200** হতে হবে

### যদি 404 দেখায়:
- File path / case mismatch আছে
- GitHub এ folder structure চেক করুন
- `.nojekyll` ফাইল আছে কিনা চেক করুন (hidden file — show করতে হবে)

---

## 🆘 সাধারণ সমস্যা ও সমাধান

| সমস্যা | সমাধান |
|--------|---------|
| CSS load হচ্ছে না | `css/` folder ছোট হাতের কিনা চেক করুন; file name `style.css` কিনা |
| JavaScript কাজ করছে না | Console এ error দেখুন; `js/api.js` ও `js/app.js` 200 status কিনা |
| Button ক্লিক কাজ করছে না | `app.js` load হচ্ছে কিনা Network tab এ দেখুন |
| Home button কাজ করে না | JavaScript load fail হলে এটা হয় — paths verify করুন |
| Track Order, Categories কাজ করে না | একই কারণ — JS file load হচ্ছে না |
| Apps Script API কাজ করে না | এটা CORS related — আপনার Apps Script এ deploy as Web App, Anyone access করেছেন কিনা চেক করুন |
| Hash route (`#product/abc`) ভেঙে যায় | `404.html` ঠিকভাবে upload হয়েছে কিনা দেখুন |

---

## 📝 শেষ কথা

আপনি এখন এই পুরো ফোল্ডারটা download/copy করে আপনার GitHub repository এ replace করে দিন। তারপর GitHub Pages আবার rebuild হবে এবং সব কিছু কাজ করবে।

**মনে রাখবেন**: `.nojekyll` ফাইলটা hidden — কিছু file manager এ দেখা যায় না। GitHub web upload এ এটা automatically যাবে যদি আপনি drag করেন। যদি না যায়, manually create করুন (empty file নাম দিয়ে `.nojekyll`)।
