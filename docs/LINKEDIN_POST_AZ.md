# LinkedIn postu — meet-bot (Azərbaycan)

Repo URL təxmini olaraq demo domeninə uyğun yazılıb (`arshadli`). Öz public GitHub repo adresiniz fərqlidirsə, aşağıdakı mətn içindəki linki dəyişin.

## LinkedIn məqaləsi — üz şəkli (cover)

**Fayl:** [docs/linkedin-article-cover-az.png](linkedin-article-cover-az.png) — Azərbaycan dilində mətnli geniş format üz. Məqalə redaktorunda üz / başlıq şəkli kimi yükləyin.

LinkedIn üz şəklini bəzən qırpa bilər (tövsiyə olunan en təxminən 1280×720 və ya 1200×627 kimi göstərilir). Əsas başlıq mərkəzdədir; qırpma zamanı kənar mətn itərsə, şəkli Canva/Figmada eyni məzmunla təkrar düzəltmək olar.

---

## LinkedIn məqaləsi (Article) — başlıq və mətn

LinkedIn-də **Write article** ilə yaradanda başlıq sahəsinə **başlığı**, əsas redaktora isə məqalə mətnini yazın. Şəkil əlavə etmək üçün redaktor alətində media düyməsindən istifadə edin (repo-da `docs/screen-1.png` … `screen-5.png`, üz üçün `linkedin-article-cover-az.png`).

### Başlıq (Article headline)

**Meet Bot: Google Meet recordlarını öz Drive və ya S3 buludunuzda saxlayın**

*Alternativ, qısa variant: **Meet Bot — açıq mənbə Google Meet recorder***

### Məqalənin mətni

Hər kəsə salam 👋

Google Meet ilə tez-tez görüşlər keçirən hər kəs bu problemi tanıyar: görüşü record etmək lazımdır, amma ya həll yoxdur, ya da mövcud variantlar hər vəziyyətdə rahat işləmir. Məndə də eynilə idi — recordu stabil şəkildə almaq və faylı **öz buludumda** saxlamaq istəyirdim.

Uzun müddət bu ehtiyacla üzləşdikdən sonra qərar verdim ki, özüm bir həll yazım. Nəticədə **meet-bot** ortaya çıxdı — vibecoding tərzi ilə sıfırdan yazdım və **açıq mənbə** (open source) olaraq paylaşdım. İstəyən hər kəs öz serverində və ya sadəcə **Docker** ilə qaldırıb istifadə edə bilər.

---

**Bəs meet-bot necə işləyir?**

Qısaca desəm: bot Google Meet görüşünə qoşulur və sessiyanı yazır. Bunun arxasında üç əsas hissə var:

🖥 **Dashboard** — idarəetmə paneli (Next.js)

⚙️ **API** — arxa plan servisi (Fastify)

🎬 **Worker** — növbəli tapşırıq icraçısı (BullMQ + Playwright + ffmpeg)

Hər üçünü birlikdə **Docker Compose** ilə bir əmrlə qaldırmaq mümkündür.

---

**Nə edə bilir?**

✅ Recordları **şəxsi Google Drive** qovluğunuza göndərir — **OAuth** ilə hesabınızı təsdiqləyirsiniz, vəssalam.

✅ **S3-uyğun obyekt saxlama** ilə işləyir — məsələn **DigitalOcean Spaces** və ya hər hansı S3 API dəstəkləyən xidmət. Öz bucketinizdə saxlayırsınız.

✅ Üç müstəqil komponent — deploy, scale və inkişaf etdirmək rahatdır.

---

**İlham haradan gəldi?**

