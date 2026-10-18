# xbloom-app — لوحة تحكم محلية

تطبيق محلي لإدارة وصفات XBloom، بثلاث طرق للبناء:

1. **مساعد ذكي** — تصف القهوة/الشاي، وموديل محلي عبر **Ollama** يصمم الوصفة.
2. **إدخال يدوي** — تبني الوصفة بنفسك، خطوة بخطوة، مع تحقق فوري من مجموع الماء.
3. **استيراد** — تلصق لينك مشاركة من تطبيق XBloom وتجلب الوصفة (لا يحتاج تسجيل دخول).

## التشغيل

```bash
cd xbloom-app
npm install
npm start
```

ثم افتح: http://localhost:8787

للتطوير مع إعادة التشغيل التلقائي:

```bash
npm run dev
```

## المتطلبات

- **Node.js 18+** (الكود يستخدم `fetch` المدمج)
- **Ollama** — للتشغيل المحلي: https://ollama.com/download
  - الافتراضي: `http://127.0.0.1:11434`
  - اسحب موديل واحد على الأقل: `ollama pull gemma3:4b`

بدون Ollama، الوضع اليدوي والاستيراد يعملان بشكل كامل — فقط تبويب «مساعد ذكي» يتعطّل مع رسالة واضحة.

## الإعدادات

انسخ `.env.example` إلى `.env` وعدّل ما تحتاج:

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `8787` | منفذ السيرفر المحلي |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | عنوان سيرفر Ollama |
| `OLLAMA_MODEL` | `gemma3:4b` | الموديل الافتراضي |
| `XBLOOM_STORE_DIR` | `./.data` | مكان تخزين الجلسة |

> ملاحظة: تطبيق الواجهة يقرأ المتغيرات عبر `process.env`، لذا شغّل مع `node --env-file=.env server/index.js` أو صدّرها في البيئة إذا احتجت `.env`. القيم الافتراضية تعمل بدون أي إعداد.

## البنية

```
xbloom-app/
├── server/
│   ├── index.js     # Express API + خدمة الملفات الثابتة
│   ├── xbloom.js    # منطق XBloom API (RSA + CRUD)
│   ├── ollama.js    # جسر Ollama
│   ├── prompt.js    # system prompt + مخطط الـ JSON
│   └── store.js     # تخزين الجلسة محلياً
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── .env.example
└── package.json
```

## واجهة الـ API

| المسار | الوصف |
|---|---|
| `GET /api/session` | حالة تسجيل الدخول |
| `POST /api/login` | دخول XBloom (الباسورد لا يُخزَّن) |
| `POST /api/logout` | مسح الجلسة المحلية |
| `GET /api/recipes` | قائمة الوصفات |
| `POST /api/recipes` | إنشاء وصفة |
| `PUT /api/recipes/:id` | تعديل وصفة (تطبيق جزئي للحقول) |
| `DELETE /api/recipes/:id` | حذف وصفة |
| `POST /api/import` | جلب وصفة من لينك مشاركة |
| `GET /api/ollama/models` | الموديلات المتاحة في Ollama |
| `POST /api/assist` | توليد وصفة من نص عبر Ollama |

## ملاحظات الأمان

- كلمة مرور XBloom تُستخدم مرة واحدة لتسجيل الدخول ثم تُهمل — **لا تُحفظ أبداً**.
- يُحفظ فقط `memberId` و`token` في `xbloom-app/.data/session.json` بصلاحيات مقيدة (`0600`).
- السيرفر يستمع على المنفذ المحلي فقط — لا تفتحه للإنترنت بدون إضافة مصادقة.
- هذا التطبيق مستقل عن دالة Supabase في `xbloom-mcp-remote/`؛ كلاهما يستخدم نفس XBloom API.
