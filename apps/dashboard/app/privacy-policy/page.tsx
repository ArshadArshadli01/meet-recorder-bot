import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Geri qayıt
            </Button>
          </Link>
          <div className="text-sm text-muted-foreground">
            Son yenilənmə: {lastUpdated}
          </div>
        </div>

        <Card className="border-none shadow-elevated">
          <CardHeader className="border-b border-border/50 px-8 py-10 text-center">
            <CardTitle className="text-3xl font-bold tracking-tight">Məxfilik Siyasəti</CardTitle>
            <p className="text-muted-foreground mt-2">
              Görüş məlumatlarınızla necə rəftar etdiyimiz və məxfiliyinizi necə qoruduğumuz haqqında.
            </p>
          </CardHeader>
          <CardContent className="p-8 prose prose-slate dark:prose-invert max-w-none">
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">1. Giriş</h2>
              <p>
                Meet Recorder Bot-a ("biz", "bizim" və ya "bizi") xoş gəlmisiniz. Biz sizin şəxsi məlumatlarınızı və məxfilik hüququnuzu qorumağa sadiqik. Bu Məxfilik Siyasəti görüş yazma və transkripsiya xidmətlərimizdən istifadə etdiyiniz zaman məlumatlarınızı necə topladığımızı, istifadə etdiyimizi və qoruduğumuzu izah edir.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">2. Topladığımız Məlumatlar</h2>
              <p>Xidmətimizdən istifadə etdiyiniz zaman aşağıdakı növ məlumatları toplaya bilərik:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2 text-muted-foreground">
                <li><strong>Audio və Video Məzmun:</strong> Botumuzu dəvət etdiyiniz görüşlərin audio və video axınlarını yazırıq.</li>
                <li><strong>Görüş Metaməlumatları:</strong> Başlıq, müddət, iştirakçı adları və vaxt möhürləri daxil olmaqla görüş haqqında məlumatlar.</li>
                <li><strong>Hesab Məlumatları:</strong> Hesab yaratsanız, e-poçt ünvanınızı və əsas profil məlumatlarınızı toplayırıq.</li>
                <li><strong>Transkripsiya Məlumatları:</strong> Qeydlər və xülasələr yaratmaq məqsədilə audio yazılardan yaradılan mətn.</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">3. Məlumatlarınızı Necə İstifadə Edirik</h2>
              <p>Toplanmış məlumatları aşağıdakı məqsədlər üçün istifadə edirik:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2 text-muted-foreground">
                <li>Xidmətimizi təmin etmək, idarə etmək və qorumaq üçün.</li>
                <li>Transkriptlər və görüş xülasələri yaratmaq üçün audio və video yazılarını emal etmək üçün.</li>
                <li>Süni intellekt modellərimizi və xidmət performansımızı təkmilləşdirmək üçün (anonimləşdirilmiş məlumatlardan istifadə etməklə).</li>
                <li>Hesabınız və xidmət yeniləmələri ilə bağlı sizinlə əlaqə saxlamaq üçün.</li>
              </ul>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">4. Məlumatların Saxlanması və Təhlükəsizliyi</h2>
              <p>
                Məlumatlarınız sənaye standartlı şifrələmə üsullarından istifadə edilərək təhlükəsiz şəkildə saxlanılır. Şəxsi məlumatlarınızın təhlükəsizliyini təmin etmək üçün müxtəlif təhlükəsizlik tədbirləri həyata keçiririk. Görüş yazıları təhlükəsiz bulud mühitlərində saxlanılır və yalnız səlahiyyətli istifadəçilər tərəfindən əldə edilə bilər.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">5. Məlumatların Paylaşılması</h2>
              <p>
                Biz sizin şəxsi məlumatlarınızı kənar tərəflərə satmırıq, ticarətini etmirik və ya başqa şəkildə ötürmürük. Bura veb saytımızı idarə etməkdə, işimizi aparmaqda və ya sizə xidmət göstərməkdə bizə kömək edən etibarlı üçüncü tərəflər daxil deyil, bir şərtlə ki, həmin tərəflər bu məlumatların məxfi saxlanmasına razı olsunlar.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">6. Hüquqlarınız</h2>
              <p>
                Yerləşdiyiniz yerdən asılı olaraq, şəxsi məlumatlarınıza daxil olmaq, onları düzəltmək və ya silmək hüququnuz ola bilər. İstənilən vaxt idarəetmə paneli (dashboard) parametrləri vasitəsilə hesabınızın və əlaqəli görüş məlumatlarınızın silinməsini tələb edə bilərsiniz.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-4">7. Google API Xidmətləri İstifadəçi Məlumatı Siyasəti</h2>
              <p>
                Meet Recorder Bot-un Google API-lərdən alınan məlumatlardan istifadəsi və digər hər hansı proqrama ötürülməsi, Məhdud İstifadə (Limited Use) tələbləri daxil olmaqla,{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  Google API Xidmətləri İstifadəçi Məlumatı Siyasətinə
                </a>{" "}
                uyğun olacaq.
              </p>
              <p className="mt-3">Xüsusilə:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2 text-muted-foreground">
                <li>Biz yalnız yazma və fayl yükləmə funksiyalarımızı təmin etmək üçün lazım olan Google API sahələrinə (Google Disk fayl yaradılması, autentifikasiya üçün istifadəçi profili) daxil olmağı tələb edirik.</li>
                <li>Biz Google istifadəçi məlumatlarını reklam nümayiş etdirmək üçün istifadə etmirik.</li>
                <li>Biz insanlara sizin Google istifadəçi məlumatlarınızı oxumağa icazə vermirik, yalnız bu hallar istisnadır: (a) sizin açıq razılığınız olduqda, (b) təhlükəsizlik məqsədləri üçün zəruri olduqda, (c) qüvvədə olan qanunvericiliyə əməl etmək üçün zəruri olduqda və ya (d) istifadəmiz daxili əməliyyatlarla məhdudlaşdıqda və məlumatlar aqreqasiya edilmiş və anonimləşdirilmiş olduqda.</li>
                <li>Biz Google istifadəçi məlumatlarını xidmət göstərmək üçün zəruri olan hallar, sizin razılığınız və ya hüquqi/təhlükəsizlik səbəbləri istisna olmaqla, üçüncü tərəflərə ötürmürük.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">8. Bizimlə Əlaqə</h2>
              <p>
                Bu Məxfilik Siyasəti ilə bağlı hər hansı bir sualınız varsa, lütfən dəstək komandamızla əlaqə saxlayın.
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