İlkin ideyanı formalaşdırarkən **[meetingbot/meetingbot](https://github.com/meetingbot/meetingbot)** layihəsinə baxmışdım — oradakı yanaşma mənə faydalı istinad oldu. Öz ehtiyaclarıma uyğun sıfırdan yenidən yazdım.

---

**Sınayın, fikirlərinizi bölüşün 🙌**

🔗 **Demo:** https://meet-bot-demo.arshadli.me

💻 **Mənbə kod:** https://github.com/arshadli/meet-bot

Əgər sınayırsınızsa — rast gəldiyiniz xəta, təklif və ya sadəcə təcrübənizi şərhlərdə yazın, çox sevincəm. Açıq mənbədir, töhfə vermək istəyənlərə qapı həmişə açıqdır 🤝

---

**Məqalədən sonra feed-də** qısa post ilə paylaşmaq istəsəniz, aşağıdakı «Birbaşa LinkedIn-ə yapışdırılan mətn» blokundan istifadə edə bilərsiniz.

---

## Birbaşa LinkedIn-ə yapışdırılan mətn

Google Meet-i record etmək lazımdı — öz həllimi yazdım 🎬

Hər kəsə salam 👋

Google Meet ilə görüşlər keçirəndə hər dəfə eyni problemlə üzləşirdim: görüşü record edib faylı öz buludumda saxlamaq istəyirdim, amma rahat bir həll tapa bilmirdim.

Axırda dedim özüm yazım — nəticədə **meet-bot** ortaya çıxdı. Vibecoding ilə yazdım, **open source** etdim; istəyən hər kəs istifadə edə bilər 🚀

Bu layihəni yazarkən **[meetingbot/meetingbot](https://github.com/meetingbot/meetingbot)** layihəsindən ilham almışam — çox faydalı istinad oldu.

**Nə edə bilir?**

✅ Recordları **şəxsi Google Drive** qovluğunuza yükləyir (OAuth ilə)

✅ **S3-uyğun saxlama** — DigitalOcean Spaces və ya digər S3 bucket ilə işləyir

✅ Üç ayrıca komponent: **API** (Fastify) + **Worker** (BullMQ, Playwright, ffmpeg) + **Dashboard** (Next.js)

✅ Docker ilə qaldırmaq çox asandır

🔗 **Demo:** https://meet-bot-demo.arshadli.me

💻 **Mənbə kod:** https://github.com/arshadli/meet-bot

Test edib fikrinizi yazsanız, çox şad olaram. Problem, təklif, sual — hər şeyə açığam 🙌

#OpenSource #GoogleMeet #WebDev #NodeJS #Azerbaijan #Developer

---

## LinkedIn-də dərc etmədən əvvəl

1. **GitHub linki:** `https://github.com/arshadli/meet-bot` düzgün deyilsə, yuxarıdakı blokda yalnız həmin sətiri öz repo URL-inizlə əvəz edin.
2. **Screenshot-lar (tövsiyə olunur):** LinkedIn-də mətn + 1–4 şəkil və ya qısa video çatı çox artırır.
   - **Haradan:** [Demo](https://meet-bot-demo.arshadli.me) və ya öz deploy etdiyiniz dashboard-u tam ekran açıb `Win+Shift+S` (Windows) / `Cmd+Shift+4` (macOS) ilə kəsin.
   - **Nə çəkmək olar:** login/dashboard, bot yaratma formu, görüşə qoşulma və ya record statusu — mövzunu bir gözlə anlaşılan saxlayın.
   - **LinkedIn-də necə:** Post yazıldıqdan sonra **Add media** → şəkilləri seçin; ilk şəkil əsas vizual sayılır — ən güclü ekranı birinci qoyun. PNG/JPEG, təxminən 1200px en yaxşı görünür.
   - Repo üçün eyni şəkilləri [`docs/`](./) qovluğuna da qoya bilərsiniz — README-də göstərmə üsulu README-də qeyd olunub.
3. **@mention:** LinkedIn-də konkret şirkət və ya məhsul səhifəsini etiketləmək istəyirsinizsə, postu yazdıqdan sonra `@` ilə axtarıb seçin.

---

## Əlavə linklər (istinad)

- İlham layihəsi: [github.com/meetingbot/meetingbot](https://github.com/meetingbot/meetingbot)
